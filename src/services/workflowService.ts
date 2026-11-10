/**
 * Rule-based workflow router and multi-step accessibility coordinator.
 * Mirrors workflow.py with transparent provenance and zero hallucinations.
 */

import { translate, TranslationResult } from "./brailleService";
import {
  extractDocumentFile,
  findDates,
  summarizeText,
  ExtractionResult,
  DateCandidate,
} from "./documentService";

export interface WorkflowResult {
  action: string;
  success: boolean;
  output: string;
  data: Record<string, any>;
  needsVerification: boolean;
  warning?: string;
  error?: string;
}

export function actionTranslate(text: string, languageOption: string = "en-ueb-g1"): WorkflowResult {
  const result: TranslationResult = translate(text, languageOption);
  return {
    action: "translate_to_braille",
    success: result.success,
    output: result.brailleText,
    data: {
      originalText: result.originalText,
      method: result.method,
      table: result.tableUsed,
      unsupported: result.unsupportedChars,
      cellCount: result.cellCount,
    },
    warning: result.warning,
    error: result.error,
    needsVerification: Boolean(result.unsupportedChars && result.unsupportedChars.length > 0),
  };
}

export function actionReadAloud(text: string): WorkflowResult {
  if (!text || !text.trim()) {
    return {
      action: "read_aloud",
      success: false,
      output: "",
      data: {},
      needsVerification: false,
      error: "No text provided to read aloud.",
    };
  }

  const words = text.trim().split(/\s+/).length;
  return {
    action: "read_aloud",
    success: true,
    output: text,
    data: {
      charCount: text.length,
      wordCount: words,
    },
    needsVerification: false,
  };
}

export async function actionExtractDocument(file: File): Promise<WorkflowResult> {
  const result: ExtractionResult = await extractDocumentFile(file);
  return {
    action: "extract_document",
    success: result.success,
    output: result.text,
    data: {
      filename: result.filename,
      pages: result.pageCount,
      wordCount: result.wordCount,
      method: result.method,
    },
    warning: result.warning,
    error: result.error,
    needsVerification: Boolean(result.warning),
  };
}

export function actionFindDeadlines(text: string): WorkflowResult {
  if (!text || !text.trim()) {
    return {
      action: "find_deadlines",
      success: false,
      output: "No text to search. Please enter or extract text first.",
      data: { candidates: [] },
      needsVerification: false,
      error: "No text provided for date search.",
    };
  }

  const candidates: DateCandidate[] = findDates(text);

  if (candidates.length === 0) {
    return {
      action: "find_deadlines",
      success: true,
      output: "No dates or deadlines were found in this text.",
      data: { candidates: [] },
      needsVerification: false,
    };
  }

  const lines = candidates.map(
    (c, i) =>
      `Date ${i + 1}: ${c.date} ${c.isDeadlinePriority ? "[High Priority Deadline]" : ""}\nContext: …${c.context}…`
  );

  return {
    action: "find_deadlines",
    success: true,
    output: lines.join("\n\n"),
    data: {
      candidates: candidates.map((c) => ({
        date: c.date,
        context: c.context,
        isDeadlinePriority: c.isDeadlinePriority,
      })),
    },
    needsVerification: true,
    warning:
      "These are candidate dates detected by pattern matching. Always verify against the original source document.",
  };
}

export function actionSummarize(text: string, maxSentences: number = 4): WorkflowResult {
  if (!text || !text.trim()) {
    return {
      action: "summarize",
      success: false,
      output: "",
      data: {},
      needsVerification: false,
      error: "No text to summarize.",
    };
  }

  const summary = summarizeText(text, maxSentences);
  if (!summary) {
    return {
      action: "summarize",
      success: false,
      output: "",
      data: {},
      needsVerification: false,
      error: "Could not generate an extractive summary from the provided text.",
    };
  }

  return {
    action: "summarize",
    success: true,
    output: summary,
    data: { sentencesReturned: maxSentences },
    needsVerification: true,
    warning:
      "This is a rule-based extractive summary (first key sentences). It is not AI-generated. Verify against the full document.",
  };
}

/**
 * Multi-step workflow: Read document file, extract text, and search for deadlines.
 */
export async function workflowReadAndFindDeadlines(file: File): Promise<WorkflowResult[]> {
  const results: WorkflowResult[] = [];
  const extraction = await actionExtractDocument(file);
  results.push(extraction);

  if (!extraction.success || !extraction.output.trim()) {
    results.push({
      action: "find_deadlines",
      success: false,
      output: "",
      data: {},
      needsVerification: false,
      error: "Could not search for deadlines because document extraction failed or returned empty content.",
    });
    return results;
  }

  const deadlines = actionFindDeadlines(extraction.output);
  results.push(deadlines);
  return results;
}

/**
 * Route natural voice/text command into a workflow action
 */
export function routeCommand(
  rawCommand: string,
  contextText: string,
  languageOption: string = "en-ueb-g1"
): WorkflowResult {
  const cmd = rawCommand.toLowerCase().trim();

  if (cmd.includes("translate") || cmd.includes("braille")) {
    return actionTranslate(contextText, languageOption);
  }
  if (cmd.includes("read") || cmd.includes("speak") || cmd.includes("listen") || cmd.includes("aloud")) {
    return actionReadAloud(contextText);
  }
  if (cmd.includes("deadline") || cmd.includes("date") || cmd.includes("due") || cmd.includes("when")) {
    return actionFindDeadlines(contextText);
  }
  if (cmd.includes("summar") || cmd.includes("brief") || cmd.includes("short")) {
    return actionSummarize(contextText);
  }

  return {
    action: "unknown",
    success: false,
    output: "",
    data: {},
    needsVerification: false,
    error: `Unrecognized command: "${rawCommand}". Recognized commands: Translate to Braille, Read Aloud, Find Dates, Summarize.`,
  };
}
