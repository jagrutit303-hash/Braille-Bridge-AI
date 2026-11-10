/**
 * Study Companion Service
 * Coordinates AI-grounded tutoring, Q&A, difficult concept explanations,
 * practice quizzes, and multilingual response support.
 */

import { getActiveLanguage } from "./speechService";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AskResult {
  answer: string;
  grounded: boolean;
  isAiGenerated: boolean;
  sourcePassage?: string;
  error?: string;
}

export interface ExplainResult {
  explanation: string;
  isAiGenerated: boolean;
  error?: string;
}

export const MAX_STUDY_FILE_SIZE = 15 * 1024 * 1024; // 15 Megabytes

export function validateStudyFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_STUDY_FILE_SIZE) {
    return {
      valid: false,
      error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 15MB.`,
    };
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  const allowed = ["pdf", "txt", "md", "csv", "json", "png", "jpg", "jpeg", "webp"];
  if (!ext || !allowed.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type '.${ext || "unknown"}'. Please upload a PDF, TXT, MD, CSV, or image (PNG/JPG).`,
    };
  }

  return { valid: true };
}

const STOP_WORDS = new Set([
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did",
  "the", "an", "a", "in", "on", "at", "to", "of", "for", "with", "by", "from",
  "about", "into", "define", "explain", "describe", "tell", "me", "please", "can",
  "you", "give", "mean", "meaning", "understand", "notes", "document", "uploaded",
  "file", "pdf", "text", "this", "that", "these", "those", "there", "it", "its",
]);

function normalizeSearchQuery(raw: string): { phrase: string; terms: string[] } {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^\w\s+#.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const terms = cleaned.split(/\s+/).filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return { phrase: terms.join(" "), terms };
}

/**
 * Ask a grounded question about uploaded notes (supports target voice language translation)
 */
export async function askNotesQuestion(
  question: string,
  context: string,
  targetLanguage?: string
): Promise<AskResult> {
  if (!question || !question.trim()) {
    return {
      answer: "Please enter a question to ask about your study notes.",
      grounded: false,
      isAiGenerated: false,
    };
  }

  const activeLang = targetLanguage || getActiveLanguage();

  try {
    const res = await fetch("/api/study/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context, targetLanguage: activeLang }),
    });

    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }

    const data = await res.json();
    return {
      answer: data.answer,
      grounded: data.grounded ?? true,
      isAiGenerated: Boolean(data.isAiGenerated),
      sourcePassage: data.sourcePassage,
    };
  } catch {
    return clientSideGroundedQA(question, context);
  }
}

/**
 * Request a simple explanation of a difficult concept (supports target voice language)
 */
export async function explainDifficultConcept(
  concept: string,
  context: string,
  targetLanguage?: string
): Promise<ExplainResult> {
  if (!concept || !concept.trim()) {
    return {
      explanation: "Please enter a concept name to explain.",
      isAiGenerated: false,
    };
  }

  const activeLang = targetLanguage || getActiveLanguage();

  try {
    const res = await fetch("/api/study/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concept, context, targetLanguage: activeLang }),
    });

    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }

    const data = await res.json();
    return {
      explanation: data.explanation,
      isAiGenerated: Boolean(data.isAiGenerated),
    };
  } catch {
    return clientSideExplainConcept(concept, context);
  }
}

/**
 * Fetch or generate practice quiz questions
 */
export async function fetchPracticeQuiz(context: string): Promise<QuizQuestion[]> {
  try {
    const res = await fetch("/api/study/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    });

    if (!res.ok) throw new Error("Quiz endpoint error");

    const data = await res.json();
    if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
      return data.quiz;
    }
  } catch {
    // Fall back to client generation
  }

  return generateLocalQuiz(context);
}

/**
 * Extract 3-5 core takeaway points from study notes
 */
export function extractKeyTakeaways(context: string): string[] {
  if (!context || !context.trim()) return [];

  const sentences = context
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 35 && s.length < 180);

  if (sentences.length === 0) return [];

  const step = Math.max(1, Math.floor(sentences.length / 4));
  const takeaways: string[] = [];
  for (let i = 0; i < sentences.length && takeaways.length < 4; i += step) {
    takeaways.push(sentences[i]);
  }
  return takeaways;
}

