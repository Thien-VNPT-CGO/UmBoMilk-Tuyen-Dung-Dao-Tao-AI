"""AI Command router (Master §13). Hieu intent -> query -> rule validator ->
preview -> HR xac nhan -> execute batch -> audit.

PHASE 8: rule-based NLU (khong phu thuoc LLM/provider van chay).
Provider hook (OpenAI...) se bo sung o phase sau ma khong doi interface.
AI command KHONG bypass RBAC/branch scope; high-impact KHONG thuc thi ngay.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from app.workflows.interview import day_slots


def _norm(text: str) -> str:
    try:
        import unicodedata
        s = unicodedata.normalize("NFD", text.lower())
        s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    except Exception:
        s = text.lower()
    return re.sub(r"\s+", " ", s).strip()


def _target_date(t: str) -> date | None:
    today = date.today()
    if "sang mai" in t or "ngay mai" in t or "chieu mai" in t:
        return today + timedelta(days=1)
    if "hom nay" in t:
        return today
    m = re.search(r"ngay\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?", t)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y = int(m.group(3)) if m.group(3) else today.year
        try:
            return date(y, mo, d)
        except ValueError:
            return None
    return None


def parse_command(text: str) -> dict:
    """Tra ve {intent, args, confidence}. Khong hieu -> needs_clarification."""
    t = _norm(text)
    if any(k in t for k in ("xep lich phong van", "xep lich pv", "tao lich phong van",
                            "dat lich phong van", "lich phong van")):
        day = _target_date(t)
        slots = day_slots()
        if "sang" in t:
            slots = [s for s in slots if s < "12:00-12:30"]
        elif "chieu" in t:
            slots = [s for s in slots if s >= "12:00-12:30"]
        return {"intent": "bulk_schedule_interview",
                "args": {"date": day.isoformat() if day else None,
                         "slots": slots[:8]},
                "confidence": 0.8 if day else 0.5}
    if any(k in t for k in ("nhac xac nhan", "nhac lich", "chua xac nhan")):
        return {"intent": "remind_unconfirmed", "args": {}, "confidence": 0.9}
    if any(k in t for k in ("duyet test", "test cho duyet", "phe test")):
        return {"intent": "list_test_pending", "args": {}, "confidence": 0.85}
    if any(k in t for k in ("tong quan", "bao cao hom nay", "brief", "hom nay can lam gi")):
        return {"intent": "morning_brief", "args": {}, "confidence": 0.9}
    if any(k in t for k in ("duyet official", "len chinh thuc")):
        return {"intent": "list_official_pending", "args": {}, "confidence": 0.8}
    return {"intent": "needs_clarification", "args": {"text": text}, "confidence": 0.3}
