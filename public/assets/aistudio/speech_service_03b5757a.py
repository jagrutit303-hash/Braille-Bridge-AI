"""
speech_service.py
-----------------
Speech-related helpers for BrailleBridge AI.

Browser-side TTS is handled via a JavaScript snippet injected into Streamlit.
This module provides:
  - HTML/JS snippets for TTS playback
  - Helpers for building accessible status messages
  - Optional speech-recognition guidance

No server-side audio processing is performed here — all TTS happens in the
user's browser using the Web Speech API, which requires no API key.
"""

from __future__ import annotations

import json


def get_tts_html(text: str, *, auto_play: bool = False, rate: float = 1.0, pitch: float = 1.0) -> str:
    """
    Return an HTML+JavaScript snippet that uses the Web Speech API to speak *text*.

    Parameters
    ----------
    text:
        The text to read aloud.
    auto_play:
        If True, speech starts automatically when the component is rendered.
    rate:
        Speech rate (0.1 – 10, default 1.0).
    pitch:
        Voice pitch (0 – 2, default 1.0).
    """
    safe_text = (
      json.dumps(text, ensure_ascii=True)
      .replace("<", "\\u003c")
      .replace(">", "\\u003e")
      .replace("&", "\\u0026")
    )

    auto_play_js = "speak();" if auto_play else ""

    return f"""
  <meta charset="utf-8">
<div id="bb-tts-container" style="margin: 0.5rem 0;">
  <button
    id="bb-speak-btn"
    onclick="speak()"
    style="
      background: #3155e7;
      color: white;
      border: 1px solid #3155e7;
      border-radius: 4px;
      padding: 0.65rem 1.1rem;
      min-height: 44px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      box-shadow: none;
    "
    aria-label="Read text aloud"
  >
    🔊 Read Aloud
  </button>
  <button
    id="bb-stop-btn"
    onclick="stopSpeak()"
    style="
      background: #fffefa;
      color: #202522;
      border: 1px solid #a6aaa2;
      border-radius: 4px;
      padding: 0.65rem 1.1rem;
      min-height: 44px;
      font-size: 1rem;
      cursor: pointer;
      margin-left: 0.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    "
    aria-label="Stop reading"
  >
    ⏹ Stop
  </button>
  <span id="bb-tts-status" aria-live="polite" style="margin-left:0.8rem; font-size:1rem; color:#202522;"></span>
</div>

<script>
(function() {{
  var utterance = null;

  window.speak = function() {{
    if (!('speechSynthesis' in window)) {{
      document.getElementById('bb-tts-status').textContent = 
        'Text-to-speech is not supported in this browser.';
      return;
    }}
    window.speechSynthesis.cancel();
    utterance = new SpeechSynthesisUtterance({safe_text});
    utterance.rate = {rate};
    utterance.pitch = {pitch};
    utterance.onstart = function() {{
      document.getElementById('bb-tts-status').textContent = '🔊 Reading…';
    }};
    utterance.onend = function() {{
      document.getElementById('bb-tts-status').textContent = '✅ Done';
    }};
    utterance.onerror = function(e) {{
      document.getElementById('bb-tts-status').textContent = '⚠ Speech error: ' + e.error;
    }};
    window.speechSynthesis.speak(utterance);
  }};

  window.stopSpeak = function() {{
    if ('speechSynthesis' in window) {{
      window.speechSynthesis.cancel();
      document.getElementById('bb-tts-status').textContent = 'Stopped.';
    }}
  }};

  {auto_play_js}
}})();
</script>
"""


