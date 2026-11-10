"""
braille_service.py
------------------
Braille translation through the Liblouis native library and installed tables.

Supports English UEB and Indian Bharati Braille languages (Hindi, Kannada,
Tamil, Bengali) using official Liblouis tables.  Translation is unavailable
for any language whose native library *and* table file have not been verified
at startup.  No handwritten translation map is provided.
"""

from __future__ import annotations

import ctypes
import ctypes.util
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Table registry — all entries must name an official Liblouis table file.
# Indian‑language table filenames were verified against the upstream Liblouis
# repository (https://github.com/liblouis/liblouis/tree/master/tables).
# ---------------------------------------------------------------------------

LIBLOUIS_TABLES: dict[str, dict[str, str | int]] = {
    # ── English UEB ──────────────────────────────────────────────────────
    "English (Uncontracted, Grade 1)": {
        "table": "en-ueb-g1.ctb",
        "grade": 1,
        "script": "latin",
        "language_code": "en",
        "sanity_char": "a",
        "sanity_expected": "⠁",
    },
    "English (Contracted, Grade 2)": {
        "table": "en-ueb-g2.ctb",
        "grade": 2,
        "script": "latin",
        "language_code": "en",
        "sanity_char": "a",
        "sanity_expected": "⠁",
    },
    # ── Indian Bharati Braille ───────────────────────────────────────────
    "Hindi (Bharati Braille, Grade 1)": {
        "table": "hi-in-g1.utb",
        "grade": 1,
        "script": "devanagari",
        "language_code": "hi",
        # क (U+0915) → Bharati Braille dots 1‑3 → ⠅
        "sanity_char": "\u0915",
        "sanity_expected": "⠅",
    },
    "Kannada (Bharati Braille, Grade 1)": {
        "table": "ka-in-g1.utb",
        "grade": 1,
        "script": "kannada",
        "language_code": "kn",
        # ಕ (U+0C95) → Bharati Braille dots 1‑3 → ⠅
        "sanity_char": "\u0C95",
        "sanity_expected": "⠅",
    },
    "Tamil (Bharati Braille, Grade 1)": {
        "table": "ta-ta-g1.ctb",
        "grade": 1,
        "script": "tamil",
        "language_code": "ta",
        # க (U+0B95) → Bharati Braille dots 1‑3 → ⠅
        "sanity_char": "\u0B95",
        "sanity_expected": "⠅",
    },
    "Bengali (Bharati Braille, Grade 1)": {
        "table": "be-in-g1.utb",
        "grade": 1,
        "script": "bengali",
        "language_code": "bn",
        # ক (U+0995) → Bharati Braille dots 1‑3 → ⠅
        "sanity_char": "\u0995",
        "sanity_expected": "⠅",
    },
}

# Languages that could not be verified at startup are stored here with the
# reason.  They are excluded from get_available_languages() but visible via
# get_language_status().
_UNAVAILABLE_LANGUAGES: dict[str, str] = {}

_UNICODE_DISPLAY_TABLE = "unicode.dis"
_BRAILLE_START = 0x2800
_BRAILLE_END = 0x28FF
_NO_UNDEFINED_MODE = 128


@dataclass
class TranslationResult:
    """Holds the result and provenance of a Braille translation attempt."""

    success: bool
    braille_text: str = ""
    original_text: str = ""
    method: str = "none"
    table_used: str = ""
    language: str = ""
    language_code: str = ""
    script: str = ""
    warning: str = ""
    error: str = ""
    unsupported_chars: list[str] = field(default_factory=list)


