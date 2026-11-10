/**
 * Document extraction, OCR fallback, date/deadline detection, and summarization service.
 * Handles plain text (.txt, .md, .csv), images (.png, .jpg, .jpeg, .webp via OCR),
 * digital PDFs via local pdfjs-dist worker + server fallback, and scanned PDFs via Tesseract OCR.
 */

import * as pdfjsLib from "pdfjs-dist";

// Serve worker from local Express server rather than external CDN
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export interface ExtractionResult {
  success: boolean;
  text: string;
  pageCount: number;
  wordCount: number;
  charCount: number;
  method: string;
  filename: string;
  warning?: string;
  error?: string;
}

export interface DateCandidate {
  date: string;
  context: string;
  startPos: number;
  isDeadlinePriority: boolean;
  priorityScore: number;
}

export interface SampleDocument {
  id: string;
  title: string;
  description: string;
  content: string;
}

export const SAMPLE_DOCUMENTS: SampleDocument[] = [
  {
    id: "grant-notice",
    title: "Accessibility Technology Grant RFP",
    description: "Federal assistive technology solicitation notice with application deadlines.",
    content: `NATIONAL INCLUSIVE ACCESS FOUNDATION
Grant Opportunity: Assistive Media & Braille Technology Initiative (FY 2026-2027)

1. Program Overview
The National Inclusive Access Foundation announces competitive funding for assistive technology tools supporting visually impaired scholars, students, and professionals. Priority consideration is given to open-source software, standards-based UEB conversion, and offline-first screen reader workflows.

2. Important Deadlines and Schedules
- Letter of Intent submission date: November 15, 2026 by 5:00 PM EST.
- Technical webinar and applicant Q&A: December 05, 2026 at 2:00 PM EST.
- Full proposal deadline: January 20, 2027. Late submissions will not be reviewed.
- Final grant award decisions will be announced before March 15, 2027.
- Project performance period commences on May 01, 2027 and expires on April 30, 2029.

3. Mandatory Requirements
All funded projects must conform to WCAG 2.1 Level AA accessibility criteria. No proprietary API dependencies are permitted without explicit waiver approval by December 10, 2026. Applicants must submit quarterly telemetry reports demonstrating user independence gains.`,
  },
  {
    id: "syllabus",
    title: "University Course Syllabus (CS 410)",
    description: "Inclusive design and tactile computing course calendar with milestone dates.",
    content: `DEPARTMENT OF COMPUTER SCIENCE — SPRING 2027
CS 410: Accessible User Interfaces & Tactile Computing
Instructor: Dr. Maya Henderson | Office Hours: Tue/Thu 14:00-16:00

Course Description:
This seminar explores human-computer interaction for low-vision and blind users. We examine refreshable Braille hardware, auditory feedback, and universal design.

Semester Schedule & Due Dates:
- Assignment 1 (Web Speech API integration) is due by February 14, 2027.
- Midterm Project Proposal submission deadline: March 12, 2027 at 23:59.
- Spring Recess starts March 22, 2027 and ends March 28, 2027.
- Peer Review Milestone must be completed before April 16, 2027.
- Final Tactile Interface Prototype cutoff date is May 05, 2027. No extensions will be granted after May 08, 2027.`,
  },
  {
    id: "braille-guide",
    title: "Unified English Braille Quick Reference",
    description: "Guidelines on Grade 1 uncontracted vs Grade 2 contracted Braille.",
    content: `UNIFIED ENGLISH BRAILLE (UEB) — QUICK REFERENCE GUIDE
Published by the International Council on English Braille (ICEB).

Unified English Braille is designed to be unambiguous across literary, scientific, and technical texts. 
Grade 1 Braille represents text letter-by-letter, prefixing capitalized words with dot 6 (⠠) and numbers with the number sign (⠼). 
Grade 2 Braille incorporates 189 contractions, shortforms, and abbreviations to increase reading speed and reduce document bulk.

Physical Embossing & Display Notes:
Standard Braille cells measure approximately 6.5 mm high and 4.0 mm wide, with a dot base diameter of 1.4 mm. Displayed Unicode Braille characters (U+2800 to U+28FF) provide a visual layout representation for sighted transcribers and learners, but physical tactile reading requires an electromechanical refreshable Braille display or physical embossing.`,
  },
];

