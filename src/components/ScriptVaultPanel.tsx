import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Search, Star, Volume2, ArrowUpRight, Sparkles } from "lucide-react";
import {
  SCRIPT_VAULT_LANGUAGES,
  ScriptVaultKey,
  ScriptVaultEntry,
  getScriptKnowledgeVault,
} from "../services/brailleService";
import { speakText } from "../services/speechService";
import { fetchVaultBookmarks, saveVaultBookmarks } from "../services/authService";
import { VoiceDictationButton } from "./VoiceDictationButton";

interface ScriptVaultPanelProps {
  initialScript?: ScriptVaultKey;
  onPracticeSymbol?: (text: string, tableId: string) => void;
  compact?: boolean;
}

const SCRIPT_TO_TABLE_ID: Record<ScriptVaultKey, string> = {
  "en-ueb": "en-ueb-g1",
  "hi-in": "hi-in-g1",
  "kn-in": "kn-in-g1",
  "ta-in": "ta-in-g1",
  "bn-in": "bn-in-g1",
};

export function ScriptVaultPanel({
  initialScript = "en-ueb",
  onPracticeSymbol,
  compact = false,
}: ScriptVaultPanelProps) {
  const [activeScript, setActiveScript] = useState<ScriptVaultKey>(initialScript);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);

  useEffect(() => {
    setActiveScript(initialScript);
  }, [initialScript]);

  useEffect(() => {
    let cancelled = false;
    fetchVaultBookmarks().then((items) => {
      if (!cancelled) setBookmarks(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const meta = useMemo(
    () =>
      SCRIPT_VAULT_LANGUAGES.find((s) => s.key === activeScript) ||
      SCRIPT_VAULT_LANGUAGES[0],
    [activeScript]
  );

  const entries = useMemo(() => getScriptKnowledgeVault(activeScript), [activeScript]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(entries.map((e) => e.category)));
    return ["All", ...cats];
  }, [entries]);

  useEffect(() => {
    if (!categories.includes(categoryFilter)) {
      setCategoryFilter("All");
    }
  }, [categories, categoryFilter]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (categoryFilter !== "All" && entry.category !== categoryFilter) return false;
      if (onlyBookmarked && !bookmarks.includes(entry.id)) return false;
      if (!q) return true;
      return (
        entry.symbol.toLowerCase().includes(q) ||
        entry.phonetic.toLowerCase().includes(q) ||
        entry.dotsLabel.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q) ||
        entry.braille.includes(q)
      );
    });
  }, [entries, categoryFilter, searchQuery, onlyBookmarked, bookmarks]);

  const scriptBookmarkCount = useMemo(
    () => entries.filter((e) => bookmarks.includes(e.id)).length,
    [entries, bookmarks]
  );

  const toggleBookmark = async (entryId: string) => {
    const next = bookmarks.includes(entryId)
      ? bookmarks.filter((id) => id !== entryId)
      : [...bookmarks, entryId];
    setBookmarks(next);
    await saveVaultBookmarks(next);
  };

  const handleSpeakNative = (entry: ScriptVaultEntry) => {
    const textToSpeak =
      entry.scriptKey === "en-ueb"
        ? `${entry.phonetic}. ${entry.dotDescription}.`
        : entry.symbol;
    speakText(textToSpeak, { lang: entry.speakLang });
  };

  const handleSpeakDots = (entry: ScriptVaultEntry) => {
    speakText(
      `${entry.symbol} (${entry.phonetic}). ${entry.dotsLabel}. ${entry.dotDescription}. ${entry.usageTip}`,
      { lang: "en-US" }
    );
  };

  return (
    <section
      aria-label="Script Knowledge Vault"
      className="bg-[#fffefa] border border-[#d8d7d0] rounded-2xl p-5 sm:p-6 shadow-sm space-y-5"
    >
      {/* Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e5e3db] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#3155E7]">
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            <span>Script Knowledge Vault</span>
            <span className="px-2 py-0.5 rounded-full bg-[#e4e8fb] text-[#2847cf] text-[11px]">
              {scriptBookmarkCount}/{entries.length} Mastered
            </span>
          </div>
          <h3 className="text-xl font-bold text-[#1b211d]">
            {meta.label} — {meta.standard}
          </h3>
          <p className="text-sm text-[#4e5b52]">{meta.summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              speakText(
                `${meta.label} Knowledge Vault. ${meta.summary} Showing ${filteredEntries.length} symbols. ${scriptBookmarkCount} bookmarked for revision.`,
                { lang: "en-US" }
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#e4e8fb] text-[#2847cf] hover:bg-[#d5def9] border border-[#c7d1f7] min-h-[40px]"
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            Read Vault Overview
          </button>
          <button
            type="button"
            onClick={() => setOnlyBookmarked((v) => !v)}
            aria-pressed={onlyBookmarked}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border min-h-[40px] transition ${
              onlyBookmarked
                ? "bg-[#fef7e6] text-[#795b19] border-[#c8a248]"
                : "bg-[#f8f7f2] text-[#3d4841] border-[#d8d7d0] hover:bg-[#eeece5]"
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${onlyBookmarked ? "fill-current" : ""}`}
              aria-hidden="true"
            />
            {onlyBookmarked ? "Showing Mastered" : `Saved (${bookmarks.length})`}
          </button>
        </div>
      </div>

      {/* Script Switcher Tabs */}
      <div
        role="tablist"
        aria-label="Choose script to inspect"
        className="flex flex-wrap gap-2"
      >
        {SCRIPT_VAULT_LANGUAGES.map((lang) => {
          const active = activeScript === lang.key;
          return (
            <button
              key={lang.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setActiveScript(lang.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition min-h-[40px] ${
                active
                  ? "bg-[#3155E7] text-white border-[#2847cf] shadow-xs"
                  : "bg-[#f8f7f2] text-[#222824] border-[#d8d7d0] hover:bg-[#eeece5]"
              }`}
            >
              <span>{lang.nativeName}</span>
              <span className={`ml-1.5 font-normal ${active ? "text-white/90" : "text-[#59685d]"}`}>
                ({lang.label.split(" ")[0]})
              </span>
            </button>
          );
        })}
      </div>

      {/* Category & Search Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by symbol category">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              aria-pressed={categoryFilter === cat}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                categoryFilter === cat
                  ? "bg-[#202522] text-white border-[#202522]"
                  : "bg-white text-[#3d4841] border-[#d8d7d0] hover:bg-[#f2f0e8]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto lg:min-w-[280px]">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-[#59685d] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search character, phonetic (ka), or dots (1-3)…"
              aria-label="Search script vault"
              className="w-full pl-9 pr-3 py-2 bg-[#f8f7f2] border border-[#d8d7d0] rounded-lg text-sm text-[#1b211d]"
            />
          </div>
          <VoiceDictationButton
            placeholderLabel="Voice search"
            compact
            onTranscript={(spoken) => setSearchQuery(spoken)}
          />
        </div>
      </div>

      {/* Vault Entries Grid */}
      {filteredEntries.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-dashed border-[#d8d7d0] bg-[#f8f7f2] space-y-2">
          <p className="text-sm font-semibold text-[#3d4841]">
            No matching symbols found in {meta.label}.
          </p>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("All");
              setSearchQuery("");
              setOnlyBookmarked(false);
            }}
            className="text-xs font-bold text-[#3155E7] underline"
          >
            Reset vault filters
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-3 ${
            compact
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          }`}
        >
          {filteredEntries.map((entry) => {
            const isBookmarked = bookmarks.includes(entry.id);
            return (
              <article
                key={entry.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition ${
                  isBookmarked
                    ? "bg-[#e9f5ef]/70 border-[#b8dbc9]"
                    : "bg-[#f8f7f2] border-[#d8d7d0] hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl bg-white border border-[#d8d7d0] flex items-center justify-center text-2xl font-bold text-[#1b211d] shadow-2xs"
                      aria-label={`Script character ${entry.symbol}`}
                    >
                      {entry.symbol}
                    </div>
                    <div>
                      <div className="text-3xl font-mono leading-none text-[#2847cf]" aria-label={`Braille ${entry.dotsLabel}`}>
                        {entry.braille}
                      </div>
                      <span className="inline-block mt-1 text-[11px] font-bold uppercase tracking-wide text-[#4e5b52]">
                        {entry.category}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleBookmark(entry.id)}
                    aria-pressed={isBookmarked}
                    aria-label={isBookmarked ? `Unmark ${entry.symbol} mastered` : `Bookmark ${entry.symbol}`}
                    title={isBookmarked ? "Bookmarked as mastered" : "Bookmark symbol"}
                    className={`p-2 rounded-lg border transition min-w-[36px] min-h-[36px] flex items-center justify-center ${
                      isBookmarked
                        ? "bg-[#fef7e6] text-[#795b19] border-[#c8a248]"
                        : "bg-white text-[#59685d] border-[#d8d7d0] hover:bg-[#eeece5]"
                    }`}
                  >
                    <Star
                      className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#1b211d]">{entry.phonetic}</p>
                  <p className="text-xs font-mono font-semibold text-[#0f8872]">
                    {entry.dotsLabel}
                  </p>
                  <p className="text-xs text-[#4e5b52] leading-snug">{entry.usageTip}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#e5e3db]">
                  <button
                    type="button"
                    onClick={() => handleSpeakNative(entry)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-[#d8d7d0] text-[#1b211d] hover:bg-[#eeece5]"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#3155E7]" aria-hidden="true" />
                    Sound
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSpeakDots(entry)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#e4e8fb] border border-[#c7d1f7] text-[#2847cf] hover:bg-[#d5def9]"
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    Hear Dots
                  </button>
                  {onPracticeSymbol && (
                    <button
                      type="button"
                      onClick={() =>
                        onPracticeSymbol(entry.symbol, SCRIPT_TO_TABLE_ID[entry.scriptKey])
                      }
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-[#0f8872] bg-[#e9f5ef] border border-[#c2e4d3] hover:brightness-95"
                    >
                      Practice
                      <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
