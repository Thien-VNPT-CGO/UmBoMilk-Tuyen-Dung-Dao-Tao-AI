"""TEST dau ra (Master §19). Rule cu, deterministic.

- Scheduling: 90 phut, T2-T7, 08:00-17:00, last start 15:30, khong overlap.
- Rubric: 2 nhom x 10 cau (Kien thuc & Ung xu / Van hanh), moi cau 1/0.5/0.
  AI chi DE XUAT; HR override; final thang 10:
  <5 FAIL | 5-<8 RETEST | >=8 PASS_WAITING_OFFICIAL_APPROVAL.
"""
from __future__ import annotations

from datetime import datetime

VALID_SCORES = (0, 0.5, 1.0)
GROUP_SIZE = 10
DURATION_MIN = 90
OPEN_MIN = 8 * 60
CLOSE_MIN = 17 * 60
LAST_START_MIN = 15 * 60 + 30
GAP_MIN = 90


def validate_test_slot(when: datetime) -> dict:
    if when.weekday() == 6:
        return {"ok": False, "error": "Khong dat TEST Chu nhat"}
    mins = when.hour * 60 + when.minute
    if mins < OPEN_MIN or mins + DURATION_MIN > CLOSE_MIN:
        return {"ok": False, "error": "TEST 90p trong 08:00-17:00"}
    if mins > LAST_START_MIN:
        return {"ok": False, "error": "Slot cuoi TEST la 15:30"}
    return {"ok": True}


def check_test_overlap(when: datetime, existing: list[datetime]) -> list[datetime]:
    return [e for e in existing
            if abs((when - e).total_seconds()) / 60 < GAP_MIN]


def score_group(scores: list[float]) -> dict:
    if len(scores) != GROUP_SIZE:
        return {"ok": False, "error": f"Moi nhom {GROUP_SIZE} cau"}
    for s in scores:
        if float(s) not in VALID_SCORES:
            return {"ok": False, "error": f"Diem moi cau chi 1/0.5/0 (got {s})"}
    return {"ok": True, "total": round(sum(float(s) for s in scores), 2)}


def final_recommendation(total20: float) -> dict:
    total10 = round(total20 / 2, 2)
    if total10 < 5:
        rec = "FAIL"
    elif total10 < 8:
        rec = "RETEST"
    else:
        rec = "PASS_WAITING_OFFICIAL_APPROVAL"
    return {"total20": round(total20, 2), "total10": total10, "recommendation": rec}


def propose(part1: list[float], part2: list[float], confidence: float = 0.0) -> dict:
    """AI proposal (chua phai ket qua cuoi). Evidence khong du -> INSUFFICIENT."""
    g1, g2 = score_group(part1), score_group(part2)
    if not g1["ok"]:
        return {"ok": False, "error": g1["error"]}
    if not g2["ok"]:
        return {"ok": False, "error": g2["error"]}
    total = round(g1["total"] + g2["total"], 2)
    out = {"ok": True, "ai_proposal": True, **final_recommendation(total),
           "part1": g1["total"], "part2": g2["total"], "confidence": confidence}
    if confidence < 0.65:
        out["status"] = "INSUFFICIENT_EVIDENCE"
        out["score"] = None
    return out


def validate_transcript(segments: list[dict]) -> dict:
    for s in segments:
        if not isinstance(s, dict) or not s.get("text"):
            return {"ok": False, "error": "Segment thieu text"}
        for k in ("speaker", "start_time", "end_time"):
            if k not in s:
                return {"ok": False, "error": f"Segment thieu {k}"}
    return {"ok": True, "count": len(segments)}
