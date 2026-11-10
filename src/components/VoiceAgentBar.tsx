import React, { useState, useEffect, useRef } from "react";
import { NavPage } from "./Header";
import {
  isSpeechRecognitionSupported,
  startListening,
  stopListening,
  speakText,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  isSpeechPaused,
  isSpeaking,
  playEarcon,
  repeatLastSpoken,
  getActiveLanguage,
  setActiveLanguage,
} from "../services/speechService";
import {
  planAgentTask,
  executeAgentStep,
  AgentPlan,
  AgentStep,
  AgentExecutionContext,
  addAgentAuditEntry,
  getAgentAuditLog,
  AgentAuditEntry,
} from "../services/agentService";
import { getPhrases, SUPPORTED_LANGUAGES } from "../services/i18nService";
import { getActiveDocumentContext } from "../services/appContextService";
import { ColorVisionMode } from "../services/supabaseService";
import { SignalMark, SignalState } from "./SignalMark";
import { VoiceOnboardingModal } from "./VoiceOnboardingModal";

interface VoiceAgentBarProps {
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

export const VoiceAgentBar: React.FC<VoiceAgentBarProps> = ({
  currentPage,
  onNavigate,
  speechSpeed,
  onSpeechSpeedChange,
  isHighContrast,
  onToggleContrast,
  fontSizeScale,
  onFontSizeScaleChange,
  onColorVisionModeChange,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>(getActiveLanguage());
  const [transcript, setTranscript] = useState<string>("");
  const [interimText, setInterimText] = useState<string>("");
  const [activePlan, setActivePlan] = useState<AgentPlan | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>(
    "Press 'Talk to BrailleBridge' or press Alt+V to speak."
  );
  const [pendingPermissionStep, setPendingPermissionStep] = useState<AgentStep | null>(null);
  const [isSpeechPausedState, setIsSpeechPausedState] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [showAuditLog, setShowAuditLog] = useState<boolean>(false);
  const [auditEntries, setAuditEntries] = useState<AgentAuditEntry[]>([]);
  const [typedQuery, setTypedQuery] = useState<string>("");
  const [agentReply, setAgentReply] = useState<{
    text: string;
    suggestedPage?: NavPage;
    suggestedPageLabel?: string;
  } | null>(null);
  const [activeDocName, setActiveDocName] = useState<string>(
    getActiveDocumentContext()?.filename || ""
  );

  const isExecutingRef = useRef<boolean>(false);
  const phrases = getPhrases(language);

  useEffect(() => {
    const onDocChange = () => {
      setActiveDocName(getActiveDocumentContext()?.filename || "");
    };
    window.addEventListener("braillebridge-doc-change", onDocChange);
    return () => window.removeEventListener("braillebridge-doc-change", onDocChange);
  }, []);

  // Sync with global language changes from Header or Voice Studio
  useEffect(() => {
    const handleLangSync = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom?.detail && custom.detail !== language) {
        setLanguage(custom.detail);
        const nextPhrases = getPhrases(custom.detail);
        setStatusMessage(nextPhrases.agentGreeting);
      }
    };
    window.addEventListener("braillebridge-language-change", handleLangSync);
    return () => window.removeEventListener("braillebridge-language-change", handleLangSync);
  }, [language]);

  // Check if first-use voice onboarding has been completed
  useEffect(() => {
    try {
      const onboarded = localStorage.getItem("braillebridge_onboarded");
      if (!onboarded) {
        setIsOnboardingOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // Global Alt+V shortcut for voice toggle & Alt+H for onboarding guide
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        setIsOpen(true);
        handleToggleListening();
      } else if (e.altKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        setIsOnboardingOpen(true);
      } else if (e.altKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isListening, continuousMode, language]);

  // Context for step execution
  const executionContext: AgentExecutionContext = {
    currentPage,
    onNavigate,
    speechSpeed,
    onSpeechSpeedChange,
    isHighContrast,
    onToggleContrast,
    fontSizeScale,
    onFontSizeScaleChange,
    onColorVisionModeChange,
  };

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
      setIsListening(false);
      setSignalState("idle");
      setStatusMessage(phrases.listeningPaused);
    } else {
      setInterimText("");
      stopSpeaking();
      const started = startListening(
        {
          onStart: () => {
            setIsListening(true);
            setSignalState("listening");
            setStatusMessage(phrases.listeningPrompt);
          },
          onInterim: (interim) => {
            setInterimText(interim);
          },
          onResult: (finalText) => {
            setTranscript(finalText);
            setInterimText("");
            setSignalState("processing");
            setStatusMessage(`Heard: "${finalText}". Planning steps…`);
            handleProcessVoiceCommand(finalText);
          },
          onEnd: () => {
            setIsListening(false);
            if (continuousMode && !isExecutingRef.current && !pendingPermissionStep) {
              // In continuous mode, restart listening after a brief breath if not actively speaking
              setTimeout(() => {
                if (!isSpeaking() && !pendingPermissionStep) {
                  handleToggleListening();
                }
              }, 700);
            }
          },
          onError: (err) => {
            setIsListening(false);
            setSignalState("error");
            setStatusMessage(phrases.speechError(err));
            playEarcon("warning");
          },
        },
        language,
        false
      );

      if (!started) {
        setSignalState("error");
        setStatusMessage(phrases.micPermissionDenied);
      }
    }
  };

