"""
document_service.py
-------------------
Document extraction service for BrailleBridge AI.

Supports:
  - Plain text files (.txt, .md, .csv, etc.)
  - Text-based PDFs via pypdf
  - Scanned-PDF OCR via pytesseract + pdf2image (optional)

The service never invents content. Empty or unreadable pages are
reported honestly.
"""

from __future__ import annotations

import io
import os
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Optional-dependency availability flags
# ---------------------------------------------------------------------------
PYPDF_AVAILABLE = False
try:
    from pypdf import PdfReader  # type: ignore
    PYPDF_AVAILABLE = True
except ImportError:
    pass

PYTESSERACT_AVAILABLE = False
try:
    import pytesseract  # type: ignore
    from PIL import Image  # type: ignore
    PYTESSERACT_AVAILABLE = True
except ImportError:
    pass

TESSERACT_AVAILABLE = False
if PYTESSERACT_AVAILABLE:
    configured_tesseract = os.environ.get("TESSERACT_CMD")
    if configured_tesseract:
        pytesseract.pytesseract.tesseract_cmd = configured_tesseract
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_AVAILABLE = True
    except (OSError, RuntimeError):
        pass

PDF2IMAGE_MODULE_AVAILABLE = False
try:
    import pdf2image  # type: ignore
    PDF2IMAGE_MODULE_AVAILABLE = True
except ImportError:
    pass


def _poppler_available() -> bool:
    """Check for the Poppler commands used by pdf2image on the current OS."""
    configured_path = os.environ.get("POPPLER_PATH")
    if configured_path:
        poppler_dir = Path(configured_path)
        suffix = ".exe" if os.name == "nt" else ""
        return (
            (poppler_dir / f"pdfinfo{suffix}").is_file()
            and any((poppler_dir / f"{command}{suffix}").is_file() for command in ("pdftoppm", "pdftocairo"))
        )
    return (
        shutil.which("pdfinfo") is not None
        and (shutil.which("pdftoppm") is not None or shutil.which("pdftocairo") is not None)
    )


PDF2IMAGE_AVAILABLE = PDF2IMAGE_MODULE_AVAILABLE and _poppler_available()


def get_ocr_availability_message() -> str:
    """Describe missing OCR packages or system executables precisely."""
    missing: list[str] = []
    if not PYTESSERACT_AVAILABLE:
        missing.append("the pytesseract and Pillow Python packages")
    elif not TESSERACT_AVAILABLE:
        missing.append("the Tesseract executable (or a valid TESSERACT_CMD path)")
    if not PDF2IMAGE_MODULE_AVAILABLE:
        missing.append("the pdf2image Python package")
    elif not PDF2IMAGE_AVAILABLE:
        missing.append("Poppler utilities pdfinfo and pdftoppm/pdftocairo (or POPPLER_PATH)")
    if not missing:
        return "OCR dependencies are available."
    return "OCR is unavailable: install/configure " + " and ".join(missing) + "."


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class ExtractionResult:
    """Result of a document text extraction."""
    success: bool
    text: str = ""
    page_count: int = 0
    method: str = ""          # "text", "pypdf", "ocr", "none"
    filename: str = ""
    warning: str = ""
    error: str = ""


@dataclass
class DateCandidate:
    """A candidate date/deadline found in document text."""
    matched_text: str
    context: str          # surrounding sentence / passage
    start_pos: int = 0


# ---------------------------------------------------------------------------
# Extraction patterns
# ---------------------------------------------------------------------------

# Regex for common date formats
_DATE_PATTERNS = [
    # ISO: 2024-12-31
    r'\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b',
    # US: 12/31/2024 or 12-31-2024
    r'\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b',
    # Verbose: December 31, 2024 | 31 December 2024
    r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)'
    r'\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b',
    r'\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|'
    r'September|October|November|December),?\s+\d{4}\b',
    # Short month: Dec 31, 2024
    r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b',
]

