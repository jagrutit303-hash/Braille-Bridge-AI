import React, { useState, useEffect, useRef } from "react";
import { X, User, Check, Sparkles } from "lucide-react";
import {
  AuthUser,
  getStoredStudentName,
  saveStudentName,
} from "../services/authService";
import { speakText, getActiveLanguage } from "../services/speechService";

export type AuthModalMode = "login" | "register" | "reset";

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: AuthModalMode;
  onClose: () => void;
  onSuccess?: (user: AuthUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill student name when modal opens
  useEffect(() => {
    if (isOpen) {
      const existing = getStoredStudentName();
      setName(existing || "Jagruti");
      setErrorMessage("");
      setSuccessMessage("");
      setIsSubmitting(false);

      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeLang = getActiveLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const cleanName = name.trim();
    if (cleanName.length < 2) {
      const msg = "Please enter your name (at least 2 characters).";
      setErrorMessage(msg);
      speakText(msg, { lang: activeLang });
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedUser = await saveStudentName(cleanName);
      setSuccessMessage(`Welcome, ${cleanName}! Your profile is saved.`);
      speakText(`Welcome ${cleanName}. Your name is saved across BrailleBridge.`, {
        lang: activeLang,
      });
      onSuccess?.(updatedUser);
      setTimeout(() => {
        onClose();
      }, 500);
    } catch {
      setErrorMessage("Could not save name. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-[#fffefa] rounded-2xl shadow-2xl border border-[#d8d7d0] overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#eeece5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e4e8fb] text-[#2847cf] flex items-center justify-center">
              <User className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="student-profile-title"
                className="text-lg font-bold text-[#202522] tracking-tight"
              >
                Student Profile
              </h2>
              <p className="text-xs text-[#556358]">
                Personalize your name across BrailleBridge
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 text-[#556358] hover:text-[#202522] hover:bg-[#f1efe9] rounded-lg transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="p-3.5 bg-[#f7f9fe] border border-[#d6defa] rounded-xl text-xs text-[#3155E7] flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              No password or email needed! Enter your name to personalize your
              dashboard, voice greetings, study timetable, and game progress.
            </span>
          </div>

          <div>
            <label
              htmlFor="student-profile-name"
              className="block text-xs font-bold text-[#202522] mb-1.5"
            >
              Your Name
            </label>
            <input
              ref={nameInputRef}
              id="student-profile-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Jagruti"
              className="w-full px-4 py-3 rounded-xl border border-[#d8d7d0] bg-[#f8f7f2] text-base font-semibold text-[#202522] placeholder:text-[#888e84] focus:outline-none focus:ring-2 focus:ring-[#3155E7] focus:border-transparent transition"
            />
            <p className="text-[11px] text-[#556358] mt-1">
              You can edit or update your name anytime from the top bar or dashboard.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3 bg-[#f6e2df] border border-[#e3b2ad] rounded-xl text-xs text-[#9b302d] font-semibold"
            >
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="p-3 bg-[#e9f5ef] border border-[#c2e4d3] rounded-xl text-xs text-[#0f8872] font-semibold flex items-center gap-2"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[#d8d7d0] bg-[#fffefa] text-xs font-bold text-[#4b5750] hover:bg-[#f1efe9] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-[#3155E7] text-white text-xs font-bold hover:bg-[#233fbe] active:scale-[0.99] disabled:opacity-50 transition flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>{isSubmitting ? "Saving…" : "Save Name"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
