/**
 * Web Speech API wrappers for browser-native Text-to-Speech (TTS)
 * and Speech Recognition (STT), plus accessible auditory earcons.
 */

// Audio earcons using Web Audio API
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playEarcon(type: "start" | "stop" | "success" | "warning"): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === "start") {
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === "stop") {
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === "success") {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else {
      osc.frequency.setValueAtTime(300, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch {
    // Ignore audio autoplay restrictions
  }
}

export type PunctuationMode = "smart" | "verbose";

export interface TTSOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceName?: string;
  lang?: string;
  punctuationMode?: PunctuationMode;
  raw?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

export function isTTSSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isTTSSupported()) return [];
  return window.speechSynthesis.getVoices();
}

// Global active voice language
let currentGlobalLanguage: string = "en-US";

export function getActiveLanguage(): string {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("braillebridge_language");
      if (stored) return stored;
    } catch {
      // ignore
    }
  }
  return currentGlobalLanguage;
}

export function setActiveLanguage(lang: string): void {
  currentGlobalLanguage = lang;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("braillebridge_language", lang);
      window.dispatchEvent(new CustomEvent("braillebridge-language-change", { detail: lang }));
    } catch {
      // ignore
    }
  }
}

function detectScriptLanguage(text: string): string | null {
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn-IN"; // Kannada
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN"; // Devanagari / Hindi
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN"; // Tamil
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN"; // Bengali
  return null;
}

// Punctuation & Symbol Speech Mode ("smart" = natural pauses + code/math symbols; "verbose" = speak all punctuation)
let currentPunctuationMode: PunctuationMode = "smart";

export function getPunctuationMode(): PunctuationMode {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("braillebridge_punctuation_mode");
      if (saved === "verbose" || saved === "smart") return saved;
    } catch {
      // ignore
    }
  }
  return currentPunctuationMode;
}

export function setPunctuationMode(mode: PunctuationMode): void {
  currentPunctuationMode = mode;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("braillebridge_punctuation_mode", mode);
      window.dispatchEvent(new CustomEvent("braillebridge-speech-mode-change", { detail: mode }));
    } catch {
      // ignore
    }
  }
}

/**
 * Context-aware speech preprocessor.
 * Converts code/math symbols, arrays, operators, Unicode indicators, and punctuation
 * into clear, unambiguous spoken phrasing with natural pause hints.
 */
export function formatTextForSpeech(
  text: string,
  mode: PunctuationMode = getPunctuationMode()
): string {
  if (!text) return "";
  let out = text;

  // Replace Braille Unicode glyphs (U+2800 to U+28FF) so screen-reader speech never drops silent gaps
  out = out.replace(/[\u2800-\u28FF]/g, (ch) => {
    const code = ch.charCodeAt(0) - 0x2800;
    if (code === 0) return " empty Braille cell ";
    const dots: number[] = [];
    for (let i = 0; i < 6; i++) {
      if ((code & (1 << i)) !== 0) dots.push(i + 1);
    }
    return ` Braille dots ${dots.join(" ")} `;
  });

  // UI & Document Unicode bullets / status markers
  out = out
    .replace(/✓/g, " verified, ")
    .replace(/✗/g, " incorrect, ")
    .replace(/⚠/g, " warning, ")
    .replace(/•/g, "\nBullet: ")
    .replace(/=>/g, " fat arrow ")
    .replace(/->|→/g, " arrow ");

  // Multi-character comparison / logic operators in technical text
  out = out
    .replace(/!==/g, " strictly not equals ")
    .replace(/===/g, " strictly equals ")
    .replace(/!=/g, " not equals ")
    .replace(/==/g, " double equals ")
    .replace(/<=/g, " less than or equal to ")
    .replace(/>=/g, " greater than or equal to ")
    .replace(/&&/g, " logical AND ")
    .replace(/\|\|/g, " logical OR ")
    .replace(/\+\+/g, " increment ")
    .replace(/--/g, " decrement ");

  // Array / subscript indexing syntax like arr[i], matrix[0][1]
  out = out.replace(/\b([A-Za-z_]\w*)\[([^\[\]]+)\]/g, (_m, name, idx) => {
    return `${name} index ${idx.trim()}`;
  });

  // Dimensions like 2x3 or 6x6
  out = out.replace(/\b(\d+)\s*[x×]\s*(\d+)\b/gi, "$1 by $2");

  // Percentages
  out = out.replace(/(\d+(?:\.\d+)?)\s*%/g, "$1 percent");

  // Email addresses / handles (user@domain.com)
  out = out.replace(/\b([\w.+-]+)@([\w.-]+\.[A-Za-z]{2,})\b/g, (_m, u, d) => {
    return `${u} at ${d.replace(/\./g, " dot ")}`;
  });

  // Math / code single operators (only in mathematical/variable context so normal hyphens stay fluent)
  out = out
    .replace(/(\w|\))\s*=\s*(\w|\(|-|\d)/g, "$1 equals $2")
    .replace(/(\w|\))\s*\+\s*(\w|\(|\d)/g, "$1 plus $2")
    .replace(/(\w|\))\s*\*\s*(\w|\(|\d)/g, "$1 times $2")
    .replace(/(\d|\))\s*-\s*(\d|\()/g, "$1 minus $2")
    .replace(/(^|\s)-(\d+)\b/g, "$1negative $2")
    .replace(/(\d|\w)\s*<\s*(\d|\w)/g, "$1 less than $2")
    .replace(/(\d|\w)\s*>\s*(\d|\w)/g, "$1 greater than $2");

  // Braces, remaining brackets, slashes in technical tokens
  out = out
    .replace(/\{/g, " open brace, ")
    .replace(/\}/g, ", close brace ")
    .replace(/\[/g, " open bracket, ")
    .replace(/\]/g, ", close bracket ");

  if (mode === "verbose") {
    out = out
      .replace(/;/g, ", semicolon. ")
      .replace(/:/g, ", colon. ")
      .replace(/\(/g, " open parenthesis, ")
      .replace(/\)/g, ", close parenthesis ")
      .replace(/"/g, " quote ")
      .replace(/\?/g, ", question mark. ")
      .replace(/!/g, ", exclamation mark. ")
      .replace(/,(?!\s*(?:open|close|period|comma|semicolon|colon))/g, ", comma, ")
      .replace(/\.(\s|$)/g, ", period. ");
  } else {
    // Smart mode: ensure colons/semicolons create audible breaks rather than swallowing pauses
    out = out
      .replace(/;\s*/g, "; ")
      .replace(/:\s+/g, ": ")
      .replace(/\(/g, ", ")
      .replace(/\)/g, ", ");
  }

  // Collapse repeated spaces while keeping intentional newline paragraph breaks
  out = out.replace(/[ \t]{2,}/g, " ").trim();
  return out;
}

export interface SpeechSegment {
  text: string;
  pauseAfterMs: number;
}

/**
 * Splits processed speech text into readable chunks with explicit pause durations
 * matched to ending punctuation (. ! ? ; : newline).
 */
export function splitSpeechSegmentsWithPauses(
  text: string,
  maxLen = 160
): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    const isLastPara = pIdx === paragraphs.length - 1;
    // Break along sentence/major clause boundaries retaining delimiter
    const rawClauses = para.split(/(?<=[.!?।॥;:])\s+/);

    let buffer = "";
    for (let cIdx = 0; cIdx < rawClauses.length; cIdx++) {
      const clause = rawClauses[cIdx].trim();
      if (!clause) continue;

      if ((buffer + " " + clause).trim().length <= maxLen && !/[;:.!?।॥]$/.test(buffer)) {
        buffer = (buffer + " " + clause).trim();
      } else {
        if (buffer) {
          const pause = /[;:]/.test(buffer.slice(-1)) ? 180 : 320;
          segments.push({ text: buffer, pauseAfterMs: pause });
        }
        if (clause.length <= maxLen) {
          buffer = clause;
        } else {
          for (let i = 0; i < clause.length; i += maxLen) {
            const slice = clause.slice(i, i + maxLen).trim();
            if (slice) {
              const isSliceEnd = i + maxLen >= clause.length;
              segments.push({
                text: slice,
                pauseAfterMs: isSliceEnd ? 280 : 60,
              });
            }
          }
          buffer = "";
        }
      }
    }

    if (buffer) {
      const endChar = buffer.slice(-1);
      let pause = 320;
      if (!isLastPara) pause = 460;
      else if (endChar === ";" || endChar === ":") pause = 180;
      segments.push({ text: buffer, pauseAfterMs: isLastPara ? 0 : pause });
    } else if (!isLastPara && segments.length > 0) {
      segments[segments.length - 1].pauseAfterMs = 460;
    }
  }

  return segments.length > 0 ? segments : [{ text: text.slice(0, maxLen), pauseAfterMs: 0 }];
}

