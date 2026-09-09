"""AI confidence gate (Master §26). Rule cu: code quyet dinh, khong LLM."""
from __future__ import annotations

from app.core.config import get_settings


def gate(confidence: float, auto_threshold: float | None = None,
         assisted_threshold: float | None = None) -> str:
    """Tra ve AUTO / ASSISTED / HR_REVIEW. Evidence khong du -> goi insufficient()."""
    s = get_settings()
    hi = auto_threshold if auto_threshold is not None else s.AI_CONF_AUTO
    lo = assisted_threshold if assisted_threshold is not None else s.AI_CONF_ASSISTED
    if confidence >= hi:
        return "AUTO"
    if confidence >= lo:
        return "ASSISTED"
    return "HR_REVIEW"


def insufficient() -> dict:
    return {"score": None, "status": "INSUFFICIENT_EVIDENCE"}
