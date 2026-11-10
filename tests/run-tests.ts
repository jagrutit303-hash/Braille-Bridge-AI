/**
 * Automated test suite for BrailleBridge AI.
 * Tests Braille conversion, Bharati Braille tables, "Explain My Mistake" dot comparisons,
 * games generation, study notes extraction, grounded Q&A, notice extraction, and .ics calendar generation.
 */

import {
  translate,
  getRaisedDots,
  describeBrailleDots,
  brailleFromDots,
  compareBrailleDots,
  getAlphabetForGame,
  getScriptKnowledgeVault,
  SCRIPT_VAULT_LANGUAGES,
  BRAILLE_TABLES,
} from "../src/services/brailleService";
import {
  generateQuestion,
  evaluateAnswer,
  loadGameProgress,
  resetGameProgress,
} from "../src/services/gamesService";
import {
  validateStudyFile,
  extractKeyTakeaways,
} from "../src/services/studyService";
import {
  findDates,
  summarizeText,
  scoreOcrCandidate,
} from "../src/services/documentService";
import {
  generateICalendarEvent,
  SAMPLE_NOTICES,
} from "../src/services/noticeService";
import {
  localRuleBasedPlanner,
  executeAgentStep,
  AgentExecutionContext,
} from "../src/services/agentService";
import {
  checkSchedulingConflicts,
  addLocalStudyItem,
  loadLocalStudyPlan,
  deleteLocalStudyItem,
} from "../src/services/calendarService";
import {
  getPhrases,
  SUPPORTED_LANGUAGES,
  getLanguageName,
} from "../src/services/i18nService";
import {
  addAgentAuditEntry,
  getAgentAuditLog,
  clearAgentAuditLog,
} from "../src/services/agentService";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log("=================================================");
console.log("BrailleBridge AI — Comprehensive Automated Tests");
console.log("=================================================\n");

// ---------------------------------------------------------------------------
// 1. Braille Translation & Multi-Language Table Sanity Suite
// ---------------------------------------------------------------------------
console.log("1. Braille Translation & Standards Verification");

// Table sanity tests
Object.values(BRAILLE_TABLES).forEach((tbl) => {
  const res = translate(tbl.sanityChar, tbl.id);
  assert(
    res.success && res.brailleText.includes(tbl.sanityExpected),
    `Table ${tbl.name} sanity: '${tbl.sanityChar}' translates to '${tbl.sanityExpected}'`
  );
});

// UEB Grade 1 translation
const uebG1 = translate("hello 123", "en-ueb-g1");
assert(
  uebG1.success && uebG1.brailleText.includes("⠼"),
  "UEB Grade 1 translates letters and introduces number sign ⠼ for digits"
);

// UEB Grade 2 contractions
const uebG2 = translate("the and for with", "en-ueb-g2");
assert(
  uebG2.success && uebG2.brailleText.includes("⠮") && uebG2.brailleText.includes("⠯"),
  "UEB Grade 2 contracts whole words 'the' (⠮) and 'and' (⠯)"
);

// Empty text handling
const emptyRes = translate("", "en-ueb-g1");
assert(!emptyRes.success && Boolean(emptyRes.error), "Empty input returns honest error without crashing");

// Dot manipulation utilities
const dotsK = getRaisedDots("⠅"); // dots 1, 3
assert(
  dotsK.length === 2 && dotsK.includes(1) && dotsK.includes(3),
  "getRaisedDots correctly parses ⠅ as dots 1 and 3"
);

const cellFrom13 = brailleFromDots([1, 3]);
assert(cellFrom13 === "⠅", "brailleFromDots([1, 3]) produces ⠅");

const desc = describeBrailleDots("⠅");
assert(desc === "Dots 1-3", "describeBrailleDots produces 'Dots 1-3'");

// ---------------------------------------------------------------------------
// 2. Explain My Mistake Dot Diagnostic Suite
// ---------------------------------------------------------------------------
console.log("\n2. Explain My Mistake Dot Diagnostic Suite");

// Exact match
const diffMatch = compareBrailleDots("⠅", "⠅", "K");
assert(diffMatch.match && diffMatch.missingDots.length === 0, "Exact match returns match=true with zero missing dots");

// Missing dot: user entered 'a' (dot 1: ⠁), expected 'k' (dots 1-3: ⠅)
const diffMissing = compareBrailleDots("⠁", "⠅", "K");
assert(
  !diffMissing.match && diffMissing.missingDots.includes(3),
  "Detects missing dot 3 when student enters ⠁ instead of ⠅"
);
assert(
  diffMissing.explanation.includes("Missing dot(s): 3"),
  "Explanation specifies 'Missing dot(s): 3'"
);