  const handleProcessVoiceCommand = async (spokenText: string) => {
    const text = spokenText.trim();
    if (!text) return;

    const lower = text.toLowerCase();

    // 1. Direct verbal confirmation / cancellation handler when awaiting permission
    if (pendingPermissionStep) {
      if (
        lower.includes("yes") ||
        lower.includes("confirm") ||
        lower.includes("proceed") ||
        lower.includes("ok") ||
        lower.includes("sure") ||
        lower.includes("हाँ") ||
        lower.includes("कन्फर्म") ||
        lower.includes("दೃಢೀಕರಿಸಿ") ||
        lower.includes("ಸರಿ") ||
        lower.includes("உறுதி") ||
        lower.includes("হ্যাঁ")
      ) {
        confirmPendingStep();
        return;
      }
      if (
        lower.includes("no") ||
        lower.includes("cancel") ||
        lower.includes("stop") ||
        lower.includes("abort") ||
        lower.includes("रद्द") ||
        lower.includes("ನಿಲ್ಲಿಸು") ||
        lower.includes("ರದ್ದು") ||
        lower.includes("வேண்டாம்") ||
        lower.includes("বাতিল")
      ) {
        cancelPendingStep();
        return;
      }
    }

    // 2. Direct verbal control commands
    if (
      lower.includes("stop speaking") ||
      lower.includes("silence") ||
      lower.includes("quiet") ||
      lower.includes("चुप") ||
      lower.includes("ನಿಲ್ಲಿಸು")
    ) {
      stopSpeaking();
      setStatusMessage("Speech silenced.");
      return;
    }

    if (
      lower.includes("say that again") ||
      lower.includes("repeat") ||
      lower.includes("दोहराओ") ||
      lower.includes("ಮತ್ತೆ ಹೇಳು") ||
      lower.includes("மீண்டும் சொல்") ||
      lower.includes("আবার বলুন")
    ) {
      const repeated = repeatLastSpoken();
      if (!repeated) {
        speakText(phrases.nothingToRepeat, { lang: language, rate: speechSpeed });
      }
      return;
    }

    // 3. Open Voice Tour
    if (lower.includes("voice tour") || lower.includes("onboarding") || lower.includes("टूर") || lower.includes("ಹೇಗೆ ಬಳಸುವುದು")) {
      setIsOnboardingOpen(true);
      return;
    }

    isExecutingRef.current = true;
    setSignalState("processing");

    try {
      const plan = await planAgentTask(text, { currentPage, language });
      setActivePlan(plan);
      setCurrentStepIndex(0);

      if (plan.steps.length === 0) {
        setSignalState("idle");
        setStatusMessage(plan.explanation);
        speakText(plan.explanation, { lang: language, rate: speechSpeed });
        isExecutingRef.current = false;
        return;
      }

      // Execute steps sequentially
      await runPlanSequence(plan, 0, text);
    } catch (err: any) {
      setSignalState("error");
      setStatusMessage(`Agent error: ${err?.message || "Could not complete task"}`);
      playEarcon("warning");
      isExecutingRef.current = false;
    }
  };

