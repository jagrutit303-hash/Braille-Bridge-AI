"""
app.py
------
BrailleBridge AI — main Streamlit application.

Pages:
  A. Home Dashboard
  B. Braille Translator
  C. Voice Assistant
  D. Document Reader
  E. Accessibility & About

Run with:  streamlit run app.py
"""

from __future__ import annotations

import base64
import html as html_lib
import io
import streamlit as st
from pathlib import Path

import braille_service as bs
import document_service as ds
import speech_service as ss
import workflow as wf


def _render_html_component(html: str, height: int) -> None:
    """Render trusted browser speech controls in an isolated Streamlit iframe."""
    encoded_html = base64.b64encode(html.encode("utf-8")).decode("ascii")
    st.iframe(
        f"data:text/html;base64,{encoded_html}",
        height=height,
        tab_index=0,
        alt="Browser speech controls",
    )


def _go_to_voice_assistant() -> None:
    st.session_state["pending_navigation"] = "Voice assistant"


def _clear_braille_input() -> None:
    st.session_state["bt_input"] = ""
    st.session_state.pop("bt_result", None)
    st.session_state.pop("bt_tts_trigger", None)


def _render_signal(state: str, message: str) -> None:
        """Render the six-dot status instrument with an equivalent live message."""
        st.markdown(
                f'<div class="signal-row" role="status" aria-live="polite" aria-atomic="true">'
                f'<span class="signal-mark signal-{state}" aria-hidden="true">'
                f'{"".join("<i></i>" for _ in range(6))}</span>'
                f'<span>{message}</span></div>',
                unsafe_allow_html=True,
        )


def _render_copy_button(text: str, key: str) -> None:
        """Provide an isolated, keyboard-operable copy action for Braille output."""
        encoded_text = base64.b64encode(text.encode("utf-8")).decode("ascii")
        button_id = f"copy-braille-{key}"
        status_id = f"copy-status-{key}"
        copy_html = f"""
<div class="copy-control">
    <button id="{button_id}" type="button" style="min-height:42px;padding:9px 15px;border:1px solid #3155e7;border-radius:4px;background:#fffefa;color:#243fa7;font:700 16px Arial,sans-serif;cursor:pointer">Copy Braille</button>
    <span id="{status_id}" role="status" aria-live="polite" style="color:#4b5750;font:14px Arial,sans-serif"></span>
</div>
<script>
(function () {{
    const content = new TextDecoder().decode(Uint8Array.from(atob("{encoded_text}"), c => c.charCodeAt(0)));
    const button = document.getElementById("{button_id}");
    const status = document.getElementById("{status_id}");
    button.addEventListener("click", async () => {{
        try {{
            await navigator.clipboard.writeText(content);
            status.textContent = "Braille copied.";
        }} catch (error) {{
            const field = document.createElement("textarea");
            field.value = content;
            field.setAttribute("readonly", "");
            document.body.appendChild(field);
            field.select();
            const copied = document.execCommand("copy");
            field.remove();
            status.textContent = copied ? "Braille copied." : "Copy failed. Select the Braille output to copy it.";
        }}
    }});
}})();
</script>
"""
        _render_html_component(copy_html, height=58)


# ---------------------------------------------------------------------------
# Page config (must be first Streamlit call)
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="BrailleBridge AI",
    page_icon="B",
    layout="wide",
    initial_sidebar_state="auto",
    menu_items={
        "Get Help": "https://github.com/braillebridge-ai/braillebridge-ai",
        "Report a bug": "https://github.com/braillebridge-ai/braillebridge-ai/issues",
        "About": "BrailleBridge AI — Accessibility tool for the blind and visually impaired.",
    },
)

# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=DM+Serif+Display&display=swap');

  /* ── Root variables ── */
  :root {
        --canvas: #101917;
        --surface: #182321;
        --surface-raised: #202d29;
        --line: #35443e;
        --text: #f2f4e9;
        --muted: #b9c5bb;
        --quiet: #87968c;
        --teal: #82dfc2;
        --teal-strong: #267d68;
        --coral: #ff987d;
        --amber: #f2c46d;
        --danger: #ff8e91;
  }

    html, body, [class*="css"] {
        font-family: 'Atkinson Hyperlegible', 'Segoe UI', sans-serif;
        color: var(--text);
  }
    .stApp {
        background-color: var(--canvas);
        background-image: linear-gradient(rgba(130, 223, 194, 0.025) 1px, transparent 1px),
                                            linear-gradient(90deg, rgba(130, 223, 194, 0.025) 1px, transparent 1px);
        background-size: 32px 32px;
    }
    [data-testid="stMainBlockContainer"] { max-width: 1320px; padding-top: 2.2rem; padding-bottom: 4rem; }
  #MainMenu, footer, header { visibility: hidden; }

  [data-testid="stSidebar"] {
        background: #151f1c;
        border-right: 1px solid var(--line);
  }
    [data-testid="stSidebar"] [data-testid="stRadio"] label {
        min-height: 44px;
        padding: 0.35rem 0.55rem;
        border-radius: 6px;
        color: var(--muted);
        font-size: 0.98rem;
        transition: background-color 160ms ease, color 160ms ease;
  }
    [data-testid="stSidebar"] [data-testid="stRadio"] label:hover { background: var(--surface-raised); color: var(--text); }
    [data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) {
        background: rgba(130, 223, 194, 0.13);
        color: var(--teal);
        font-weight: 700;
    }
    [data-testid="stSidebar"] [data-testid="stRadio"] input:focus-visible + div { outline: 3px solid var(--coral); outline-offset: 3px; }

  .bb-card {
        background: rgba(24, 35, 33, 0.96);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 1.25rem 1.4rem;
        margin-bottom: 1rem;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  }
  .bb-action-card {
        height: 100%;
        box-sizing: border-box;
        background: var(--surface);
        border: 1px solid var(--line);
        border-top: 3px solid var(--teal-strong);
        border-radius: 8px;
        padding: 1.1rem 1.2rem;
        text-align: left;
        transition: border-color 160ms ease, transform 160ms ease;
    cursor: default;
  }
    .bb-action-card:hover { border-color: var(--teal); transform: translateY(-2px); }
    .bb-action-card .icon { font-size: 1.75rem; margin-bottom: 0.65rem; }
    .bb-action-card h4 { margin: 0 0 0.35rem; font-size: 1.08rem; color: var(--text); }
    .bb-action-card p { margin: 0; font-size: 0.92rem; line-height: 1.5; color: var(--muted); }

  .bb-hero {
        background: linear-gradient(105deg, #263832 0%, #1a2924 58%, #3b3326 100%);
        border-radius: 8px;
        padding: 2.1rem 2.25rem;
        text-align: left;
        border: 1px solid #44534a;
        border-left: 5px solid var(--coral);
        margin-bottom: 1.6rem;
    position: relative;
    overflow: hidden;
  }
  .bb-logo {
        font-family: 'DM Serif Display', Georgia, serif;
        font-size: 2.5rem;
    font-weight: 700;
        color: var(--text);
        margin-bottom: 0.35rem;
  }
    .bb-tagline { font-size: 1.05rem; color: var(--muted); margin-bottom: 0; }

  .bb-section-title {
        font-family: 'DM Serif Display', Georgia, serif;
        font-size: 1.4rem;
    font-weight: 600;
        color: var(--text);
        margin: 1.4rem 0 0.8rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--line);
  }

  .bb-braille-output {
    font-family: 'Segoe UI', 'Noto Sans', monospace;
    font-size: 2rem;
    line-height: 1.8;
        color: var(--teal);
        background: #111b18;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 1rem 1.1rem;
        overflow-wrap: anywhere;
        min-height: 4.5rem;
  }

  .bb-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.7rem;
        border-radius: 4px;
        font-size: 0.82rem;
        font-weight: 700;
    margin: 0.25rem 0;
  }
    .bb-badge-success { background: rgba(130,223,194,0.12); color: var(--teal); border: 1px solid rgba(130,223,194,0.35); }
    .bb-badge-warning { background: rgba(242,196,109,0.12); color: var(--amber); border: 1px solid rgba(242,196,109,0.35); }
    .bb-badge-error { background: rgba(255,142,145,0.12); color: var(--danger); border: 1px solid rgba(255,142,145,0.35); }
    .bb-badge-info { background: rgba(130,223,194,0.12); color: var(--teal); border: 1px solid rgba(130,223,194,0.35); }

  .stTextArea textarea, .stTextInput input {
        background: #111b18 !important;
        border: 1px solid #52635a !important;
        border-radius: 6px !important;
        color: var(--text) !important;
        font-family: 'Atkinson Hyperlegible', 'Segoe UI', sans-serif !important;
  }
  .stTextArea textarea:focus, .stTextInput input:focus {
        border-color: var(--teal) !important;
        box-shadow: 0 0 0 3px rgba(130,223,194,0.2) !important;
        outline: 2px solid var(--teal) !important;
        outline-offset: 2px !important;
  }
    [data-baseweb="select"] > div {
        background: #111b18 !important;
        border-color: #52635a !important;
        color: var(--text) !important;
        border-radius: 6px !important;
  }

  .stButton > button {
        background: var(--teal) !important;
        color: #10201b !important;
        border: 1px solid var(--teal) !important;
        border-radius: 6px !important;
        min-height: 44px !important;
        font-weight: 700 !important;
        padding: 0.55rem 1rem !important;
        transition: background-color 160ms ease, transform 160ms ease !important;
        box-shadow: none !important;
  }
    .stButton > button:hover { background: #a4efd7 !important; border-color: #a4efd7 !important; transform: translateY(-1px) !important; }
    .stButton > button:active { transform: translateY(0) !important; }
  .stButton > button:focus-visible {
        outline: 3px solid var(--coral) !important;
    outline-offset: 2px !important;
  }
    .stDownloadButton > button { min-height: 44px !important; border-radius: 6px !important; }
    a { color: var(--teal); }
    a:focus-visible, summary:focus-visible, input:focus-visible, button:focus-visible {
        outline: 3px solid var(--coral) !important;
        outline-offset: 3px !important;
    }
    h1, h2, h3, h4 { color: var(--text); }
    h1, h2 { font-family: 'DM Serif Display', Georgia, serif !important; }
    [data-testid="stCaptionContainer"], .stMarkdown p { line-height: 1.6; }

  [data-testid="stFileUploader"] {
        border: 1px dashed #68786e !important;
        border-radius: 8px !important;
        background: rgba(24,35,33,0.72) !important;
  }
    .stAlert { border-radius: 6px !important; }
  .bb-skip-link {
    position: absolute; top: -40px; left: 0;
        background: var(--coral);
        color: #1a211e;
    padding: 0.5rem 1rem;
        border-radius: 0 0 4px 0;
    z-index: 9999;
    text-decoration: none;
        font-size: 1rem;
        font-weight: 700;
  }
  .bb-skip-link:focus { top: 0; }

  .bb-step {
    display: flex; align-items: flex-start; gap: 0.75rem;
    padding: 0.75rem;
        border-radius: 6px;
        background: var(--surface);
    margin-bottom: 0.5rem;
        border-left: 3px solid var(--teal);
  }
    .bb-step.success { border-left-color: var(--teal); }
    .bb-step.error { border-left-color: var(--danger); }
    .bb-step.warning { border-left-color: var(--amber); }

    @media (max-width: 768px) {
        [data-testid="stMainBlockContainer"] { padding: 1.2rem 1rem 3rem; }
        .bb-hero { padding: 1.35rem 1.1rem; margin-bottom: 1.2rem; }
        .bb-logo { font-size: 2rem; }
        .bb-tagline { font-size: 0.98rem; }
        .bb-action-card { padding: 1rem; }
        .bb-action-card .icon { font-size: 1.5rem; }
        .bb-braille-output { font-size: 1.55rem; padding: 0.8rem; }
        .bb-card { padding: 1rem; }
        .bb-section-title { margin-top: 1.1rem; }
        .stButton > button { width: 100%; }
  }
    @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
    }

    :root {
        --canvas: #F7F5EF;
        --surface: #fffefa;
        --surface-raised: #eeece5;
        --line: #d8d7d0;
        --text: #202522;
        --muted: #4b5750;
        --quiet: #59685d;
        --teal: #3155E7;
        --teal-strong: #3155E7;
        --coral: #202522;
        --amber: #795b19;
        --danger: #9b302d;
    }

    html, body, [class*="css"] { color: var(--text); font-size: 16px; }
    .stApp { background: var(--canvas); background-image: none; }
    [data-testid="stMainBlockContainer"] { max-width: 1180px; padding: 2rem 3rem 5rem; }
    [data-testid="stSidebar"] { background: #f0eee7; border-right: 1px solid var(--line); }
    [data-testid="stSidebar"] [data-testid="stRadio"] label {
        min-height: 46px; border-radius: 4px; color: var(--muted); font-size: 1rem;
    }
    [data-testid="stSidebar"] [data-testid="stRadio"] label:hover { color: var(--text); background: #e7e5dd; }
    [data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) {
        color: var(--teal); background: #e4e8fb; font-weight: 700;
    }
    [data-testid="stSidebar"] input[type="radio"] { accent-color: #3155E7; }
    .bb-card, .bb-action-card {
        background: transparent; border: 0; border-radius: 0; box-shadow: none;
        padding: 0; margin-bottom: 1rem;
    }
    .bb-action-card { display: none; }
    .bb-hero {
        background: transparent; border: 0; border-bottom: 1px solid var(--line);
        border-radius: 0; padding: 0 0 1.25rem; margin: 0 0 2.5rem; overflow: visible;
    }
    .bb-logo { font-family: 'DM Serif Display', Georgia, serif; font-size: 1.55rem; color: var(--text); }
    .bb-tagline { color: var(--muted); font-size: 1rem; }
    .bb-section-title { font-family: 'Atkinson Hyperlegible', sans-serif; font-size: .85rem;
        font-weight: 700; color: var(--quiet); margin: 2rem 0 .75rem; border: 0;
        text-transform: uppercase; }
    h1, h2, h3, h4 { color: var(--text) !important; }
    h1 { font-size: 3.6rem !important; line-height: 1.08 !important; }
    h2, h3 { font-family: 'DM Serif Display', Georgia, serif !important; }
    [data-testid="stTextArea"] textarea, [data-testid="stTextInput"] input,
    .stTextArea textarea, .stTextInput input, [data-baseweb="select"] > div {
        background: var(--surface) !important; color: var(--text) !important;
        border: 1px solid #a6aaa2 !important; border-radius: 5px !important;
        font-family: 'Atkinson Hyperlegible', 'Segoe UI', sans-serif !important;
    }
    [data-testid="stTextArea"] textarea { background-color:#fffefa !important; color:#202522 !important; padding: 1rem !important; line-height: 1.65 !important; }
    [data-testid="stTextArea"] textarea::placeholder { color:#59685d !important; opacity:1 !important; }
    [data-testid="stTextArea"] textarea:focus, .stTextArea textarea:focus, .stTextInput input:focus {
        border-color: var(--teal) !important; box-shadow: 0 0 0 3px rgba(49,85,231,.18) !important;
    }
    .stButton > button, .stDownloadButton > button {
        min-height: 46px !important; padding: .65rem 1.15rem !important; border-radius: 4px !important;
        background: var(--teal) !important; color: white !important; border: 1px solid var(--teal) !important;
        font-weight: 700 !important; box-shadow: none !important; transition: background-color 180ms ease, transform 180ms ease !important;
    }
    .stButton > button:hover, .stDownloadButton > button:hover { background: #233fbe !important; transform: translateY(-1px) !important; }
    .stButton > button:disabled { background: #deded8 !important; border-color: #deded8 !important; color: #525a54 !important; }
    .stButton > button:focus-visible, .stDownloadButton > button:focus-visible,
    a:focus-visible, summary:focus-visible, input:focus-visible, button:focus-visible {
        outline: 3px solid #202522 !important; outline-offset: 3px !important;
    }
    [data-testid="stFileUploader"] { background: var(--surface) !important; border: 1px dashed #7c857d !important; border-radius: 5px !important; }
    .stAlert { border-radius: 4px !important; }
    .bb-braille-output {
        color: #202522; background: #fffefa; border: 1px solid var(--line); border-top: 3px solid var(--teal);
        border-radius: 4px; padding: 1.5rem; min-height: 7rem; font-size: 2.2rem; line-height: 1.75;
        animation: result-arrive 220ms ease-out both;
    }
    .bb-badge-info, .bb-badge-success { background: #e4e8fb; color: #243fa7; border-color: #aab8f3; }
    .bb-badge-warning { background: #f4ecd6; color: #59420e; border-color: #d6bd7e; }
    .bb-badge-error { background: #f6e2df; color: #762522; border-color: #d6a5a0; }
    .signal-row { display: flex; align-items: center; gap: .8rem; color: var(--muted); font-size: .95rem; margin: .65rem 0 1rem; }
    .signal-mark { display: inline-grid; grid-template-columns: repeat(3, 9px); gap: 5px; padding: 4px; }
    .signal-mark i { display: block; width: 9px; height: 9px; border: 1.5px solid var(--teal); border-radius: 50%; background: transparent; }
    .signal-success i { background: var(--teal); }
    .signal-listening i { animation: signal-pulse 1.2s ease-in-out infinite; }
    .signal-listening i:nth-child(2) { animation-delay: .12s; }
    .signal-listening i:nth-child(3) { animation-delay: .24s; }
    .signal-listening i:nth-child(4) { animation-delay: .36s; }
    .signal-listening i:nth-child(5) { animation-delay: .48s; }
    .signal-listening i:nth-child(6) { animation-delay: .6s; }
    .signal-processing i { animation: signal-wave 1s ease-in-out infinite; }
    .signal-processing i:nth-child(2), .signal-processing i:nth-child(5) { animation-delay: .1s; }
    .signal-processing i:nth-child(3), .signal-processing i:nth-child(6) { animation-delay: .2s; }
    .signal-error i { border-color: var(--danger); }
    .quiet-mark { display: inline-grid; grid-template-columns: repeat(3, 7px); gap: 4px; vertical-align: middle; margin-right: .5rem; }
    .quiet-mark i { width: 7px; height: 7px; border-radius: 50%; background: var(--teal); }
    .copy-control { display: flex; align-items: center; gap: .7rem; min-height: 48px; font-family: 'Atkinson Hyperlegible', sans-serif; }
    .copy-control button { min-height: 42px; padding: .55rem .95rem; border: 1px solid #3155E7; border-radius: 4px; background: #fffefa; color: #243fa7; font: 700 1rem 'Atkinson Hyperlegible', sans-serif; cursor: pointer; }
    .copy-control button:hover { background: #e4e8fb; }
    .copy-control button:focus-visible { outline: 3px solid #202522; outline-offset: 3px; }
    #copy-status { color: var(--muted); }
    .brand-lockup { display: flex; align-items: center; color: var(--text); font: 700 1.2rem 'DM Serif Display', Georgia, serif; margin: .35rem 0 .4rem; }
    .rail-note { color: var(--muted); font-size: .9rem; margin: 0 0 1.5rem; }
    .home-header { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding-bottom:1rem; border-bottom:1px solid var(--line); margin-bottom:2.4rem; }
    .eyebrow { color:#38483d; font-size:.88rem; font-weight:700; letter-spacing:.04em; margin:0 0 .65rem; }
    .home-header .eyebrow { margin:0; }
    .home-title { max-width:850px; margin:0 0 1rem !important; }
    .home-intro, .page-intro { max-width:690px; color:var(--muted); font-size:1.16rem; line-height:1.65; margin:0 0 2rem; }
    .output-note { margin:-.45rem 0 1rem; color:var(--muted); font-size:.95rem; }
    .first-use { display:flex; flex-wrap:wrap; gap:.45rem .8rem; border-top:1px solid var(--line); margin-top:3rem; padding-top:1rem; color:var(--muted); line-height:1.6; }
    .first-use strong { color:var(--text); }
    @keyframes signal-pulse { 0%,100% { transform: scale(.82); background: transparent; } 50% { transform: scale(1.1); background: var(--teal); } }
    @keyframes signal-wave { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); background: var(--teal); } }
    @keyframes result-arrive { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 760px) {
        [data-testid="stMainBlockContainer"] { padding: 1.3rem 1rem 3rem; }
        h1 { font-size: 2.55rem !important; }
        .home-header { align-items:flex-start; flex-direction:column; margin-bottom:1.8rem; }
        .home-title { font-size:2.55rem !important; }
        .home-intro, .page-intro { font-size:1.05rem; }
        .bb-braille-output { font-size: 1.6rem; padding: 1rem; }
        .stButton > button, .stDownloadButton > button { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation: none !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
    }
</style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# Sidebar navigation
# ---------------------------------------------------------------------------
if "pending_navigation" in st.session_state:
    st.session_state["page_navigation"] = st.session_state.pop("pending_navigation")

with st.sidebar:
    st.markdown("""
    <div class="brand-lockup">
      <span class="quiet-mark" role="img" aria-label="BrailleBridge six-dot mark"><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <span>BrailleBridge</span>
    </div>
    <p class="rail-note">Access, considered.</p>
    """, unsafe_allow_html=True)

    page = st.radio(
        "Navigate to",
        options=[
            "Home",
            "Braille translator",
            "Voice assistant",
            "Document reader",
            "Accessibility & about",
        ],
        label_visibility="collapsed",
        key="page_navigation",
    )

    st.markdown("---")
    st.markdown(
        "<div style='font-size:0.88rem;color:#4b5750;padding:0 0.5rem;line-height:1.7;'>"
        "Free &amp; open-source prototype.<br>"
        "No paid APIs required.<br>"
        "Browser TTS via Web Speech API."
        "</div>",
        unsafe_allow_html=True,
    )

    # Liblouis status chip
    status_color = "#3155E7" if bs.LIBLOUIS_AVAILABLE else "#795b19"
    status_text = "Liblouis available" if bs.LIBLOUIS_AVAILABLE else "Translation unavailable"
    st.markdown(
        f"<div role='status' style='margin-top:0.85rem; font-size:0.82rem; color:{status_color};'>"
        f"Braille engine · {status_text}</div>",
        unsafe_allow_html=True,
    )


# ===========================================================================
# A. HOME DASHBOARD
# ===========================================================================
if page == "Home":
    st.markdown('<a class="bb-skip-link" href="#main-content">Skip to main content</a>', unsafe_allow_html=True)
    st.markdown("""
    <header class="home-header">
      <div class="brand-lockup"><span class="quiet-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span><span>BrailleBridge</span></div>
      <span class="eyebrow">A more personal way to access information</span>
    </header>
    <h1 class="home-title" id="main-content">Information, in the way<br class="desktop-break"> you need it.</h1>
    <p class="home-intro">Translate words into Braille, listen at your own pace, or bring a document into focus.</p>
    """, unsafe_allow_html=True)

    quick_text = st.text_area(
        "Text to translate",
        placeholder="Write or paste your text here…",
        height=190,
        key="home_quick_text",
        help="Your text is processed locally and is not saved as a recent item.",
    )
    home_left, home_right = st.columns([1, 4])
    with home_left:
        home_translate = st.button("Translate to Braille", key="home_translate_btn", type="primary", disabled=not bs.LIBLOUIS_AVAILABLE)
    with home_right:
        st.button("Use voice tools", key="home_voice_btn", on_click=_go_to_voice_assistant)

    if not bs.LIBLOUIS_AVAILABLE:
        st.caption("Braille translation requires the Liblouis UEB tables. Voice, reading, and document tools remain available.")
    if home_translate:
        if not quick_text.strip():
            st.warning("Enter text before translating.")
            _render_signal("error", "No text to translate.")
        else:
            languages = bs.get_available_languages()
            result = bs.translate(quick_text, languages[0])
            st.session_state["home_result"] = result

    home_result = st.session_state.get("home_result")
    if home_result:
        if home_result.success and home_result.braille_text:
            st.markdown("#### Braille output")
            st.markdown('<p class="output-note">Unicode Braille representation · visual, not tactile</p>', unsafe_allow_html=True)
            st.markdown(
                f'<div class="bb-braille-output" role="status" aria-live="polite" aria-label="Braille translation result">{home_result.braille_text}</div>',
                unsafe_allow_html=True,
            )
            _render_signal("success", "Translation complete with Liblouis.")
            copy_col, listen_col, download_col = st.columns(3)
            with copy_col:
                _render_copy_button(home_result.braille_text, "home")
            with listen_col:
                if st.button("Listen to original", key="home_listen"):
                    _render_html_component(ss.get_tts_html(home_result.original_text, auto_play=True), height=80)
            with download_col:
                st.download_button("Download Braille", home_result.braille_text.encode("utf-8"), "braille_output.txt", "text/plain", key="home_download")
        else:
            _render_signal("error", "Translation could not be completed.")
            st.error(home_result.error or home_result.warning)

    st.markdown('<div class="first-use"><strong>Start wherever you are.</strong><span>Paste text above, choose a destination from the rail, or open a document to listen and find important information.</span></div>', unsafe_allow_html=True)


# ===========================================================================
# B. BRAILLE TRANSLATOR
# ===========================================================================
elif page == "Braille translator":
    st.markdown('<p class="eyebrow">Translation studio</p><h1>Braille translator</h1>', unsafe_allow_html=True)
    st.markdown('<p class="page-intro">Keep the source close. Choose a UEB table and inspect its Unicode output.</p>', unsafe_allow_html=True)

    languages = bs.get_available_languages()
    if not languages:
        st.warning(bs.get_availability_message(), icon="⚠️")

    col_left, col_right = st.columns([1, 1], gap="large")

    with col_left:
        st.markdown("### Original text")

        selected_lang = st.selectbox(
            "Translation table / language",
            options=languages or ["Liblouis unavailable"],
            key="bt_lang",
            help="Choose the Braille standard and grade for translation.",
            disabled=not languages,
        )

        input_text = st.text_area(
            "Text to translate",
            placeholder="Enter English text here…",
            height=200,
            key="bt_input",
            help="Type or paste the text you want to convert to Braille.",
        )

        col_btn1, col_btn2 = st.columns(2)
        with col_btn1:
            translate_clicked = st.button(
                "Translate",
                key="bt_translate",
                use_container_width=True,
                disabled=not languages,
            )
        with col_btn2:
                st.button(
                    "✕ Clear",
                    key="bt_clear",
                    use_container_width=True,
                    on_click=_clear_braille_input,
                )

        st.markdown('</div>', unsafe_allow_html=True)

    with col_right:
        st.markdown("### Braille result")
        st.markdown('<p class="output-note">Unicode Braille representation · visual, not tactile</p>', unsafe_allow_html=True)

        if translate_clicked and input_text.strip():
            result = bs.translate(input_text, selected_lang)
            st.session_state["bt_result"] = result
        elif translate_clicked and not input_text.strip():
            st.warning("Please enter some text to translate.")

        result = st.session_state.get("bt_result")

        if result:
            if result.warning:
                st.warning(result.warning)
            if result.error:
                st.error(result.error)
                _render_signal("error", "Translation could not be completed.")

            if result.braille_text:
                method_label = "Liblouis" if result.method == "liblouis" else result.method.title()
                st.markdown(
                    f'<span class="bb-badge bb-badge-info">Method: {method_label}</span>',
                    unsafe_allow_html=True,
                )
                st.markdown(
                    f'<div class="bb-braille-output" role="status" aria-live="polite" '
                    f'aria-label="Braille translation result">{result.braille_text}</div>',
                    unsafe_allow_html=True,
                )
                _render_signal("success", "Translation complete with Liblouis.")

                # Actions: copy hint, download, read aloud
                copy_col, dl_col, tts_col = st.columns(3)
                with copy_col:
                    _render_copy_button(result.braille_text, "translator")
                with dl_col:
                    st.download_button(
                        "Download Braille",
                        data=result.braille_text.encode("utf-8"),
                        file_name="braille_output.txt",
                        mime="text/plain",
                        key="bt_download",
                    )
                with tts_col:
                    if st.button("🔊 Read Original Aloud", key="bt_tts"):
                        st.session_state["bt_tts_trigger"] = True

                if st.session_state.get("bt_tts_trigger"):
                    tts_html = ss.get_tts_html(result.original_text, auto_play=True)
                    _render_html_component(tts_html, height=80)
                    st.session_state["bt_tts_trigger"] = False

            else:
                st.info("No Braille output was produced. Check the error message above.")
        else:
            st.markdown(
                '<div class="bb-braille-output" aria-label="Braille output area, empty">'
                '<span style="color:#475569;">Braille will appear here…</span></div>',
                unsafe_allow_html=True,
            )


    # Read-aloud TTS widget (always visible)
    if result and result.braille_text and not st.session_state.get("bt_tts_trigger"):
        st.markdown("#### 🔊 Read Aloud")
        tts_html = ss.get_tts_html(result.original_text)
        _render_html_component(tts_html, height=80)


# ===========================================================================
# C. VOICE ASSISTANT
# ===========================================================================
elif page == "Voice assistant":
    st.markdown('<p class="eyebrow">Voice workspace</p><h1>Listen, then decide.</h1>', unsafe_allow_html=True)
    st.markdown(
        '<p class="page-intro">Speak or type a command. The assistant routes it to the correct '
        'accessibility function — no AI hallucination, just transparent rule-based actions.</p>',
        unsafe_allow_html=True,
    )

    _render_signal("idle", "Ready when you are. Recording starts only when you press the microphone button.")

    # Mic widget
    st.markdown("### Speak")
    mic_html = ss.get_speech_recognition_html("bb-voice-transcript")
    _render_html_component(mic_html, height=130)

    st.markdown("### Or type")
    voice_text = st.text_area(
        "Your text or transcript",
        placeholder="Paste your recognized speech here, or type a command…",
        height=100,
        key="va_text",
        help="After speaking, copy the text from above and paste it here for processing.",
    )

    st.markdown("### Choose an action")
    col_v1, col_v2, col_v3, col_v4 = st.columns(4)
    with col_v1:
        do_read = st.button("🔊 Read Aloud", key="va_read", use_container_width=True)
    with col_v2:
        do_translate = st.button("Translate to Braille", key="va_translate", use_container_width=True)
    with col_v3:
        do_summarize = st.button("📝 Summarize", key="va_summarize", use_container_width=True)
    with col_v4:
        do_deadlines = st.button("📅 Find Dates", key="va_deadlines", use_container_width=True)

    if any([do_read, do_translate, do_summarize, do_deadlines]):
        text = voice_text.strip()
        if not text:
            st.warning("Please enter or paste some text before selecting an action.")
            _render_signal("error", "Enter text before choosing an action.")
        else:
            _render_signal("processing", "Working on your request.")
            if do_read:
                res = wf.action_read_aloud(text)
                st.success(f"Reading {res.data.get('word_count', 0)} words aloud…")
                _render_signal("success", "Text is ready to read aloud.")
                tts_html = ss.get_tts_html(text, auto_play=True)
                _render_html_component(tts_html, height=80)

            elif do_translate:
                langs = bs.get_available_languages()
                if not langs:
                    st.warning(bs.get_availability_message())
                    _render_signal("error", "Braille translation is unavailable.")
                else:
                    res = wf.action_translate(text, langs[0])
                    st.markdown("**Braille Output:**")
                    if res.warning:
                        st.warning(res.warning)
                    if res.output:
                        _render_signal("success", "Translation complete with Liblouis.")
                        st.markdown(
                            f'<div class="bb-braille-output" role="status" aria-live="polite">'
                            f'{res.output}</div>',
                            unsafe_allow_html=True,
                        )
                    if res.error:
                        st.error(res.error)
                        _render_signal("error", "Translation could not be completed.")

            elif do_summarize:
                res = wf.action_summarize(text)
                if res.success:
                    st.success("**Extractive Summary** (rule-based, first sentences):")
                    _render_signal("success", "Summary ready. Verify it against the source text.")
                    st.markdown(
                        f'<div class="bb-card" style="color:#202522;">{html_lib.escape(res.output)}</div>',
                        unsafe_allow_html=True,
                    )
                    if res.warning:
                        st.warning(res.warning)
                else:
                    st.error(res.error)
                    _render_signal("error", "Summary could not be created.")

            elif do_deadlines:
                res = wf.action_find_deadlines(text)
                if res.success:
                    if res.data.get("candidates"):
                        _render_signal("success", "Candidate dates found. Verify them in the source.")
                        st.success(f"Found {len(res.data['candidates'])} candidate date(s):")
                        for i, c in enumerate(res.data["candidates"], 1):
                            with st.expander(f"📅 Date {i}: {c['date']}"):
                                st.markdown(f"**Context:**\n\n{c['context']}")
                        if res.warning:
                            st.warning(res.warning)
                    else:
                        _render_signal("success", "No candidate dates found.")
                        st.info(res.output)
                else:
                    st.error(res.error)
                    _render_signal("error", "Date search could not be completed.")

    # Supported commands help
    with st.expander("ℹ️ Supported commands and actions"):
        st.markdown("""
        | Action | What it does |
        |--------|--------------|
        | **Read Aloud** | Reads your text using browser TTS |
            | **To Braille** | Translates with the installed Liblouis UEB table |
        | **Summarize** | Returns an extractive summary (first sentences) |
        | **Find Dates** | Searches for dates and deadlines in the text |

        Speech recognition requires Chrome or Edge. If unavailable, type your text in the box above.
        """)


# ===========================================================================
# D. DOCUMENT READER
# ===========================================================================
elif page == "Document reader":
    st.markdown('<p class="eyebrow">Document workspace</p><h1>Bring a document into focus.</h1>', unsafe_allow_html=True)
    st.markdown(
        '<p class="page-intro">Upload a text file or PDF. Extract, review, summarize, '
        'translate to Braille, and find important dates.</p>',
        unsafe_allow_html=True,
    )

    uploaded = st.file_uploader(
        "Upload document",
        type=["txt", "md", "csv", "pdf"],
        key="dr_upload",
        help="Supported: .txt, .md, .csv, and text-based .pdf files",
        label_visibility="visible",
    )

    if uploaded:
        file_bytes = uploaded.read()
        result: ds.ExtractionResult = ds.extract_text(file_bytes, uploaded.name)
        st.session_state["dr_result"] = result

    result = st.session_state.get("dr_result")

    if result:
        st.markdown("---")

        # Status
        if result.success and result.text.strip():
            st.markdown(
                f'<span class="bb-badge bb-badge-success">✓ Extracted — '
                f'{result.page_count} page(s) — Method: {result.method.upper()}</span>',
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                '<span class="bb-badge bb-badge-error">✗ Extraction failed or empty</span>',
                unsafe_allow_html=True,
            )

        if result.warning:
            st.warning(result.warning)
        if result.error:
            st.error(result.error)

        if result.success and result.text.strip():
            _render_signal("success", "Document text extracted. The source remains available below for verification.")
            extracted_text = result.text

            # Show extracted text
            st.markdown("### Source text")
            with st.expander("View extracted text", expanded=True):
                st.text_area(
                    "Extracted content (read-only for verification)",
                    value=extracted_text,
                    height=300,
                    key="dr_text_view",
                    disabled=True,
                )

            # Action buttons
            if not bs.LIBLOUIS_AVAILABLE:
                st.warning(bs.get_availability_message())

            col_a, col_b, col_c, col_d = st.columns(4)
            with col_a:
                do_tts = st.button("🔊 Read Aloud", key="dr_tts", use_container_width=True)
            with col_b:
                do_braille = st.button(
                    "Translate to Braille",
                    key="dr_braille",
                    use_container_width=True,
                    disabled=not bs.LIBLOUIS_AVAILABLE,
                )
            with col_c:
                do_summary = st.button("📝 Summarize", key="dr_summary", use_container_width=True)
            with col_d:
                do_dates = st.button("📅 Find Deadlines", key="dr_dates", use_container_width=True)

            # TTS
            if do_tts:
                _render_signal("success", "Reading the first 5,000 characters aloud.")
                tts_html = ss.get_tts_html(extracted_text[:5000], auto_play=True)
                _render_html_component(tts_html, height=80)
                st.info("Reading first 5,000 characters aloud. Use Stop button to halt.")

            # Braille translation
            if do_braille:
                langs = bs.get_available_languages()
                with st.spinner("Translating to Braille…"):
                    br_result = bs.translate(extracted_text[:2000], langs[0])
                st.markdown("**Braille translation** · first 2,000 characters · Unicode, not tactile")
                if br_result.warning:
                    st.warning(br_result.warning)
                if br_result.braille_text:
                    st.markdown(
                        f'<div class="bb-braille-output" role="status" aria-live="polite">'
                        f'{br_result.braille_text}</div>',
                        unsafe_allow_html=True,
                    )
                    _render_signal("success", "Document excerpt translated with Liblouis.")
                    _render_copy_button(br_result.braille_text, "document")
                    st.download_button(
                        "Download Braille",
                        data=br_result.braille_text.encode("utf-8"),
                        file_name=f"{result.filename}_braille.txt",
                        mime="text/plain",
                    )
                if br_result.error:
                    st.error(br_result.error)
                    _render_signal("error", "Document translation could not be completed.")

            # Summary
            if do_summary:
                summary_res = wf.action_summarize(extracted_text)
                if summary_res.success:
                    st.markdown("**Extractive Summary** (rule-based):")
                    _render_signal("success", "Summary ready. Verify it against the source text.")
                    st.markdown(
                        f'<div class="bb-card" style="color:#202522;">{html_lib.escape(summary_res.output)}</div>',
                        unsafe_allow_html=True,
                    )
                    if summary_res.warning:
                        st.warning(summary_res.warning)
                else:
                    st.error(summary_res.error)
                    _render_signal("error", "Summary could not be created.")

            # Date / deadline detection
            if do_dates:
                dates_res = wf.action_find_deadlines(extracted_text)
                if dates_res.success:
                    if dates_res.data.get("candidates"):
                        _render_signal("success", "Candidate information found. Verify it against the source.")
                        st.success(f"Found {len(dates_res.data['candidates'])} candidate date(s):")
                        for i, c in enumerate(dates_res.data["candidates"], 1):
                            with st.expander(f"📅 Candidate {i}: {c['date']}"):
                                st.markdown(f"**Surrounding passage:**\n\n> {c['context']}")
                        st.warning(dates_res.warning)
                    else:
                        _render_signal("success", "No candidate dates found.")
                        st.info("No candidate dates or deadlines were found in this document.")
                else:
                    st.error(dates_res.error)
                    _render_signal("error", "Information search could not be completed.")

        # OCR notice
        if not (ds.TESSERACT_AVAILABLE and ds.PDF2IMAGE_AVAILABLE):
            st.markdown(
                '<div class="bb-card" style="border-color:rgba(245,158,11,0.4);">'
                '<strong style="color:#fbbf24;">OCR not available.</strong> '
                f'<span style="color:#cbd5e1;">Scanned PDFs require OCR support. {ds.get_ocr_availability_message()}</span></div>',
                unsafe_allow_html=True,
            )
    else:
        # Empty state
                st.markdown('<div class="first-use"><strong>Your source stays yours.</strong><span>Text extraction happens locally. Scanned PDFs need optional OCR support.</span></div>', unsafe_allow_html=True)


# ===========================================================================
# E. ACCESSIBILITY & ABOUT
# ===========================================================================
elif page == "Accessibility & about":
    st.markdown('<p class="eyebrow">Product notes</p><h1>Accessibility & about</h1>', unsafe_allow_html=True)

    col1, col2 = st.columns([2, 1])
    with col1:
        st.markdown("""
        <div class="bb-card">
          <h3 style="color:#a5b4fc; margin-top:0;">About BrailleBridge AI</h3>
          <p style="color:#cbd5e1; line-height:1.7;">
            BrailleBridge AI is an open-source, voice-first accessibility prototype designed for
            blind and visually impaired users. It provides text-to-Braille translation, text-to-speech
            reading, document extraction, and simple multi-step workflows — all without requiring
            a paid API key.
          </p>
          <p style="color:#cbd5e1; line-height:1.7;">
            Built for hackathon demonstration. All processing is rule-based and transparent.
            The system never fabricates information and always prompts the user to verify uncertain results.
          </p>
        </div>
        """, unsafe_allow_html=True)

    with col2:
        st.markdown(f"""
        <div class="bb-card" style="text-align:center;">
          <h4 style="color:#a5b4fc; margin-top:0;">Engine Status</h4>
                    <div class="bb-badge {'bb-badge-success' if bs.LIBLOUIS_AVAILABLE else 'bb-badge-warning'}">
                        {'✓ Liblouis UEB tables available' if bs.LIBLOUIS_AVAILABLE else '⚠ Braille translation unavailable'}
          </div><br><br>
          <div class="bb-badge {'bb-badge-success' if ds.PYPDF_AVAILABLE else 'bb-badge-error'}">
            {'✓ pypdf installed' if ds.PYPDF_AVAILABLE else '✗ pypdf missing'}
          </div><br><br>
                    <div class="bb-badge {'bb-badge-success' if ds.TESSERACT_AVAILABLE and ds.PDF2IMAGE_AVAILABLE else 'bb-badge-warning'}">
                        {'✓ OCR (Tesseract + Poppler) available' if ds.TESSERACT_AVAILABLE and ds.PDF2IMAGE_AVAILABLE else '⚠ OCR unavailable'}
          </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    st.markdown("""
    <div class="bb-card">
      <h3 style="color:#a5b4fc; margin-top:0;">⚠️ Important Notices</h3>
      <ul style="color:#fbbf24; line-height:2; font-size:0.95rem; padding-left:1.2rem;">
        <li><strong>Displayed Braille is Unicode text — not tactile output.</strong>
            A refreshable Braille display or Braille embosser is required for physical tactile reading.</li>
        <li>Speech recognition depends on your browser (Chrome/Edge recommended).</li>
        <li>This prototype does <strong>not</strong> use OpenAI, Gemini, or any paid AI service.</li>
        <li>OCR results may contain errors — always verify against the source document.</li>
        <li>No accessibility certification has been performed. Use with a screen reader for real-world testing.</li>
      </ul>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("### 🌐 Supported Features & Languages")
    with st.expander("Braille Translation Tables"):
        if bs.LIBLOUIS_AVAILABLE:
            for name, info in bs.LIBLOUIS_TABLES.items():
                st.markdown(f"- **{name}** — table: `{info['table']}`, grade: {info['grade']}")
        else:
            st.markdown(bs.get_availability_message())

    with st.expander("Document Formats"):
        st.markdown("""
        | Format | Support |
        |--------|---------|
        | `.txt`, `.md`, `.csv` | ✅ Full text extraction |
        | Text-based `.pdf` | ✅ via pypdf |
        | Scanned `.pdf` | ⚠️ Optional OCR (pytesseract + pdf2image) |
        | `.docx`, `.odt` | ❌ Not supported in this prototype |
        """)

    st.markdown("### 🛡️ Privacy")
    st.markdown("""
    <div class="bb-card">
      <ul style="color:#cbd5e1; line-height:1.8; padding-left:1.2rem; margin:0;">
        <li>All document processing happens <strong>locally on your machine</strong>.</li>
        <li>No documents, text, or speech data are sent to any external server by this application.</li>
        <li>Browser speech recognition (Web Speech API) may send audio to the browser vendor's servers
            (e.g., Google for Chrome). Consult your browser's privacy policy.</li>
        <li>No analytics or telemetry is collected by BrailleBridge AI.</li>
      </ul>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("### ⌨️ Keyboard Navigation")
    st.markdown("""
    <div class="bb-card">
      <ul style="color:#cbd5e1; line-height:1.8; padding-left:1.2rem; margin:0;">
        <li>All buttons and controls are reachable via <kbd>Tab</kbd> key.</li>
        <li>Press <kbd>Enter</kbd> or <kbd>Space</kbd> to activate buttons.</li>
        <li>The sidebar navigation is fully keyboard accessible.</li>
        <li>All status messages use ARIA live regions for screen reader announcements.</li>
        <li>Focus indicators are visible (blue outline on focused elements).</li>
      </ul>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("### 📋 Installation & Quick Start")
    st.code("""# 1. Clone the repository
git clone https://github.com/your-org/braillebridge-ai.git
cd braillebridge-ai

# 2. Install dependencies
pip install -r requirements.txt

# 3. (Optional) Install Liblouis and its English UEB tables
#    Configure LIBLOUIS_LIBRARY and LOUIS_TABLEPATH; see README.md

# 4. Run the application
streamlit run app.py

# 5. Run tests
pytest tests/ -v
""", language="bash")
