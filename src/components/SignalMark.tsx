import React from "react";

export type SignalState = "idle" | "listening" | "processing" | "success" | "warning" | "error";

interface SignalMarkProps {
  state: SignalState;
  message: string;
}

export const SignalMark: React.FC<SignalMarkProps> = ({ state, message }) => {
  return (
    <div
      className="flex items-center gap-3 text-sm text-[#4b5750] my-2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        className={`signal-mark signal-${state}`}
        aria-hidden="true"
        title={`Signal state: ${state}`}
      >
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
      </span>
      <span className="font-medium text-[#202522]">{message}</span>
    </div>
  );
};
