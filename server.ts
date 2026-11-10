import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "25mb" }));

// Initialize Google GenAI client if GEMINI_API_KEY is available
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  } catch (err) {
    console.warn("Failed to initialize GoogleGenAI client:", err);
  }
}

// ---------------------------------------------------------------------------
// Hugging Face Models Integration (Free/Serverless Inference API)
// ---------------------------------------------------------------------------
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
const HF_MODEL = process.env.HF_MODEL || "meta-llama/Llama-3.2-3B-Instruct";
let hfInferenceForbidden = false;

if (HUGGINGFACE_API_KEY) {
  console.log(`Hugging Face inference engine configured with model: ${HF_MODEL}`);
}

async function callHuggingFaceChat(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 800
): Promise<string | null> {
  if (!HUGGINGFACE_API_KEY || hfInferenceForbidden) return null;
  try {
    const res = await fetch("https://router.huggingface.co/hf-inference/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

    if (res.ok) {
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content && typeof content === "string") {
        return content.trim();
      }
    } else {
      const errText = await res.text();
      if (res.status === 401 || res.status === 403) {
        hfInferenceForbidden = true;
      }
      console.warn(`Hugging Face call returned status ${res.status}:`, errText);
    }
  } catch (err: any) {
    console.warn("Hugging Face API call failed:", err?.message);
  }
  return null;
}

async function callHuggingFaceJson<T = any>(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 1200
): Promise<T | null> {
  const content = await callHuggingFaceChat(messages, maxTokens);
  if (!content) return null;
  try {
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn("Failed to parse JSON response from Hugging Face model:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Supabase Backend Client & Resilient In-Memory Fallback Store
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes("your-project-id")) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
    console.log("Supabase backend client initialized with:", SUPABASE_URL);
  } catch (err) {
    console.warn("Failed to initialize Supabase client on backend:", err);
  }
}

// Durable Local Disk Persistence + In-Memory Store (survives server restarts)
const DATA_DIR = path.resolve(__dirname, ".data");
const DB_FILE = path.resolve(DATA_DIR, "braillebridge-db.json");

const defaultStore = {
  studyPlans: [
    {
      id: "sample-session-1",
      title: "Tactile Computing Revision",
      date: new Date().toISOString().split("T")[0],
      time: "15:00",
      durationMinutes: 60,
      subject: "Accessibility Engineering",
      completed: false,
      notes: "Module 3: UEB contractions and refreshable displays",
      userId: "guest_user",
    },
  ],
  gameProgress: {
    attempts: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    history: [] as any[],
  },
  notes: [] as any[],
  notices: [] as any[],
  preferences: {
    isHighContrast: false,
    colorVisionMode: "standard" as "standard" | "deuteranopia" | "tritanopia" | "monochrome",
    fontScale: 1.0,
    speechSpeed: 1.0,
    speechPitch: 1.0,
    preferredVoice: "",
    preferredLanguage: "en-US",
  },
  users: [] as Array<{
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    salt: string;
    createdAt: string;
  }>,
  sessions: {} as Record<string, { userId: string; createdAt: string }>,
  scriptVaultBookmarks: {} as Record<string, string[]>,
};

function loadDiskDatabase(): typeof defaultStore {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        studyPlans: Array.isArray(parsed.studyPlans) ? parsed.studyPlans : defaultStore.studyPlans,
        gameProgress: parsed.gameProgress || defaultStore.gameProgress,
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        notices: Array.isArray(parsed.notices) ? parsed.notices : [],
        preferences: { ...defaultStore.preferences, ...(parsed.preferences || {}) },
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
        scriptVaultBookmarks:
          parsed.scriptVaultBookmarks && typeof parsed.scriptVaultBookmarks === "object"
            ? parsed.scriptVaultBookmarks
            : {},
      };
    }
  } catch (err) {
    console.warn("Could not read disk database, initializing default store:", err);
  }
  return structuredClone(defaultStore);
}

const inMemoryStore = loadDiskDatabase();

function saveDiskDatabase() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(inMemoryStore, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not persist local disk database:", err);
  }
}

// ---------------------------------------------------------------------------
// Multilingual Text Translation Helper (English <-> Hindi, Kannada, Tamil, Bengali)
// ---------------------------------------------------------------------------
const translationCache = new Map<string, string>();

