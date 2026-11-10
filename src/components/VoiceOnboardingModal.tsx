import React, { useEffect, useRef } from "react";
import { speakText, stopSpeaking, isSpeaking } from "../services/speechService";
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
    if (isOpen) {
      // Focus primary button for immediate keyboard & screen reader accessibility
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePlayVoiceTour = () => {
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
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      aria-describedby="onboarding-modal-desc"
    >
      <div className="bg-[#fffefa] border-2 border-[#3155E7] p-6 sm:p-8 rounded-xl shadow-2xl max-w-xl w-full my-8 space-y-6 text-[#202522]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#d8d7d0] pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#3155E7] mb-1">
              Accessibility First-Use Guide
            </p>
            <h2 id="onboarding-modal-title" className="text-2xl font-serif font-bold text-[#202522]">
              {phrases.onboardingTitle}
            </h2>
          </div>
          <button
            onClick={handleDismiss}
            className="text-xs font-bold px-2.5 py-1.5 border border-[#d8d7d0] rounded hover:bg-[#eeece5] text-[#4b5750]"
            aria-label="Close voice tour"
          >
            ✕ Close
          </button>
        </div>

        {/* Spoken Tour Button */}
        <div className="p-4 bg-[#e4e8fb] border border-[#aab8f3] rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="space-y-0.5">
            <strong className="text-sm text-[#243fa7] block">🔊 Listen to Audio Onboarding Tour</strong>
            <p className="text-xs text-[#3155E7]">
              Hear the spoken guide in {SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage)?.nativeName || "English"}.
            </p>
          </div>
          <button
            onClick={handlePlayVoiceTour}
            className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded shadow hover:bg-[#233fbe] transition-colors whitespace-nowrap"
          >
            Play / Stop Audio Tour
          </button>
        </div>

        {/* 5 Core Principles */}
        <div id="onboarding-modal-desc" className="space-y-3.5 text-xs text-[#202522] leading-relaxed">
          <div className="flex items-start gap-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="font-mono font-bold text-sm text-[#3155E7] px-2 py-0.5 bg-white rounded border border-[#d8d7d0]">
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
            <span className="font-mono font-bold text-sm text-[#9b302d] px-2 py-0.5 bg-white rounded border border-[#d8d7d0]">
              Esc
            </span>
            <div>
              <strong className="block text-sm text-[#202522]">2. Silence & Interruption</strong>
              <span>
                Press <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-[#d8d7d0]">Escape</kbd> or say <em>"Stop speaking"</em> to silence reading instantly.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="font-mono font-bold text-sm text-[#795b19] px-2 py-0.5 bg-white rounded border border-[#d8d7d0]">
              Cancel
            </span>
            <div>
              <strong className="block text-sm text-[#202522]">3. Safe Cancellation & Undo</strong>
              <span>
                Say <em>"Cancel that"</em> to safely abort any proposed step. Say <em>"Undo"</em> to revert the most recent study entry.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="font-mono font-bold text-sm text-[#3155E7] px-2 py-0.5 bg-white rounded border border-[#d8d7d0]">
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
            <span className="font-mono font-bold text-sm text-[#202522] px-2 py-0.5 bg-white rounded border border-[#d8d7d0]">
              Help
            </span>
            <div>
              <strong className="block text-sm text-[#202522]">5. Context Guidance & Permission Guard</strong>
              <span>
                Say <em>"Where am I?"</em> or <em>"Help"</em> to hear what is on screen. Adding or deleting study timetable sessions always requires your explicit verbal or button confirmation.
              </span>
            </div>
          </div>
        </div>

        {/* Language Picker in Onboarding */}
        <div className="flex items-center justify-between pt-2 border-t border-[#d8d7d0] text-xs">
          <label htmlFor="onboarding-lang-select" className="font-bold text-[#4b5750]">
            Selected Voice Language:
          </label>
          <select
            id="onboarding-lang-select"
            value={currentLanguage}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="p-1.5 bg-[#F7F5EF] border border-[#a6aaa2] rounded font-bold text-xs text-[#202522]"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} — {l.nativeName}
              </option>
            ))}
          </select>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#d8d7d0]">
          <button
            onClick={handleDismiss}
            className="text-xs text-[#4b5750] hover:underline"
          >
            Close & don't show automatically
          </button>

          <div className="flex items-center gap-2">
            <button
              ref={closeButtonRef}
              onClick={handleStartVoiceNow}
              className="px-5 py-2.5 bg-[#3155E7] text-white text-xs font-bold rounded-lg hover:bg-[#233fbe] transition-colors shadow flex items-center gap-2"
            >
              <span>🎙 Start Voice Interaction (Alt+V)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
