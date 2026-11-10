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
 */
export function findBestVoiceForLanguage(langCode: string): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices();
  if (voices.length === 0) return null;

  const target = langCode.toLowerCase().replace("_", "-");
  const primary = target.split("-")[0];

  // 1. Exact match (e.g. kn-in, hi-in, ta-in, bn-in)
  const exact = voices.find((v) => {
    const vLang = v.lang.toLowerCase().replace("_", "-");
    return vLang === target;
  });
  if (exact) return exact;

  // 2. Starts with primary language (e.g. kn, hi, ta, bn)
  const startsWith = voices.find((v) => {
    const vLang = v.lang.toLowerCase().replace("_", "-");
    return vLang.startsWith(primary + "-") || vLang === primary;
  });
  if (startsWith) return startsWith;

  // 3. Check for language name in voice label (e.g. "Kannada", "Hindi", "Tamil", "Bengali")
  const langNameMap: Record<string, string> = {
    hi: "hindi",
    kn: "kannada",
    ta: "tamil",
    bn: "bengali",
    en: "english",
  };
  const searchName = langNameMap[primary];
  if (searchName) {
    const byName = voices.find((v) => v.name.toLowerCase().includes(searchName));
    if (byName) return byName;
  }

  // 4. IMPORTANT ACCESSIBILITY RULE:
  // If no native voice exists for an Indic language (kn, hi, ta, bn),
  // NEVER force an English voice! Return null so modern browsers (Chrome, Edge, Safari)
  // automatically invoke their online multilingual TTS engine for utterance.lang!
  if (primary !== "en") {
    return null;
  }

  // 5. For English, return default voice or first English voice
  const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  return enVoice || voices.find((v) => v.default) || voices[0] || null;
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let sharedAudioElement: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activeBufferSource: AudioBufferSourceNode | null = null;
let activePauseTimer: ReturnType<typeof setTimeout> | null = null;
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

function fallbackToBrowserTTS(
  cleanText: string,
  langToUse: string,
  options: TTSOptions,
  sessionId: number
): void {
  if (!isTTSSupported()) {
    options.onError?.("Speech synthesis is not supported in this browser.");
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

  const detectedLang = detectScriptLanguage(rawTrimmed);
  const rawLang = options.lang || getActiveLanguage();
  const rawPrimary = rawLang.split("-")[0].toLowerCase();

  // If the text itself is clearly in an Indic script (e.g. Kannada, Hindi, Tamil, Bengali),
  // ensure we speak it in that language instead of letting an English voice skip it.
  const langToUse =
    detectedLang && rawPrimary === "en" ? detectedLang : rawLang;
  const primaryLang = (
    detectedLang ? detectedLang.split("-")[0] : langToUse.split("-")[0]
  ).toLowerCase();

  const rawOrFormatted = options.raw
    ? rawTrimmed
    : formatTextForSpeech(rawTrimmed, options.punctuationMode || getPunctuationMode());

  const processedText = normalizeTextForSpeechLang(rawOrFormatted, primaryLang);

  lastSpokenText = rawTrimmed;
  lastSpokenOptions = { ...options, lang: langToUse };

  // For Indic languages (Kannada, Hindi, Tamil, Bengali):
  // Fetch native MP3 audio via /api/tts and play via shared HTMLAudio / Web Audio API
  // so multi-segment speech and async-translated text never fail autoplay or fall back to ASCII spelling.
  if (
    (primaryLang === "kn" || primaryLang === "hi" || primaryLang === "ta" || primaryLang === "bn") &&
    typeof window !== "undefined" &&
    typeof fetch !== "undefined"
  ) {
    const segments = splitSpeechSegmentsWithPauses(processedText, 140);
    let idx = 0;

    const advanceAfterSegment = (seg: SpeechSegment) => {
      if (currentSession !== ttsSessionId) return;
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
      if (currentSession !== ttsSessionId) return;
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
        if (currentSession !== ttsSessionId) return;
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
        const blob = await res.blob();
        if (currentSession !== ttsSessionId) return;
        if (!blob || blob.size < 100) throw new Error("Empty TTS audio");

        // Prefer reusable sharedAudioElement so pause/resume/playbackRate stay simple
        if (typeof Audio !== "undefined") {
          const audio = sharedAudioElement || new Audio();
          sharedAudioElement = audio;
          revokeActiveAudioUrl();
          activeAudioUrl = URL.createObjectURL(blob);
          audio.src = activeAudioUrl;
          audio.playbackRate = options.rate ?? 1.0;
          activeAudioElement = audio;

          audio.onended = () => {
            if (currentSession !== ttsSessionId) return;
            advanceAfterSegment(seg);
          };
          audio.onerror = () => {
            activeAudioElement = null;
            revokeActiveAudioUrl();
            if (currentSession === ttsSessionId) {
              fallbackToBrowserTTS(
                segments.slice(idx).map((s) => s.text).join(" "),
                langToUse,
                options,
                currentSession
              );
            }
          };

          try {
            if (idx === 0) options.onStart?.();
            await audio.play();
            return;
          } catch {
            // Try Web Audio API decodeAudioData when <audio>.play() is blocked after async fetch
            activeAudioElement = null;
            revokeActiveAudioUrl();
            const ctx = getAudioContext();
            if (ctx) {
              const arrayBuf = await blob.arrayBuffer();
              if (currentSession !== ttsSessionId) return;
              const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
              if (currentSession !== ttsSessionId) return;
              const source = ctx.createBufferSource();
              source.buffer = decoded;
              source.playbackRate.value = options.rate ?? 1.0;
              source.connect(ctx.destination);
              activeBufferSource = source;
              source.onended = () => {
                if (activeBufferSource === source) activeBufferSource = null;
                if (currentSession !== ttsSessionId) return;
                advanceAfterSegment(seg);
              };
              if (idx === 0) options.onStart?.();
              source.start(0);
              return;
            }
          }
        }
      } catch {
        // Fallback below
      }

      if (currentSession === ttsSessionId) {
        fallbackToBrowserTTS(
          segments.slice(idx).map((s) => s.text).join(" "),
          langToUse,
          options,
          currentSession
        );
      }
    };

    playNextSegment();
    return;
  }

  fallbackToBrowserTTS(processedText, langToUse, options, currentSession);
}

export function pauseSpeaking(): void {
  if (activeAudioElement && !activeAudioElement.paused) {
    activeAudioElement.pause();
  }
  if (isTTSSupported() && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause();
  }
}

export function resumeSpeaking(): void {
  if (activeAudioElement && activeAudioElement.paused) {
    activeAudioElement.play().catch(() => {});
  }
  if (isTTSSupported() && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
}

export function isSpeechPaused(): boolean {
  return (
    Boolean(activeAudioElement?.paused && activeAudioElement?.currentTime > 0) ||
    (isTTSSupported() && window.speechSynthesis.paused)
  );
}

export function stopSpeaking(): void {
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