/**
 * Finds the most suitable voice for a given language code (e.g., 'kn-IN', 'hi-IN', 'ta-IN', 'bn-IN', 'en-US')
 * strictly prioritizing authentic native regional accents (Karnataka Kannada, native Hindi, etc.).
 */
export function findBestVoiceForLanguage(langCode: string): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices();
  if (voices.length === 0) return null;

  const target = langCode.toLowerCase().replace("_", "-");
  const primary = target.split("-")[0];

  // Specific keywords for authentic native regional accents
  const INDIC_KEYWORDS: Record<string, string[]> = {
    kn: ["gagan", "kannada", "ಕನ್ನಡ", "kavya", "sapna"],
    hi: ["swara", "madhur", "sapna", "hindi", "हिन्दी", "kalpana", "hemant"],
    ta: ["pallavi", "valluvar", "tamil", "தமிழ்"],
    bn: ["tapan", "bashkar", "bengali", "বাংলা"],
    en: ["neerja", "prabhat", "aria", "guy", "jenny", "natural", "online"],
  };

  const keywords = INDIC_KEYWORDS[primary] || [primary];

  let bestVoice: SpeechSynthesisVoice | null = null;
  let bestScore = -1;

  for (const voice of voices) {
    const vLang = (voice.lang || "").toLowerCase().replace("_", "-");
    const vName = (voice.name || "").toLowerCase();
    let score = 0;

    // Exact regional language match (e.g. kn-IN, hi-IN)
    if (vLang === target) {
      score += 100;
    } else if (vLang.startsWith(primary + "-")) {
      score += 80;
    } else if (vLang === primary) {
      score += 60;
    }

    // Persona / native script keyword match
    for (const kw of keywords) {
      if (vName.includes(kw.toLowerCase())) {
        score += 55;
        break;
      }
    }

    // High bonus for Natural / Online / Neural voices (actual human native speech)
    if (vName.includes("natural") || vName.includes("online") || vName.includes("neural")) {
      score += 40;
    }

    // Default voice slight preference
    if (voice.default && score > 0) {
      score += 5;
    }

    // Never pick an unrelated language voice for an Indic request
    if (primary !== "en" && !vLang.startsWith(primary) && !keywords.some((k) => vName.includes(k.toLowerCase()))) {
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVoice = voice;
    }
  }

  if (bestVoice) {
    return bestVoice;
  }

  // If no native voice exists for an Indic language, return null so modern browsers
  // (Chrome, Edge) invoke their built-in speech engine for utterance.lang without forcing an English voice.
  if (primary !== "en") {
    return null;
  }

  const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  return enVoice || voices.find((v) => v.default) || voices[0] || null;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try {
    window.speechSynthesis.onvoiceschanged = () => {
      // Pre-warm voice list in memory
      getAvailableVoices();
    };
  } catch {
    // ignore
  }
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let sharedAudioElement: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activeBufferSource: AudioBufferSourceNode | null = null;
let activePauseTimer: ReturnType<typeof setTimeout> | null = null;
let playbackPaused = false;
let pendingPlaybackResume: (() => void) | null = null;
let ttsSessionId: number = 0;
let lastSpokenText: string = "";
let lastSpokenOptions: TTSOptions = {};

