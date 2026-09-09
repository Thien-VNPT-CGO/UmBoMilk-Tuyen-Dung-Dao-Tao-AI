"""Training 12 ngay = 7 work + 5 off (Master §17). Khong gia 7 ngay lien tuc.

Nguon: NHAN_VIEN_TRAINING (startDate/endDate) + PHIEU_OFF (TRAINING_OFF) +
RECORD_DIEM_DANH (valid work = co check-in/out).
"""
from __future__ import annotations

from datetime import date, timedelta


def daterange_12(start: date) -> list[date]:
    return [start + timedelta(days=i) for i in range(12)]


def build_timeline(start: date, off_dates: set[str],
                   present_dates: set[str] | None = None) -> list[dict]:
    """Moi ngay: TRAINING (work) hoac OFF. present tu cham cong."""
    present = present_dates or set()
    out = []
    for d in daterange_12(start):
        iso = d.isoformat()
        kind = "OFF" if iso in off_dates else "TRAINING"
        out.append({"date": iso, "kind": kind,
                    "present": iso in present if kind == "TRAINING" else None})
    return out


def progress(timeline: list[dict]) -> dict:
    work_days = [d for d in timeline if d["kind"] == "TRAINING"]
    valid = [d for d in work_days if d.get("present")]
    offs = [d for d in timeline if d["kind"] == "OFF"]
    return {"work_valid": len(valid), "work_total": 7,
            "off": len(offs), "off_total": 5,
            "completed_7_7": len(valid) >= 7 and len(offs) >= 5}


def detect_completion(employee: dict, off_dates: set[str],
                      present_dates: set[str]) -> dict:
    """7/7 detector chay 24/7 (PHASE 9 job goi ham nay)."""
    try:
        y, m, d = map(int, str(employee.get("startDate", "")).split("-"))
        tl = build_timeline(date(y, m, d), off_dates, present_dates)
    except Exception:
        return {"ok": False, "reason": "INVALID_START_DATE"}
    p = progress(tl)
    if p["completed_7_7"]:
        return {"ok": True, "ready": True, "progress": p,
                "next_best_action": "CREATE_TEST_SCHEDULE",
                "notify": ["HR", "EMPLOYEE"]}
    return {"ok": True, "ready": False, "progress": p}
