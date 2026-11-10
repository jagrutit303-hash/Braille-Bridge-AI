"""
workflow.py
-----------
Rule-based workflow assistant for BrailleBridge AI.

This module routes user commands to explicit Python functions.
No generative AI is used. Results are clearly labelled as rule-based.
Uncertain outputs are flagged for user verification.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from braille_service import translate, TranslationResult, get_available_languages
from document_service import (
    extract_text, find_dates, summarize_text,
    ExtractionResult, DateCandidate,
)


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class WorkflowResult:
    """Unified result container for any workflow step."""
    action: str
    success: bool
    output: str = ""
    data: dict = field(default_factory=dict)
    needs_verification: bool = False
    warning: str = ""
    error: str = ""


# ---------------------------------------------------------------------------
# Individual workflow actions
# ---------------------------------------------------------------------------

def action_translate(
    text: str,
    language_option: Optional[str] = None,
) -> WorkflowResult:
    """Workflow: translate text to Braille."""
    if not language_option:
        options = get_available_languages()
        language_option = options[0] if options else ""

    result: TranslationResult = translate(text, language_option)
    return WorkflowResult(
        action="translate_to_braille",
        success=result.success,
        output=result.braille_text,
        data={
            "original_text": result.original_text,
            "method": result.method,
            "table": result.table_used,
            "unsupported": result.unsupported_chars,
        },
        warning=result.warning,
        error=result.error,
        needs_verification=bool(result.unsupported_chars),
    )


def action_read_aloud(text: str) -> WorkflowResult:
    """
    Workflow: signal that text should be read aloud.
    Actual TTS is performed in the browser via speech_service.
    """
    if not text or not text.strip():
        return WorkflowResult(
            action="read_aloud",
            success=False,
            error="No text provided to read aloud.",
        )
    return WorkflowResult(
        action="read_aloud",
        success=True,
        output=text,
        data={"char_count": len(text), "word_count": len(text.split())},
    )


def action_extract_document(
    file_bytes: bytes,
    filename: str,
) -> WorkflowResult:
    """Workflow: extract text from a document."""
    result: ExtractionResult = extract_text(file_bytes, filename)
    return WorkflowResult(
        action="extract_document",
        success=result.success,
        output=result.text,
        data={
            "filename": result.filename,
            "pages": result.page_count,
            "method": result.method,
        },
        warning=result.warning,
        error=result.error,
        needs_verification=result.method == "ocr",
    )


def action_find_deadlines(text: str) -> WorkflowResult:
    """
    Workflow: search document text for candidate dates and deadlines.
    Returns found dates with their source passages for user verification.
    """
    if not text or not text.strip():
        return WorkflowResult(
            action="find_deadlines",
            success=False,
            error="No text to search. Please extract a document first.",
        )

    candidates: list[DateCandidate] = find_dates(text)

    if not candidates:
        return WorkflowResult(
            action="find_deadlines",
            success=True,
            output="No dates or deadlines were found in this document.",
            data={"candidates": []},
        )

    lines = []
    for i, c in enumerate(candidates, 1):
        lines.append(
            f"**Date {i}:** {c.matched_text}\n"
            f"**Context:** …{c.context}…"
        )

    return WorkflowResult(
        action="find_deadlines",
        success=True,
        output="\n\n".join(lines),
        data={"candidates": [
            {"date": c.matched_text, "context": c.context}
            for c in candidates
        ]},
        needs_verification=True,
        warning=(
            "These are candidate dates found by pattern matching. "
            "Please verify them against the original document."
        ),
    )


def action_summarize(text: str, max_sentences: int = 5) -> WorkflowResult:
    """
    Workflow: extractive rule-based summary of document text.
    Returns the first *max_sentences* sentences.
    """
    if not text or not text.strip():
        return WorkflowResult(
            action="summarize",
            success=False,
            error="No text to summarize.",
        )

    summary = summarize_text(text, max_sentences)
    if not summary:
        return WorkflowResult(
            action="summarize",
            success=False,
            error="Could not generate a summary from the provided text.",
        )

    return WorkflowResult(
        action="summarize",
        success=True,
        output=summary,
        data={"sentences_returned": max_sentences},
        needs_verification=True,
        warning=(
            "This is an extractive summary (first few sentences). "
            "It is rule-based, not AI-generated. Verify against the full document."
        ),
    )


# ---------------------------------------------------------------------------
# Multi-step workflow: "Read document and find deadlines"
# ---------------------------------------------------------------------------

def workflow_read_and_find_deadlines(
    file_bytes: bytes,
    filename: str,
) -> list[WorkflowResult]:
    """
    Multi-step workflow:
    1. Extract text from document.
    2. Search extracted text for dates / deadlines.

    Returns a list of WorkflowResult objects, one per step.
    """
    results: list[WorkflowResult] = []

    # Step 1: extract
    extraction = action_extract_document(file_bytes, filename)
    results.append(extraction)

    if not extraction.success or not extraction.output.strip():
        results.append(WorkflowResult(
            action="find_deadlines",
            success=False,
            error="Could not find deadlines because document extraction failed or returned no text.",
        ))
        return results

    # Step 2: find deadlines
    deadline_result = action_find_deadlines(extraction.output)
    results.append(deadline_result)

    return results


# ---------------------------------------------------------------------------
# Command router
# ---------------------------------------------------------------------------

def route_command(
    command: str,
    *,
    text: Optional[str] = None,
    file_bytes: Optional[bytes] = None,
    filename: Optional[str] = None,
    language_option: Optional[str] = None,
) -> WorkflowResult:
    """
    Route a plain-text command to the appropriate workflow action.

    Recognised commands
    -------------------
    "translate"       -> action_translate
    "read"            -> action_read_aloud
    "extract"         -> action_extract_document
    "deadlines"       -> action_find_deadlines
    "summarize"       -> action_summarize

    All unrecognised commands return an informative error.
    """
    cmd = command.lower().strip()

    if cmd == "translate":
        if not text:
            return WorkflowResult(action=cmd, success=False, error="No text provided for translation.")
        return action_translate(text, language_option)

    if cmd == "read":
        if not text:
            return WorkflowResult(action=cmd, success=False, error="No text provided to read.")
        return action_read_aloud(text)

    if cmd == "extract":
        if not file_bytes or not filename:
            return WorkflowResult(action=cmd, success=False, error="No document provided for extraction.")
        return action_extract_document(file_bytes, filename)

    if cmd == "deadlines":
        if not text:
            return WorkflowResult(action=cmd, success=False, error="No text to search for deadlines.")
        return action_find_deadlines(text)

    if cmd == "summarize":
        if not text:
            return WorkflowResult(action=cmd, success=False, error="No text to summarize.")
        return action_summarize(text)

    return WorkflowResult(
        action=cmd,
        success=False,
        error=(
            f"Unknown command '{command}'. "
            "Supported: translate, read, extract, deadlines, summarize"
        ),
    )
