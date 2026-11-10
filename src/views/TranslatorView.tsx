import React, { useState, useEffect } from "react";
import {
  translate,
  TranslationResult,
  BRAILLE_TABLES,
  describeBrailleDots,
  ScriptVaultKey,
} from "../services/brailleService";
import { speakText, isSpeaking, stopSpeaking } from "../services/speechService";
import { SignalMark, SignalState } from "../components/SignalMark";
import { BrailleCellInspector } from "../components/BrailleCellInspector";
import { PerkinsKeyboard } from "../components/PerkinsKeyboard";
import { VoiceDictationButton } from "../components/VoiceDictationButton";
import { ScriptVaultPanel } from "../components/ScriptVaultPanel";
import { consumePendingTranslatorLoad } from "../services/appContextService";

function tableIdToVaultScript(tableId: string): ScriptVaultKey {
  if (tableId.startsWith("hi-")) return "hi-in";
  if (tableId.startsWith("kn-")) return "kn-in";
  if (tableId.startsWith("ta-")) return "ta-in";
  if (tableId.startsWith("bn-")) return "bn-in";
  return "en-ueb";
}

export const TranslatorView: React.FC = () => {
  const [selectedTable, setSelectedTable] = useState<string>("en-ueb-g1");
  const [inputText, setInputText] = useState<string>("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [signalState, setSignalState] = useState<SignalState>("idle");
  const [signalMessage, setSignalMessage] = useState(
    "Choose a table, enter text, and select Translate."
  );
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [selectedCell, setSelectedCell] = useState<{ char: string; index: number } | null>(null);
  const [showPerkins, setShowPerkins] = useState<boolean>(false);
  const [showScriptVault, setShowScriptVault] = useState<boolean>(false);
  const [isReadingAloud, setIsReadingAloud] = useState<boolean>(false);

  const currentTableInfo = BRAILLE_TABLES[selectedTable];

  useEffect(() => {
    const applyPending = (pending: { text: string; tableId: string } | null) => {
      if (!pending) return;
      const tbl = BRAILLE_TABLES[pending.tableId] ? pending.tableId : "en-ueb-g1";
      setSelectedTable(tbl);
      setInputText(pending.text);
      const translated = translate(pending.text, tbl);
      setResult(translated);
      setSignalState("success");
      setSignalMessage(`Loaded "${pending.text}" in ${BRAILLE_TABLES[tbl].name}.`);
    };

    applyPending(consumePendingTranslatorLoad());

    const onLoadEvent = (e: Event) => {
      const custom = e as CustomEvent<{ text: string; tableId: string }>;
      applyPending(custom?.detail || null);
    };
    window.addEventListener("braillebridge-translator-load", onLoadEvent);
    return () => window.removeEventListener("braillebridge-translator-load", onLoadEvent);
  }, []);

  const handleTranslate = () => {
    if (!inputText.trim()) {
      setSignalState("error");
      setSignalMessage("Please enter text to translate.");
      speakText("Please enter text to translate.");
      return;
    }

    setSignalState("processing");
    setSignalMessage(`Translating with ${currentTableInfo.name}…`);

    const res = translate(inputText, selectedTable);
    setResult(res);

    if (res.success && res.brailleText) {
      setSignalState("success");
      setSignalMessage(`Translation complete with ${res.tableUsed}. Output: ${res.cellCount} Braille cells.`);
      speakText(`Translated ${res.cellCount} Braille cells with ${currentTableInfo.name}.`);
    } else {
      setSignalState("error");
      setSignalMessage(res.error || "Translation failed.");
      speakText("Translation could not be completed.");
    }
  };

  const handleClear = () => {
    setInputText("");
    setResult(null);
    setSelectedCell(null);
    setSignalState("idle");
    setSignalMessage("Cleared. Ready for new text.");
    speakText("Cleared translator.");
  };

  const handleLoadSample = (tableId: string) => {
    setSelectedTable(tableId);
    setInputText(BRAILLE_TABLES[tableId].sampleText);
    const res = translate(BRAILLE_TABLES[tableId].sampleText, tableId);
    setResult(res);
    setSignalState("success");
    setSignalMessage(`Loaded sample for ${BRAILLE_TABLES[tableId].name}.`);
    speakText(`Loaded sample for ${BRAILLE_TABLES[tableId].name}.`);
  };

  const handleCopy = async () => {
    if (!result?.brailleText) return;
    try {
      await navigator.clipboard.writeText(result.brailleText);
      setCopyStatus("Braille copied to clipboard.");
      speakText("Braille copied to clipboard.");
      setTimeout(() => setCopyStatus(""), 3000);
    } catch {
      setCopyStatus("Could not auto-copy. Select Braille text to copy.");
    }
  };

  const handleDownload = () => {
    if (!result?.brailleText) return;
    const blob = new Blob([result.brailleText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentTableInfo.id}_braille_output.txt`;
    a.click();
    URL.revokeObjectURL(url);
    speakText("Downloaded Braille text file.");
  };

  const handleDownloadBRF = () => {
    if (!result?.brailleText) return;
    const blob = new Blob([result.brailleText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentTableInfo.id}_output.brf`;
    a.click();
    URL.revokeObjectURL(url);
    setCopyStatus("Downloaded .BRF Braille file.");
    speakText("Downloaded BRF Braille file for embosser.");
    setTimeout(() => setCopyStatus(""), 3000);
  };

  const handleReadTranslatorHelp = () => {
    const help =
      "Braille Translator Guide: Choose an official standard such as Unified English Braille or Bharati Braille for Hindi, Kannada, Tamil, or Bengali. Enter your text and select Translate. You can inspect any cell's 6-dot matrix, download a .BRF file, or toggle the 6-key Perkins simulator using keys S, D, F for dots 3, 2, 1, and J, K, L for dots 4, 5, 6.";
    speakText(help);
  };

  const handleReadAloud = () => {
    if (!result?.originalText) return;

    if (isSpeaking() && isReadingAloud) {
      stopSpeaking();
      setIsReadingAloud(false);
      return;
    }

    setIsReadingAloud(true);
    speakText(result.originalText, {
      lang: currentTableInfo.languageCode,
      onEnd: () => setIsReadingAloud(false),
      onError: () => setIsReadingAloud(false),
    });
  };

  const handleSpeakBrailleDots = () => {
    if (!result?.brailleText) return;
    const chars = Array.from(result.brailleText);
    const spoken = chars
      .map((c, i) => {
        const orig = result.originalText[i] || "";
        const desc = describeBrailleDots(c);
        return orig && orig.trim() ? `${orig}: ${desc}` : desc;
      })
      .slice(0, 50)
      .join(". ");

    speakText(`Braille dot breakdown: ${spoken}`);
  };

  useEffect(() => {
    const onSpaceRead = () => {
      if (result?.originalText) {
        setIsReadingAloud(true);
        speakText(result.originalText, {
          lang: currentTableInfo.languageCode,
          onEnd: () => setIsReadingAloud(false),
          onError: () => setIsReadingAloud(false),
        });
      } else {
        handleReadTranslatorHelp();
      }
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  });

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-6 py-10">
      {/* Eyebrow & Page Title */}
      <p className="text-xs font-bold uppercase tracking-wider text-[#4b5750] mb-1">
        Translation studio
      </p>
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#202522] mb-3">
        Braille translator
      </h1>
      <p className="text-base text-[#4b5750] mb-8 max-w-2xl">
        Keep the source close. Choose an official UEB or Bharati Braille table and inspect Unicode output.
      </p>

      {/* Language / Standard Selector */}
      <div className="bg-[#fffefa] p-4 border border-[#d8d7d0] rounded-md mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <label htmlFor="braille-table-select" className="block text-xs font-bold uppercase tracking-wider text-[#4b5750] mb-1">
              Translation table / language standard
            </label>
            <select
              id="braille-table-select"
              value={selectedTable}
              onChange={(e) => {
                setSelectedTable(e.target.value);
                if (inputText.trim()) {
                  const res = translate(inputText, e.target.value);
                  setResult(res);
                }
              }}
              className="w-full sm:w-80 p-2.5 bg-[#F7F5EF] text-[#202522] border border-[#a6aaa2] rounded font-medium focus:border-[#3155E7] outline-none"
            >
              {Object.values(BRAILLE_TABLES).map((tbl) => (
                <option key={tbl.id} value={tbl.id}>
                  {tbl.name} ({tbl.table})
                </option>
              ))}
            </select>
          </div>

          {/* Quick preset buttons & Script Vault */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[#59685d] mr-1">Presets:</span>
            {Object.values(BRAILLE_TABLES).map((tbl) => (
              <button
                key={tbl.id}
                onClick={() => handleLoadSample(tbl.id)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  selectedTable === tbl.id
                    ? "border-[#3155E7] bg-[#3155E7]/10 text-[#3155E7] font-bold"
                    : "border-[#d8d7d0] bg-white text-[#4b5750] hover:text-[#202522]"
                }`}
                title={`Load sample for ${tbl.name}`}
              >
                {tbl.name.split(" ")[0]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowScriptVault((v) => !v)}
              aria-expanded={showScriptVault}
              className={`text-xs px-3 py-1 rounded border font-bold transition-colors ${
                showScriptVault
                  ? "bg-[#2847cf] text-white border-[#2847cf]"
                  : "bg-[#e4e8fb] text-[#2847cf] border-[#c7d1f7] hover:bg-[#d5def9]"
              }`}
            >
              {showScriptVault ? "Hide Script Vault" : "📚 Script Knowledge Vault"}
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[#eeece5] flex flex-wrap items-center justify-between text-xs text-[#59685d]">
          <span>
            Script: <strong>{currentTableInfo.script}</strong> · Grade: <strong>{currentTableInfo.grade}</strong> · Table file: <code className="font-mono bg-[#eeece5] px-1 rounded">{currentTableInfo.table}</code>
          </span>
          <button
            onClick={() => {
              setShowPerkins(!showPerkins);
              speakText(showPerkins ? "Closed Perkins keyboard." : "Opened Perkins 6-key keyboard. Use keys S D F and J K L to type.");
            }}
            className="text-xs font-bold text-[#3155E7] hover:underline flex items-center gap-1"
          >
            <span>{showPerkins ? "Hide Perkins 6-Key" : "Open Perkins 6-Key Simulator"}</span>
          </button>
        </div>
      </div>

      {/* Perkins 6-Key Virtual Keyboard Mode */}
      {showPerkins && (
        <PerkinsKeyboard
          onInsertBraille={(char) => setInputText((prev) => prev + char)}
          onBackspace={() => setInputText((prev) => prev.slice(0, -1))}
        />
      )}

      {/* Split column workspace: Original Text & Braille Result */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Original Text */}
        <section className="space-y-3" aria-labelledby="original-text-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="original-text-heading" className="text-base font-bold text-[#202522]">
              Original text
            </h2>
            <div className="flex items-center gap-2">
              <VoiceDictationButton
                showLanguageSelector
                compact
                placeholderLabel="Voice Type"
                onTranscript={(spoken) => {
                  const next = inputText ? `${inputText} ${spoken}` : spoken;
                  setInputText(next);
                  const langShort = (localStorage.getItem("braillebridge_language") || "en").split("-")[0];
                  const tableMap: Record<string, string> = {
                    kn: "kn-in-g1",
                    hi: "hi-in-g1",
                    ta: "ta-in-g1",
                    bn: "bn-in-g1",
                  };
                  const targetTable = tableMap[langShort] || selectedTable;
                  setSelectedTable(targetTable);
                  const res = translate(next, targetTable);
                  setResult(res);
                  setSignalState("success");
                  setSignalMessage(`Voice-typed & translated into ${BRAILLE_TABLES[targetTable].name}.`);
                }}
              />
              <span className="text-xs text-[#59685d]">
                {inputText.length} chars · {inputText.trim() ? inputText.trim().split(/\s+/).length : 0} words
              </span>
            </div>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Enter ${currentTableInfo.script} or English text to convert to Braille…`}
            rows={8}
            className="w-full p-4 bg-[#fffefa] text-[#202522] border border-[#a6aaa2] rounded-md focus:border-[#3155E7] focus:ring-2 focus:ring-[#3155E7]/20 outline-none transition-all placeholder:text-[#59685d] text-base leading-relaxed"
            aria-label="Text to translate"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handleTranslate}
              className="flex-1 py-2.5 px-4 bg-[#3155E7] text-white font-bold text-sm rounded hover:bg-[#233fbe] transition-colors"
            >
              Translate
            </button>
            <button
              onClick={handleClear}
              className="py-2.5 px-4 bg-[#fffefa] text-[#4b5750] border border-[#a6aaa2] font-medium text-sm rounded hover:text-[#202522] hover:border-[#202522] transition-colors"
            >
              ✕ Clear
            </button>
          </div>
        </section>

        {/* Right Column: Braille Result */}
        <section className="space-y-3" aria-labelledby="braille-result-heading">
          <div className="flex items-center justify-between">
            <h2 id="braille-result-heading" className="text-base font-bold text-[#202522]">
              Braille result
            </h2>
            {result && (
              <span className="text-xs text-[#3155E7] font-semibold">
                {result.cellCount} Braille cells
              </span>
            )}
          </div>

          <div
            className="w-full p-4 min-h-[216px] bg-[#fffefa] border border-[#d8d7d0] border-t-4 border-t-[#3155E7] rounded-md font-mono text-2xl sm:text-3xl leading-relaxed text-[#202522] tracking-wider break-words selection:bg-[#3155E7]/20 select-text overflow-y-auto max-h-[350px]"
            role="status"
            aria-live="polite"
            aria-label="Braille output result"
          >
            {result && result.brailleText ? (
              Array.from(result.brailleText).map((char, index) => {
                const isSelected = selectedCell?.index === index;
                const desc = describeBrailleDots(char);
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedCell({ char, index });
                      speakText(`Cell ${index + 1}: ${char}, ${desc}`);
                    }}
                    className={`inline-block px-0.5 rounded hover:bg-[#3155E7]/20 focus:outline-none focus:ring-2 focus:ring-[#3155E7] transition-colors cursor-pointer ${
                      isSelected ? "bg-[#3155E7]/30 ring-2 ring-[#3155E7]" : ""
                    }`}
                    title={desc}
                    aria-label={`Inspect Braille cell ${index + 1}: ${char}, ${desc}`}
                  >
                    {char}
                  </button>
                );
              })
            ) : (
              <span className="text-sm font-sans text-[#59685d] italic">
                Braille will appear here once translated…
              </span>
            )}
          </div>

          {/* Action Row */}
          {result && result.brailleText && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={handleSpeakBrailleDots}
                className="px-3.5 py-1.5 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] transition-colors flex items-center gap-1"
                aria-label="Speak the dot numbers of every Braille character aloud"
              >
                <span>🔊 Speak Braille Dots</span>
              </button>
              <button
                onClick={handleCopy}
                className="px-3.5 py-1.5 border border-[#3155E7] bg-[#fffefa] text-[#3155E7] text-xs font-bold rounded hover:bg-[#3155E7]/10 transition-colors"
              >
                Copy Braille
              </button>
              <button
                onClick={handleDownloadBRF}
                className="px-3.5 py-1.5 bg-[#F7F5EF] border border-[#a6aaa2] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7] transition-colors"
                title="Download Braille Ready Format (.brf) file for embossers and displays"
              >
                Download .BRF
              </button>
              <button
                onClick={handleDownload}
                className="px-3.5 py-1.5 border border-[#a6aaa2] bg-[#fffefa] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7] transition-colors"
              >
                Download (.txt)
              </button>
              <button
                onClick={handleReadAloud}
                className="px-3.5 py-1.5 border border-[#a6aaa2] bg-[#fffefa] text-[#202522] text-xs font-bold rounded hover:border-[#3155E7] transition-colors flex items-center gap-1"
              >
                <span>{isReadingAloud ? "⏹ Stop" : "🔊 Read Original Aloud"}</span>
              </button>
              <button
                onClick={handleReadTranslatorHelp}
                className="px-3.5 py-1.5 border border-[#a6aaa2] bg-[#fffefa] text-[#4b5750] text-xs font-bold rounded hover:border-[#3155E7] transition-colors flex items-center gap-1"
              >
                <span>❓ Guide</span>
              </button>
              {copyStatus && (
                <span className="text-xs text-[#202522] font-semibold ml-auto" role="status">
                  {copyStatus}
                </span>
              )}
            </div>
          )}

          {/* Tactile Hardware Distinction Notice */}
          <div className="p-3.5 bg-[#F7F5EF] border border-[#d8d7d0] rounded text-xs text-[#4b5750] leading-relaxed">
            <strong className="text-[#202522] block mb-0.5">ℹ Tactile Hardware Notice:</strong>
            On-screen Braille is rendered as standard 2×3 Unicode characters (U+2800 to U+28FF) for visual inspection, tactile dot parsing, and screen readers. Physical tactile dots require a connected refreshable Braille display (via your screen reader) or a Braille embosser. Use <em>Download .BRF</em> for embossing software.
          </div>

          {/* Warning banner if unsupported characters */}
          {result?.warning && (
            <div className="p-3 bg-[#f4ecd6] border border-[#d6bd7e] rounded text-xs text-[#59420e]">
              <strong>Note:</strong> {result.warning}
            </div>
          )}
        </section>
      </div>

      {/* Dot Inspector drawer */}
      {selectedCell && (
        <div className="mt-8">
          <BrailleCellInspector
            char={selectedCell.char}
            onClose={() => setSelectedCell(null)}
          />
        </div>
      )}

      {/* Expandable Script Knowledge Vault Reference */}
      {showScriptVault && (
        <div className="mt-8">
          <ScriptVaultPanel
            initialScript={tableIdToVaultScript(selectedTable)}
            onPracticeSymbol={(symbolText, tableId) => {
              setSelectedTable(tableId);
              setInputText(symbolText);
              const res = translate(symbolText, tableId);
              setResult(res);
              setSignalState("success");
              setSignalMessage(`Loaded symbol "${symbolText}" into Translator.`);
            }}
          />
        </div>
      )}

      {/* Signal Mark row */}
      <div className="mt-8 pt-4 border-t border-[#d8d7d0]">
        <SignalMark state={signalState} message={signalMessage} />
      </div>
    </main>
  );
};