const INDIC_SPEECH_PHONETIC_MAP: Record<string, Array<[RegExp, string]>> = {
  hi: [
    [/\bBrailleBridge\s*AI\b/gi, "ब्रेल ब्रिज ए आई"],
    [/\bBrailleBridge\b/gi, "ब्रेल ब्रिज"],
    [/\bBraille\s+Bridge\b/gi, "ब्रेल ब्रिज"],
    [/\bBraille\b/gi, "ब्रेल"],
    [/\bAlt\s*(?:\+|plus)\s*V\b/gi, "ऑल्ट वी"],
    [/\bAlt\b/gi, "ऑल्ट"],
    [/\bEscape\b|\bEsc\b/gi, "एस्केप"],
    [/\bSpacebar\b|\bSpace\b/gi, "स्पेस"],
    [/\bUEB\b/g, "यू ई बी"],
    [/\bPDFs?\b/g, "पी डी एफ"],
    [/\bOCR\b/g, "ओ सी आर"],
    [/\bAI\b/g, "ए आई"],
    [/\bDashboard\b/gi, "डैशबोर्ड"],
  ],
  kn: [
    [/\bBrailleBridge\s*AI\b/gi, "ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್ ಎ ಐ"],
    [/\bBrailleBridge\b/gi, "ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್"],
    [/\bBraille\s+Bridge\b/gi, "ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್"],
    [/\bBraille\b/gi, "ಬ್ರೈಲ್"],
    [/\bAlt\s*(?:\+|plus)\s*V\b/gi, "ಆಲ್ಟ್ ವಿ"],
    [/\bAlt\b/gi, "ಆಲ್ಟ್"],
    [/\bEscape\b|\bEsc\b/gi, "ಎಸ್ಕೇಪ್"],
    [/\bUEB\b/g, "ಯು ಇ ಬಿ"],
    [/\bPDFs?\b/g, "ಪಿ ಡಿ ಎಫ್"],
    [/\bOCR\b/g, "ಒ ಸಿ ಆರ್"],
    [/\bAI\b/g, "ಎ ಐ"],
    [/\bDashboard\b/gi, "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್"],
  ],
  ta: [
    [/\bBrailleBridge\s*AI\b/gi, "பிரெய்ல் பிரிட்ஜ் ஏ ஐ"],
    [/\bBrailleBridge\b/gi, "பிரெய்ல் பிரிட்ஜ்"],
    [/\bBraille\s+Bridge\b/gi, "பிரெய்ல் பிரிட்ஜ்"],
    [/\bBraille\b/gi, "பிரெய்ல்"],
    [/\bAlt\s*(?:\+|plus)\s*V\b/gi, "ஆல்ட் வி"],
    [/\bAlt\b/gi, "ஆல்ட்"],
    [/\bEscape\b|\bEsc\b/gi, "எஸ்கேப்"],
    [/\bUEB\b/g, "யு இ பி"],
    [/\bPDFs?\b/g, "பி டி எஃப்"],
    [/\bOCR\b/g, "ஓ சி ஆர்"],
    [/\bAI\b/g, "ஏ ஐ"],
    [/\bDashboard\b/gi, "டாஷ்போர்டு"],
  ],
  bn: [
    [/\bBrailleBridge\s*AI\b/gi, "ব্রেইল ব্রিজ এ আই"],
    [/\bBrailleBridge\b/gi, "ব্রেইল ব্রিজ"],
    [/\bBraille\s+Bridge\b/gi, "ব্রেইল ব্রিজ"],
    [/\bBraille\b/gi, "ব্রেইল"],
    [/\bAlt\s*(?:\+|plus)\s*V\b/gi, "অল্ট ভি"],
    [/\bAlt\b/gi, "অল্ট"],
    [/\bEscape\b|\bEsc\b/gi, "এস্কেপ"],
    [/\bUEB\b/g, "ইউ ই বি"],
    [/\bPDFs?\b/g, "পি ডি এফ"],
    [/\bOCR\b/g, "ও সি আর"],
    [/\bAI\b/g, "এ আই"],
    [/\bDashboard\b/gi, "ড্যাশবোর্ড"],
  ],
};

/**
 * Converts stray English UI/brand terms into native phonetic script for Indic voices
 * so Indic TTS never spells out or skips untranslated Latin tokens.
 */
