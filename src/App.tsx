import React, { useState, useEffect } from "react";
import { MotionConfig } from "motion/react";
import { Header, NavPage } from "./components/Header";
import { HomeView } from "./views/HomeView";
import { DashboardView } from "./views/DashboardView";
import { TranslatorView } from "./views/TranslatorView";
import { StudyCompanionView } from "./views/StudyCompanionView";
import { PlannerView } from "./views/PlannerView";
import { BrailleGamesView } from "./views/BrailleGamesView";
import { NoticeAssistantView } from "./views/NoticeAssistantView";
import { VoiceAssistantView } from "./views/VoiceAssistantView";
import { AccessibilityAboutView } from "./views/AccessibilityAboutView";
import { VoiceAgentBar } from "./components/VoiceAgentBar";
import { AccessibilityBar } from "./components/AccessibilityBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import {
  stopSpeaking,
  isSpeaking,
  getActiveLanguage,
  setActiveLanguage,
} from "./services/speechService";
import {
  fetchUserPreferencesFromCloud,
  saveUserPreferencesToCloud,
  ColorVisionMode,
} from "./services/supabaseService";
import {
  AuthUser,
  AUTH_CHANGE_EVENT,
  getStoredUser,
  restoreOneTimeSession,
} from "./services/authService";

const CVD_LABELS: Record<ColorVisionMode, string> = {
  standard: "Standard Palette",
  deuteranopia: "Red-Green Safe",
  tritanopia: "Blue-Yellow Safe",
  monochrome: "Monochrome Safe",
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavPage>("home");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());
  const [isHighContrast, setIsHighContrast] = useState<boolean>(() => {
    try {
      return localStorage.getItem("braillebridge_high_contrast") === "true";
    } catch {
      return false;
    }
  });
  const [colorVisionMode, setColorVisionMode] = useState<ColorVisionMode>(() => {
    try {
      const saved = localStorage.getItem("braillebridge_cvd_mode") as ColorVisionMode | null;
      return saved && ["standard", "deuteranopia", "tritanopia", "monochrome"].includes(saved)
        ? saved
        : "standard";
    } catch {
      return "standard";
    }
  });
  const [fontSizeScale, setFontSizeScale] = useState<number>(() => {
    try {
      const s = parseFloat(localStorage.getItem("braillebridge_font_scale") || "1");
      return Number.isFinite(s) && s >= 0.9 && s <= 1.5 ? s : 1.0;
    } catch {
      return 1.0;
    }
  });
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [pageAnnouncement, setPageAnnouncement] = useState<string>("Loaded Home page");

  // Restore persisted user preferences & one-time session on boot
  useEffect(() => {
    restoreOneTimeSession()
      .then((user) => setCurrentUser(user))
      .catch(() => {});

    const onAuthChange = (e: Event) => {
      const custom = e as CustomEvent<AuthUser | null>;
      setCurrentUser(custom?.detail ?? getStoredUser());
    };
    const onCvdChange = (e: Event) => {
      const custom = e as CustomEvent<ColorVisionMode>;
      if (custom?.detail) setColorVisionMode(custom.detail);
    };
    window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange);
    window.addEventListener("braillebridge-cvd-change", onCvdChange);

    fetchUserPreferencesFromCloud()
      .then((prefs) => {
        if (prefs) {
          if (typeof prefs.isHighContrast === "boolean") setIsHighContrast(prefs.isHighContrast);
          if (
            prefs.colorVisionMode &&
            ["standard", "deuteranopia", "tritanopia", "monochrome"].includes(prefs.colorVisionMode)
          ) {
            setColorVisionMode(prefs.colorVisionMode);
          }
          if (typeof prefs.fontScale === "number" && prefs.fontScale >= 0.9 && prefs.fontScale <= 1.5) {
            setFontSizeScale(prefs.fontScale);
          }
          if (typeof prefs.speechSpeed === "number") setSpeechSpeed(prefs.speechSpeed);
          if (prefs.preferredLanguage) setActiveLanguage(prefs.preferredLanguage);
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange);
      window.removeEventListener("braillebridge-cvd-change", onCvdChange);
    };
  }, []);

  // Sync High Contrast, Color Vision Deficiency Mode & Font Scaling onto root <html>
  useEffect(() => {
    const htmlEl = document.documentElement;
    if (isHighContrast) {
      htmlEl.classList.add("high-contrast");
    } else {
      htmlEl.classList.remove("high-contrast");
    }
    htmlEl.setAttribute("data-cvd", colorVisionMode);
    htmlEl.style.fontSize = `${fontSizeScale * 16}px`;

    try {
      localStorage.setItem("braillebridge_high_contrast", String(isHighContrast));
      localStorage.setItem("braillebridge_cvd_mode", colorVisionMode);
      localStorage.setItem("braillebridge_font_scale", String(fontSizeScale));
    } catch {
      // ignore
    }

    saveUserPreferencesToCloud({
      isHighContrast,
      colorVisionMode,
      fontScale: fontSizeScale,
      speechSpeed,
      preferredLanguage: getActiveLanguage(),
    }).catch(() => {});
  }, [isHighContrast, colorVisionMode, fontSizeScale, speechSpeed]);

  const handleNavigate = (page: NavPage) => {
    stopSpeaking();
    setCurrentPage(page);
    const titles: Record<NavPage, string> = {
      home: "Home page",
      dashboard: "User Progress and Saved Vault Dashboard",
      translator: "Braille Translator studio",
      study: "AI Study Companion tutor",
      planner: "Study Planner & Calendar sync",
      games: "Braille Learning Games and Academy",
      notice: "College Notice and Form Assistant",
      document: "Study Companion workspace",
      voice: "Voice Assistant workspace",
      about: "Accessibility and About notes",
    };
    setPageAnnouncement(`Navigated to ${titles[page]}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Keyboard shortcut listener for universal navigation & speech silence (Escape / Space outside controls)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopSpeaking();
      } else if (e.key === " " && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName || "";
        const role = active?.getAttribute("role") || "";
        const isInteractiveControl =
          ["INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON", "A"].includes(tag) ||
          Boolean(active?.isContentEditable) ||
          ["button", "tab", "menuitem", "switch", "checkbox", "radio"].includes(role);
        const perkinsActive = Boolean(document.querySelector('[data-perkins-active="true"]'));

        if (!isInteractiveControl && !perkinsActive) {
          e.preventDefault();
          if (isSpeaking()) {
            stopSpeaking();
          } else {
            window.dispatchEvent(new CustomEvent("braillebridge-space-read"));
          }
        }
      }
      if (e.altKey) {
        if (e.key === "1") {
          e.preventDefault();
          handleNavigate("home");
        } else if (e.key === "2") {
          e.preventDefault();
          handleNavigate("translator");
        } else if (e.key === "3") {
          e.preventDefault();
          handleNavigate("study");
        } else if (e.key === "4") {
          e.preventDefault();
          handleNavigate("planner");
        } else if (e.key === "5") {
          e.preventDefault();
          handleNavigate("games");
        } else if (e.key === "6") {
          e.preventDefault();
          handleNavigate("notice");
        } else if (e.key === "7") {
          e.preventDefault();
          handleNavigate("about");
        } else if (e.key === "8") {
          e.preventDefault();
          handleNavigate("voice");
        } else if (e.key === "9" || e.key === "d" || e.key === "D") {
          e.preventDefault();
          handleNavigate("dashboard");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`min-h-screen transition-colors duration-150 flex flex-col ${
        isHighContrast ? "high-contrast bg-[#0a0d0c] text-[#f9fbf9]" : "bg-[#F7F5EF] text-[#202522]"
      }`}
      style={{ fontSize: `${fontSizeScale * 16}px` }}
    >
      {/* Screen reader polite announcement live region */}
      <div className="sr-only" role="status" aria-live="polite">
        {pageAnnouncement}
      </div>

      {/* Top Bar Header */}
      <Header
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isHighContrast={isHighContrast}
        onToggleContrast={() => setIsHighContrast(!isHighContrast)}
        currentUser={currentUser}
      />

      {/* Persistent Low-Vision & Page Orientation Accessibility Bar */}
      <AccessibilityBar
        currentPage={currentPage}
        fontSizeScale={fontSizeScale}
        onFontScaleChange={setFontSizeScale}
        isHighContrast={isHighContrast}
        onToggleContrast={() => setIsHighContrast(!isHighContrast)}
        colorVisionMode={colorVisionMode}
        onColorVisionModeChange={setColorVisionMode}
      />

      {/* Main Content Pages (bottom padding prevents floating Voice Agent pill overlap) */}
      <div className="flex-1 pb-24">
        <ErrorBoundary
          key={currentPage}
          sectionName={currentPage}
          onResetToHome={() => handleNavigate("home")}
        >
        {currentPage === "home" && (
          <HomeView
            onNavigateToDashboard={() => handleNavigate("dashboard")}
            onNavigateToVoice={() => handleNavigate("voice")}
            onNavigateToTranslator={() => handleNavigate("translator")}
            onNavigateToStudy={() => handleNavigate("study")}
            onNavigateToPlanner={() => handleNavigate("planner")}
            onNavigateToGames={() => handleNavigate("games")}
            onNavigateToNotice={() => handleNavigate("notice")}
          />
        )}
        {currentPage === "dashboard" && (
          <DashboardView
            onNavigate={handleNavigate}
            fontSizeScale={fontSizeScale}
            isHighContrast={isHighContrast}
            speechSpeed={speechSpeed}
            currentUser={currentUser}
            onUserChange={setCurrentUser}
          />
        )}
        {currentPage === "translator" && <TranslatorView />}
        {(currentPage === "study" || currentPage === "document") && <StudyCompanionView />}
        {currentPage === "planner" && <PlannerView />}
        {currentPage === "games" && <BrailleGamesView />}
        {currentPage === "notice" && <NoticeAssistantView />}
        {currentPage === "voice" && (
          <VoiceAssistantView
            onNavigate={handleNavigate}
            speechSpeed={speechSpeed}
            onSpeechSpeedChange={setSpeechSpeed}
            isHighContrast={isHighContrast}
            onToggleContrast={() => setIsHighContrast(!isHighContrast)}
            fontSizeScale={fontSizeScale}
            onFontSizeScaleChange={setFontSizeScale}
            onColorVisionModeChange={setColorVisionMode}
          />
        )}
        {currentPage === "about" && (
          <AccessibilityAboutView
            fontSizeScale={fontSizeScale}
            onScaleChange={setFontSizeScale}
            isHighContrast={isHighContrast}
            onToggleContrast={() => setIsHighContrast(!isHighContrast)}
            colorVisionMode={colorVisionMode}
            onColorVisionModeChange={setColorVisionMode}
          />
        )}
        </ErrorBoundary>
      </div>

      {/* Persistent Voice Agent Overlay */}
      <VoiceAgentBar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        speechSpeed={speechSpeed}
        onSpeechSpeedChange={setSpeechSpeed}
        isHighContrast={isHighContrast}
        onToggleContrast={() => setIsHighContrast(!isHighContrast)}
        fontSizeScale={fontSizeScale}
        onFontSizeScaleChange={setFontSizeScale}
        onColorVisionModeChange={setColorVisionMode}
      />

      {/* Standard Multi-Column Accessible Footer */}
      <Footer
        onNavigate={handleNavigate}
        onOpenAgent={() => handleNavigate("voice")}
        colorVisionLabel={CVD_LABELS[colorVisionMode]}
      />
    </div>
    </MotionConfig>
  );
}
