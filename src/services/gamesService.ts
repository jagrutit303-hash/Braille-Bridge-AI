/**
 * Braille Learning Games Service
 * Manages game state, questions, progress tracking, and "Explain My Mistake"
 * dot comparison for:
 * 1. Dot Detective
 * 2. Hear It, Spell It
 * 3. Pattern Builder
 * 4. Memory Practice
 * 5. Language Bridge
 */

import {
  getAlphabetForGame,
  describeBrailleDots,
  compareBrailleDots,
  DotComparison,
  CharacterBrailleItem,
  brailleFromDots,
  BRAILLE_TABLES,
} from "./brailleService";

export type GameType =
  | "dot_detective"
  | "hear_it_spell_it"
  | "pattern_builder"
  | "memory_practice"
  | "language_bridge";

export interface GameScoreState {
  attempts: number;
  correct: number;
  streak: number;
  bestStreak: number;
  history: Array<{
    game: GameType;
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    timestamp: number;
  }>;
}

const STORAGE_KEY = "braillebridge_learning_progress_v1";

export function loadGameProgress(): GameScoreState {
  if (typeof window === "undefined") {
    return { attempts: 0, correct: 0, streak: 0, bestStreak: 0, history: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore storage errors
  }
  return { attempts: 0, correct: 0, streak: 0, bestStreak: 0, history: [] };
}

export function saveGameProgress(state: GameScoreState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function resetGameProgress(): GameScoreState {
  const fresh: GameScoreState = {
    attempts: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    history: [],
  };
  saveGameProgress(fresh);
  return fresh;
}

export interface GameQuestion {
  id: string;
  gameType: GameType;
  prompt: string;
  audioPromptText: string;
  targetChar: string;
  targetBraille: string;
  targetDots: number[];
  options?: string[]; // Multiple choice options if applicable
  hint: string;
  conceptNotes: string;
  language?: string;
  languageBridgeItems?: Array<{
    language: string;
    char: string;
    script: string;
    braille: string;
    dots: number[];
  }>;
}

/**
 * Generate a randomized question for the chosen game type and language table
 */
export function generateQuestion(gameType: GameType, tableId: string = "en-ueb-g1"): GameQuestion {
  const alphabet = getAlphabetForGame(tableId);
  const randomItem = alphabet[Math.floor(Math.random() * alphabet.length)];
  const qId = `${gameType}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  if (gameType === "dot_detective") {
    // Show a Braille cell or dots description, student picks the character
    const distractors = alphabet
      .filter((i) => i.char !== randomItem.char)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map((i) => i.char);

    const options = [randomItem.char, ...distractors].sort(() => 0.5 - Math.random());

    return {
      id: qId,
      gameType,
      prompt: `Identify the character for Braille cell: ${randomItem.braille} (${randomItem.dotDescription})`,
      audioPromptText: `Identify the character for Braille cell with ${randomItem.dotDescription}. Which letter or symbol is it?`,
      targetChar: randomItem.char,
      targetBraille: randomItem.braille,
      targetDots: randomItem.dots,
      options,
      hint: `This character uses ${randomItem.dotDescription}. Think about characters near "${randomItem.char}".`,
      conceptNotes: `Standard 6-dot matrix cell ${randomItem.braille} corresponds to ${randomItem.char} in ${randomItem.language}.`,
      language: randomItem.language,
    };
  }

  if (gameType === "hear_it_spell_it") {
    // Speaks a letter/word, student enters the Braille cell
    return {
      id: qId,
      gameType,
      prompt: `Listen to the spoken character: "${randomItem.char}". Enter the Braille cell using the Perkins simulator or keyboard.`,
      audioPromptText: `Character: ${randomItem.pronunciation || randomItem.char}. Enter its Braille cell.`,
      targetChar: randomItem.char,
      targetBraille: randomItem.braille,
      targetDots: randomItem.dots,
      hint: `The character "${randomItem.char}" uses ${randomItem.dots.length} raised dots.`,
      conceptNotes: `In ${randomItem.language}, "${randomItem.char}" is represented by ${randomItem.dotDescription}.`,
      language: randomItem.language,
    };
  }

  if (gameType === "pattern_builder") {
    // Student toggles dots 1-6 directly to build the exact target cell
    return {
      id: qId,
      gameType,
      prompt: `Build the Braille pattern for: "${randomItem.char}". Toggle dots 1 through 6 until the cell matches.`,
      audioPromptText: `Build the Braille pattern for letter ${randomItem.char}. Toggle dots 1 through 6.`,
      targetChar: randomItem.char,
      targetBraille: randomItem.braille,
      targetDots: randomItem.dots,
      hint: `Hint: It has ${randomItem.dots.length} active dot(s). One of them is Dot ${randomItem.dots[0]}.`,
      conceptNotes: `Dot placement: ${randomItem.dotDescription}.`,
      language: randomItem.language,
    };
  }

  if (gameType === "memory_practice") {
    // Flashcard recall: given character, what are its dots?
    const distractors = [
      describeBrailleDots(brailleFromDots([1, 2])),
      describeBrailleDots(brailleFromDots([1, 4, 5])),
      describeBrailleDots(brailleFromDots([1, 2, 4])),
      describeBrailleDots(brailleFromDots([2, 4, 5])),
    ].filter((d) => d !== randomItem.dotDescription).slice(0, 3);

    const options = [randomItem.dotDescription, ...distractors].sort(() => 0.5 - Math.random());

    return {
      id: qId,
      gameType,
      prompt: `Memory recall: Which dot pattern represents "${randomItem.char}"?`,
      audioPromptText: `Memory recall. Which dot pattern represents "${randomItem.char}"?`,
      targetChar: randomItem.char,
      targetBraille: randomItem.braille,
      targetDots: randomItem.dots,
      options,
      hint: `Think of the Perkins keys. Does it use the left column (dots 1-2-3) or right column (dots 4-5-6)?`,
      conceptNotes: `Standard cell for "${randomItem.char}" is ${randomItem.dotDescription}.`,
      language: randomItem.language,
    };
  }

  // Language Bridge
  // Demonstrates how the same phonetic sound is shared across Indic languages via Bharati Braille!
  const bridgeConcepts = [
    {
      sound: "Velar stop /k/ ('Ka')",
      items: [
        { language: "English (UEB)", char: "K", script: "Latin", braille: "⠅", dots: [1, 3] },
        { language: "Hindi (Bharati)", char: "क", script: "Devanagari", braille: "⠅", dots: [1, 3] },
        { language: "Kannada (Bharati)", char: "ಕ", script: "Kannada", braille: "⠅", dots: [1, 3] },
        { language: "Tamil (Bharati)", char: "க", script: "Tamil", braille: "⠅", dots: [1, 3] },
        { language: "Bengali (Bharati)", char: "ক", script: "Bengali", braille: "⠅", dots: [1, 3] },
      ],
      braille: "⠅",
      dots: [1, 3],
    },
    {
      sound: "Bilabial nasal /m/ ('Ma')",
      items: [
        { language: "English (UEB)", char: "M", script: "Latin", braille: "⠍", dots: [1, 3, 4] },
        { language: "Hindi (Bharati)", char: "म", script: "Devanagari", braille: "⠍", dots: [1, 3, 4] },
        { language: "Kannada (Bharati)", char: "ಮ", script: "Kannada", braille: "⠍", dots: [1, 3, 4] },
        { language: "Tamil (Bharati)", char: "ம", script: "Tamil", braille: "⠍", dots: [1, 3, 4] },
        { language: "Bengali (Bharati)", char: "ম", script: "Bengali", braille: "⠍", dots: [1, 3, 4] },
      ],
      braille: "⠍",
      dots: [1, 3, 4],
    },
    {
      sound: "Alveolar liquid /r/ ('Ra')",
      items: [
        { language: "English (UEB)", char: "R", script: "Latin", braille: "⠗", dots: [1, 2, 3, 5] },
        { language: "Hindi (Bharati)", char: "र", script: "Devanagari", braille: "⠗", dots: [1, 2, 3, 5] },
        { language: "Kannada (Bharati)", char: "ರ", script: "Kannada", braille: "⠗", dots: [1, 2, 3, 5] },
        { language: "Tamil (Bharati)", char: "ர", script: "Tamil", braille: "⠗", dots: [1, 2, 3, 5] },
        { language: "Bengali (Bharati)", char: "র", script: "Bengali", braille: "⠗", dots: [1, 2, 3, 5] },
      ],
      braille: "⠗",
      dots: [1, 2, 3, 5],
    },
    {
      sound: "Vowel open /a/ ('A')",
      items: [
        { language: "English (UEB)", char: "A", script: "Latin", braille: "⠁", dots: [1] },
        { language: "Hindi (Bharati)", char: "अ", script: "Devanagari", braille: "⠁", dots: [1] },
        { language: "Kannada (Bharati)", char: "ಅ", script: "Kannada", braille: "⠁", dots: [1] },
        { language: "Tamil (Bharati)", char: "அ", script: "Tamil", braille: "⠁", dots: [1] },
        { language: "Bengali (Bharati)", char: "অ", script: "Bengali", braille: "⠁", dots: [1] },
      ],
      braille: "⠁",
      dots: [1],
    },
  ];

  const bridge = bridgeConcepts[Math.floor(Math.random() * bridgeConcepts.length)];
  const options = [
    describeBrailleDots(bridge.braille),
    describeBrailleDots(brailleFromDots([1, 2])),
    describeBrailleDots(brailleFromDots([2, 4])),
    describeBrailleDots(brailleFromDots([1, 5])),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);

  return {
    id: qId,
    gameType: "language_bridge",
    prompt: `Language Bridge: Notice how ${bridge.items.map((i) => `${i.char} (${i.language.split(" ")[0]})`).join(", ")} share the same phonetic sound "${bridge.sound}". Which Braille dot configuration represents this sound across all these languages?`,
    audioPromptText: `Language Bridge. How is the sound ${bridge.sound} written in Bharati and Unified English Braille?`,
    targetChar: bridge.sound,
    targetBraille: bridge.braille,
    targetDots: bridge.dots,
    options,
    hint: `Bharati Braille is phonetically unified across Indian languages. The same dots represent this sound in Hindi, Kannada, Tamil, Bengali, and English!`,
    conceptNotes: `Unified phonetic design: ${describeBrailleDots(bridge.braille)} (${bridge.braille}) unifies ${bridge.sound} across Indian scripts.`,
    languageBridgeItems: bridge.items,
  };
}

/**
 * Validate user answer and return "Explain My Mistake" explanation
 */
export function evaluateAnswer(
  question: GameQuestion,
  userAnswer: string
): { isCorrect: boolean; feedback: string; comparison?: DotComparison } {
  const normUser = userAnswer.trim();
  const normTarget = question.targetChar.trim();

  // If question is dot-based or Braille cell based
  if (question.gameType === "pattern_builder" || question.gameType === "hear_it_spell_it") {
    // userAnswer may be a braille char or dot description
    const isCellMatch = normUser === question.targetBraille;
    const comparison = compareBrailleDots(normUser, question.targetBraille, question.targetChar);

    return {
      isCorrect: isCellMatch || comparison.match,
      feedback: comparison.explanation,
      comparison,
    };
  }

  // If user selected an option (Dot Detective, Memory Practice, Language Bridge)
  const isMatch =
    normUser.toLowerCase() === normTarget.toLowerCase() ||
    normUser === question.targetBraille ||
    normUser === describeBrailleDots(question.targetBraille);

  if (isMatch) {
    return {
      isCorrect: true,
      feedback: `Correct! ${question.conceptNotes}`,
    };
  }

  return {
    isCorrect: false,
    feedback: `Not quite. ${question.hint} (Correct answer: ${question.targetChar} / ${describeBrailleDots(question.targetBraille)}).`,
  };
}