export function normalizeTextForSpeechLang(text: string, primaryLang: string): string {
  const rules = INDIC_SPEECH_PHONETIC_MAP[primaryLang];
  if (!rules || !text) return text;
  let out = text;
  for (const [pattern, replacement] of rules) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Call synchronously inside user click/key handlers before async work so Web Audio
 * and HTMLAudio remain unlocked across async fetch delays.
 */
export function prepareAudioForSpeech(): void {
  if (typeof window === "undefined") return;
  try {
    getAudioContext();
    if (!sharedAudioElement && typeof Audio !== "undefined") {
      sharedAudioElement = new Audio();
      sharedAudioElement.preload = "auto";
    }
  } catch {
    // ignore browser audio init restriction
  }
}

function revokeActiveAudioUrl(): void {
  if (activeAudioUrl) {
    try {
      URL.revokeObjectURL(activeAudioUrl);
    } catch {
      // ignore
    }
    activeAudioUrl = null;
  }
}

export function getLastSpokenText(): string {
  return lastSpokenText;
}

export function repeatLastSpoken(): boolean {
  if (!lastSpokenText) return false;
  speakText(lastSpokenText, lastSpokenOptions);
  return true;
}

export const QUICK_INDIC_TRANSLATIONS: Record<string, Record<string, string>> = {
  kn: {
    space: "ಸ್ಪೇಸ್",
    spacebar: "ಸ್ಪೇಸ್",
    backspace: "ಬ್ಯಾಕ್‌ಸ್ಪೇಸ್",
    "dot 1 raised": "ಡಾಟ್ 1 ಎತ್ತಲಾಗಿದೆ",
    "dot 1 lowered": "ಡಾಟ್ 1 ಇಳಿಸಲಾಗಿದೆ",
    "dot 2 raised": "ಡಾಟ್ 2 ಎತ್ತಲಾಗಿದೆ",
    "dot 2 lowered": "ಡಾಟ್ 2 ಇಳಿಸಲಾಗಿದೆ",
    "dot 3 raised": "ಡಾಟ್ 3 ಎತ್ತಲಾಗಿದೆ",
    "dot 3 lowered": "ಡಾಟ್ 3 ಇಳಿಸಲಾಗಿದೆ",
    "dot 4 raised": "ಡಾಟ್ 4 ಎತ್ತಲಾಗಿದೆ",
    "dot 4 lowered": "ಡಾಟ್ 4 ಇಳಿಸಲಾಗಿದೆ",
    "dot 5 raised": "ಡಾಟ್ 5 ಎತ್ತಲಾಗಿದೆ",
    "dot 5 lowered": "ಡಾಟ್ 5 ಇಳಿಸಲಾಗಿದೆ",
    "dot 6 raised": "ಡಾಟ್ 6 ಎತ್ತಲಾಗಿದೆ",
    "dot 6 lowered": "ಡಾಟ್ 6 ಇಳಿಸಲಾಗಿದೆ",
    "cleared active dots.": "ಸಕ್ರಿಯ ಡಾಟ್‌ಗಳನ್ನು ತೆರವುಗೊಳಿಸಲಾಗಿದೆ.",
    "cleared active dots": "ಸಕ್ರಿಯ ಡಾಟ್‌ಗಳನ್ನು ತೆರವುಗೊಳಿಸಲಾಗಿದೆ.",
    "inserted empty cell space.": "ಖಾಲಿ ಕೋಶದ ಜಾಗ ಸೇರಿಸಲಾಗಿದೆ.",
    "inserted empty cell space": "ಖಾಲಿ ಕೋಶದ ಜಾಗ ಸೇರಿಸಲಾಗಿದೆ.",
    "progress has been reset.": "ಕಲಿಕೆಯ ಪ್ರಗತಿಯನ್ನು ಮರುಹೊಂದಿಸಲಾಗಿದೆ.",
    "progress has been reset": "ಕಲಿಕೆಯ ಪ್ರಗತಿಯನ್ನು ಮರುಹೊಂದಿಸಲಾಗಿದೆ.",
    "your braille game accuracy and streaks have been reset to zero.":
      "ನಿಮ್ಮ ಬ್ರೈಲ್ ಆಟದ ನಿಖರತೆ ಮತ್ತು ಸ್ಟ್ರೀಕ್‌ಗಳನ್ನು ಶೂನ್ಯಕ್ಕೆ ಮರುಹೊಂದಿಸಲಾಗಿದೆ.",
    "braille copied to clipboard.": "ಬ್ರೈಲ್ ಕ್ಲಿಪ್‌ಬೋರ್ಡ್‌ಗೆ ನಕಲಿಸಲಾಗಿದೆ.",
    "braille copied to clipboard": "ಬ್ರೈಲ್ ಕ್ಲಿಪ್‌ಬೋರ್ಡ್‌ಗೆ ನಕಲಿಸಲಾಗಿದೆ.",
    "please enter text to translate.": "ದಯವಿಟ್ಟು ಅನುವಾದಿಸಲು ಪಠ್ಯವನ್ನು ನಮೂದಿಸಿ.",
    "cleared translator.": "ಅನುವಾದಕವನ್ನು ತೆರವುಗೊಳಿಸಲಾಗಿದೆ.",
    "translation could not be completed.": "ಅನುವಾದವನ್ನು ಪೂರ್ಣಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.",
    "downloaded braille text file.": "ಬ್ರೈಲ್ ಪಠ್ಯ ಫೈಲ್ ಡೌನ್‌ಲೋಡ್ ಮಾಡಲಾಗಿದೆ.",
    "downloaded brf braille file for embosser.": "ಎಂಬಾಸರ್‌ಗಾಗಿ ಬಿ ಆರ್ ಎಫ್ ಬ್ರೈಲ್ ಫೈಲ್ ಡೌನ್‌ಲೋಡ್ ಮಾಡಲಾಗಿದೆ.",
    "removed note.": "ಟಿಪ್ಪಣಿಯನ್ನು ತೆಗೆದುಹಾಕಲಾಗಿದೆ.",
    "removed notice.": "ಸೂಚನೆಯನ್ನು ತೆಗೆದುಹಾಕಲಾಗಿದೆ.",
    "welcome to braillebridge ai": "ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್ ಎ ಐ ಗೆ ಸುಸ್ವಾಗತ",
    "braille games academy: select a game tab and answer the braille prompt.":
      "ಬ್ರೈಲ್ ಗೇಮ್ಸ್ ಅಕಾಡೆಮಿ: ಆಟದ ಟ್ಯಾಬ್ ಆಯ್ಕೆಮಾಡಿ ಮತ್ತು ಬ್ರೈಲ್ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಿ.",
    "please select or build an answer before submitting.":
      "ದಯವಿಟ್ಟು ಸಲ್ಲಿಸುವ ಮೊದಲು ಉತ್ತರವನ್ನು ಆಯ್ಕೆಮಾಡಿ.",
    "high contrast mode enabled.": "ಹೈ ಕಾಂಟ್ರಾಸ್ಟ್ ಮೋಡ್ ಸಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ.",
    "high contrast mode disabled.": "ಹೈ ಕಾಂಟ್ರಾಸ್ಟ್ ಮೋಡ್ ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ.",
    "closed perkins keyboard.": "ಪರ್ಕಿನ್ಸ್ ಕೀಬೋರ್ಡ್ ಮುಚ್ಚಲಾಗಿದೆ.",
    "opened perkins 6-key keyboard. use keys s d f and j k l to type.":
      "ಪರ್ಕಿನ್ಸ್ 6-ಕೀ ಕೀಬೋರ್ಡ್ ತೆರೆಯಲಾಗಿದೆ. ಟೈಪ್ ಮಾಡಲು ಎಸ್ ಡಿ ಎಫ್ ಮತ್ತು ಜೆ ಕೆ ಎಲ್ ಕೀಗಳನ್ನು ಬಳಸಿ.",
  },
  hi: {
    space: "स्पेस",
    spacebar: "स्पेस",
    backspace: "बैकस्पेस",
    "dot 1 raised": "डॉट 1 उठाया गया",
    "dot 1 lowered": "डॉट 1 नीचे किया गया",
    "dot 2 raised": "डॉट 2 उठाया गया",
    "dot 2 lowered": "डॉट 2 नीचे किया गया",
    "dot 3 raised": "डॉट 3 उठाया गया",
    "dot 3 lowered": "डॉट 3 नीचे किया गया",
    "dot 4 raised": "डॉट 4 उठाया गया",
    "dot 4 lowered": "डॉट 4 नीचे किया गया",
    "dot 5 raised": "डॉट 5 उठाया गया",
    "dot 5 lowered": "डॉट 5 नीचे किया गया",
    "dot 6 raised": "डॉट 6 उठाया गया",
    "dot 6 lowered": "डॉट 6 नीचे किया गया",
    "cleared active dots.": "सक्रिय डॉट्स साफ़ किए गए।",
    "cleared active dots": "सक्रिय डॉट्स साफ़ किए गए।",
    "inserted empty cell space.": "खाली सेल स्पेस डाला गया।",
    "inserted empty cell space": "खाली सेल स्पेस डाला गया।",
    "progress has been reset.": "प्रगति रीसेट कर दी गई है।",
    "progress has been reset": "प्रगति रीसेट कर दी गई है।",
    "your braille game accuracy and streaks have been reset to zero.":
      "आपकी ब्रेल खेल सटीकता और लकीरें शून्य पर रीसेट कर दी गई हैं।",
    "braille copied to clipboard.": "ब्रेल क्लिपबोर्ड पर कॉपी किया गया।",
    "braille copied to clipboard": "ब्रेल क्लिपबोर्ड पर कॉपी किया गया।",
    "please enter text to translate.": "कृपया अनुवाद करने के लिए टेक्स्ट दर्ज करें।",
    "cleared translator.": "अनुवादक साफ़ किया गया।",
    "translation could not be completed.": "अनुवाद पूरा नहीं किया जा सका।",
    "downloaded braille text file.": "ब्रेल टेक्स्ट फ़ाइल डाउनलोड की गई।",
    "downloaded brf braille file for embosser.": "एम्बॉसर के लिए बी आर एफ ब्रेल फ़ाइल डाउनलोड की गई।",
    "removed note.": "नोट हटा दिया गया।",
    "removed notice.": "सूचना हटा दी गई।",
    "welcome to braillebridge ai": "ब्रेल ब्रिज ए आई में आपका स्वागत है",
    "braille games academy: select a game tab and answer the braille prompt.":
      "ब्रेल गेम्स अकादमी: गेम टैब चुनें और ब्रेल प्रश्न का उत्तर दें।",
    "please select or build an answer before submitting.":
      "कृपया सबमिट करने से पहले उत्तर चुनें या बनाएं।",
    "high contrast mode enabled.": "उच्च कंट्रास्ट मोड सक्षम किया गया।",
    "high contrast mode disabled.": "उच्च कंट्रास्ट मोड अक्षम किया गया।",
    "closed perkins keyboard.": "पर्किन्स कीबोर्ड बंद किया गया।",
    "opened perkins 6-key keyboard. use keys s d f and j k l to type.":
      "पर्किन्स 6-कुंजी कीबोर्ड खोला गया। टाइप करने के लिए एस डी एफ और जे ಕೆ ಎಲ್ कुंजियों का उपयोग करें।",
  },
  ta: {
    space: "ஸ்பேஸ்",
    spacebar: "ஸ்பேஸ்",
    backspace: "பேக்ஸ்பேஸ்",
    "dot 1 raised": "புள்ளி 1 உயர்த்தப்பட்டது",
    "dot 1 lowered": "புள்ளி 1 இறக்கப்பட்டது",
    "cleared active dots.": "செயலில் உள்ள புள்ளிகள் அழிக்கப்பட்டன.",
    "cleared active dots": "செயலில் உள்ள புள்ளிகள் அழிக்கப்பட்டன.",
    "progress has been reset.": "முன்னேற்றம் மீட்டமைக்கப்பட்டது.",
    "braille copied to clipboard.": "பிரெய்ல் கிளிப்போர்டுக்கு நகலெடுக்கப்பட்டது.",
    "please enter text to translate.": "மொழிபெயர்க்க உரையை உள்ளிடவும்.",
    "cleared translator.": "மொழிபெயர்ப்பாளர் அழிக்கப்பட்டார்.",
    "removed note.": "குறிப்பு அகற்றப்பட்டது.",
    "removed notice.": "அறிவிப்பு அகற்றப்பட்டது.",
  },
  bn: {
    space: "স্পেস",
    spacebar: "স্পেস",
    backspace: "ব্যাকস্পেস",
    "dot 1 raised": "ডট ১ তোলা হয়েছে",
    "dot 1 lowered": "ডট ১ নামানো হয়েছে",
    "cleared active dots.": "সক্রিয় ডট মুছে ফেলা হয়েছে।",
    "cleared active dots": "সক্রিয় ডট মুছে ফেলা হয়েছে।",
    "progress has been reset.": "অগ্রগতি পুনরায় সেট করা হয়েছে।",
    "braille copied to clipboard.": "ব্রেইল ক্লিপবোর্ডে কপি করা হয়েছে।",
    "please enter text to translate.": "অনুবাদ করার জন্য পাঠ্য লিখুন।",
    "cleared translator.": "অনুবাদক মুছে ফেলা হয়েছে।",
    "removed note.": "নোট সরানো হয়েছে।",
    "removed notice.": "বিজ্ঞপ্তি সরানো হয়েছে।",
  },
};

export function lookupQuickIndicTranslation(text: string, primaryLang: string): string | null {
  const dict = QUICK_INDIC_TRANSLATIONS[primaryLang];
  const cleaned = text.trim();
  const lower = cleaned.toLowerCase();

  if (dict && dict[lower]) {
    return dict[lower];
  }

  // Dot N raised/lowered pattern
  const dotMatch = cleaned.match(/^Dot\s+(\d+)\s+(raised|lowered)(?:\.\s*Current:\s*(.*))?$/i);
  if (dotMatch) {
    const num = dotMatch[1];
    const isRaised = dotMatch[2].toLowerCase() === "raised";
    const currentDesc = dotMatch[3] ? dotMatch[3].trim() : "";
    if (primaryLang === "kn") {
      const act = isRaised ? "ಎತ್ತಲಾಗಿದೆ" : "ಇಳಿಸಲಾಗಿದೆ";
      return currentDesc ? `ಡಾಟ್ ${num} ${act}. ಪ್ರಸ್ತುತ: ${currentDesc}` : `ಡಾಟ್ ${num} ${act}`;
    }
    if (primaryLang === "hi") {
      const act = isRaised ? "उठाया गया" : "नीचे किया गया";
      return currentDesc ? `डॉट ${num} ${act}। वर्तमान: ${currentDesc}` : `डॉट ${num} ${act}`;
    }
  }

  // Inserted cell X, desc pattern
  const cellMatch = cleaned.match(/^Inserted cell\s+([^,]+),\s*(.+)$/i);
  if (cellMatch) {
    if (primaryLang === "kn") return `ಕೋಶ ${cellMatch[1]} ಸೇರಿಸಲಾಗಿದೆ, ${cellMatch[2]}`;
    if (primaryLang === "hi") return `सेल ${cellMatch[1]} डाला गया, ${cellMatch[2]}`;
  }

  // Cell N: X, desc pattern
  const cellInspMatch = cleaned.match(/^Cell\s+(\d+):\s*([^,]+),\s*(.+)$/i);
  if (cellInspMatch) {
    if (primaryLang === "kn") return `ಕೋಶ ${cellInspMatch[1]}: ${cellInspMatch[2]}, ${cellInspMatch[3]}`;
    if (primaryLang === "hi") return `सेल ${cellInspMatch[1]}: ${cellInspMatch[2]}, ${cellInspMatch[3]}`;
  }

  // Student name updated pattern
  const nameMatch = cleaned.match(/^Student name updated to\s+(.+?)\.?$/i);
  if (nameMatch) {
    if (primaryLang === "kn") return `ವಿದ್ಯಾರ್ಥಿಯ ಹೆಸರನ್ನು ${nameMatch[1]} ಗೆ ನವೀಕರಿಸಲಾಗಿದೆ.`;
    if (primaryLang === "hi") return `विद्यार्थी का नाम ${nameMatch[1]} पर अपडेट किया गया।`;
  }

  // Loaded note / Loaded notice pattern
  const noteMatch = cleaned.match(/^Loaded\s+"?([^".]+)"?\.?$/i);
  if (noteMatch) {
    if (primaryLang === "kn") return `"${noteMatch[1]}" ಲೋಡ್ ಮಾಡಲಾಗಿದೆ.`;
    if (primaryLang === "hi") return `"${noteMatch[1]}" लोड किया गया।`;
  }

  return null;
}

