import React, { useState, useEffect } from "react";
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
  getActiveLanguage,
  setActiveLanguage,
  playEarcon,
} from "../services/speechService";
import { SUPPORTED_LANGUAGES } from "../services/i18nService";

interface VoiceDictationButtonProps {
  onTranscript: (spokenText: string) => void;
  placeholderLabel?: string;
  showLanguageSelector?: boolean;
  compact?: boolean;
}

export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  onTranscript,
  placeholderLabel = "Voice Type",
  showLanguageSelector = false,
  compact = false,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [lang, setLang] = useState(getActiveLanguage());
  const [statusError, setStatusError] = useState("");
  const supported = isSpeechRecognitionSupported();

  useEffect(() => {
    const syncLang = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom?.detail) setLang(custom.detail);
    };
    window.addEventListener("braillebridge-language-change", syncLang);
    return () => window.removeEventListener("braillebridge-language-change", syncLang);
  }, []);

  const handleToggle = () => {
    setStatusError("");
    if (isListening) {
      stopListening();
      setIsListening(false);
      return;
    }

    if (!supported) {
      setStatusError("Voice typing requires Chrome or Edge.");
      playEarcon("warning");
      return;
    }

    const ok = startListening(
      {
        onStart: () => setIsListening(true),
        onResult: (finalText) => {
          setIsListening(false);
          if (finalText.trim()) {
            onTranscript(finalText.trim());
          }
        },
        onEnd: () => setIsListening(false),
        onError: (err) => {
          setIsListening(false);
          setStatusError(`Mic notice: ${err}`);
        },
      },
      lang,
      false
    );

    if (!ok) {
      setIsListening(false);
      setStatusError("Could not start microphone.");
    }
  };

  const activeNative =
    SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.nativeName || lang;

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      {showLanguageSelector && (
        <select
          value={lang}
          onChange={(e) => {
            setLang(e.target.value);
            setActiveLanguage(e.target.value);
          }}
          aria-label="Choose voice typing language"
          className="px-2 py-1.5 bg-[#F7F5EF] border border-[#a6aaa2] rounded text-xs font-semibold text-[#202522]"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={handleToggle}
        title={
          supported
            ? `Dictate using voice in ${activeNative}`
            : "Microphone dictation works in Chrome or Edge"
        }
        aria-label={
          isListening
            ? `Stop voice typing in ${activeNative}`
            : `${placeholderLabel} in ${activeNative}`
        }
        aria-pressed={isListening}
        className={`inline-flex items-center gap-1.5 font-bold rounded transition-colors whitespace-nowrap ${
          compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-xs"
        } ${
          isListening
            ? "bg-[#9b302d] text-white animate-pulse border border-[#9b302d]"
            : "bg-[#F7F5EF] text-[#202522] border border-[#a6aaa2] hover:border-[#3155E7] hover:text-[#3155E7]"
        }`}
      >
        <span aria-hidden="true">{isListening ? "⏹" : "🎙"}</span>
        <span>
          {isListening
            ? `Listening (${activeNative})…`
            : compact
            ? placeholderLabel
            : `${placeholderLabel} (${activeNative})`}
        </span>
      </button>

      {statusError && (
        <span className="text-[11px] text-[#9b302d] font-medium" role="status">
          {statusError}
        </span>
      )}
    </div>
  );
};