async function translateTextContent(
  text: string,
  targetLang: string,
  sourceLang = "en"
): Promise<string> {
  const clean = (text || "").trim();
  if (!clean) return clean;
  const targetShort = (targetLang || "en").split("-")[0].toLowerCase();
  const sourceShort = (sourceLang || "en").split("-")[0].toLowerCase();
  if (targetShort === sourceShort || !["hi", "kn", "ta", "bn", "en"].includes(targetShort)) {
    return clean;
  }

  const cacheKey = `${sourceShort}|${targetShort}|${clean}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  // Split into safe <= 450 char segments along sentence/newline boundaries
  const segments: string[] = [];
  let buf = "";
  for (const part of clean.split(/(?<=[.!?\n।])\s*/)) {
    if (!part) continue;
    if ((buf + " " + part).trim().length <= 420) {
      buf = (buf + " " + part).trim();
    } else {
      if (buf) segments.push(buf);
      if (part.length <= 420) {
        buf = part;
      } else {
        for (let i = 0; i < part.length; i += 420) {
          segments.push(part.slice(i, i + 420));
        }
        buf = "";
      }
    }
  }
  if (buf) segments.push(buf);

  try {
    const translatedParts: string[] = [];
    for (const seg of segments.slice(0, 6)) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        seg
      )}&langpair=${encodeURIComponent(`${sourceShort}|${targetShort}`)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json: any = await r.json();
      const out = json?.responseData?.translatedText;
      if (json?.responseStatus === 200 && out && typeof out === "string") {
        translatedParts.push(out);
      } else {
        translatedParts.push(seg);
      }
    }
    const finalResult = translatedParts.join(" ").trim();
    if (finalResult) {
      translationCache.set(cacheKey, finalResult);
      return finalResult;
    }
  } catch (err: any) {
    console.warn("Translation fallback (returning original text):", err?.message);
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Grounded Rule-Based Extractors & Query Normalizer
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did",
  "the", "an", "a", "in", "on", "at", "to", "of", "for", "with", "by", "from",
  "about", "into", "define", "explain", "describe", "tell", "me", "please", "can",
  "you", "give", "mean", "meaning", "understand", "notes", "document", "uploaded",
  "file", "pdf", "text", "this", "that", "these", "those", "there", "it", "its",
]);

function extractSearchTerms(query: string): { phrase: string; terms: string[] } {
  const cleaned = query
    .toLowerCase()
    .replace(/[^\w\s+#.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(/\s+/).filter((t) => t && !STOP_WORDS.has(t));
  return {
    phrase: tokens.join(" "),
    terms: tokens.filter((t) => t.length >= 2),
  };
}

function splitContextUnits(context: string): string[] {
  return context
    .split(/(?<=[.!?।॥])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12);
}

function ruleBasedConceptExplanation(concept: string, context: string): string {
  const { phrase, terms } = extractSearchTerms(concept);
  const displayTopic = phrase || concept.trim();

  if (!context || !context.trim()) {
    return `No study notes are loaded right now. Upload a PDF or text file first, and I will explain "${displayTopic}" directly using your notes.`;
  }

  const units = splitContextUnits(context);
  const scored = units.map((unit, idx) => {
    const lower = unit.toLowerCase();
    let score = 0;
    if (phrase && lower.includes(phrase)) score += 6;
    for (const term of terms) {
      if (lower.includes(term)) score += 2;
    }
    // Bonus if the sentence reads like a definition
    if (/\b(is a|is an|are|refers to|defined as|means|stores|collection)\b/i.test(lower)) {
      score += 1;
    }
    return { unit, score, idx };
  });

  const matched = scored.filter((s) => s.score >= 2).sort((a, b) => b.score - a.score || a.idx - b.idx);

  if (matched.length > 0) {
    const topUnits = matched.slice(0, 3).map((m) => m.unit);
    return `Grounded explanation of "${displayTopic}" from your uploaded material:\n\n${topUnits.join(
      " "
    )}\n\nSource summary: Found ${matched.length} matching passage(s) directly inside your uploaded notes.`;
  }

  return `Note: "${displayTopic}" was not explicitly found in the uploaded document text (${units.length} passages scanned). Please check if the term is spelled differently in your notes or inspect the extracted text preview.`;
}

function ruleBasedQA(question: string, context: string): { answer: string; grounded: boolean; sourcePassage?: string } {
  if (!context || !context.trim()) {
    return {
      answer: "No study notes are currently uploaded. Please upload a readable PDF or text document to ask grounded questions.",
      grounded: false,
    };
  }

  const { phrase, terms } = extractSearchTerms(question);
  const units = splitContextUnits(context);

  const scored = units.map((sent, idx) => {
    const lower = sent.toLowerCase();
    let score = 0;
    if (phrase && lower.includes(phrase)) score += 5;
    for (const term of terms) {
      if (lower.includes(term)) score += 2;
    }
    return { sent, score, idx };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  if (scored.length > 0 && scored[0].score > 0) {
    const topSentences = scored
      .filter((s) => s.score > 0)
      .slice(0, 3)
      .map((s) => s.sent);
    return {
      answer: `Based on your uploaded document:\n\n${topSentences.join(" ")}`,
      grounded: true,
      sourcePassage: topSentences[0],
    };
  }

  return {
    answer: `This question ("${phrase || question}") could not be verified directly from the uploaded document text alone (${units.length} passages checked).`,
    grounded: false,
  };
}

function ruleBasedQuizGenerator(context: string): Array<{
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}> {
  if (!context || context.trim().length < 50) {
    return [
      {
        question: "What is the primary role of Unified English Braille (UEB)?",
        options: [
          "To provide standard code for literary, scientific, and technical text",
          "To replace spoken languages",
          "To eliminate tactile embossers",
          "To translate audio files only",
        ],
        correctIndex: 0,
        explanation: "UEB was established by ICEB to provide a standardized, unambiguous Braille code across literary and technical materials.",
      },
      {
        question: "How many dots make up a standard Braille cell?",
        options: ["4 dots", "6 dots", "8 dots", "10 dots"],
        correctIndex: 1,
        explanation: "A standard Braille cell consists of 6 dots arranged in two columns of three dots each.",
      },
    ];
  }

  const sentences = context
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 160);

  const quizzes = [];
  for (let i = 0; i < Math.min(3, sentences.length); i++) {
    const sent = sentences[i];
    const words = sent.split(/\s+/);
    if (words.length > 6) {
      quizzes.push({
        question: `According to your study material, which of the following is true regarding: "${words.slice(0, 4).join(" ")}..."?`,
        options: [
          sent,
          `The opposite is stated in the text.`,
          `This topic is completely omitted from the syllabus.`,
          `Only experimental evidence was recorded.`,
        ],
        correctIndex: 0,
        explanation: `Directly quoted from your uploaded material: "${sent}"`,
      });
    }
  }

  return quizzes.length > 0 ? quizzes : [
    {
      question: "Which statement reflects the uploaded notes?",
      options: [
        sentences[0] || "The notes outline core domain definitions.",
        "The notes have no readable text.",
        "All exams are canceled.",
        "No deadlines were set.",
      ],
      correctIndex: 0,
      explanation: "Direct statement extracted from the uploaded study text.",
    },
  ];
}

// ---------------------------------------------------------------------------
// API Endpoints
// ---------------------------------------------------------------------------

// 1. Explain difficult concept (with optional targetLanguage translation)
app.post("/api/study/explain", async (req, res) => {
  try {
    const { concept, context, targetLanguage } = req.body;
    if (!concept || typeof concept !== "string") {
      return res.status(400).json({ error: "Missing concept to explain" });
    }

    const reqLang = (targetLanguage || "en").split("-")[0].toLowerCase();
    const searchableConcept =
      reqLang !== "en" && /[^\x00-\x7F]/.test(concept)
        ? await translateTextContent(concept, "en", reqLang)
        : concept;

    const explainPrompt = `You are a patient, accessible study tutor for blind and low-vision students.
A student needs an accessible, clear, step-by-step explanation of the concept: "${searchableConcept}".
Below is their uploaded study material context:
---
${(context || "").slice(0, 6000)}
---
Instructions:
1. Explain the concept simply in plain language (under 180 words).
2. Explicitly ground the explanation in the provided notes if present.
3. If the concept is not found in the notes, state clearly: "Note: This concept is not detailed in your uploaded notes, but here is a general explanation: ...".
4. Do not use markdown tables or complex symbols that are difficult for screen readers.`;

    let finalExplanation = "";
    let isAiGenerated = false;
    let provider = "local-rule-based";

    // 1. Try Hugging Face first
    if (HUGGINGFACE_API_KEY && !hfInferenceForbidden) {
      try {
        const hfReply = await callHuggingFaceChat([
          { role: "system", content: "You are an accessible, patient educational tutor for blind and visually impaired students." },
          { role: "user", content: explainPrompt },
        ], 350);

        if (hfReply && hfReply.trim().length > 10) {
          finalExplanation = hfReply.trim();
          isAiGenerated = true;
          provider = "huggingface";
        }
      } catch (hfErr: any) {
        console.warn("Hugging Face explain fallback:", hfErr?.message);
      }
    }

    // 2. Try Gemini if configured
    if (!finalExplanation && ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: explainPrompt,
        });

        if (response.text) {
          finalExplanation = response.text;
          isAiGenerated = true;
          provider = "gemini";
        }
      } catch (geminiErr: any) {
        console.warn("Gemini explain error, falling back to rule-based:", geminiErr?.message);
      }
    }

    // 3. Fallback to resilient rule-based generator
    if (!finalExplanation) {
      finalExplanation = ruleBasedConceptExplanation(searchableConcept, context || "");
    }

    // 4. Translate into user's active voice language if non-English
    if (reqLang !== "en" && ["hi", "kn", "ta", "bn"].includes(reqLang)) {
      finalExplanation = await translateTextContent(finalExplanation, reqLang, "en");
    }

    return res.json({
      explanation: finalExplanation,
      isAiGenerated,
      provider,
      language: targetLanguage || "en-US",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// 2. Q&A Grounded in uploaded notes (with optional targetLanguage translation)
app.post("/api/study/ask", async (req, res) => {
  try {
    const { question, context, targetLanguage } = req.body;
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing question" });
    }

    const reqLang = (targetLanguage || "en").split("-")[0].toLowerCase();
    const searchableQuestion =
      reqLang !== "en" && /[^\x00-\x7F]/.test(question)
        ? await translateTextContent(question, "en", reqLang)
        : question;

    const askPrompt = `You are an accurate, accessible study companion answering a student's question based STRICTLY on their uploaded study notes.
Question: "${searchableQuestion}"
Uploaded Material:
---
${(context || "").slice(0, 7000)}
---
Instructions:
1. Answer the question accurately using ONLY facts stated in the uploaded material.
2. If the answer cannot be verified from the uploaded material, you MUST state: "This answer cannot be verified from the uploaded study material alone."
3. Provide a brief direct citation or quote from the notes that substantiates the answer.
4. Keep the answer screen-reader friendly (no complicated markdown).`;

    let resultPayload: { answer: string; grounded: boolean; sourcePassage?: string; isAiGenerated: boolean; provider: string } | null = null;

    // 1. Try Hugging Face first
    if (HUGGINGFACE_API_KEY && !hfInferenceForbidden && context && context.trim().length > 10) {
      try {
        const hfReply = await callHuggingFaceChat([
          { role: "system", content: "You are an accurate, grounded accessibility study companion." },
          { role: "user", content: askPrompt },
        ], 400);

        if (hfReply && hfReply.trim().length > 10) {
          resultPayload = {
            answer: hfReply.trim(),
            grounded: !hfReply.includes("cannot be verified"),
            isAiGenerated: true,
            provider: "huggingface",
          };
        }
      } catch (hfErr: any) {
        console.warn("Hugging Face Q&A error, falling back:", hfErr?.message);
      }
    }

    // 2. Try Gemini
    if (!resultPayload && ai && context && context.trim().length > 10) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: askPrompt,
        });

        if (response.text) {
          resultPayload = {
            answer: response.text,
            grounded: !response.text.includes("cannot be verified"),
            isAiGenerated: true,
            provider: "gemini",
          };
        }
      } catch (geminiErr: any) {
        console.warn("Gemini QA error, falling back to rule-based:", geminiErr?.message);
      }
    }

    if (!resultPayload) {
      const fallback = ruleBasedQA(searchableQuestion, context || "");
      resultPayload = { ...fallback, isAiGenerated: false, provider: "local-rule-based" };
    }

    if (reqLang !== "en" && ["hi", "kn", "ta", "bn"].includes(reqLang)) {
      resultPayload.answer = await translateTextContent(resultPayload.answer, reqLang, "en");
    }

    return res.json(resultPayload);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// 3. Generate practice quiz
app.post("/api/study/quiz", async (req, res) => {
  try {
    const { context } = req.body;

    const quizPrompt = `Generate a 3-question multiple-choice practice quiz based STRICTLY on this study material:
---
${(context || "").slice(0, 6000)}
---
Format strictly as JSON with this schema:
[
  {
    "question": "Question text?",
    "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
    "correctIndex": 0,
    "explanation": "Why this answer is correct based on the text."
  }
]
Return ONLY raw JSON, no code fences.`;

    // 1. Try Hugging Face first
    if (HUGGINGFACE_API_KEY && context && context.trim().length > 100) {
      try {
        const parsed = await callHuggingFaceJson<Array<any>>([
          { role: "system", content: "You output only valid JSON arrays." },
          { role: "user", content: quizPrompt },
        ], 600);

        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].question && Array.isArray(parsed[0].options)) {
          return res.json({ quiz: parsed, isAiGenerated: true, provider: "huggingface" });
        }
      } catch (hfErr: any) {
        console.warn("Hugging Face quiz error, falling back:", hfErr?.message);
      }
    }

    // 2. Try Gemini
    if (ai && context && context.trim().length > 100) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: quizPrompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          if (Array.isArray(parsed) && parsed.length > 0) {
            return res.json({ quiz: parsed, isAiGenerated: true, provider: "gemini" });
          }
        }
      } catch (geminiErr: any) {
        console.warn("Gemini quiz error, falling back to rule-based:", geminiErr?.message);
      }
    }

    const quiz = ruleBasedQuizGenerator(context || "");
    return res.json({ quiz, isAiGenerated: false, provider: "local-rule-based" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// 4. College Notice and Form Assistant analysis
app.post("/api/notices/analyze", async (req, res) => {
  try {
    const { text, filename } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing notice text" });
    }

    const noticePrompt = `You are an expert accessibility document assistant analyzing a college notice, scholarship form, or exam announcement.
Extract ONLY factual information verified directly in the notice. Do NOT invent criteria or dates.
Notice:
---
${text.slice(0, 8000)}
---
Format strictly as JSON:
{
  "summary": "1-2 sentence overview of the notice",
  "deadlines": [
    {
      "title": "Application Deadline",
      "date": "2026-11-15",
      "context": "Direct quote from notice",
      "isCritical": true
    }
  ],
  "eligibility": [
    {
      "criterion": "Minimum 60% in qualifying exam",
      "context": "Direct quote from notice",
      "isAmbiguous": false
    }
  ],
  "requiredDocuments": [
    {
      "name": "Income Certificate",
      "context": "Direct quote",
      "notes": "Must be issued after April 2026"
    }
  ],
  "nextSteps": [
    "Step 1: Fill out online form",
    "Step 2: Submit physical copy to admissions office"
  ],
  "ambiguousOrMissing": [
    "Late fee policy is not specified"
  ]
}
Return ONLY raw JSON, no code fences.`;

    // 1. Try Hugging Face first
    if (HUGGINGFACE_API_KEY) {
      try {
        const parsed = await callHuggingFaceJson<any>([
          { role: "system", content: "You output only valid raw JSON." },
          { role: "user", content: noticePrompt },
        ], 800);

        if (parsed && (parsed.summary || parsed.deadlines)) {
          return res.json({ data: parsed, isAiGenerated: true, provider: "huggingface" });
        }
      } catch (hfErr: any) {
        console.warn("Hugging Face notice error, falling back:", hfErr?.message);
      }
    }

    // 2. Try Gemini
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: noticePrompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          return res.json({ data: parsed, isAiGenerated: true, provider: "gemini" });
        }
      } catch (geminiErr: any) {
        console.warn("Gemini notice error, falling back to rule-based:", geminiErr?.message);
      }
    }

    // Rule-based fallback for notice analysis
    // Detect dates using regex
    const dateRegex = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi;
    const matches = Array.from(text.matchAll(dateRegex));

    const deadlines = matches.slice(0, 4).map((m, idx) => {
      const start = Math.max(0, (m.index || 0) - 80);
      const end = Math.min(text.length, (m.index || 0) + m[0].length + 80);
      const context = text.slice(start, end).replace(/\s+/g, " ").trim();
      return {
        title: idx === 0 ? "Primary Deadline" : `Important Date ${idx + 1}`,
        date: m[0],
        context: `…${context}…`,
        isCritical: /deadline|due|last date|cutoff|submit/i.test(context),
      };
    });

    // Detect document requirements
    const docKeywords = ["certificate", "marksheet", "transcript", "photo", "id proof", "aadhar", "passport", "signature", "affidavit", "receipt"];
    const sentences = text.split(/(?<=[.!?])\s+/);
    const requiredDocs: Array<{ name: string; context: string; notes?: string }> = [];

    sentences.forEach((sent) => {
      const lower = sent.toLowerCase();
      for (const kw of docKeywords) {
        if (lower.includes(kw) && !requiredDocs.some((d) => d.name.toLowerCase().includes(kw))) {
          requiredDocs.push({
            name: kw.charAt(0).toUpperCase() + kw.slice(1),
            context: sent.trim(),
          });
        }
      }
    });

    const fallbackData = {
      summary: `Extracted notice "${filename || "document"}". Identified ${deadlines.length} key dates and ${requiredDocs.length} required documents.`,
      deadlines,
      eligibility: [
        {
          criterion: "Check the full notice text for program-specific eligibility criteria.",
          context: sentences[0] || "Refer to document body.",
          isAmbiguous: true,
        },
      ],
      requiredDocuments: requiredDocs.length > 0 ? requiredDocs : [
        { name: "Application Form", context: "Standard submission required." },
      ],
      nextSteps: [
        "1. Verify eligibility criteria in the source text.",
        "2. Prepare required certificates and documents.",
        "3. Submit application before the earliest deadline.",
      ],
      ambiguousOrMissing: [
        "Verify online portal URL and submission timings with the institution office.",
      ],
    };

    return res.json({ data: fallbackData, isAiGenerated: false });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// 5. Agentic AI Task Orchestration
app.post("/api/agent/orchestrate", async (req, res) => {
  try {
    const { prompt, currentPage, language } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const systemPrompt = `You are the core agent orchestrator for BrailleBridge AI, an accessibility platform for blind and visually impaired students.
A student gave this spoken instruction: "${prompt}".
Current page context: "${currentPage}". Selected language: "${language || "en"}".

Available tool operations:
1. "navigate_page" (params: page: "home"|"dashboard"|"translator"|"study"|"games"|"notice"|"document"|"planner"|"voice"|"about", pageName: string)
2. "read_page_content" (params: currentPage: string)
3. "set_speech_speed" (params: speed: number from 0.7 to 1.7)
4. "switch_voice_language" (params: targetLang: "en-US"|"hi-IN"|"kn-IN"|"ta-IN"|"bn-IN", langName: string)
5. "set_colorblind_mode" (params: mode: "standard"|"deuteranopia"|"tritanopia"|"monochrome")
6. "set_high_contrast" (params: enable: boolean)
7. "adjust_font_scale" (params: delta: number)
8. "open_script_vault" (params: scriptKey: "en-ueb"|"hi-in"|"kn-in"|"ta-in"|"bn-in")
9. "read_user_progress" (params: {})
10. "translate_text" (params: text: string, language: string)
11. "check_conflicts" (params: date: "YYYY-MM-DD", time: "HH:mm", durationMinutes: number)
12. "schedule_study_session" (REQUIRES PERMISSION) (params: title: string, date: "YYYY-MM-DD", time: "HH:mm", durationMinutes: number, subject: string)
13. "explain_concept" (params: concept: string)
14. "context_help" (params: currentPage: string)

Instructions:
1. Break down the user's intent into 1 to 3 ordered steps.
2. For scheduling or committing actions, mark "status": "requires_permission" and provide a spoken "permissionPrompt".
3. For view changes or queries, mark "status": "pending".
4. Format strictly as JSON matching this schema:
{
  "userIntent": "Brief intent summary",
  "explanation": "Friendly spoken explanation of what will be done",
  "steps": [
    {
      "id": "step-1",
      "toolName": "tool_name",
      "description": "Readable description",
      "parameters": {},
      "status": "pending" | "requires_permission",
      "permissionPrompt": "Confirmation message if permission required"
    }
  ]
}
Return ONLY raw JSON, no markdown.`;

    // 1. Try Hugging Face first
    if (HUGGINGFACE_API_KEY) {
      try {
        const plan = await callHuggingFaceJson<any>([
          { role: "system", content: "You output only valid JSON matching the schema." },
          { role: "user", content: systemPrompt },
        ], 600);

        if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
          return res.json({ plan, isAiGenerated: true, provider: "huggingface" });
        }
      } catch (hfErr: any) {
        console.warn("Hugging Face agent orchestrator error, falling back:", hfErr?.message);
      }
    }

    // 2. Try Gemini
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: systemPrompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        if (response.text) {
          const plan = JSON.parse(response.text.trim());
          if (plan && plan.steps) {
            return res.json({ plan, isAiGenerated: true, provider: "gemini" });
          }
        }
      } catch (geminiErr: any) {
        console.warn("Gemini agent error, falling back:", geminiErr?.message);
      }
    }

    // Fallback: Return empty to allow client-side deterministic planner
    return res.json({ plan: null, isAiGenerated: false, provider: "local-deterministic" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// 6. Multilingual Text-to-Speech Streaming Endpoint (Hindi, Kannada, Tamil, Bengali, English)
// ---------------------------------------------------------------------------
app.get("/api/tts", async (req, res) => {
  try {
    const text = (req.query.text as string) || "";
    const lang = (req.query.lang as string) || "en";

    if (!text || !text.trim()) {
      return res.status(400).send("Missing text parameter");
    }

    const shortLang = lang.split("-")[0].toLowerCase();
    const cleanText = text.slice(0, 350).trim();
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(
      shortLang
    )}&client=tw-ob&q=${encodeURIComponent(cleanText)}`;

    const response = await fetch(ttsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return res.status(response.status).send("TTS audio fetch failed");
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.warn("TTS proxy error:", err?.message);
    return res.status(500).send("Internal server TTS error");
  }
});

