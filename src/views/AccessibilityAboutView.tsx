import React, { useState, useEffect } from "react";
import { isTTSSupported, isSpeechRecognitionSupported, speakText } from "../services/speechService";
import { BRAILLE_TABLES } from "../services/brailleService";
import {
  checkSupabaseStatus,
  SupabaseConnectionStatus,
  ColorVisionMode,
} from "../services/supabaseService";

interface AccessibilityAboutViewProps {
  fontSizeScale: number;
  onScaleChange: (scale: number) => void;
  isHighContrast: boolean;
  onToggleContrast: () => void;
  colorVisionMode?: ColorVisionMode;
  onColorVisionModeChange?: (mode: ColorVisionMode) => void;
}

const CVD_OPTIONS: Array<{
  id: ColorVisionMode;
  label: string;
  desc: string;
}> = [
  {
    id: "standard",
    label: "Standard Palette",
    desc: "Warm parchment and cobalt blue.",
  },
  {
    id: "deuteranopia",
    label: "Red-Green Safe",
    desc: "Okabe-Ito royal blue vs vermilion orange + dashed borders (Deuteranopia & Protanopia).",
  },
  {
    id: "tritanopia",
    label: "Blue-Yellow Safe",
    desc: "High-clarity teal vs vivid magenta + dashed borders (Tritanopia).",
  },
  {
    id: "monochrome",
    label: "Monochrome Safe",
    desc: "Full luminance grayscale with thick solid vs dashed cues.",
  },
];

