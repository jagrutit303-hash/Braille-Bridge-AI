import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  FileText,
  Gamepad2,
  Languages,
  Mic,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  translate,
  TranslationResult,
  describeBrailleDots,
} from "../services/brailleService";
import {
  speakText,
  isSpeaking,
  stopSpeaking,
  getActiveLanguage,
  prepareAudioForSpeech,
} from "../services/speechService";
import { getPhrases } from "../services/i18nService";
import { SignalMark, SignalState } from "../components/SignalMark";
import { BrailleCellInspector } from "../components/BrailleCellInspector";
import { VoiceDictationButton } from "../components/VoiceDictationButton";

interface HomeViewProps {
  onNavigateToDashboard: () => void;
  onNavigateToVoice: () => void;
  onNavigateToTranslator: () => void;
  onNavigateToStudy: () => void;
  onNavigateToGames: () => void;
  onNavigateToNotice: () => void;
  onNavigateToPlanner: () => void;
}

const QUICK_SAMPLES = [
  { label: "English", text: "Access knowledge independently.", table: "en-ueb-g1" },
  { label: "ಕನ್ನಡ", text: "ನಮಸ್ಕಾರ, ಎಲ್ಲರಿಗೂ ಸುಸ್ವಾಗತ.", table: "kn-in-g1" },
  { label: "हिन्दी", text: "ब्रेलब्रिज में आपका स्वागत है।", table: "hi-in-g1" },
  { label: "தமிழ்", text: "வணக்கம், நல்வரவு.", table: "ta-in-g1" },
];

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigateToDashboard,
  onNavigateToVoice,
  onNavigateToTranslator,
  onNavigateToStudy,
  onNavigateToGames,
  onNavigateToNotice,
  onNavigateToPlanner,
}) => {
  const [inputText, setInputText] = useState("");
  const [selectedTable, setSelectedTable] = useState("en-ueb-g1");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState(
    "Type or voice-type any phrase above, or pick a language pill to preview Braille live."
  );
  const [copyStatus, setCopyStatus] = useState("");
  const [selectedCell, setSelectedCell] = useState<{ char: string; index: number } | null>(null);
  const [isReadingAloud, setIsReadingAloud] = useState(false);

  const handleTranslate = (textOverride?: string, tableOverride?: string) => {
    const text = (textOverride ?? inputText).trim();
    const tbl = tableOverride ?? selectedTable;
    if (!text) {
      setSignalState("error");
      setSignalMessage("Enter or dictate text before translating.");
      return;
    }

    setSignalState("processing");
    setSignalMessage("Translating into Braille…");

    const res = translate(text, tbl);
    setResult(res);

    if (res.success && res.brailleText) {
      setSignalState("success");
      setSignalMessage(`Ready · ${res.cellCount} Braille cells generated (${res.tableUsed}).`);
    } else {
      setSignalState("error");
      setSignalMessage(res.error || "Translation could not be completed.");
    }
  };

  const handleWelcomeTour = () => {
    prepareAudioForSpeech();
    const activeLang = getActiveLanguage();
    const phrases = getPhrases(activeLang);
    speakText(phrases.welcomeTour, { lang: activeLang });
  };

  useEffect(() => {
    const onSpaceRead = () => {
      if (result?.originalText && result.brailleText) {
        speakText(
          `Home quick preview: "${result.originalText}" translated into ${result.cellCount} Braille cells using ${result.tableUsed}.`,
          { lang: getActiveLanguage() }
        );
      } else {
        handleWelcomeTour();
      }
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  });

  const handleCopy = async () => {
    if (!result?.brailleText) return;
    try {
      await navigator.clipboard.writeText(result.brailleText);
      setCopyStatus("Braille copied.");
      setTimeout(() => setCopyStatus(""), 3000);
    } catch {
      setCopyStatus("Select the Braille output to copy it.");
    }
  };

  const handleDownload = () => {
    if (!result?.brailleText) return;
    const blob = new Blob([result.brailleText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "braille_output.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleListen = () => {
    if (!result?.originalText) return;
    if (isSpeaking() && isReadingAloud) {
      stopSpeaking();
      setIsReadingAloud(false);
      return;
    }
    setIsReadingAloud(true);
    speakText(result.originalText, {
      onEnd: () => setIsReadingAloud(false),
      onError: () => setIsReadingAloud(false),
    });
  };

  const handleSpeakBrailleDots = () => {
    if (!result?.brailleText) return;
    const chars = Array.from(result.brailleText);
    const spoken = chars
      .map((c, i) => {
        const orig = result.originalText[i] || "";
        const desc = describeBrailleDots(c);
        return orig && orig.trim() ? `${orig}: ${desc}` : desc;
      })
      .slice(0, 40)
      .join(". ");
    speakText(`Braille dot breakdown: ${spoken}`);
  };

  const suiteCards = [
    {
      num: "01",
      tag: "Progress Vault",
      title: "User Dashboard & Saved Hub",
      desc: "Track your Braille accuracy streaks, study completion bars, saved study PDFs, and circular deadlines in one place.",
      icon: BarChart3,
      action: onNavigateToDashboard,
    },
    {
      num: "02",
      tag: "Translation Studio",
      title: "Multi-Language Braille Studio",
      desc: "Convert English UEB and Bharati Braille (Hindi, Kannada, Tamil, Bengali) with spoken dot cells and .BRF export.",
      icon: Languages,
      action: onNavigateToTranslator,
    },
    {
      num: "03",
      tag: "AI Tutor & OCR",
      title: "Study Companion",
      desc: "Upload PDFs, notes, or images. Hear smart punctuation & code symbols aloud, ask grounded questions, and take quizzes.",
      icon: BookOpen,
      action: onNavigateToStudy,
    },
    {
      num: "04",
      tag: "Guided Schedule",
      title: "Study Planner & Timetable",
      desc: "Organize Today and Upcoming study blocks by voice, catch overlaps automatically, and export offline .ICS reminders.",
      icon: Calendar,
      action: onNavigateToPlanner,
    },
    {
      num: "05",
      tag: "Interactive Practice",
      title: "Braille Games Academy",
      desc: "Master Dot Detective, Pattern Builder (keys 1–6), and Language Bridge with spoken Explain My Mistake diagnostics.",
      icon: Gamepad2,
      action: onNavigateToGames,
    },
    {
      num: "06",
      tag: "Circular Inspector",
      title: "Notice & Form Assistant",
      desc: "Extract verified dates, eligibility rules, and document checklists from college notices with one-click calendar reminders.",
      icon: FileText,
      action: onNavigateToNotice,
    },
  ];

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10 sm:space-y-16">
      {/* =================================================================== */}
      {/* 1. FLOWY ANIMATED LANDING HERO                                      */}
      {/* =================================================================== */}
      <section className="relative overflow-hidden rounded-2xl border border-[#d8d7d0] bg-[#fffefa] p-5 sm:p-8 lg:p-12 shadow-sm">
        {/* Soft Floating Ambient Aura */}
        <motion.div
          aria-hidden="true"
          animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.55, 0.35] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-[#3155E7]/12 blur-3xl"
        />
        <motion.div
          aria-hidden="true"
          animate={{ scale: [1.05, 0.96, 1.05], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-[#3155E7]/10 blur-3xl"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-10">
          <div className="max-w-2xl space-y-5">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F7F5EF] border border-[#d8d7d0] text-xs font-bold uppercase tracking-wider text-[#3155E7]"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Voice-First · Multilingual · Braille Suite</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="text-3xl sm:text-5xl font-bold text-[#202522] leading-[1.12] tracking-tight"
            >
              Every word, voice, and Braille dot—flowing with you.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.16 }}
              className="text-lg text-[#4b5750] leading-relaxed"
            >
              Translate across English and Indian Bharati Braille, hear study PDFs read with intelligent
              symbol phrasing, speak commands hands-free, and track everything in your Dashboard.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.24 }}
              className="flex flex-wrap items-center gap-3 pt-2"
            >
              <button
                onClick={onNavigateToDashboard}
                className="px-6 py-3 bg-[#3155E7] text-white font-bold rounded-lg hover:bg-[#233fbe] transition-all flex items-center gap-2 shadow-sm hover:-translate-y-0.5"
              >
                <BarChart3 className="w-4 h-4" aria-hidden="true" />
                <span>Open Progress Dashboard</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                onClick={onNavigateToVoice}
                className="px-5 py-3 bg-[#F7F5EF] text-[#202522] border border-[#a6aaa2] font-bold rounded-lg hover:border-[#3155E7] hover:text-[#3155E7] transition-all flex items-center gap-2 hover:-translate-y-0.5"
              >
                <Mic className="w-4 h-4" aria-hidden="true" />
                <span>Voice Assistant</span>
              </button>

              <button
                onClick={handleWelcomeTour}
                className="px-4 py-3 text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                <span>Listen to Welcome Tour</span>
              </button>
            </motion.div>
          </div>

          {/* Animated Floating 6-Dot Tactile Emblem */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hidden sm:flex shrink-0 flex-col items-center justify-center p-6 rounded-2xl bg-[#F7F5EF] border border-[#d8d7d0] shadow-inner"
            aria-hidden="true"
          >
            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2, 3, 4, 5].map((dotIdx) => (
                <motion.div
                  key={dotIdx}
                  animate={{
                    scale: [1, 1.18, 1],
                    opacity: dotIdx % 2 === 0 ? [0.85, 1, 0.85] : [0.45, 0.9, 0.45],
                  }}
                  transition={{
                    duration: 2.6,
                    repeat: Infinity,
                    delay: dotIdx * 0.25,
                    ease: "easeInOut",
                  }}
                  className={`w-7 h-7 rounded-full border-2 border-[#3155E7] ${
                    dotIdx === 0 || dotIdx === 2 || dotIdx === 3
                      ? "bg-[#3155E7]"
                      : "bg-[#fffefa]"
                  }`}
                />
              ))}
            </div>
            <span className="mt-4 text-[11px] font-mono font-bold uppercase tracking-widest text-[#59685d]">
              U+2800 Braille
            </span>
          </motion.div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. QUICK LIVE BRAILLE SANDBOX                                       */}
      {/* =================================================================== */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.4 }}
        className="rounded-xl border border-[#d8d7d0] bg-[#fffefa] p-6 sm:p-8 shadow-sm space-y-4"
        aria-labelledby="quick-playground-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="quick-playground-heading" className="text-lg font-bold text-[#202522]">
              Try Instant Braille & Voice Preview
            </h2>
            <p className="text-xs text-[#59685d]">
              Tap a language pill, dictate aloud, or type below to see tactile dots animate cleanly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {QUICK_SAMPLES.map((s) => (
              <button
                key={s.table}
                onClick={() => {
                  setInputText(s.text);
                  setSelectedTable(s.table);
                  handleTranslate(s.text, s.table);
                }}
                className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors ${
                  selectedTable === s.table && inputText === s.text
                    ? "bg-[#3155E7] text-white border-[#3155E7]"
                    : "bg-[#F7F5EF] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <label htmlFor="home-quick-input" className="text-xs font-bold text-[#4b5750]">
            Phrase to translate
          </label>
          <VoiceDictationButton
            showLanguageSelector
            compact
            placeholderLabel="Voice Type"
            onTranscript={(spoken) => {
              const next = inputText ? `${inputText} ${spoken}` : spoken;
              setInputText(next);
              const langTableMap: Record<string, string> = {
                kn: "kn-in-g1",
                hi: "hi-in-g1",
                ta: "ta-in-g1",
                bn: "bn-in-g1",
              };
              const activeShort = (localStorage.getItem("braillebridge_language") || "en").split("-")[0];
              const tbl = langTableMap[activeShort] || "en-ueb-g1";
              setSelectedTable(tbl);
              handleTranslate(next, tbl);
            }}
          />
        </div>

        <textarea
          id="home-quick-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Write or dictate text here…"
          rows={3}
          className="w-full p-4 bg-[#F7F5EF] text-[#202522] border border-[#a6aaa2] rounded-md focus:border-[#3155E7] outline-none transition-all placeholder:text-[#59685d] text-base leading-relaxed"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleTranslate()}
            className="px-6 py-2.5 bg-[#3155E7] text-white font-bold rounded-md hover:bg-[#233fbe] transition-colors text-sm"
          >
            Translate to Braille
          </button>
          <button
            onClick={onNavigateToTranslator}
            className="px-4 py-2.5 bg-[#F7F5EF] text-[#202522] border border-[#a6aaa2] font-bold rounded-md hover:border-[#3155E7] text-sm"
          >
            Open Full Studio (6 Tables + Perkins) →
          </button>
        </div>

        <SignalMark state={signalState} message={signalMessage} />

        {/* Result Output */}
        {result && result.success && result.brailleText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="pt-4 border-t border-[#d8d7d0] space-y-4"
          >
            <div className="flex items-center justify-between text-xs text-[#59685d]">
              <strong className="text-sm text-[#202522]">Braille Output</strong>
              <span>{result.cellCount} cells · Click any cell to inspect dots</span>
            </div>

            <div
              className="p-5 bg-[#F7F5EF] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-md font-mono text-3xl leading-relaxed text-[#202522] tracking-wider break-words select-text"
              role="status"
              aria-live="polite"
            >
              {Array.from(result.brailleText).map((char, index) => {
                const isSelected = selectedCell?.index === index;
                const desc = describeBrailleDots(char);
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedCell({ char, index });
                      speakText(`Cell ${index + 1}: ${char}, ${desc}`);
                    }}
                    className={`inline-block px-0.5 rounded hover:bg-[#3155E7]/15 focus:outline-none focus:ring-2 focus:ring-[#3155E7] transition-colors cursor-pointer ${
                      isSelected ? "bg-[#3155E7]/25 ring-2 ring-[#3155E7]" : ""
                    }`}
                    title={desc}
                    aria-label={`Inspect Braille cell ${index + 1}: ${char}, ${desc}`}
                  >
                    {char}
                  </button>
                );
              })}
            </div>

            {selectedCell && (
              <BrailleCellInspector
                char={selectedCell.char}
                onClose={() => setSelectedCell(null)}
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSpeakBrailleDots}
                className="px-4 py-2 bg-[#3155E7] text-white font-bold text-xs rounded hover:bg-[#233fbe]"
              >
                🔊 Speak Braille Dots
              </button>
              <button
                onClick={handleListen}
                className="px-4 py-2 border border-[#a6aaa2] bg-[#fffefa] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
              >
                {isReadingAloud ? "⏹ Stop" : "🔊 Listen to Original"}
              </button>
              <button
                onClick={handleCopy}
                className="px-4 py-2 border border-[#3155E7] bg-[#fffefa] text-[#3155E7] font-bold text-xs rounded hover:bg-[#3155E7]/10"
              >
                Copy Braille
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 border border-[#a6aaa2] bg-[#fffefa] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
              >
                Download (.txt)
              </button>
              {copyStatus && (
                <span className="text-xs text-[#202522] font-medium" role="status">
                  {copyStatus}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </motion.section>

      {/* =================================================================== */}
      {/* 3. FLOWING WORKSPACE SUITE DIRECTORY                                */}
      {/* =================================================================== */}
      <section aria-labelledby="suite-directory-heading" className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#3155E7] mb-1">
              Connected Learning Suite
            </p>
            <h2 id="suite-directory-heading" className="text-2xl font-bold text-[#202522]">
              Explore every accessible tool
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {suiteCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.button
                key={card.num}
                onClick={card.action}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.35, delay: idx * 0.05 }}
                whileHover={{ y: -4 }}
                className="text-left p-6 rounded-xl border border-[#d8d7d0] bg-[#fffefa] hover:border-[#3155E7] shadow-sm transition-colors group flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#3155E7]">
                      {card.num}. {card.tag}
                    </span>
                    <div className="p-2 rounded-lg bg-[#F7F5EF] text-[#3155E7] group-hover:bg-[#3155E7] group-hover:text-white transition-colors">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="font-bold text-lg text-[#202522] group-hover:text-[#3155E7] transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-[#4b5750] leading-relaxed">{card.desc}</p>
                </div>

                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#3155E7]">
                  <span>Open</span>
                  <ArrowRight
                    className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform"
                    aria-hidden="true"
                  />
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* =================================================================== */}
      {/* 4. ACCESSIBLE BY DESIGN STRIP                                       */}
      {/* =================================================================== */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 rounded-xl border border-[#d8d7d0] bg-[#fffefa]/80 text-xs"
      >
        <div className="space-y-1">
          <strong className="text-sm text-[#202522] block">🗣 True Native Voices</strong>
          <p className="text-[#4b5750] leading-relaxed">
            Dictate and listen back fluently in English, Kannada, Hindi, Tamil, and Bengali.
          </p>
        </div>
        <div className="space-y-1">
          <strong className="text-sm text-[#202522] block">💬 Context-Aware Speech</strong>
          <p className="text-[#4b5750] leading-relaxed">
            Reads arrays, code operators, punctuation pauses, and Braille cells unambiguously.
          </p>
        </div>
        <div className="space-y-1">
          <strong className="text-sm text-[#202522] block">👁 Hyperlegible & High Contrast</strong>
          <p className="text-[#4b5750] leading-relaxed">
            Bundled Atkinson Hyperlegible typography, 90%–150% root scaling, and WCAG AAA dark mode.
          </p>
        </div>
      </motion.section>
    </main>
  );
};