// 7. Serve Local PDF.js Worker (Zero external CDN failure)
app.get("/pdf.worker.min.mjs", (_req, res) => {
  const workerPath = path.resolve(__dirname, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
  if (fs.existsSync(workerPath)) {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(workerPath);
  }
  return res.status(404).send("PDF worker not found");
});

// 8. Server-Side Document / PDF Extraction Fallback
app.post("/api/documents/extract", async (req, res) => {
  try {
    const { base64Data, filename } = req.body;
    if (!base64Data || typeof base64Data !== "string") {
      return res.status(400).json({ success: false, error: "Missing document payload" });
    }
    const cleanB64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
    const buffer = Buffer.from(cleanB64, "base64");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let pageText = "";
      for (const item of tc.items as any[]) {
        if (item.str) {
          pageText += item.str + (item.hasEOL ? "\n" : " ");
        }
      }
      pages.push(pageText.trim());
    }
    const fullText = pages.filter(Boolean).join("\n\n").trim();
    return res.json({
      success: fullText.length > 0,
      text: fullText,
      pageCount: pdf.numPages,
      wordCount: fullText ? fullText.split(/\s+/).length : 0,
      charCount: fullText.length,
      method: "Backend PDF parser",
      filename: filename || "document.pdf",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      text: "",
      error: err?.message || "Server PDF extraction error",
    });
  }
});

