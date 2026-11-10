import React, { useState, useEffect } from "react";
import {
  extractDocumentFile,
  ExtractionResult,
} from "../services/documentService";
import {
  analyzeNoticeText,
  downloadCalendarReminder,
  SAMPLE_NOTICES,
  NoticeAnalysis,
  NoticeDeadline,
} from "../services/noticeService";
import { speakText, stopSpeaking, getActiveLanguage } from "../services/speechService";
import { setActiveNoticeContext, consumePendingNoticeLoad } from "../services/appContextService";
import {
  fetchCollegeNoticesFromCloud,
  saveCollegeNoticeToCloud,
  deleteCollegeNoticeFromCloud,
  CloudCollegeNotice,
} from "../services/supabaseService";
import { SignalMark, SignalState } from "../components/SignalMark";
import { VoiceDictationButton } from "../components/VoiceDictationButton";

export const NoticeAssistantView: React.FC = () => {
  const [noticeText, setNoticeText] = useState<string>("");
  const [docFilename, setDocFilename] = useState<string>("");
  const [analysis, setAnalysis] = useState<NoticeAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState<string>(
    "Upload a notice or choose a sample to extract deadlines, eligibility, and documents."
  );
  const [activeCitation, setActiveCitation] = useState<{ title: string; quote: string } | null>(
    null
  );
  const [calendarDownloadedNotice, setCalendarDownloadedNotice] = useState<string>("");

  // Supabase Cloud Notices State
  const [cloudNotices, setCloudNotices] = useState<CloudCollegeNotice[]>([]);
  const [isSavingCloud, setIsSavingCloud] = useState<boolean>(false);
  const [showSavedList, setShowSavedList] = useState<boolean>(false);

  useEffect(() => {
    loadCloudNotices();
    const pending = consumePendingNoticeLoad();
    if (pending) {
      setDocFilename(pending.title);
      setAnalysis({
        summary: pending.summary,
        deadlines: pending.deadlines || [],
        eligibility: pending.eligibility || [],
        requiredDocuments: pending.requiredDocuments || [],
        nextSteps: pending.nextSteps || [],
        ambiguousOrMissing: [],
        isAiGenerated: false,
      });
      setActiveNoticeContext({
        filename: pending.title,
        text: pending.summary,
        summary: pending.summary,
        deadlinesCount: pending.deadlines?.length || 0,
        updatedAt: Date.now(),
      });
      setSignalState("success");
      setSignalMessage(`Opened saved notice "${pending.title}" from Dashboard.`);
    }
  }, []);

  const loadCloudNotices = async () => {
    try {
      const notices = await fetchCollegeNoticesFromCloud();
      if (notices) setCloudNotices(notices);
    } catch {
      // ignore
    }
  };

  const handleSaveToCloud = async () => {
    if (!analysis) return;
    setIsSavingCloud(true);
    setSignalState("processing");
    setSignalMessage("Saving notice analysis…");

    const record: CloudCollegeNotice = {
      id: `notice-${Date.now()}`,
      title: docFilename || "College Notice",
      summary: analysis.summary,
      deadlines: analysis.deadlines,
      eligibility: analysis.eligibility,
      requiredDocuments: analysis.requiredDocuments,
      nextSteps: analysis.nextSteps,
    };

    const success = await saveCollegeNoticeToCloud(record);
    setIsSavingCloud(false);

    if (success) {
      await loadCloudNotices();
      setSignalState("success");
      const msg = `Saved "${record.title}".`;
      setSignalMessage(msg);
      speakText(msg);
    } else {
      setSignalState("error");
      setSignalMessage("Could not save notice.");
    }
  };

  const handleLoadCloudNotice = (item: CloudCollegeNotice) => {
    setDocFilename(item.title);
    setAnalysis({
      summary: item.summary,
      deadlines: item.deadlines || [],
      eligibility: item.eligibility || [],
      requiredDocuments: item.requiredDocuments || [],
      nextSteps: item.nextSteps || [],
      ambiguousOrMissing: [],
      isAiGenerated: false,
    });
    setShowSavedList(false);
    setSignalState("success");
    setSignalMessage(`Loaded "${item.title}".`);
    speakText(`Loaded notice "${item.title}".`);
  };

  const handleDeleteCloudNotice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteCollegeNoticeFromCloud(id);
    await loadCloudNotices();
    speakText("Removed notice.");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setSignalState("processing");
    setSignalMessage(`Extracting text from "${file.name}"…`);
    setAnalysis(null);
    setActiveCitation(null);

    try {
      const res: ExtractionResult = await extractDocumentFile(file);
      if (res.success && res.text.trim()) {
        setNoticeText(res.text);
        setDocFilename(file.name);
        setSignalState("processing");
        setSignalMessage(`Analyzing "${file.name}" for deadlines, eligibility, and required certificates…`);

        const analyzed = await analyzeNoticeText(res.text, file.name);
        setAnalysis(analyzed);
        setActiveNoticeContext({
          filename: file.name,
          text: res.text,
          summary: analyzed.summary,
          deadlinesCount: analyzed.deadlines.length,
          updatedAt: Date.now(),
        });
        setSignalState("success");
        setSignalMessage(
          `Analysis complete: found ${analyzed.deadlines.length} deadlines and ${analyzed.requiredDocuments.length} required documents.`
        );
      } else {
        setSignalState("error");
        setSignalMessage(res.error || res.warning || "Document extraction failed.");
      }
    } catch (err: any) {
      setSignalState("error");
      setSignalMessage(`Failed to read document: ${err?.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSample = async (sampleId: string) => {
    const sample = SAMPLE_NOTICES.find((s) => s.id === sampleId);
    if (!sample) return;

    setIsLoading(true);
    setSignalState("processing");
    setSignalMessage(`Analyzing sample "${sample.title}"…`);
    setNoticeText(sample.content);
    setDocFilename(sample.title);
    setActiveCitation(null);

    try {
      const analyzed = await analyzeNoticeText(sample.content, sample.title);
      setAnalysis(analyzed);
      setActiveNoticeContext({
        filename: sample.title,
        text: sample.content,
        summary: analyzed.summary,
        deadlinesCount: analyzed.deadlines.length,
        updatedAt: Date.now(),
      });
      setSignalState("success");
      setSignalMessage(
        `Analysis complete: identified ${analyzed.deadlines.length} deadlines and ${analyzed.eligibility.length} eligibility rules.`
      );
    } catch (err: any) {
      setSignalState("error");
      setSignalMessage(`Analysis error: ${err?.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadReminder = (deadline: NoticeDeadline) => {
    downloadCalendarReminder(deadline, docFilename || "Notice");
    setCalendarDownloadedNotice(`Downloaded calendar reminder (.ics) for "${deadline.title}"`);
    setTimeout(() => setCalendarDownloadedNotice(""), 4000);
  };

  const handleListenFullBriefing = async () => {
    if (!analysis) return;

    const criticalCount = analysis.deadlines.filter((d) => d.isCritical).length;
    const deadlineList = analysis.deadlines
      .map((d) => `${d.title} on ${d.date}${d.isCritical ? ", marked as critical" : ""}`)
      .join(". ");

    const docList = analysis.requiredDocuments.map((d) => d.name).join(", ");
    const nextStepsList = analysis.nextSteps.join(". ");

    let speech = `Notice briefing for ${docFilename || "document"}. ${analysis.summary}. Deadlines: Found ${
      analysis.deadlines.length
    } deadlines with ${criticalCount} critical: ${deadlineList}. Required documents: ${docList || "Standard form"}. Next steps: ${nextStepsList}.`;

    const activeLang = getActiveLanguage();
    const short = activeLang.split("-")[0].toLowerCase();
    if (short !== "en") {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: speech, sourceLang: "en", targetLang: short }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.translatedText) speech = data.translatedText;
        }
      } catch {
        // Fallback to English if offline
      }
    }

    speakText(speech, { lang: activeLang });
  };

  useEffect(() => {
    const onSpaceRead = () => {
      if (analysis) {
        handleListenFullBriefing();
      } else {
        speakText(
          "College Notice Assistant: Upload a circular PDF or image, load a sample notice, or paste notice text to hear deadlines and eligibility.",
          { lang: getActiveLanguage() }
        );
      }
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  });

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Eyebrow & Page Title */}
      <p className="text-xs font-bold uppercase tracking-wider text-[#4b5750] mb-1">
        Form & Circular Inspector
      </p>
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#202522] mb-3">
        College Notice & Form Assistant
      </h1>
      <p className="text-base text-[#4b5750] mb-8 max-w-2xl">
        Upload circulars, scholarship forms, and exam notices. Extract verified deadlines, eligibility
        requirements, required certificates, and actionable next steps.
      </p>

      {/* 6-dot status instrument */}
      <div className="mb-6 p-3 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
        <SignalMark state={signalState} message={signalMessage} />
      </div>

      {/* Notice Uploader, Cloud and Sample Selector */}
      <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-[#202522]">Upload Notice or Form</h2>
            <p className="text-xs text-[#59685d]">
              Supports PDF circulars, text announcements, and syllabus updates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {cloudNotices.length > 0 && (
              <button
                onClick={() => setShowSavedList(!showSavedList)}
                className="px-3 py-1.5 bg-[#F7F5EF] border border-[#3155E7] text-[#3155E7] text-xs font-bold rounded hover:bg-[#3155E7]/10 transition-colors"
              >
                Saved Notices ({cloudNotices.length})
              </button>
            )}

            <label className="cursor-pointer px-4 py-2 bg-[#3155E7] text-white font-bold text-xs rounded hover:bg-[#233fbe] transition-colors whitespace-nowrap">
              <span>{isLoading ? "Reading…" : "Browse Notice…"}</span>
              <input
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp"
                onChange={handleFileUpload}
                disabled={isLoading}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Cloud Notices Drawer */}
        {showSavedList && cloudNotices.length > 0 && (
          <div className="mb-4 p-4 bg-[#F7F5EF] border border-[#d8d7d0] rounded-md space-y-2 animate-result">
            <div className="flex items-center justify-between pb-2 border-b border-[#d8d7d0]">
              <span className="text-xs font-bold text-[#202522]">Saved Notices</span>
              <button
                onClick={() => setShowSavedList(false)}
                className="text-xs text-[#59685d] hover:text-[#202522]"
              >
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cloudNotices.map((cn) => (
                <div
                  key={cn.id}
                  onClick={() => handleLoadCloudNotice(cn)}
                  className="p-2.5 bg-white border border-[#d8d7d0] hover:border-[#3155E7] rounded text-xs cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <strong className="block text-[#202522] truncate">{cn.title}</strong>
                    <span className="text-[10px] text-[#59685d]">
                      {cn.deadlines?.length || 0} deadline(s)
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteCloudNotice(cn.id, e)}
                    className="text-[#9b302d] text-xs font-bold hover:underline p-1"
                    title="Delete cloud notice"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sample Notices & Voice/Paste Option */}
        <div className="pt-3 border-t border-[#eeece5] space-y-3">
          <div>
            <span className="text-xs text-[#59685d] mr-2">Or test with verified sample circulars:</span>
            <div className="inline-flex flex-wrap gap-2 mt-1">
              {SAMPLE_NOTICES.map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => handleLoadSample(sample.id)}
                  className="text-xs px-2.5 py-1 bg-[#F7F5EF] border border-[#d8d7d0] hover:border-[#3155E7] text-[#202522] rounded transition-colors"
                  title={sample.description}
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>

          <details className="pt-2 border-t border-[#eeece5]">
            <summary className="text-xs font-bold text-[#3155E7] cursor-pointer">
              Or paste / voice-type notice text directly
            </summary>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-[#59685d]">Dictate or paste notice announcement:</span>
                <VoiceDictationButton
                  showLanguageSelector
                  compact
                  placeholderLabel="Voice Type Notice"
                  onTranscript={(txt) => setNoticeText((p) => (p ? `${p} ${txt}` : txt))}
                />
              </div>
              <textarea
                rows={4}
                value={noticeText}
                onChange={(e) => setNoticeText(e.target.value)}
                placeholder="Paste circular text or use Voice Type above…"
                aria-label="Notice text to analyze"
                className="w-full p-3 bg-[#F7F5EF] text-xs text-[#202522] border border-[#a6aaa2] rounded outline-none focus:border-[#3155E7]"
              />
              <button
                onClick={async () => {
                  if (!noticeText.trim()) return;
                  setIsLoading(true);
                  const analyzed = await analyzeNoticeText(noticeText, docFilename || "Custom Notice");
                  setAnalysis(analyzed);
                  setActiveNoticeContext({
                    filename: docFilename || "Custom Notice",
                    text: noticeText,
                    summary: analyzed.summary,
                    deadlinesCount: analyzed.deadlines.length,
                    updatedAt: Date.now(),
                  });
                  setIsLoading(false);
                  setSignalState("success");
                  setSignalMessage(`Analyzed notice text cleanly.`);
                }}
                disabled={!noticeText.trim() || isLoading}
                className="px-4 py-2 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] disabled:opacity-40"
              >
                Analyze Pasted Notice
              </button>
            </div>
          </details>
        </div>
      </section>

      {/* Calendar Reminder Status Notification */}
      {calendarDownloadedNotice && (
        <div
          className="p-3 mb-6 bg-[#e4e8fb] border border-[#aab8f3] text-[#243fa7] text-xs font-bold rounded animate-result"
          role="status"
        >
          ✓ {calendarDownloadedNotice}
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-8 animate-result" role="region" aria-label="Notice analysis breakdown">
          {/* Summary Banner with Audio Briefing & Supabase Save */}
          <div className="p-5 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
            <div className="flex flex-wrap items-center justify-between pb-2 mb-2 border-b border-[#d8d7d0] gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#3155E7]">
                Notice Overview: {docFilename}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleListenFullBriefing}
                  className="px-3 py-1 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] flex items-center gap-1.5 transition-colors"
                  aria-label="Listen to full notice audio briefing"
                >
                  <span>🔊 Full Audio Briefing</span>
                </button>
                <button
                  onClick={handleSaveToCloud}
                  disabled={isSavingCloud}
                  className="px-3 py-1 bg-[#F7F5EF] border border-[#3155E7] text-[#3155E7] text-xs font-bold rounded hover:bg-[#3155E7]/10 transition-colors"
                >
                  {isSavingCloud ? "Saving…" : "💾 Save Notice"}
                </button>
              </div>
            </div>
            <p className="text-sm text-[#202522] leading-relaxed">{analysis.summary}</p>
          </div>

          {/* 1. Deadlines Section */}
          <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm">
            <h2 className="text-base font-bold text-[#202522] mb-1">
              📅 Deadlines & Timeline
            </h2>
            <p className="text-xs text-[#59685d] mb-4">
              All dates verified from document text. Save an offline calendar reminder (.ics) for your device.
            </p>

            <div className="space-y-3">
              {analysis.deadlines.map((dl, i) => (
                <div
                  key={i}
                  className="p-4 bg-[#F7F5EF] border border-[#d8d7d0] rounded text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-[#202522]">{dl.title}</strong>
                      <span className="font-mono text-sm font-bold text-[#3155E7] bg-white px-2 py-0.5 rounded border border-[#d8d7d0]">
                        {dl.date}
                      </span>
                      {dl.isCritical && (
                        <span className="text-[10px] font-bold text-[#9b302d] bg-[#f6e2df] px-1.5 py-0.5 rounded">
                          Critical Deadline
                        </span>
                      )}
                    </div>
                    <p className="text-[#4b5750] leading-relaxed">
                      Source Context: <span className="text-[#202522]">{dl.context}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleDownloadReminder(dl)}
                      className="px-3 py-1.5 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] transition-colors"
                      title="Download offline .ics calendar reminder"
                    >
                      + Add to Calendar (.ics)
                    </button>
                    <button
                      onClick={() =>
                        setActiveCitation({ title: dl.title, quote: dl.context })
                      }
                      className="px-2.5 py-1.5 bg-white border border-[#a6aaa2] text-[#4b5750] text-xs rounded hover:text-[#202522]"
                    >
                      Cite
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Eligibility & 3. Required Documents Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Eligibility */}
            <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm">
              <h2 className="text-base font-bold text-[#202522] mb-1">
                🎓 Eligibility Criteria
              </h2>
              <p className="text-xs text-[#59685d] mb-4">
                Verified qualifying conditions and benchmark thresholds.
              </p>

              <div className="space-y-2.5">
                {analysis.eligibility.map((el, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#F7F5EF] border border-[#d8d7d0] rounded text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-[#202522]">{el.criterion}</strong>
                      {el.isAmbiguous && (
                        <span className="text-[10px] font-bold text-[#795b19] bg-[#f4ecd6] px-1.5 py-0.5 rounded">
                          Discretionary / Ambiguous
                        </span>
                      )}
                    </div>
                    <p className="text-[#4b5750] text-[11px]">Quote: {el.context}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Required Documents Checklist */}
            <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm">
              <h2 className="text-base font-bold text-[#202522] mb-1">
                📋 Required Documents Checklist
              </h2>
              <p className="text-xs text-[#59685d] mb-4">
                Certificates and records requested for submission.
              </p>

              <ul className="space-y-2.5">
                {analysis.requiredDocuments.map((doc, idx) => (
                  <li
                    key={idx}
                    className="p-3 bg-[#F7F5EF] border border-[#d8d7d0] rounded text-xs flex items-start gap-2.5"
                  >
                    <span className="font-mono font-bold text-[#3155E7] shrink-0">✓</span>
                    <div>
                      <strong className="text-[#202522] block">{doc.name}</strong>
                      <span className="text-[#4b5750] text-[11px] block">{doc.context}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* 4. Actionable Next Steps & 5. Ambiguous Information */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm">
              <h2 className="text-base font-bold text-[#202522] mb-1">
                🚀 Actionable Next Steps
              </h2>
              <ul className="space-y-2 text-xs text-[#4b5750]">
                {analysis.nextSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-bold text-[#3155E7] select-none">{idx + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </section>

            {analysis.ambiguousOrMissing.length > 0 && (
              <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm">
                <h2 className="text-base font-bold text-[#795b19] mb-1">
                  ⚠ Ambiguous or Missing Information
                </h2>
                <ul className="space-y-2 text-xs text-[#59420e]">
                  {analysis.ambiguousOrMissing.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="select-none">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      {/* Citation Popover Modal */}
      {activeCitation && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#fffefa] border border-[#d8d7d0] rounded-md max-w-lg w-full p-6 shadow-xl space-y-3 animate-result">
            <div className="flex items-center justify-between pb-2 border-b border-[#d8d7d0]">
              <h3 className="font-bold text-sm text-[#202522]">Source Citation: {activeCitation.title}</h3>
              <button
                onClick={() => setActiveCitation(null)}
                className="text-xs text-[#59685d] hover:text-[#202522]"
              >
                ✕ Close
              </button>
            </div>
            <p className="text-xs text-[#4b5750] leading-relaxed italic bg-[#F7F5EF] p-3 rounded border border-[#d8d7d0]">
              "{activeCitation.quote}"
            </p>
          </div>
        </div>
      )}
    </main>
  );
};