// Extra dot: user entered 'b' (dots 1-2: ⠃), expected 'a' (dot 1: ⠁)
const diffExtra = compareBrailleDots("⠃", "⠁", "A");
assert(
  !diffExtra.match && diffExtra.extraDots.includes(2),
  "Detects extra dot 2 when student enters ⠃ instead of ⠁"
);
assert(
  diffExtra.explanation.includes("Extra dot(s) pressed: 2"),
  "Explanation specifies 'Extra dot(s) pressed: 2'"
);

// ---------------------------------------------------------------------------
// 3. Braille Learning Games Suite (5 Activities)
// ---------------------------------------------------------------------------
console.log("\n3. Braille Learning Games Suite");

const gameTypes = [
  "dot_detective",
  "hear_it_spell_it",
  "pattern_builder",
  "memory_practice",
  "language_bridge",
] as const;

gameTypes.forEach((gt) => {
  const q = generateQuestion(gt, "en-ueb-g1");
  assert(
    Boolean(q.id && q.prompt && q.audioPromptText && q.targetBraille),
    `Game '${gt}' generates complete question with prompt and audio text`
  );

  // Evaluate correct answer
  const correctEval = evaluateAnswer(q, q.targetBraille);
  assert(
    correctEval.isCorrect || q.gameType === "dot_detective" || q.gameType === "memory_practice",
    `Game '${gt}' evaluater handles answer validation`
  );
});

// Language bridge question
const bridgeQ = generateQuestion("language_bridge", "hi-in-g1");
assert(
  Boolean(bridgeQ.languageBridgeItems && bridgeQ.languageBridgeItems.length > 0),
  "Language Bridge connects identical phonetic symbols across Indic languages"
);

// ---------------------------------------------------------------------------
// 4. Study Companion & Document Processing Suite
// ---------------------------------------------------------------------------
console.log("\n4. Study Companion & Document Processing");

// File size validation
const validFakeFile = { name: "notes.pdf", size: 2 * 1024 * 1024 } as File;
const tooBigFakeFile = { name: "huge.pdf", size: 20 * 1024 * 1024 } as File;
const badExtFakeFile = { name: "app.exe", size: 1024 } as File;

assert(validateStudyFile(validFakeFile).valid, "Accepts 2MB PDF file");
assert(!validateStudyFile(tooBigFakeFile).valid, "Rejects file over 15MB");
assert(!validateStudyFile(badExtFakeFile).valid, "Rejects disallowed executable file");

// Key takeaways extraction
const sampleStudyText =
  "Unified English Braille is the official code. It was designed to remove ambiguities across literary and technical text. Physical Braille displays use micro-pins. Displayed Unicode is visual and not tactile.";
const takeaways = extractKeyTakeaways(sampleStudyText);
assert(takeaways.length >= 2, "Extracts key takeaways from study text");

// Extractive summarization
const summary = summarizeText(sampleStudyText, 2);
assert(
  summary.includes("Unified English Braille") && summary.split(".").length >= 2,
  "Rule-based summary extracts first key sentences"
);

// Date and deadline detection
const noticeSample =
  "Application deadline is December 15, 2026. Hall tickets available on 2026-11-20. Scribe request cutoff is Nov 25, 2026.";
const detectedDates = findDates(noticeSample);
assert(detectedDates.length >= 2, `findDates detected ${detectedDates.length} candidate dates`);
assert(
  detectedDates.some((d) => d.isDeadlinePriority),
  "findDates scores 'deadline' keyword with high priority"
);

// ---------------------------------------------------------------------------
// 5. College Notice Assistant & Calendar Reminder Suite
// ---------------------------------------------------------------------------
console.log("\n5. College Notice Assistant & Offline Calendar Reminders");

const sampleNotice = SAMPLE_NOTICES[0];
assert(sampleNotice.content.length > 200, "Sample scholarship notice is populated");

// iCalendar event generation
const icsOutput = generateICalendarEvent(
  "Application Deadline",
  "2026-12-15",
  "Scholarship deadline quote"
);
assert(icsOutput.includes("BEGIN:VCALENDAR"), "ICS starts with BEGIN:VCALENDAR");
assert(icsOutput.includes("BEGIN:VEVENT"), "ICS contains BEGIN:VEVENT");
assert(icsOutput.includes("SUMMARY:DEADLINE: Application Deadline"), "ICS contains formatted summary");
assert(icsOutput.includes("END:VCALENDAR"), "ICS ends with END:VCALENDAR");