const clientTranslationCache = new Map<string, string>();

export async function translateTextIfNeeded(text: string, targetLang: string): Promise<string> {
  const shortLang = (targetLang || "en").split("-")[0].toLowerCase();
  if (shortLang === "en") return text;

  const detected = detectScriptLanguage(text);
  if (detected && detected.startsWith(shortLang)) {
    return text;
  }

  const quick = lookupQuickIndicTranslation(text, shortLang);
  if (quick) return quick;

  const cacheKey = `${shortLang}:${text.trim()}`;
  if (clientTranslationCache.has(cacheKey)) {
    return clientTranslationCache.get(cacheKey)!;
  }

  if (!/[a-zA-Z]{2,}/.test(text)) {
    return text;
  }

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLang: "en",
        targetLang: shortLang,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.translatedText && typeof data.translatedText === "string") {
        clientTranslationCache.set(cacheKey, data.translatedText);
        return data.translatedText;
      }
    }
  } catch {
    // fallback
  }

  return normalizeTextForSpeechLang(text, shortLang);
}

function playViaRemoteTTS(
  processedText: string,
  langToUse: string,
  options: TTSOptions,
  sessionId: number
): void {
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    fallbackToBrowserTTS(processedText, langToUse, options, sessionId);
    return;
  }

  const primaryLang = langToUse.split("-")[0].toLowerCase();
  const segments = splitSpeechSegmentsWithPauses(processedText, 140);
  let idx = 0;

  const advanceAfterSegment = (seg: SpeechSegment) => {
    if (sessionId !== ttsSessionId) return;
    idx++;
    if (idx >= segments.length) {
      activeAudioElement = null;
      activeBufferSource = null;
      revokeActiveAudioUrl();
      options.onEnd?.();
    } else {
      activePauseTimer = setTimeout(playNextSegment, seg.pauseAfterMs);
    }
  };

  const playNextSegment = async () => {
    if (sessionId !== ttsSessionId) return;
    if (playbackPaused) { pendingPlaybackResume = () => { void playNextSegment(); }; return; }
    if (idx >= segments.length) {
      activeAudioElement = null;
      activeBufferSource = null;
      revokeActiveAudioUrl();
      options.onEnd?.();
      return;
    }

    const seg = segments[idx];
    const url = `/api/tts?text=${encodeURIComponent(seg.text)}&lang=${encodeURIComponent(primaryLang)}`;

    try {
      const res = await fetch(url);
      if (sessionId !== ttsSessionId) return;
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
      const blob = await res.blob();
      if (sessionId !== ttsSessionId) return;
      if (!blob || blob.size < 100) throw new Error("Empty TTS audio");

      if (typeof Audio !== "undefined") {
        const audio = sharedAudioElement || new Audio();
        sharedAudioElement = audio;
        revokeActiveAudioUrl();
        activeAudioUrl = URL.createObjectURL(blob);
        audio.src = activeAudioUrl;
        audio.playbackRate = options.rate ?? 1.0;
        activeAudioElement = audio;

        audio.onended = () => {
          if (sessionId !== ttsSessionId) return;
          advanceAfterSegment(seg);
        };
        audio.onerror = () => {
          activeAudioElement = null;
          revokeActiveAudioUrl();
          if (sessionId === ttsSessionId) {
            fallbackToBrowserTTS(
              segments.slice(idx).map((s) => s.text).join(" "),
              langToUse,
              options,
              sessionId
            );
          }
        };

        try {
          if (playbackPaused) {
            pendingPlaybackResume = () => { void audio.play().catch(() => fallbackToBrowserTTS(segments.slice(idx).map((s) => s.text).join(" "), langToUse, options, sessionId)); };
            return;
          }
          if (idx === 0) options.onStart?.();
          await audio.play();
          return;
        } catch {
          activeAudioElement = null;
          revokeActiveAudioUrl();
          const ctx = getAudioContext();
          if (ctx) {
            const arrayBuf = await blob.arrayBuffer();
            if (sessionId !== ttsSessionId) return;
            const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
            if (sessionId !== ttsSessionId) return;
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.playbackRate.value = options.rate ?? 1.0;
            source.connect(ctx.destination);
            activeBufferSource = source;
            source.onended = () => {
              if (activeBufferSource === source) activeBufferSource = null;
              if (sessionId !== ttsSessionId) return;
              advanceAfterSegment(seg);
            };
            if (playbackPaused) {
              pendingPlaybackResume = () => { source.start(0); };
              return;
            }
            if (idx === 0) options.onStart?.();
            source.start(0);
            return;
          }
        }
      }
    } catch {
      // Fallback
    }

    if (sessionId === ttsSessionId) {
      fallbackToBrowserTTS(
        segments.slice(idx).map((s) => s.text).join(" "),
        langToUse,
        options,
        sessionId
      );
    }
  };

  playNextSegment();
}

