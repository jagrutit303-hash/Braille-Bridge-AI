/**
 * Global Application Context Store
 * Allows the Voice Agent, Dashboard, and Views to share the currently active
 * study document, notice, or pending item to open across pages.
 */

export interface ActiveDocumentContext {
  filename: string;
  text: string;
  wordCount: number;
  method: string;
  updatedAt: number;
}

export interface ActiveNoticeContext {
  filename: string;
  text: string;
  summary: string;
  deadlinesCount: number;
  updatedAt: number;
}

export interface PendingNoteLoad {
  id: string;
  title: string;
  filename: string;
  content: string;
  wordCount: number;
}

export interface PendingNoticeLoad {
  id: string;
  title: string;
  summary: string;
  deadlines: any[];
  eligibility: any[];
  requiredDocuments: any[];
  nextSteps: string[];
}

export interface PendingTranslatorLoad {
  text: string;
  tableId: string;
}

export interface PendingDashboardTab {
  tab: "all" | "notes" | "notices" | "schedule" | "games" | "scriptvault";
  scriptKey?: "en-ueb" | "hi-in" | "kn-in" | "ta-in" | "bn-in";
}

let activeDocument: ActiveDocumentContext | null = null;
let activeNotice: ActiveNoticeContext | null = null;
let pendingNote: PendingNoteLoad | null = null;
let pendingNotice: PendingNoticeLoad | null = null;
let pendingTranslator: PendingTranslatorLoad | null = null;
let pendingDashboardTab: PendingDashboardTab | null = null;

export function setActiveDocumentContext(doc: ActiveDocumentContext | null): void {
  activeDocument = doc;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("braillebridge-doc-change", { detail: doc }));
  }
}

export function getActiveDocumentContext(): ActiveDocumentContext | null {
  return activeDocument;
}

export function setActiveNoticeContext(notice: ActiveNoticeContext | null): void {
  activeNotice = notice;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("braillebridge-notice-change", { detail: notice }));
  }
}

export function getActiveNoticeContext(): ActiveNoticeContext | null {
  return activeNotice;
}

export function setPendingNoteLoad(note: PendingNoteLoad | null): void {
  pendingNote = note;
}

export function consumePendingNoteLoad(): PendingNoteLoad | null {
  const n = pendingNote;
  pendingNote = null;
  return n;
}

export function setPendingNoticeLoad(notice: PendingNoticeLoad | null): void {
  pendingNotice = notice;
}

export function consumePendingNoticeLoad(): PendingNoticeLoad | null {
  const n = pendingNotice;
  pendingNotice = null;
  return n;
}

export function setPendingTranslatorLoad(item: PendingTranslatorLoad | null): void {
  pendingTranslator = item;
  if (item && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("braillebridge-translator-load", { detail: item }));
  }
}

export function consumePendingTranslatorLoad(): PendingTranslatorLoad | null {
  const item = pendingTranslator;
  pendingTranslator = null;
  return item;
}

export function setPendingDashboardTab(target: PendingDashboardTab | null): void {
  pendingDashboardTab = target;
  if (target && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("braillebridge-dashboard-tab", { detail: target }));
  }
}

export function consumePendingDashboardTab(): PendingDashboardTab | null {
  const t = pendingDashboardTab;
  pendingDashboardTab = null;
  return t;
}