_DEADLINE_KEYWORDS = re.compile(
    r'\b(deadline|due date|due by|submit by|by|before|no later than|expires?|expiry|'
    r'closing date|last date|submission date|end date|cutoff|cut-off)\b',
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_text(file_bytes: bytes, filename: str) -> ExtractionResult:
    """
    Extract readable text from *file_bytes*.

    Supports .txt, .md, .csv (plain text) and .pdf (text-based).
    Scanned PDFs require optional OCR dependencies.
    """
    name = Path(filename)
    suffix = name.suffix.lower()

    if suffix == ".pdf":
        return _extract_pdf(file_bytes, filename)

    # Plain text formats
    if suffix in {".txt", ".md", ".csv", ".rst", ".log", ""}:
        return _extract_text_file(file_bytes, filename)

    return ExtractionResult(
        success=False,
        filename=filename,
        method="none",
        error=(
            f"Unsupported file format '{suffix}'. "
            "Supported formats: .txt, .md, .csv, .pdf"
        ),
    )


def find_dates(text: str) -> list[DateCandidate]:
    """
    Search *text* for candidate dates and deadline-adjacent phrases.
    Returns a list of :class:`DateCandidate` objects with their context.
    """
    if not text:
        return []

    candidates: list[DateCandidate] = []
    seen_positions: set[int] = set()

    for pattern in _DATE_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            start = match.start()
            if start in seen_positions:
                continue
            seen_positions.add(start)

            # Capture a surrounding window (±200 chars)
            window_start = max(0, start - 200)
            window_end = min(len(text), match.end() + 200)
            context = text[window_start:window_end].strip()

            candidates.append(DateCandidate(
                matched_text=match.group(),
                context=context,
                start_pos=start,
            ))

    # Prioritise candidates near deadline keywords
    def _score(c: DateCandidate) -> int:
        return -1 if _DEADLINE_KEYWORDS.search(c.context) else 0

    candidates.sort(key=_score)
    return candidates


def summarize_text(text: str, max_sentences: int = 5) -> str:
    """
    Rule-based extractive summary: return the first *max_sentences* sentences.

    This is clearly an extractive, rule-based method — not generative AI.
    """
    if not text or not text.strip():
        return ""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    selected = [s.strip() for s in sentences if s.strip()][:max_sentences]
    return " ".join(selected)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_text_file(file_bytes: bytes, filename: str) -> ExtractionResult:
    """Decode plain text files with graceful encoding fallback."""
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            text = file_bytes.decode(encoding)
            if not text.strip():
                return ExtractionResult(
                    success=False,
                    filename=filename,
                    method="text",
                    text="",
                    warning="The file was decoded successfully but contains no readable text.",
                )
            return ExtractionResult(
                success=True,
                text=text,
                filename=filename,
                method="text",
                page_count=1,
            )
        except UnicodeDecodeError:
            continue

    return ExtractionResult(
        success=False,
        filename=filename,
        method="text",
        error="Could not decode the file with any supported encoding (UTF-8, Latin-1, CP1252).",
    )


def _extract_pdf(file_bytes: bytes, filename: str) -> ExtractionResult:
    """Extract text from a PDF file."""
    if not PYPDF_AVAILABLE:
        return ExtractionResult(
            success=False,
            filename=filename,
            method="none",
            error=(
                "pypdf is not installed. Install it with: pip install pypdf\n"
                "PDF extraction is unavailable."
            ),
        )

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text: list[str] = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            pages_text.append(page_text)

        full_text = "\n\n".join(pages_text)
        stripped = full_text.strip()

        if not stripped:
            # Possibly a scanned PDF
            if TESSERACT_AVAILABLE and PDF2IMAGE_AVAILABLE:
                return _ocr_pdf(file_bytes, filename, len(reader.pages))
            return ExtractionResult(
                success=False,
                filename=filename,
                method="pypdf",
                page_count=len(reader.pages),
                text="",
                warning=(
                    "No text could be extracted from this PDF. It may be a scanned image. "
                    + get_ocr_availability_message()
                ),
            )

        return ExtractionResult(
            success=True,
            text=stripped,
            filename=filename,
            method="pypdf",
            page_count=len(reader.pages),
        )

    except Exception as exc:  # noqa: BLE001
        return ExtractionResult(
            success=False,
            filename=filename,
            method="pypdf",
            error=f"PDF extraction failed: {exc}",
        )


def _ocr_pdf(file_bytes: bytes, filename: str, page_count: int) -> ExtractionResult:
    """OCR a scanned PDF using pytesseract + pdf2image (optional)."""
    try:
        images = pdf2image.convert_from_bytes(
            file_bytes,
            poppler_path=os.environ.get("POPPLER_PATH") or None,
        )
        texts = [pytesseract.image_to_string(img) for img in images]
        full_text = "\n\n".join(texts).strip()
        if not full_text:
            return ExtractionResult(
                success=False,
                filename=filename,
                method="ocr",
                page_count=page_count,
                warning="OCR completed but returned no readable text.",
            )
        return ExtractionResult(
            success=True,
            text=full_text,
            filename=filename,
            method="ocr",
            page_count=page_count,
            warning="Text was extracted via OCR and may contain recognition errors. Please verify.",
        )
    except Exception as exc:  # noqa: BLE001
        return ExtractionResult(
            success=False,
            filename=filename,
            method="ocr",
            error=f"OCR failed: {exc}",
        )