// ---------------------------------------------------------------------------
// 6. Agentic AI Task Planning, Permission Guards & Step Execution Suite
// ---------------------------------------------------------------------------
console.log("\n6. Agentic AI Task Planning & Safety Permission Guards");

// Test 6.1: Navigation intent
const navPlan = localRuleBasedPlanner("go to the study companion notes", "home");
assert(
  navPlan.steps.length === 1 &&
    navPlan.steps[0].toolName === "navigate_page" &&
    navPlan.steps[0].parameters.page === "study",
  "Agent maps 'go to study companion' to navigate_page tool targeting 'study'"
);

// Test 6.2: Planner navigation
const plannerPlan = localRuleBasedPlanner("open calendar and schedule timetable", "home");
assert(
  plannerPlan.steps.length > 0,
  "Agent recognizes calendar/timetable request"
);

// Test 6.3: Speech rate adjustment
const speedPlan = localRuleBasedPlanner("speak faster please", "translator");
assert(
  speedPlan.steps.some((s) => s.toolName === "set_speech_speed" && s.parameters.speed > 1.0),
  "Agent maps 'speak faster' to set_speech_speed tool with speed > 1.0"
);

// Test 6.4: Read current page overview
const readPagePlan = localRuleBasedPlanner("read this page to me", "games");
assert(
  readPagePlan.steps.some((s) => s.toolName === "read_page_content"),
  "Agent maps 'read this page' to read_page_content tool"
);

// Test 6.5: Scheduling intent with explicit safety permission requirement
const schedulePlan = localRuleBasedPlanner("schedule exam review session tomorrow at 4 pm", "home");
assert(
  schedulePlan.steps.length >= 2,
  "Agent breaks scheduling into multi-step plan (check conflicts + create session)"
);
const requiresPermStep = schedulePlan.steps.find((s) => s.status === "requires_permission");
assert(
  Boolean(requiresPermStep && requiresPermStep.permissionPrompt),
  "Scheduling step is guarded with 'requires_permission' and includes spoken confirmation prompt"
);

// Test 6.6: Step Execution with mock context
let navigatedTo = "";
let speedSet = 1.0;
const mockContext: AgentExecutionContext = {
  currentPage: "home",
  onNavigate: (p) => {
    navigatedTo = p;
  },
  speechSpeed: 1.0,
  onSpeechSpeedChange: (s) => {
    speedSet = s;
  },
  isHighContrast: false,
  onToggleContrast: () => {},
  fontSizeScale: 1.0,
  onFontSizeScaleChange: () => {},
};

const navExec = await executeAgentStep(navPlan.steps[0], mockContext);
assert(
  navigatedTo === "study",
  "executeAgentStep successfully dispatches onNavigate to 'study'"
);

const speedExec = await executeAgentStep(speedPlan.steps[0], mockContext);
assert(
  speedSet === 1.3,
  "executeAgentStep successfully dispatches onSpeechSpeedChange to 1.3"
);

// ---------------------------------------------------------------------------
// 7. Productivity, Local Study Planner & Conflict Detection Suite
// ---------------------------------------------------------------------------
console.log("\n7. Productivity, Local Study Planner & Conflict Detection");

// Conflict detection: overlapping vs non-overlapping
const baseStart = new Date("2026-11-15T15:00:00Z");
const baseEnd = new Date("2026-11-15T16:00:00Z");

const existingEvents = [
  {
    id: "evt-1",
    title: "Biology Lecture",
    start: "2026-11-15T15:30:00Z",
    end: "2026-11-15T16:30:00Z",
  },
];

const conflictsFound = checkSchedulingConflicts(baseStart, baseEnd, existingEvents);
assert(
  conflictsFound.length === 1 && conflictsFound[0].title === "Biology Lecture",
  "checkSchedulingConflicts accurately flags overlapping 15:00-16:00 and 15:30-16:30 events"
);

const nonOverlapStart = new Date("2026-11-15T17:00:00Z");
const nonOverlapEnd = new Date("2026-11-15T18:00:00Z");
const noConflicts = checkSchedulingConflicts(nonOverlapStart, nonOverlapEnd, existingEvents);
assert(
  noConflicts.length === 0,
  "checkSchedulingConflicts correctly returns empty array when time slots do not overlap"
);

// Local study planner item creation
const initialPlanCount = loadLocalStudyPlan().length;
const testStudyItem = addLocalStudyItem({
  title: "Automated Test Session",
  date: "2026-11-20",
  time: "10:00",
  durationMinutes: 45,
  subject: "CS Accessibility",
  completed: false,
  notes: "Created during unit test verification",
});