  const runPlanSequence = async (
    plan: AgentPlan,
    startIdx: number,
    originalPrompt?: string
  ) => {
    const collectedMessages: string[] = [];
    let latestLang = language;

    for (let idx = startIdx; idx < plan.steps.length; idx++) {
      const step = plan.steps[idx];
      setCurrentStepIndex(idx);

      if (step.status === "requires_permission") {
        setPendingPermissionStep(step);
        setSignalState("warning");
        const prompt =
          step.permissionPrompt || phrases.permissionRequired(step.description);
        const combined = collectedMessages.length > 0
          ? `${collectedMessages.join(" ")} ${prompt}`
          : prompt;
        setStatusMessage(combined);
        speakText(combined, { lang: latestLang, rate: speechSpeed });
        isExecutingRef.current = false;
        return;
      }

      setSignalState("processing");
      setStatusMessage(`Executing: ${step.description}…`);
      const result = await executeAgentStep(step, executionContext);

      step.status = result.success ? "completed" : "failed";
      step.result = result.data;
      step.error = result.message;

      if (result.data?.language) {
        latestLang = String(result.data.language);
        setLanguage(latestLang);
      }

      if (result.message) {
        collectedMessages.push(result.message);
        setAgentReply({
          text: collectedMessages.join(" "),
          suggestedPage: result.data?.suggestedPage,
          suggestedPageLabel: result.data?.suggestedPageLabel,
        });
      }
    }

    const summary = collectedMessages.join(" ") || phrases.taskCompleted;
    setSignalState("success");
    setStatusMessage(summary);
    playEarcon("success");
    speakText(summary, { lang: latestLang, rate: speechSpeed });
    isExecutingRef.current = false;

    addAgentAuditEntry({
      spokenInput: originalPrompt || transcript,
      language: latestLang,
      intent: plan.userIntent,
      stepsCount: plan.steps.length,
      status: "completed",
      details: `Completed ${plan.steps.length} tool step(s): ${summary}`,
    });
  };

  const confirmPendingStep = async () => {
    if (!pendingPermissionStep || !activePlan) return;
    const step = pendingPermissionStep;
    setPendingPermissionStep(null);

    setSignalState("processing");
    setStatusMessage(phrases.confirmationAcknowledged);
    const result = await executeAgentStep(step, executionContext);

    step.status = result.success ? "completed" : "failed";
    step.result = result.data;
    step.error = result.message;
    setStatusMessage(result.message);

    // Log confirmed action
    addAgentAuditEntry({
      spokenInput: transcript,
      language,
      intent: activePlan.userIntent,
      stepsCount: activePlan.steps.length,
      status: result.success ? "completed" : "failed",
      details: `User confirmed: ${step.description}. Result: ${result.message}`,
    });

    if (currentStepIndex + 1 < activePlan.steps.length) {
      await runPlanSequence(activePlan, currentStepIndex + 1);
    } else {
      setSignalState(result.success ? "success" : "error");
      playEarcon(result.success ? "success" : "warning");
      speakText(result.message, { lang: language, rate: speechSpeed });
      isExecutingRef.current = false;
    }
  };

  const cancelPendingStep = () => {
    const step = pendingPermissionStep;
    setPendingPermissionStep(null);
    setSignalState("idle");
    const msg = phrases.actionCanceled;
    setStatusMessage(msg);
    speakText(msg, { lang: language, rate: speechSpeed });
    playEarcon("stop");
    isExecutingRef.current = false;

    if (activePlan) {
      addAgentAuditEntry({
        spokenInput: transcript,
        language,
        intent: activePlan.userIntent,
        stepsCount: activePlan.steps.length,
        status: "canceled",
        details: `Canceled by user: ${step ? step.description : "Action"}`,
      });
    }
  };

  const handlePauseResumeTTS = () => {
    if (isSpeechPaused()) {
      resumeSpeaking();
      setIsSpeechPausedState(false);
    } else {
      pauseSpeaking();
      setIsSpeechPausedState(true);
    }
  };

  const handleOpenAuditLog = () => {
    setAuditEntries(getAgentAuditLog());
    setShowAuditLog(true);
  };

