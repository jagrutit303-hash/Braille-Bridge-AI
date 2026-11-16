import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Eye,
  EyeOff,
  ShieldCheck,
  User,
  Mail,
  Lock,
  ArrowRight,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import {
  AuthUser,
  loginStudentAccount,
  registerStudentAccount,
  resetStudentPassword,
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
  initialMode = "login",
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState("");

  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync mode whenever initialMode or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage("");
      setErrorCode(undefined);
      setSuccessMessage("");
      setPassword("");
      setConfirmPassword("");

      // Auto-focus after dialog opens
      const timer = setTimeout(() => {
        if (initialMode === "register") {
          nameInputRef.current?.focus();
        } else {
          emailInputRef.current?.focus();
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialMode]);

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

  const handleSwitchMode = (newMode: AuthModalMode) => {
    setMode(newMode);
    setErrorMessage("");
    setErrorCode(undefined);
    setSuccessMessage("");
    if (newMode === "register") {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    } else {
      setTimeout(() => emailInputRef.current?.focus(), 50);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setErrorCode(undefined);
    setSuccessMessage("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      const msg = "Please enter a valid email address.";
      setErrorMessage(msg);
      speakText(msg, { lang: activeLang });
      return;
    }

    if (mode === "register" && name.trim().length < 2) {
      const msg = "Please enter your name (at least 2 characters).";
      setErrorMessage(msg);
      speakText(msg, { lang: activeLang });
      return;
    }

    if (password.length < 6) {
      const msg = "Password must be at least 6 characters long.";
      setErrorMessage(msg);
      speakText(msg, { lang: activeLang });
      return;
    }

    if (mode === "reset" && password !== confirmPassword) {
      const msg = "Passwords do not match. Please re-enter identical passwords.";
      setErrorMessage(msg);
      speakText(msg, { lang: activeLang });
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "login") {
        const result = await loginStudentAccount(cleanEmail, password);
        if (result.error || !result.user) {
          setErrorMessage(result.error || "Sign in failed. Please check your credentials.");
          setErrorCode(result.code);
          speakText(result.error || "Sign in failed.", { lang: activeLang });
          return;
        }

        setSuccessMessage(`Welcome back, ${result.user.name}!`);
        speakText(`Welcome back ${result.user.name}. You are now signed in.`, { lang: activeLang });
        onSuccess?.(result.user);
        setTimeout(() => onClose(), 600);
      } else if (mode === "register") {
        const result = await registerStudentAccount(name, cleanEmail, password);
        if (result.error || !result.user) {
          setErrorMessage(result.error || "Could not create account.");
          setErrorCode(result.code);
          speakText(result.error || "Could not create account.", { lang: activeLang });
          return;
        }

        setSuccessMessage(`Account created for ${result.user.name}!`);
        speakText(`Welcome ${result.user.name}. Your student account is now active.`, {
          lang: activeLang,
        });
        onSuccess?.(result.user);
        setTimeout(() => onClose(), 600);
      } else if (mode === "reset") {
        const result = await resetStudentPassword(cleanEmail, password);
        if (result.error || !result.user) {
          setErrorMessage(result.error || "Could not reset password.");
          setErrorCode(result.code);
          speakText(result.error || "Could not reset password.", { lang: activeLang });
          return;
        }

        setSuccessMessage("Password reset successfully!");
        speakText("Password updated. You are now signed in.", { lang: activeLang });
        onSuccess?.(result.user);
        setTimeout(() => onClose(), 600);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-[#fffefa] text-[#202522] rounded-2xl shadow-2xl border-2 border-[#c7d1f7] overflow-hidden my-auto max-h-[calc(100dvh-2rem)] flex flex-col">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-[#e2e1d9] flex items-center justify-between shrink-0 bg-[#f7f9fe]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#3155E7] text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-base sm:text-lg font-bold text-[#1b211d] leading-snug">
                {mode === "login"
                  ? "Student Sign In"
                  : mode === "register"
                  ? "Create Student Account"
                  : "Reset Account Password"}
              </h2>
              <p className="text-[11px] text-[#556358] leading-tight">
                {mode === "login"
                  ? "Access your saved progress, timetable & notes"
                  : mode === "register"
                  ? "One-time setup remembered on this browser"
                  : "Enter your student email and a new password"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication dialog"
            className="p-1.5 rounded-lg text-[#556358] hover:text-[#1b211d] hover:bg-[#eae8df] transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-5 sm:px-6 pt-3 pb-1 shrink-0 bg-[#fffefa]">
          <div
            role="tablist"
            aria-label="Authentication Options"
            className="grid grid-cols-3 p-1 rounded-xl bg-[#eeece5] border border-[#d8d7d0] text-xs font-bold"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => handleSwitchMode("login")}
              className={`py-1.5 rounded-lg transition-all ${
                mode === "login"
                  ? "bg-[#3155E7] text-white shadow-sm"
                  : "text-[#4b5750] hover:text-[#202522]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => handleSwitchMode("register")}
              className={`py-1.5 rounded-lg transition-all ${
                mode === "register"
                  ? "bg-[#3155E7] text-white shadow-sm"
                  : "text-[#4b5750] hover:text-[#202522]"
              }`}
            >
              Sign Up
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "reset"}
              onClick={() => handleSwitchMode("reset")}
              className={`py-1.5 rounded-lg transition-all ${
                mode === "reset"
                  ? "bg-[#3155E7] text-white shadow-sm"
                  : "text-[#4b5750] hover:text-[#202522]"
              }`}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Success Banner */}
          {successMessage && (
            <div
              role="status"
              className="p-3 bg-[#e9f5ef] border border-[#a2d8be] rounded-xl text-xs font-bold text-[#0f8872] flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Banner with Contextual Recovery Action */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 bg-[#fbeae8] border border-[#f3beb8] rounded-xl text-xs text-[#9b302d] space-y-2"
            >
              <p className="font-bold">{errorMessage}</p>
              {errorCode === "USER_EXISTS" && (
                <button
                  type="button"
                  onClick={() => handleSwitchMode("login")}
                  className="px-2.5 py-1 bg-[#3155E7] text-white text-[11px] font-bold rounded-md hover:bg-[#233fbe] transition"
                >
                  Switch to Sign In →
                </button>
              )}
              {errorCode === "USER_NOT_FOUND" && (
                <button
                  type="button"
                  onClick={() => handleSwitchMode("register")}
                  className="px-2.5 py-1 bg-[#3155E7] text-white text-[11px] font-bold rounded-md hover:bg-[#233fbe] transition"
                >
                  Create an Account Now →
                </button>
              )}
              {errorCode === "INVALID_PASSWORD" && (
                <button
                  type="button"
                  onClick={() => handleSwitchMode("reset")}
                  className="px-2.5 py-1 bg-[#9b302d] text-white text-[11px] font-bold rounded-md hover:brightness-110 transition"
                >
                  Reset Password with this Email →
                </button>
              )}
            </div>
          )}

          {/* Full Name field (Register only) */}
          {mode === "register" && (
            <div>
              <label
                htmlFor="modal-auth-name"
                className="block text-xs font-bold text-[#202522] mb-1 flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5 text-[#3155E7]" aria-hidden="true" />
                <span>Full Name</span>
              </label>
              <input
                ref={nameInputRef}
                id="modal-auth-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Ananya Sharma"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7d0] bg-[#f8f7f2] text-sm text-[#202522] placeholder:text-[#888e84] focus:outline-none focus:ring-2 focus:ring-[#3155E7]"
              />
            </div>
          )}

          {/* Email field */}
          <div>
            <label
              htmlFor="modal-auth-email"
              className="block text-xs font-bold text-[#202522] mb-1 flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-[#3155E7]" aria-hidden="true" />
              <span>Email Address</span>
            </label>
            <input
              ref={emailInputRef}
              id="modal-auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@college.edu"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7d0] bg-[#f8f7f2] text-sm text-[#202522] placeholder:text-[#888e84] focus:outline-none focus:ring-2 focus:ring-[#3155E7]"
            />
          </div>

          {/* Password field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="modal-auth-password"
                className="text-xs font-bold text-[#202522] flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-[#3155E7]" aria-hidden="true" />
                <span>
                  {mode === "reset" ? "New Password (min 6 characters)" : "Password (min 6 characters)"}
                </span>
              </label>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => handleSwitchMode("reset")}
                  className="text-[11px] font-bold text-[#3155E7] hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="modal-auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-[#d8d7d0] bg-[#f8f7f2] text-sm text-[#202522] placeholder:text-[#888e84] focus:outline-none focus:ring-2 focus:ring-[#3155E7]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password characters" : "Show password characters"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#556358] hover:text-[#1b211d] transition"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password (Reset only) */}
          {mode === "reset" && (
            <div>
              <label
                htmlFor="modal-auth-confirm"
                className="block text-xs font-bold text-[#202522] mb-1 flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#3155E7]" aria-hidden="true" />
                <span>Confirm New Password</span>
              </label>
              <input
                id="modal-auth-confirm"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7d0] bg-[#f8f7f2] text-sm text-[#202522] placeholder:text-[#888e84] focus:outline-none focus:ring-2 focus:ring-[#3155E7]"
              />
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-[#3155E7] text-white text-sm font-bold hover:bg-[#233fbe] active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-[#3155E7]/20"
            >
              <span>
                {isSubmitting
                  ? "Authenticating…"
                  : mode === "login"
                  ? "Sign In to Dashboard"
                  : mode === "register"
                  ? "Create Account & Sign In"
                  : "Update Password & Sign In"}
              </span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Bottom helper text */}
          <div className="pt-1 text-center">
            {mode === "login" ? (
              <p className="text-xs text-[#556358]">
                New student here?{" "}
                <button
                  type="button"
                  onClick={() => handleSwitchMode("register")}
                  className="font-bold text-[#3155E7] hover:underline"
                >
                  Create your account
                </button>
              </p>
            ) : mode === "register" ? (
              <p className="text-xs text-[#556358]">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => handleSwitchMode("login")}
                  className="font-bold text-[#3155E7] hover:underline"
                >
                  Sign In instead
                </button>
              </p>
            ) : (
              <p className="text-xs text-[#556358]">
                Remembered your password?{" "}
                <button
                  type="button"
                  onClick={() => handleSwitchMode("login")}
                  className="font-bold text-[#3155E7] hover:underline"
                >
                  Back to Sign In
                </button>
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