const DATE_PATTERNS = [
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
  /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4}\b/gi,
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?,?\s+\d{4}\b/gi,
];

const DEADLINE_KEYWORDS = /\b(deadline|due date|due by|submit by|by|before|no later than|expires?|expiry|closing date|last date|submission date|end date|cutoff|cut-off)\b/i;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Extract text from a local File (text, markdown, csv, image, or PDF)
 */
export async function extractDocumentFile(
  file: File,
  onProgress?: (statusMsg: string) => void
): Promise<ExtractionResult> {
  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (ext === "pdf") {
    return extractPdfFile(file, onProgress);
  }

  if (["png", "jpg", "jpeg", "webp", "bmp"].includes(ext)) {
    return extractImageViaOcr(file, onProgress);
  }

  if (["txt", "md", "csv", "json", "log", "rst"].includes(ext) || ext === "") {
    try {
      const text = await file.text();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      return {
        success: words > 0,
        text,
        pageCount: 1,
        wordCount: words,
        charCount: text.length,
        method: "Plain text decoder",
        filename,
        error: words === 0 ? "The uploaded file appears to be empty." : undefined,
      };
    } catch (err: any) {
      return {
        success: false,
        text: "",
        pageCount: 0,
        wordCount: 0,
        charCount: 0,
        method: "text",
        filename,
        error: `Could not read text file: ${err?.message || "Unknown error"}`,
      };
    }
  }

  return {
    success: false,
    text: "",
    pageCount: 0,
    wordCount: 0,
    charCount: 0,
    method: "none",
    filename,
    error: `Unsupported file format '.${ext}'. Supported formats: .pdf, .txt, .md, .csv, .png, .jpg`,
  };
}

/**
 * Heuristic score to pick the clearest OCR pass (prefers readable alphanumeric words over noise)
 */