function clientSideExplainConcept(concept: string, context: string): ExplainResult {
  const { phrase, terms } = normalizeSearchQuery(concept);
  const label = phrase || concept.trim();

  if (!context || !context.trim()) {
    return {
      explanation: `No study notes are currently uploaded. Please upload a PDF or text file first so I can explain "${label}" from your material.`,
      isAiGenerated: false,
    };
  }

  const units = context
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const matched = units
    .map((u) => {
      const l = u.toLowerCase();
      let score = 0;
      if (phrase && l.includes(phrase)) score += 5;
      for (const t of terms) if (l.includes(t)) score += 2;
      return { u, score };
    })
    .filter((m) => m.score >= 2)
    .sort((a, b) => b.score - a.score);

  if (matched.length > 0) {
    return {
      explanation: `Grounded explanation of "${label}" from your notes:\n\n${matched
        .slice(0, 3)
        .map((m) => m.u)
        .join(" ")}`,
      isAiGenerated: false,
    };
  }

  return {
    explanation: `Note: "${label}" was not found directly inside the uploaded text. Check spelling or inspect the extracted text preview.`,
    isAiGenerated: false,
  };
}

function clientSideGroundedQA(question: string, context: string): AskResult {
  if (!context || !context.trim()) {
    return {
      answer: "No study notes are currently uploaded. Please upload a document to ask grounded questions.",
      grounded: false,
      isAiGenerated: false,
    };
  }

  const { phrase, terms } = normalizeSearchQuery(question);
  const sentences = context
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const matches = sentences
    .map((s) => {
      const l = s.toLowerCase();
      let score = 0;
      if (phrase && l.includes(phrase)) score += 5;
      for (const t of terms) if (l.includes(t)) score += 2;
      return { s, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length > 0) {
    return {
      answer: `From your uploaded notes:\n\n"${matches.slice(0, 3).map((m) => m.s).join(" ")}"`,
      grounded: true,
      isAiGenerated: false,
      sourcePassage: matches[0].s,
    };
  }

  return {
    answer: "This answer cannot be verified from the uploaded study material alone. The uploaded text does not appear to contain specific details on this query.",
    grounded: false,
    isAiGenerated: false,
  };
}

function generateLocalQuiz(context: string): QuizQuestion[] {
  if (!context || context.trim().length < 40) {
    return [
      {
        question: "What is the primary format of a standard Braille cell?",
        options: [
          "A 2x3 matrix containing 6 dots",
          "A single continuous line",
          "An 8x8 audio raster",
          "A 3x3 square matrix",
        ],
        correctIndex: 0,
        explanation: "Standard literary Braille uses a 6-dot cell arranged in two columns of three dots each.",
      },
      {
        question: "Why is extractive summarization considered transparent?",
        options: [
          "It selects verbatim sentences directly from source text without AI hallucination",
          "It translates into a foreign language",
          "It uses a secret proprietary neural network",
          "It removes all punctuation automatically",
        ],
        correctIndex: 0,
        explanation: "Extractive summarization returns verified verbatim sentences directly from the document.",
      },
    ];
  }

  const sentences = context
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 35 && s.length < 150);

  const q1Text = sentences[0] || "Study notes provide direct educational grounding.";
  const q2Text = sentences[Math.min(2, sentences.length - 1)] || "Concepts should be verified against source material.";

  return [
    {
      question: "Which statement appears directly in your uploaded study notes?",
      options: [
        q1Text,
        "None of these concepts are tested in the curriculum.",
        "Audio controls are permanently disabled.",
        "This topic is unrelated to the notes.",
      ],
      correctIndex: 0,
      explanation: `Verified directly in your notes: "${q1Text}"`,
    },
    {
      question: "What additional verified detail is discussed in your material?",
      options: [
        "All text content is purely decorative.",
        q2Text,
        "External references overwrite local files.",
        "Manual verification is strictly forbidden.",
      ],
      correctIndex: 1,
      explanation: `Extracted from your uploaded material: "${q2Text}"`,
    },
  ];
}