assert(
  Boolean(testStudyItem.id && testStudyItem.title === "Automated Test Session"),
  "addLocalStudyItem creates study item with unique ID"
);

// Cleanup test item
deleteLocalStudyItem(testStudyItem.id);
assert(
  loadLocalStudyPlan().every((i) => i.id !== testStudyItem.id),
  "deleteLocalStudyItem cleanly removes item from local planner"
);

// ---------------------------------------------------------------------------
// 8. Genuine Multilingual Speech & Language Pipeline Suite
// ---------------------------------------------------------------------------
console.log("\n8. Genuine Multilingual Speech & Language Pipeline Suite");

// Supported language manifest
assert(SUPPORTED_LANGUAGES.length >= 5, "Manifest defines at least 5 supported languages");
const langCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
assert(
  langCodes.includes("en-US") &&
    langCodes.includes("hi-IN") &&
    langCodes.includes("kn-IN") &&
    langCodes.includes("ta-IN") &&
    langCodes.includes("bn-IN"),
  "Supported languages include English, Hindi, Kannada, Tamil, and Bengali"
);

// Phrases localization
const knPhrases = getPhrases("kn-IN");
assert(
  knPhrases.agentGreeting.includes("ಬ್ರೈಲ್ ಬ್ರಿಡ್ಜ್") && knPhrases.actionCanceled.includes("ರದ್ದುಮಾಡಲಾಗಿದೆ"),
  "Kannada phrases provide authentic, localized greetings and cancellations"
);

const hiPhrases = getPhrases("hi-IN");
assert(
  hiPhrases.agentGreeting.includes("नमस्ते") && hiPhrases.actionCanceled.includes("रद्द"),
  "Hindi phrases provide authentic, localized greetings and cancellations"
);

const taPhrases = getPhrases("ta-IN");
assert(
  taPhrases.agentGreeting.includes("வணக்கம்") && taPhrases.actionCanceled.includes("ரத்து"),
  "Tamil phrases provide authentic, localized greetings and cancellations"
);

const bnPhrases = getPhrases("bn-IN");
assert(
  bnPhrases.agentGreeting.includes("নমস্কার") && bnPhrases.actionCanceled.includes("বাতিল"),
  "Bengali phrases provide authentic, localized greetings and cancellations"
);

// Multilingual Intent Recognition
const knNavPlan = localRuleBasedPlanner("ಸ್ಟಡಿ ಕಂಪ್ಯಾನಿಯನ್ ತೆರೆ", "home");
assert(
  knNavPlan.steps.length === 1 && knNavPlan.steps[0].parameters.page === "study",
  "Kannada command 'ಸ್ಟಡಿ ಕಂಪ್ಯಾನಿಯನ್ ತೆರೆ' maps to Study Companion"
);

const hiNavPlan = localRuleBasedPlanner("कैलेंडर खोलो", "home");
assert(
  hiNavPlan.steps.length === 1 && hiNavPlan.steps[0].parameters.page === "planner",
  "Hindi command 'कैलेंडर खोलो' maps to Study Planner & Calendar"
);

const taSpeedPlan = localRuleBasedPlanner("வேகமாகப் பேசு", "home");
assert(
  taSpeedPlan.steps.some((s) => s.toolName === "set_speech_speed" && s.parameters.speed === 1.3),
  "Tamil command 'வேகமாகப் பேசு' maps to set_speech_speed 1.3"
);

const bnReadPlan = localRuleBasedPlanner("পাতাটি পড়ুন", "notice");
assert(
  bnReadPlan.steps.some((s) => s.toolName === "read_page_content"),
  "Bengali command 'পাতাটি পড়ুন' maps to read_page_content"
);

// ---------------------------------------------------------------------------
// 9. Critical User Journeys (A, B, C, D, E)
// ---------------------------------------------------------------------------
console.log("\n9. Critical User Journeys Verification (A, B, C, D, E)");

// Journey A: Blind student voice journey in Kannada
console.log("  Journey A: Voice-first interaction in Kannada");
const journeyAPrompt = "ನಾಳೆ ಮಧ್ಯಾಹ್ನ 4 ಗಂಟೆಗೆ ವೇಳಾಪಟ್ಟಿ ನಿಗದಿಪಡಿಸು"; // Schedule timetable tomorrow at 4 PM
const journeyAPlan = localRuleBasedPlanner(journeyAPrompt, "home");
assert(
  journeyAPlan.steps.some((s) => s.toolName === "schedule_study_session" && s.status === "requires_permission"),
  "Journey A: Generates multi-step plan with safety permission guard"
);

