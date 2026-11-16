import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  Award,
  BookOpen,
  CalendarCheck,
  FileText,
  Flame,
  RefreshCw,
  Trash2,
  Volume2,
  ArrowRight,
  CheckCircle2,
  Circle,
  Sliders,
  UserCheck,
  Pencil,
  Check,
  Sparkles,
} from "lucide-react";
import { NavPage } from "../components/Header";
import { ScriptVaultPanel } from "../components/ScriptVaultPanel";
import {
  AuthUser,
  getStoredStudentName,
  saveStudentName,
} from "../services/authService";
import { ScriptVaultKey } from "../services/brailleService";
import {
  loadGameProgress,
  saveGameProgress,
  GameScoreState,
} from "../services/gamesService";
import {
  loadLocalStudyPlan,
  saveLocalStudyPlan,
  toggleLocalStudyItem,
  StudyPlanItem,
} from "../services/calendarService";
import {
  fetchGameProgressFromCloud,
  fetchStudyPlansFromCloud,
  fetchStudyNotesFromCloud,
  fetchCollegeNoticesFromCloud,
  deleteStudyNoteFromCloud,
  deleteCollegeNoticeFromCloud,
  deleteStudyPlanFromCloud,
  CloudStudyNote,
  CloudCollegeNotice,
} from "../services/supabaseService";
import {
  setPendingNoteLoad,
  setPendingNoticeLoad,
  setPendingTranslatorLoad,
  consumePendingDashboardTab,
  setActiveDocumentContext,
  setActiveNoticeContext,
} from "../services/appContextService";
import {
  speakText,
  getActiveLanguage,
  getPunctuationMode,
  prepareAudioForSpeech,
} from "../services/speechService";
import { SignalMark, SignalState } from "../components/SignalMark";

interface DashboardViewProps {
  onNavigate: (page: NavPage) => void;
  fontSizeScale: number;
  isHighContrast: boolean;
  speechSpeed: number;
  currentUser?: AuthUser | null;
  onUserChange?: (user: AuthUser | null) => void;
}

