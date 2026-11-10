import React from "react";
import { AlertTriangle, RotateCcw, Home, Volume2 } from "lucide-react";
import { speakText } from "../services/speechService";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  sectionName?: string;
  onResetToHome?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : "An unexpected display or data issue occurred.";
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.warn("BrailleBridge ErrorBoundary caught runtime error:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, errorMessage: "" });
    this.props.onResetToHome?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const section = this.props.sectionName || "this section";
    const spokenSummary = `A recoverable issue occurred while loading ${section}. You can click Retry Section or Return Home safely.`;

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="max-w-2xl mx-auto my-10 bg-[#fffefa] border-2 border-[#d8d7d0] rounded-2xl p-6 sm:p-8 shadow-sm space-y-5"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#fef7e6] border border-[#e7cfa0] text-[#795b19] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-[#1b211d]">
              Graceful Fallback: {section} paused safely
            </h2>
            <p className="text-sm text-[#4e5b52] leading-relaxed">
              Your saved notes, study plans, and preferences remain safe. Something unexpected happened while displaying {section}.
            </p>
            {this.state.errorMessage && (
              <p className="text-xs font-mono text-[#6a776d] bg-[#f8f7f2] border border-[#d8d7d0] rounded-lg px-3 py-2 mt-2">
                Details: {this.state.errorMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3155E7] text-white font-semibold text-sm hover:bg-[#2343cb] min-h-[44px]"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Reload {section}
          </button>

          {this.props.onResetToHome && (
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f8f7f2] border border-[#d8d7d0] text-[#1b211d] font-semibold text-sm hover:bg-[#eeece5] min-h-[44px]"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              Return to Home
            </button>
          )}

          <button
            type="button"
            onClick={() => speakText(spokenSummary, { lang: "en-US" })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#e4e8fb] text-[#2847cf] font-semibold text-sm hover:bg-[#d5def9] min-h-[44px]"
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
            Read Aloud
          </button>
        </div>
      </div>
    );
  }
}

