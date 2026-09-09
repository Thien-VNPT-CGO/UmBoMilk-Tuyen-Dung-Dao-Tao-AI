"""Attendance realtime rules (Master §18). Raw = RECORD_DIEM_DANH.

Trang thai: NOT_STARTED / CHECKED_IN / COMPLETED / LATE / MISSING_CHECKOUT /
ABSENT / OFF / VIOLATION. Aggregate sau, khong lay BAO_CAO_CHAM_CONG lam raw.
"""
from __future__ import annotations


def classify(rec: dict) -> str:
    if rec.get("status") == "OFF":
        return "OFF"
    violations = rec.get("violations") or []
    if violations:
        return "VIOLATION"
    ci, co = rec.get("checkIn"), rec.get("checkOut")
    if not ci:
        return "ABSENT" if rec.get("expected") else "NOT_STARTED"
    if not co:
        return "MISSING_CHECKOUT"
    t = ""
    if isinstance(ci, dict):
        t = str(ci.get("late", "") or ci.get("time", ""))
    if "tr" in t.lower() or rec.get("lateMin", 0):
        return "LATE"
    return "COMPLETED"


def detect_anomalies(records: list[dict]) -> list[dict]:
    """Anomaly detection chay AUTOPILOT (PHASE 9). Thieu checkout / tre / vang."""
    out = []
    for r in records:
        if not isinstance(r, dict):
            continue
        st = classify(r)
        if st == "MISSING_CHECKOUT":
            out.append({"type": "MISSING_CHECKOUT", "priority": "HIGH",
                        "employeeId": r.get("employeeId"), "date": r.get("date"),
                        "summary": f"{r.get('employeeId')} thieu check-out ngay {r.get('date')}"})
        elif st == "LATE":
            out.append({"type": "LATE", "priority": "NORMAL",
                        "employeeId": r.get("employeeId"), "date": r.get("date"),
                        "summary": f"{r.get('employeeId')} tre ca ngay {r.get('date')}"})
        elif st == "ABSENT":
            out.append({"type": "ABSENT", "priority": "HIGH",
                        "employeeId": r.get("employeeId"), "date": r.get("date"),
                        "summary": f"{r.get('employeeId')} vang ngay {r.get('date')}"})
    return out