function fallbackToBrowserTTS(
  cleanText: string,
  langToUse: string,
  options: TTSOptions,
  sessionId: number
): void {
  if (!isTTSSupported()) {
    playViaRemoteTTS(cleanText, langToUse, options, sessionId);
    return;
  }

  const neededCancel = window.speechSynthesis.speaking || window.speechSynthesis.pending;
  if (neededCancel) {
    window.speechSynthesis.cancel();
  }
  const segments = splitSpeechSegmentsWithPauses(cleanText, 240);
  let idx = 0;

  const speakNextSegment = () => {
    if (sessionId !== ttsSessionId) return;
    if (playbackPaused) { pendingPlaybackResume = speakNextSegment; return; }
    if (idx >= segments.length) {
      activeUtterance = null;
      options.onEnd?.();
      return;
    }

    const seg = segments[idx];
    const utterance = new SpeechSynthesisUtterance(seg.text);
    utterance.rate = options.rate ?? 1.0;
    utterance.pitch = options.pitch ?? 1.0;
    utterance.volume = options.volume ?? 1.0;
    utterance.lang = langToUse;

    if (options.voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const matched = voices.find((v) => v.name === options.voiceName);
      if (matched) utterance.voice = matched;
    } else {
      const bestVoice = findBestVoiceForLanguage(langToUse);
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
    }

    utterance.onstart = () => {
      activeUtterance = utterance;
      if (idx === 0) options.onStart?.();
    };

    utterance.onend = () => {
      activeUtterance = null;
      if (sessionId !== ttsSessionId) return;
      idx++;
      if (idx >= segments.length) {
        options.onEnd?.();
      } else {
        activePauseTimer = setTimeout(speakNextSegment, seg.pauseAfterMs);
      }
    };

    utterance.onerror = (e) => {
      activeUtterance = null;
      if (e.error !== "canceled" && e.error !== "interrupted") {
        options.onError?.(`Speech error: ${e.error}`);
        // Fall back to remote audio streaming if browser speech encounters an error
        playViaRemoteTTS(seg.text, langToUse, options, sessionId);
      } else {
        options.onEnd?.();
      }
    };

    activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  };

  if (neededCancel) {
    activePauseTimer = setTimeout(speakNextSegment, 35);
  } else {
    speakNextSegment();
  }
}

