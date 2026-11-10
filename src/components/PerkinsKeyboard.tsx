import React, { useState, useEffect, useCallback } from "react";
import { brailleFromDots, describeBrailleDots } from "../services/brailleService";
import { playEarcon, speakText } from "../services/speechService";

interface PerkinsKeyboardProps {
  onInsertBraille: (brailleChar: string) => void;
  onBackspace: () => void;
}

export const PerkinsKeyboard: React.FC<PerkinsKeyboardProps> = ({
  onInsertBraille,
  onBackspace,
}) => {
  const [activeDots, setActiveDots] = useState<number[]>([]);

  const toggleDot = (dotNum: number) => {
    const isNowActive = !activeDots.includes(dotNum);
    playEarcon(isNowActive ? "start" : "stop");

    setActiveDots((prev) => {
      const updated = isNowActive ? [...prev, dotNum] : prev.filter((d) => d !== dotNum);
      const desc = updated.length > 0 ? describeBrailleDots(brailleFromDots(updated)) : "No dots";
      speakText(`Dot ${dotNum} ${isNowActive ? "raised" : "lowered"}. Current: ${desc}`);
      return updated;
    });
  };

  const commitCell = useCallback(() => {
    if (activeDots.length === 0) {
      onInsertBraille("⠀"); // Empty cell / space
      playEarcon("success");
      speakText("Inserted empty cell space.");
    } else {
      const char = brailleFromDots(activeDots);
      const desc = describeBrailleDots(char);
      onInsertBraille(char);
      playEarcon("success");
      speakText(`Inserted cell ${char}, ${desc}.`);
      setActiveDots([]);
    }
  }, [activeDots, onInsertBraille]);

  const insertSpace = () => {
    onInsertBraille(" ");
    playEarcon("stop");
    speakText("Space");
    setActiveDots([]);
  };

  // Keyboard chord listener (keys: S, D, F for dots 3, 2, 1; J, K, L for dots 4, 5, 6; Space/Enter to commit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in standard textarea or input
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        toggleDot(1);
      } else if (key === "d") {
        e.preventDefault();
        toggleDot(2);
      } else if (key === "s") {
        e.preventDefault();
        toggleDot(3);
      } else if (key === "j") {
        e.preventDefault();
        toggleDot(4);
      } else if (key === "k") {
        e.preventDefault();
        toggleDot(5);
      } else if (key === "l") {
        e.preventDefault();
        toggleDot(6);
      } else if (key === "enter") {
        e.preventDefault();
        commitCell();
      } else if (key === " ") {
        e.preventDefault();
        if (activeDots.length > 0) {
          commitCell();
        } else {
          insertSpace();
        }
      } else if (key === "backspace") {
        e.preventDefault();
        if (activeDots.length > 0) {
          setActiveDots([]);
          speakText("Cleared active dots.");
        } else {
          onBackspace();
          speakText("Backspace");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDots, commitCell, onBackspace]);

  const previewChar = activeDots.length > 0 ? brailleFromDots(activeDots) : "⠀";
  const desc = activeDots.length > 0 ? describeBrailleDots(previewChar) : "No dots selected";

  return (
    <div
      data-perkins-active="true"
      className="p-4 bg-[#eeece5] border border-[#d8d7d0] rounded-md my-3"
      role="region"
      aria-label="Perkins 6-key Braille input keyboard"
    >
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#d8d7d0]">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#4b5750]">
            Perkins 6-Key Simulator
          </span>
          <p className="text-xs text-[#59685d]">
            Physical keys <kbd className="font-mono bg-white px-1 border rounded">S-D-F</kbd> (dots 3-2-1) and{" "}
            <kbd className="font-mono bg-white px-1 border rounded">J-K-L</kbd> (dots 4-5-6), or buttons below.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-2xl font-mono text-[#3155E7] select-none">{previewChar}</span>
            <p className="text-[11px] text-[#4b5750]">{desc}</p>
          </div>
          <button
            onClick={commitCell}
            disabled={activeDots.length === 0}
            className="px-3 py-1.5 bg-[#3155E7] text-white text-xs font-bold rounded hover:bg-[#233fbe] disabled:opacity-40 transition-colors"
          >
            Insert Cell ↵
          </button>
        </div>
      </div>

      {/* 6 Perkins keys layout */}
      <div className="grid grid-cols-7 gap-2 max-w-lg mx-auto py-2">
        {/* Dot 3 (Key S) */}
        <button
          onClick={() => toggleDot(3)}
          className={`h-16 rounded border flex flex-col items-center justify-center font-mono transition-all ${
            activeDots.includes(3)
              ? "bg-[#3155E7] text-white border-[#3155E7] shadow-inner"
              : "bg-[#fffefa] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7]"
          }`}
          aria-label="Dot 3 (Key S)"
          aria-pressed={activeDots.includes(3)}
        >
          <span className="text-xs font-sans font-bold">Dot 3</span>
          <span className="text-[10px] text-[#59685d]">S</span>
        </button>

        {/* Dot 2 (Key D) */}
        <button
          onClick={() => toggleDot(2)}
          className={`h-16 rounded border flex flex-col items-center justify-center font-mono transition-all ${
            activeDots.includes(2)
              ? "bg-[#3155E7] text-white border-[#3155E7] shadow-inner"
              : "bg-[#fffefa] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7]"
          }`}
          aria-label="Dot 2 (Key D)"
          aria-pressed={activeDots.includes(2)}
        >
          <span className="text-xs font-sans font-bold">Dot 2</span>
          <span className="text-[10px] text-[#59685d]">D</span>
        </button>

        {/* Dot 1 (Key F) */}
        <button
          onClick={() => toggleDot(1)}
          className={`h-16 rounded border flex flex-col items-center justify-center font-mono transition-all ${
            activeDots.includes(1)
              ? "bg-[#3155E7] text-white border-[#3155E7] shadow-inner"
              : "bg-[#fffefa] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7]"
          }`}
          aria-label="Dot 1 (Key F)"
          aria-pressed={activeDots.includes(1)}
        >
          <span className="text-xs font-sans font-bold">Dot 1</span>
          <span className="text-[10px] text-[#59685d]">F</span>
        </button>

        {/* Space Bar Center */}
        <button
          onClick={insertSpace}
          className="h-16 rounded border bg-[#fffefa] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7] flex flex-col items-center justify-center transition-all"
          aria-label="Space bar"
        >
          <span className="text-xs font-bold">Space</span>
          <span className="text-[10px] text-[#59685d]">␣</span>
        </button>

        {/* Dot 4 (Key J) */}
        <button
          onClick={() => toggleDot(4)}
          className={`h-16 rounded border flex flex-col items-center justify-center font-mono transition-all ${
            activeDots.includes(4)
              ? "bg-[#3155E7] text-white border-[#3155E7] shadow-inner"
              : "bg-[#fffefa] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7]"
          }`}
          aria-label="Dot 4 (Key J)"
          aria-pressed={activeDots.includes(4)}
        >
          <span className="text-xs font-sans font-bold">Dot 4</span>
          <span className="text-[10px] text-[#59685d]">J</span>
        </button>

        {/* Dot 5 (Key K) */}
        <button
          onClick={() => toggleDot(5)}
          className={`h-16 rounded border flex flex-col items-center justify-center font-mono transition-all ${
            activeDots.includes(5)
              ? "bg-[#3155E7] text-white border-[#3155E7] shadow-inner"
              : "bg-[#fffefa] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7]"
          }`}
          aria-label="Dot 5 (Key K)"
          aria-pressed={activeDots.includes(5)}
        >
          <span className="text-xs font-sans font-bold">Dot 5</span>
          <span className="text-[10px] text-[#59685d]">K</span>
        </button>

        {/* Dot 6 (Key L) */}
        <button
          onClick={() => toggleDot(6)}
          className={`h-16 rounded border flex flex-col items-center justify-center font-mono transition-all ${
            activeDots.includes(6)
              ? "bg-[#3155E7] text-white border-[#3155E7] shadow-inner"
              : "bg-[#fffefa] text-[#202522] border-[#d8d7d0] hover:border-[#3155E7]"
          }`}
          aria-label="Dot 6 (Key L)"
          aria-pressed={activeDots.includes(6)}
        >
          <span className="text-xs font-sans font-bold">Dot 6</span>
          <span className="text-[10px] text-[#59685d]">L</span>
        </button>
      </div>
    </div>
  );
};
