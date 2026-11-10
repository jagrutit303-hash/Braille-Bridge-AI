import React, { useState } from "react";
import {
  extractDocumentFile,
  findDates,
  summarizeText,
  ExtractionResult,
  DateCandidate,
  SAMPLE_DOCUMENTS,
} from "../services/documentService";
import { translate, TranslationResult, BRAILLE_TABLES } from "../services/brailleService";
import {
  speakText,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  isSpeaking,
  isSpeechPaused,
} from "../services/speechService";
import { SignalMark, SignalState } from "../components/SignalMark";

export const DocumentReaderView: React.FC = () => {
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState<string>(
    "Upload a document or choose a sample to begin."
  );

  // Actions state
  const [isReadingAloud, setIsReadingAloud] = useState<boolean>(false);
  const [brailleResult, setBrailleResult] = useState<TranslationResult | null>(null);
  const [summaryText, setSummaryText] = useState<string>("");
  const [dateCandidates, setDateCandidates] = useState<DateCandidate[] | null>(null);
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en-ueb-g1");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setSignalState("processing");
    setSignalMessage(`Extracting text from ${file.name}…`);

    // Reset previous action outputs
    setBrailleResult(null);
    setSummaryText("");
    setDateCandidates(null);
    stopSpeaking();
    setIsReadingAloud(false);

    try {
      const res = await extractDocumentFile(file);
      setExtractionResult(res);

      if (res.success && res.text.trim()) {
        setSignalState("success");
        setSignalMessage(`Extracted ${res.wordCount} words across ${res.pageCount} page(s).`);
      } else {
        setSignalState("error");
        setSignalMessage(res.error || res.warning || "Document extraction failed.");
      }
    } catch (err: any) {
      setSignalState("error");
      setSignalMessage(`Error reading document: ${err?.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadSample = (sampleId: string) => {
    const sample = SAMPLE_DOCUMENTS.find((s) => s.id === sampleId);
    if (!sample) return;

    setBrailleResult(null);
    setSummaryText("");
    setDateCandidates(null);
    stopSpeaking();
    setIsReadingAloud(false);

    const words = sample.content.trim().split(/\s+/).length;
    setExtractionResult({
      success: true,
      text: sample.content,
      pageCount: 1,
      wordCount: words,
      charCount: sample.content.length,
      method: "Pre-verified accessibility sample",
      filename: `${sample.id}.txt`,
    });

    setSignalState("success");
    setSignalMessage(`Loaded "${sample.title}" (${words} words).`);
  };

  const handleReadAloud = () => {
    if (!extractionResult?.text) return;

    if (isSpeaking() && isReadingAloud) {
      stopSpeaking();
      setIsReadingAloud(false);
      return;
    }

    const excerpt = extractionResult.text.slice(0, 5000);
    setIsReadingAloud(true);
    setSignalState("success");
    setSignalMessage("Reading document excerpt aloud…");

    speakText(excerpt, {
      onEnd: () => setIsReadingAloud(false),
      onError: () => setIsReadingAloud(false),
    });
  };

  const handleTranslateBraille = () => {
    if (!extractionResult?.text) return;
    const excerpt = extractionResult.text.slice(0, 2000);
    const res = translate(excerpt, selectedLanguage);
    setBrailleResult(res);
    setSignalState("success");
    setSignalMessage(`Document excerpt translated into ${BRAILLE_TABLES[selectedLanguage].name}.`);
  };

  const handleSummarize = () => {
    if (!extractionResult?.text) return;
    const summary = summarizeText(extractionResult.text, 4);
    setSummaryText(summary);
    setSignalState("success");
    setSignalMessage("Rule-based extractive summary generated.");
  };

  const handleFindDeadlines = () => {
    if (!extractionResult?.text) return;
    const dates = findDates(extractionResult.text);
    setDateCandidates(dates);
    setSignalState("success");
    setSignalMessage(
      dates.length > 0
        ? `Identified ${dates.length} candidate date(s) in document.`
        : "No candidate dates detected."
    );
  };

  const handleCopyBraille = async () => {
    if (!brailleResult?.brailleText) return;
    try {
      await navigator.clipboard.writeText(brailleResult.brailleText);
      setCopyStatus("Braille copied.");
      setTimeout(() => setCopyStatus(""), 3000);
    } catch {
      setCopyStatus("Select Braille text to copy.");
    }
  };

  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const sections = extractionResult?.text
    ? extractionResult.text.split(/\n\s*\n/).filter((s) => s.trim().length > 0)
    : [];

  const handleReadSection = (index: number) => {
    if (index < 0 || index >= sections.length) return;
    setCurrentSectionIndex(index);
    const textToRead = sections[index];
    setIsReadingAloud(true);
    setSignalState("success");
    setSignalMessage(`Reading section ${index + 1} of ${sections.length}…`);

    speakText(`Section ${index + 1} of ${sections.length}. ${textToRead}`, {
      onEnd: () => setIsReadingAloud(false),
      onError: () => setIsReadingAloud(false),
    });
  };

  const handleNextSection = () => {
    if (currentSectionIndex < sections.length - 1) {
      handleReadSection(currentSectionIndex + 1);
    }
  };

  const handlePrevSection = () => {
    if (currentSectionIndex > 0) {
      handleReadSection(currentSectionIndex - 1);
    }
  };

  const handleRepeatSection = () => {
    handleReadSection(currentSectionIndex);
  };

  const handleDownloadBRF = () => {
    if (!brailleResult?.brailleText) return;
    const blob = new Blob([brailleResult.brailleText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${extractionResult?.filename || "document"}.brf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-6 py-10">
      {/* Eyebrow & Page Title */}
      <p className="text-xs font-bold uppercase tracking-wider text-[#4b5750] mb-1">
        Document workspace
      </p>
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#202522] mb-3">
        Bring a document into focus.
      </h1>
      <p className="text-base text-[#4b5750] mb-8 max-w-2xl">
        Upload a text file or PDF. Extract, review, summarize, translate to Braille, and find important dates.
      </p>

      {/* 6-dot status instrument */}
      <div className="mb-6 p-3 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
        <SignalMark state={signalState} message={signalMessage} />
      </div>

      {/* File Upload Box & Sample Selector */}
      <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-[#202522]">Upload document</h2>
            <p className="text-xs text-[#59685d]">
              Supported: .txt, .md, .csv, and text-based .pdf files (processed locally in browser)
            </p>
          </div>

          <label className="cursor-pointer px-4 py-2 bg-[#3155E7] text-white font-bold text-xs rounded hover:bg-[#233fbe] transition-colors whitespace-nowrap">
            <span>Browse Files…</span>
            <input
              type="file"
              accept=".txt,.md,.csv,.pdf,.rst,.json"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        </div>

        {/* Sample Documents Row */}
        <div className="pt-3 border-t border-[#eeece5]">
          <span className="text-xs text-[#59685d] mr-2">Or test with a sample document:</span>
          <div className="inline-flex flex-wrap gap-2 mt-1">
            {SAMPLE_DOCUMENTS.map((doc) => (
              <button
                key={doc.id}
                onClick={() => handleLoadSample(doc.id)}
                className="text-xs px-2.5 py-1 bg-[#F7F5EF] border border-[#d8d7d0] hover:border-[#3155E7] text-[#202522] rounded transition-colors"
                title={doc.description}
              >
                {doc.title}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Document View & Actions */}
      {extractionResult && (
        <section className="space-y-6 animate-result" aria-labelledby="extracted-document-heading">
          {/* Metadata bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#fffefa] border border-[#d8d7d0] rounded text-xs text-[#4b5750]">
            <div>
              <strong>{extractionResult.filename}</strong> · {extractionResult.wordCount} words ·{" "}
              {extractionResult.pageCount} page(s) · {extractionResult.charCount} characters
            </div>
            <div className="text-[#3155E7] font-semibold">
              Method: {extractionResult.method}
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#4b5750]">
                Document Actions
              </span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#59685d]">Braille standard:</span>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="p-1 bg-[#F7F5EF] border border-[#a6aaa2] rounded text-xs text-[#202522]"
                >
                  {Object.values(BRAILLE_TABLES).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Audio Playback Controls */}
            <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
              <span className="text-xs font-bold text-[#4b5750] mr-2">Full Document Audio:</span>
              <button
                onClick={handleReadAloud}
                disabled={isReadingAloud}
                className="px-3 py-1.5 bg-[#3155E7] text-white rounded font-bold text-xs disabled:opacity-40 hover:bg-[#233fbe] transition-colors"
                aria-label="Play entire document excerpt aloud"
              >
                ▶ Play All
              </button>
              <button
                onClick={() => {
                  pauseSpeaking();
                  setSignalState("idle");
                  setSignalMessage("Audio reading paused.");
                }}
                disabled={!isReadingAloud}
                className="px-3 py-1.5 bg-white border border-[#a6aaa2] text-[#202522] rounded font-bold text-xs disabled:opacity-40 hover:border-[#3155E7] transition-colors"
                aria-label="Pause reading"
              >
                ⏸ Pause
              </button>
              <button
                onClick={() => {
                  resumeSpeaking();
                  setSignalState("success");
                  setSignalMessage("Resuming audio playback…");
                }}
                disabled={!isSpeechPaused()}
                className="px-3 py-1.5 bg-white border border-[#a6aaa2] text-[#202522] rounded font-bold text-xs disabled:opacity-40 hover:border-[#3155E7] transition-colors"
                aria-label="Resume reading"
              >
                ⏯ Resume
              </button>
              <button
                onClick={() => {
                  stopSpeaking();
                  setIsReadingAloud(false);
                  setSignalState("idle");
                  setSignalMessage("Audio playback stopped.");
                }}
                className="px-3 py-1.5 bg-white border border-[#9b302d] text-[#9b302d] rounded font-bold text-xs hover:bg-[#9b302d]/10 transition-colors"
                aria-label="Stop reading"
              >
                ⏹ Stop
              </button>
            </div>

            {/* Section-by-Section Navigation Controls */}
            {sections.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 p-2.5 bg-[#fffefa] rounded border border-[#3155E7] text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#3155E7]">Section Navigator:</span>
                  <span className="font-mono bg-[#eeece5] px-2 py-0.5 rounded text-[#202522]">
                    Section {currentSectionIndex + 1} of {sections.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevSection}
                    disabled={currentSectionIndex === 0}
                    className="px-2.5 py-1 bg-white border border-[#a6aaa2] text-[#202522] rounded font-bold disabled:opacity-40 hover:border-[#3155E7]"
                    aria-label="Previous section"
                  >
                    ⏮ Previous
                  </button>
                  <button
                    onClick={() => handleReadSection(currentSectionIndex)}
                    className="px-3 py-1 bg-[#3155E7] text-white rounded font-bold hover:bg-[#233fbe]"
                    aria-label={`Read Section ${currentSectionIndex + 1} aloud`}
                  >
                    ▶ Read Section
                  </button>
                  <button
                    onClick={handleRepeatSection}
                    className="px-2.5 py-1 bg-white border border-[#a6aaa2] text-[#202522] rounded font-bold hover:border-[#3155E7]"
                    aria-label="Repeat this section"
                  >
                    🔁 Repeat
                  </button>
                  <button
                    onClick={handleNextSection}
                    disabled={currentSectionIndex >= sections.length - 1}
                    className="px-2.5 py-1 bg-white border border-[#a6aaa2] text-[#202522] rounded font-bold disabled:opacity-40 hover:border-[#3155E7]"
                    aria-label="Next section"
                  >
                    ⏭ Next
                  </button>
                </div>
              </div>
            )}

            {/* OCR Advisory Alert if document has very low text content */}
            {extractionResult.wordCount < 25 && extractionResult.filename.toLowerCase().endsWith(".pdf") && (
              <div
                className="p-3 mb-4 bg-[#fdf4e4] border border-[#e7bc78] rounded text-xs text-[#795b19] font-medium leading-relaxed"
                role="alert"
              >
                <strong>⚠ OCR Advisory:</strong> This PDF produced minimal text ({extractionResult.wordCount} words). It may be a scanned image or photograph. For complete screen-reader and Braille accessibility, use an OCR-preprocessed document or accessible PDF export.
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <button
                onClick={handleTranslateBraille}
                className="p-3 bg-[#F7F5EF] border border-[#a6aaa2] hover:border-[#3155E7] text-[#202522] rounded font-bold text-xs transition-colors"
              >
                ⠿ Translate to Braille
              </button>
              <button
                onClick={handleSummarize}
                className="p-3 bg-[#F7F5EF] border border-[#a6aaa2] hover:border-[#3155E7] text-[#202522] rounded font-bold text-xs transition-colors"
              >
                📝 Extractive Summary
              </button>
              <button
                onClick={handleFindDeadlines}
                className="p-3 bg-[#F7F5EF] border border-[#a6aaa2] hover:border-[#3155E7] text-[#202522] rounded font-bold text-xs transition-colors"
              >
                📅 Find Deadlines
              </button>
            </div>
          </div>

          {/* Extracted Text Area */}
          <details open className="bg-[#fffefa] border border-[#d8d7d0] rounded-md p-4">
            <summary className="font-bold text-[#202522] text-sm cursor-pointer mb-2">
              Source text (extracted content for verification)
            </summary>
            <div className="max-h-64 overflow-y-auto p-3 bg-[#F7F5EF] border border-[#d8d7d0] rounded font-mono text-xs leading-relaxed text-[#202522] whitespace-pre-wrap">
              {extractionResult.text}
            </div>
          </details>

          {/* Braille Output Section */}
          {brailleResult && (
            <div className="p-5 bg-[#fffefa] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-md">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-serif font-bold text-base text-[#202522]">
                  Braille translation (first 2,000 characters)
                </h3>
                <span className="text-xs text-[#59685d]">
                  {brailleResult.cellCount} cells · Unicode representation
                </span>
              </div>
              <div
                className="p-4 bg-[#F7F5EF] border border-[#d8d7d0] rounded font-mono text-2xl leading-relaxed text-[#202522] break-words max-h-48 overflow-y-auto mb-3"
                role="status"
                aria-live="polite"
              >
                {brailleResult.brailleText}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCopyBraille}
                  className="px-3.5 py-1.5 border border-[#3155E7] text-[#3155E7] text-xs font-bold rounded hover:bg-[#3155E7]/10"
                >
                  Copy Braille
                </button>
                <button
                  onClick={handleDownloadBRF}
                  className="px-3.5 py-1.5 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe]"
                  title="Download Braille Ready Format (.brf) file for embossers and displays"
                >
                  Download .BRF (Braille File)
                </button>
                {copyStatus && (
                  <span className="text-xs text-[#202522] font-semibold">{copyStatus}</span>
                )}
              </div>
            </div>
          )}

          {/* Extractive Summary Section */}
          {summaryText && (
            <div className="p-5 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#d8d7d0]">
                <h3 className="font-bold text-sm text-[#202522]">
                  Extractive Rule-Based Summary
                </h3>
                <span className="text-xs text-[#795b19] bg-[#f4ecd6] px-2 py-0.5 rounded">
                  Non-generative: first key sentences
                </span>
              </div>
              <p className="text-sm text-[#202522] leading-relaxed mb-3">{summaryText}</p>
              <button
                onClick={() => speakText(summaryText)}
                className="px-3 py-1.5 border border-[#3155E7] text-[#3155E7] text-xs font-bold rounded hover:bg-[#3155E7]/10"
              >
                🔊 Listen to Summary
              </button>
            </div>
          )}

          {/* Deadlines Section */}
          {dateCandidates && (
            <div className="p-5 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#d8d7d0]">
                <h3 className="font-bold text-sm text-[#202522]">
                  Candidate Dates & Deadlines ({dateCandidates.length} found)
                </h3>
                <span className="text-xs text-[#59685d]">
                  Matched via date regex & deadline keywords
                </span>
              </div>

              {dateCandidates.length === 0 ? (
                <p className="text-xs text-[#4b5750]">
                  No candidate dates were found in this document.
                </p>
              ) : (
                <div className="space-y-3">
                  {dateCandidates.map((c, i) => (
                    <div
                      key={i}
                      className="p-3 bg-[#F7F5EF] border border-[#d8d7d0] rounded text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-sm font-mono text-[#3155E7]">{c.date}</strong>
                        {c.isDeadlinePriority && (
                          <span className="text-[11px] font-bold text-[#795b19] bg-[#f4ecd6] px-1.5 py-0.5 rounded">
                            Deadline Keyword Nearby
                          </span>
                        )}
                      </div>
                      <p className="text-[#4b5750] leading-relaxed">
                        Surrounding passage: <span className="text-[#202522]">…{c.context}…</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Empty State when no document loaded */}
      {!extractionResult && !isProcessing && (
        <div className="p-6 bg-[#eeece5] rounded border border-[#d8d7d0] text-xs text-[#4b5750]">
          <strong className="text-[#202522] block mb-1">Your source stays yours.</strong>
          <span>
            Text extraction happens locally in your browser. Upload any text file or text-based PDF to inspect, read aloud, extract deadlines, or convert to Braille.
          </span>
        </div>
      )}
    </main>
  );
};