export function speakText(text: string, options: TTSOptions = {}): void {
  const rawTrimmed = text.trim();
  if (!rawTrimmed) return;

  stopSpeaking();
  prepareAudioForSpeech();
  const currentSession = ++ttsSessionId;

  const rawLang = options.lang || getActiveLanguage();
  const detectedLang = detectScriptLanguage(rawTrimmed);

  // If text is written in an Indic script and language was English, switch to the detected Indic language
  const langToUse =
    detectedLang && rawLang.split("-")[0].toLowerCase() === "en" ? detectedLang : rawLang;
  const primaryLang = langToUse.split("-")[0].toLowerCase();

  lastSpokenText = rawTrimmed;
  lastSpokenOptions = { ...options, lang: langToUse };

  const executePlayback = (finalText: string) => {
    if (currentSession !== ttsSessionId) return;

    const rawOrFormatted = options.raw
      ? finalText
      : formatTextForSpeech(finalText, options.punctuationMode || getPunctuationMode());

    const processedText = normalizeTextForSpeechLang(rawOrFormatted, primaryLang);

    // STRICT NATIVE VOICE PRIORITY:
    // Always prefer browser native speech synthesis with Karnataka Kannada (Microsoft Gagan / Google ಕನ್ನಡ)
    // or native Hindi (Microsoft Swara / Madhur / Google हिन्दी) voice.
    if (isTTSSupported()) {
      const nativeVoice = findBestVoiceForLanguage(langToUse);
      if (nativeVoice || primaryLang === "en") {
        fallbackToBrowserTTS(processedText, langToUse, options, currentSession);
        return;
      }
      try {
        fallbackToBrowserTTS(processedText, langToUse, options, currentSession);
        return;
      } catch {
        // Fall back to remote audio streaming
      }
    }

    playViaRemoteTTS(processedText, langToUse, options, currentSession);
  };

  // FULL WEBSITE READ-ALOUD IN SELECTED LANGUAGE:
  // When active language is an Indic language (Kannada, Hindi, Tamil, Bengali) and text contains English/Latin terms,
  // automatically translate the text into the selected language so read-aloud works in that language across the whole website!
  if (primaryLang !== "en" && !detectedLang && /[a-zA-Z]{2,}/.test(rawTrimmed)) {
    const quick = lookupQuickIndicTranslation(rawTrimmed, primaryLang);
    if (quick) {
      executePlayback(quick);
      return;
    }

    const cacheKey = `${primaryLang}:${rawTrimmed}`;
    if (clientTranslationCache.has(cacheKey)) {
      executePlayback(clientTranslationCache.get(cacheKey)!);
      return;
    }

    translateTextIfNeeded(rawTrimmed, langToUse)
      .then((translated) => {
        executePlayback(translated || rawTrimmed);
      })
      .catch(() => {
        executePlayback(rawTrimmed);
      });
    return;
  }

  executePlayback(rawTrimmed);
}

