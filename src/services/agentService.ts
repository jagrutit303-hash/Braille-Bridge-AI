/**
 * BrailleBridge Agentic AI Orchestration Service
 * Handles speech-to-intent understanding, multi-step task planning, tool selection,
 * permission guards for consequential actions, and audio feedback.
 */

import {
  speakText,
  stopSpeaking,
  getLastSpokenText,
  getActiveLanguage,
  setActiveLanguage,
} from "./speechService";
import { getPhrases } from "./i18nService";
import { NavPage } from "../components/Header";
import {
  getActiveDocumentContext,
  getActiveNoticeContext,
  setPendingDashboardTab,
  setPendingTranslatorLoad,
} from "./appContextService";
import {
  addLocalStudyItem,
  createGoogleCalendarEvent,
  checkSchedulingConflicts,
  loadLocalStudyPlan,
  deleteLocalStudyItem,
} from "./calendarService";
import { translate, ScriptVaultKey } from "./brailleService";
import { loadGameProgress } from "./gamesService";
import { getStoredUser } from "./authService";
import { ColorVisionMode } from "./supabaseService";

export interface AgentStep {
  id: string;
  toolName: string;
  description: string;
  parameters: Record<string, any>;
  status: "pending" | "running" | "completed" | "failed" | "requires_permission";
  permissionPrompt?: string;
  result?: any;
  error?: string;
}

export interface AgentPlan {
  userIntent: string;
  explanation: string;
  steps: AgentStep[];
  currentStepIndex: number;
  completed: boolean;
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

export interface AgentExecutionContext {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  speechSpeed: number;
  onSpeechSpeedChange: (speed: number) => void;
  isHighContrast: boolean;
  onToggleContrast: () => void;
  fontSizeScale: number;
  onFontSizeScaleChange: (scale: number) => void;
  onColorVisionModeChange?: (mode: ColorVisionMode) => void;
}

export interface AgentAuditEntry {
  id: string;
  timestamp: string;
  spokenInput: string;
  language: string;
  intent: string;
  stepsCount: number;
  status: "completed" | "canceled" | "failed" | "undone";
  details: string;
}

// In-memory audit log and last created item for undo support
const auditLogs: AgentAuditEntry[] = [];
let lastCreatedStudySessionId: string | null = null;

export function getAgentAuditLog(): AgentAuditEntry[] {
  return [...auditLogs];
}

export function addAgentAuditEntry(entry: Omit<AgentAuditEntry, "id" | "timestamp">): AgentAuditEntry {
  const newEntry: AgentAuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    ...entry,
  };
  auditLogs.unshift(newEntry);
  if (auditLogs.length > 50) auditLogs.pop();
  return newEntry;
}

export function clearAgentAuditLog(): void {
  auditLogs.length = 0;
}

/**
 * Call server or local intent parser to plan agentic steps from spoken prompt
 */
export async function planAgentTask(
  spokenPrompt: string,
  context: { currentPage: NavPage; language?: string }
): Promise<AgentPlan> {
  const cleanPrompt = spokenPrompt.trim();
  if (!cleanPrompt) {
    return {
      userIntent: "Empty prompt",
      explanation: "I didn't hear anything. Please speak your instruction.",
      steps: [],
      currentStepIndex: 0,
      completed: true,
      needsClarification: true,
      clarificationQuestion: "What would you like me to do? You can ask to read the page, schedule a study session, or practice Braille.",
    };
  }

  try {
    const res = await fetch("/api/agent/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: cleanPrompt,
        currentPage: context.currentPage,
        language: context.language || "en",
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.plan) {
        return data.plan;
      }
    }
  } catch (err) {
    // Client-side deterministic planner fallback
  }

  return localRuleBasedPlanner(cleanPrompt, context.currentPage, context.language || getActiveLanguage());
}

function detectVaultScriptKey(lower: string): ScriptVaultKey {
  if (lower.includes("kannada") || lower.includes("ಕನ್ನಡ")) return "kn-in";
  if (lower.includes("hindi") || lower.includes("devanagari") || lower.includes("हिन्दी") || lower.includes("हिंदी")) return "hi-in";
  if (lower.includes("tamil") || lower.includes("தமிழ்")) return "ta-in";
  if (lower.includes("bengali") || lower.includes("bangla") || lower.includes("বাংলা")) return "bn-in";
  return "en-ueb";
}

/**
 * Robust local fallback intent planner (works 100% offline or when server is unavailable).
 * Supports multi-step compound instructions (e.g., "switch to kannada and open script vault").
 */