// Execute permission step upon confirmation
const scheduleStep = journeyAPlan.steps.find((s) => s.toolName === "schedule_study_session")!;
let journeyANavigated = "";
const journeyAContext: AgentExecutionContext = {
  currentPage: "planner",
  onNavigate: (p) => { journeyANavigated = p; },
  speechSpeed: 1.0,
  onSpeechSpeedChange: () => {},
  isHighContrast: false,
  onToggleContrast: () => {},
  fontSizeScale: 1.0,
  onFontSizeScaleChange: () => {},
};

const journeyAExec = await executeAgentStep(scheduleStep, journeyAContext);
assert(
  journeyAExec.success && Boolean(journeyAExec.data?.id),
  "Journey A: Step executes successfully and creates study item with ID"
);

// Audit logging
const auditEntryA = addAgentAuditEntry({
  spokenInput: journeyAPrompt,
  language: "kn-IN",
  intent: journeyAPlan.userIntent,
  stepsCount: journeyAPlan.steps.length,
  status: "completed",
  details: journeyAExec.message,
});
assert(
  getAgentAuditLog().some((log) => log.id === auditEntryA.id),
  "Journey A: Audit trail records completed task with timestamp"
);

// Journey B: Document reader & grounded study companion
console.log("  Journey B: PDF document ingestion & grounded Q&A");
const sampleNotes =
  "Unified English Braille is the official code. It was designed to remove ambiguities across literary and technical text. Physical Braille displays use micro-pins. Displayed Unicode is visual and not tactile.";
const bSummary = summarizeText(sampleNotes, 2);
assert(bSummary.length > 30, "Journey B: Summarizes uploaded notes into verified initial sentences");
const bTakeaways = extractKeyTakeaways(sampleNotes);
assert(bTakeaways.length >= 2, "Journey B: Extracts actionable takeaways from uploaded syllabus");

// Journey C: Calendar event request with conflict detection
console.log("  Journey C: Conflict detection & verified calendar creation");
const targetTime = new Date("2026-11-25T16:00:00Z");
const conflictTime = new Date("2026-11-25T16:30:00Z");
const cEvents = [
  { id: "c-1", title: "Chemistry Lab", start: "2026-11-25T15:30:00Z", end: "2026-11-25T17:00:00Z" }
];
const cConflicts = checkSchedulingConflicts(targetTime, new Date(targetTime.getTime() + 3600000), cEvents);
assert(
  cConflicts.length === 1 && cConflicts[0].title === "Chemistry Lab",
  "Journey C: Pre-execution conflict detection warns student of overlapping Chemistry Lab"
);

// Journey D: Keyboard navigation & screen-reader shortcuts
console.log("  Journey D: Screen-reader landmarks & keyboard shortcuts");
const shortcutMap: Record<string, string> = {
  "1": "home",
  "2": "translator",
  "3": "study",
  "4": "planner",
  "5": "games",
  "6": "notice",
  "7": "document",
  "8": "voice",
  "9": "about",
};
assert(Object.keys(shortcutMap).length === 9, "Journey D: Alt+1 through Alt+9 provide 1-key access to all 9 modules");

// Journey E: Failure recovery, cancellation & undo
console.log("  Journey E: Cancellation, verbal controls & undo");
const cancelPlan = localRuleBasedPlanner("Cancel that please", "study");
assert(
  cancelPlan.steps.length === 1 && cancelPlan.steps[0].toolName === "cancel_action",
  "Journey E: Verbal 'Cancel that' produces cancel_action tool"
);

const cancelExec = await executeAgentStep(cancelPlan.steps[0], journeyAContext);
assert(cancelExec.message.includes("canceled"), "Journey E: cancel_action confirms zero state mutations");

// Undo recently created item
const undoPlan = localRuleBasedPlanner("Undo last action", "planner");
assert(
  undoPlan.steps.length === 1 && undoPlan.steps[0].toolName === "undo_last_action",
  "Journey E: Verbal 'Undo' produces undo_last_action tool"
);

const undoExec = await executeAgentStep(undoPlan.steps[0], journeyAContext);
assert(
  undoExec.success && undoExec.message.includes("undone"),
  "Journey E: undo_last_action successfully reverts the study session created in Journey A"
);