export function pauseSpeaking(): void {
  if (!isSpeaking() && !activePauseTimer) return;
  playbackPaused = true;
  if (activeAudioElement && !activeAudioElement.paused) activeAudioElement.pause();
  const audioContext = getAudioContext();
  if (audioContext && audioContext.state === "running") void audioContext.suspend().catch(() => {});
  if (isTTSSupported() && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause();
  }
}

export function resumeSpeaking(): void {
  if (!playbackPaused) return;
  playbackPaused = false;
  const audioContext = getAudioContext();
  if (audioContext && audioContext.state === "suspended") void audioContext.resume().catch(() => {});
  if (activeAudioElement && activeAudioElement.paused && activeAudioElement.currentTime > 0) {
    void activeAudioElement.play().catch(() => {});
  }
  if (isTTSSupported() && window.speechSynthesis.paused) window.speechSynthesis.resume();
  const resume = pendingPlaybackResume;
  pendingPlaybackResume = null;
  resume?.();
}

export function isSpeechPaused(): boolean {
  return playbackPaused || Boolean(isTTSSupported() && window.speechSynthesis.paused);
}

export function stopSpeaking(): void {
  playbackPaused = false;
  pendingPlaybackResume = null;
  ttsSessionId++;
  if (activePauseTimer) {
    clearTimeout(activePauseTimer);
    activePauseTimer = null;
  }
  if (activeBufferSource) {
    try {
      activeBufferSource.stop();
      activeBufferSource.disconnect();
    } catch {
      // ignore
    }
    activeBufferSource = null;
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
      activeAudioElement = null;
    } catch {
      // ignore
    }
  }
  revokeActiveAudioUrl();
  if (isTTSSupported()) {
    window.speechSynthesis.cancel();
    activeUtterance = null;
  }
}

export function isSpeaking(): boolean {
  return (
    Boolean(activeBufferSource) ||
    Boolean(activeAudioElement && !activeAudioElement.paused) ||
    (isTTSSupported() && (window.speechSynthesis.speaking || Boolean(activeUtterance)))
  );
}

// ---------------------------------------------------------------------------
// Speech Recognition (Microphone)
// ---------------------------------------------------------------------------

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface RecognitionCallbacks {
  onStart?: () => void;
  onResult?: (finalTranscript: string) => void;
  onInterim?: (interimTranscript: string) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

let recognitionInstance: any = null;

export function startListening(
  callbacks: RecognitionCallbacks,
  lang?: string,
  continuous: boolean = false
): boolean {
  if (!isSpeechRecognitionSupported()) {
    callbacks.onError?.("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
    return false;
  }

  const langToUse = lang || getActiveLanguage();

  try {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (recognitionInstance) {
      try {
        recognitionInstance.stop();
      } catch {
        // ignore
      }
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = langToUse;

    recognition.onstart = () => {
      playEarcon("start");
      callbacks.onStart?.();
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (interimTranscript) {
        callbacks.onInterim?.(interimTranscript);
      }
      if (finalTranscript) {
        callbacks.onResult?.(finalTranscript);
      }
    };

    recognition.onend = () => {
      playEarcon("stop");
      recognitionInstance = null;
      callbacks.onEnd?.();
    };

    recognition.onerror = (event: any) => {
      recognitionInstance = null;
      callbacks.onError?.(event.error || "Speech recognition error");
    };

    recognitionInstance = recognition;
    recognition.start();
    return true;
  } catch (err: any) {
    callbacks.onError?.(err?.message || "Could not start microphone");
    return false;
  }
}

export function stopListening(): void {
  if (recognitionInstance) {
    try {
      recognitionInstance.stop();
    } catch {
      // ignore
    }
    recognitionInstance = null;
  }
}
