import React from "react";
import { NavPage } from "./Header";

interface FooterProps {
  onNavigate: (page: NavPage) => void;
  onOpenAgent: () => void;
  colorVisionLabel?: string;
}

export function Footer({ onNavigate, onOpenAgent, colorVisionLabel = "Standard Palette" }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer
      aria-label="Site footer"
      className="mt-auto border-t border-[#d8d7d0] bg-[#fffefa] text-[#3d4841]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Column 1: Brand & Mission */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-grid grid-cols-2 gap-1 p-1 rounded bg-[#e4e8fb]" aria-hidden="true">
                <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
                <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
                <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
                <i className="w-1.5 h-1.5 rounded-full bg-[#9ca3af]"></i>
                <i className="w-1.5 h-1.5 rounded-full bg-[#9ca3af]"></i>
                <i className="w-1.5 h-1.5 rounded-full bg-[#9ca3af]"></i>
              </span>
              <span className="text-base font-bold text-[#1b211d]">BrailleBridge AI</span>
            </div>
            <p className="text-sm text-[#4e5b52] leading-relaxed">
              Voice-first multilingual learning workspace built for low-vision students, educators, and accessible classrooms across English and Indian regional scripts.
            </p>
            <div className="inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#e9f5ef] text-[#0f8872] border border-[#c2e4d3]">
              WCAG 2.1 AAA &amp; Color-Safe
            </div>
          </div>

          {/* Column 2: Learning & Study Tools */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1b211d]">
              Learning Workspace
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("dashboard")}
                  className="hover:underline text-left text-[#3d4841]"
                >
                  Student Dashboard &amp; Script Vault
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("translator")}
                  className="hover:underline text-left text-[#3d4841]"
                >
                  Braille &amp; Bharati Translator
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("study")}
                  className="hover:underline text-left text-[#3d4841]"
                >
                  Study Companion (PDF &amp; Handwriting OCR)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("notice")}
                  className="hover:underline text-left text-[#3d4841]"
                >
                  College Notice Assistant
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("planner")}
                  className="hover:underline text-left text-[#3d4841]"
                >
                  Study Planner &amp; Timetable
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("games")}
                  className="hover:underline text-left text-[#3d4841]"
                >
                  Tactile Braille Practice Games
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Accessibility & Script Standards */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1b211d]">
              Accessibility &amp; Scripts
            </h2>
            <ul className="space-y-2 text-sm text-[#4e5b52]">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("about")}
                  className="hover:underline text-left text-[#3d4841]"
                >
                  Accessibility Statement &amp; Display Settings
                </button>
              </li>
              <li>Atkinson Hyperlegible Typography</li>
              <li>Unified English Braille (UEB G1 &amp; G2)</li>
              <li>Bharati Braille (Hindi, Kannada, Tamil, Bengali)</li>
              <li>Active Vision Mode: {colorVisionLabel}</li>
            </ul>
          </div>

          {/* Column 4: Support, Shortcuts & Privacy */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1b211d]">
              Support &amp; Keyboard Navigation
            </h2>
            <ul className="space-y-2 text-sm text-[#4e5b52]">
              <li>
                <button
                  type="button"
                  onClick={onOpenAgent}
                  className="hover:underline text-left font-semibold text-[#3155E7]"
                >
                  Ask BrailleBridge Voice Agent (Alt+V)
                </button>
              </li>
              <li>Press <kbd className="font-mono bg-[#eeece5] px-1.5 py-0.5 rounded text-xs">Space</kbd> anywhere to read/pause page</li>
              <li>Press <kbd className="font-mono bg-[#eeece5] px-1.5 py-0.5 rounded text-xs">Esc</kbd> to silence audio immediately</li>
              <li>Press <kbd className="font-mono bg-[#eeece5] px-1.5 py-0.5 rounded text-xs">Alt+1..8</kbd> to jump between sections</li>
              <li className="text-xs text-[#59685d] pt-1">
                Student privacy: documents are processed for study aid and saved preferences persist securely across sessions.
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Copyright & Compliance Strip */}
        <div className="mt-8 pt-6 border-t border-[#e5e3db] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#59685d]">
          <p>
            © {year} BrailleBridge AI. Built for inclusive, independent learning.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate("about")}
              className="hover:underline text-[#3d4841]"
            >
              Accessibility Policy
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onNavigate("dashboard")}
              className="hover:underline text-[#3d4841]"
            >
              Student Account &amp; Saved Progress
            </button>
            <span aria-hidden="true">·</span>
            <span>Keyboard &amp; Screen-Reader Friendly</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

