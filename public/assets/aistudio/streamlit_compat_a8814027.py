"""Small compatibility helpers for supported Streamlit versions."""

from __future__ import annotations

import base64
from typing import Any


def render_html_component(streamlit_api: Any, html: str, height: int) -> None:
    """Render trusted HTML in an isolated iframe on both old and new Streamlit."""
    iframe = getattr(streamlit_api, "iframe", None)
    if iframe is not None:
        encoded_html = base64.b64encode(html.encode("utf-8")).decode("ascii")
        iframe(
            f"data:text/html;base64,{encoded_html}",
            height=height,
            tab_index=0,
            alt="Browser speech controls",
        )
        return

    streamlit_api.components.v1.html(html, height=height, scrolling=False)