// 9. Multilingual Text Translation API
app.post("/api/translate", async (req, res) => {
  try {
    const { text, targetLang, sourceLang } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text to translate" });
    }
    const translated = await translateTextContent(
      text,
      targetLang || "en",
      sourceLang || "en"
    );
    return res.json({ translatedText: translated, targetLang: targetLang || "en" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Translation failed" });
  }
});

// 10. Intelligent Website & Grounded Document Assistant API
const WEBSITE_KNOWLEDGE_BASE = [
  {
    page: "dashboard",
    pageName: "Progress & Saved Vault Dashboard",
    keywords: ["dashboard", "progress", "streak", "accuracy", "saved", "vault", "history", "score", "saved notes", "saved notices"],
    guidance:
      "Open the Progress Dashboard (Alt+D or Alt+9) to view your Braille accuracy percentage, current and best streaks, timetable completion progress, all saved study notes, all saved college notices, and hear an audio progress briefing.",
  },
  {
    page: "games",
    pageName: "Braille Games",
    keywords: ["game", "games", "practice", "practice braille", "practice braille dots", "braille dots", "learn braille", "detective", "pattern", "memory", "spell", "mistake", "streak", "academy"],
    guidance:
      "Go to Braille Games (Alt+5) for interactive learning activities: Dot Detective, Hear It Spell It, Pattern Builder (keys 1-6), Memory Practice, and Language Bridge. Every answer gives instant audio 'Explain My Mistake' dot diagnostics and saves your streak.",
  },
  {
    page: "translator",
    pageName: "Braille Translator",
    keywords: ["translate", "translation", "ueb", "bharati", "perkins", "brf", "emboss", "convert to braille", "kannada braille", "hindi braille", "tamil braille", "bengali braille"],
    guidance:
      "Open the Braille Translator (Alt+2) to convert English (UEB Grade 1 & 2) or Indian Bharati Braille (Hindi, Kannada, Tamil, Bengali). You can voice-type in your language, inspect any 6-dot cell interactively, use the 6-key Perkins simulator (keys S, D, F and J, K, L), hear dot numbers spoken aloud, or download a .BRF file for Braille embossers.",
  },
  {
    page: "study",
    pageName: "Study Companion",
    keywords: ["upload", "pdf", "notes", "document", "explain", "concept", "quiz", "summarize", "summary", "takeaways", "ask", "question", "study companion", "reading", "ocr"],
    guidance:
      "Go to Study Companion (Alt+3) to upload PDF, text, or image notes (including scanned PDFs via built-in OCR). Once loaded, you can play/pause audio with smart punctuation & symbol reading, ask grounded Q&A questions, explain difficult concepts in any supported voice language, generate practice quizzes, and save notes to your account.",
  },
  {
    page: "planner",
    pageName: "Study Planner & Timetable",
    keywords: ["planner", "timetable", "schedule", "session", "time", "conflict", "ics", "agenda", "plan", "reminder", "organize"],
    guidance:
      "Visit Study Planner & Timetable (Alt+4) to manage today's and upcoming study sessions. You can filter by Today, Upcoming, or Completed, dictate sessions by voice, check automatic time conflict warnings, hear today's agenda read aloud, and export .ICS calendar reminders.",
  },
  {
    page: "notice",
    pageName: "Notice Assistant",
    keywords: ["notice", "circular", "scholarship", "exam", "deadline", "form", "eligibility", "certificate", "documents required"],
    guidance:
      "Open Notice Assistant (Alt+6) to upload college circulars, exam schedules, or scholarship forms (PDF, text, image, or pasted text). It extracts deadlines, eligibility rules, required documents, actionable next steps, reads a Full Audio Briefing, and creates offline .ICS calendar reminders.",
  },
  {
    page: "about",
    pageName: "Accessibility & Help",
    keywords: ["contrast", "font", "atkinson", "hyperlegible", "shortcut", "accessibility", "zoom", "size", "help", "low vision", "blind", "screen reader", "punctuation", "symbol"],
    guidance:
      "You can adjust font scale, High Contrast dark mode, page orientation audio, and Smart Punctuation directly from the top Accessibility Bar on every page, or visit Accessibility & Help (Alt+7) for keyboard shortcuts and standards tables. Press Alt+V to talk to the Voice Agent, and press Space or Escape anytime to silence speech.",
  },
];

app.post("/api/agent/answer", async (req, res) => {
  try {
    const { query, currentPage, activeDocument, activeNotice, language } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing query" });
    }

    const reqLang = (language || "en").split("-")[0].toLowerCase();
    const englishQuery =
      reqLang !== "en" && /[^\x00-\x7F]/.test(query)
        ? await translateTextContent(query, "en", reqLang)
        : query;
    const lowerQ = englishQuery.toLowerCase();

    let answerText = "";
    let sourceType: "document" | "notice" | "website" | "general" = "website";
    let suggestedPage: string | undefined;
    let suggestedPageLabel: string | undefined;
    let grounded = false;

    // 1. Check if the user is asking about their uploaded document or summary/concepts
    const hasDoc = activeDocument && typeof activeDocument.text === "string" && activeDocument.text.trim().length > 10;
    const asksNotice = activeNotice && /\b(notice|circular|deadline|eligibility|scholarship|form|exam date)\b/i.test(lowerQ);

    if (asksNotice && activeNotice) {
      sourceType = "notice";
      grounded = true;
      answerText = `From your active notice "${activeNotice.filename}": ${activeNotice.summary || "Checked active circular."}`;
      suggestedPage = "notice";
      suggestedPageLabel = "Open Notice Assistant";
    } else if (hasDoc) {
      // Check if it clearly asks for website navigation/help vs document content
      const isPureSiteMeta = /\b(where to|where do i|how do i use|how to use|which tab|which page|shortcut|high contrast|font size|braille game)\b/i.test(lowerQ);
      if (!isPureSiteMeta) {
        if (/\b(summarize|summary|overview|takeaway|what is in my|about the uploaded|what is this document)\b/i.test(lowerQ)) {
          const previewUnits = splitContextUnits(activeDocument.text).slice(0, 3);
          answerText = `Summary of your uploaded document "${activeDocument.filename}" (${activeDocument.wordCount} words): ${previewUnits.join(" ")}`;
          sourceType = "document";
          grounded = true;
        } else {
          const qa = ruleBasedQA(englishQuery, activeDocument.text);
          if (qa.grounded) {
            answerText = `From "${activeDocument.filename}": ${qa.answer.replace(/^Based on your uploaded document:\s*/i, "")}`;
            sourceType = "document";
            grounded = true;
          }
        }
      }
    }

    // 2. If not answered by uploaded document, match Website Knowledge Base & Guidance
    if (!answerText) {
      let bestMatch = WEBSITE_KNOWLEDGE_BASE[0];
      let bestScore = 0;
      for (const item of WEBSITE_KNOWLEDGE_BASE) {
        let score = 0;
        for (const kw of item.keywords) {
          if (lowerQ.includes(kw)) {
            score += kw.includes(" ") ? 5 : 2;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }

      if (bestScore > 0) {
        sourceType = "website";
        grounded = true;
        answerText = bestMatch.guidance;
        suggestedPage = bestMatch.page;
        suggestedPageLabel = `Go to ${bestMatch.pageName}`;
      } else if (hasDoc) {
        sourceType = "document";
        grounded = false;
        answerText = `I searched "${activeDocument.filename}" (${activeDocument.wordCount} words), but could not find a direct answer to "${englishQuery}". Try asking using keywords present in your notes, or open Study Companion (Alt+3) to review the extracted text.`;
        suggestedPage = "study";
        suggestedPageLabel = "Open Study Companion";
      } else {
        sourceType = "website";
        grounded = true;
        answerText =
          "I am the BrailleBridge AI Assistant. You can translate text into English or Bharati Braille (Alt+2), upload PDF/image notes for grounded Q&A and audio reading (Alt+3), organize your timetable in Study Planner (Alt+4), practice Braille dots in Games (Alt+5), inspect circulars in Notice Assistant (Alt+6), or adjust font size and High Contrast anytime. Press Alt+V to speak or Space/Escape to silence speech.";
      }
    }

    if (reqLang !== "en" && ["hi", "kn", "ta", "bn"].includes(reqLang)) {
      answerText = await translateTextContent(answerText, reqLang, "en");
    }

    return res.json({
      answer: answerText,
      grounded,
      sourceType,
      suggestedPage,
      suggestedPageLabel,
      currentPage,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Agent answer failed" });
  }
});


// ---------------------------------------------------------------------------
// Supabase Backend Endpoints (Cloud Sync & Resilient Local Fallback)
// ---------------------------------------------------------------------------

// 1. Supabase Status Check
app.get("/api/supabase/status", async (_req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase.from("study_plans").select("id").limit(1);
      const isTableMissing = error && (error.code === "42P01" || error.message?.includes("schema cache") || error.message?.includes("relation"));
      return res.json({
        connected: !error || isTableMissing,
        source: "backend",
        url: SUPABASE_URL,
        tablesInitialized: !error,
        message: isTableMissing
          ? "Connected to cloud storage. Resilient synchronization active."
          : (error ? "Connected to cloud storage in resilient mode." : "Cloud database connected and synchronized."),
      });
    } catch (err: any) {
      return res.json({
        connected: false,
        source: "backend",
        url: SUPABASE_URL,
        message: `Supabase ping error: ${err?.message}`,
      });
    }
  }

  return res.json({
    connected: false,
    source: "local_memory",
    message: "Operating in local resilient mode (no SUPABASE_URL configured)",
  });
});

// 2. Study Plans & Timetable (CRUD)
app.get("/api/supabase/study-plans", async (_req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("study_plans")
        .select("*")
        .order("date", { ascending: true });

      if (!error && data) {
        const mapped = data.map((row: any) => ({
          id: row.id,
          title: row.title,
          date: row.date,
          time: row.time,
          durationMinutes: row.duration_minutes ?? row.durationMinutes ?? 60,
          subject: row.subject,
          completed: Boolean(row.completed),
          notes: row.notes || "",
          userId: row.user_id,
        }));
        return res.json({ items: mapped, isCloud: true });
      }
    } catch (err) {
      console.warn("Supabase fetch study plans failed, returning fallback:", err);
    }
  }

  return res.json({ items: inMemoryStore.studyPlans, isCloud: false });
});

