# BrailleBridge AI

> **Speak. Understand. Read. Learn independently.**

Voice-first multilingual accessibility workspace for low-vision students. Features English UEB and Bharati Braille translation (Hindi, Kannada, Tamil, Bengali), handwritten PDF OCR, grounded study Q&A, notice analysis, Braille games, study planner, script vaults, and colorblind-safe AAA navigation.

---

## Key Features

### 1. Personalized Dashboard & One-Time Student Login
- **Persistent One-Time Sign In**: Create an account or sign in once; session tokens remember your profile seamlessly across page reloads and restarts.
- **Profile Management**: Update your display name and email directly from the Dashboard while keeping your email private from the welcome greeting.
- **Progress & Saved Vault**: Inspect Braille accuracy, learning streaks, study timetable completion, saved study notes, and analyzed college notices in one place, with spoken summaries via **Read My Progress**.

### 2. Braille Translation Studio & Script Knowledge Vault
- **Official Braille Standards**:
  - English Unified English Braille (UEB Grade 1 & Grade 2)
  - Bharati Braille (Hindi Devanagari, Kannada, Tamil, Bengali)
- **Interactive 6-Dot Cell Inspector & .BRF Export**: Inspect exact raised dot numbers (`dots 1-3`, etc.), use the physical **Perkins 6-Key Simulator** (`S-D-F` / `J-K-L`), or download `.BRF` files for Braille embossers.
- **Script Knowledge Vault**: Browse, search/voice-filter, bookmark, hear native pronunciation, hear raised dot breakdowns, and jump straight into practice for all 5 scripts.

### 3. Study Companion with Handwritten & Printed OCR
- **Multi-Format Extraction**: Supports `.pdf`, `.txt`, `.md`, `.csv`, and `.png`/`.jpg` up to 15 MB. Automatically applies high-DPI canvas enhancement and ink-contrast preprocessing for scanned and handwritten PDFs/images.
- **Intelligent Audio Reader**: Play, Pause, Resume, Stop, and speed controls (`0.8x`–`1.5x`) with natural punctuation pauses (`Smart Pauses` or `Exact Punctuation`) and contextual technical symbol speech.
- **Grounded Q&A & Practice Quizzes**: Answers questions and explains difficult concepts strictly from uploaded material with citation checks, plus keyboard-accessible quizzes.

### 4. Braille Learning Games & Academy
- Includes **Dot Detective**, **Hear It, Spell It**, **Pattern Builder** (`1`–`6` dot keys), **Memory Practice**, and **Language Bridge**, paired with **"Explain My Mistake"** missing/extra dot diagnostics.

### 5. College Notice & Form Assistant
- Parses university circulars and scholarship notices into critical deadlines, eligibility rules, required documents, actionable steps, multilingual audio briefings, and offline `.ics` calendar exports.

### 6. Study Planner & Timetable
- Interactive timetable with real-time scheduling conflict detection, voice dictation for adding sessions, `Today` / `Upcoming` / `Completed` tabs, audio agenda briefings, and `.ics` calendar downloads.

### 7. Voice-First Agent (`Alt + V` / `Alt + Q`)
- Multi-step task planner supporting compound commands (e.g., *"Switch to Kannada and open Kannada script vault"*), multilingual speech recognition/TTS (`en`, `hi`, `kn`, `ta`, `bn`), safety confirmation prompts before schedule writes, undo support, and document-grounded guidance.

---

## Accessibility, Error Resilience & Design Standards

- **Typography**: Locally bundled **Atkinson Hyperlegible** paired with adjustable root scaling (`90%`–`150%`).
- **Themes & Colorblind Support**: Warm high-legibility parchment palette, WCAG 2.1 AAA **High Contrast** dark mode, plus selectable **Color Vision Deficiency** modes (`Standard`, `Red-Green Safe`, `Blue-Yellow Safe`, `Monochrome Safe`).
- **Universal Spacebar Voice Control**: Press `Space` outside inputs/buttons on any view to start or pause contextual voice reading; press `Esc` to silence audio immediately.
- **Graceful Fallbacks**: Root and per-view React `ErrorBoundary` components recover smoothly from runtime issues with spoken guidance.
- **Keyboard Shortcuts**:
  - `Alt + 1`..`8` → Jump directly across modules (`Alt + D` / `Alt + 9` for Dashboard)
  - `Alt + V` / `Alt + Q` → Open Voice Agent
  - `Space` → Start / Pause contextual page reading
  - `Esc` → Silence speech immediately

---

## Local Setup & Development

### Prerequisites
- Node.js 18+

### 1. Clone & Install
```bash
git clone https://github.com/jagrutit303-hash/Braille-Bridge-AI.git
cd Braille-Bridge-AI
npm install
```

### 2. Configure Environment (Optional)
```bash
cp .env.example .env
# Optional: configure SUPABASE_URL / SUPABASE_ANON_KEY or HUGGINGFACE_API_KEY
# Works seamlessly out of the box with durable local storage & deterministic fallbacks
```

### 3. Build & Run
```bash
npm run build
npm run dev
```
Open **http://localhost:3000** in your browser.

### 4. Verify TypeScript & Tests
```bash
npm run lint
npm test
```
Runs `tsc --noEmit` and the **102-test** automated verification suite covering Braille tables, Script Knowledge Vault, handwritten OCR helpers, multi-step agent planning, intelligent speech punctuation, grounded Q&A, study planning, and `.ics` generation.

---

## License

MIT License.