def get_speech_recognition_html(element_id: str = "bb-transcript") -> str:
    """
    Return an HTML+JS snippet for browser microphone input via the Web Speech API.
    Displays a graceful fallback message if the browser doesn't support recognition.
    """
    return f"""
  <meta charset="utf-8">
<div id="bb-mic-container" style="margin: 0.5rem 0;">
  <button
    id="bb-mic-btn"
    onclick="toggleRecording()"
    style="
      background: #3155e7;
      color: white;
      border: 1px solid #3155e7;
      border-radius: 4px;
      padding: 0.65rem 1.1rem;
      min-height: 44px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    "
    aria-label="Start voice recording"
    aria-pressed="false"
  >
    🎙 Start Recording
  </button>
  <span id="bb-mic-status" aria-live="polite" style="margin-left:0.8rem; font-size:1rem; color:#202522;">
    Ready
  </span>
  <span class="bb-signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
  <div
    id="{element_id}"
    aria-label="Voice transcript"
    role="textbox"
    aria-multiline="true"
    contenteditable="true"
    style="
      margin-top: 0.5rem;
      padding: 0.6rem;
      background: #fffefa;
      border: 1px solid #d8d7d0;
      border-radius: 4px;
      min-height: 2rem;
      font-style: italic;
      color: #202522;
      font-size: 1rem;
      cursor: text;
      outline-offset: 3px;
    "
  ></div>
</div>

<script>
(function() {{
  var recognition = null;
  var isRecording = false;

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {{
    document.getElementById('bb-mic-status').textContent =
      'Speech recognition is not supported in this browser. Please type your input below.';
    document.getElementById('bb-mic-btn').disabled = true;
    document.getElementById('bb-mic-btn').style.opacity = '0.5';
    return;
  }}

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var signal = document.querySelector('.bb-signal');

  window.toggleRecording = function() {{
    if (isRecording) {{
      recognition.stop();
    }} else {{
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = function() {{
        isRecording = true;
        signal.className = 'bb-signal is-listening';
        document.getElementById('bb-mic-status').textContent = '🔴 Recording…';
        document.getElementById('bb-mic-btn').setAttribute('aria-pressed', 'true');
        document.getElementById('bb-mic-btn').textContent = '⏹ Stop';
      }};

      recognition.onresult = function(event) {{
        var transcript = '';
        for (var i = 0; i < event.results.length; i++) {{
          transcript += event.results[i][0].transcript;
        }}
        document.getElementById('{element_id}').textContent = transcript;
      }};

      recognition.onend = function() {{
        isRecording = false;
        signal.className = 'bb-signal is-success';
        document.getElementById('bb-mic-status').textContent = '✅ Done — review transcript below';
        document.getElementById('bb-mic-btn').setAttribute('aria-pressed', 'false');
        document.getElementById('bb-mic-btn').textContent = '🎙 Start Recording';
      }};

      recognition.onerror = function(e) {{
        isRecording = false;
        signal.className = 'bb-signal is-error';
        document.getElementById('bb-mic-status').textContent = '⚠ Error: ' + e.error;
        document.getElementById('bb-mic-btn').textContent = '🎙 Start Recording';
      }};

      recognition.start();
    }}
  }};
}})();
</script>
<style>
  .bb-signal {{ display:inline-grid; grid-template-columns:repeat(3,8px); gap:4px; margin-left:10px; vertical-align:middle; }}
  .bb-signal i {{ width:8px; height:8px; border:1px solid #3155e7; border-radius:50%; }}
  .bb-signal.is-success i {{ background:#3155e7; }}
  .bb-signal.is-error i {{ border-color:#9b302d; }}
  .bb-signal.is-listening i {{ animation:bb-pulse 1.2s ease-in-out infinite; }}
  .bb-signal.is-listening i:nth-child(2) {{ animation-delay:.12s; }}
  .bb-signal.is-listening i:nth-child(3) {{ animation-delay:.24s; }}
  .bb-signal.is-listening i:nth-child(4) {{ animation-delay:.36s; }}
  .bb-signal.is-listening i:nth-child(5) {{ animation-delay:.48s; }}
  .bb-signal.is-listening i:nth-child(6) {{ animation-delay:.6s; }}
  @keyframes bb-pulse {{ 50% {{ transform:scale(1.15); background:#3155e7; }} }}
  @media (prefers-reduced-motion:reduce) {{ .bb-signal i {{ animation:none !important; }} }}
</style>
"""