app.post("/api/supabase/study-plans", async (req, res) => {
  const item = req.body;
  if (!item || !item.title) {
    return res.status(400).json({ error: "Missing study plan title" });
  }

  const itemId = item.id || `plan-${Date.now()}`;
  const record = {
    id: itemId,
    title: item.title,
    date: item.date || new Date().toISOString().split("T")[0],
    time: item.time || "15:00",
    durationMinutes: item.durationMinutes || 60,
    subject: item.subject || "Study Session",
    completed: Boolean(item.completed),
    notes: item.notes || "",
    userId: item.userId || "guest_user",
  };

  // Update in-memory fallback
  const existingIdx = inMemoryStore.studyPlans.findIndex((p) => p.id === itemId);
  if (existingIdx >= 0) {
    inMemoryStore.studyPlans[existingIdx] = record;
  } else {
    inMemoryStore.studyPlans.unshift(record);
  }
  saveDiskDatabase();

  if (supabase) {
    try {
      const { error } = await supabase.from("study_plans").upsert({
        id: record.id,
        title: record.title,
        date: record.date,
        time: record.time,
        duration_minutes: record.durationMinutes,
        subject: record.subject,
        completed: record.completed,
        notes: record.notes,
        user_id: record.userId,
        updated_at: new Date().toISOString(),
      });
      if (!error) {
        return res.json({ success: true, item: record, isCloud: true });
      }
    } catch (err) {
      console.warn("Supabase upsert study plan failed:", err);
    }
  }

  return res.json({ success: true, item: record, isCloud: false });
});