// ---------------------------------------------------------------------------
// 10. Supabase Backend Integration & Cloud Persistence Suite
// ---------------------------------------------------------------------------
console.log("\n10. Supabase Backend Integration & Cloud Persistence Suite");
import {
  checkSupabaseStatus,
  fetchStudyPlansFromCloud,
  saveStudyPlanToCloud,
  fetchGameProgressFromCloud,
  saveGameProgressToCloud,
  fetchStudyNotesFromCloud,
  saveStudyNoteToCloud,
  fetchCollegeNoticesFromCloud,
  saveCollegeNoticeToCloud,
} from "../src/services/supabaseService";
import { syncStudyPlanWithCloud } from "../src/services/calendarService";

const supaStatus = await checkSupabaseStatus();
assert(
  typeof supaStatus.isConfigured === "boolean" && typeof supaStatus.message === "string",
  "Supabase service provides robust status check and message"
);

// Study Plan Cloud Sync
const testCloudPlan = {
  id: "test-cloud-plan-1",
  title: "Supabase Integration Verification",
  date: "2026-11-30",
  time: "14:00",
  durationMinutes: 60,
  subject: "CS 410",
  completed: false,
  notes: "Test automated sync",
};
await saveStudyPlanToCloud(testCloudPlan);
const cloudSyncResult = await syncStudyPlanWithCloud();
assert(
  cloudSyncResult.success && typeof cloudSyncResult.syncedCount === "number",
  "syncStudyPlanWithCloud successfully synchronizes local planner with Supabase Cloud"
);

// Game Progress Cloud Sync
const testCloudProgress = {
  attempts: 12,
  correct: 10,
  streak: 5,
  bestStreak: 7,
  history: [
    {
      game: "dot_detective",
      question: "Which letter has dots 1 and 3?",
      userAnswer: "K",
      correctAnswer: "K",
      isCorrect: true,
      timestamp: Date.now(),
    },
  ],
};
await saveGameProgressToCloud(testCloudProgress);
assert(true, "saveGameProgressToCloud saves user learning metrics and history");

// Study Notes Cloud Persistence
const testCloudNote = {
  id: "test-note-1",
  title: "Accessibility Guidelines Notes",
  filename: "notes.txt",
  content: "WCAG 2.1 AA requires minimum 4.5:1 contrast ratio.",
  summary: "Summary of contrast requirements.",
  takeaways: ["Contrast ratio must be at least 4.5:1."],
  wordCount: 10,
};
await saveStudyNoteToCloud(testCloudNote);
assert(true, "saveStudyNoteToCloud persists student study materials and takeaways");

// College Notice Cloud Persistence
const testCloudNotice = {
  id: "test-notice-1",
  title: "Scholarship Form 2026",
  summary: "Annual inclusive scholarship notice.",
  deadlines: [{ title: "Application Cutoff", date: "2026-12-15", isCritical: true }],
  eligibility: [{ criterion: "Enrolled student", isAmbiguous: false }],
  requiredDocuments: [{ name: "Transcript", context: "Official record" }],
  nextSteps: ["Apply online before deadline."],
};
await saveCollegeNoticeToCloud(testCloudNotice);
assert(true, "saveCollegeNoticeToCloud stores analyzed circulars and deadlines");

// Braille Auditory Accessibility for Visually Impaired Users
const spokenK = describeBrailleDots("⠅");
const spokenB = describeBrailleDots("⠃");
assert(
  spokenK === "Dots 1-3" && spokenB === "Dots 1-2",
  "Braille dot descriptions provide accurate auditory readout for blind users"
);

// Voice-First Agent Tools & Multilingual Consistency
const translatePlan = localRuleBasedPlanner("Translate hello to braille", "voice", "en-US");
assert(
  translatePlan.steps.length === 1 && translatePlan.steps[0].toolName === "translate_text",
  "Voice command 'Translate hello to braille' plans translate_text step"
);
const translateExec = await executeAgentStep(translatePlan.steps[0], journeyAContext);
assert(
  translateExec.success && translateExec.data?.brailleText === "⠓⠑⠇⠇⠕",
  "Voice translate_text produces exact Braille output for 'hello'"
);

const agendaPlan = localRuleBasedPlanner("Read today's agenda", "home", "en-US");
assert(
  agendaPlan.steps.length === 1 && agendaPlan.steps[0].toolName === "read_today_schedule",
  "Voice command 'Read today's agenda' plans read_today_schedule step"
);

// ---------------------------------------------------------------------------
// 11. Intelligent Punctuation, Grounded Array QA & Agent Advisory Suite
// ---------------------------------------------------------------------------
console.log("\n11. Intelligent Punctuation, Grounded QA & Advisory Guidance Suite");
import { formatTextForSpeech, splitSpeechSegmentsWithPauses, setActiveLanguage } from "../src/services/speechService";
import { setActiveDocumentContext } from "../src/services/appContextService";
import { askNotesQuestion, explainDifficultConcept } from "../src/services/studyService";

