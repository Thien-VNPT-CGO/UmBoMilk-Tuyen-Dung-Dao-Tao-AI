"""Interview Autopilot helpers (Master §15). Deterministic, khong LLM.

Business hours: T2-T7, 08:00-17:00, 30p/slot, slot cuoi 16:30 (giong Core P0).
"""
from __future__ import annotations

from datetime import date, timedelta

OPEN_MIN = 8 * 60
CLOSE_MIN = 17 * 60
LAST_START_MIN = 16 * 60 + 30
SLOT_MIN = 30


def fmt_slot(start_mins: int) -> str:
    h, m = divmod(start_mins, 60)
    h2, m2 = divmod(start_mins + SLOT_MIN, 60)
    return f"{h:02d}:{m:02d}-{h2:02d}:{m2:02d}"


def day_slots() -> list[str]:
    return [fmt_slot(m) for m in range(OPEN_MIN, LAST_START_MIN + 1, SLOT_MIN)]


def is_business_day(d: date) -> bool:
    return d.weekday() != 6  # Monday=0..Sunday=6


def generate_slots(day: date, count: int) -> list[str]:
    """Sinh `count` slots hop le cho ngay lam viec (trong ngay, theo thu tu)."""
    if not is_business_day(day):
        return []
    return day_slots()[: max(0, count)]


def overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end


def parse_slot(slot: str) -> tuple[int, int] | None:
    try:
        a, b = slot.split("-")
        ah, am = map(int, a.strip().split(":"))
        bh, bm = map(int, b.strip().split(":"))
        s, e = ah * 60 + am, bh * 60 + bm
        if e - s != SLOT_MIN or s < OPEN_MIN or e > CLOSE_MIN or s > LAST_START_MIN:
            return None
        return (s, e)
    except Exception:
        return None


def find_conflicts(day: str, slot: str, existing: list[dict]) -> list[dict]:
    """existing: [{interviewDate, timeSlot, applicantName}]. Overlap that."""
    cur = parse_slot(slot)
    if cur is None:
        return [{"reason": "INVALID_SLOT"}]
    out = []
    for e in existing:
        if e.get("interviewDate") != day:
            continue
        other = parse_slot(e.get("timeSlot", ""))
        if other and overlaps(cur[0], cur[1], other[0], other[1]):
            out.append(e)
    return out


def next_business_day(d: date) -> date:
    n = d + timedelta(days=1)
    while not is_business_day(n):
        n += timedelta(days=1)
    return n
