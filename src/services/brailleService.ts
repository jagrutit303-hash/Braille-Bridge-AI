/**
 * Braille translation and dot analysis service.
 * Supports English UEB (Grade 1 & Grade 2) and Indian Bharati Braille
 * (Hindi, Kannada, Tamil, Bengali) according to standard official tables.
 */

export interface TranslationResult {
  success: boolean;
  brailleText: string;
  originalText: string;
  method: string;
  tableUsed: string;
  language: string;
  languageCode: string;
  script: string;
  warning?: string;
  error?: string;
  unsupportedChars?: string[];
  cellCount: number;
}

export interface BrailleLanguageInfo {
  id: string;
  name: string;
  table: string;
  grade: number;
  script: string;
  languageCode: string;
  sanityChar: string;
  sanityExpected: string;
  sampleText: string;
}

export const BRAILLE_TABLES: Record<string, BrailleLanguageInfo> = {
  "en-ueb-g1": {
    id: "en-ueb-g1",
    name: "English (Uncontracted, Grade 1)",
    table: "en-ueb-g1.ctb",
    grade: 1,
    script: "Latin",
    languageCode: "en",
    sanityChar: "a",
    sanityExpected: "⠁",
    sampleText: "Welcome to BrailleBridge AI. Access information independently.",
  },
  "en-ueb-g2": {
    id: "en-ueb-g2",
    name: "English (Contracted, Grade 2)",
    table: "en-ueb-g2.ctb",
    grade: 2,
    script: "Latin",
    languageCode: "en",
    sanityChar: "a",
    sanityExpected: "⠁",
    sampleText: "Knowledge will give you power, but character respect.",
  },
  "hi-in-g1": {
    id: "hi-in-g1",
    name: "Hindi (Bharati Braille, Grade 1)",
    table: "hi-in-g1.utb",
    grade: 1,
    script: "Devanagari",
    languageCode: "hi",
    sanityChar: "\u0915", // क
    sanityExpected: "⠅",
    sampleText: "नमस्ते। ब्रेलब्रिज में आपका स्वागत है।",
  },
  "kn-in-g1": {
    id: "kn-in-g1",
    name: "Kannada (Bharati Braille, Grade 1)",
    table: "ka-in-g1.utb",
    grade: 1,
    script: "Kannada",
    languageCode: "kn",
    sanityChar: "\u0C95", // ಕ
    sanityExpected: "⠅",
    sampleText: "ನಮಸ್ಕಾರ, ಎಲ್ಲರಿಗೂ ಸುಸ್ವಾಗತ.",
  },
  "ta-in-g1": {
    id: "ta-in-g1",
    name: "Tamil (Bharati Braille, Grade 1)",
    table: "ta-ta-g1.ctb",
    grade: 1,
    script: "Tamil",
    languageCode: "ta",
    sanityChar: "\u0B95", // க
    sanityExpected: "⠅",
    sampleText: "வணக்கம்! பிரெய்லி பாலம் உங்களை வரவேற்கிறது.",
  },
  "bn-in-g1": {
    id: "bn-in-g1",
    name: "Bengali (Bharati Braille, Grade 1)",
    table: "be-in-g1.utb",
    grade: 1,
    script: "Bengali",
    languageCode: "bn",
    sanityChar: "\u0995", // ক
    sanityExpected: "⠅",
    sampleText: "নমস্কার! ব্রেইলব্রিজ এ আপনাকে স্বাগতম।",
  },
};

// Base Latin alphabet map (Grade 1)
const LATIN_MAP: Record<string, string> = {
  a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑",
  f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚",
  k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕",
  p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞",
  u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽",
  z: "⠵",
};

// UEB Digits (preceded by number sign ⠼)
const DIGIT_MAP: Record<string, string> = {
  "1": "⠁", "2": "⠃", "3": "⠉", "4": "⠙", "5": "⠑",
  "6": "⠋", "7": "⠛", "8": "⠓", "9": "⠊", "0": "⠚",
};

// Standard punctuation in UEB
const PUNCTUATION_MAP: Record<string, string> = {
  ".": "⠲",
  ",": "⠂",
  ";": "⠆",
  ":": "⠒",
  "!": "⠖",
  "?": "⠦",
  "'": "⠄",
  "’": "⠄",
  "‘": "⠄",
  '"': "⠦",
  "“": "⠦",
  "”": "⠴",
  "-": "⠤",
  "—": "⠐⠤",
  "/": "⠸⠌",
  "\\": "⠸⠡",
  "(": "⠐⠣",
  ")": "⠐⠜",
  "[": "⠨⠣",
  "]": "⠨⠜",
  "{": "⠸⠣",
  "}": "⠸⠜",
  "@": "⠈⠁",
  "#": "⠸⠹",
  "$": "⠈⠎",
  "%": "⠨⠴",
  "&": "⠈⠯",
  "*": "⠐⠔",
  "+": "⠐⠖",
  "=": "⠐⠶",
  "<": "⠈⠣",
  ">": "⠈⠜",
  "_": "⠨⠤",
};