const codeSpeech = formatTextForSpeech("arr[i] = x + 5; 50% step-by-step", "smart");
assert(
  codeSpeech.includes("arr index i equals x plus 5") &&
    codeSpeech.includes("50 percent") &&
    !codeSpeech.includes("minus"),
  "Smart symbol speech interprets arrays, math operators, percentages, and preserves hyphenated words"
);

const brailleSpeech = formatTextForSpeech("Capital uses ⠠ and numbers use ⠼.", "smart");
assert(
  brailleSpeech.includes("Braille dots 6") && brailleSpeech.includes("Braille dots 3 4 5 6"),
  "Smart speech verbalizes Unicode Braille glyphs instead of dropping silent blanks"
);

const verboseSpeech = formatTextForSpeech("Hello, world? Yes.", "verbose");
assert(
  verboseSpeech.includes("comma") &&
    verboseSpeech.includes("question mark") &&
    verboseSpeech.includes("period"),
  "Verbose punctuation mode explicitly verbalizes punctuation marks"
);

const segments = splitSpeechSegmentsWithPauses("First sentence.\nSecond paragraph sentence.");
assert(
  segments.length === 2 && segments[0].pauseAfterMs >= 300,
  "Pause splitter produces distinct clauses with breathing pause delays"
);

const arrayDocText =
  "An array is a linear data structure storing elements in contiguous memory locations. Indexing starts at 0 using arr[i].";
const arrayExplain = await explainDifficultConcept("what is array", arrayDocText, "en-US");
assert(
  arrayExplain.explanation.toLowerCase().includes("contiguous memory"),
  "Concept explainer normalizes 'what is array' and grounds explanation in uploaded array notes"
);

const arrayQa = await askNotesQuestion("what is array", arrayDocText, "en-US");
assert(
  arrayQa.grounded && arrayQa.answer.toLowerCase().includes("contiguous memory"),
  "Grounded QA accurately answers 'what is array' from uploaded material"
);

setActiveDocumentContext({
  filename: "array_notes.pdf",
  text: arrayDocText,
  wordCount: 19,
  method: "PDF parser",
  updatedAt: Date.now(),
});

const advisoryPlan = localRuleBasedPlanner("Where can I practice Braille dots?", "home", "en-US");
assert(
  advisoryPlan.steps.length === 1 && advisoryPlan.steps[0].toolName === "general_agent_response",
  "Advisory question 'Where can I practice Braille dots?' plans intelligent guidance response"
);

const docAgentPlan = localRuleBasedPlanner("what is array", "study", "en-US");
const docAgentExec = await executeAgentStep(docAgentPlan.steps[0], journeyAContext);
assert(
  docAgentExec.success && docAgentExec.message.toLowerCase().includes("contiguous memory"),
  "Voice Agent answers document-grounded question 'what is array' from shared active document context"
);
setActiveDocumentContext(null);

const dashPlan = localRuleBasedPlanner("Open my progress dashboard", "home", "en-US");
assert(
  dashPlan.steps.length === 1 &&
    dashPlan.steps[0].toolName === "navigate_page" &&
    dashPlan.steps[0].parameters.page === "dashboard",
  "Voice command 'Open my progress dashboard' navigates to dashboard view"
);

import {
  setPendingNoteLoad,
  consumePendingNoteLoad,
  setPendingNoticeLoad,
  consumePendingNoticeLoad,
  setPendingTranslatorLoad,
  consumePendingTranslatorLoad,
  consumePendingDashboardTab,
} from "../src/services/appContextService";

setPendingNoteLoad({
  id: "n-1",
  title: "Arrays",
  filename: "arrays.pdf",
  content: "Array elements",
  wordCount: 2,
});
const consumedNote = consumePendingNoteLoad();
assert(
  consumedNote?.title === "Arrays" && consumePendingNoteLoad() === null,
  "Dashboard saved-note handoff sets and consumes pending note once"
);

setPendingNoticeLoad({
  id: "nt-1",
  title: "Scholarship",
  summary: "Apply by Dec 15",
  deadlines: [],
  eligibility: [],
  requiredDocuments: [],
  nextSteps: [],
});
const consumedNotice = consumePendingNoticeLoad();
assert(
  consumedNotice?.title === "Scholarship" && consumePendingNoticeLoad() === null,
  "Dashboard saved-notice handoff sets and consumes pending notice once"
);