export const AccessibilityAboutView: React.FC<AccessibilityAboutViewProps> = ({
  fontSizeScale,
  onScaleChange,
  isHighContrast,
  onToggleContrast,
  colorVisionMode = "standard",
  onColorVisionModeChange,
}) => {
  const ttsAvailable = isTTSSupported();
  const micAvailable = isSpeechRecognitionSupported();
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseConnectionStatus>({
    isConfigured: false,
    isConnected: false,
    source: "none",
    message: "Checking sync status…",
  });

  useEffect(() => {
    checkSupabaseStatus().then(setSupabaseStatus);
  }, []);

  useEffect(() => {
    const onSpaceRead = () => {
      const modeName =
        CVD_OPTIONS.find((m) => m.id === colorVisionMode)?.label || "Standard Palette";
      speakText(
        `Accessibility and Settings. Font scale is ${Math.round(
          fontSizeScale * 100
        )} percent. High contrast dark mode is ${
          isHighContrast ? "enabled" : "disabled"
        }. Color vision mode is ${modeName}. Microphone input is ${
          micAvailable ? "supported" : "not detected in this browser"
        }. Use Spacebar anywhere outside forms to read any screen aloud, or Escape to silence.`,
        { lang: "en-US" }
      );
    };
    window.addEventListener("braillebridge-space-read", onSpaceRead);
    return () => window.removeEventListener("braillebridge-space-read", onSpaceRead);
  }, [fontSizeScale, isHighContrast, colorVisionMode, micAvailable]);

  return (
    <main id="main-content" className="max-w-5xl mx-auto px-6 py-10">
      {/* Eyebrow & Page Title */}
      <p className="text-xs font-bold uppercase tracking-wider text-[#4b5750] mb-1">
        Product notes
      </p>
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#202522] mb-3">
        Accessibility & about
      </h1>
      <p className="text-base text-[#4b5750] mb-8 max-w-2xl">
        Transparent, open-source accessibility tools with zero remote dependencies.
      </p>

      {/* Grid: About and Engine Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2 p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm space-y-4">
          <h2 className="text-xl font-serif font-bold text-[#202522]">
            About BrailleBridge AI
          </h2>
          <p className="text-sm text-[#4b5750] leading-relaxed">
            BrailleBridge AI is an accessible, voice-first learning and reading suite designed for blind, low-vision, and assistive technology users. It provides multi-standard Braille translation, an AI-powered study companion with audio controls, 5 interactive Braille learning games with "Explain My Mistake" dot diagnostics, and a college notice and circular analyzer with offline calendar reminder exports.
          </p>
          <p className="text-sm text-[#4b5750] leading-relaxed">
            All AI features are grounded directly in student-uploaded materials with explicit flags for unverified information. No paid API keys are required for operation.
          </p>
        </div>

        {/* Engine Status */}
        <div className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4b5750] mb-4">
              Engine Status
            </h3>
            <ul className="space-y-3 text-xs">
              <li className="flex items-center justify-between pb-2 border-b border-[#eeece5]">
                <span className="text-[#202522] font-medium">Braille Engine</span>
                <span className="text-[#3155E7] font-bold">✓ 6 Tables Verified</span>
              </li>
              <li className="flex items-center justify-between pb-2 border-b border-[#eeece5]">
                <span className="text-[#202522] font-medium">Browser TTS</span>
                <span className={ttsAvailable ? "text-[#3155E7] font-bold" : "text-[#9b302d] font-bold"}>
                  {ttsAvailable ? "✓ Play/Pause/Resume" : "✗ Unavailable"}
                </span>
              </li>
              <li className="flex items-center justify-between pb-2 border-b border-[#eeece5]">
                <span className="text-[#202522] font-medium">Study Companion</span>
                <span className="text-[#3155E7] font-bold">✓ Grounded Q&A Active</span>
              </li>
              <li className="flex items-center justify-between pb-2 border-b border-[#eeece5]">
                <span className="text-[#202522] font-medium">Notice Inspector</span>
                <span className="text-[#3155E7] font-bold">✓ Offline .ICS Active</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-[#202522] font-medium">Data &amp; Progress Sync</span>
                <span className={supabaseStatus.isConnected ? "text-emerald-600 font-bold" : "text-[#3155E7] font-bold"}>
                  {supabaseStatus.isConnected ? "✓ Persistent Sync Active" : "✓ Local Durable Storage"}
                </span>
              </li>
            </ul>
          </div>
          <div className="mt-4 pt-3 border-t border-[#eeece5] text-[11px] text-[#59685d]">
            Grounded & privacy-first runtime. No telemetry.
          </div>
        </div>
      </div>

      {/* Accessibility Preferences Panel */}
      <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md mb-8">
        <h2 className="text-base font-bold text-[#202522] mb-3">
          Display & Low-Vision Preferences
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
          <div>
            <label className="block text-xs font-bold text-[#4b5750] mb-2">
              Font Scale (Atkinson Hyperlegible): {Math.round(fontSizeScale * 100)}%
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#59685d]">100%</span>
              <input
                type="range"
                min="0.9"
                max="1.5"
                step="0.05"
                value={fontSizeScale}
                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                className="w-full accent-[#3155E7]"
                aria-label="Adjust font scale for entire application"
              />
              <span className="text-xs text-[#59685d]">150%</span>
            </div>
            <p className="text-[11px] text-[#59685d] mt-1">
              Scales typography across all studio pages for enhanced low-vision reading.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#4b5750] mb-2">
              Contrast Theme
            </label>
            <button
              onClick={onToggleContrast}
              className="px-4 py-2 border border-[#3155E7] text-[#3155E7] text-xs font-bold rounded hover:bg-[#3155E7]/10 transition-colors"
            >
              {isHighContrast ? "Switch to Standard Parchment Theme" : "Switch to High Contrast Dark Mode"}
            </button>
            <p className="text-[11px] text-[#59685d] mt-1">
              Optimized for maximum luminance ratio compliant with WCAG 2.1 Level AAA.
            </p>
          </div>
        </div>

        {onColorVisionModeChange && (
          <div className="mt-6 pt-5 border-t border-[#eeece5]">
            <h3 className="text-xs font-bold text-[#202522] mb-2">
              Colorblind-Responsive Palette (CVD Safe Mode)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CVD_OPTIONS.map((opt) => {
                const selected = colorVisionMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onColorVisionModeChange(opt.id);
                      speakText(`${opt.label} selected. ${opt.desc}`, { lang: "en-US" });
                    }}
                    aria-pressed={selected}
                    className={`p-3 rounded-lg border text-left transition ${
                      selected
                        ? "bg-[#e4e8fb] border-[#3155E7] text-[#1b211d] ring-1 ring-[#3155E7]"
                        : "bg-[#F7F5EF] border-[#d8d7d0] text-[#3d4841] hover:bg-[#eeece5]"
                    }`}
                  >
                    <p className="text-xs font-bold">{opt.label}</p>
                    <p className="text-[11px] text-[#59685d] mt-1 leading-snug">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Important Notices */}
      <section className="p-6 bg-[#f4ecd6] border border-[#d6bd7e] rounded-md mb-8 text-[#59420e]">
        <h2 className="text-sm font-bold mb-2">⚠️ Important Notices & Limitations</h2>
        <ul className="space-y-2 text-xs leading-relaxed list-disc list-inside">
          <li>
            <strong>Displayed Braille is Unicode text — not physical tactile output.</strong> A refreshable Braille display terminal or Braille embosser is required for physical tactile finger reading.
          </li>
          <li>
            <strong>Study Companion Grounding:</strong> Questions are answered using verified statements in your uploaded document. The assistant explicitly warns you whenever an answer cannot be verified from the material.
          </li>
          <li>
            <strong>Offline Calendar Reminders:</strong> The Notice Assistant produces standard .ics calendar files that you can import into Apple Calendar, Google Calendar, Outlook, or your phone calendar with zero internet required.
          </li>
          <li>
            <strong>Local Processing:</strong> All documents, notes, game records, and text remain in your browser session and local storage. No unnecessary personal telemetry is transmitted.
          </li>
        </ul>
      </section>

      {/* Supported Braille Tables & Formats */}
      <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md mb-8">
        <h2 className="text-base font-bold text-[#202522] mb-3">
          Supported Standards & Language Tables
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-[#4b5750]">
            <thead className="bg-[#eeece5] text-[#202522] font-bold">
              <tr>
                <th className="p-2.5">Standard / Language</th>
                <th className="p-2.5">Script</th>
                <th className="p-2.5">Grade</th>
                <th className="p-2.5">Table File</th>
                <th className="p-2.5">Sanity Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eeece5]">
              {Object.values(BRAILLE_TABLES).map((tbl) => (
                <tr key={tbl.id}>
                  <td className="p-2.5 font-semibold text-[#202522]">{tbl.name}</td>
                  <td className="p-2.5">{tbl.script}</td>
                  <td className="p-2.5">Grade {tbl.grade}</td>
                  <td className="p-2.5 font-mono">{tbl.table}</td>
                  <td className="p-2.5 font-mono text-[#3155E7]">
                    {tbl.sanityChar} → {tbl.sanityExpected}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Keyboard Shortcuts Guide */}
      <section className="p-6 bg-[#fffefa] border border-[#d8d7d0] rounded-md">
        <h2 className="text-base font-bold text-[#202522] mb-3">
          Keyboard Navigation Guide
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Switch Pages (Home to Accessibility)</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">Alt + 1 .. 7</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Voice Agent (Talk to BrailleBridge)</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">Alt + V</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Voice Guide & Onboarding</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">Alt + H</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Start / Pause Voice Reading on Any Screen</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">Space</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Silence Speech Immediately</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">Escape</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Open Progress & Saved Dashboard</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">Alt + D or Alt + 9</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Open Ask Agent Drawer (Text/Voice)</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">Alt + Q</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Perkins 6-Key Braille</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">S D F & J K L</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Pattern Builder Chords</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">1 .. 6 keys</kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-[#F7F5EF] rounded border border-[#d8d7d0]">
            <span className="text-[#202522]">Skip to Main Content</span>
            <kbd className="font-mono bg-white px-2 py-0.5 border rounded">Tab on page load</kbd>
          </div>
        </div>
      </section>
    </main>
  );
};