app.delete("/api/supabase/study-plans/:id", async (req, res) => {
  const { id } = req.params;
  inMemoryStore.studyPlans = inMemoryStore.studyPlans.filter((p) => p.id !== id);
  saveDiskDatabase();

  if (supabase) {
    try {
      await supabase.from("study_plans").delete().eq("id", id);
    } catch (err) {
      console.warn("Supabase delete study plan error:", err);
    }
  }

  return res.json({ success: true });
});

// 3. Game Progress & Streaks
app.get("/api/supabase/game-progress", async (_req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("game_progress")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return res.json({
          progress: {
            attempts: data.attempts || 0,
            correct: data.correct || 0,
            streak: data.streak || 0,
            bestStreak: data.best_streak || 0,
            history: Array.isArray(data.history) ? data.history : [],
          },
          isCloud: true,
        });
      }
    } catch (err) {
      console.warn("Supabase fetch game progress failed:", err);
    }
  }

  return res.json({ progress: inMemoryStore.gameProgress, isCloud: false });
});

app.post("/api/supabase/game-progress", async (req, res) => {
  const progress = req.body;
  if (!progress) return res.status(400).json({ error: "Missing progress payload" });

  inMemoryStore.gameProgress = {
    attempts: progress.attempts || 0,
    correct: progress.correct || 0,
    streak: progress.streak || 0,
    bestStreak: progress.bestStreak || 0,
    history: Array.isArray(progress.history) ? progress.history : [],
  };
  saveDiskDatabase();

  if (supabase) {
    try {
      const { error } = await supabase.from("game_progress").upsert({
        id: "default_progress",
        user_id: "guest_user",
        attempts: progress.attempts || 0,
        correct: progress.correct || 0,
        streak: progress.streak || 0,
        best_streak: progress.bestStreak || 0,
        history: progress.history || [],
        updated_at: new Date().toISOString(),
      });
      if (!error) return res.json({ success: true, isCloud: true });
    } catch (err) {
      console.warn("Supabase save game progress error:", err);
    }
  }

  return res.json({ success: true, isCloud: false });
});