type VaultTab = "all" | "notes" | "notices" | "schedule" | "games" | "scriptvault";

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  fontSizeScale,
  isHighContrast,
  speechSpeed,
  currentUser = null,
  onUserChange,
}) => {
  const [gameState, setGameState] = useState<GameScoreState>(loadGameProgress());
  const [studyPlans, setStudyPlans] = useState<StudyPlanItem[]>(loadLocalStudyPlan());
  const [savedNotes, setSavedNotes] = useState<CloudStudyNote[]>([]);
  const [savedNotices, setSavedNotices] = useState<CloudCollegeNotice[]>([]);
  const [activeTab, setActiveTab] = useState<VaultTab>("all");
  const [vaultScript, setVaultScript] = useState<ScriptVaultKey>("en-ueb");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeLang, setActiveLang] = useState<string>(getActiveLanguage());
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState<string>(
    "All saved notes, notices, game streaks, and study timetable progress are synced here."
  );

  // Student Profile (Name-Only) state
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [studentNameInput, setStudentNameInput] = useState<string>("");
  const [nameSaving, setNameSaving] = useState<boolean>(false);
  const [nameError, setNameError] = useState<string>("");

  const loadAllProgress = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [cloudGame, cloudPlans, notes, notices] = await Promise.all([
        fetchGameProgressFromCloud(),
        fetchStudyPlansFromCloud(),
        fetchStudyNotesFromCloud(),
        fetchCollegeNoticesFromCloud(),
      ]);

      if (cloudGame) {
        const local = loadGameProgress();
        const merged: GameScoreState = {
          attempts: Math.max(local.attempts, cloudGame.attempts),
          correct: Math.max(local.correct, cloudGame.correct),
          streak: Math.max(local.streak, cloudGame.streak),
          bestStreak: Math.max(local.bestStreak, cloudGame.bestStreak),
          history:
            cloudGame.history && cloudGame.history.length > 0
              ? (cloudGame.history as any)
              : local.history,
        };
        setGameState(merged);
        saveGameProgress(merged);
      }

      if (cloudPlans && cloudPlans.length > 0) {
        const local = loadLocalStudyPlan();
        const map = new Map<string, StudyPlanItem>();
        local.forEach((p) => map.set(p.id, p));
        cloudPlans.forEach((c) => map.set(c.id, c));
        const mergedPlans = Array.from(map.values());
        setStudyPlans(mergedPlans);
        saveLocalStudyPlan(mergedPlans);
      } else {
        setStudyPlans(loadLocalStudyPlan());
      }

      if (notes) setSavedNotes(notes);
      if (notices) setSavedNotices(notices);

      setSignalState("success");
      setSignalMessage("Dashboard refreshed with latest saved items and progress.");
    } catch {
      setSignalState("idle");
      setSignalMessage("Showing locally cached progress.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllProgress();
    const pendingTab = consumePendingDashboardTab();
    if (pendingTab) {
      setActiveTab(pendingTab.tab);
      if (pendingTab.scriptKey) setVaultScript(pendingTab.scriptKey);
    }

    const syncLang = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom?.detail) setActiveLang(custom.detail);
    };
    const onTabSwitch = (e: Event) => {
      const custom = e as CustomEvent<{ tab: VaultTab; scriptKey?: ScriptVaultKey }>;
      if (custom?.detail?.tab) setActiveTab(custom.detail.tab);
      if (custom?.detail?.scriptKey) setVaultScript(custom.detail.scriptKey);
    };
    window.addEventListener("braillebridge-language-change", syncLang);
    window.addEventListener("braillebridge-dashboard-tab", onTabSwitch);
    return () => {
      window.removeEventListener("braillebridge-language-change", syncLang);
      window.removeEventListener("braillebridge-dashboard-tab", onTabSwitch);
    };
  }, [loadAllProgress]);

  useEffect(() => {
    const onSpaceRead = () => {
      speakDashboardSummary();
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  });

  const handleOpenEditName = () => {
    const existing = currentUser?.name || getStoredStudentName() || "Jagruti";
    setStudentNameInput(existing);
    setNameError("");
    setIsEditingName(true);
  };

  const handleSaveStudentName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError("");
    const clean = studentNameInput.trim();
    if (clean.length < 2) {
      const msg = "Please enter your name (at least 2 characters).";
      setNameError(msg);
      speakText(msg, { lang: activeLang });
      return;
    }

    setNameSaving(true);
    try {
      const updatedUser = await saveStudentName(clean);
      onUserChange?.(updatedUser);
      setIsEditingName(false);
      setSignalState("success");
      setSignalMessage(`Student name updated to "${clean}".`);
      speakText(`Student name updated to ${clean}.`, { lang: activeLang });
    } catch {
      setNameError("Could not update student name. Please try again.");
    } finally {
      setNameSaving(false);
    }
  };

  const speakDashboardSummary = async () => {
    prepareAudioForSpeech();
    const accuracy =
      gameState.attempts > 0
        ? Math.round((gameState.correct / gameState.attempts) * 100)
        : 0;
    const completedCount = studyPlans.filter((p) => p.completed).length;
    const pendingCount = studyPlans.length - completedCount;
    const greeting = currentUser ? `Welcome back, ${currentUser.name}. ` : "";

    let msg = `${greeting}Your BrailleBridge progress summary: In Braille Games, you have answered ${gameState.attempts} questions with ${accuracy} percent accuracy, a current streak of ${gameState.streak}, and a best streak of ${gameState.bestStreak}. In your Study Planner, you have ${completedCount} completed sessions and ${pendingCount} pending sessions. Your Saved Vault contains ${savedNotes.length} saved study note files and ${savedNotices.length} saved college notices.`;

    const short = activeLang.split("-")[0].toLowerCase();
    if (short !== "en") {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: msg, sourceLang: "en", targetLang: short }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.translatedText) msg = data.translatedText;
        }
      } catch {
        // fallback to English
      }
    }
    speakText(msg, { lang: activeLang, rate: speechSpeed });
  };

  const handleOpenSavedNote = (note: CloudStudyNote) => {
    setPendingNoteLoad({
      id: note.id,
      title: note.title,
      filename: note.filename,
      content: note.content,
      wordCount: note.wordCount,
    });
    setActiveDocumentContext({
      filename: note.filename,
      text: note.content,
      wordCount: note.wordCount,
      method: "Saved Study Note",
      updatedAt: Date.now(),
    });
    onNavigate("study");
  };

  const handleDeleteNote = async (id: string, title: string) => {
    await deleteStudyNoteFromCloud(id);
    setSavedNotes((prev) => prev.filter((n) => n.id !== id));
    setSignalState("success");
    setSignalMessage(`Deleted saved note "${title}".`);
    speakText(`Removed note ${title}.`, { lang: activeLang });
  };

  const handleOpenSavedNotice = (notice: CloudCollegeNotice) => {
    setPendingNoticeLoad({
      id: notice.id,
      title: notice.title,
      summary: notice.summary,
      deadlines: notice.deadlines || [],
      eligibility: notice.eligibility || [],
      requiredDocuments: notice.requiredDocuments || [],
      nextSteps: notice.nextSteps || [],
    });
    setActiveNoticeContext({
      filename: notice.title,
      text: notice.summary,
      summary: notice.summary,
      deadlinesCount: notice.deadlines?.length || 0,
      updatedAt: Date.now(),
    });
    onNavigate("notice");
  };

  const handleDeleteNotice = async (id: string, title: string) => {
    await deleteCollegeNoticeFromCloud(id);
    setSavedNotices((prev) => prev.filter((n) => n.id !== id));
    setSignalState("success");
    setSignalMessage(`Deleted saved notice "${title}".`);
    speakText(`Removed notice ${title}.`, { lang: activeLang });
  };

  const handleTogglePlanDone = (id: string) => {
    toggleLocalStudyItem(id);
    setStudyPlans(loadLocalStudyPlan());
  };

  const handleDeletePlan = async (id: string, title: string) => {
    const updated = studyPlans.filter((p) => p.id !== id);
    setStudyPlans(updated);
    saveLocalStudyPlan(updated);
    await deleteStudyPlanFromCloud(id);
    setSignalState("success");
    setSignalMessage(`Removed "${title}" from timetable.`);
  };

  const accuracyPercent =
    gameState.attempts > 0 ? Math.round((gameState.correct / gameState.attempts) * 100) : 0;
  const completedPlans = studyPlans.filter((p) => p.completed).length;
  const planCompletionPct =
    studyPlans.length > 0 ? Math.round((completedPlans / studyPlans.length) * 100) : 0;
  const totalNoteWords = savedNotes.reduce((sum, n) => sum + (n.wordCount || 0), 0);
  const totalDeadlinesSaved = savedNotices.reduce(
    (sum, n) => sum + (n.deadlines?.length || 0),
    0
  );

  return (
    <main id="main-content" className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {/* Header Row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#3155E7] mb-1">
            Personal Learning Hub
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#202522]">
            {`Welcome back, ${currentUser?.name || getStoredStudentName() || "Student"}`}
          </h1>
          <p className="text-base text-[#4b5750] mt-2 max-w-2xl">
            Track your Braille mastery streaks, timetable completion, saved study documents, Script Knowledge Vault, and analyzed college notices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenEditName}
            className="px-3.5 py-2.5 bg-[#fffefa] border border-[#c2e4d3] text-[#0f8872] text-xs font-bold rounded-md hover:bg-[#e9f5ef] transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Edit student name"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Edit Name</span>
          </button>
          <button
            onClick={speakDashboardSummary}
            className="px-4 py-2.5 bg-[#3155E7] text-white text-xs font-bold rounded-md hover:bg-[#233fbe] transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
            <span>Read My Progress</span>
          </button>

          <button
            onClick={loadAllProgress}
            disabled={isRefreshing}
            className="px-3.5 py-2.5 bg-[#fffefa] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded-md hover:border-[#3155E7] transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>{isRefreshing ? "Syncing…" : "Refresh"}</span>
          </button>
        </div>
      </motion.div>

      {/* Student Profile & Personalization Banner */}
      <section
        aria-label="Student Profile"
        className="p-5 sm:p-6 bg-[#fffefa] border-2 border-[#c2e4d3] rounded-2xl shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#e9f5ef] text-[#0f8872] flex items-center justify-center shrink-0">
              <UserCheck className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#1b211d]">
                  Student: <span className="text-[#0f8872]">{currentUser?.name || getStoredStudentName() || "Jagruti"}</span>
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#e9f5ef] text-[#0f8872] border border-[#c2e4d3]">
                  Active Profile
                </span>
              </div>
              <p className="text-xs text-[#4e5b52] mt-0.5 max-w-xl">
                Your learning progress, game streaks, study planner sessions, and saved notes are personalized for you. You can change your name anytime.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isEditingName) {
                setIsEditingName(false);
              } else {
                handleOpenEditName();
              }
            }}
            aria-expanded={isEditingName}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#fffefa] text-[#2847cf] border border-[#c7d1f7] hover:bg-[#e4e8fb] font-bold text-xs transition shadow-2xs shrink-0 self-start sm:self-center"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isEditingName ? "Cancel Editing" : "✏️ Edit Name"}</span>
          </button>
        </div>

        {isEditingName && (
          <form
            onSubmit={handleSaveStudentName}
            aria-label="Change student name"
            className="pt-3.5 border-t border-[#eeece5] space-y-3"
          >
            <div className="max-w-md">
              <label
                htmlFor="dashboard-edit-name"
                className="block text-xs font-bold text-[#222824] mb-1.5"
              >
                Change Your Name
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  id="dashboard-edit-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={studentNameInput}
                  onChange={(e) => setStudentNameInput(e.target.value)}
                  placeholder="e.g., Jagruti"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-[#d8d7d0] bg-[#f8f7f2] text-sm font-semibold text-[#202522] focus:outline-none focus:ring-2 focus:ring-[#3155E7]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={nameSaving}
                    className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded-xl hover:bg-[#233fbe] transition disabled:opacity-50 shadow-2xs flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{nameSaving ? "Saving…" : "Save Name"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(false)}
                    className="px-3 py-2 bg-transparent border border-[#d8d7d0] text-[#556358] text-xs font-bold rounded-xl hover:bg-[#f1efe9] transition whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {nameError && (
                <p className="text-xs text-[#9b302d] font-semibold mt-1.5" role="alert">
                  {nameError}
                </p>
              )}
            </div>
          </form>
        )}
      </section>

      {/* Signal Strip */}
      <div className="p-3 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
        <SignalMark state={signalState} message={signalMessage} />
      </div>

      {/* 4 Animated Metric Overview Cards */}
      <section aria-label="Progress summary metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          whileHover={{ y: -3 }}
          className="p-5 bg-[#fffefa] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-lg shadow-sm space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase text-[#59685d]">
            <span>Braille Accuracy</span>
            <Award className="w-4 h-4 text-[#3155E7]" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <strong className="text-3xl font-bold text-[#202522]">{accuracyPercent}%</strong>
            <span className="text-xs text-[#59685d]">
              ({gameState.correct}/{gameState.attempts} correct)
            </span>
          </div>
          <div className="w-full h-2 bg-[#eeece5] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${accuracyPercent}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full bg-[#3155E7] rounded-full"
            />
          </div>
          <div className="flex items-center justify-between text-xs pt-1 text-[#4b5750]">
            <span className="flex items-center gap-1 font-semibold">
              <Flame className="w-3.5 h-3.5 text-[#3155E7]" aria-hidden="true" />
              Streak: {gameState.streak}
            </span>
            <span>Best: {gameState.bestStreak}</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -3 }}
          className="p-5 bg-[#fffefa] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-lg shadow-sm space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase text-[#59685d]">
            <span>Study Timetable</span>
            <CalendarCheck className="w-4 h-4 text-[#3155E7]" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <strong className="text-3xl font-bold text-[#202522]">
              {completedPlans}/{studyPlans.length}
            </strong>
            <span className="text-xs text-[#59685d]">sessions done</span>
          </div>
          <div className="w-full h-2 bg-[#eeece5] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${planCompletionPct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full bg-emerald-600 rounded-full"
            />
          </div>
          <p className="text-xs text-[#4b5750] pt-1">
            {studyPlans.length - completedPlans} remaining · {planCompletionPct}% complete
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          whileHover={{ y: -3 }}
          className="p-5 bg-[#fffefa] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-lg shadow-sm space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase text-[#59685d]">
            <span>Saved Study Notes</span>
            <BookOpen className="w-4 h-4 text-[#3155E7]" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <strong className="text-3xl font-bold text-[#202522]">{savedNotes.length}</strong>
            <span className="text-xs text-[#59685d]">saved files</span>
          </div>
          <p className="text-xs text-[#4b5750] pt-2">
            {totalNoteWords.toLocaleString()} total words indexed for Q&A & quizzes.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ y: -3 }}
          className="p-5 bg-[#fffefa] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-lg shadow-sm space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase text-[#59685d]">
            <span>Saved Notices</span>
            <FileText className="w-4 h-4 text-[#3155E7]" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <strong className="text-3xl font-bold text-[#202522]">{savedNotices.length}</strong>
            <span className="text-xs text-[#59685d]">circulars</span>
          </div>
          <p className="text-xs text-[#4b5750] pt-2">
            {totalDeadlinesSaved} verified deadline(s) extracted across saved notices.
          </p>
        </motion.div>
      </section>

      {/* Filter Tabs */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-[#d8d7d0] pb-3"
        role="tablist"
        aria-label="Filter saved items"
      >
        {(
          [
            { id: "all", label: "All Saved Items" },
            { id: "scriptvault", label: "Script Knowledge Vault" },
            { id: "notes", label: `Study Notes (${savedNotes.length})` },
            { id: "notices", label: `Notices (${savedNotices.length})` },
            { id: "schedule", label: `Timetable (${studyPlans.length})` },
            { id: "games", label: `Braille Activity (${gameState.history.length})` },
          ] as const
        ).map((tab) => {
          const isSel = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isSel}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 text-xs font-bold rounded border transition-colors ${
                isSel
                  ? "bg-[#3155E7] text-white border-[#3155E7]"
                  : "bg-[#fffefa] text-[#4b5750] border-[#d8d7d0] hover:border-[#3155E7]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SAVED STUDY NOTES */}
      {(activeTab === "all" || activeTab === "notes") && (
        <section aria-labelledby="vault-notes-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="vault-notes-heading" className="text-lg font-bold text-[#202522]">
              Saved Study Notes ({savedNotes.length})
            </h2>
            <button
              onClick={() => onNavigate("study")}
              className="text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1"
            >
              <span>Upload / Add Notes</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {savedNotes.length === 0 ? (
            <div className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md text-xs text-[#59685d]">
              No study notes saved yet. Upload a PDF, text, or image in{" "}
              <button
                onClick={() => onNavigate("study")}
                className="text-[#3155E7] font-bold underline"
              >
                Study Companion
              </button>{" "}
              and click <strong>Save Note</strong> to keep it here.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedNotes.map((note) => (
                <article
                  key={note.id}
                  className="p-5 bg-[#fffefa] border border-[#d8d7d0] rounded-md space-y-3 hover:border-[#3155E7] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[#202522]">{note.title}</h3>
                      <p className="text-[11px] text-[#59685d]">
                        {note.filename} · {note.wordCount} words
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteNote(note.id, note.title)}
                      className="text-[#9b302d] p-1 hover:bg-[#f6e2df] rounded"
                      aria-label={`Delete saved note ${note.title}`}
                      title="Delete note"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>

                  {note.summary && (
                    <p className="text-xs text-[#4b5750] line-clamp-2 leading-relaxed">
                      {note.summary}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#eeece5]">
                    <button
                      onClick={() => handleOpenSavedNote(note)}
                      className="px-3 py-1.5 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe]"
                    >
                      Open in Study Companion →
                    </button>
                    <button
                      onClick={() =>
                        speakText(`${note.title}. ${note.summary || note.content.slice(0, 300)}`, {
                          lang: activeLang,
                          rate: speechSpeed,
                        })
                      }
                      className="px-3 py-1.5 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
                    >
                      🔊 Listen
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SAVED COLLEGE NOTICES */}
      {(activeTab === "all" || activeTab === "notices") && (
        <section aria-labelledby="vault-notices-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="vault-notices-heading" className="text-lg font-bold text-[#202522]">
              Saved College Notices & Forms ({savedNotices.length})
            </h2>
            <button
              onClick={() => onNavigate("notice")}
              className="text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1"
            >
              <span>Analyze New Notice</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {savedNotices.length === 0 ? (
            <div className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md text-xs text-[#59685d]">
              No college notices saved yet. Inspect a scholarship or exam notice in{" "}
              <button
                onClick={() => onNavigate("notice")}
                className="text-[#3155E7] font-bold underline"
              >
                Notice Assistant
              </button>{" "}
              and click <strong>Save Notice</strong>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedNotices.map((notice) => (
                <article
                  key={notice.id}
                  className="p-5 bg-[#fffefa] border border-[#d8d7d0] rounded-md space-y-3 hover:border-[#3155E7] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[#202522]">{notice.title}</h3>
                      <p className="text-[11px] text-[#3155E7] font-bold">
                        {notice.deadlines?.length || 0} deadlines ·{" "}
                        {notice.requiredDocuments?.length || 0} required docs
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteNotice(notice.id, notice.title)}
                      className="text-[#9b302d] p-1 hover:bg-[#f6e2df] rounded"
                      aria-label={`Delete saved notice ${notice.title}`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>

                  <p className="text-xs text-[#4b5750] line-clamp-2 leading-relaxed">
                    {notice.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#eeece5]">
                    <button
                      onClick={() => handleOpenSavedNotice(notice)}
                      className="px-3 py-1.5 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe]"
                    >
                      Inspect Full Notice →
                    </button>
                    <button
                      onClick={() =>
                        speakText(`Notice: ${notice.title}. ${notice.summary}`, {
                          lang: activeLang,
                          rate: speechSpeed,
                        })
                      }
                      className="px-3 py-1.5 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
                    >
                      🔊 Listen
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* STUDY TIMETABLE SNAPSHOT */}
      {(activeTab === "all" || activeTab === "schedule") && (
        <section aria-labelledby="vault-schedule-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="vault-schedule-heading" className="text-lg font-bold text-[#202522]">
              Study Timetable Progress ({completedPlans}/{studyPlans.length})
            </h2>
            <button
              onClick={() => onNavigate("planner")}
              className="text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1"
            >
              <span>Manage Full Planner</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {studyPlans.map((plan) => (
              <div
                key={plan.id}
                className="p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleTogglePlanDone(plan.id)}
                    className="mt-0.5 text-[#3155E7]"
                    aria-label={
                      plan.completed
                        ? `Mark ${plan.title} as pending`
                        : `Mark ${plan.title} as completed`
                    }
                  >
                    {plan.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Circle className="w-5 h-5" aria-hidden="true" />
                    )}
                  </button>
                  <div>
                    <h3
                      className={`text-sm font-bold text-[#202522] ${
                        plan.completed ? "line-through opacity-70" : ""
                      }`}
                    >
                      {plan.title}
                    </h3>
                    <p className="text-xs text-[#59685d]">
                      {plan.subject} · {plan.date} at {plan.time} ({plan.durationMinutes} min)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePlan(plan.id, plan.title)}
                  className="text-[#9b302d] p-1 hover:bg-[#f6e2df] rounded"
                  aria-label={`Remove ${plan.title}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* BRAILLE GAMES RECENT ACTIVITY */}
      {(activeTab === "all" || activeTab === "games") && (
        <section aria-labelledby="vault-games-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="vault-games-heading" className="text-lg font-bold text-[#202522]">
              Recent Braille Practice History
            </h2>
            <button
              onClick={() => onNavigate("games")}
              className="text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1"
            >
              <span>Play Braille Games</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {gameState.history.length === 0 ? (
            <div className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md text-xs text-[#59685d]">
              No practice rounds completed yet. Try{" "}
              <button
                onClick={() => onNavigate("games")}
                className="text-[#3155E7] font-bold underline"
              >
                Dot Detective or Pattern Builder
              </button>{" "}
              to build your streak!
            </div>
          ) : (
            <div className="bg-[#fffefa] border border-[#d8d7d0] rounded-md divide-y divide-[#eeece5]">
              {gameState.history.slice(0, 8).map((entry, idx) => (
                <div
                  key={idx}
                  className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-[#202522] uppercase tracking-wider text-[10px] mr-2 text-[#3155E7]">
                      {entry.game.replace(/_/g, " ")}
                    </span>
                    <span className="text-[#202522] font-medium">{entry.question}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#59685d] font-mono">
                      Answered: <strong>{entry.userAnswer}</strong>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        entry.isCorrect
                          ? "bg-[#eaf5ec] text-[#1e612f]"
                          : "bg-[#f6e2df] text-[#762522]"
                      }`}
                    >
                      {entry.isCorrect ? "✓ Correct" : `✗ Target: ${entry.correctAnswer}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SCRIPT KNOWLEDGE VAULT */}
      {(activeTab === "scriptvault" || activeTab === "all") && (
        <section aria-label="Script Knowledge Vault" className="space-y-3">
          <ScriptVaultPanel
            initialScript={vaultScript}
            compact={activeTab === "all"}
            onPracticeSymbol={(symbolText, tableId) => {
              setPendingTranslatorLoad({ text: symbolText, tableId });
              onNavigate("translator");
            }}
          />
        </section>
      )}

      {/* ACTIVE ACCESSIBILITY PROFILE CARD */}
      <section className="p-5 bg-[#fffefa] border border-[#d8d7d0] rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Sliders className="w-5 h-5 text-[#3155E7] mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-[#202522]">Saved Accessibility Profile</h2>
            <p className="text-xs text-[#4b5750] mt-0.5">
              Voice Language: <strong>{activeLang}</strong> · Font Scale:{" "}
              <strong>{Math.round(fontSizeScale * 100)}% (Atkinson Hyperlegible)</strong> · Theme:{" "}
              <strong>{isHighContrast ? "High Contrast AAA" : "Standard Parchment"}</strong> ·
              Speech Reading: <strong>{getPunctuationMode()}</strong>
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigate("about")}
          className="px-3.5 py-2 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7] shrink-0"
        >
          Adjust Settings
        </button>
      </section>
    </main>
  );
};

