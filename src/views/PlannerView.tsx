import React, { useState, useEffect } from "react";
import {
  checkSchedulingConflicts,
  loadLocalStudyPlan,
  addLocalStudyItem,
  deleteLocalStudyItem,
  toggleLocalStudyItem,
  syncStudyPlanWithCloud,
  CalendarEvent,
  StudyPlanItem,
} from "../services/calendarService";
import {
  speakText,
  startListening,
  stopListening,
  getActiveLanguage,
} from "../services/speechService";
import { generateICalendarEvent } from "../services/noticeService";
import { SignalMark, SignalState } from "../components/SignalMark";
import { VoiceDictationButton } from "../components/VoiceDictationButton";

type PlannerTab = "today" | "upcoming" | "all" | "completed";

export const PlannerView: React.FC = () => {
  const [localItems, setLocalItems] = useState<StudyPlanItem[]>(loadLocalStudyPlan());
  const [activeTab, setActiveTab] = useState<PlannerTab>("all");
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [activeLang, setActiveLang] = useState<string>(getActiveLanguage());
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState<string>(
    "Step 1: Add or dictate a study session below. Step 2: Review Today, Upcoming, or Completed sessions."
  );

  // New Session Form state
  const todayStr = new Date().toISOString().split("T")[0];
  const [eventTitle, setEventTitle] = useState<string>("");
  const [eventDate, setEventDate] = useState<string>(todayStr);
  const [eventTime, setEventTime] = useState<string>("16:00");
  const [eventDuration, setEventDuration] = useState<number>(60);
  const [eventSubject, setEventSubject] = useState<string>("General Study");

  // Delete Safety Confirmation Modal State
  const [pendingDeleteItem, setPendingDeleteItem] = useState<StudyPlanItem | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string>("");
  const [isDictatingForm, setIsDictatingForm] = useState<boolean>(false);

  // Sync timetable with database backend & keep language synced on mount
  useEffect(() => {
    syncStudyPlanWithCloud()
      .then(() => setLocalItems(loadLocalStudyPlan()))
      .catch(() => {});

    const syncLang = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom?.detail) setActiveLang(custom.detail);
    };
    window.addEventListener("braillebridge-language-change", syncLang);
    return () => window.removeEventListener("braillebridge-language-change", syncLang);
  }, []);

  // Check real-time scheduling conflicts while editing date/time
  useEffect(() => {
    if (!eventDate || !eventTime) return;
    const start = new Date(`${eventDate}T${eventTime}:00`);
    const end = new Date(start.getTime() + eventDuration * 60000);

    const existingEvents: CalendarEvent[] = localItems
      .filter((i) => !i.completed)
      .map((item) => ({
        id: item.id,
        title: item.title,
        start: `${item.date}T${item.time}:00`,
        end: new Date(
          new Date(`${item.date}T${item.time}:00`).getTime() + item.durationMinutes * 60000
        ).toISOString(),
      }));

    const conflicts = checkSchedulingConflicts(start, end, existingEvents);
    if (conflicts.length > 0) {
      setConflictWarning(
        `Scheduling overlap detected: conflicts with "${conflicts[0].title}" at ${new Date(
          conflicts[0].start
        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Choose another time or save intentionally.`
      );
    } else {
      setConflictWarning("");
    }
  }, [eventDate, eventTime, eventDuration, localItems]);

  const speakInActiveLang = async (englishText: string) => {
    const short = activeLang.split("-")[0].toLowerCase();
    if (short !== "en") {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: englishText, sourceLang: "en", targetLang: short }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.translatedText) {
            speakText(d.translatedText, { lang: activeLang });
            return;
          }
        }
      } catch {
        // Fallback below
      }
    }
    speakText(englishText, { lang: activeLang });
  };

  const handleSyncWithCloud = async () => {
    setIsSyncingCloud(true);
    setSignalState("processing");
    setSignalMessage("Synchronizing your timetable with saved schedule…");

    const res = await syncStudyPlanWithCloud();
    setLocalItems(loadLocalStudyPlan());
    setIsSyncingCloud(false);

    if (res.success) {
      setSignalState("success");
      setSignalMessage(res.message);
      speakInActiveLang(res.message);
    } else {
      setSignalState("error");
      setSignalMessage(res.message);
    }
  };

  const handleDictateFullSession = () => {
    if (isDictatingForm) {
      stopListening();
      setIsDictatingForm(false);
      setSignalState("idle");
      setSignalMessage("Voice dictation stopped.");
      return;
    }

    setIsDictatingForm(true);
    setSignalState("listening");
    setSignalMessage(
      `Listening in ${activeLang}. Example: "Math revision tomorrow at 4 PM for 60 minutes".`
    );

    startListening(
      {
        onStart: () => setIsDictatingForm(true),
        onResult: (finalText) => {
          setIsDictatingForm(false);
          const lower = finalText.toLowerCase();

          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (lower.includes("tomorrow")) {
            setEventDate(tomorrow.toISOString().split("T")[0]);
          } else if (lower.includes("today")) {
            setEventDate(todayStr);
          }

          let parsedTime = eventTime;
          const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
          if (timeMatch) {
            let hr = parseInt(timeMatch[1], 10);
            const min = timeMatch[2] || "00";
            const meridian = timeMatch[3].toLowerCase();
            if (meridian === "pm" && hr < 12) hr += 12;
            if (meridian === "am" && hr === 12) hr = 0;
            parsedTime = `${String(hr).padStart(2, "0")}:${min}`;
          }
          setEventTime(parsedTime);

          let parsedDuration = 60;
          if (lower.includes("30 min") || lower.includes("half an hour")) parsedDuration = 30;
          else if (lower.includes("45 min")) parsedDuration = 45;
          else if (lower.includes("90 min") || lower.includes("1.5 hour")) parsedDuration = 90;
          else if (lower.includes("2 hour") || lower.includes("120 min")) parsedDuration = 120;
          setEventDuration(parsedDuration);

          const cleanTitle = finalText
            .replace(
              /\b(tomorrow|today|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|for\s+\d+(?:\.\d+)?\s*(?:minutes|hours|mins|hour)?)\b/gi,
              ""
            )
            .replace(/\s+/g, " ")
            .trim();
          const extractedTitle = cleanTitle.length > 2 ? cleanTitle : finalText.trim();
          setEventTitle(extractedTitle);

          setSignalState("success");
          const readBack = `Filled form by voice: "${extractedTitle}" at ${parsedTime} for ${parsedDuration} minutes. Press Save Study Session to confirm.`;
          setSignalMessage(readBack);
          speakInActiveLang(readBack);
        },
        onEnd: () => setIsDictatingForm(false),
        onError: (err) => {
          setIsDictatingForm(false);
          setSignalState("error");
          setSignalMessage(`Voice dictation notice: ${err}. You can also type or use per-field voice buttons.`);
        },
      },
      activeLang,
      false
    );
  };

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) {
      setSignalState("error");
      const errMsg = "Please enter or dictate a session title before saving.";
      setSignalMessage(errMsg);
      speakInActiveLang(errMsg);
      return;
    }

    const created = addLocalStudyItem({
      title: eventTitle.trim(),
      date: eventDate,
      time: eventTime,
      durationMinutes: eventDuration,
      subject: eventSubject.trim() || "General Study",
      completed: false,
      notes: "Created in BrailleBridge Study Planner.",
    });

    setLocalItems(loadLocalStudyPlan());
    setEventTitle("");
    setSignalState("success");
    const okMsg = `Saved "${created.title}" on ${created.date} at ${created.time} for ${created.durationMinutes} minutes.`;
    setSignalMessage(okMsg);
    speakInActiveLang(okMsg);
  };

  const handleToggleItem = (item: StudyPlanItem) => {
    toggleLocalStudyItem(item.id);
    const updated = loadLocalStudyPlan();
    setLocalItems(updated);
    const nextState = !item.completed ? "completed" : "pending";
    setSignalState("success");
    setSignalMessage(`Marked "${item.title}" as ${nextState}.`);
    speakInActiveLang(`Marked ${item.title} as ${nextState}.`);
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteItem) return;
    deleteLocalStudyItem(pendingDeleteItem.id);
    setLocalItems(loadLocalStudyPlan());
    const msg = `Deleted "${pendingDeleteItem.title}" from your timetable.`;
    setSignalState("success");
    setSignalMessage(msg);
    speakInActiveLang(msg);
    setPendingDeleteItem(null);
  };

  const handleDownloadSingleICS = (item: StudyPlanItem) => {
    const ics = generateICalendarEvent(
      item.title,
      item.date,
      `${item.subject} study session at ${item.time} (${item.durationMinutes} mins).`
    );
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${item.title.replace(/[^\w]+/g, "_")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    speakInActiveLang(`Downloaded calendar reminder for ${item.title}.`);
  };

  const handleExportAllICS = () => {
    if (localItems.length === 0) {
      speakInActiveLang("Your study agenda is currently empty.");
      return;
    }
    const icsBlocks = localItems
      .map((item) =>
        generateICalendarEvent(
          item.title,
          item.date,
          `${item.subject} study session at ${item.time} for ${item.durationMinutes} minutes.`
        )
      )
      .join("\n");

    const blob = new Blob([icsBlocks], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "BrailleBridge_Study_Timetable.ics";
    a.click();
    URL.revokeObjectURL(url);
    speakInActiveLang("Exported full study timetable to .ICS calendar file.");
  };

  const handleReadTodayAgendaAloud = () => {
    const todayItems = localItems.filter((i) => i.date === todayStr && !i.completed);
    if (todayItems.length === 0) {
      speakInActiveLang(
        "You have no pending study sessions scheduled for today. Use Step 1 below to add one."
      );
      return;
    }
    const details = todayItems
      .map(
        (i, idx) =>
          `Session ${idx + 1}: ${i.title}, subject ${i.subject}, at ${i.time} for ${i.durationMinutes} minutes.`
      )
      .join(" ");
    speakInActiveLang(`Today you have ${todayItems.length} study session(s): ${details}`);
  };

  useEffect(() => {
    const onSpaceRead = () => {
      handleReadTodayAgendaAloud();
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  });

  const handleReadAllAloud = () => {
    const active = localItems.filter((i) => !i.completed);
    if (active.length === 0) {
      speakInActiveLang("You have no active upcoming sessions. Add a study session in Step 1.");
      return;
    }
    const details = active
      .slice(0, 8)
      .map(
        (i, idx) =>
          `Session ${idx + 1}: ${i.title} on ${i.date} at ${i.time} (${i.durationMinutes} minutes).`
      )
      .join(" ");
    speakInActiveLang(`You have ${active.length} active study session(s): ${details}`);
  };

  const handleReadPlannerHelp = () => {
    speakInActiveLang(
      "Study Planner guide: At the top, choose Read Today's Agenda to listen to today's sessions. In Step 1, enter or voice-type a session title, choose date, time, and duration, and press Save Study Session. In Step 2, switch between Today, Upcoming, All, or Completed tabs. You can mark sessions complete, listen individually, or export calendar files."
    );
  };

  // Filtered timetable lists
  const todaySessions = localItems.filter((i) => i.date === todayStr);
  const upcomingSessions = localItems.filter((i) => !i.completed && i.date >= todayStr);
  const completedSessions = localItems.filter((i) => i.completed);

  const visibleItems =
    activeTab === "today"
      ? todaySessions
      : activeTab === "upcoming"
      ? upcomingSessions
      : activeTab === "completed"
      ? completedSessions
      : localItems;

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Eyebrow & Title */}
      <p className="text-xs font-bold uppercase tracking-wider text-[#3155E7] mb-1">
        Guided Schedule & Reminders
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold text-[#202522] mb-3">
        Study Planner & Timetable
      </h1>
      <p className="text-base text-[#4b5750] mb-6 max-w-2xl">
        Follow two simple steps to organize your study sessions, detect timing conflicts automatically,
        hear your agenda aloud, and save progress to your account.
      </p>

      {/* Summary Metrics Strip */}
      <section
        className="grid grid-cols-3 gap-2 sm:gap-4 mb-6"
        aria-label="Study schedule summary"
      >
        <div className="p-2.5 sm:p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md text-center">
          <span className="text-[11px] sm:text-xs font-bold uppercase text-[#59685d] block">Today</span>
          <strong className="text-xl sm:text-2xl font-bold text-[#3155E7]">{todaySessions.length}</strong>
        </div>
        <div className="p-2.5 sm:p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md text-center">
          <span className="text-[11px] sm:text-xs font-bold uppercase text-[#59685d] block">Upcoming</span>
          <strong className="text-xl sm:text-2xl font-bold text-[#202522]">{upcomingSessions.length}</strong>
        </div>
        <div className="p-2.5 sm:p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md text-center">
          <span className="text-[11px] sm:text-xs font-bold uppercase text-[#59685d] block">Completed</span>
          <strong className="text-xl sm:text-2xl font-bold text-emerald-600">{completedSessions.length}</strong>
        </div>
      </section>

      {/* Status Signal */}
      <div className="mb-6 p-3.5 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
        <SignalMark state={signalState} message={signalMessage} />
      </div>

      {/* Voice Agenda & Utility Actions Bar */}
      <section className="p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleReadTodayAgendaAloud}
            className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] transition-colors flex items-center gap-1.5"
          >
            <span>🔊 Read Today's Agenda</span>
          </button>
          <button
            onClick={handleReadAllAloud}
            className="px-3.5 py-2 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
          >
            🔊 Read All Active
          </button>
          <button
            onClick={handleReadPlannerHelp}
            className="px-3.5 py-2 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
          >
            ❓ How It Works
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncWithCloud}
            disabled={isSyncingCloud}
            className="px-3 py-2 bg-[#fffefa] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
          >
            {isSyncingCloud ? "↻ Saving…" : "↻ Sync Schedule"}
          </button>
          <button
            onClick={handleExportAllICS}
            className="px-3 py-2 bg-[#fffefa] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
          >
            ⬇ Export All (.ICS)
          </button>
        </div>
      </section>

      {/* STEP 1: Add a Study Session */}
      <section
        className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm mb-8"
        aria-labelledby="step1-add-session"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-[#eeece5]">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#3155E7] block">
              Step 1 of 2
            </span>
            <h2 id="step1-add-session" className="text-lg font-bold text-[#202522]">
              Add a New Study Session
            </h2>
            <p className="text-xs text-[#59685d]">
              Type details or press the voice button to fill automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDictateFullSession}
            className={`px-4 py-2 text-xs font-bold rounded flex items-center gap-1.5 transition-all ${
              isDictatingForm
                ? "bg-[#9b302d] text-white animate-pulse"
                : "bg-[#F7F5EF] border border-[#3155E7] text-[#3155E7] hover:bg-[#3155E7]/10"
            }`}
          >
            <span>{isDictatingForm ? "⏹ Stop Dictation" : "🎙️ Dictate Full Session"}</span>
          </button>
        </div>

        <form onSubmit={handleCreateSession} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="planner-title" className="text-xs font-bold text-[#202522]">
                  1. What will you study? (Title) *
                </label>
                <VoiceDictationButton
                  compact
                  placeholderLabel="Speak Title"
                  onTranscript={(txt) => setEventTitle(txt)}
                />
              </div>
              <input
                id="planner-title"
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="e.g. Arrays & Linked Lists Revision"
                className="w-full p-2.5 bg-[#F7F5EF] text-sm text-[#202522] border border-[#a6aaa2] rounded outline-none focus:border-[#3155E7]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="planner-subject" className="text-xs font-bold text-[#202522]">
                  2. Course / Subject
                </label>
                <VoiceDictationButton
                  compact
                  placeholderLabel="Speak Subject"
                  onTranscript={(txt) => setEventSubject(txt)}
                />
              </div>
              <input
                id="planner-subject"
                type="text"
                value={eventSubject}
                onChange={(e) => setEventSubject(e.target.value)}
                placeholder="e.g. Data Structures, CS 410"
                className="w-full p-2.5 bg-[#F7F5EF] text-sm text-[#202522] border border-[#a6aaa2] rounded outline-none focus:border-[#3155E7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="planner-date" className="block text-xs font-bold text-[#202522] mb-1">
                3. Date
              </label>
              <input
                id="planner-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full p-2.5 bg-[#F7F5EF] text-sm text-[#202522] border border-[#a6aaa2] rounded outline-none focus:border-[#3155E7]"
              />
            </div>

            <div>
              <label htmlFor="planner-time" className="block text-xs font-bold text-[#202522] mb-1">
                4. Start Time
              </label>
              <input
                id="planner-time"
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="w-full p-2.5 bg-[#F7F5EF] text-sm text-[#202522] border border-[#a6aaa2] rounded outline-none focus:border-[#3155E7]"
              />
            </div>

            <div>
              <label htmlFor="planner-duration" className="block text-xs font-bold text-[#202522] mb-1">
                5. Duration
              </label>
              <select
                id="planner-duration"
                value={eventDuration}
                onChange={(e) => setEventDuration(parseInt(e.target.value, 10))}
                className="w-full p-2.5 bg-[#F7F5EF] text-sm text-[#202522] border border-[#a6aaa2] rounded outline-none focus:border-[#3155E7]"
              >
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes (1 hr)</option>
                <option value={90}>90 minutes (1.5 hrs)</option>
                <option value={120}>120 minutes (2 hrs)</option>
              </select>
            </div>
          </div>

          {conflictWarning && (
            <div
              className="p-3 bg-[#f6e2df] border border-[#d6a5a2] text-[#762522] text-xs font-bold rounded"
              role="alert"
            >
              ⚠ {conflictWarning}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#eeece5]">
            <span className="text-xs text-[#59685d]">
              Sessions are automatically saved to the database across sessions.
            </span>
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#3155E7] text-white text-sm font-bold rounded hover:bg-[#233fbe] transition-colors"
            >
              ✓ Save Study Session
            </button>
          </div>
        </form>
      </section>

      {/* STEP 2: Organized Study Timetable */}
      <section className="space-y-4" aria-labelledby="step2-timetable">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d7d0]">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#3155E7] block">
              Step 2 of 2
            </span>
            <h2 id="step2-timetable" className="text-lg font-bold text-[#202522]">
              Your Organized Timetable
            </h2>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter study timetable">
            {(
              [
                { id: "today", label: `Today (${todaySessions.length})` },
                { id: "upcoming", label: `Upcoming (${upcomingSessions.length})` },
                { id: "all", label: `All (${localItems.length})` },
                { id: "completed", label: `Completed (${completedSessions.length})` },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded border transition-colors ${
                    selected
                      ? "bg-[#3155E7] text-white border-[#3155E7]"
                      : "bg-[#fffefa] text-[#4b5750] border-[#d8d7d0] hover:border-[#3155E7]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="p-8 text-center bg-[#fffefa] border border-[#d8d7d0] rounded-md text-sm text-[#59685d]">
            No study sessions found in this view. Add a study session in Step 1 above or switch tabs.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className={`p-5 rounded-md border transition-all space-y-3 ${
                  item.completed
                    ? "bg-[#fffefa]/60 border-[#d8d7d0] opacity-80"
                    : "bg-[#fffefa] border-[#d8d7d0] hover:border-[#3155E7]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-[#3155E7] bg-[#3155E7]/10 px-2 py-0.5 rounded">
                      {item.subject}
                    </span>
                    <h3
                      className={`text-base font-bold text-[#202522] ${
                        item.completed ? "line-through text-[#59685d]" : ""
                      }`}
                    >
                      {item.title}
                    </h3>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      item.completed
                        ? "bg-[#eaf5ec] text-[#1e612f]"
                        : item.date === todayStr
                        ? "bg-[#e4e8fb] text-[#243fa7]"
                        : "bg-[#F7F5EF] text-[#4b5750]"
                    }`}
                  >
                    {item.completed ? "Completed" : item.date === todayStr ? "Today" : "Scheduled"}
                  </span>
                </div>

                <p className="text-xs text-[#4b5750] font-medium">
                  📅 {item.date} · 🕒 {item.time} ({item.durationMinutes} min)
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#eeece5]">
                  <button
                    onClick={() =>
                      speakInActiveLang(
                        `${item.title} for ${item.subject}, scheduled on ${item.date} at ${item.time} for ${item.durationMinutes} minutes. Status: ${
                          item.completed ? "completed" : "pending"
                        }.`
                      )
                    }
                    className="px-2.5 py-1.5 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
                    aria-label={`Read details for ${item.title} aloud`}
                  >
                    🔊 Listen
                  </button>

                  <button
                    onClick={() => handleToggleItem(item)}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded border transition-colors ${
                      item.completed
                        ? "bg-[#fffefa] border-[#a6aaa2] text-[#202522]"
                        : "bg-[#3155E7] border-[#3155E7] text-white hover:bg-[#233fbe]"
                    }`}
                  >
                    {item.completed ? "Reopen" : "✓ Mark Done"}
                  </button>

                  <button
                    onClick={() => handleDownloadSingleICS(item)}
                    className="px-2.5 py-1.5 bg-[#fffefa] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
                    title="Download calendar reminder file"
                  >
                    ⬇ .ICS
                  </button>

                  <button
                    onClick={() => {
                      setPendingDeleteItem(item);
                      speakInActiveLang(`Confirm: do you want to remove ${item.title}?`);
                    }}
                    className="px-2.5 py-1.5 text-[#9b302d] text-xs font-bold hover:underline ml-auto"
                    aria-label={`Delete study session ${item.title}`}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Safe Deletion Confirmation Modal */}
      {pendingDeleteItem && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-session-title"
        >
          <div className="bg-[#fffefa] border border-[#d8d7d0] rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 id="delete-session-title" className="text-lg font-bold text-[#202522]">
              Confirm Session Deletion
            </h3>
            <p className="text-sm text-[#4b5750] leading-relaxed">
              Remove <strong>"{pendingDeleteItem.title}"</strong> ({pendingDeleteItem.date} at{" "}
              {pendingDeleteItem.time}) from your timetable?
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#d8d7d0]">
              <button
                onClick={() => {
                  setPendingDeleteItem(null);
                  speakInActiveLang("Canceled.");
                }}
                className="px-4 py-2 border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-[#9b302d] text-white text-xs font-bold rounded hover:bg-[#7b2421]"
              >
                Delete Session
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