def _table_directories(library_path: Path | None) -> list[Path]:
    candidates: list[Path] = []
    configured = os.environ.get("LOUIS_TABLEPATH", "")
    candidates.extend(
        Path(item.strip().strip('"'))
        for item in configured.split(os.pathsep)
        if item.strip()
    )

    if library_path:
        library_dir = library_path.parent
        candidates.extend((
            library_dir.parent / "share" / "liblouis" / "tables",
            library_dir.parent / "share" / "liblouis",
            library_dir.parent / "tables",
        ))

    if sys.platform == "win32":
        for root in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
            if root:
                candidates.extend((
                    Path(root) / "Liblouis" / "share" / "liblouis" / "tables",
                    Path(root) / "liblouis" / "share" / "liblouis" / "tables",
                ))
    else:
        candidates.extend((
            Path("/usr/share/liblouis/tables"),
            Path("/usr/local/share/liblouis/tables"),
            Path("/opt/homebrew/share/liblouis/tables"),
        ))

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = str(candidate.expanduser().resolve())
        if normalized not in seen:
            seen.add(normalized)
            unique.append(Path(normalized))
    return unique


def _library_candidates() -> list[str]:
    configured = os.environ.get("LIBLOUIS_LIBRARY")
    candidates = [configured] if configured else []
    discovered = ctypes.util.find_library("louis")
    if discovered:
        candidates.append(discovered)

    if sys.platform == "win32":
        for root in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
            if root:
                candidates.extend((
                    str(Path(root) / "Liblouis" / "bin" / "liblouis.dll"),
                    str(Path(root) / "liblouis" / "bin" / "liblouis.dll"),
                ))
    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


class _LibLouis:
    """Minimal adapter for Liblouis' documented widechar C API."""

    def __init__(self, library_path: str, table_dir: Path):
        path = Path(library_path)
        if sys.platform == "win32" and path.is_file():
            self._dll_directory = os.add_dll_directory(str(path.parent))
            self.library = ctypes.WinDLL(str(path))
        elif sys.platform == "win32":
            self._dll_directory = None
            self.library = ctypes.WinDLL(library_path)
        else:
            self._dll_directory = None
            self.library = ctypes.CDLL(library_path)

        self.library.lou_charSize.argtypes = []
        self.library.lou_charSize.restype = ctypes.c_int
        if self.library.lou_charSize() != ctypes.sizeof(ctypes.c_uint32):
            raise RuntimeError("Liblouis must use 32-bit Unicode characters.")

        self.library.lou_translateString.argtypes = [
            ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint32),
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_uint32),
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_uint16),
            ctypes.c_char_p,
            ctypes.c_int,
        ]
        self.library.lou_translateString.restype = ctypes.c_int
        self.table_dir = table_dir

        if not (table_dir / _UNICODE_DISPLAY_TABLE).is_file():
            raise RuntimeError(f"Required Liblouis display table is missing: {_UNICODE_DISPLAY_TABLE}")

        # Verify each registered language table individually.
        # English UEB tables are required; Indian tables are optional.
        self.verified_tables: set[str] = set()
        for name, info in LIBLOUIS_TABLES.items():
            table = str(info["table"])
            sanity_char = str(info.get("sanity_char", "a"))
            sanity_expected = str(info.get("sanity_expected", "⠁"))
            if not (table_dir / table).is_file():
                _UNAVAILABLE_LANGUAGES[name] = (
                    f"Table file {table} not found in {table_dir}."
                )
                continue
            try:
                result = self.translate(sanity_char, table)
                if result != sanity_expected:
                    _UNAVAILABLE_LANGUAGES[name] = (
                        f"Sanity check failed for {table}: "
                        f"expected {sanity_expected!r} for {sanity_char!r}, "
                        f"got {result!r}."
                    )
                    continue
            except (OSError, RuntimeError, ValueError) as exc:
                _UNAVAILABLE_LANGUAGES[name] = (
                    f"Could not validate table {table}: {exc}"
                )
                continue
            self.verified_tables.add(name)

        # At least one English table must pass for the engine to be useful.
        english_tables = [
            n for n in self.verified_tables
            if LIBLOUIS_TABLES[n].get("language_code") == "en"
        ]
        if not english_tables:
            raise RuntimeError(
                "No English UEB tables could be verified. "
                "Checked: " + ", ".join(
                    str(LIBLOUIS_TABLES[n]["table"]) for n in LIBLOUIS_TABLES
                    if LIBLOUIS_TABLES[n].get("language_code") == "en"
                )
            )

    def translate(self, text: str, table: str, mode: int = 0) -> str:
        input_length = len(text)
        input_buffer = (ctypes.c_uint32 * max(input_length, 1))(
            *(ord(character) for character in text) if text else 0
        )
        output_capacity = max(64, input_length * 16 + 64)
        output_buffer = (ctypes.c_uint32 * output_capacity)()
        output_length = ctypes.c_int(output_capacity)
        source_length = ctypes.c_int(input_length)
        table_list = f"{_UNICODE_DISPLAY_TABLE},{table}".encode("utf-8")

        translated = self.library.lou_translateString(
            table_list,
            input_buffer,
            ctypes.byref(source_length),
            output_buffer,
            ctypes.byref(output_length),
            None,
            None,
            mode,
        )
        if not translated:
            raise RuntimeError(f"Liblouis failed to translate with table {table}.")
        if not 0 <= output_length.value <= output_capacity:
            raise RuntimeError("Liblouis returned an invalid output length.")
        return "".join(chr(output_buffer[index]) for index in range(output_length.value))