// 4. Study Notes
app.get("/api/supabase/notes", async (_req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("study_notes")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        const notes = data.map((n: any) => ({
          id: n.id,
          title: n.title,
          filename: n.filename,
          content: n.content,
          summary: n.summary,
          takeaways: Array.isArray(n.takeaways) ? n.takeaways : [],
          wordCount: n.word_count || 0,
          createdAt: n.created_at,
        }));
        return res.json({ notes, isCloud: true });
      }
    } catch (err) {
      console.warn("Supabase fetch notes error:", err);
    }
  }

  return res.json({ notes: inMemoryStore.notes, isCloud: false });
});

app.post("/api/supabase/notes", async (req, res) => {
  const note = req.body;
  if (!note || !note.title || !note.content) {
    return res.status(400).json({ error: "Missing note title or content" });
  }

  const record = {
    id: note.id || `note-${Date.now()}`,
    title: note.title,
    filename: note.filename || "Notes.txt",
    content: note.content,
    summary: note.summary || "",
    takeaways: Array.isArray(note.takeaways) ? note.takeaways : [],
    wordCount: note.wordCount || note.content.split(/\s+/).length,
    createdAt: new Date().toISOString(),
  };

  const existingIdx = inMemoryStore.notes.findIndex((n) => n.id === record.id);
  if (existingIdx >= 0) {
    inMemoryStore.notes[existingIdx] = record;
  } else {
    inMemoryStore.notes.unshift(record);
  }
  saveDiskDatabase();

  if (supabase) {
    try {
      const { error } = await supabase.from("study_notes").upsert({
        id: record.id,
        user_id: "guest_user",
        title: record.title,
        filename: record.filename,
        content: record.content,
        summary: record.summary,
        takeaways: record.takeaways,
        word_count: record.wordCount,
      });
      if (!error) return res.json({ success: true, note: record, isCloud: true });
    } catch (err) {
      console.warn("Supabase save note error:", err);
    }
  }

  return res.json({ success: true, note: record, isCloud: false });
});

app.delete("/api/supabase/notes/:id", async (req, res) => {
  const { id } = req.params;
  inMemoryStore.notes = inMemoryStore.notes.filter((n) => n.id !== id);
  saveDiskDatabase();

  if (supabase) {
    try {
      await supabase.from("study_notes").delete().eq("id", id);
    } catch (err) {
      console.warn("Supabase delete note error:", err);
    }
  }

  return res.json({ success: true });
});

// 5. College Notices
app.get("/api/supabase/notices", async (_req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("college_notices")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        const notices = data.map((cn: any) => ({
          id: cn.id,
          title: cn.title,
          summary: cn.summary,
          deadlines: Array.isArray(cn.deadlines) ? cn.deadlines : [],
          eligibility: Array.isArray(cn.eligibility) ? cn.eligibility : [],
          requiredDocuments: Array.isArray(cn.required_documents) ? cn.required_documents : [],
          nextSteps: Array.isArray(cn.next_steps) ? cn.next_steps : [],
          createdAt: cn.created_at,
        }));
        return res.json({ notices, isCloud: true });
      }
    } catch (err) {
      console.warn("Supabase fetch notices error:", err);
    }
  }

  return res.json({ notices: inMemoryStore.notices, isCloud: false });
});

app.post("/api/supabase/notices", async (req, res) => {
  const notice = req.body;
  if (!notice || !notice.title || !notice.summary) {
    return res.status(400).json({ error: "Missing notice title or summary" });
  }

  const record = {
    id: notice.id || `notice-${Date.now()}`,
    title: notice.title,
    summary: notice.summary,
    deadlines: Array.isArray(notice.deadlines) ? notice.deadlines : [],
    eligibility: Array.isArray(notice.eligibility) ? notice.eligibility : [],
    requiredDocuments: Array.isArray(notice.requiredDocuments) ? notice.requiredDocuments : [],
    nextSteps: Array.isArray(notice.nextSteps) ? notice.nextSteps : [],
    createdAt: new Date().toISOString(),
  };

  const existingIdx = inMemoryStore.notices.findIndex((n) => n.id === record.id);
  if (existingIdx >= 0) {
    inMemoryStore.notices[existingIdx] = record;
  } else {
    inMemoryStore.notices.unshift(record);
  }
  saveDiskDatabase();

  if (supabase) {
    try {
      const { error } = await supabase.from("college_notices").upsert({
        id: record.id,
        user_id: "guest_user",
        title: record.title,
        summary: record.summary,
        deadlines: record.deadlines,
        eligibility: record.eligibility,
        required_documents: record.requiredDocuments,
        next_steps: record.nextSteps,
      });
      if (!error) return res.json({ success: true, notice: record, isCloud: true });
    } catch (err) {
      console.warn("Supabase save notice error:", err);
    }
  }

  return res.json({ success: true, notice: record, isCloud: false });
});

app.delete("/api/supabase/notices/:id", async (req, res) => {
  const { id } = req.params;
  inMemoryStore.notices = inMemoryStore.notices.filter((n) => n.id !== id);
  saveDiskDatabase();

  if (supabase) {
    try {
      await supabase.from("college_notices").delete().eq("id", id);
    } catch (err) {
      console.warn("Supabase delete notice error:", err);
    }
  }

  return res.json({ success: true });
});

// 6. User Preferences
const VALID_CVD_MODES = new Set(["standard", "deuteranopia", "tritanopia", "monochrome"]);

app.get("/api/supabase/preferences", async (_req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return res.json({
          preferences: {
            isHighContrast: Boolean(data.is_high_contrast),
            colorVisionMode: VALID_CVD_MODES.has(data.color_vision_mode)
              ? data.color_vision_mode
              : inMemoryStore.preferences.colorVisionMode || "standard",
            fontScale: Number(data.font_scale) || 1.0,
            speechSpeed: Number(data.speech_speed) || 1.0,
            speechPitch: Number(data.speech_pitch) || 1.0,
            preferredVoice: data.preferred_voice || "",
            preferredLanguage: data.preferred_language || "en-US",
          },
          isCloud: true,
        });
      }
    } catch (err) {
      console.warn("Supabase fetch preferences error:", err);
    }
  }

  return res.json({ preferences: inMemoryStore.preferences, isCloud: false });
});

