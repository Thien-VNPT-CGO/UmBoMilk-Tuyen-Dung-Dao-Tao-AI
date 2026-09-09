"""OFF 2 ngay/tuan — NV chinh thuc (Master §20). Rule cu, deterministic.

- Window: T6 12:00 -> T7 15:00 (gio VN). Ngoai window -> reject.
- Dung 2 ngay cho tuan tiep theo.
- Conflict: cung branch + shift + off_date -> chi 1 nguoi (first transaction wins).
  Cung branch khac shift -> allowed. Khac branch -> allowed.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

VN = ZoneInfo("Asia/Ho_Chi_Minh")
MAX_PER_WEEK = 2


def vn_now() -> datetime:
    return datetime.now(VN)


def is_window_open(now: datetime | None = None) -> bool:
    now = now or vn_now()
    d, h = now.weekday(), now.hour + now.minute / 60
    # Monday=0 .. Friday=4 12:00+, Saturday=5 <15:00
    if d == 4 and h >= 12:
        return True
    return d == 5 and h < 15


def validate_off_request(dates: list[str], employee_type: str = "OFFICIAL",
                         now: datetime | None = None) -> dict:
    if employee_type.upper() != "OFFICIAL":
        return {"ok": False, "error": "Chi ap dung NV chinh thuc"}
    if len(dates) != MAX_PER_WEEK:
        return {"ok": False, "error": f"Dang ky dung {MAX_PER_WEEK} ngay"}
    if not is_window_open(now):
        return {"ok": False, "error": "Ngoai khung gio T6 12:00 - T7 15:00"}
    if len(set(dates)) != len(dates):
        return {"ok": False, "error": "Ngay OFF trung nhau"}
    return {"ok": True}


def check_conflict(branch: str, shift: str, off_date: str,
                   approved: list[dict]) -> dict | None:
    """approved: [{branchId, shift, off_date, employeeId}]. Tra ve record thang neu conflict."""
    for r in approved:
        if (r.get("branchId") == branch and r.get("shift") == shift
                and r.get("off_date") == off_date):
            return r
    return None


def week_dates(monday_iso: str) -> list[str]:
    y, m, d = map(int, monday_iso.split("-"))
    from datetime import date
    mon = date(y, m, d)
    return [(mon + timedelta(days=i)).isoformat() for i in range(7)]