def _load_liblouis() -> tuple[_LibLouis | None, str]:
    errors: list[str] = []
    for library_path in _library_candidates():
        try:
            path = Path(library_path)
            if sys.platform == "win32" and not path.is_file():
                continue
            for table_dir in _table_directories(path if path.is_file() else None):
                # We need at least unicode.dis and one English table file.
                if not (table_dir / _UNICODE_DISPLAY_TABLE).is_file():
                    continue
                english_tables = [
                    info for info in LIBLOUIS_TABLES.values()
                    if info.get("language_code") == "en"
                ]
                if not any(
                    (table_dir / str(info["table"])).is_file()
                    for info in english_tables
                ):
                    continue
                os.environ.setdefault("LOUIS_TABLEPATH", str(table_dir))
                return _LibLouis(library_path, table_dir), ""
            errors.append(f"No installed UEB tables found for {library_path}.")
        except (OSError, AttributeError, RuntimeError) as exc:
            errors.append(f"Could not initialize {library_path}: {exc}")

    if not errors:
        errors.append("The Liblouis native library was not found.")
    return None, " ".join(errors)


_LIBLOUIS, _LIBLOUIS_ERROR = _load_liblouis()
LIBLOUIS_AVAILABLE = _LIBLOUIS is not None


def get_available_languages() -> list[str]:
    """Return translation tables that were validated against the native library."""
    if not LIBLOUIS_AVAILABLE:
        return []
    return [name for name in LIBLOUIS_TABLES if name in _LIBLOUIS.verified_tables]


def get_available_indian_languages() -> list[str]:
    """Return only verified Indian Bharati Braille language names."""
    return [
        name for name in get_available_languages()
        if LIBLOUIS_TABLES[name].get("language_code") != "en"
    ]


def get_all_registered_languages() -> list[str]:
    """Return all registered language names, whether verified or not."""
    return list(LIBLOUIS_TABLES)


def get_language_status() -> dict[str, dict]:
    """Return per-language availability and metadata for UI display."""
    status: dict[str, dict] = {}
    for name, info in LIBLOUIS_TABLES.items():
        available = LIBLOUIS_AVAILABLE and name not in _UNAVAILABLE_LANGUAGES
        reason = _UNAVAILABLE_LANGUAGES.get(name, "")
        if not LIBLOUIS_AVAILABLE:
            reason = _LIBLOUIS_ERROR
        status[name] = {
            "available": available,
            "table": str(info["table"]),
            "grade": info["grade"],
            "script": info.get("script", ""),
            "language_code": info.get("language_code", ""),
            "unavailable_reason": reason,
        }
    return status


