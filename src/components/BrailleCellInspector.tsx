import React from "react";
import { getRaisedDots, describeBrailleDots } from "../services/brailleService";

interface BrailleCellInspectorProps {
  char: string;
  sourceChar?: string;
  onClose?: () => void;
}

export const BrailleCellInspector: React.FC<BrailleCellInspectorProps> = ({
  char,
  sourceChar,
  onClose,
}) => {
  const raisedDots = getRaisedDots(char);
  const dotDesc = describeBrailleDots(char);
  const codePoint = char ? `U+${char.charCodeAt(0).toString(16).toUpperCase()}` : "";

  return (
    <div
      className="p-4 bg-[#fffefa] border border-[#d8d7d0] rounded-md shadow-sm"
      role="region"
      aria-label="Braille cell dot inspector"
    >
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#d8d7d0]">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-mono text-[#3155E7] select-none">{char || "⠀"}</span>
          <div>
            <h4 className="text-sm font-bold text-[#202522]">
              {sourceChar ? `Character: "${sourceChar}"` : "Braille Cell"}
            </h4>
            <p className="text-xs text-[#59685d]">
              {dotDesc} · {codePoint}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-[#4b5750] hover:text-[#202522] px-2 py-1 rounded"
            aria-label="Close dot inspector"
          >
            ✕ Close
          </button>
        )}
      </div>

      <div className="flex items-center gap-6">
        {/* 6-dot matrix */}
        <div
          className="grid grid-cols-2 gap-x-5 gap-y-3.5 p-3 bg-[#eeece5] rounded border border-[#d8d7d0]"
          aria-label={`6-dot Braille cell with ${dotDesc}`}
        >
          {/* Dot 1 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-5 h-5 rounded-full border-2 border-[#3155E7] flex items-center justify-center transition-all ${
                raisedDots.includes(1) ? "bg-[#3155E7]" : "bg-[#fffefa]"
              }`}
            />
            <span className="text-xs text-[#59685d] font-mono">1</span>
          </div>

          {/* Dot 4 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-5 h-5 rounded-full border-2 border-[#3155E7] flex items-center justify-center transition-all ${
                raisedDots.includes(4) ? "bg-[#3155E7]" : "bg-[#fffefa]"
              }`}
            />
            <span className="text-xs text-[#59685d] font-mono">4</span>
          </div>

          {/* Dot 2 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-5 h-5 rounded-full border-2 border-[#3155E7] flex items-center justify-center transition-all ${
                raisedDots.includes(2) ? "bg-[#3155E7]" : "bg-[#fffefa]"
              }`}
            />
            <span className="text-xs text-[#59685d] font-mono">2</span>
          </div>

          {/* Dot 5 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-5 h-5 rounded-full border-2 border-[#3155E7] flex items-center justify-center transition-all ${
                raisedDots.includes(5) ? "bg-[#3155E7]" : "bg-[#fffefa]"
              }`}
            />
            <span className="text-xs text-[#59685d] font-mono">5</span>
          </div>

          {/* Dot 3 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-5 h-5 rounded-full border-2 border-[#3155E7] flex items-center justify-center transition-all ${
                raisedDots.includes(3) ? "bg-[#3155E7]" : "bg-[#fffefa]"
              }`}
            />
            <span className="text-xs text-[#59685d] font-mono">3</span>
          </div>

          {/* Dot 6 */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-5 h-5 rounded-full border-2 border-[#3155E7] flex items-center justify-center transition-all ${
                raisedDots.includes(6) ? "bg-[#3155E7]" : "bg-[#fffefa]"
              }`}
            />
            <span className="text-xs text-[#59685d] font-mono">6</span>
          </div>
        </div>

        {/* Tactile legend */}
        <div className="text-xs text-[#4b5750] space-y-1">
          <p className="font-semibold text-[#202522]">Dot Configuration</p>
          <p>
            Standard 6-dot matrix standard. Filled circles indicate raised embossed dots.
          </p>
          <p className="text-[11px] text-[#59685d] pt-1">
            Raised: {raisedDots.length > 0 ? raisedDots.join(", ") : "None (empty cell)"}
          </p>
        </div>
      </div>
    </div>
  );
};
