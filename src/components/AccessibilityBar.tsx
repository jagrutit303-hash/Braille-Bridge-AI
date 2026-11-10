import React, { useState, useEffect } from "react";
import { NavPage } from "./Header";
import {
  speakText,
  stopSpeaking,
  getActiveLanguage,
  getPunctuationMode,
  setPunctuationMode,
  PunctuationMode,
} from "../services/speechService";
import { ColorVisionMode } from "../services/supabaseService";

interface AccessibilityBarProps {
  currentPage: NavPage;
  fontSizeScale: number;
  onFontScaleChange: (scale: number) => void;
  isHighContrast: boolean;
  onToggleContrast: () => void;
  colorVisionMode?: ColorVisionMode;
  onColorVisionModeChange?: (mode: ColorVisionMode) => void;
}

const PAGE_GUIDES: Record<NavPage, string> = {
  home: "Home landing page guide: Explore our voice-first Braille suite, try the live Braille preview card, or launch your Progress Dashboard. Press Alt+V to speak with the Voice Agent anytime, or Space and Escape to silence speech.",
  dashboard:
    "Progress and Saved Vault Dashboard guide: Inspect your Braille accuracy, streaks, study timetable completion, saved study notes, and saved college notices. Click Read My Progress to hear everything summarized aloud, or click any saved file to open it directly.",
  translator:
    "Braille Translator guide: Select English UEB or Indian Bharati Braille (Hindi, Kannada, Tamil, or Bengali). Voice-type or enter text on the left, press Translate, inspect any Braille cell's dots on the right, use the 6-key Perkins simulator with S D F and J K L, or download a .BRF file.",
  study:
    "Study Companion guide: Upload a PDF, text file, or scanned image using Choose File, or load sample notes. Use Audio Reader controls to Play, Pause, or adjust speed with smart punctuation and symbol reading. Ask any question or enter a difficult topic below to get grounded answers in your selected voice language.",
  planner:
    "Study Planner guide: View your timetable filtered by Today, Upcoming, or Completed. Dictate a new session by voice or fill Step 2 below. Click Read Today's Agenda to listen aloud, Export .ICS for offline calendar reminders, or mark sessions complete.",
  games:
    "Braille Games guide: Practice Dot Detective, Hear It Spell It, Pattern Builder (keys 1 to 6), Memory Practice, and Language Bridge. Press Read Prompt Aloud for spoken cues and get Explain My Mistake diagnostics on every answer.",
  notice:
    "Notice Assistant guide: Upload a college circular PDF, image, or paste notice text. BrailleBridge extracts verified deadlines, eligibility criteria, required documents, and lets you download offline calendar reminders or listen to the Full Audio Briefing.",
  document:
    "Study Companion workspace: Upload documents, listen with intelligent punctuation reading, ask grounded questions, and save notes.",
  voice:
    "Multilingual Voice Assistant: Switch between Kannada, Hindi, Tamil, Bengali, and English, test native voices, dictate commands hands-free, or type questions about the website or uploaded notes.",
  about:
    "Accessibility and Settings guide: Adjust display font scale, High Contrast dark mode, keyboard shortcuts Alt+1 through Alt+7, and inspect supported Braille standards.",
};