def get_availability_message() -> str:
    """Explain why standards-based translation is unavailable and how to enable it."""
    if LIBLOUIS_AVAILABLE:
        verified = get_available_languages()
        unavailable = [n for n in LIBLOUIS_TABLES if n not in verified]
        msg = f"Liblouis is available with {len(verified)} verified language(s)."
        if unavailable:
            msg += (
                f" {len(unavailable)} language(s) could not be verified: "
                + ", ".join(unavailable) + "."
            )
        return msg
    return (
        "Standards-based Braille translation is unavailable because "
        f"{_LIBLOUIS_ERROR} Install the Liblouis native library with the "
        "en-ueb-g1.ctb, en-ueb-g2.ctb, and unicode.dis tables, then set "
        "LIBLOUIS_LIBRARY to the library path and LOUIS_TABLEPATH to the table directory. "
        "For Indian languages, also install hi-in-g1.utb, ka-in-g1.utb, ta-ta-g1.ctb, "
        "and be-in-g1.utb. No handwritten translation fallback is used."
    )


def translate(
    text: str,
    language_option: str,
    *,
    use_fallback_if_unavailable: bool = False,
) -> TranslationResult:
    """Translate text with a validated Liblouis table; otherwise fail explicitly."""
    del use_fallback_if_unavailable
    if not text or not text.strip():
        return TranslationResult(
            success=False,
            original_text=text,
            error="Input text is empty. Please enter some text to translate.",
        )

    if not LIBLOUIS_AVAILABLE:
        return TranslationResult(
            success=False,
            original_text=text,
            warning=get_availability_message(),
            error="No Braille was produced because Liblouis is unavailable.",
        )

    if language_option not in LIBLOUIS_TABLES:
        return TranslationResult(
            success=False,
            original_text=text,
            error=f"Unrecognized Liblouis translation table: {language_option!r}.",
        )

    # Reject languages whose tables were not verified at startup.
    if language_option in _UNAVAILABLE_LANGUAGES:
        return TranslationResult(
            success=False,
            original_text=text,
            method="liblouis",
            table_used=str(LIBLOUIS_TABLES[language_option]["table"]),
            error=(
                f"The {language_option} table is registered but could not be "
                f"verified: {_UNAVAILABLE_LANGUAGES[language_option]} "
                "Install the corresponding Liblouis table to enable this language."
            ),
        )

    table = str(LIBLOUIS_TABLES[language_option]["table"])
    try:
        unsupported = list(dict.fromkeys(
            character
            for character in text
            if not _LIBLOUIS.translate(character, table, _NO_UNDEFINED_MODE)
        ))
    except (OSError, RuntimeError, ValueError) as exc:
        return TranslationResult(
            success=False,
            original_text=text,
            method="liblouis",
            table_used=table,
            error=f"Liblouis could not check input characters: {exc}",
        )
    if unsupported:
        return TranslationResult(
            success=False,
            original_text=text,
            method="liblouis",
            table_used=table,
            unsupported_chars=unsupported,
            error=(
                "The selected Liblouis table does not support these input characters: "
                f"{', '.join(repr(character) for character in unsupported)}. "
                "No translation was produced."
            ),
        )

    try:
        braille = _LIBLOUIS.translate(text, table)
    except (OSError, RuntimeError, ValueError) as exc:
        return TranslationResult(
            success=False,
            original_text=text,
            table_used=table,
            warning=get_availability_message(),
            error=f"Liblouis translation failed: {exc}",
        )

    lang_info = LIBLOUIS_TABLES[language_option]
    return TranslationResult(
        success=True,
        braille_text=braille,
        original_text=text,
        method="liblouis",
        table_used=table,
        language=language_option,
        language_code=str(lang_info.get("language_code", "")),
        script=str(lang_info.get("script", "")),
    )


def describe_braille_dots(cell: str) -> str:
    """Return a human-readable dot description for a single Unicode Braille cell."""
    if not cell or len(cell) != 1:
        return ""
    code = ord(cell)
    if not _BRAILLE_START <= code <= _BRAILLE_END:
        return cell
    bits = code - _BRAILLE_START
    dots = [str(index + 1) for index in range(8) if bits & (1 << index)]
    return "dots " + "-".join(dots) if dots else "empty cell"