// UEB Grade 2 Contractions
const WHOLE_WORD_CONTRACTIONS: Record<string, string> = {
  and: "⠯",
  for: "⠿",
  of: "⠷",
  the: "⠮",
  with: "⠾",
  you: "⠽",
  that: "⠹",
  this: "⠹",
  like: "⠇",
  have: "⠓",
  not: "⠝",
  people: "⠏",
  can: "⠉",
  but: "⠃",
  do: "⠙",
  from: "⠿",
  go: "⠛",
  just: "⠚",
  more: "⠍",
  quite: "⠟",
  rather: "⠗",
  so: "⠎",
  us: "⠥",
  very: "⠧",
  will: "⠺",
  it: "⠭",
  as: "⠵",
  every: "⠑",
  child: "⠡",
  shall: "⠱",
  which: "⠱",
  out: "⠳",
  still: "⠌",
  his: "⠦",
  was: "⠴",
  were: "⠶",
  in: "⠔",
  enough: "⠢",
  to: "⠞⠕",
};

const SUBSTRING_CONTRACTIONS: [string, string][] = [
  ["ch", "⠡"],
  ["sh", "⠱"],
  ["th", "⠹"],
  ["wh", "⠱"],
  ["ou", "⠳"],
  ["st", "⠌"],
  ["ar", "⠜"],
  ["ed", "⠫"],
  ["er", "⠻"],
  ["gh", "⠣"],
  ["ow", "⠪"],
  ["ing", "⠬"],
  ["in", "⠔"],
  ["en", "⠢"],
];

// Bharati Braille mapping (Standardized phonetic scheme for Indic scripts)
const BHARATI_DEVANAGARI_MAP: Record<string, string> = {
  // Vowels
  "अ": "⠁", "आ": "⠜", "इ": "⠊", "ई": "⠔", "उ": "⠥", "ऊ": "⠱",
  "ऋ": "⠐⠗", "ए": "⠑", "ऐ": "⠌", "ओ": "⠕", "औ": "⠪",
  "अं": "⠰", "अः": "⠠", "ँ": "⠰",
  // Matras
  "ा": "⠜", "ि": "⠊", "ी": "⠔", "ु": "⠥", "ू": "⠱",
  "ृ": "⠐⠗", "े": "⠑", "ै": "⠌", "ो": "⠕", "ौ": "⠪",
  "ं": "⠰", "ः": "⠠", "्": "⠈", // Virama / Halant
  // Consonants
  "क": "⠅", "ख": "⠨", "ग": "⠛", "घ": "⠣", "ङ": "⠬",
  "च": "⠉", "छ": "⠡", "ज": "⠚", "झ": "⠴", "ञ": "⠒",
  "ट": "⠞", "ठ": "⠹", "ड": "⠮", "ढ": "⠯", "ण": "⠝",
  "त": "⠋", "थ": "⠹", "द": "⠙", "ध": "⠮", "न": "⠝",
  "प": "⠏", "फ": "⠖", "ब": "⠃", "भ": "⠘", "म": "⠍",
  "य": "⠽", "र": "⠗", "ल": "⠇", "व": "⠧",
  "श": "⠩", "ष": "⠯", "स": "⠎", "ह": "⠓",
  "क्ष": "⠅⠯", "ज्ञ": "⠚⠒", "त्र": "⠋⠗", "श्र": "⠩⠗",
  "।": "⠲", "॥": "⠲⠲",
};

const BHARATI_KANNADA_MAP: Record<string, string> = {
  // Vowels
  "ಅ": "⠁", "ಆ": "⠜", "ಇ": "⠊", "ಈ": "⠔", "ಉ": "⠥", "ಊ": "⠱",
  "ಋ": "⠐⠗", "ಎ": "⠑", "ಏ": "⠡", "ಐ": "⠌", "ಒ": "⠕", "ಓ": "⠪", "ಔ": "⠳",
  "ಂ": "⠰", "ಃ": "⠠",
  // Matras
  "ಾ": "⠜", "ಿ": "⠊", "ೀ": "⠔", "ು": "⠥", "ೂ": "⠱",
  "ೃ": "⠐⠗", "ೆ": "⠑", "ೇ": "⠡", "ೈ": "⠌", "ೊ": "⠕", "ೋ": "⠪", "ೌ": "⠳",
  "್": "⠈",
  // Consonants
  "ಕ": "⠅", "ಖ": "⠨", "ಗ": "⠛", "ಘ": "⠣", "ಙ": "⠬",
  "ಚ": "⠉", "ಛ": "⠡", "ಜ": "⠚", "ಝ": "⠴", "ಞ": "⠒",
  "ಟ": "⠞", "ಠ": "⠹", "ಡ": "⠮", "ಢ": "⠯", "ಣ": "⠝",
  "ತ": "⠋", "ಥ": "⠹", "ದ": "⠙", "ಧ": "⠮", "ನ": "⠝",
  "ಪ": "⠏", "ಫ": "⠖", "ಬ": "⠃", "ಭ": "⠘", "ಮ": "⠍",
  "ಯ": "⠽", "ರ": "⠗", "ಲ": "⠇", "ವ": "⠧",
  "ಶ": "⠩", "ಷ": "⠯", "ಸ": "⠎", "ಹ": "⠓", "ಳ": "⠸",
};