export const AccessibilityBar: React.FC<AccessibilityBarProps> = ({
  currentPage,
  fontSizeScale,
  onFontScaleChange,
  isHighContrast,
  onToggleContrast,
  colorVisionMode = "standard",
  onColorVisionModeChange,
}) => {
  const [punctMode, setPunctMode] = useState<PunctuationMode>(getPunctuationMode());

  useEffect(() => {
    const onModeChange = (e: Event) => {
      const custom = e as CustomEvent<PunctuationMode>;
      if (custom?.detail) setPunctMode(custom.detail);
    };
    window.addEventListener("braillebridge-speech-mode-change", onModeChange);
    return () => window.removeEventListener("braillebridge-speech-mode-change", onModeChange);
  }, []);

  const handleSpeakPageGuide = async () => {
    const englishGuide = PAGE_GUIDES[currentPage] || PAGE_GUIDES.home;
    const activeLang = getActiveLanguage();
    const short = activeLang.split("-")[0].toLowerCase();

    if (short !== "en") {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: englishGuide,
            sourceLang: "en",
            targetLang: short,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.translatedText) {
            speakText(data.translatedText, { lang: activeLang });
            return;
          }
        }
      } catch {
        // Fallback to English if translation unreachable
      }
    }
    speakText(englishGuide, { lang: "en-US" });
  };

  const handleTogglePunctuation = () => {
    const next: PunctuationMode = punctMode === "smart" ? "verbose" : "smart";
    setPunctuationMode(next);
    setPunctMode(next);
    speakText(
      next === "verbose"
        ? "Exact punctuation mode enabled. All punctuation marks and symbols will be spoken."
        : "Smart punctuation mode enabled. Natural pauses and contextual symbols active.",
      { lang: "en-US" }
    );
  };

  const stepFont = (delta: number) => {
    const next = Math.min(1.5, Math.max(0.9, Math.round((fontSizeScale + delta) * 20) / 20));
    onFontScaleChange(next);
  };

  return (
    <div
      className="border-b border-[#d8d7d0] bg-[#F7F5EF] px-3 sm:px-6 py-2 text-xs text-[#4b5750]"
      role="region"
      aria-label="Low-Vision and Screen-Reader Quick Accessibility Controls"
    >
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSpeakPageGuide}
            className="px-3 py-1 bg-[#fffefa] border border-[#3155E7] text-[#3155E7] font-bold rounded hover:bg-[#3155E7]/10 transition-colors flex items-center gap-1.5"
            aria-label="Hear audio guide explaining how to use this page"
            title="Hear guided orientation for this screen"
          >
            <span aria-hidden="true">🧭</span>
            <span>Guide Me Aloud</span>
          </button>

          <button
            onClick={() => stopSpeaking()}
            className="px-2.5 py-1 bg-[#fffefa] border border-[#a6aaa2] text-[#202522] font-bold rounded hover:border-[#9b302d] hover:text-[#9b302d] transition-colors"
            aria-label="Silence current speech, or press Space to start or pause voice reading"
            title="Press Space anywhere to start/pause reading this screen · Esc silences"
          >
            🔊 Space: Read / Pause · Esc: Stop
          </button>

          <button
            onClick={handleTogglePunctuation}
            className={`px-2.5 py-1 border rounded font-bold transition-colors ${
              punctMode === "verbose"
                ? "bg-[#3155E7] text-white border-[#3155E7]"
                : "bg-[#fffefa] border-[#a6aaa2] text-[#202522] hover:border-[#3155E7]"
            }`}
            title="Switch between Smart Contextual Pauses & Symbols vs Reading Every Punctuation Mark"
            aria-pressed={punctMode === "verbose"}
          >
            {punctMode === "verbose" ? "💬 Reading: Exact Punctuation" : "💬 Reading: Smart Pauses"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onColorVisionModeChange && (
            <label className="inline-flex items-center gap-1.5 bg-[#fffefa] border border-[#a6aaa2] rounded px-2 py-1 text-[11px] font-bold text-[#202522]">
              <span aria-hidden="true">🎨</span>
              <span className="hidden md:inline text-[#4b5750]">Vision:</span>
              <select
                value={colorVisionMode}
                onChange={(e) => {
                  const nextMode = e.target.value as ColorVisionMode;
                  onColorVisionModeChange(nextMode);
                  const names: Record<ColorVisionMode, string> = {
                    standard: "Standard palette",
                    deuteranopia: "Red-Green colorblind safe palette",
                    tritanopia: "Blue-Yellow colorblind safe palette",
                    monochrome: "Monochrome high-contrast palette",
                  };
                  speakText(`Color vision mode set to ${names[nextMode]}`, { lang: "en-US" });
                }}
                aria-label="Select colorblind-safe display palette"
                className="bg-transparent font-bold text-[#202522] focus:outline-none cursor-pointer"
              >
                <option value="standard">Standard Color</option>
                <option value="deuteranopia">Red-Green Safe</option>
                <option value="tritanopia">Blue-Yellow Safe</option>
                <option value="monochrome">Monochrome Safe</option>
              </select>
            </label>
          )}

          <span className="font-bold text-[#4b5750] hidden sm:inline">Atkinson Font:</span>
          <div className="inline-flex items-center border border-[#a6aaa2] rounded bg-[#fffefa] overflow-hidden">
            <button
              onClick={() => stepFont(-0.1)}
              disabled={fontSizeScale <= 0.9}
              className="px-2.5 py-1 font-bold text-[#202522] hover:bg-[#eeece5] disabled:opacity-40"
              aria-label="Decrease text size"
              title="Smaller text"
            >
              A-
            </button>
            <span className="px-2 py-1 font-mono font-bold text-[#202522] border-x border-[#d8d7d0]">
              {Math.round(fontSizeScale * 100)}%
            </span>
            <button
              onClick={() => stepFont(0.1)}
              disabled={fontSizeScale >= 1.5}
              className="px-2.5 py-1 font-bold text-[#202522] hover:bg-[#eeece5] disabled:opacity-40"
              aria-label="Increase text size"
              title="Larger text"
            >
              A+
            </button>
          </div>

          <button
            onClick={onToggleContrast}
            className="sm:hidden px-2.5 py-1 bg-[#fffefa] border border-[#a6aaa2] text-[#202522] font-bold rounded"
          >
            {isHighContrast ? "Standard Contrast" : "High Contrast"}
          </button>
        </div>
      </div>
    </div>
  );
};

