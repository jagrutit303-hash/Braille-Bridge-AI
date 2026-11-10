import React, { useState, useEffect } from "react";
import {
  extractDocumentFile,
  ExtractionResult,
} from "../services/documentService";
import {
  validateStudyFile,
  askNotesQuestion,
  explainDifficultConcept,
  fetchPracticeQuiz,
  extractKeyTakeaways,
  QuizQuestion,
  AskResult,
} from "../services/studyService";
import {
  speakText,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  isSpeaking,
  isSpeechPaused,
  getActiveLanguage,
} from "../services/speechService";
import { setActiveDocumentContext, consumePendingNoteLoad } from "../services/appContextService";
import {
  fetchStudyNotesFromCloud,
  saveStudyNoteToCloud,
  deleteStudyNoteFromCloud,
  CloudStudyNote,
} from "../services/supabaseService";
import { SignalMark, SignalState } from "../components/SignalMark";
import { VoiceDictationButton } from "../components/VoiceDictationButton";

export const StudyCompanionView: React.FC = () => {
  const [docResult, setDocResult] = useState<ExtractionResult | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState<string>(
    "Upload study notes, choose sample notes, or load saved notes to begin."
  );

  // Audio state
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [isPausedAudio, setIsPausedAudio] = useState<boolean>(false);
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);

  // Concept Explainer state
  const [conceptQuery, setConceptQuery] = useState<string>("");
  const [conceptExplanation, setConceptExplanation] = useState<string>("");
  const [isExplaining, setIsExplaining] = useState<boolean>(false);

  // Q&A state
  const [userQuestion, setUserQuestion] = useState<string>("");
  const [qaHistory, setQaHistory] = useState<Array<{ q: string; a: AskResult }>>([]);
  const [isAsking, setIsAsking] = useState<boolean>(false);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState<boolean>(false);
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number }>({
    correct: 0,
    total: 0,
  });

  // Supabase Cloud Notes State
  const [cloudNotes, setCloudNotes] = useState<CloudStudyNote[]>([]);
  const [isSavingToCloud, setIsSavingToCloud] = useState<boolean>(false);
  const [showSavedNotes, setShowSavedNotes] = useState<boolean>(false);
  const [showExtractedPreview, setShowExtractedPreview] = useState<boolean>(false);
  const [activeLang, setActiveLang] = useState<string>(getActiveLanguage());

  // Load cloud notes & check if opened from Dashboard Saved Vault
  useEffect(() => {
    loadCloudNotes();
    const pending = consumePendingNoteLoad();
    if (pending) {
      const loaded: ExtractionResult = {
        success: true,
        text: pending.content,
        pageCount: 1,
        wordCount: pending.wordCount || pending.content.split(/\s+/).length,
        charCount: pending.content.length,
        method: "Loaded from Progress Dashboard",
        filename: pending.filename,
      };
      setDocResult(loaded);
      setActiveDocumentContext({
        filename: loaded.filename,
        text: loaded.text,
        wordCount: loaded.wordCount,
        method: loaded.method,
        updatedAt: Date.now(),
      });
      setSignalState("success");
      setSignalMessage(`Opened "${pending.title}" (${loaded.wordCount} words) from Dashboard.`);
    }
    const syncLang = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom?.detail) setActiveLang(custom.detail);
    };
    window.addEventListener("braillebridge-language-change", syncLang);
    return () => window.removeEventListener("braillebridge-language-change", syncLang);
  }, []);

  const loadCloudNotes = async () => {
    try {
      const notes = await fetchStudyNotesFromCloud();
      if (notes) setCloudNotes(notes);
    } catch {
      // ignore
    }
  };

  const handleSaveNotesToCloud = async () => {
    if (!docResult?.text) return;
    setIsSavingToCloud(true);
    setSignalState("processing");
    setSignalMessage("Saving study notes…");

    const newNote: CloudStudyNote = {
      id: `note-${Date.now()}`,
      title: docResult.filename.replace(/\.[^/.]+$/, "") || "Study Notes",
      filename: docResult.filename,
      content: docResult.text,
      summary: docResult.text.slice(0, 300) + "…",
      takeaways: extractKeyTakeaways(docResult.text),
      wordCount: docResult.wordCount,
    };

    const success = await saveStudyNoteToCloud(newNote);
    setIsSavingToCloud(false);

    if (success) {
      await loadCloudNotes();
      setSignalState("success");
      const msg = `Saved "${newNote.title}" to your study notes.`;
      setSignalMessage(msg);
      speakText(msg);
    } else {
      setSignalState("error");
      setSignalMessage("Could not save note right now.");
    }
  };

  const handleLoadCloudNote = (note: CloudStudyNote) => {
    const loaded: ExtractionResult = {
      success: true,
      text: note.content,
      pageCount: 1,
      wordCount: note.wordCount || note.content.split(/\s+/).length,
      charCount: note.content.length,
      method: "Saved Study Note",
      filename: note.filename,
    };
    setDocResult(loaded);
    setActiveDocumentContext({
      filename: note.filename,
      text: note.content,
      wordCount: loaded.wordCount,
      method: loaded.method,
      updatedAt: Date.now(),
    });
    setShowSavedNotes(false);
    setSignalState("success");
    setSignalMessage(`Loaded "${note.title}" (${loaded.wordCount} words).`);
    speakText(`Loaded "${note.title}".`, { lang: activeLang });
  };

  const handleDeleteCloudNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteStudyNoteFromCloud(id);
    await loadCloudNotes();
    speakText("Removed note.");
  };

  // Sample notes loader
  const handleLoadSampleNotes = () => {
    const sampleText = `MODULE 3: INCLUSIVE INTERFACES & TACTILE COMPUTING
Course: Advanced Accessibility Engineering (CS 410)

1. Principles of Unified English Braille (UEB):
Unified English Braille is the official Braille standard adopted by the International Council on English Braille. UEB was developed to remove ambiguities between literary text and technical notation like mathematics, computer code, and chemistry. In UEB, a standard cell comprises six dots in a 2x3 matrix. Capitalization is denoted by Dot 6 (⠠), and numbers are preceded by the numeric indicator (⠼).

2. Refreshable Braille Displays vs. Physical Embossing:
Physical Braille paper is produced via high-impact mechanical embossers, which deform heavy-gauge cardstock to produce raised dots. A refreshable Braille display utilizes piezoelectric reeds or solenoid pins that elevate micro-pins electro-mechanically. While on-screen Unicode Braille (U+2800 to U+28FF) enables sighted educators and transcribers to inspect dot patterns visually, it does not generate physical tactile feedback on standard glass touchscreens.

3. Auditory Feedback and Screen Readers:
Modern screen readers rely on the accessibility tree (DOM exposure via WAI-ARIA) to verbalize structured content. Live regions (aria-live="polite") announce changes without disrupting ongoing user interactions. Extractive text summaries offer high reliability because they reproduce exact verbatim statements from source documents rather than hallucinating facts.`;

    const sampleDoc: ExtractionResult = {
      success: true,
      text: sampleText,
      pageCount: 1,
      wordCount: sampleText.split(/\s+/).length,
      charCount: sampleText.length,
      method: "Verified study notes sample",
      filename: "cs410_tactile_computing_notes.txt",
    };
    setDocResult(sampleDoc);
    setActiveDocumentContext({
      filename: sampleDoc.filename,
      text: sampleDoc.text,
      wordCount: sampleDoc.wordCount,
      method: sampleDoc.method,
      updatedAt: Date.now(),
    });
    setSignalState("success");
    setSignalMessage("Loaded CS 410 sample study notes.");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateStudyFile(file);
    if (!validation.valid) {
      setSignalState("error");
      setSignalMessage(validation.error || "Invalid file.");
      return;
    }

    setIsLoadingDoc(true);
    setSignalState("processing");
    setSignalMessage(`Extracting text from "${file.name}"…`);
    stopSpeaking();
    setIsPlayingAudio(false);
    setIsPausedAudio(false);
    setQaHistory([]);
    setConceptExplanation("");

    try {
      const res = await extractDocumentFile(file, (progressMsg) => {
        setSignalMessage(progressMsg);
      });

      if (res.success && res.text.trim()) {
        setDocResult(res);
        setActiveDocumentContext({
          filename: res.filename,
          text: res.text,
          wordCount: res.wordCount,
          method: res.method,
          updatedAt: Date.now(),
        });
        setSignalState("success");
        setSignalMessage(
          `Extracted ${res.wordCount} words from "${file.name}" via ${res.method}. Ready for questions and audio reading.`
        );
      } else {
        setDocResult(null);
        setActiveDocumentContext(null);
        setSignalState("error");
        const errMsg = res.error || res.warning || "No readable text could be extracted from this file.";
        setSignalMessage(errMsg);
        speakText(errMsg, { lang: activeLang });
      }
    } catch (err: any) {
      setDocResult(null);
      setActiveDocumentContext(null);
      setSignalState("error");
      setSignalMessage(`Error reading file: ${err?.message || "Unknown error"}`);
    } finally {
      setIsLoadingDoc(false);
      e.target.value = "";
    }
  };

  // Audio Playback Handlers
  const handlePlayAudio = async () => {
    if (!docResult?.text) return;
    if (isSpeechPaused()) {
      resumeSpeaking();
      setIsPausedAudio(false);
      setIsPlayingAudio(true);
      return;
    }

    stopSpeaking();
    setIsPlayingAudio(true);
    setIsPausedAudio(false);
    setSignalState("success");

    let textToSpeak = docResult.text.slice(0, 8000);
    const shortLang = activeLang.split("-")[0].toLowerCase();
    const isIndicText = /[\u0900-\u0CFF]/.test(textToSpeak);

    if (shortLang !== "en" && !isIndicText) {
      setSignalMessage(`Translating notes to ${activeLang} for audio reading…`);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: textToSpeak.slice(0, 1800),
            sourceLang: "en",
            targetLang: shortLang,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.translatedText) textToSpeak = d.translatedText;
        }
      } catch {
        // Fallback to reading original text if translation unreachable
      }
    }

    setSignalMessage(`Reading study notes aloud with intelligent punctuation & symbols…`);
    speakText(textToSpeak, {
      lang: activeLang,
      rate: speechSpeed,
      onEnd: () => {
        setIsPlayingAudio(false);
        setIsPausedAudio(false);
      },
      onError: () => {
        setIsPlayingAudio(false);
        setIsPausedAudio(false);
      },
    });
  };

  const handlePauseAudio = () => {
    pauseSpeaking();
    setIsPausedAudio(true);
    setIsPlayingAudio(false);
  };

  const handleResumeAudio = () => {
    resumeSpeaking();
    setIsPausedAudio(false);
    setIsPlayingAudio(true);
  };

  const handleStopAudio = () => {
    stopSpeaking();
    setIsPlayingAudio(false);
    setIsPausedAudio(false);
  };

  useEffect(() => {
    const onSpaceRead = () => {
      if (docResult?.text) {
        handlePlayAudio();
      } else {
        speakText(
          "Study Companion: Click Choose File to upload PDF or handwritten notes, or click Load Sample Notes to start reading aloud.",
          { lang: getActiveLanguage() }
        );
      }
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  });

  // Concept Explainer Handler (Grounded + Multilingual Voice Output)
  const handleExplainConcept = async () => {
    if (!conceptQuery.trim()) return;
    setIsExplaining(true);
    setSignalState("processing");
    setSignalMessage(`Explaining "${conceptQuery}"…`);

    const res = await explainDifficultConcept(conceptQuery, docResult?.text || "", activeLang);
    setConceptExplanation(res.explanation);
    setIsExplaining(false);
    setSignalState("success");
    setSignalMessage(`Explanation ready for "${conceptQuery}".`);
    speakText(res.explanation, { lang: activeLang, rate: speechSpeed });
  };

  // Q&A Handler (Grounded + Multilingual Voice Output)
  const handleAskQuestion = async () => {
    if (!userQuestion.trim()) return;
    const query = userQuestion.trim();
    setIsAsking(true);
    setSignalState("processing");
    setSignalMessage("Finding grounded answer in study notes…");

    const res = await askNotesQuestion(query, docResult?.text || "", activeLang);
    setQaHistory((prev) => [{ q: query, a: res }, ...prev]);
    setUserQuestion("");
    setIsAsking(false);
    setSignalState("success");
    setSignalMessage(
      res.grounded ? "Answer verified from study material." : "Notice: Answer could not be fully verified from notes alone."
    );
    speakText(res.answer, { lang: activeLang, rate: speechSpeed });
  };

  // Quiz Handlers
  const handleGenerateQuiz = async () => {
    if (!docResult?.text) return;
    setIsLoadingQuiz(true);
    setSignalState("processing");
    setSignalMessage("Generating practice quiz…");

    const questions = await fetchPracticeQuiz(docResult.text);
    setQuizQuestions(questions);
    setCurrentQuizIndex(0);
    setSelectedOption(null);
    setQuizSubmitted(false);
    setQuizScore({ correct: 0, total: questions.length });
    setIsLoadingQuiz(false);
    setSignalState("success");
    setSignalMessage(`Generated ${questions.length} quiz questions. Answer below.`);
    speakText(`Generated ${questions.length} practice questions. Here is Question 1: ${questions[0].question}`);
  };

  const handleSelectQuizOption = (index: number) => {
    if (quizSubmitted) return;
    setSelectedOption(index);
  };

  const handleSubmitQuizAnswer = () => {
    if (selectedOption === null || quizSubmitted) return;
    setQuizSubmitted(true);
    const curr = quizQuestions[currentQuizIndex];
    const isCorrect = selectedOption === curr.correctIndex;

    if (isCorrect) {
      setQuizScore((prev) => ({ ...prev, correct: prev.correct + 1 }));
    }

    const speechFeedback = isCorrect
      ? `Correct! ${curr.explanation}`
      : `Not quite. ${curr.explanation}`;
    speakText(speechFeedback);
  };

  const handleNextQuizQuestion = () => {
    if (currentQuizIndex < quizQuestions.length - 1) {
      const nextIdx = currentQuizIndex + 1;
      setCurrentQuizIndex(nextIdx);
      setSelectedOption(null);
      setQuizSubmitted(false);
      speakText(`Question ${nextIdx + 1}: ${quizQuestions[nextIdx].question}`);
    }
  };

  const handleReadQuestionAloud = () => {
    if (quizQuestions.length === 0) return;
    const curr = quizQuestions[currentQuizIndex];
    const speech = `Question ${currentQuizIndex + 1}: ${curr.question}. Option 1: ${curr.options[0]}. Option 2: ${curr.options[1]}. Option 3: ${curr.options[2] || ""}. Option 4: ${curr.options[3] || ""}`;
    speakText(speech);
  };

  const handleReadAllTakeawaysAloud = () => {
    if (takeaways.length === 0) return;
    const speech = `Key takeaways from your study notes: ${takeaways.map((t, i) => `Point ${i + 1}: ${t}`).join(". ")}`;
    speakText(speech);
  };

  const takeaways = docResult?.text ? extractKeyTakeaways(docResult.text) : [];

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Eyebrow & Title */}
      <p className="text-xs font-bold uppercase tracking-wider text-[#4b5750] mb-1">
        Accessible Tutor
      </p>
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#202522] mb-3">
        AI Study Companion
      </h1>
      <p className="text-base text-[#4b5750] mb-8 max-w-2xl">
        Upload PDF or text study notes. Listen aloud with accessible speech controls, ask grounded questions,
        get difficult concepts explained, and take practice quizzes.
      </p>

      {/* 6-dot status instrument */}
      <div className="mb-6 p-3 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
        <SignalMark state={signalState} message={signalMessage} />
      </div>

      {/* Upload, Cloud and Sample Panel */}
      <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-[#202522]">Upload Study Notes</h2>
            <p className="text-xs text-[#59685d]">
              Supported: PDF, TXT, MD, CSV · Max 15MB · Grounded in your notes
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleLoadSampleNotes}
              className="px-3 py-1.5 border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7] transition-colors"
            >
              Load Sample Notes
            </button>

            {cloudNotes.length > 0 && (
              <button
                onClick={() => setShowSavedNotes(!showSavedNotes)}
                className="px-3 py-1.5 bg-[#F7F5EF] border border-[#3155E7] text-[#3155E7] text-xs font-bold rounded hover:bg-[#3155E7]/10 transition-colors"
              >
                Saved Notes ({cloudNotes.length})
              </button>
            )}

            <label className="cursor-pointer px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] transition-colors whitespace-nowrap">
              <span>{isLoadingDoc ? "Extracting…" : "Choose File…"}</span>
              <input
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Cloud Notes List Drawer */}
        {showSavedNotes && cloudNotes.length > 0 && (
          <div className="mb-4 p-4 bg-[#F7F5EF] border border-[#d8d7d0] rounded-md space-y-2 animate-result">
            <div className="flex items-center justify-between pb-2 border-b border-[#d8d7d0]">
              <span className="text-xs font-bold text-[#202522]">Saved Study Notes</span>
              <button
                onClick={() => setShowSavedNotes(false)}
                className="text-xs text-[#59685d] hover:text-[#202522]"
              >
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cloudNotes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleLoadCloudNote(n)}
                  className="p-2.5 bg-white border border-[#d8d7d0] hover:border-[#3155E7] rounded text-xs cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <strong className="block text-[#202522] truncate">{n.title}</strong>
                    <span className="text-[10px] text-[#59685d]">{n.wordCount} words</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteCloudNote(n.id, e)}
                    className="text-[#9b302d] text-xs font-bold hover:underline p-1"
                    title="Delete cloud note"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {docResult && (
          <div className="pt-3 border-t border-[#eeece5] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4b5750]">
              <div>
                <strong>{docResult.filename}</strong> · {docResult.wordCount} words · {docResult.charCount} characters ·{" "}
                <span className="text-[#59685d]">{docResult.method}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[#3155E7] font-semibold">Grounding: Active Document</span>
                <button
                  onClick={() => setShowExtractedPreview(!showExtractedPreview)}
                  className="px-2.5 py-1 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-[11px] font-bold rounded hover:border-[#3155E7]"
                >
                  {showExtractedPreview ? "Hide Extracted Text" : "👁 Preview Text"}
                </button>
                <button
                  onClick={handleSaveNotesToCloud}
                  disabled={isSavingToCloud}
                  className="px-2.5 py-1 bg-[#3155E7] text-white text-[11px] font-bold rounded hover:bg-[#233fbe] transition-colors"
                >
                  {isSavingToCloud ? "Saving…" : "💾 Save Note"}
                </button>
              </div>
            </div>

            {showExtractedPreview && (
              <div className="p-3 bg-[#F7F5EF] border border-[#d8d7d0] rounded max-h-48 overflow-y-auto text-xs text-[#202522] whitespace-pre-wrap leading-relaxed">
                {docResult.text}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Text-to-Speech Accessible Controls Bar */}
      {docResult && (
        <section
          className="p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md mb-8 flex flex-wrap items-center justify-between gap-4"
          aria-label="Text to speech playback controls"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#4b5750] mr-2">
              Audio Reader:
            </span>
            <button
              onClick={handlePlayAudio}
              disabled={isPlayingAudio}
              className="px-3.5 py-1.5 bg-[#3155E7] text-white font-bold text-xs rounded hover:bg-[#233fbe] disabled:opacity-40 transition-colors flex items-center gap-1.5"
              aria-label="Play study notes aloud"
            >
              <span>▶ Play</span>
            </button>
            <button
              onClick={handlePauseAudio}
              disabled={!isPlayingAudio}
              className="px-3 py-1.5 bg-[#fffefa] border border-[#a6aaa2] text-[#202522] font-bold text-xs rounded hover:border-[#3155E7] disabled:opacity-40 transition-colors"
              aria-label="Pause playback"
            >
              ⏸ Pause
            </button>
            <button
              onClick={handleResumeAudio}
              disabled={!isPausedAudio}
              className="px-3 py-1.5 bg-[#fffefa] border border-[#a6aaa2] text-[#202522] font-bold text-xs rounded hover:border-[#3155E7] disabled:opacity-40 transition-colors"
              aria-label="Resume playback"
            >
              ⏯ Resume
            </button>
            <button
              onClick={handleStopAudio}
              className="px-3 py-1.5 bg-[#fffefa] border border-[#9b302d] text-[#9b302d] font-bold text-xs rounded hover:bg-[#9b302d]/10 transition-colors"
              aria-label="Stop speech playback"
            >
              ⏹ Stop
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#59685d]">Speed:</span>
            {[0.8, 1.0, 1.25, 1.5].map((spd) => (
              <button
                key={spd}
                onClick={() => setSpeechSpeed(spd)}
                className={`px-2 py-0.5 rounded border ${
                  speechSpeed === spd
                    ? "border-[#3155E7] bg-[#3155E7]/10 text-[#3155E7] font-bold"
                    : "border-[#d8d7d0] text-[#4b5750]"
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Two Column Layout: Explain Concept & Ask Q&A */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Left: Simple Concept Explainer */}
        <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#202522]">Explain a Difficult Concept</h2>
            <p className="text-xs text-[#59685d]">
              Get a simple, accessible explanation grounded directly in your notes.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={conceptQuery}
              onChange={(e) => setConceptQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExplainConcept()}
              placeholder="e.g. array, Refreshable display, UEB…"
              className="flex-1 min-w-[140px] sm:min-w-[180px] p-2.5 bg-[#F7F5EF] text-[#202522] text-sm border border-[#a6aaa2] rounded focus:border-[#3155E7] outline-none"
              aria-label="Concept to explain"
            />
            <VoiceDictationButton
              compact
              placeholderLabel="Speak"
              onTranscript={(txt) => setConceptQuery(txt)}
            />
            <button
              onClick={handleExplainConcept}
              disabled={isExplaining || !conceptQuery.trim()}
              className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] disabled:opacity-40 transition-colors"
            >
              {isExplaining ? "Explaining…" : "Explain"}
            </button>
          </div>

          {conceptExplanation && (
            <div
              className="p-4 bg-[#F7F5EF] border border-[#d8d7d0] rounded text-xs space-y-2 animate-result"
              role="region"
              aria-label="Concept explanation"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#3155E7]">Explanation</span>
                <button
                  onClick={() => speakText(conceptExplanation, { lang: activeLang, rate: speechSpeed })}
                  className="text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1"
                >
                  <span>🔊 Listen Aloud</span>
                </button>
              </div>
              <p className="text-[#202522] leading-relaxed whitespace-pre-line">
                {conceptExplanation}
              </p>
            </div>
          )}
        </section>

        {/* Right: Grounded Q&A */}
        <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#202522]">Grounded Q&A Companion</h2>
            <p className="text-xs text-[#59685d]">
              Answers strictly using facts in your notes with citation verification.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAskQuestion()}
              placeholder="Ask anything about the notes…"
              className="flex-1 min-w-[140px] sm:min-w-[180px] p-2.5 bg-[#F7F5EF] text-[#202522] text-sm border border-[#a6aaa2] rounded focus:border-[#3155E7] outline-none"
              aria-label="Question to ask about notes"
            />
            <VoiceDictationButton
              compact
              placeholderLabel="Speak"
              onTranscript={(txt) => setUserQuestion(txt)}
            />
            <button
              onClick={handleAskQuestion}
              disabled={isAsking || !userQuestion.trim()}
              className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] disabled:opacity-40 transition-colors"
            >
              {isAsking ? "Searching…" : "Ask"}
            </button>
          </div>

          {/* Q&A Stream */}
          <div className="max-h-64 overflow-y-auto space-y-3">
            {qaHistory.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-[#F7F5EF] border border-[#d8d7d0] rounded text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-[#202522]">Q: {item.q}</strong>
                  <button
                    onClick={() => speakText(item.a.answer, { lang: activeLang, rate: speechSpeed })}
                    className="text-[11px] text-[#3155E7] hover:underline font-bold"
                  >
                    🔊 Read Answer
                  </button>
                </div>
                <p className="text-[#4b5750] leading-relaxed whitespace-pre-line">
                  {item.a.answer}
                </p>
                {!item.a.grounded && (
                  <span className="inline-block text-[10px] bg-[#f4ecd6] text-[#795b19] px-1.5 py-0.5 rounded font-bold">
                    ⚠ Not verified from uploaded notes
                  </span>
                )}
              </div>
            ))}
            {qaHistory.length === 0 && (
              <p className="text-xs text-[#59685d] italic">
                Ask a question to see grounded answers here.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Practice Quiz Panel */}
      <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 mb-4 border-b border-[#d8d7d0]">
          <div>
            <h2 className="text-base font-bold text-[#202522]">Practice Quiz & Knowledge Check</h2>
            <p className="text-xs text-[#59685d]">
              Keyboard-accessible multiple-choice questions with read-aloud and instant feedback.
            </p>
          </div>

          <button
            onClick={handleGenerateQuiz}
            disabled={!docResult || isLoadingQuiz}
            className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] disabled:opacity-40 transition-colors"
          >
            {isLoadingQuiz ? "Generating Quiz…" : "Generate Practice Quiz"}
          </button>
        </div>

        {quizQuestions.length > 0 && (
          <div className="space-y-4 animate-result" role="region" aria-label="Practice quiz question">
            <div className="flex items-center justify-between text-xs text-[#4b5750]">
              <span className="font-bold uppercase tracking-wider text-[#3155E7]">
                Question {currentQuizIndex + 1} of {quizQuestions.length}
              </span>
              <button
                onClick={handleReadQuestionAloud}
                className="text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1"
                aria-label="Read current question and options aloud"
              >
                <span>🔊 Read Question Aloud</span>
              </button>
            </div>

            <p className="text-base font-bold text-[#202522]">
              {quizQuestions[currentQuizIndex].question}
            </p>

            {/* Answer Options */}
            <div className="space-y-2">
              {quizQuestions[currentQuizIndex].options.map((opt, optIdx) => {
                const isSelected = selectedOption === optIdx;
                const isCorrect = optIdx === quizQuestions[currentQuizIndex].correctIndex;
                let optStyle = "bg-[#F7F5EF] border-[#d8d7d0] text-[#202522] hover:border-[#3155E7]";

                if (quizSubmitted) {
                  if (isCorrect) {
                    optStyle = "bg-[#e4e8fb] border-[#3155E7] text-[#243fa7] font-bold";
                  } else if (isSelected && !isCorrect) {
                    optStyle = "bg-[#f6e2df] border-[#9b302d] text-[#762522]";
                  }
                } else if (isSelected) {
                  optStyle = "bg-[#3155E7]/10 border-[#3155E7] text-[#3155E7] font-bold";
                }

                return (
                  <button
                    key={optIdx}
                    onClick={() => handleSelectQuizOption(optIdx)}
                    disabled={quizSubmitted}
                    className={`w-full text-left p-3 rounded border text-xs sm:text-sm transition-all flex items-center gap-3 ${optStyle}`}
                    aria-label={`Option ${optIdx + 1}: ${opt}`}
                  >
                    <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center font-mono text-xs shrink-0">
                      {optIdx + 1}
                    </span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Feedback & Actions */}
            <div className="flex items-center justify-between pt-2">
              {!quizSubmitted ? (
                <button
                  onClick={handleSubmitQuizAnswer}
                  disabled={selectedOption === null}
                  className="px-5 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] disabled:opacity-40 transition-colors"
                >
                  Submit Answer
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded ${
                      selectedOption === quizQuestions[currentQuizIndex].correctIndex
                        ? "bg-[#e4e8fb] text-[#243fa7]"
                        : "bg-[#f6e2df] text-[#762522]"
                    }`}
                  >
                    {selectedOption === quizQuestions[currentQuizIndex].correctIndex
                      ? "✓ Correct!"
                      : "✗ Explain My Mistake:"}
                  </span>
                  {currentQuizIndex < quizQuestions.length - 1 ? (
                    <button
                      onClick={handleNextQuizQuestion}
                      className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe]"
                    >
                      Next Question →
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-[#202522]">
                      Quiz Complete! Final Score: {quizScore.correct} / {quizScore.total}
                    </span>
                  )}
                </div>
              )}
            </div>

            {quizSubmitted && (
              <div className="p-3 bg-[#eeece5] rounded border border-[#d8d7d0] text-xs text-[#202522] leading-relaxed">
                <strong>Explanation:</strong> {quizQuestions[currentQuizIndex].explanation}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Key Takeaways */}
      {takeaways.length > 0 && (
        <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#d8d7d0]">
            <h2 className="text-base font-bold text-[#202522]">Key Study Takeaways</h2>
            <button
              onClick={handleReadAllTakeawaysAloud}
              className="text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1"
              aria-label="Read all key takeaways aloud"
            >
              <span>🔊 Read All Takeaways Aloud</span>
            </button>
          </div>
          <ul className="space-y-2 text-xs text-[#4b5750]">
            {takeaways.map((pt, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-bold text-[#3155E7] select-none">•</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
};