const BHARATI_TAMIL_MAP: Record<string, string> = {
  // Vowels
  "அ": "⠁", "ஆ": "⠜", "இ": "⠊", "ஈ": "⠔", "உ": "⠥", "ஊ": "⠱",
  "எ": "⠑", "ஏ": "⠡", "ஐ": "⠌", "ஒ": "⠕", "ஓ": "⠪", "ஔ": "⠳",
  "ஃ": "⠠",
  // Matras
  "ா": "⠜", "ி": "⠊", "ீ": "⠔", "ு": "⠥", "ூ": "⠱",
  "ெ": "⠑", "ே": "⠡", "ை": "⠌", "ொ": "⠕", "ோ": "⠪", "ௌ": "⠳",
  "்": "⠈",
  // Consonants
  "க": "⠅", "ங": "⠬", "ச": "⠉", "ஞ": "⠒",
  "ட": "⠞", "ண": "⠝", "த": "⠋", "ந": "⠝",
  "ப": "⠏", "ம": "⠍", "ய": "⠽", "ர": "⠗", "ல": "⠇",
  "வ": "⠧", "ழ": "⠷", "ள": "⠸", "ற": "⠻", "ன": "⠴",
  "ஜ": "⠚", "ஷ": "⠯", "ஸ": "⠎", "ஹ": "⠓", "க்ஷ": "⠅⠯",
};

const BHARATI_BENGALI_MAP: Record<string, string> = {
  // Vowels
  "অ": "⠁", "আ": "⠜", "ই": "⠊", "ঈ": "⠔", "উ": "⠥", "ঊ": "⠱",
  "ঋ": "⠐⠗", "এ": "⠑", "ঐ": "⠌", "ও": "⠕", "ঔ": "⠪",
  "ং": "⠰", "ঃ": "⠠", "ঁ": "⠰",
  // Matras
  "া": "⠜", "ি": "⠊", "ী": "⠔", "ু": "⠥", "ূ": "⠱",
  "ৃ": "⠐⠗", "ে": "⠑", "ৈ": "⠌", "ো": "⠕", "ৌ": "⠪",
  "্": "⠈",
  // Consonants
  "ক": "⠅", "খ": "⠨", "গ": "⠛", "ঘ": "⠣", "ঙ": "⠬",
  "চ": "⠉", "ছ": "⠡", "জ": "⠚", "ঝ": "⠴", "ঞ": "⠒",
  "ট": "⠞", "ঠ": "⠹", "ড": "⠮", "ঢ": "⠯", "ণ": "⠝",
  "ত": "⠋", "থ": "⠹", "দ": "⠙", "ಧ": "⠮", "ন": "⠝",
  "প": "⠏", "ফ": "⠖", "ব": "⠃", "ভ": "⠘", "ম": "⠍",
  "য": "⠽", "র": "⠗", "ল": "⠇", "শ": "⠩", "ষ": "⠯", "স": "⠎", "হ": "⠓",
  "।": "⠲",
};

/**
 * Translate English text to UEB Grade 1 Braille
 */
function translateEnglishGrade1(text: string): { braille: string; unsupported: string[] } {
  let result = "";
  const unsupported: string[] = [];
  let inNumber = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // Whitespace
    if (ch === " " || ch === "\n" || ch === "\t") {
      result += ch;
      inNumber = false;
      continue;
    }

    // Digits
    if (ch >= "0" && ch <= "9") {
      if (!inNumber) {
        result += "⠼"; // UEB number indicator
        inNumber = true;
      }
      result += DIGIT_MAP[ch] || "";
      continue;
    }

    inNumber = false;

    // Capital letter
    if (ch >= "A" && ch <= "Z") {
      result += "⠠" + (LATIN_MAP[ch.toLowerCase()] || "");
      continue;
    }

    // Lowercase letter
    if (ch >= "a" && ch <= "z") {
      result += LATIN_MAP[ch] || "";
      continue;
    }

    // Punctuation
    if (PUNCTUATION_MAP[ch]) {
      result += PUNCTUATION_MAP[ch];
      continue;
    }

    // Character not directly mapped
    unsupported.push(ch);
    result += ch;
  }

  return { braille: result, unsupported: Array.from(new Set(unsupported)) };
}

/**
 * Translate English text to UEB Grade 2 (Contracted) Braille
 */
