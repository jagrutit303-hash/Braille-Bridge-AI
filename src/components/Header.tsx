import React, { useState, useEffect } from "react";
import { getActiveLanguage, setActiveLanguage, speakText } from "../services/speechService";
import { SUPPORTED_LANGUAGES, getPhrases } from "../services/i18nService";
import { AuthUser } from "../services/authService";

export type NavPage =
  | "home"
  | "dashboard"
  | "translator"
  | "study"
  | "planner"
  | "games"
  | "notice"
  | "document"
  | "voice"
  | "about";

interface HeaderProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  isHighContrast: boolean;
  onToggleContrast: () => void;
  currentUser?: AuthUser | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  isHighContrast,
  onToggleContrast,
  currentUser,
}) => {
  const [currentLang, setCurrentLang] = useState<string>("en-US");

  useEffect(() => {
    setCurrentLang(getActiveLanguage());
    const handleLangSync = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom?.detail) setCurrentLang(custom.detail);
    };
    window.addEventListener("braillebridge-language-change", handleLangSync);
    return () => window.removeEventListener("braillebridge-language-change", handleLangSync);
  }, []);

  const handleLanguageChange = (langCode: string) => {
    setActiveLanguage(langCode);
    setCurrentLang(langCode);
    const phrases = getPhrases(langCode);
    const matched = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    const nativeName = matched?.nativeName || langCode;
    speakText(phrases.voiceSwitched(nativeName), { lang: langCode });
  };

  const navItems: { id: NavPage; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "dashboard", label: "Dashboard" },
    { id: "translator", label: "Translator" },
    { id: "study", label: "Study Companion" },
    { id: "planner", label: "Planner" },
    { id: "games", label: "Braille Games" },
    { id: "notice", label: "Notice Assistant" },
    { id: "about", label: "Accessibility" },
  ];

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#3155E7] focus:text-white focus:font-bold focus:rounded focus:shadow-lg"
      >
        Skip to main content
      </a>

      <header className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-[#d8d7d0] bg-[#fffefa]/95 backdrop-blur-sm sticky top-0 z-40">
        {/* Wordmark */}
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-2 text-left text-base sm:text-lg font-serif font-bold tracking-tight text-[#202522] whitespace-nowrap shrink-0 hover:opacity-85 transition-opacity"
          aria-label="BrailleBridge AI Home"
        >
          <span
            className="inline-grid grid-cols-3 gap-1 p-0.5"
            aria-hidden="true"
          >
            <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
            <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
            <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
            <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
            <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
            <i className="w-1.5 h-1.5 rounded-full bg-[#3155E7]"></i>
          </span>
          <span>BrailleBridge</span>
        </button>

        {/* Main Navigation */}
        <nav
          className="hidden xl:flex items-center gap-4 text-sm font-medium text-[#4b5750]"
          aria-label="Main Navigation"
        >
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 font-medium ${
                  isActive
                    ? "border-[#3155E7] text-[#3155E7] font-bold"
                    : "border-transparent text-[#4b5750] hover:text-[#202522] hover:border-[#d8d7d0]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Global Controls & Voice First Trigger */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          {/* Multilingual Voice Language Selector */}
          <div className="flex items-center gap-1 bg-[#F7F5EF] border border-[#d8d7d0] rounded px-1.5 sm:px-2 py-1 text-xs min-w-0 max-w-[125px] sm:max-w-none">
            <span className="text-[11px] font-bold text-[#4b5750] hidden sm:inline shrink-0" aria-hidden="true">
              🗣
            </span>
            <select
              value={currentLang}
              onChange={(e) => handleLanguageChange(e.target.value)}
              aria-label="Select voice and reading language"
              className="bg-transparent font-semibold text-[#202522] text-xs focus:outline-none cursor-pointer w-full truncate"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName} ({lang.name})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onToggleContrast}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#4b5750] border border-[#d8d7d0] rounded hover:border-[#3155E7] hover:text-[#202522] transition-colors whitespace-nowrap"
            title="Toggle high-contrast mode for enhanced visibility"
            aria-label={`Toggle high contrast mode. Currently ${isHighContrast ? "enabled" : "disabled"}`}
          >
            <span>{isHighContrast ? "Standard Contrast" : "High Contrast"}</span>
          </button>

          <button
            onClick={() => onNavigate("dashboard")}
            className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border transition-colors whitespace-nowrap ${
              currentUser
                ? "bg-[#e9f5ef] text-[#0f8872] border-[#c2e4d3] hover:brightness-95"
                : "bg-[#fffefa] text-[#2847cf] border-[#c7d1f7] hover:bg-[#e4e8fb]"
            }`}
            aria-label={
              currentUser
                ? `Signed in as ${currentUser.name}. Open Student Dashboard`
                : "One-time Student Sign In on Dashboard"
            }
            title={currentUser ? `Signed in: ${currentUser.name}` : "One-time login for your Dashboard"}
          >
            <span aria-hidden="true">{currentUser ? "👤" : "🔐"}</span>
            <span>{currentUser ? currentUser.name.split(" ")[0] : "Sign In"}</span>
          </button>

          {/* Universal Voice First Action Button */}
          <button
            onClick={() => onNavigate("voice")}
            className="px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-white bg-[#3155E7] rounded hover:bg-[#233fbe] transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm"
            aria-label="Open Voice Agent, shortcut Alt plus V"
            title="Activate Voice Agent (Alt+V)"
          >
            <span aria-hidden="true">🎙</span>
            <span className="hidden sm:inline">Voice Agent</span>
            <span className="sm:hidden">Agent</span>
            <kbd className="hidden lg:inline font-mono text-[10px] bg-white/20 px-1 py-0.5 rounded">Alt+V</kbd>
          </button>
        </div>
      </header>

      {/* Mobile & Compact Tablet Nav Bar */}
      <div className="xl:hidden flex items-center overflow-x-auto gap-2 px-3 sm:px-4 py-2 border-b border-[#d8d7d0] bg-[#eeece5]">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`px-3 py-2 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
              currentPage === item.id
                ? "bg-[#3155E7] text-white font-bold"
                : "bg-white text-[#4b5750] border border-[#d8d7d0]"
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          onClick={() => onNavigate("dashboard")}
          className={`md:hidden px-3 py-2 text-xs font-bold rounded border whitespace-nowrap shrink-0 ${
            currentUser
              ? "bg-[#e9f5ef] text-[#0f8872] border-[#c2e4d3]"
              : "bg-[#fffefa] text-[#2847cf] border-[#c7d1f7]"
          }`}
        >
          {currentUser ? `👤 ${currentUser.name.split(" ")[0]}` : "🔐 Sign In"}
        </button>
      </div>
    </>
  );
};