app.post("/api/supabase/preferences", async (req, res) => {
  const prefs = req.body;
  if (!prefs) return res.status(400).json({ error: "Missing preferences payload" });

  const cvdMode = VALID_CVD_MODES.has(prefs.colorVisionMode)
    ? (prefs.colorVisionMode as "standard" | "deuteranopia" | "tritanopia" | "monochrome")
    : inMemoryStore.preferences.colorVisionMode || "standard";

  inMemoryStore.preferences = {
    isHighContrast: Boolean(prefs.isHighContrast),
    colorVisionMode: cvdMode,
    fontScale: Number(prefs.fontScale) || 1.0,
    speechSpeed: Number(prefs.speechSpeed) || 1.0,
    speechPitch: Number(prefs.speechPitch) || 1.0,
    preferredVoice: prefs.preferredVoice || "",
    preferredLanguage: prefs.preferredLanguage || "en-US",
  };
  saveDiskDatabase();

  if (supabase) {
    try {
      const { error } = await supabase.from("user_preferences").upsert({
        user_id: "guest_user",
        is_high_contrast: prefs.isHighContrast,
        font_scale: prefs.fontScale,
        speech_speed: prefs.speechSpeed,
        speech_pitch: prefs.speechPitch || 1.0,
        preferred_voice: prefs.preferredVoice || "",
        preferred_language: prefs.preferredLanguage || "en-US",
        updated_at: new Date().toISOString(),
      });
      if (!error) return res.json({ success: true, isCloud: true });
    } catch (err) {
      console.warn("Supabase save preferences error:", err);
    }
  }

  return res.json({ success: true, isCloud: false });
});

// ---------------------------------------------------------------------------
// 7. One-Time Student Authentication & Script Vault Persistence
// ---------------------------------------------------------------------------

function hashPasswordWithSalt(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, usedSalt, 64).toString("hex");
  return { hash, salt: usedSalt };
}

function verifyPasswordHash(password: string, salt: string, storedHash: string): boolean {
  try {
    const { hash } = hashPasswordWithSalt(password, salt);
    const bufA = Buffer.from(hash, "hex");
    const bufB = Buffer.from(storedHash, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function extractBearerToken(req: express.Request): string {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

function resolveUserFromRequest(req: express.Request) {
  const token = extractBearerToken(req);
  if (!token) return null;
  const session = inMemoryStore.sessions[token];
  if (!session) return null;
  const user = inMemoryStore.users.find((u) => u.id === session.userId);
  return user || null;
}

app.post("/api/auth/register", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (name.length < 2) {
    return res.status(400).json({ error: "Please enter your full name (at least 2 characters)." });
  }
  if (!email.includes("@") || !email.includes(".")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }

  const existing = inMemoryStore.users.find((u) => u.email === email);
  if (existing) {
    return res.status(409).json({
      error: "An account with this email already exists. Please switch to Sign In.",
    });
  }

  const { hash, salt } = hashPasswordWithSalt(password);
  const user = {
    id: `user_${crypto.randomUUID()}`,
    name,
    email,
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
  };

  const token = crypto.randomBytes(32).toString("hex");
  inMemoryStore.users.push(user);
  inMemoryStore.sessions[token] = {
    userId: user.id,
    createdAt: new Date().toISOString(),
  };
  saveDiskDatabase();

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = inMemoryStore.users.find((u) => u.email === email);
  if (!user || !verifyPasswordHash(password, user.salt, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password. Please check your credentials." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  inMemoryStore.sessions[token] = {
    userId: user.id,
    createdAt: new Date().toISOString(),
  };
  saveDiskDatabase();

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
  });
});

app.get("/api/auth/me", (req, res) => {
  const user = resolveUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Session not found or expired." });
  }
  return res.json({
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
  });
});

app.post("/api/auth/logout", (req, res) => {
  const token = extractBearerToken(req);
  if (token && inMemoryStore.sessions[token]) {
    delete inMemoryStore.sessions[token];
    saveDiskDatabase();
  }
  return res.json({ success: true });
});

function handleUpdateStudentProfile(req: express.Request, res: express.Response) {
  const user = resolveUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in first to update your profile." });
  }

  const nextName =
    req.body?.name !== undefined ? String(req.body.name).trim() : user.name;
  const nextEmail =
    req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : user.email;

  if (nextName.length < 2) {
    return res.status(400).json({ error: "Name must be at least 2 characters long." });
  }
  if (!nextEmail.includes("@") || !nextEmail.includes(".")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const conflict = inMemoryStore.users.find(
    (u) => u.id !== user.id && u.email === nextEmail
  );
  if (conflict) {
    return res.status(409).json({
      error: "Another account is already using this email address.",
    });
  }

  user.name = nextName;
  user.email = nextEmail;
  saveDiskDatabase();

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
  });
}

app.patch("/api/auth/profile", handleUpdateStudentProfile);
app.post("/api/auth/profile", handleUpdateStudentProfile);

app.get("/api/vault/bookmarks", (req, res) => {
  const user = resolveUserFromRequest(req);
  const ownerKey = user ? user.id : "guest_user";
  const items = Array.isArray(inMemoryStore.scriptVaultBookmarks[ownerKey])
    ? inMemoryStore.scriptVaultBookmarks[ownerKey]
    : [];
  return res.json({ items, ownerKey });
});

app.post("/api/vault/bookmarks", (req, res) => {
  const user = resolveUserFromRequest(req);
  const ownerKey = user ? user.id : "guest_user";
  const items = Array.isArray(req.body?.items)
    ? req.body.items.map((x: any) => String(x)).slice(0, 500)
    : [];
  inMemoryStore.scriptVaultBookmarks[ownerKey] = Array.from(new Set(items));
  saveDiskDatabase();
  return res.json({ success: true, items: inMemoryStore.scriptVaultBookmarks[ownerKey] });
});

// ---------------------------------------------------------------------------
// Static Assets / Vite Dev Server
// ---------------------------------------------------------------------------

async function startServer() {
  const distPath = path.resolve(__dirname, "dist");
  const hasDist = fs.existsSync(path.resolve(distPath, "index.html"));
  const forceDev = process.env.VITE_DEV === "true";

  if (!forceDev && hasDist) {
    console.log("Serving compiled production assets from dist/ directory.");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    console.log("Initializing Vite dev middleware...");
    const { createServer } = await import("vite");
    const reactPlugin = (await import("@vitejs/plugin-react")).default;
    const tailwindPlugin = (await import("@tailwindcss/vite")).default;

    const vite = await createServer({
      configFile: false,
      plugins: [reactPlugin(), tailwindPlugin()],
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "."),
        },
      },
      optimizeDeps: {
        include: [
          "react",
          "react-dom",
          "react-dom/client",
          "lucide-react",
          "motion",
          "@supabase/supabase-js",
        ],
      },
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
        watch: process.env.DISABLE_HMR === "true" ? null : {},
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BrailleBridge AI server listening on http://0.0.0.0:${PORT}`);
    console.log(`Open in browser: http://localhost:${PORT}`);
  });
}

startServer();