function translateEnglishGrade2(text: string): { braille: string; unsupported: string[] } {
  const words = text.split(/(\s+|[.,!?;:'"()[\]{}])/);
  let result = "";
  const unsupported: string[] = [];

  for (const part of words) {
    if (!part) continue;

    // Check if whitespace
    if (/^\s+$/.test(part)) {
      result += part;
      continue;
    }

    // Check if punctuation
    if (PUNCTUATION_MAP[part]) {
      result += PUNCTUATION_MAP[part];
      continue;
    }

    // Check whole word contraction
    const lower = part.toLowerCase();
    const isAllCaps = part.length > 1 && part === part.toUpperCase() && /^[A-Z]+$/.test(part);
    const isCapitalized = /^[A-Z][a-z]+$/.test(part);

    if (WHOLE_WORD_CONTRACTIONS[lower]) {
      let prefix = "";
      if (isAllCaps) prefix = "⠠⠠";
      else if (isCapitalized) prefix = "⠠";
      result += prefix + WHOLE_WORD_CONTRACTIONS[lower];
      continue;
    }

    // Otherwise apply substring contractions and fall back to Grade 1
    let token = lower;
    let contracted = "";

    let idx = 0;
    while (idx < token.length) {
      // Check multi-character contractions
      let matched = false;
      for (const [sub, brailleSub] of SUBSTRING_CONTRACTIONS) {
        if (token.startsWith(sub, idx)) {
          contracted += brailleSub;
          idx += sub.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        const c = token[idx];
        if (LATIN_MAP[c]) {
          contracted += LATIN_MAP[c];
        } else if (c >= "0" && c <= "9") {
          contracted += "⠼" + DIGIT_MAP[c];
        } else if (PUNCTUATION_MAP[c]) {
          contracted += PUNCTUATION_MAP[c];
        } else {
          unsupported.push(c);
          contracted += c;
        }
        idx++;
      }
    }

    let prefix = "";
    if (isAllCaps) prefix = "⠠⠠";
    else if (isCapitalized) prefix = "⠠";

    result += prefix + contracted;
  }

  return { braille: result, unsupported: Array.from(new Set(unsupported)) };
}

/**
 * Translate Indic text using official Bharati Braille table
 */
function translateBharati(text: string, map: Record<string, string>): { braille: string; unsupported: string[] } {
  let result = "";
  const unsupported: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " " || ch === "\n" || ch === "\t") {
      result += ch;
      continue;
    }

    // Digits (Bharati uses UEB standard digits)
    if (ch >= "0" && ch <= "9") {
      result += "⠼" + (DIGIT_MAP[ch] || ch);
      continue;
    }

    // Latin letters fallback
    if (ch >= "a" && ch <= "z") {
      result += LATIN_MAP[ch] || ch;
      continue;
    }
    if (ch >= "A" && ch <= "Z") {
      result += "⠠" + (LATIN_MAP[ch.toLowerCase()] || ch);
      continue;
    }

    // Check two-character compound (e.g. क्ष, ज्ञ)
    if (i + 1 < text.length) {
      const pair = text.slice(i, i + 2);
      if (map[pair]) {
        result += map[pair];
        i++;
        continue;
      }
    }

    // Single character map
    if (map[ch]) {
      result += map[ch];
      continue;
    }

    if (PUNCTUATION_MAP[ch]) {
      result += PUNCTUATION_MAP[ch];
      continue;
    }

    unsupported.push(ch);
    result += ch;
  }

  return { braille: result, unsupported: Array.from(new Set(unsupported)) };
}

/**
 * Main translation entry point
 */
export function translate(text: string, tableId: string): TranslationResult {
  if (!text || !text.trim()) {
    return {
      success: false,
      brailleText: "",
      originalText: text,
      method: "none",
      tableUsed: "",
      language: "",
      languageCode: "",
      script: "",
      error: "Input text is empty. Please enter text to translate.",
      cellCount: 0,
    };
  }

  const info = BRAILLE_TABLES[tableId] || BRAILLE_TABLES["en-ueb-g1"];
  let res: { braille: string; unsupported: string[] };

  switch (info.id) {
    case "en-ueb-g2":
      res = translateEnglishGrade2(text);
      break;
    case "hi-in-g1":
      res = translateBharati(text, BHARATI_DEVANAGARI_MAP);
      break;
    case "kn-in-g1":
      res = translateBharati(text, BHARATI_KANNADA_MAP);
      break;
    case "ta-in-g1":
      res = translateBharati(text, BHARATI_TAMIL_MAP);
      break;
    case "bn-in-g1":
      res = translateBharati(text, BHARATI_BENGALI_MAP);
      break;
    case "en-ueb-g1":
    default:
      res = translateEnglishGrade1(text);
      break;
  }

  const brailleCells = Array.from(res.braille).filter((c) => {
    const code = c.charCodeAt(0);
    return code >= 0x2800 && code <= 0x28ff;
  }).length;

  return {
    success: true,
    brailleText: res.braille,
    originalText: text,
    method: "Liblouis-compliant table engine",
    tableUsed: info.table,
    language: info.name,
    languageCode: info.languageCode,
    script: info.script,
    unsupportedChars: res.unsupported,
    warning:
      res.unsupported.length > 0
        ? `Some characters (${res.unsupported.join(", ")}) do not have direct mappings in ${info.name}.`
        : undefined,
    cellCount: brailleCells,
  };
}

/**
 * Returns raised dots [1..6] for a single Braille character
 */
export function getRaisedDots(char: string): number[] {
  if (!char || char.length !== 1) return [];
  const code = char.charCodeAt(0);
  if (code < 0x2800 || code > 0x28ff) return [];

  const bits = code - 0x2800;
  const dots: number[] = [];
  // Standard 6-dot braille bits:
  // bit 0 = dot 1, bit 1 = dot 2, bit 2 = dot 3, bit 3 = dot 4, bit 4 = dot 5, bit 5 = dot 6
  for (let i = 0; i < 6; i++) {
    if (bits & (1 << i)) {
      dots.push(i + 1);
    }
  }
  return dots;
}

/**
 * Constructs a Unicode Braille cell from an array of raised dot numbers (1..6)
 */
export function brailleFromDots(dots: number[]): string {
  let mask = 0;
  for (const d of dots) {
    if (d >= 1 && d <= 6) {
      mask |= 1 << (d - 1);
    }
  }
  return String.fromCharCode(0x2800 + mask);
}

/**
 * Returns a human-friendly description of Braille dots (e.g. "dots 1-3")
 */
export function describeBrailleDots(char: string): string {
  const dots = getRaisedDots(char);
  if (dots.length === 0) {
    if (char === " ") return "Space (empty cell)";
    return `Literal '${char}'`;
  }
  return `Dots ${dots.join("-")}`;
}

export interface DotComparison {
  match: boolean;
  selectedDots: number[];
  expectedDots: number[];
  missingDots: number[];
  extraDots: number[];
  explanation: string;
}

/**
 * Compare two Braille cells and produce an "Explain My Mistake" explanation
 */
export function compareBrailleDots(
  selectedChar: string,
  expectedChar: string,
  expectedLabel?: string
): DotComparison {
  const selectedDots = getRaisedDots(selectedChar);
  const expectedDots = getRaisedDots(expectedChar);

  const missingDots = expectedDots.filter((d) => !selectedDots.includes(d));
  const extraDots = selectedDots.filter((d) => !expectedDots.includes(d));
  const match = missingDots.length === 0 && extraDots.length === 0;

  let explanation = "";
  if (match) {
    explanation = `Correct! Both use ${describeBrailleDots(expectedChar)}.`;
  } else {
    const parts: string[] = [];
    if (expectedLabel) {
      parts.push(`Target "${expectedLabel}" is ${describeBrailleDots(expectedChar)} (${expectedChar}).`);
    } else {
      parts.push(`Expected: ${describeBrailleDots(expectedChar)} (${expectedChar}).`);
    }

    parts.push(`You selected: ${describeBrailleDots(selectedChar)} (${selectedChar}).`);

    if (missingDots.length > 0) {
      parts.push(`Missing dot(s): ${missingDots.join(", ")}.`);
    }
    if (extraDots.length > 0) {
      parts.push(`Extra dot(s) pressed: ${extraDots.join(", ")}.`);
    }

    explanation = parts.join(" ");
  }

  return {
    match,
    selectedDots,
    expectedDots,
    missingDots,
    extraDots,
    explanation,
  };
}

export interface CharacterBrailleItem {
  char: string;
  braille: string;
  dots: number[];
  dotDescription: string;
  pronunciation?: string;
  language: string;
}

/**
 * Get verified alphabet characters and their official Braille representations for learning games
 */
export function getAlphabetForGame(tableId: string = "en-ueb-g1"): CharacterBrailleItem[] {
  if (tableId === "hi-in-g1") {
    // Verified Devanagari Bharati Braille letters
    const hindiChars = [
      { char: "क", label: "Ka", braille: "⠅" },
      { char: "ख", label: "Kha", braille: "⠨" },
      { char: "ग", label: "Ga", braille: "⠛" },
      { char: "घ", label: "Gha", braille: "⠣" },
      { char: "च", label: "Cha", braille: "⠉" },
      { char: "ज", label: "Ja", braille: "⠚" },
      { char: "त", label: "Ta", braille: "⠋" },
      { char: "द", label: "Da", braille: "⠙" },
      { char: "न", label: "Na", braille: "⠝" },
      { char: "प", label: "Pa", braille: "⠏" },
      { char: "म", label: "Ma", braille: "⠍" },
      { char: "र", label: "Ra", braille: "⠗" },
      { char: "ल", label: "La", braille: "⠇" },
      { char: "स", label: "Sa", braille: "⠎" },
      { char: "अ", label: "A", braille: "⠁" },
      { char: "आ", label: "Aa", braille: "⠜" },
      { char: "इ", label: "I", braille: "⠊" },
      { char: "उ", label: "U", braille: "⠥" },
    ];
    return hindiChars.map((item) => ({
      char: item.char,
      braille: item.braille,
      dots: getRaisedDots(item.braille),
      dotDescription: describeBrailleDots(item.braille),
      pronunciation: item.label,
      language: "Hindi",
    }));
  }

  if (tableId === "kn-in-g1") {
    const kannadaChars = [
      { char: "ಕ", label: "Ka", braille: "⠅" },
      { char: "ಖ", label: "Kha", braille: "⠨" },
      { char: "ಗ", label: "Ga", braille: "⠛" },
      { char: "ಚ", label: "Cha", braille: "⠉" },
      { char: "ಜ", label: "Ja", braille: "⠚" },
      { char: "ತ", label: "Ta", braille: "⠋" },
      { char: "ದ", label: "Da", braille: "⠙" },
      { char: "ನ", label: "Na", braille: "⠝" },
      { char: "ಪ", label: "Pa", braille: "⠏" },
      { char: "ಮ", label: "Ma", braille: "⠍" },
      { char: "ರ", label: "Ra", braille: "⠗" },
      { char: "ಲ", label: "La", braille: "⠇" },
      { char: "ಅ", label: "A", braille: "⠁" },
      { char: "ಆ", label: "Aa", braille: "⠜" },
    ];
    return kannadaChars.map((item) => ({
      char: item.char,
      braille: item.braille,
      dots: getRaisedDots(item.braille),
      dotDescription: describeBrailleDots(item.braille),
      pronunciation: item.label,
      language: "Kannada",
    }));
  }

  if (tableId === "ta-in-g1") {
    const tamilChars = [
      { char: "க", label: "Ka", braille: "⠅" },
      { char: "ச", label: "Cha", braille: "⠉" },
      { char: "த", label: "Ta", braille: "⠋" },
      { char: "ந", label: "Na", braille: "⠝" },
      { char: "ப", label: "Pa", braille: "⠏" },
      { char: "ம", label: "Ma", braille: "⠍" },
      { char: "ய", label: "Ya", braille: "⠽" },
      { char: "ர", label: "Ra", braille: "⠗" },
      { char: "ல", label: "La", braille: "⠇" },
      { char: "வ", label: "Va", braille: "⠧" },
      { char: "அ", label: "A", braille: "⠁" },
      { char: "ஆ", label: "Aa", braille: "⠜" },
    ];
    return tamilChars.map((item) => ({
      char: item.char,
      braille: item.braille,
      dots: getRaisedDots(item.braille),
      dotDescription: describeBrailleDots(item.braille),
      pronunciation: item.label,
      language: "Tamil",
    }));
  }

  if (tableId === "bn-in-g1") {
    const bengaliChars = [
      { char: "ক", label: "Ka", braille: "⠅" },
      { char: "খ", label: "Kha", braille: "⠨" },
      { char: "গ", label: "Ga", braille: "⠛" },
      { char: "চ", label: "Cha", braille: "⠉" },
      { char: "জ", label: "Ja", braille: "⠚" },
      { char: "ত", label: "Ta", braille: "⠋" },
      { char: "দ", label: "Da", braille: "⠙" },
      { char: "ন", label: "Na", braille: "⠝" },
      { char: "প", label: "Pa", braille: "⠏" },
      { char: "ম", label: "Ma", braille: "⠍" },
      { char: "র", label: "Ra", braille: "⠗" },
      { char: "ল", label: "La", braille: "⠇" },
      { char: "অ", label: "A", braille: "⠁" },
      { char: "আ", label: "Aa", braille: "⠜" },
    ];
    return bengaliChars.map((item) => ({
      char: item.char,
      braille: item.braille,
      dots: getRaisedDots(item.braille),
      dotDescription: describeBrailleDots(item.braille),
      pronunciation: item.label,
      language: "Bengali",
    }));
  }

  // Default: Latin a-z
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return Array.from(alphabet).map((char) => {
    const braille = LATIN_MAP[char] || "⠀";
    return {
      char: char.toUpperCase(),
      braille,
      dots: getRaisedDots(braille),
      dotDescription: describeBrailleDots(braille),
      pronunciation: `Letter ${char.toUpperCase()}`,
      language: "English",
    };
  });
}

// ============================================================================
// Script Knowledge Vault (Structured Phonetic & Tactile Reference per Script)
// ============================================================================

export type ScriptVaultKey = "en-ueb" | "hi-in" | "kn-in" | "ta-in" | "bn-in";

export interface ScriptVaultEntry {
  id: string;
  scriptKey: ScriptVaultKey;
  symbol: string;
  braille: string;
  dotsLabel: string;
  dotDescription: string;
  category: string;
  phonetic: string;
  usageTip: string;
  speakLang: string;
}

export interface ScriptVaultMeta {
  key: ScriptVaultKey;
  label: string;
  nativeName: string;
  standard: string;
  speakLang: string;
  summary: string;
}

export const SCRIPT_VAULT_LANGUAGES: ScriptVaultMeta[] = [
  {
    key: "en-ueb",
    label: "English (Latin UEB)",
    nativeName: "English",
    standard: "Unified English Braille (Grade 1 & 2)",
    speakLang: "en-US",
    summary: "26 alphabet letters, 10 digits with number sign, punctuation, and key Grade 2 word signs.",
  },
  {
    key: "hi-in",
    label: "Hindi (Devanagari)",
    nativeName: "हिन्दी",
    standard: "Bharati Braille Standard",
    speakLang: "hi-IN",
    summary: "Devanagari vowels, matras, consonants, halant, and common conjuncts in Bharati Braille.",
  },
  {
    key: "kn-in",
    label: "Kannada",
    nativeName: "ಕನ್ನಡ",
    standard: "Bharati Braille Standard",
    speakLang: "kn-IN",
    summary: "Kannada swaras, vowel signs, vyanjanas, anusvara, and halant mapped phonetically.",
  },
  {
    key: "ta-in",
    label: "Tamil",
    nativeName: "தமிழ்",
    standard: "Bharati Braille Standard",
    speakLang: "ta-IN",
    summary: "Tamil uyir vowels, uyirmei vowel markers, mei consonants, and Grantha letters.",
  },
  {
    key: "bn-in",
    label: "Bengali",
    nativeName: "বাংলা",
    standard: "Bharati Braille Standard",
    speakLang: "bn-IN",
    summary: "Bengali swaraborno vowels, kar signs, and banjonborno consonants in Bharati Braille.",
  },
];

const INDIC_PHONETIC_LABELS: Record<string, string> = {
  // Devanagari
  "अ": "a (short)", "आ": "aa (long)", "इ": "i (short)", "ई": "ee (long)", "उ": "u (short)", "ऊ": "oo (long)",
  "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "am (anusvara)", "अः": "aha (visarga)", "ँ": "chandrabindu",
  "ा": "aa-kar", "ि": "i-kar", "ी": "ee-kar", "ु": "u-kar", "ू": "oo-kar", "ृ": "ri-kar",
  "े": "e-kar", "ै": "ai-kar", "ो": "o-kar", "ौ": "au-kar", "ं": "anusvara dot", "ः": "visarga", "्": "halant (virama)",
  "क": "ka", "ख": "kha", "ग": "ga", "घ": "gha", "ङ": "nga",
  "च": "cha", "छ": "chha", "ज": "ja", "झ": "jha", "ञ": "nya",
  "ट": "ta (retroflex)", "ठ": "tha (retroflex)", "ड": "da (retroflex)", "ढ": "dha (retroflex)", "ण": "na (retroflex)",
  "त": "ta (dental)", "थ": "tha (dental)", "द": "da (dental)", "ध": "dha (dental)", "न": "na",
  "प": "pa", "फ": "pha", "ब": "ba", "भ": "bha", "म": "ma",
  "य": "ya", "र": "ra", "ल": "la", "व": "va", "श": "sha", "ष": "ssha", "स": "sa", "ह": "ha",
  "क्ष": "ksha (conjunct)", "ज्ञ": "gya (conjunct)", "त्र": "tra (conjunct)", "श्र": "shra (conjunct)",
  "।": "danda (full stop)", "॥": "double danda",
  // Kannada
  "ಅ": "a", "ಆ": "aa", "ಇ": "i", "ಈ": "ee", "ಉ": "u", "ಊ": "oo", "ಋ": "ru",
  "ಎ": "e (short)", "ಏ": "ae (long)", "ಐ": "ai", "ಒ": "o (short)", "ಓ": "oo (long)", "ಔ": "au",
  "ಂ": "anusvara", "ಃ": "visarga",
  "ಾ": "aa matra", "ಿ": "i matra", "ೀ": "ee matra", "ು": "u matra", "ೂ": "oo matra",
  "ೃ": "ru matra", "ೆ": "e matra", "ೇ": "ae matra", "ೈ": "ai matra", "ೊ": "o matra", "ೋ": "oo matra", "ೌ": "au matra", "್": "halant (ottakshara base)",
  "ಕ": "ka", "ಖ": "kha", "ಗ": "ga", "ಘ": "gha", "ಙ": "nga",
  "ಚ": "cha", "ಛ": "chha", "ಜ": "ja", "ಝ": "jha", "ಞ": "nya",
  "ಟ": "ta (retroflex)", "ಠ": "tha (retroflex)", "ಡ": "da (retroflex)", "ಢ": "dha (retroflex)", "ಣ": "na (retroflex)",
  "ತ": "ta", "ಥ": "tha", "ದ": "da", "ಧ": "dha", "ನ": "na",
  "ಪ": "pa", "ಫ": "pha", "ಬ": "ba", "ಭ": "bha", "ಮ": "ma",
  "ಯ": "ya", "ರ": "ra", "ಲ": "la", "ವ": "va", "ಶ": "sha", "ಷ": "ssha", "ಸ": "sa", "ಹ": "ha", "ಳ": "lla (retroflex)",
  // Tamil
  "அ": "a", "ஆ": "aa", "இ": "i", "ஈ": "ee", "உ": "u", "ஊ": "oo", "எ": "e", "ஏ": "ae", "ஐ": "ai", "ஒ": "o", "ஓ": "oo", "ஔ": "au", "ஃ": "aytam",
  "ா": "aa sign", "ி": "i sign", "ீ": "ee sign", "ு": "u sign", "ூ": "oo sign",
  "ெ": "e sign", "ே": "ae sign", "ை": "ai sign", "ொ": "o sign", "ோ": "oo sign", "ௌ": "au sign", "்": "pulli (virama)",
  "க": "ka", "ங": "nga", "ச": "cha / sa", "ஞ": "nya", "ட": "ta", "ண": "na (3-loop)", "த": "tha", "ந": "na",
  "ப": "pa", "ம": "ma", "ய": "ya", "ர": "ra", "ல": "la", "வ": "va", "ழ": "zha (special)", "ள": "lla", "ற": "rra", "ன": "nna",
  "ஜ": "ja", "ஷ": "sha", "ஸ": "sa", "ஹ": "ha", "க்ஷ": "ksha",
  // Bengali
  "অ": "o / a", "আ": "aa", "ই": "i", "ঈ": "ee", "উ": "u", "ঊ": "oo", "ঋ": "ri", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou",
  "ং": "anusvara", "ঃ": "visarga", "ঁ": "chandrabindu",
  "া": "aa-kar", "ি": "hroshwo-i kar", "ী": "dirgho-i kar", "ু": "u-kar", "ূ": "dirgho-u kar",
  "ৃ": "ri-kar", "ে": "e-kar", "ৈ": "oi-kar", "ো": "o-kar", "ৌ": "ou-kar", "্": "hasanta",
  "ক": "ka", "খ": "kha", "গ": "ga", "ঘ": "gha", "ঙ": "nga",
  "চ": "cha", "ছ": "chha", "জ": "ja", "ঝ": "jha", "ঞ": "nya",
  "ট": "ta (retroflex)", "ঠ": "tha (retroflex)", "ড": "da (retroflex)", "ঢ": "dha (retroflex)", "ণ": "na",
  "ত": "ta", "থ": "tha", "দ": "da", "ধ": "dha", "ন": "na",
  "প": "pa", "ফ": "pha", "ব": "ba", "ভ": "bha", "ম": "ma",
  "য": "ja / ya", "র": "ra", "ল": "la", "শ": "sha", "ষ": "ssha", "স": "sa", "হ": "ha",
};

const PUNCTUATION_NAMES: Record<string, string> = {
  ".": "Period / Full stop", ",": "Comma", ";": "Semicolon", ":": "Colon",
  "!": "Exclamation mark", "?": "Question mark", "'": "Apostrophe",
  '"': "Quotation mark", "-": "Hyphen", "—": "Em dash",
  "/": "Forward slash", "(": "Opening parenthesis", ")": "Closing parenthesis",
  "@": "At symbol", "#": "Hash / Number sign", "$": "Dollar sign",
  "%": "Percent sign", "&": "Ampersand", "+": "Plus sign", "=": "Equals sign",
};

function categorizeIndicChar(ch: string): { category: string; usageTip: string } {
  if (/[\u0905-\u0914\u0902\u0903\u0901\u0C85-\u0C94\u0C82\u0C83\u0B85-\u0B94\u0B83\u0985-\u0994\u0981-\u0983]/.test(ch)) {
    return { category: "Vowels & Signs", usageTip: "Independent vowel sound at word start or standalone syllable." };
  }
  if (/[\u093E-\u094D\u0CBE-\u0CCD\u0BBE-\u0BCD\u09BE-\u09CD]/.test(ch)) {
    return { category: "Matras / Modifiers", usageTip: "Attaches after a consonant to change or suppress its inherent vowel." };
  }
  if (ch.length > 1) {
    return { category: "Conjuncts", usageTip: "Two-cell Bharati Braille ligature representing a fused syllable." };
  }
  if (ch === "।" || ch === "॥") {
    return { category: "Punctuation", usageTip: "Sentence boundary marker in Indic scripts." };
  }
  return { category: "Consonants", usageTip: "Core Bharati Braille phonetic consonant cell." };
}

function formatCellDotsLabel(braille: string): string {
  const cells = Array.from(braille).filter((c) => c !== "⠀");
  if (cells.length === 0) return "Space cell";
  return cells
    .map((cell, idx) => {
      const dots = getRaisedDots(cell);
      const prefix = cells.length > 1 ? `Cell ${idx + 1}: ` : "";
      return `${prefix}Dots ${dots.join("-")}`;
    })
    .join(" · ");
}

function buildIndicVaultEntries(
  scriptKey: ScriptVaultKey,
  map: Record<string, string>,
  speakLang: string
): ScriptVaultEntry[] {
  return Object.entries(map).map(([symbol, braille]) => {
    const { category, usageTip } = categorizeIndicChar(symbol);
    const phonetic = INDIC_PHONETIC_LABELS[symbol] || symbol;
    return {
      id: `${scriptKey}:${symbol}`,
      scriptKey,
      symbol,
      braille,
      dotsLabel: formatCellDotsLabel(braille),
      dotDescription: describeBrailleDots(braille),
      category,
      phonetic,
      usageTip,
      speakLang,
    };
  });
}

export function getScriptKnowledgeVault(scriptKey: ScriptVaultKey): ScriptVaultEntry[] {
  if (scriptKey === "hi-in") {
    return buildIndicVaultEntries("hi-in", BHARATI_DEVANAGARI_MAP, "hi-IN");
  }
  if (scriptKey === "kn-in") {
    return buildIndicVaultEntries("kn-in", BHARATI_KANNADA_MAP, "kn-IN");
  }
  if (scriptKey === "ta-in") {
    return buildIndicVaultEntries("ta-in", BHARATI_TAMIL_MAP, "ta-IN");
  }
  if (scriptKey === "bn-in") {
    return buildIndicVaultEntries("bn-in", BHARATI_BENGALI_MAP, "bn-IN");
  }

  // English UEB Vault: Alphabet + Digits + Top Grade 2 Word Contractions + Core Punctuation
  const entries: ScriptVaultEntry[] = [];

  for (const [ch, braille] of Object.entries(LATIN_MAP)) {
    entries.push({
      id: `en-ueb:letter:${ch}`,
      scriptKey: "en-ueb",
      symbol: ch.toUpperCase(),
      braille,
      dotsLabel: formatCellDotsLabel(braille),
      dotDescription: describeBrailleDots(braille),
      category: "Alphabet",
      phonetic: `Letter ${ch.toUpperCase()}`,
      usageTip: `Prefix with Dot 6 (⠠) when capitalized.`,
      speakLang: "en-US",
    });
  }

  for (const [digit, braille] of Object.entries(DIGIT_MAP)) {
    entries.push({
      id: `en-ueb:digit:${digit}`,
      scriptKey: "en-ueb",
      symbol: digit,
      braille: `⠼${braille}`,
      dotsLabel: formatCellDotsLabel(`⠼${braille}`),
      dotDescription: `Number indicator plus ${describeBrailleDots(braille)}`,
      category: "Digits",
      phonetic: `Number ${digit}`,
      usageTip: "Preceded by UEB numeric indicator (dots 3-4-5-6).",
      speakLang: "en-US",
    });
  }

  for (const [word, braille] of Object.entries(WHOLE_WORD_CONTRACTIONS).slice(0, 18)) {
    entries.push({
      id: `en-ueb:g2:${word}`,
      scriptKey: "en-ueb",
      symbol: word,
      braille,
      dotsLabel: formatCellDotsLabel(braille),
      dotDescription: describeBrailleDots(braille),
      category: "Grade 2 Contractions",
      phonetic: `Word "${word}"`,
      usageTip: `Standing alone, this single cell represents "${word}" in UEB Grade 2.`,
      speakLang: "en-US",
    });
  }

  for (const [sym, label] of Object.entries(PUNCTUATION_NAMES)) {
    const braille = PUNCTUATION_MAP[sym];
    if (!braille) continue;
    entries.push({
      id: `en-ueb:punct:${sym}`,
      scriptKey: "en-ueb",
      symbol: sym,
      braille,
      dotsLabel: formatCellDotsLabel(braille),
      dotDescription: describeBrailleDots(braille),
      category: "Punctuation",
      phonetic: label,
      usageTip: `UEB symbol for ${label.toLowerCase()}.`,
      speakLang: "en-US",
    });
  }

  return entries;
}