  return (
    <>
      {/* First-Use Voice Onboarding Modal */}
      <VoiceOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onStartVoice={() => {
          setIsOnboardingOpen(false);
          setIsOpen(true);
          handleToggleListening();
        }}
        currentLanguage={language}
        onLanguageChange={(val) => {
          setLanguage(val);
          setActiveLanguage(val);
        }}
      />

      {/* Floating Persistent Activation Bar (Always Accessible) */}
      <div
        className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-50 flex items-center gap-2"
        role="region"
        aria-label="Voice Agent Control"
      >
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen && !isListening) {
              handleToggleListening();
            }
          }}
          className={`flex items-center gap-2 sm:gap-2.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-full shadow-lg border text-xs sm:text-sm font-bold transition-all ${
            isListening
              ? "bg-[#9b302d] text-white border-[#7b2421] ring-4 ring-[#9b302d]/30 animate-pulse"
              : isHighContrast
              ? "bg-[#3155E7] text-white border-white hover:bg-[#233fbe]"
              : "bg-[#202522] text-white border-[#3155E7] hover:bg-[#3155E7]"
          }`}
          aria-expanded={isOpen}
          aria-label={
            isListening
              ? "Voice Agent Active. Stop listening."
              : "Talk to BrailleBridge Agent. Press Alt+V."
          }
        >
          {/* Animated 6-dot mark */}
          <span className="inline-grid grid-cols-3 gap-0.5" aria-hidden="true">
            <i className={`w-1.5 h-1.5 rounded-full ${isListening ? "bg-white animate-bounce" : "bg-[#3155E7]"}`}></i>
            <i className={`w-1.5 h-1.5 rounded-full ${isListening ? "bg-white animate-bounce delay-75" : "bg-[#3155E7]"}`}></i>
            <i className={`w-1.5 h-1.5 rounded-full ${isListening ? "bg-white animate-bounce delay-150" : "bg-[#3155E7]"}`}></i>
            <i className="w-1.5 h-1.5 rounded-full bg-white/60"></i>
            <i className="w-1.5 h-1.5 rounded-full bg-white/60"></i>
            <i className="w-1.5 h-1.5 rounded-full bg-white/60"></i>
          </span>
          <span>{isListening ? "Listening… (Stop)" : "Talk to BrailleBridge"}</span>
          <kbd className="hidden sm:inline-block font-mono text-[10px] bg-black/30 px-1.5 py-0.5 rounded text-white/80">
            Alt+V
          </kbd>
        </button>
      </div>

      {/* Expanded Voice Agent Panel */}
      {isOpen && (
        <div
          className="fixed bottom-[4.5rem] right-3 left-3 sm:bottom-20 sm:right-4 sm:left-auto sm:w-[500px] max-h-[calc(100dvh-5.5rem)] sm:max-h-[calc(100dvh-6.5rem)] z-50 bg-[#fffefa] border-2 border-[#3155E7] rounded-xl shadow-2xl overflow-hidden flex flex-col transition-all text-[#202522]"
          role="dialog"
          aria-labelledby="agent-panel-title"
          aria-modal="false"
        >
          {/* Header */}
          <div className="shrink-0 bg-[#202522] text-white px-3.5 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3155E7] animate-ping" />
              <h2 id="agent-panel-title" className="text-sm font-bold">
                BrailleBridge Voice Agent
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <button
                onClick={() => setIsOnboardingOpen(true)}
                className="text-white/80 hover:text-white text-xs font-bold px-2 py-1 rounded hover:bg-white/10"
                title="Open Voice Onboarding Tour (Alt+H)"
                aria-label="Open voice onboarding guide"
              >
                Tour (Alt+H)
              </button>
              <button
                onClick={handleOpenAuditLog}
                className="text-white/80 hover:text-white text-xs font-bold px-2 py-1 rounded hover:bg-white/10"
                title="View Agent Task Audit Log"
                aria-label="View agent activity audit log"
              >
                📋 Audit
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white text-xs font-bold px-2 py-1 rounded hover:bg-white/10"
                aria-label="Minimize voice panel"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Status signal instrument & active document context */}
          <div className="shrink-0 p-3 bg-[#F7F5EF] border-b border-[#d8d7d0] space-y-1.5">
            <SignalMark state={signalState} message={statusMessage} />
            {activeDocName && (
              <div className="text-[11px] font-bold text-[#3155E7] flex items-center gap-1.5">
                <span aria-hidden="true">📄</span>
                <span>Grounded document active: {activeDocName}</span>
              </div>
            )}
          </div>

          {/* Direct Question / Command Text Input inside Drawer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!typedQuery.trim()) return;
              const q = typedQuery.trim();
              setTranscript(q);
              setTypedQuery("");
              handleProcessVoiceCommand(q);
            }}
            className="shrink-0 px-3.5 sm:px-4 pt-3 pb-2 flex items-center gap-2 border-b border-[#eeece5]"
          >
            <input
              type="text"
              value={typedQuery}
              onChange={(e) => setTypedQuery(e.target.value)}
              placeholder="Ask anything (website, notes, or command)…"
              aria-label="Ask BrailleBridge Agent a question or type a command"
              className="flex-1 min-w-0 px-3 py-1.5 bg-[#F7F5EF] border border-[#a6aaa2] rounded text-xs text-[#202522] outline-none focus:border-[#3155E7]"
            />
            <button
              type="submit"
              disabled={!typedQuery.trim()}
              className="shrink-0 px-3 py-1.5 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] disabled:opacity-40"
            >
              Ask
            </button>
          </form>

          {/* Transcript / Answer / Plan Drawer */}
          <div className="flex-1 min-h-0 p-3.5 sm:p-4 space-y-3 overflow-y-auto">
            {isListening && interimText && (
              <div className="p-2.5 bg-[#e4e8fb] border border-[#aab8f3] rounded text-xs text-[#243fa7] italic">
                Hearing: {interimText}…
              </div>
            )}

            {agentReply && (
              <div
                className="p-3 bg-[#e4e8fb] border border-[#aab8f3] rounded text-xs space-y-2"
                role="region"
                aria-label="Agent response"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-[#243fa7]">Agent Answer</strong>
                  <button
                    onClick={() =>
                      speakText(agentReply.text, { lang: language, rate: speechSpeed })
                    }
                    className="text-[11px] font-bold text-[#3155E7] hover:underline"
                  >
                    🔊 Listen
                  </button>
                </div>
                <p className="text-[#202522] leading-relaxed whitespace-pre-line">
                  {agentReply.text}
                </p>
                {agentReply.suggestedPage && (
                  <button
                    onClick={() => onNavigate(agentReply.suggestedPage!)}
                    className="px-3 py-1 bg-[#3155E7] text-white text-[11px] font-bold rounded hover:bg-[#233fbe] transition-colors"
                  >
                    {agentReply.suggestedPageLabel || `Go to ${agentReply.suggestedPage}`} →
                  </button>
                )}
              </div>
            )}

            {transcript && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#4b5750]">
                    Recognized Transcript
                  </span>
                  <span className="text-[10px] text-[#3155E7] font-bold">
                    Language: {language}
                  </span>
                </div>
                <p className="p-2.5 bg-white border border-[#d8d7d0] rounded text-sm text-[#202522] font-medium">
                  "{transcript}"
                </p>
              </div>
            )}

            {/* Active Plan Steps */}
            {activePlan && activePlan.steps.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#d8d7d0]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#3155E7]">
                    Agent Multi-Step Plan ({activePlan.steps.length} steps)
                  </span>
                  <span className="text-[10px] text-[#59685d] font-mono">
                    Intent: {activePlan.userIntent}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {activePlan.steps.map((st, i) => (
                    <div
                      key={st.id || i}
                      className={`p-2 rounded border text-xs flex items-center justify-between gap-2 ${
                        st.status === "completed"
                          ? "bg-[#eaf5ec] border-[#7ecb8f] text-[#1e612f]"
                          : st.status === "requires_permission"
                          ? "bg-[#fdf4e4] border-[#e7bc78] text-[#795b19] font-bold"
                          : i === currentStepIndex
                          ? "bg-[#e4e8fb] border-[#3155E7] text-[#243fa7] font-medium"
                          : "bg-white border-[#d8d7d0] text-[#59685d]"
                      }`}
                    >
                      <span>
                        {i + 1}. {st.description}
                      </span>
                      <span className="font-mono text-[10px] uppercase">
                        {st.status === "completed"
                          ? "✓ Done"
                          : st.status === "requires_permission"
                          ? "⚠ Confirm"
                          : i === currentStepIndex
                          ? "▶ Running"
                          : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Permission Prompt Modal Banner */}
            {pendingPermissionStep && (
              <div
                className="p-3 bg-[#fdf4e4] border-2 border-[#795b19] rounded-md space-y-2 animate-fade-in"
                role="alertdialog"
                aria-labelledby="perm-title"
              >
                <strong id="perm-title" className="text-xs text-[#795b19] block">
                  Confirmation Required (Consequential Safety Guard)
                </strong>
                <p className="text-xs text-[#202522]">
                  {pendingPermissionStep.permissionPrompt ||
                    phrases.permissionRequired(pendingPermissionStep.description)}
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={cancelPendingStep}
                    className="px-3 py-1 bg-white border border-[#a6aaa2] text-xs font-bold text-[#202522] rounded hover:bg-[#eeece5]"
                  >
                    Cancel (No)
                  </button>
                  <button
                    onClick={confirmPendingStep}
                    className="px-3 py-1 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe]"
                  >
                    Confirm (Yes)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Controls Footer */}
          <div className="shrink-0 p-3 bg-[#F7F5EF] border-t border-[#d8d7d0] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                onClick={handleToggleListening}
                className={`px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 ${
                  isListening
                    ? "bg-[#9b302d] text-white"
                    : "bg-[#3155E7] text-white hover:bg-[#233fbe]"
                }`}
              >
                <span>{isListening ? "⏹ Stop Listening" : "🎙 Listen"}</span>
              </button>

              <button
                onClick={handlePauseResumeTTS}
                className="px-2.5 py-1.5 bg-white border border-[#a6aaa2] text-[#202522] rounded font-bold hover:border-[#3155E7]"
                title="Pause or resume current spoken response"
              >
                {isSpeechPausedState ? "▶ Resume" : "⏸ Pause"}
              </button>

              <button
                onClick={() => stopSpeaking()}
                className="px-2.5 py-1.5 bg-white border border-[#a6aaa2] text-[#9b302d] rounded font-bold hover:bg-[#9b302d]/10"
                title="Silence speech immediately (Esc)"
              >
                Silence
              </button>

              <button
                onClick={() => repeatLastSpoken()}
                className="px-2.5 py-1.5 bg-white border border-[#a6aaa2] text-[#202522] rounded font-bold hover:border-[#3155E7]"
                title="Repeat last spoken message"
              >
                🔁 Repeat
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] text-[#4b5750] cursor-pointer">
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={(e) => setContinuousMode(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#3155E7]"
                />
                <span>Continuous</span>
              </label>

              <select
                value={language}
                onChange={(e) => {
                  const val = e.target.value;
                  setLanguage(val);
                  setActiveLanguage(val);
                  const matched = SUPPORTED_LANGUAGES.find((l) => l.code === val);
                  const msg = getPhrases(val).voiceSwitched(matched?.nativeName || val);
                  speakText(msg, { lang: val, rate: speechSpeed });
                  setStatusMessage(msg);
                }}
                className="p-1 bg-white border border-[#a6aaa2] rounded text-[11px] text-[#202522] max-w-[160px] sm:max-w-none"
                aria-label="Agent Voice Recognition Language"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName} ({l.name})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Task Audit Log Modal Drawer */}
      {showAuditLog && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-log-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAuditLog(false);
          }}
        >
          <div className="bg-[#fffefa] border-2 border-[#3155E7] p-4 sm:p-6 rounded-xl shadow-2xl max-w-2xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden space-y-3 sm:space-y-4 text-[#202522]">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#d8d7d0]">
              <div>
                <h2 id="audit-log-title" className="text-lg font-bold text-[#202522]">
                  Agent Task Audit Trail
                </h2>
                <p className="text-xs text-[#59685d]">
                  Review executed agentic operations, user confirmations, and tool calls.
                </p>
              </div>
              <button
                onClick={() => setShowAuditLog(false)}
                className="px-3 py-1.5 text-xs font-bold border border-[#a6aaa2] rounded hover:bg-[#eeece5]"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
              {auditEntries.length === 0 ? (
                <p className="text-xs text-[#59685d] italic py-8 text-center">
                  No actions logged yet in this session. Speak a command to begin.
                </p>
              ) : (
                auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 bg-[#F7F5EF] rounded border border-[#d8d7d0] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-[#3155E7]">{entry.intent}</strong>
                      <span className="font-mono text-[10px] text-[#59685d]">
                        {entry.timestamp} · {entry.language}
                      </span>
                    </div>
                    <p className="text-[#202522]">
                      Command: <em>"{entry.spokenInput}"</em>
                    </p>
                    <p className="text-[#4b5750] text-[11px]">{entry.details}</p>
                    <div className="pt-1">
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          entry.status === "completed"
                            ? "bg-[#eaf5ec] text-[#1e612f]"
                            : entry.status === "canceled"
                            ? "bg-[#fdf4e4] text-[#795b19]"
                            : "bg-[#fbeaea] text-[#9b302d]"
                        }`}
                      >
                        Status: {entry.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#d8d7d0] text-xs">
              <span className="text-[#59685d] text-[11px]">
                Audit log is kept locally in browser memory and cleared on session restart.
              </span>
              <button
                onClick={() => setShowAuditLog(false)}
                className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
