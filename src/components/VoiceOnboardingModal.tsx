import React, { useEffect, useRef } from "react";
import { speakText, stopSpeaking, isSpeaking, prepareAudioForSpeech } from "../services/speechService";
import { getPhrases, SUPPORTED_LANGUAGES } from "../services/i18nService";

interface VoiceOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartVoice: () => void;
  currentLanguage: string;
  onLanguageChange: (lang: string) => void;
}

export const VoiceOnboardingModal: React.FC<VoiceOnboardingModalProps> = ({
  isOpen,
  onClose,
  onStartVoice,
  currentLanguage,
  onLanguageChange,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const phrases = getPhrases(currentLanguage);

  useEffect(() => {
    if (!isOpen) return;
    // Focus close button immediately so keyboard & screen reader users see & control top Close action cleanly
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 80);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePlayVoiceTour = () => {
    prepareAudioForSpeech();
    if (isSpeaking()) {
      stopSpeaking();
    } else {
      speakText(phrases.onboardingSpokenIntro, { lang: currentLanguage });
    }
  };

  const handleDismiss = () => {
    stopSpeaking();
    try {
      localStorage.setItem("braillebridge_onboarded", "true");
    } catch {
      // ignore storage errors
    }
    onClose();
  };

  const handleStartVoiceNow = () => {
    handleDismiss();
    onStartVoice();
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      aria-describedby="onboarding-modal-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div className="bg-[#fffefa] border-2 border-[#3155E7] rounded-xl shadow-2xl max-w-xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden text-[#202522]">
        {/* Pinned Header (Always visible on desktop & mobile) */}
        <div className="shrink-0 flex items-start justify-between gap-3 p-4 sm:px-6 sm:pt-5 sm:pb-4 border-b border-[#d8d7d0] bg-[#fffefa]">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#3155E7] mb-0.5">
              Accessibility First-Use Guide
            </p>
            <h2 id="onboarding-modal-title" className="text-lg sm:text-2xl font-serif font-bold text-[#202522] leading-snug">
              {phrases.onboardingTitle}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleDismiss}
            className="shrink-0 text-xs font-bold px-3 py-2 border border-[#a6aaa2] bg-[#F7F5EF] rounded-lg hover:bg-[#eeece5] text-[#202522] min-h-[38px]"
            aria-label="Close voice tour"
          >
            ✕ Close
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:px-6 sm:py-4 space-y-4">
          {/* Spoken Tour Button */}
          <div className="p-3.5 sm:p-4 bg-[#e4e8fb] border border-[#aab8f3] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <strong className="text-sm text-[#243fa7] block">🔊 Listen to Audio Onboarding Tour</strong>
              <p className="text-xs text-[#3155E7]">
                Hear the spoken guide in {SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage)?.nativeName || "English"}.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePlayVoiceTour}
              className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded shadow hover:bg-[#233fbe] transition-colors whitespace-nowrap shrink-0"
            >
              Play / Stop Audio Tour
            </button>
          </div>

          {/* 5 Core Principles */}
          <div id="onboarding-modal-desc" className="space-y-2.5 text-xs text-[#202522] leading-relaxed">
            <div className="flex items-start gap-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
              <span className="font-mono font-bold text-xs sm:text-sm text-[#3155E7] px-2 py-0.5 bg-white rounded border border-[#d8d7d0] shrink-0">
                Alt+V
              </span>
              <div>
                <strong className="block text-sm text-[#202522]">1. Voice-First Operation</strong>
                <span>
                  Press <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-[#d8d7d0]">Alt + V</kbd> or tap the persistent microphone button anytime to speak commands without touching a mouse.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
              <span className="font-mono font-bold text-xs sm:text-sm text-[#9b302d] px-2 py-0.5 bg-white rounded border border-[#d8d7d0] shrink-0">
                Esc
              </span>
              <div>
                <strong className="block text-sm text-[#202522]">2. Silence &amp; Interruption</strong>
                <span>
                  Press <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-[#d8d7d0]">Escape</kbd> or say <em>"Stop speaking"</em> to silence reading instantly.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
              <span className="font-mono font-bold text-xs sm:text-sm text-[#795b19] px-2 py-0.5 bg-white rounded border border-[#d8d7d0] shrink-0">
                Cancel
              </span>
              <div>
                <strong className="block text-sm text-[#202522]">3. Safe Cancellation &amp; Undo</strong>
                <span>
                  Say <em>"Cancel that"</em> to safely abort any proposed step. Say <em>"Undo"</em> to revert the most recent study entry.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
              <span className="font-mono font-bold text-xs sm:text-sm text-[#3155E7] px-2 py-0.5 bg-white rounded border border-[#d8d7d0] shrink-0">
                Lang
              </span>
              <div>
                <strong className="block text-sm text-[#202522]">4. Multilingual Speech Pipeline</strong>
                <span>
                  Say <em>"Switch to Kannada"</em>, <em>"Switch to Hindi"</em>, or <em>"Switch to English"</em>. Transcripts, actions, and spoken voice automatically match your chosen language.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
              <span className="font-mono font-bold text-xs sm:text-sm text-[#202522] px-2 py-0.5 bg-white rounded border border-[#d8d7d0] shrink-0">
                Help
              </span>
              <div>
                <strong className="block text-sm text-[#202522]">5. Context Guidance &amp; Permission Guard</strong>
                <span>
                  Say <em>"Where am I?"</em> or <em>"Help"</em> to hear what is on screen. Adding or deleting study timetable sessions always requires your explicit verbal or button confirmation.
                </span>
              </div>
            </div>
          </div>

          {/* Language Picker in Onboarding */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-[#d8d7d0] text-xs">
            <label htmlFor="onboarding-lang-select" className="font-bold text-[#4b5750]">
              Selected Voice Language:
            </label>
            <select
              id="onboarding-lang-select"
              value={currentLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="p-2 bg-[#F7F5EF] border border-[#a6aaa2] rounded font-bold text-xs text-[#202522] w-full sm:w-auto max-w-full"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} — {l.nativeName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pinned Footer Actions */}
        <div className="shrink-0 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 p-4 sm:px-6 sm:py-4 border-t border-[#d8d7d0] bg-[#F7F5EF]">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs font-semibold text-[#4b5750] hover:underline py-1"
          >
            Close &amp; don't show automatically
          </button>

          <button
            type="button"
            onClick={handleStartVoiceNow}
            className="w-full sm:w-auto justify-center px-5 py-2.5 bg-[#3155E7] text-white text-xs font-bold rounded-lg hover:bg-[#233fbe] transition-colors shadow flex items-center gap-2"
          >
            <span>🎙 Start Voice Interaction (Alt+V)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
