import React, { useState, useEffect } from "react";
import {
  GameType,
  GameQuestion,
  GameScoreState,
  generateQuestion,
  evaluateAnswer,
  loadGameProgress,
  saveGameProgress,
  resetGameProgress,
} from "../services/gamesService";
import {
  BRAILLE_TABLES,
  describeBrailleDots,
  brailleFromDots,
} from "../services/brailleService";
import { speakText, stopSpeaking, playEarcon } from "../services/speechService";
import {
  fetchGameProgressFromCloud,
  saveGameProgressToCloud,
} from "../services/supabaseService";
import { PerkinsKeyboard } from "../components/PerkinsKeyboard";
import { SignalMark, SignalState } from "../components/SignalMark";

export const BrailleGamesView: React.FC = () => {
  const [selectedGame, setSelectedGame] = useState<GameType>("dot_detective");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en-ueb-g1");
  const [currentQuestion, setCurrentQuestion] = useState<GameQuestion | null>(null);
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [activeBuilderDots, setActiveBuilderDots] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{
    submitted: boolean;
    isCorrect: boolean;
    text: string;
    details?: string;
  } | null>(null);
  const [scoreState, setScoreState] = useState<GameScoreState>(loadGameProgress());
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState<string>(
    "Select an activity, listen to the audio prompt, and practice. Your progress is saved automatically."
  );
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);

  // Load progress from Supabase on mount
  useEffect(() => {
    fetchGameProgressFromCloud()
      .then((cloudProgress) => {
        if (cloudProgress && cloudProgress.attempts > 0) {
          const local = loadGameProgress();
          // Merge best
          const merged: GameScoreState = {
            attempts: Math.max(local.attempts, cloudProgress.attempts),
            correct: Math.max(local.correct, cloudProgress.correct),
            streak: Math.max(local.streak, cloudProgress.streak),
            bestStreak: Math.max(local.bestStreak, cloudProgress.bestStreak),
            history: cloudProgress.history?.length ? (cloudProgress.history as any) : local.history,
          };
          setScoreState(merged);
          saveGameProgress(merged);
          setIsCloudSynced(true);
        }
      })
      .catch(() => {});
  }, []);

  // Keyboard listener for Pattern Builder (keys 1-6 toggle dots, Enter commits)
  useEffect(() => {
    if (selectedGame !== "pattern_builder") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 6) {
        e.preventDefault();
        handleToggleBuilderDot(num);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSubmitAnswer();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedGame, activeBuilderDots, currentQuestion]);

  // Initialize or change question
  const startNewQuestion = (game: GameType = selectedGame, lang: string = selectedLanguage) => {
    stopSpeaking();
    const q = generateQuestion(game, lang);
    setCurrentQuestion(q);
    setUserAnswer("");
    setActiveBuilderDots([]);
    setFeedback(null);
    setSignalState("idle");
    setSignalMessage(`Activity: ${formatGameTitle(game)}. Press Read Prompt Aloud to hear the instructions.`);
  };

  useEffect(() => {
    startNewQuestion(selectedGame, selectedLanguage);
  }, [selectedGame, selectedLanguage]);

  const handleReadPromptAloud = () => {
    if (!currentQuestion) return;
    speakText(currentQuestion.audioPromptText);
  };

  useEffect(() => {
    const onSpaceRead = () => {
      if (currentQuestion) {
        handleReadPromptAloud();
      } else {
        speakText("Braille Games Academy: Select a game tab and answer the Braille prompt.");
      }
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  });

  const handleToggleBuilderDot = (dotNum: number) => {
    const isNowActive = !activeBuilderDots.includes(dotNum);
    playEarcon(isNowActive ? "start" : "stop");

    setActiveBuilderDots((prev) => {
      const updated = isNowActive ? [...prev, dotNum] : prev.filter((d) => d !== dotNum);
      const desc = updated.length > 0 ? describeBrailleDots(brailleFromDots(updated)) : "No dots";
      speakText(`Dot ${dotNum} ${isNowActive ? "raised" : "lowered"}. Current: ${desc}`);
      return updated;
    });
  };

  const handleSubmitAnswer = (answerToSubmit?: string) => {
    if (!currentQuestion) return;

    let submission = answerToSubmit ?? userAnswer;
    if (currentQuestion.gameType === "pattern_builder") {
      submission = brailleFromDots(activeBuilderDots);
    }

    if (!submission && submission !== "⠀") {
      setSignalState("error");
      setSignalMessage("Please select or enter an answer first.");
      speakText("Please select or build an answer before submitting.");
      return;
    }

    const evaluation = evaluateAnswer(currentQuestion, submission);

    // Update score
    const newAttempts = scoreState.attempts + 1;
    const newCorrect = evaluation.isCorrect ? scoreState.correct + 1 : scoreState.correct;
    const newStreak = evaluation.isCorrect ? scoreState.streak + 1 : 0;
    const newBest = Math.max(newStreak, scoreState.bestStreak);

    const updatedState: GameScoreState = {
      attempts: newAttempts,
      correct: newCorrect,
      streak: newStreak,
      bestStreak: newBest,
      history: [
        {
          game: selectedGame,
          question: currentQuestion.prompt,
          userAnswer: submission,
          correctAnswer: currentQuestion.targetChar,
          isCorrect: evaluation.isCorrect,
          timestamp: Date.now(),
        },
        ...scoreState.history.slice(0, 19),
      ],
    };

    setScoreState(updatedState);
    saveGameProgress(updatedState);

    // Sync to Supabase Cloud
    saveGameProgressToCloud(updatedState)
      .then((ok) => {
        if (ok) setIsCloudSynced(true);
      })
      .catch(() => {});

    setFeedback({
      submitted: true,
      isCorrect: evaluation.isCorrect,
      text: evaluation.feedback,
      details: evaluation.comparison?.explanation,
    });

    setSignalState(evaluation.isCorrect ? "success" : "error");
    setSignalMessage(evaluation.feedback);

    // Audio feedback announcement
    const spokenFeedback = evaluation.isCorrect
      ? `Correct! Well done.`
      : `Explain my mistake: ${evaluation.feedback}`;
    speakText(spokenFeedback);
  };

  const handleResetProgress = () => {
    const fresh = resetGameProgress();
    setScoreState(fresh);
    saveGameProgressToCloud(fresh).catch(() => {});
    setSignalState("idle");
    setSignalMessage("Learning progress and streaks have been reset.");
    speakText("Progress has been reset.");
  };

  function formatGameTitle(type: GameType): string {
    switch (type) {
      case "dot_detective":
        return "Dot Detective";
      case "hear_it_spell_it":
        return "Hear It, Spell It";
      case "pattern_builder":
        return "Pattern Builder";
      case "memory_practice":
        return "Memory Practice";
      case "language_bridge":
        return "Language Bridge";
      default:
        return "Braille Activity";
    }
  }

  const accuracyPercent =
    scoreState.attempts > 0 ? Math.round((scoreState.correct / scoreState.attempts) * 100) : 0;

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Eyebrow & Title */}
      <p className="text-xs font-bold uppercase tracking-wider text-[#4b5750] mb-1">
        Interactive Academy
      </p>
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#202522] mb-3">
        Braille Learning Games & Academy
      </h1>
      <p className="text-base text-[#4b5750] mb-8 max-w-2xl">
        Practice Braille cell patterns, listen to spoken phonetic cues, build tactile matrices, and learn
        Bharati Braille with "Explain My Mistake" dot diagnostics.
      </p>

      {/* 6-dot status instrument */}
      <div className="mb-6 p-3 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
        <SignalMark state={signalState} message={signalMessage} />
      </div>

      {/* Activity Navigation Tabs */}
      <section className="mb-6" aria-label="Game activities">
        <div className="flex flex-wrap gap-2 border-b border-[#d8d7d0] pb-3">
          {(
            [
              { id: "dot_detective", label: "01. Dot Detective" },
              { id: "hear_it_spell_it", label: "02. Hear It, Spell It" },
              { id: "pattern_builder", label: "03. Pattern Builder" },
              { id: "memory_practice", label: "04. Memory Practice" },
              { id: "language_bridge", label: "05. Language Bridge" },
            ] as const
          ).map((tab) => {
            const isActive = selectedGame === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedGame(tab.id);
                  startNewQuestion(tab.id, selectedLanguage);
                }}
                className={`px-3.5 py-2 rounded text-xs font-bold transition-all ${
                  isActive
                    ? "bg-[#3155E7] text-white shadow-sm"
                    : "bg-[#fffefa] border border-[#d8d7d0] text-[#4b5750] hover:text-[#202522] hover:border-[#3155E7]"
                }`}
                aria-pressed={isActive}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Score Dashboard & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md mb-8 text-xs">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div>
            <span className="text-[#59685d] block">Current Streak</span>
            <strong className="text-base font-bold text-[#3155E7]">🔥 {scoreState.streak}</strong>
          </div>
          <div>
            <span className="text-[#59685d] block">Best Streak</span>
            <strong className="text-base font-bold text-[#202522]">🏆 {scoreState.bestStreak}</strong>
          </div>
          <div>
            <span className="text-[#59685d] block">Accuracy</span>
            <strong className="text-base font-bold text-[#202522]">
              {accuracyPercent}% ({scoreState.correct}/{scoreState.attempts})
            </strong>
          </div>
          <div>
            <span className="text-[#59685d] block">Progress</span>
            <span className="font-bold text-emerald-600">✓ Saved</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[#59685d] flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <span>Language:</span>
            <select
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value);
                startNewQuestion(selectedGame, e.target.value);
              }}
              className="p-1.5 bg-[#F7F5EF] border border-[#a6aaa2] rounded text-xs text-[#202522] w-full sm:w-auto max-w-full"
            >
              {Object.values(BRAILLE_TABLES).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={handleResetProgress}
            className="px-2.5 py-1.5 text-xs text-[#9b302d] border border-transparent hover:border-[#9b302d] rounded transition-colors"
          >
            Reset Progress
          </button>
        </div>
      </div>

      {/* Game Card */}
      {currentQuestion && (
        <section
          className="p-4 sm:p-6 bg-[#fffefa] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-md shadow-sm mb-8 animate-result"
          role="region"
          aria-label={`Question: ${currentQuestion.prompt}`}
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[#d8d7d0]">
            <span className="text-xs font-bold uppercase tracking-wider text-[#3155E7]">
              {formatGameTitle(selectedGame)} · {currentQuestion.language || "Standard"}
            </span>
            <button
              onClick={handleReadPromptAloud}
              className="px-3 py-1 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] rounded text-xs font-bold hover:border-[#3155E7] flex items-center gap-1.5"
              aria-label="Read prompt aloud"
            >
              <span>🔊 Read Prompt Aloud</span>
            </button>
          </div>

          {/* Prompt */}
          <h2 className="text-xl font-serif font-bold text-[#202522] mb-6 leading-relaxed">
            {currentQuestion.prompt}
          </h2>

          {/* Multiple Choice Options */}
          {currentQuestion.options && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {currentQuestion.options.map((opt, idx) => {
                const isSelected = userAnswer === opt;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setUserAnswer(opt);
                      handleSubmitAnswer(opt);
                    }}
                    className={`p-4 rounded border text-left font-bold text-sm transition-all flex items-center justify-between ${
                      isSelected
                        ? "bg-[#3155E7]/10 border-[#3155E7] text-[#3155E7]"
                        : "bg-[#F7F5EF] border-[#d8d7d0] text-[#202522] hover:border-[#3155E7]"
                    }`}
                    aria-label={`Choice ${idx + 1}: ${opt}`}
                  >
                    <span>{opt}</span>
                    <span className="text-xs text-[#59685d] font-mono">[{idx + 1}]</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pattern Builder (Interactive 6-dot Matrix with keys 1-6 support) */}
          {selectedGame === "pattern_builder" && (
            <div className="mb-6 space-y-4">
              <div className="max-w-xs mx-auto p-4 bg-[#eeece5] rounded border border-[#d8d7d0]">
                <p className="text-xs text-center font-bold text-[#4b5750] mb-2">
                  Toggle dots using buttons or physical keys 1 to 6:
                </p>
                <div className="grid grid-cols-2 gap-4 max-w-[160px] mx-auto py-2">
                  {[1, 4, 2, 5, 3, 6].map((dotNum) => {
                    const isRaised = activeBuilderDots.includes(dotNum);
                    return (
                      <button
                        key={dotNum}
                        onClick={() => handleToggleBuilderDot(dotNum)}
                        className={`w-14 h-14 rounded-full border-2 flex items-center justify-center font-mono font-bold text-sm transition-all ${
                          isRaised
                            ? "bg-[#3155E7] text-white border-[#3155E7] shadow-inner"
                            : "bg-white text-[#202522] border-[#a6aaa2] hover:border-[#3155E7]"
                        }`}
                        aria-label={`Dot ${dotNum}: ${isRaised ? "raised" : "unraised"}. Press key ${dotNum} to toggle.`}
                        aria-pressed={isRaised}
                      >
                        {dotNum}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 text-center text-xs text-[#202522] font-mono">
                  Current Cell: {activeBuilderDots.length > 0 ? brailleFromDots(activeBuilderDots) : "⠀"} (
                  {activeBuilderDots.length > 0 ? describeBrailleDots(brailleFromDots(activeBuilderDots)) : "No dots"}
                  )
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={() => handleSubmitAnswer()}
                  className="px-6 py-2.5 bg-[#3155E7] text-white font-bold text-xs rounded hover:bg-[#233fbe] transition-colors"
                >
                  Submit Braille Pattern (Enter)
                </button>
              </div>
            </div>
          )}

          {/* Activity 2: Hear It, Spell It (Perkins Keyboard Input) */}
          {selectedGame === "hear_it_spell_it" && (
            <div className="mb-6 space-y-4">
              <div className="p-4 bg-[#F7F5EF] border border-[#d8d7d0] rounded-md max-w-md mx-auto">
                <label className="block text-xs font-bold text-[#4b5750] mb-2">
                  Your Braille Entry (Type character or use Perkins keys below):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="Enter letter or Braille cell…"
                    className="flex-1 p-2.5 bg-white text-base border border-[#a6aaa2] rounded outline-none focus:border-[#3155E7] font-mono"
                  />
                  <button
                    onClick={() => handleSubmitAnswer()}
                    className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe]"
                  >
                    Submit
                  </button>
                </div>
              </div>

              <div className="max-w-lg mx-auto">
                <PerkinsKeyboard
                  onInsertBraille={(char) => {
                    setUserAnswer(char);
                    handleSubmitAnswer(char);
                  }}
                  onBackspace={() => setUserAnswer("")}
                />
              </div>
            </div>
          )}

          {/* Feedback & Explain My Mistake Diagnostic Box */}
          {feedback && (
            <div
              className={`p-4 rounded-md border text-xs space-y-2 animate-result ${
                feedback.isCorrect
                  ? "bg-[#e4e8fb] border-[#aab8f3] text-[#243fa7]"
                  : "bg-[#f6e2df] border-[#d6a5a2] text-[#762522]"
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between">
                <strong className="text-sm">
                  {feedback.isCorrect ? "✓ Correct Answer!" : "🔍 Explain My Mistake Diagnostic"}
                </strong>
                <button
                  onClick={() => startNewQuestion()}
                  className="px-3 py-1 bg-white border border-current rounded font-bold hover:bg-opacity-80 transition-colors"
                >
                  Next Challenge →
                </button>
              </div>
              <p className="leading-relaxed font-medium">{feedback.text}</p>
              {feedback.details && (
                <div className="pt-2 border-t border-current/20 font-mono text-[11px] leading-relaxed">
                  {feedback.details}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
};
