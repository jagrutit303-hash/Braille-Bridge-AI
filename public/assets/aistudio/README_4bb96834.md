# BrailleBridge AI

> **Speak. Understand. Read. Access independently.**

BrailleBridge AI is an open-source, voice-first accessibility web application designed for blind and visually impaired users. It provides text-to-Braille translation, text-to-speech reading, document extraction, and transparent multi-step accessibility workflows — all without requiring a paid API key.

Built as a hackathon prototype. All processing is rule-based and transparent.

---

## Features

| Feature | Details |
|---------|---------|
| **Braille Translation** | Translates text to Unicode Braille with the Liblouis English UEB Grade 1 or Grade 2 table when the native library and tables are installed |
| **Text-to-Speech** | Browser-native TTS via the Web Speech API — no API key required |
| **Microphone Input** | Optional browser speech recognition (Chrome/Edge) with keyboard fallback |
| **Document Reader** | Extracts text from `.txt`, `.md`, `.csv`, and text-based `.pdf` files |
| **Date/Deadline Finder** | Regex-based extraction of candidate dates with source passages |
| **Rule-based Summary** | Extractive (first-sentence) summary — clearly labelled, not AI-generated |
| **Multi-step Workflow** | "Read document → find deadlines" pipeline with honest result reporting |
| **Accessible UI** | ARIA labels, visible focus indicators, keyboard navigation, live regions |

---

## Prerequisites

- Python 3.9 or later
- pip
- A modern browser for TTS and optional speech recognition (Chrome or Edge recommended)

### Optional: Liblouis Braille translation

Braille translation is enabled only when the Liblouis native library and its
English UEB tables (`en-ueb-g1.ctb`, `en-ueb-g2.ctb`, and `unicode.dis`) are
installed. There is no handwritten translation fallback. If Liblouis or a table
is missing, translation is disabled and the app reports the setup limitation.

Download an official build from https://liblouis.io/downloads/ or install it
through your operating system's package manager. Configure the native library
and table directory before starting the app:

**Windows PowerShell:**
```powershell
$env:LIBLOUIS_LIBRARY = "C:\path\to\liblouis\bin\liblouis.dll"
$env:LOUIS_TABLEPATH = "C:\path\to\liblouis\share\liblouis\tables"
streamlit run app.py
```

**Linux/macOS:**
```bash
export LIBLOUIS_LIBRARY="/path/to/liblouis/lib/liblouis.so" # use liblouis.dylib on macOS
export LOUIS_TABLEPATH="/path/to/liblouis/share/liblouis/tables"
streamlit run app.py
```

The service calls Liblouis' documented native API directly. The PyPI package
named `louis` is unrelated and must not be installed as a substitute.

### Optional: OCR for scanned PDFs

OCR requires both Python wrappers and native command-line tools:

```bash
# Install pytesseract, pdf2image, and Pillow in the active environment.
pip install pytesseract pdf2image Pillow
```

Install Tesseract OCR and Poppler using your OS package manager or official
Windows builds. `pdfinfo` plus either `pdftoppm` or `pdftocairo` must be on
`PATH`, or set `POPPLER_PATH` to their directory. If Tesseract is not on `PATH`,
set `TESSERACT_CMD` to its executable. The app reports OCR as available only
when the Python packages and native executables are all detected.

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/braillebridge-ai.git
cd braillebridge-ai

# 2. Create a virtual environment (recommended)
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 3. Install required dependencies
pip install -r requirements.txt
```

---

## Running the Application

```bash
streamlit run app.py
```

The application will open at **http://localhost:8501** in your default browser.

---

## Running Tests

```bash
pytest tests/ -v
```

Expected output will show which tests passed, skipped (e.g., PDF tests when pypdf is absent), or failed.

To run a specific test file:
```bash
pytest tests/test_braille.py -v
pytest tests/test_documents.py -v
pytest tests/test_workflow.py -v
```

---

## Project Structure

```
braillebridge-ai/
├── app.py                  # Main Streamlit application (5 pages)
├── braille_service.py      # Braille translation through Liblouis native tables
├── document_service.py     # PDF and text file extraction, date detection
├── speech_service.py       # Browser TTS and microphone HTML/JS helpers
├── workflow.py             # Rule-based command router and multi-step workflows
├── requirements.txt        # Python dependencies
├── README.md               # This file
└── tests/
    ├── __init__.py
    ├── test_braille.py     # Braille service tests
    ├── test_documents.py   # Document extraction tests
    └── test_workflow.py    # Workflow routing and multi-step tests
```

---

## Deployment — Streamlit Community Cloud

1. Push your code to a public GitHub repository.
2. Go to https://share.streamlit.io and sign in with GitHub.
3. Click **New app** → select your repo → set `app.py` as the main file.
4. Click **Deploy**.

The free Streamlit Community Cloud tier is sufficient for this prototype.

> **Note:** Liblouis and Tesseract system binaries are not included on Streamlit Cloud by default. Without a configured Liblouis installation, Braille translation is unavailable; the app does not substitute an educational mapping.

---

## Pages

### Home
- Minimal text-to-Braille workspace with Liblouis-backed output
- Copy, download, and listen to the original text
- Shortcut to voice tools; text is not stored as a recent action

### ⠿ Braille Translator
- Language / grade selector
- Text input and Braille output
- Download Braille as `.txt`
- Read original text aloud
- Clear error reporting for unsupported characters

### 🎙 Voice Assistant
- Browser microphone input (Chrome/Edge)
- Editable browser transcript and keyboard text input
- One-click actions: Read Aloud, Translate to Braille, Summarize, Find Dates

### 📄 Document Reader
- Upload `.txt`, `.md`, `.csv`, `.pdf`
- Extracted text preview
- Read aloud, translate, summarize, and find deadlines in one click
- OCR status indicator

### ℹ️ Accessibility & About
- Feature list and engine status
- Important notices (non-tactile Braille, privacy)
- Keyboard navigation guide
- Installation instructions

---

## Known Limitations

- **Braille is visual only.** Displayed Unicode Braille is not tactile. A refreshable Braille display or embosser is required for physical reading.
- **Liblouis is required for translation.** If the native library or requested table is unavailable, the app refuses to produce Braille rather than returning a handwritten approximation.
- **No generative AI.** Summarisation returns the first *n* sentences (extractive), not a generated summary.
- **OCR results may contain errors.** Always verify against the original source document.
- **Speech recognition is browser-dependent.** Chrome and Edge have the best support; Firefox and Safari may not support `webkitSpeechRecognition`.
- **Scanned PDFs require optional OCR.** Uploaded PDFs with no embedded text layer will show a warning.
- **No accessibility audit performed.** The UI targets WCAG 2.1 AA but has not been formally audited. Test with your screen reader.

---

## Privacy

- All document and text processing occurs **locally on your machine**.
- No data is transmitted to external servers by BrailleBridge AI.
- Browser speech recognition (Web Speech API) may send audio to the browser vendor (e.g., Google for Chrome). Review your browser's privacy policy if this is a concern.
- No analytics or telemetry is collected.

---

## Accessibility Design

- All interactive elements have ARIA labels.
- Status messages use `aria-live` regions for screen reader announcements.
- Focus indicators are visible (indigo outline).
- Full keyboard navigation via `Tab` / `Enter` / `Space`.
- Errors and warnings are communicated through text, not colour alone.
- Original text is always preserved alongside Braille output.

---

## Contributing

Pull requests welcome. Please open an issue first for significant changes.

---

## Licence

MIT Licence — see `LICENSE` for details.