export function scoreOcrCandidate(text: string): number {
  const words = (text || "").match(/[A-Za-z0-9\u0900-\u0DFF]{2,}/g) || [];
  const junk = (text || "").match(/[~`|\\^_{}]/g) || [];
  return words.length * 4 - junk.length;
}

/**
 * Preprocess canvas for handwritten / faint pen-on-paper PDFs & photos:
 * stretches tonal range, enhances ink strokes while keeping soft edges for LSTM OCR.
 */
function createHandwritingEnhancedCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const enhanced = document.createElement("canvas");
  enhanced.width = sourceCanvas.width;
  enhanced.height = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext("2d");
  const dstCtx = enhanced.getContext("2d");
  if (!srcCtx || !dstCtx) return sourceCanvas;

  const imgData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = imgData.data;
  const totalPixels = sourceCanvas.width * sourceCanvas.height;
  const gray = new Uint8Array(totalPixels);

  let minLum = 255;
  let maxLum = 0;
  let lumSum = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
    lumSum += lum;
  }

  const meanLum = lumSum / Math.max(totalPixels, 1);
  const span = Math.max(maxLum - minLum, 24);
  const inkCutoff = Math.min(210, Math.max(75, meanLum * 0.86));

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Contrast stretch into 0..255
    let norm = Math.round(((gray[p] - minLum) * 255) / span);
    norm = Math.max(0, Math.min(255, norm));

    // Soft-threshold handwriting strokes toward deep black & notebook paper toward white
    let outVal: number;
    if (norm < inkCutoff * 0.72) {
      outVal = Math.round(norm * 0.28);
    } else if (norm < inkCutoff) {
      outVal = Math.round(((norm - inkCutoff * 0.72) / (inkCutoff * 0.28)) * 95);
    } else if (norm > inkCutoff + 26) {
      outVal = 255;
    } else {
      outVal = Math.min(255, Math.round(115 + ((norm - inkCutoff) / 26) * 140));
    }

    data[i] = outVal;
    data[i + 1] = outVal;
    data[i + 2] = outVal;
    data[i + 3] = 255;
  }

  dstCtx.putImageData(imgData, 0, 0);
  return enhanced;
}

/**
 * Draw an image File onto a high-resolution upscaled canvas (>= 1600px width)
 */
function renderImageFileToCanvas(file: File): Promise<HTMLCanvasElement | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = img.width > 0 ? Math.min(3, Math.max(1.5, 1650 / img.width)) : 1.5;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function recognizeCanvasWithHandwritingFallback(
  worker: any,
  rawCanvas: HTMLCanvasElement
): Promise<string> {
  try {
    await worker.setParameters?.({
      preserve_interword_spaces: "1",
    });
  } catch {
    // older worker signature fallback
  }

  const enhancedCanvas = createHandwritingEnhancedCanvas(rawCanvas);
  const firstPass = await worker.recognize(enhancedCanvas);
  const firstText = (firstPass?.data?.text || "").trim();

  // If enhanced pass yielded very few words, compare against raw high-DPI canvas & pick clearest
  if (scoreOcrCandidate(firstText) < 12) {
    const rawPass = await worker.recognize(rawCanvas);
    const rawText = (rawPass?.data?.text || "").trim();
    return scoreOcrCandidate(rawText) > scoreOcrCandidate(firstText) ? rawText : firstText;
  }

  return firstText;
}

/**
 * Extract text from an uploaded image (printed or handwritten) using Tesseract OCR
 */
async function extractImageViaOcr(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ExtractionResult> {
  try {
    onProgress?.(`Enhancing and scanning "${file.name}" with handwritten-aware OCR…`);
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");

    let clean = "";
    const canvas = await renderImageFileToCanvas(file);
    if (canvas) {
      clean = await recognizeCanvasWithHandwritingFallback(worker, canvas);
    } else {
      const ret = await worker.recognize(file);
      clean = (ret?.data?.text || "").trim();
    }
    await worker.terminate();

    const words = clean ? clean.split(/\s+/).length : 0;
    return {
      success: words > 0,
      text: clean,
      pageCount: 1,
      wordCount: words,
      charCount: clean.length,
      method: "Handwriting-Enhanced Tesseract OCR (Image)",
      filename: file.name,
      warning:
        words === 0
          ? "No clear handwriting or printed text could be recognized in this image."
          : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      text: "",
      pageCount: 0,
      wordCount: 0,
      charCount: 0,
      method: "OCR",
      filename: file.name,
      error: `Image OCR error: ${err?.message || "Could not scan image"}`,
    };
  }
}

/**
 * Render PDF pages at high DPI, apply ink/contrast enhancement for handwritten scans,
 * and extract text via Tesseract OCR
 */
async function extractScannedPdfViaOcr(
  pdf: any,
  _filename: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (typeof document === "undefined") return "";
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const maxOcrPages = Math.min(pdf.numPages || 1, 8);
    const ocrTexts: string[] = [];

    for (let pageNum = 1; pageNum <= maxOcrPages; pageNum++) {
      onProgress?.(
        `Scanning page ${pageNum} of ${maxOcrPages} with handwritten & print OCR…`
      );
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1.0 });
      const optimalScale = Math.min(2.6, Math.max(1.8, 1900 / Math.max(baseViewport.width, 1)));
      const viewport = page.getViewport({ scale: optimalScale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const pageText = await recognizeCanvasWithHandwritingFallback(worker, canvas);
      if (pageText) {
        ocrTexts.push(pageText);
      }
    }

    await worker.terminate();
    return ocrTexts.filter(Boolean).join("\n\n").trim();
  } catch (err) {
    console.warn("Scanned PDF OCR fallback error:", err);
    return "";
  }
}

/**
 * Extract text from PDF file via local pdfjs-dist, backend fallback, and scanned PDF OCR fallback
 */
async function extractPdfFile(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ExtractionResult> {
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err: any) {
    return {
      success: false,
      text: "",
      pageCount: 0,
      wordCount: 0,
      charCount: 0,
      method: "pdfjs-dist",
      filename: file.name,
      error: `Could not read PDF file: ${err?.message || "File access error"}`,
    };
  }

  let pdfDoc: any = null;
  let fullText = "";
  let pageCount = 0;

  // 1. Primary extraction with local pdf.worker.min.mjs
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
    pdfDoc = await loadingTask.promise;
    pageCount = pdfDoc.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      let pageStr = "";
      for (const item of textContent.items as any[]) {
        if (item.str) {
          pageStr += item.str + (item.hasEOL ? "\n" : " ");
        }
      }
      pageTexts.push(pageStr.trim());
    }

    fullText = pageTexts.filter(Boolean).join("\n\n").trim();
  } catch (clientErr) {
    console.warn("Client PDF.js extraction error, trying backend parser:", clientErr);
  }

  // 2. Backend Node PDF fallback if client extraction returned empty or threw
  if (!fullText && typeof fetch !== "undefined") {
    try {
      onProgress?.(`Analyzing "${file.name}" with backend PDF parser…`);
      const base64Data = arrayBufferToBase64(arrayBuffer);
      const res = await fetch("/api/documents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data, filename: file.name }),
      });
      if (res.ok) {
        const backendData = await res.json();
        if (backendData.text && backendData.text.trim()) {
          fullText = backendData.text.trim();
          pageCount = backendData.pageCount || pageCount || 1;
        }
      }
    } catch (srvErr) {
      console.warn("Backend PDF extraction fallback failed:", srvErr);
    }
  }

  // 3. Automatic Scanned / Image PDF OCR fallback when PDF has pages but no embedded text layer
  if (!fullText && pdfDoc && pageCount > 0) {
    fullText = await extractScannedPdfViaOcr(pdfDoc, file.name, onProgress);
    if (fullText) {
      const words = fullText.split(/\s+/).length;
      return {
        success: true,
        text: fullText,
        pageCount,
        wordCount: words,
        charCount: fullText.length,
        method: "pdfjs-dist + Tesseract OCR (scanned PDF)",
        filename: file.name,
      };
    }
  }

  if (!fullText) {
    return {
      success: false,
      text: "",
      pageCount,
      wordCount: 0,
      charCount: 0,
      method: "pdfjs-dist",
      filename: file.name,
      warning:
        "No readable text was found inside this PDF (it may be password-protected, blank, or low-resolution scan). You can also upload a clear PNG/JPG screenshot or .txt file.",
    };
  }

  const words = fullText.split(/\s+/).length;
  return {
    success: true,
    text: fullText,
    pageCount: pageCount || 1,
    wordCount: words,
    charCount: fullText.length,
    method: "pdfjs-dist native PDF parser",
    filename: file.name,
  };
}

/**
 * Search text for candidate dates and deadline-adjacent passages
 */
export function findDates(text: string): DateCandidate[] {
  if (!text || !text.trim()) return [];

  const candidates: DateCandidate[] = [];
  const seenPositions = new Set<number>();

  for (const pattern of DATE_PATTERNS) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      if (seenPositions.has(start)) continue;
      seenPositions.add(start);

      const windowStart = Math.max(0, start - 140);
      const windowEnd = Math.min(text.length, match.index + match[0].length + 140);
      let context = text.slice(windowStart, windowEnd).trim();
      context = context.replace(/\s+/g, " ");

      const isDeadline = DEADLINE_KEYWORDS.test(context);
      let score = 0;
      if (isDeadline) score += 10;
      if (context.toLowerCase().includes("deadline")) score += 5;
      if (context.toLowerCase().includes("due")) score += 5;

      candidates.push({
        date: match[0],
        context,
        startPos: start,
        isDeadlinePriority: isDeadline,
        priorityScore: score,
      });
    }
  }

  candidates.sort((a, b) => b.priorityScore - a.priorityScore || a.startPos - b.startPos);
  return candidates;
}

/**
 * Extractive rule-based summary: returns first N sentences
 */
export function summarizeText(text: string, maxSentences: number = 4): string {
  if (!text || !text.trim()) return "";
  const sentences = text
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  const selected = sentences.slice(0, maxSentences);
  return selected.join(" ");
}