export function localRuleBasedPlanner(
  prompt: string,
  currentPage: NavPage,
  language: string = getActiveLanguage(),
  isCompoundClause = false
): AgentPlan {
  const phrases = getPhrases(language);
  const lower = prompt.toLowerCase();
  const steps: AgentStep[] = [];
  let explanation = "";

  // -1. Multi-step compound instruction decomposition ("step A and step B", "step A then step B")
  if (!isCompoundClause && !lower.startsWith("what ") && !lower.startsWith("explain ")) {
    const clauses = prompt
      .split(/\s+(?:and\s+then|then|and)\s+/i)
      .map((c) => c.trim())
      .filter((c) => c.length >= 4);

    if (clauses.length >= 2 && clauses.length <= 4) {
      const subPlans = clauses.map((c) => localRuleBasedPlanner(c, currentPage, language, true));
      const concreteCount = subPlans.filter((p) =>
        p.steps.some((s) => s.toolName !== "general_agent_response")
      ).length;

      if (concreteCount >= 2) {
        const mergedSteps: AgentStep[] = [];
        subPlans.forEach((sp, pIdx) => {
          sp.steps.forEach((st, sIdx) => {
            mergedSteps.push({
              ...st,
              id: `step-${pIdx + 1}-${sIdx + 1}-${st.toolName}`,
            });
          });
        });

        return {
          userIntent: subPlans.map((s) => s.userIntent).join(" -> "),
          explanation: subPlans.map((s) => s.explanation).filter(Boolean).join(" "),
          steps: mergedSteps,
          currentStepIndex: 0,
          completed: false,
        };
      }
    }
  }

  // 0. Verbal control commands: Cancel, Repeat, Status, Undo
  if (
    lower.includes("cancel that") ||
    lower.includes("cancel") ||
    lower.includes("abort") ||
    lower.includes("रद्द करो") ||
    lower.includes("रद्द") ||
    lower.includes("ರದ್ದುಮಾಡು") ||
    lower.includes("ರದ್ದು") ||
    lower.includes("ரத்து செய்") ||
    lower.includes("ரத்து") ||
    lower.includes("বাতিল করো") ||
    lower.includes("বাতিল")
  ) {
    steps.push({
      id: "step-cancel",
      toolName: "cancel_action",
      description: "Cancel active or proposed task",
      parameters: {},
      status: "pending",
    });
    return {
      userIntent: "Cancel task",
      explanation: phrases.actionCanceled,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  if (
    lower.includes("repeat") ||
    lower.includes("say that again") ||
    lower.includes("what did you say") ||
    lower.includes("दोहराओ") ||
    lower.includes("फिर से बोलो") ||
    lower.includes("ಮತ್ತೆ ಹೇಳು") ||
    lower.includes("ಪುನರಾವರ್ತಿಸು") ||
    lower.includes("மீண்டும் சொல்") ||
    lower.includes("আবার বলুন")
  ) {
    steps.push({
      id: "step-repeat",
      toolName: "repeat_statement",
      description: "Repeat the last spoken message",
      parameters: {},
      status: "pending",
    });
    return {
      userIntent: "Repeat statement",
      explanation: phrases.repeatPrefix || "Repeating last statement.",
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  if (
    lower.includes("what are you doing") ||
    lower.includes("current status") ||
    lower.includes("status") ||
    lower.includes("क्या कर रहे") ||
    lower.includes("ಏನು ಮಾಡುತ್ತಿದ್ದೀರಿ") ||
    lower.includes("என்ன செய்கிறாய்")
  ) {
    steps.push({
      id: "step-status",
      toolName: "query_status",
      description: "Check current agent and screen status",
      parameters: { currentPage },
      status: "pending",
    });
    return {
      userIntent: "Check agent status",
      explanation: phrases.whatAmIDoingIdle,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  if (
    lower.includes("undo") ||
    lower.includes("undo that") ||
    lower.includes("वापस लो") ||
    lower.includes("पूर्ववत") ||
    lower.includes("ಹಿಂತೆಗೆದುಕೊಳ್ಳಿ") ||
    lower.includes("முந்தைய செயல் நீக்கு")
  ) {
    steps.push({
      id: "step-undo",
      toolName: "undo_last_action",
      description: "Undo the last created study session",
      parameters: {},
      status: "pending",
    });
    return {
      userIntent: "Undo last change",
      explanation: phrases.actionUndone,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 0.5. Question / Suggestion queries ("Where do I...", "How to...", "Suggest...") route to intelligent guide + answer
  const isAdvisoryQuestion =
    lower.includes("how do i") ||
    lower.includes("how to") ||
    lower.includes("where do i") ||
    lower.includes("where can i") ||
    lower.includes("where to") ||
    lower.includes("which page") ||
    lower.includes("which feature") ||
    lower.includes("suggest");

  if (isAdvisoryQuestion) {
    steps.push({
      id: "step-answer",
      toolName: "general_agent_response",
      description: `Answer and guide: "${prompt}"`,
      parameters: { query: prompt },
      status: "pending",
    });

    return {
      userIntent: "Guide & answer user question",
      explanation: phrases.processingTask,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 0.6. Voice Language Switch Intent
  const wantsLangSwitch =
    lower.includes("switch to ") ||
    lower.includes("speak in ") ||
    lower.includes("speak kannada") ||
    lower.includes("speak hindi") ||
    lower.includes("speak tamil") ||
    lower.includes("speak bengali") ||
    lower.includes("speak english") ||
    lower.includes("use kannada") ||
    lower.includes("use hindi") ||
    lower.includes("use tamil") ||
    lower.includes("use bengali") ||
    lower.includes("change language to");

  if (wantsLangSwitch) {
    let targetLang = "";
    let langName = "";
    if (lower.includes("kannada") || lower.includes("ಕನ್ನಡ")) {
      targetLang = "kn-IN";
      langName = "Kannada";
    } else if (lower.includes("hindi") || lower.includes("हिन्दी") || lower.includes("हिंदी")) {
      targetLang = "hi-IN";
      langName = "Hindi";
    } else if (lower.includes("tamil") || lower.includes("தமிழ்")) {
      targetLang = "ta-IN";
      langName = "Tamil";
    } else if (lower.includes("bengali") || lower.includes("bangla") || lower.includes("বাংলা")) {
      targetLang = "bn-IN";
      langName = "Bengali";
    } else if (lower.includes("english")) {
      targetLang = "en-US";
      langName = "English";
    }

    if (targetLang) {
      steps.push({
        id: "step-lang",
        toolName: "switch_voice_language",
        description: `Switch voice language to ${langName}`,
        parameters: { targetLang, langName },
        status: "pending",
      });
      return {
        userIntent: `Switch language to ${langName}`,
        explanation: `I will switch the assistant and voice reader to ${langName}.`,
        steps,
        currentStepIndex: 0,
        completed: false,
      };
    }
  }

  // 0.7. Colorblind Vision Mode / High Contrast / Font Scale Controls
  if (
    lower.includes("colorblind") ||
    lower.includes("color blind") ||
    lower.includes("deuteranopia") ||
    lower.includes("protanopia") ||
    lower.includes("red green") ||
    lower.includes("red-green") ||
    lower.includes("tritanopia") ||
    lower.includes("blue yellow") ||
    lower.includes("blue-yellow") ||
    lower.includes("monochrome") ||
    lower.includes("standard color")
  ) {
    let mode: ColorVisionMode = "deuteranopia";
    if (lower.includes("tritanopia") || lower.includes("blue yellow") || lower.includes("blue-yellow")) {
      mode = "tritanopia";
    } else if (lower.includes("monochrome") || lower.includes("grayscale")) {
      mode = "monochrome";
    } else if (lower.includes("standard") || lower.includes("default") || lower.includes("off")) {
      mode = "standard";
    }
    steps.push({
      id: "step-cvd",
      toolName: "set_colorblind_mode",
      description: `Apply ${mode} color vision palette`,
      parameters: { mode },
      status: "pending",
    });
    return {
      userIntent: `Set color vision mode to ${mode}`,
      explanation: `I will switch the interface to the ${mode} colorblind-responsive palette.`,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  if (lower.includes("high contrast") || lower.includes("standard contrast") || lower.includes("dark mode")) {
    const enable = !lower.includes("standard contrast") && !lower.includes("off") && !lower.includes("disable");
    steps.push({
      id: "step-contrast",
      toolName: "set_high_contrast",
      description: enable ? "Enable High Contrast AAA mode" : "Restore Standard Parchment mode",
      parameters: { enable },
      status: "pending",
    });
    return {
      userIntent: enable ? "Enable High Contrast" : "Disable High Contrast",
      explanation: enable ? "Enabling WCAG AAA high contrast theme." : "Restoring standard contrast theme.",
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  if (
    lower.includes("increase font") ||
    lower.includes("larger font") ||
    lower.includes("bigger font") ||
    lower.includes("bigger text") ||
    lower.includes("larger text") ||
    lower.includes("zoom in") ||
    lower.includes("decrease font") ||
    lower.includes("smaller font") ||
    lower.includes("smaller text")
  ) {
    const delta =
      lower.includes("decrease") || lower.includes("smaller") ? -0.15 : 0.15;
    steps.push({
      id: "step-font",
      toolName: "adjust_font_scale",
      description: `${delta > 0 ? "Increase" : "Decrease"} Atkinson Hyperlegible text size`,
      parameters: { delta },
      status: "pending",
    });
    return {
      userIntent: "Adjust text size",
      explanation: delta > 0 ? "Increasing display font size." : "Decreasing display font size.",
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 0.8. Script Knowledge Vault & User Progress Tools
  if (
    lower.includes("knowledge vault") ||
    lower.includes("script vault") ||
    lower.includes("script chart") ||
    lower.includes("braille chart") ||
    lower.includes("script knowledge")
  ) {
    const scriptKey = detectVaultScriptKey(lower);
    steps.push({
      id: "step-vault",
      toolName: "open_script_vault",
      description: `Open Script Knowledge Vault (${scriptKey})`,
      parameters: { scriptKey },
      status: "pending",
    });
    return {
      userIntent: `Open Script Knowledge Vault (${scriptKey})`,
      explanation: "Opening your Script Knowledge Vault in the Dashboard.",
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  if (
    !lower.includes("dashboard") &&
    !lower.startsWith("open ") &&
    !lower.startsWith("go to ") &&
    !lower.startsWith("navigate ") &&
    (lower.includes("read my progress") ||
      lower.includes("read progress") ||
      lower.includes("check my progress") ||
      lower.includes("what is my progress") ||
      lower.includes("how am i doing") ||
      lower.includes("my streak") ||
      lower.includes("my accuracy"))
  ) {
    steps.push({
      id: "step-progress",
      toolName: "read_user_progress",
      description: "Summarize Braille accuracy, streak, and timetable progress aloud",
      parameters: {},
      status: "pending",
    });
    return {
      userIntent: "Read student progress summary",
      explanation: "Checking your Braille accuracy, streaks, and timetable progress.",
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 1. Navigation intents (English, Hindi, Kannada, Tamil, Bengali)
  const isNav =
    lower.includes("go to") ||
    lower.includes("open") ||
    lower.includes("navigate") ||
    lower.includes("switch to") ||
    lower.includes("खोलो") ||
    lower.includes("जाओ") ||
    lower.includes("चलो") ||
    lower.includes("ದರ್ಶಿಸು") ||
    lower.includes("ತೆರೆ") ||
    lower.includes("ಹೋಗು") ||
    lower.includes("திற") ||
    lower.includes("செல்") ||
    lower.includes("খুলুন") ||
    lower.includes("যান");

  if (isNav) {
    let targetPage: NavPage = "home";
    let pageName = "Home";

    if (lower.includes("dashboard") || lower.includes("progress") || lower.includes("vault") || lower.includes("saved items") || lower.includes("ಡ್ಯಾಶ್‌ಬೋರ್ಡ್") || lower.includes("डैशबोर्ड")) {
      targetPage = "dashboard";
      pageName = "Progress Dashboard";
    } else if (lower.includes("translator") || lower.includes("braille") || lower.includes("अनुवाद") || lower.includes("ಭಾಷಾಂತರ") || lower.includes("மொழிபெயர்ப்பு")) {
      targetPage = "translator";
      pageName = "Braille Translator";
    } else if (
      lower.includes("study") ||
      lower.includes("companion") ||
      lower.includes("notes") ||
      lower.includes("tutor") ||
      lower.includes("स्टडी") ||
      lower.includes("नोट्स") ||
      lower.includes("ಅಧ್ಯಯನ") ||
      lower.includes("ಸ್ಟಡಿ") ||
      lower.includes("ಕಂಪ್ಯಾನಿಯನ್") ||
      lower.includes("படிப்பு") ||
      lower.includes("পড়া")
    ) {
      targetPage = "study";
      pageName = "Study Companion";
    } else if (lower.includes("game") || lower.includes("academy") || lower.includes("detective") || lower.includes("practice") || lower.includes("खेल") || lower.includes("गेम") || lower.includes("ಆಟ") || lower.includes("விளையாட்டு")) {
      targetPage = "games";
      pageName = "Braille Games";
    } else if (lower.includes("notice") || lower.includes("circular") || lower.includes("form") || lower.includes("scholarship") || lower.includes("सूचना") || lower.includes("ಸರ್ಕ್ಯುಲರ್") || lower.includes("அறிவிப்பு")) {
      targetPage = "notice";
      pageName = "Notice Assistant";
    } else if (lower.includes("document") || lower.includes("pdf") || lower.includes("reader") || lower.includes("दस्तावेज") || lower.includes("ದಾಖಲೆ") || lower.includes("ஆவணம்")) {
      targetPage = "study";
      pageName = "Study Companion";
    } else if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("planner") || lower.includes("timetable") || lower.includes("कैलेंडर") || lower.includes("टाइमटेबल") || lower.includes("ಕ್ಯಾಲೆಂಡರ್") || lower.includes("ವೇಳಾಪಟ್ಟಿ") || lower.includes("நாட்காட்டி") || lower.includes("সময়সূচী")) {
      targetPage = "planner";
      pageName = "Study Planner & Calendar";
    } else if (lower.includes("voice") || lower.includes("mic") || lower.includes("आवाज़") || lower.includes("ಧ್ವನಿ") || lower.includes("குரல்")) {
      targetPage = "voice";
      pageName = "Voice Assistant";
    } else if (lower.includes("about") || lower.includes("help") || lower.includes("accessibility") || lower.includes("मदद") || lower.includes("सहायता") || lower.includes("ಸಹಾಯ") || lower.includes("உதவி")) {
      targetPage = "about";
      pageName = "Accessibility & About";
    }

    steps.push({
      id: "step-nav",
      toolName: "navigate_page",
      description: `Navigate to ${pageName}`,
      parameters: { page: targetPage, pageName },
      status: "pending",
    });

    explanation = `I will take you to the ${pageName}.`;
    return {
      userIntent: `Navigate to ${pageName}`,
      explanation,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 2. Read page or help intent
  if (
    lower.includes("read this page") ||
    lower.includes("read page") ||
    lower.includes("what is on this page") ||
    lower.includes("पेज पढ़ो") ||
    lower.includes("यह पेज पढ़ो") ||
    lower.includes("पुटा ओदु") ||
    lower.includes("ಪುಟ ಓದು") ||
    lower.includes("ಈ ಪುಟವನ್ನು ಓದಿ") ||
    lower.includes("பக்கத்தைப் படி") ||
    lower.includes("পাতাটি পড়ুন")
  ) {
    steps.push({
      id: "step-read",
      toolName: "read_page_content",
      description: "Read aloud current page overview and active items",
      parameters: { currentPage },
      status: "pending",
    });

    return {
      userIntent: "Read current page content",
      explanation: "I will read the main contents of the current page aloud.",
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 3. Speech speed adjustment intent (English, Hindi, Kannada, Tamil, Bengali)
  if (
    lower.includes("speed") ||
    lower.includes("faster") ||
    lower.includes("slower") ||
    lower.includes("तेज़") ||
    lower.includes("धीमे") ||
    lower.includes("धीरे") ||
    lower.includes("ವೇಗವಾಗಿ") ||
    lower.includes("ವೇಗ") ||
    lower.includes("ನಿಧಾನವಾಗಿ") ||
    lower.includes("ವೇಗ ಹೆಚ್ಚಿಸು") ||
    lower.includes("വേഗത") ||
    lower.includes("வேகமாக") ||
    lower.includes("மெதுவாக") ||
    lower.includes("দ্রুত") ||
    lower.includes("ধীরে")
  ) {
    let newSpeed = 1.0;
    if (
      lower.includes("faster") ||
      lower.includes("increase") ||
      lower.includes("तेज़") ||
      lower.includes("ವೇಗವಾಗಿ") ||
      lower.includes("വേഗത") ||
      lower.includes("வேகமாக") ||
      lower.includes("দ্রুত")
    ) {
      newSpeed = 1.3;
    } else if (
      lower.includes("slower") ||
      lower.includes("decrease") ||
      lower.includes("धीमे") ||
      lower.includes("धीरे") ||
      lower.includes("ನಿಧಾನವಾಗಿ") ||
      lower.includes("மெதுவாக") ||
      lower.includes("ধীরে")
    ) {
      newSpeed = 0.8;
    } else if (lower.includes("normal") || lower.includes("reset") || lower.includes("सामान्य")) {
      newSpeed = 1.0;
    }

    steps.push({
      id: "step-speed",
      toolName: "set_speech_speed",
      description: `Change speech speed to ${newSpeed}x`,
      parameters: { speed: newSpeed },
      status: "pending",
    });

    return {
      userIntent: "Adjust speech rate",
      explanation: `I will adjust the reading speed to ${newSpeed}x.`,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 4. Scheduling / Calendar intent (English, Hindi, Kannada, Tamil, Bengali)
  if (
    lower.includes("schedule") ||
    lower.includes("calendar") ||
    lower.includes("remind me") ||
    lower.includes("study session") ||
    lower.includes("plan my exam") ||
    lower.includes("शेड्यूल") ||
    lower.includes("टाइमटेबल") ||
    lower.includes("कैलेंडर") ||
    lower.includes("ವೇಳಾಪಟ್ಟಿ") ||
    lower.includes("ಅಧ್ಯಯನ") ||
    lower.includes("ಅಜೆಂಡಾ") ||
    lower.includes("அட்டவணை") ||
    lower.includes("সময়সূচী")
  ) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const targetDate = lower.includes("today")
      ? today.toISOString().split("T")[0]
      : tomorrow.toISOString().split("T")[0];

    const timeStr = lower.includes("5 pm") || lower.includes("17")
      ? "17:00"
      : lower.includes("4 pm") || lower.includes("16")
      ? "16:00"
      : lower.includes("10 am") || lower.includes("morning")
      ? "10:00"
      : "15:00";

    const title = lower.includes("exam")
      ? "Exam Revision Session"
      : lower.includes("braille")
      ? "Braille Practice Session"
      : "Study & Revision Session";

    // Step 1: Check conflicts
    steps.push({
      id: "step-conflict",
      toolName: "check_conflicts",
      description: `Check calendar conflicts for ${title} on ${targetDate} at ${timeStr}`,
      parameters: { date: targetDate, time: timeStr, durationMinutes: 60 },
      status: "pending",
    });

    // Step 2: Schedule (Requires permission!)
    steps.push({
      id: "step-schedule",
      toolName: "schedule_study_session",
      description: `Create study session: "${title}" on ${targetDate} at ${timeStr}`,
      parameters: {
        title,
        date: targetDate,
        time: timeStr,
        durationMinutes: 60,
        subject: "General Study",
      },
      status: "requires_permission",
      permissionPrompt: phrases.permissionRequired(`"${title}" on ${targetDate} at ${timeStr}`),
    });

    return {
      userIntent: `Schedule ${title}`,
      explanation: phrases.processingTask || `I will check your agenda and prepare to schedule "${title}" on ${targetDate} at ${timeStr}.`,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 4.5. Read today's agenda intent
  if (
    lower.includes("read agenda") ||
    lower.includes("read schedule") ||
    lower.includes("today's schedule") ||
    lower.includes("today schedule") ||
    lower.includes("my timetable") ||
    lower.includes("today's agenda")
  ) {
    steps.push({
      id: "step-agenda",
      toolName: "read_today_schedule",
      description: "Read today's study sessions aloud",
      parameters: {},
      status: "pending",
    });

    return {
      userIntent: "Read today's study agenda",
      explanation: phrases.processingTask,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 4.6. Direct translate to Braille intent
  const translateMatch = prompt.match(/^(?:translate|convert)\s+(.+?)(?:\s+to\s+braille)?$/i);
  if (translateMatch && translateMatch[1] && (lower.includes("braille") || isCompoundClause || translateMatch[1].trim().length > 0)) {
    const phraseToTranslate = translateMatch[1].replace(/\s+to\s+braille$/i, "").trim();
    steps.push({
      id: "step-translate",
      toolName: "translate_text",
      description: `Translate "${phraseToTranslate}" to Braille`,
      parameters: { text: phraseToTranslate, language },
      status: "pending",
    });

    return {
      userIntent: `Translate "${phraseToTranslate}" to Braille`,
      explanation: phrases.processingTask,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 5. Concept explanation intent
  if (lower.includes("explain") || lower.includes("what is") || lower.includes("tell me about")) {
    const concept = prompt.replace(/^(explain|what is|tell me about|can you explain)\s+/i, "").trim();

    steps.push({
      id: "step-explain",
      toolName: "explain_concept",
      description: `Explain concept: "${concept}"`,
      parameters: { concept },
      status: "pending",
    });

    return {
      userIntent: `Explain "${concept}"`,
      explanation: `I will explain the concept of "${concept}".`,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // 6. Context help intent
  if (
    lower.includes("help") ||
    lower.includes("where am i") ||
    lower.includes("what can i do") ||
    lower.includes("मदद") ||
    lower.includes("सहायता") ||
    lower.includes("ಸಹಾಯ") ||
    lower.includes("உதவி") ||
    lower.includes("সাহায্য")
  ) {
    steps.push({
      id: "step-help",
      toolName: "context_help",
      description: "Provide contextual help for current screen",
      parameters: { currentPage },
      status: "pending",
    });

    return {
      userIntent: "Context-aware assistance",
      explanation: phrases.helpGeneral,
      steps,
      currentStepIndex: 0,
      completed: false,
    };
  }

  // Default: General tutoring / voice query
  steps.push({
    id: "step-general",
    toolName: "general_agent_response",
    description: "Respond to user voice query",
    parameters: { query: prompt },
    status: "pending",
  });

  return {
    userIntent: "General voice query",
    explanation: "I will process your request.",
    steps,
    currentStepIndex: 0,
    completed: false,
  };
}

async function localizeReply(text: string, activeLang: string): Promise<string> {
  const short = (activeLang || "en").split("-")[0].toLowerCase();
  if (short === "en" || typeof fetch === "undefined") return text;
  // Skip translation if text is already primarily in non-Latin script matching active language
  if (/[^\x00-\x7F]/.test(text) && !/[A-Za-z]{4,}/.test(text)) return text;
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, sourceLang: "en", targetLang: short }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.translatedText) return data.translatedText;
    }
  } catch {
    // fallback to original text
  }
  return text;
}

async function queryBackendAgentAnswer(
  query: string,
  currentPage: NavPage,
  activeLang: string
): Promise<{
  message: string;
  suggestedPage?: NavPage;
  suggestedPageLabel?: string;
  grounded?: boolean;
  sourceType?: string;
}> {
  const activeDoc = getActiveDocumentContext();
  const activeNotice = getActiveNoticeContext();

  try {
    const res = await fetch("/api/agent/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        currentPage,
        activeDocument: activeDoc
          ? { filename: activeDoc.filename, text: activeDoc.text.slice(0, 12000), wordCount: activeDoc.wordCount }
          : null,
        activeNotice: activeNotice
          ? { filename: activeNotice.filename, summary: activeNotice.summary }
          : null,
        language: activeLang,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.answer) {
        return {
          message: data.answer,
          suggestedPage: data.suggestedPage as NavPage | undefined,
          suggestedPageLabel: data.suggestedPageLabel,
          grounded: data.grounded,
          sourceType: data.sourceType,
        };
      }
    }
  } catch {
    // Client-side resilient fallback below
  }

  if (activeDoc?.text) {
    const tokens = query
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !["what", "is", "are", "the", "about", "explain", "define", "from", "notes", "document"].includes(t));
    const lines = activeDoc.text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 10);
    const matched = lines.filter((l) => tokens.some((t) => l.toLowerCase().includes(t)));
    if (matched.length > 0) {
      return {
        message: `From "${activeDoc.filename}": ${matched.slice(0, 3).join(" ")}`,
        grounded: true,
        sourceType: "document",
      };
    }
  }

  return {
    message:
      "You can translate Braille (Alt+2), upload PDF or image notes for grounded Q&A and audio reading (Alt+3), manage your timetable in Planner (Alt+4), practice Braille dots in Games (Alt+5), or analyze circulars in Notice Assistant (Alt+6).",
    grounded: true,
    sourceType: "website",
  };
}

/**
 * Execute an individual agent step with context hooks
 */
export async function executeAgentStep(
  step: AgentStep,
  context: AgentExecutionContext
): Promise<{ success: boolean; message: string; data?: any }> {
  const activeLang = getActiveLanguage();
  const phrases = getPhrases(activeLang);

  switch (step.toolName) {
    case "navigate_page": {
      const page = step.parameters.page as NavPage;
      context.onNavigate(page);
      return {
        success: true,
        message: await localizeReply(`Navigated to ${step.parameters.pageName || page}.`, activeLang),
      };
    }

    case "set_speech_speed": {
      const spd = step.parameters.speed as number;
      context.onSpeechSpeedChange(spd);
      return {
        success: true,
        message: await localizeReply(`Speech rate set to ${spd}x.`, activeLang),
      };
    }

    case "switch_voice_language": {
      const targetLang = String(step.parameters.targetLang || "en-US");
      const langName = String(step.parameters.langName || targetLang);
      setActiveLanguage(targetLang);
      const nextPhrases = getPhrases(targetLang);
      return {
        success: true,
        message: nextPhrases.voiceSwitched(langName),
        data: { language: targetLang },
      };
    }

    case "set_colorblind_mode": {
      const mode = (step.parameters.mode || "standard") as ColorVisionMode;
      context.onColorVisionModeChange?.(mode);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("braillebridge-cvd-change", { detail: mode }));
      }
      const modeLabels: Record<ColorVisionMode, string> = {
        standard: "Standard palette",
        deuteranopia: "Red-Green colorblind safe palette",
        tritanopia: "Blue-Yellow colorblind safe palette",
        monochrome: "Monochrome high-contrast palette",
      };
      return {
        success: true,
        message: await localizeReply(`Display switched to ${modeLabels[mode]}.`, activeLang),
        data: { colorVisionMode: mode },
      };
    }

    case "set_high_contrast": {
      const enable = Boolean(step.parameters.enable);
      if (context.isHighContrast !== enable) {
        context.onToggleContrast();
      }
      return {
        success: true,
        message: await localizeReply(
          enable ? "High contrast AAA mode enabled." : "Standard contrast mode restored.",
          activeLang
        ),
      };
    }

    case "adjust_font_scale": {
      const delta = Number(step.parameters.delta) || 0.1;
      const next = Math.min(1.5, Math.max(0.9, Math.round((context.fontSizeScale + delta) * 20) / 20));
      context.onFontSizeScaleChange(next);
      return {
        success: true,
        message: await localizeReply(`Display font size set to ${Math.round(next * 100)} percent.`, activeLang),
        data: { fontScale: next },
      };
    }

    case "open_script_vault": {
      const scriptKey = (step.parameters.scriptKey || "en-ueb") as ScriptVaultKey;
      setPendingDashboardTab({ tab: "scriptvault", scriptKey });
      context.onNavigate("dashboard");
      return {
        success: true,
        message: await localizeReply(`Opened Script Knowledge Vault (${scriptKey}) on your Dashboard.`, activeLang),
        data: { suggestedPage: "dashboard", scriptKey },
      };
    }

    case "read_user_progress": {
      const user = getStoredUser();
      const game = loadGameProgress();
      const plans = loadLocalStudyPlan();
      const accuracy = game.attempts > 0 ? Math.round((game.correct / game.attempts) * 100) : 0;
      const completed = plans.filter((p) => p.completed).length;
      const pending = plans.length - completed;
      const prefix = user ? `${user.name}, your ` : "Your ";
      const raw = `${prefix}Braille accuracy is ${accuracy} percent across ${game.attempts} attempts with a current streak of ${game.streak} and best streak of ${game.bestStreak}. Your planner has ${completed} completed and ${pending} pending study sessions.`;
      return {
        success: true,
        message: await localizeReply(raw, activeLang),
        data: { accuracy, streak: game.streak, completed, pending, suggestedPage: "dashboard", suggestedPageLabel: "View Dashboard" },
      };
    }

    case "read_page_content": {
      let pageSummary = "";
      switch (context.currentPage) {
        case "home":
          pageSummary =
            "You are on the Home landing page of BrailleBridge AI. Try the live Braille preview, launch your Progress Dashboard, or jump directly to any accessible learning tool.";
          break;
        case "dashboard":
          pageSummary =
            "You are on your Progress and Saved Vault Dashboard. Here you can inspect your Braille accuracy streaks, study timetable progress, saved study notes, and saved college notices.";
          break;
        case "translator":
          pageSummary =
            "You are on the Braille Translator. You can select language standards like English UEB, Hindi, Kannada, Tamil, or Bengali, voice-type text, and use the 6-key Perkins simulator.";
          break;
        case "study":
          pageSummary =
            "You are on the AI Study Companion. You can upload PDF, text, or image study notes, listen with play, pause, resume controls, ask grounded questions, and take practice quizzes.";
          break;
        case "games":
          pageSummary =
            "You are on Braille Learning Games. Five activities are available: Dot Detective, Hear It Spell It, Pattern Builder, Memory Practice, and Language Bridge.";
          break;
        case "notice":
          pageSummary =
            "You are on the Notice & Form Assistant. Upload university circulars or scholarship notices to extract deadlines, eligibility, required documents, and offline calendar reminders.";
          break;
        case "planner" as any:
          pageSummary =
            "You are on the Study Planner and Timetable. Here you can review upcoming study sessions, detect scheduling conflicts, hear today's agenda aloud, and export calendar reminders.";
          break;
        case "document":
          pageSummary =
            "You are on the Study Companion. Upload PDF or text documents, listen aloud with audio controls, ask grounded questions, and generate quizzes.";
          break;
        case "voice":
          pageSummary =
            "You are on the Multilingual Voice Assistant workspace. Speak commands or type phrases in English, Kannada, Hindi, Tamil, or Bengali.";
          break;
        case "about":
          pageSummary =
            "You are on Accessibility & About. Here you can adjust font scaling, toggle high contrast mode, and review keyboard shortcuts.";
          break;
      }
      return { success: true, message: await localizeReply(pageSummary, activeLang) };
    }

    case "check_conflicts": {
      const existing = loadLocalStudyPlan();
      const newStart = new Date(`${step.parameters.date}T${step.parameters.time}:00`);
      const newEnd = new Date(newStart.getTime() + (step.parameters.durationMinutes || 60) * 60000);
      const conflicts = checkSchedulingConflicts(
        newStart,
        newEnd,
        existing.map((e) => ({
          id: e.id,
          title: e.title,
          start: `${e.date}T${e.time}:00`,
          end: `${e.date}T${e.time}:00`,
        }))
      );

      if (conflicts.length > 0) {
        return {
          success: true,
          message: `Notice: You have an existing event "${conflicts[0].title}" around that time.`,
          data: { conflicts },
        };
      }
      return {
        success: true,
        message: "No scheduling conflicts detected in your agenda.",
        data: { conflicts: [] },
      };
    }

    case "cancel_action": {
      return {
        success: true,
        message: phrases.actionCanceled,
      };
    }

    case "repeat_statement": {
      const prev = getLastSpokenText();
      return {
        success: true,
        message: prev ? `${phrases.repeatPrefix}${prev}` : phrases.nothingToRepeat,
      };
    }

    case "query_status": {
      const primary = activeLang.split("-")[0].toLowerCase();
      return {
        success: true,
        message:
          primary !== "en"
            ? phrases.whatAmIDoingIdle
            : `BrailleBridge Agent is active on the ${context.currentPage} page. Speech rate is ${context.speechSpeed}x. Ready for your instructions.`,
      };
    }

    case "undo_last_action": {
      if (lastCreatedStudySessionId) {
        deleteLocalStudyItem(lastCreatedStudySessionId);
        lastCreatedStudySessionId = null;
        return {
          success: true,
          message: phrases.actionUndone,
        };
      }
      return {
        success: true,
        message: phrases.nothingToUndo,
      };
    }

    case "schedule_study_session": {
      // Create local item
      const newItem = addLocalStudyItem({
        title: step.parameters.title,
        date: step.parameters.date,
        time: step.parameters.time,
        durationMinutes: step.parameters.durationMinutes || 60,
        subject: step.parameters.subject || "Study",
        completed: false,
        notes: "Scheduled via BrailleBridge Voice Agent.",
      });

      lastCreatedStudySessionId = newItem.id;

      return {
        success: true,
        message: `Scheduled "${newItem.title}" for ${newItem.date} at ${newItem.time}.`,
        data: newItem,
      };
    }

    case "read_today_schedule": {
      const todayStr = new Date().toISOString().split("T")[0];
      const allItems = loadLocalStudyPlan();
      const todayItems = allItems.filter((i) => i.date === todayStr);
      if (todayItems.length === 0) {
        return {
          success: true,
          message: `You have no study sessions scheduled for today. You have ${allItems.length} total session(s) on your timetable.`,
        };
      }
      const list = todayItems
        .map((it, i) => `Session ${i + 1}: ${it.title} at ${it.time} for ${it.durationMinutes} minutes`)
        .join(". ");
      return {
        success: true,
        message: `Today you have ${todayItems.length} session(s): ${list}.`,
        data: todayItems,
      };
    }

    case "translate_text": {
      const inputText = String(step.parameters.text || "").trim();
      const langPrimary = activeLang.split("-")[0].toLowerCase();
      const tableMap: Record<string, string> = {
        hi: "hi-in-g1",
        kn: "kn-in-g1",
        ta: "ta-in-g1",
        bn: "bn-in-g1",
        en: "en-ueb-g1",
      };
      const tableId = tableMap[langPrimary] || "en-ueb-g1";
      const res = translate(inputText, tableId);
      if (res.success) {
        setPendingTranslatorLoad({ text: inputText, tableId });
      }
      return {
        success: res.success,
        message: res.success
          ? `Translated "${inputText}" into ${res.cellCount} Braille cells: ${res.brailleText}`
          : res.error || "Translation failed.",
        data: { ...res, suggestedPage: "translator", suggestedPageLabel: "Open in Translator" },
      };
    }

    case "context_help": {
      return { success: true, message: phrases.helpGeneral };
    }

    case "explain_concept": {
      const concept = step.parameters.concept || "";
      const activeDoc = getActiveDocumentContext();
      if (activeDoc?.text) {
        const qa = await queryBackendAgentAnswer(`explain ${concept}`, context.currentPage, activeLang);
        return {
          success: true,
          message: qa.message,
          data: qa,
        };
      }
      const fallbackMsg = await localizeReply(
        `Explanation for ${concept}: No study document is currently uploaded. Go to Study Companion (Alt+3) to upload notes so I can explain "${concept}" directly from your material.`,
        activeLang
      );
      return {
        success: true,
        message: fallbackMsg,
        data: { suggestedPage: "study", suggestedPageLabel: "Open Study Companion", grounded: false },
      };
    }

    case "general_agent_response": {
      const q = String(step.parameters.query || "");
      const qa = await queryBackendAgentAnswer(q, context.currentPage, activeLang);
      return {
        success: true,
        message: qa.message,
        data: qa,
      };
    }

    default: {
      const q = step.parameters?.query || step.description || "";
      const qa = await queryBackendAgentAnswer(q, context.currentPage, activeLang);
      return {
        success: true,
        message: qa.message,
        data: qa,
      };
    }
  }
}