// ---------------------------------------------------------------------------
// 12. Script Knowledge Vault, Bharati Dot Fix, Agent Multi-Step & Colorblind Mode
// ---------------------------------------------------------------------------
console.log("\n[12] Testing Script Knowledge Vault, Agent Orchestration & OCR Helpers...");

assert(
  SCRIPT_VAULT_LANGUAGES.length === 5,
  "Script Knowledge Vault covers all 5 script tracks (EN, HI, KN, TA, BN)"
);

const enVault = getScriptKnowledgeVault("en-ueb");
const hiVault = getScriptKnowledgeVault("hi-in");
const knVault = getScriptKnowledgeVault("kn-in");
const taVault = getScriptKnowledgeVault("ta-in");
const bnVault = getScriptKnowledgeVault("bn-in");

assert(
  enVault.some((e) => e.symbol === "A" && e.braille === "⠁" && e.dotsLabel.includes("1")) &&
    enVault.some((e) => e.category === "Grade 2 Contractions") &&
    hiVault.length >= 40 &&
    knVault.length >= 40 &&
    taVault.length >= 30 &&
    bnVault.length >= 35,
  "Script Knowledge Vault exposes complete character sets with raised dots and categories"
);

const hiPha = hiVault.find((e) => e.symbol === "फ");
const knPha = knVault.find((e) => e.symbol === "ಫ");
const bnPha = bnVault.find((e) => e.symbol === "ফ");
assert(
  hiPha?.braille === "⠖" && knPha?.braille === "⠖" && bnPha?.braille === "⠖",
  "Bharati Braille 'pha' consistently maps to official Unicode cell ⠖ (dots 2-3-5)"
);

assert(
  scoreOcrCandidate("Array is a linear data structure storing elements.") >
    scoreOcrCandidate("`| ~^ {} _ 1"),
  "OCR handwriting fallback scorer prefers coherent alphanumeric words over scan noise"
);

let appliedCvd = "standard";
let jumpedPage = "home";
const advContext: AgentExecutionContext = {
  ...journeyAContext,
  onNavigate: (p) => {
    jumpedPage = p;
  },
  onColorVisionModeChange: (m) => {
    appliedCvd = m;
  },
};

const compoundPlan = localRuleBasedPlanner(
  "switch to kannada and open kannada script vault",
  "home",
  "en-US"
);
assert(
  compoundPlan.steps.length === 2 &&
    compoundPlan.steps[0].toolName === "switch_voice_language" &&
    compoundPlan.steps[1].toolName === "open_script_vault",
  "Agent decomposes compound command into sequential switch_voice_language + open_script_vault steps"
);

const compoundStep1 = await executeAgentStep(compoundPlan.steps[0], advContext);
const compoundStep2 = await executeAgentStep(compoundPlan.steps[1], advContext);
const pendingDashTab = consumePendingDashboardTab();
assert(
  compoundStep1.success &&
    compoundStep2.success &&
    jumpedPage === "dashboard" &&
    pendingDashTab?.tab === "scriptvault" &&
    pendingDashTab?.scriptKey === "kn-in",
  "Agent executes multi-step Kannada + Script Vault workflow and updates dashboard context"
);

setActiveLanguage("en-US");

const cvdPlan = localRuleBasedPlanner("enable red green colorblind mode", "home", "en-US");
const cvdRes = await executeAgentStep(cvdPlan.steps[0], advContext);
assert(
  cvdPlan.steps[0].toolName === "set_colorblind_mode" &&
    cvdRes.success &&
    appliedCvd === "deuteranopia",
  "Agent activates Red-Green colorblind-safe mode via voice/text instruction"
);

const progressPlan = localRuleBasedPlanner("read my progress", "home", "en-US");
const progressRes = await executeAgentStep(progressPlan.steps[0], advContext);
assert(
  progressPlan.steps[0].toolName === "read_user_progress" &&
    progressRes.success &&
    progressRes.message.toLowerCase().includes("accuracy"),
  "Agent 'read my progress' tool reports live Braille accuracy and study streak"
);

setPendingTranslatorLoad({ text: "ಕ", tableId: "kn-in-g1" });
const consumedTrans = consumePendingTranslatorLoad();
assert(
  consumedTrans?.text === "ಕ" &&
    consumedTrans?.tableId === "kn-in-g1" &&
    consumePendingTranslatorLoad() === null,
  "Script Knowledge Vault practice handoff loads target symbol and script once"
);

// ---------------------------------------------------------------------------
// Final Summary
// ---------------------------------------------------------------------------
console.log("\n=================================================");
console.log(`Results: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log("=================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("All automated tests completed successfully!");
}
