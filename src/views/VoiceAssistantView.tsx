import React, { useState, useEffect } from "react";
import { NavPage } from "../components/Header";
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
  speakText,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  isSpeechPaused,
  repeatLastSpoken,
  getActiveLanguage,
  setActiveLanguage,
  playEarcon,
} from "../services/speechService";
import {
  planAgentTask,
  executeAgentStep,
  AgentPlan,
  AgentStep,
  AgentExecutionContext,
} from "../services/agentService";
import { SUPPORTED_LANGUAGES, getPhrases } from "../services/i18nService";
import { getActiveDocumentContext } from "../services/appContextService";
import { ColorVisionMode } from "../services/supabaseService";
import { BRAILLE_TABLES, translate } from "../services/brailleService";
import { SignalMark, SignalState } from "../components/SignalMark";

interface VoiceAssistantViewProps {
  onNavigate?: (page: NavPage) => void;
  speechSpeed?: number;
  onSpeechSpeedChange?: (speed: number) => void;
  isHighContrast?: boolean;
  onToggleContrast?: () => void;
  fontSizeScale?: number;
  onFontSizeScaleChange?: (scale: number) => void;
  onColorVisionModeChange?: (mode: ColorVisionMode) => void;
}

export const VoiceAssistantView: React.FC<VoiceAssistantViewProps> = ({
  onNavigate = () => {},
  speechSpeed: propSpeechSpeed = 1.0,
  onSpeechSpeedChange,
  isHighContrast = false,
  onToggleContrast = () => {},
  fontSizeScale = 1.0,
  onFontSizeScaleChange = () => {},
  onColorVisionModeChange,
}) => {
  const [language, setLanguage] = useState<string>(getActiveLanguage());
  const [localSpeed, setLocalSpeed] = useState<number>(propSpeechSpeed);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const [interimText, setInterimText] = useState<string>("");
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState<string>(
    getPhrases(getActiveLanguage()).agentGreeting
  );
  const [activePlan, setActivePlan] = useState<AgentPlan | null>(null);
  const [pendingStep, setPendingStep] = useState<AgentStep | null>(null);
  const [braillePreview, setBraillePreview] = useState<string>("");
  const [agentReply, setAgentReply] = useState<{
    text: string;
    suggestedPage?: NavPage;
    suggestedPageLabel?: string;
  } | null>(null);
  const [activeDocName, setActiveDocName] = useState<string>(
    getActiveDocumentContext()?.filename || ""
  );
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<string>("");

  useEffect(() => {
    const onDocChange = () => {
      setActiveDocName(getActiveDocumentContext()?.filename || "");
    };
    window.addEventListener("braillebridge-doc-change", onDocChange);
    return () => window.removeEventListener("braillebridge-doc-change", onDocChange);
  }, []);

  const activeSpeed = onSpeechSpeedChange ? propSpeechSpeed : localSpeed;
  const phrases = getPhrases(language);
  const recognitionSupported = isSpeechRecognitionSupported();

  // Keep synced with Header and VoiceAgentBar language selections
  useEffect(() => {
    const handleLangSync = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom?.detail) {
        setLanguage(custom.detail);
        setSignalMessage(getPhrases(custom.detail).agentGreeting);
      }
    };
    window.addEventListener("braillebridge-language-change", handleLangSync);
    return () => window.removeEventListener("braillebridge-language-change", handleLangSync);
  }, []);

  const handleSpeedUpdate = (spd: number) => {
    if (onSpeechSpeedChange) onSpeechSpeedChange(spd);
    setLocalSpeed(spd);
  };

  const executionContext: AgentExecutionContext = {
    currentPage: "voice",
    onNavigate,
    speechSpeed: activeSpeed,
    onSpeechSpeedChange: handleSpeedUpdate,
    isHighContrast,
    onToggleContrast,
    fontSizeScale,
    onFontSizeScaleChange,
    onColorVisionModeChange,
  };

  useEffect(() => {
    const onSpaceRead = () => {
      const targetText = agentReply?.text || getPhrases(language).agentGreeting;
      speakText(targetText, { lang: language, rate: activeSpeed });
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  });

  const handleLanguageSelect = (langCode: string) => {
    setActiveLanguage(langCode);
    setLanguage(langCode);
    const nextPhrases = getPhrases(langCode);
    const matched = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    const msg = nextPhrases.voiceSwitched(matched?.nativeName || langCode);
    setSignalState("success");
    setSignalMessage(msg);
    speakText(msg, { lang: langCode, rate: activeSpeed });
  };

  const handleTestLanguageVoice = (langCode: string) => {
    setActiveLanguage(langCode);
    setLanguage(langCode);
    const sample = getPhrases(langCode).agentGreeting;
    setSignalState("success");
    setSignalMessage(sample);
    speakText(sample, { lang: langCode, rate: activeSpeed });
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      stopListening();
      setIsRecording(false);
      setSignalState("idle");
      setSignalMessage(phrases.listeningPaused);
      return;
    }

    stopSpeaking();
    setInterimText("");
    const started = startListening(
      {
        onStart: () => {
          setIsRecording(true);
          setSignalState("listening");
          setSignalMessage(phrases.listeningPrompt);
        },
        onInterim: (interim) => setInterimText(interim),
        onResult: (finalText) => {
          setTranscript(finalText);
          setInterimText("");
          setIsRecording(false);
          executeVoiceCommand(finalText);
        },
        onEnd: () => setIsRecording(false),
        onError: (err) => {
          setIsRecording(false);
          setSignalState("error");
          setSignalMessage(phrases.speechError(err));
          playEarcon("warning");
        },
      },
      language,
      false
    );

    if (!started) {
      setSignalState("error");
      setSignalMessage(phrases.micPermissionDenied);
    }
  };

  const executeVoiceCommand = async (rawCommand?: string) => {
    const command = (rawCommand ?? transcript).trim();
    if (!command) {
      setSignalState("error");
      setSignalMessage("Please speak or type a command first.");
      return;
    }

    setSignalState("processing");
    setSignalMessage(phrases.processingTask);
    setBraillePreview("");
    setPendingStep(null);
    setAgentReply(null);

    try {
      const plan = await planAgentTask(command, { currentPage: "voice", language });
      setActivePlan(plan);

      if (plan.steps.length === 0) {
        setSignalState("idle");
        setSignalMessage(plan.explanation);
        speakText(plan.explanation, { lang: language, rate: activeSpeed });
        return;
      }

      const outputs: string[] = [];
      let currentLang = language;

      for (const step of plan.steps) {
        if (step.status === "requires_permission") {
          setPendingStep(step);
          setSignalState("warning");
          const prompt =
            step.permissionPrompt || phrases.permissionRequired(step.description);
          const msg = outputs.length > 0 ? `${outputs.join(" ")} ${prompt}` : prompt;
          setSignalMessage(msg);
          speakText(msg, { lang: currentLang, rate: activeSpeed });
          return;
        }

        const res = await executeAgentStep(step, executionContext);
        step.status = res.success ? "completed" : "failed";
        if (res.data?.language) {
          currentLang = String(res.data.language);
          setLanguage(currentLang);
        }
        if (res.data?.brailleText) {
          setBraillePreview(res.data.brailleText);
        }
        if (res.message) {
          outputs.push(res.message);
          setAgentReply({
            text: outputs.join(" "),
            suggestedPage: res.data?.suggestedPage,
            suggestedPageLabel: res.data?.suggestedPageLabel,
          });
        }
      }

      const finalMsg = outputs.join(" ") || plan.explanation;
      setSignalState("success");
      setSignalMessage(finalMsg);
      speakText(finalMsg, { lang: currentLang, rate: activeSpeed });
      playEarcon("success");
    } catch (err: any) {
      setSignalState("error");
      setSignalMessage(err?.message || "Could not complete voice command.");
    }
  };

  const handleConfirmPending = async () => {
    if (!pendingStep) return;
    const step = pendingStep;
    setPendingStep(null);
    setSignalState("processing");
    setSignalMessage(phrases.confirmationAcknowledged);

    const res = await executeAgentStep(step, executionContext);
    step.status = res.success ? "completed" : "failed";
    setSignalState(res.success ? "success" : "error");
    setSignalMessage(res.message);
    speakText(res.message, { lang: language, rate: activeSpeed });
  };

  const handleCancelPending = () => {
    setPendingStep(null);
    setSignalState("idle");
    setSignalMessage(phrases.actionCanceled);
    speakText(phrases.actionCanceled, { lang: language, rate: activeSpeed });
    playEarcon("stop");
  };

  const handleReadTypedAloud = () => {
    const clean = transcript.trim();
    if (!clean) {
      speakText(phrases.agentGreeting, { lang: language, rate: activeSpeed });
      return;
    }
    setSignalState("success");
    setSignalMessage(`Speaking in ${language}…`);
    speakText(clean, { lang: language, rate: activeSpeed });
  };

  const handleTranslateTypedToBraille = () => {
    const clean = transcript.trim();
    if (!clean) return;
    const langInfo = SUPPORTED_LANGUAGES.find((l) => l.code === language);
    const tableId = langInfo?.brailleTableId || "en-ueb-g1";
    const res = translate(clean, tableId);
    if (res.success) {
      setBraillePreview(res.brailleText);
      const tableName = BRAILLE_TABLES[tableId]?.name || tableId;
      const msg = `Translated ${res.cellCount} Braille cells using ${tableName}.`;
      setSignalState("success");
      setSignalMessage(msg);
      speakText(msg, { lang: language, rate: activeSpeed });
    }
  };

  const handleCopyBraille = async () => {
    if (!braillePreview) return;
    try {
      await navigator.clipboard.writeText(braillePreview);
      setCopyStatus("Braille copied.");
      setTimeout(() => setCopyStatus(""), 2500);
    } catch {
      setCopyStatus("Select text to copy.");
    }
  };

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <p className="text-xs font-bold uppercase tracking-wider text-[#3155E7] mb-1">
        Voice-First Workspace
      </p>
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#202522] mb-3">
        Multilingual Voice Assistant
      </h1>
      <p className="text-base text-[#4b5750] mb-8 max-w-2xl">
        Speak naturally or type commands in English, Kannada, Hindi, Tamil, or Bengali.
        Every response is spoken back in your chosen language.
      </p>

      {/* Status Signal */}
      <div className="mb-6 p-3.5 bg-[#fffefa] border border-[#d8d7d0] rounded-md space-y-2">
        <SignalMark state={signalState} message={signalMessage} />
        {activeDocName && (
          <p className="text-xs font-bold text-[#3155E7]">
            📄 Active grounded document connected: {activeDocName} (Ask any question about it below!)
          </p>
        )}
      </div>

      {/* Language Selector & Live Multilingual Voice Tester */}
      <section
        className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm mb-8"
        aria-labelledby="voice-lang-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 id="voice-lang-heading" className="text-base font-bold text-[#202522]">
              Active Voice & Recognition Language
            </h2>
            <p className="text-xs text-[#59685d]">
              Select any language to immediately switch spoken greetings, commands, and microphone recognition.
            </p>
          </div>

          <select
            value={language}
            onChange={(e) => handleLanguageSelect(e.target.value)}
            aria-label="Choose active voice language"
            className="w-full sm:w-auto max-w-full p-2.5 bg-[#F7F5EF] border border-[#a6aaa2] rounded text-sm font-bold text-[#202522] focus:border-[#3155E7] outline-none"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName} — {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* One-Click Native Voice Preview Chips */}
        <div className="pt-3 border-t border-[#eeece5] flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#59685d] mr-1">Listen in native voice:</span>
          {SUPPORTED_LANGUAGES.filter((l) => l.code !== "en-IN").map((l) => (
            <button
              key={l.code}
              onClick={() => handleTestLanguageVoice(l.code)}
              className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
                language === l.code
                  ? "bg-[#3155E7] text-white border-[#3155E7]"
                  : "bg-[#F7F5EF] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7]"
              }`}
              aria-label={`Test spoken voice in ${l.name}`}
            >
              🔊 {l.nativeName}
            </button>
          ))}
        </div>
      </section>

      {/* Microphone & Natural Command Box */}
      <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm mb-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#202522]">Speak or Enter Instruction</h2>
            <p className="text-xs text-[#59685d]">
              Shortcut: <kbd className="font-mono bg-[#F7F5EF] px-1.5 py-0.5 border rounded">Alt+V</kbd> anywhere · Listening in{" "}
              <strong>{SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName || language}</strong>
            </p>
          </div>

          <button
            onClick={handleToggleRecord}
            disabled={!recognitionSupported}
            className={`px-6 py-3 font-bold text-sm rounded-md flex items-center gap-2 transition-all ${
              isRecording
                ? "bg-[#9b302d] text-white animate-pulse"
                : "bg-[#3155E7] text-white hover:bg-[#233fbe] disabled:opacity-40"
            }`}
            aria-pressed={isRecording}
          >
            <span>{isRecording ? "⏹ Stop Listening" : "🎙 Start Speaking"}</span>
          </button>
        </div>

        {!recognitionSupported && (
          <p className="text-xs text-[#795b19] bg-[#f4ecd6] p-2.5 rounded border border-[#d6bd7e]">
            Microphone speech recognition requires Chrome or Edge. You can type commands or phrases below and listen aloud in any language.
          </p>
        )}

        {isRecording && interimText && (
          <div className="p-3 bg-[#e4e8fb] border border-[#aab8f3] rounded text-sm text-[#243fa7] italic">
            Hearing: {interimText}…
          </div>
        )}

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Say or type e.g. 'Open study companion', 'Read today's agenda', 'Translate hello to Braille', 'ನಮಸ್ಕಾರ'…"
          rows={3}
          aria-label="Spoken transcript or text instruction"
          className="w-full p-3.5 bg-[#F7F5EF] text-[#202522] border border-[#a6aaa2] rounded-md focus:border-[#3155E7] outline-none text-base"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => executeVoiceCommand()}
            className="px-5 py-2.5 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] transition-colors"
          >
            ▶ Run Command
          </button>
          <button
            onClick={handleReadTypedAloud}
            className="px-4 py-2.5 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7] transition-colors"
          >
            🔊 Speak Text Aloud
          </button>
          <button
            onClick={handleTranslateTypedToBraille}
            className="px-4 py-2.5 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7] transition-colors"
          >
            ⠿ Convert to Braille
          </button>
          <button
            onClick={() => {
              setTranscript("");
              setBraillePreview("");
              setActivePlan(null);
            }}
            className="px-3 py-2 text-xs text-[#4b5750] hover:text-[#202522] ml-auto"
          >
            Clear
          </button>
        </div>
      </section>

      {/* Permission Safety Dialog Inline */}
      {pendingStep && (
        <section
          className="p-5 mb-8 bg-[#fdf4e4] border-2 border-[#795b19] rounded-md space-y-3"
          role="alertdialog"
          aria-label="Confirm voice action"
        >
          <strong className="text-sm text-[#795b19] block">
            Confirmation Required Before Executing
          </strong>
          <p className="text-sm text-[#202522]">
            {pendingStep.permissionPrompt || phrases.permissionRequired(pendingStep.description)}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleConfirmPending}
              className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe]"
            >
              Confirm & Execute
            </button>
            <button
              onClick={handleCancelPending}
              className="px-4 py-2 bg-white border border-[#a6aaa2] text-xs font-bold text-[#202522] rounded"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Agent Grounded Answer & Suggested Destination Card */}
      {agentReply && (
        <section
          className="p-5 mb-8 bg-[#e4e8fb] border border-[#aab8f3] rounded-md space-y-3 animate-result"
          role="region"
          aria-label="Assistant Answer and Suggestions"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#243fa7]">
              Assistant Response & Guidance
            </h2>
            <button
              onClick={() => speakText(agentReply.text, { lang: language, rate: activeSpeed })}
              className="text-xs font-bold text-[#3155E7] hover:underline"
            >
              🔊 Read Answer Aloud
            </button>
          </div>
          <p className="text-sm text-[#202522] leading-relaxed whitespace-pre-line">
            {agentReply.text}
          </p>
          {agentReply.suggestedPage && (
            <button
              onClick={() => onNavigate(agentReply.suggestedPage!)}
              className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] transition-colors"
            >
              {agentReply.suggestedPageLabel || `Open ${agentReply.suggestedPage}`} →
            </button>
          )}
        </section>
      )}

      {/* Braille Preview Result */}
      {braillePreview && (
        <section className="p-5 mb-8 bg-[#fffefa] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-md space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#202522]">Braille Output Preview</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyBraille}
                className="px-3 py-1 border border-[#3155E7] text-[#3155E7] text-xs font-bold rounded"
              >
                Copy Braille
              </button>
              {copyStatus && <span className="text-xs text-[#202522]">{copyStatus}</span>}
            </div>
          </div>
          <div className="font-mono text-3xl text-[#202522] p-4 bg-[#F7F5EF] rounded border border-[#d8d7d0] break-words">
            {braillePreview}
          </div>
        </section>
      )}

      {/* Audio Playback & Quick Voice Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Playback Controls */}
        <section className="p-5 bg-[#fffefa] border border-[#d8d7d0] rounded-md space-y-4">
          <h2 className="text-sm font-bold text-[#202522] uppercase tracking-wider">
            Audio Controls
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (isSpeechPaused()) {
                  resumeSpeaking();
                  setIsPaused(false);
                } else {
                  pauseSpeaking();
                  setIsPaused(true);
                }
              }}
              className="px-3.5 py-2 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
            >
              {isPaused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button
              onClick={() => {
                stopSpeaking();
                setIsPaused(false);
              }}
              className="px-3.5 py-2 bg-[#fffefa] border border-[#9b302d] text-[#9b302d] text-xs font-bold rounded hover:bg-[#9b302d]/10"
            >
              ⏹ Silence (Esc)
            </button>
            <button
              onClick={() => repeatLastSpoken()}
              className="px-3.5 py-2 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7]"
            >
              🔁 Repeat Last
            </button>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-[#eeece5] text-xs">
            <span className="text-[#59685d] font-medium">Speech Speed:</span>
            {[0.8, 1.0, 1.25, 1.5].map((spd) => (
              <button
                key={spd}
                onClick={() => handleSpeedUpdate(spd)}
                className={`px-2.5 py-1 rounded border font-bold ${
                  activeSpeed === spd
                    ? "border-[#3155E7] bg-[#3155E7]/10 text-[#3155E7]"
                    : "border-[#d8d7d0] text-[#4b5750]"
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </section>

        {/* Quick Voice Command Presets */}
        <section className="p-5 bg-[#fffefa] border border-[#d8d7d0] rounded-md space-y-3">
          <h2 className="text-sm font-bold text-[#202522] uppercase tracking-wider">
            Quick Voice Shortcuts
          </h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => executeVoiceCommand("Read this page")}
              className="p-2.5 text-left bg-[#F7F5EF] border border-[#d8d7d0] rounded font-semibold text-[#202522] hover:border-[#3155E7]"
            >
              🔊 Read Page Aloud
            </button>
            <button
              onClick={() => executeVoiceCommand("Go to study companion")}
              className="p-2.5 text-left bg-[#F7F5EF] border border-[#d8d7d0] rounded font-semibold text-[#202522] hover:border-[#3155E7]"
            >
              📖 Open Study Companion
            </button>
            <button
              onClick={() => executeVoiceCommand("Open planner")}
              className="p-2.5 text-left bg-[#F7F5EF] border border-[#d8d7d0] rounded font-semibold text-[#202522] hover:border-[#3155E7]"
            >
              📅 Open Study Planner
            </button>
            <button
              onClick={() => onToggleContrast()}
              className="p-2.5 text-left bg-[#F7F5EF] border border-[#d8d7d0] rounded font-semibold text-[#202522] hover:border-[#3155E7]"
            >
              🌓 Toggle Contrast
            </button>
          </div>
        </section>
      </div>
    </main>
  );
};
