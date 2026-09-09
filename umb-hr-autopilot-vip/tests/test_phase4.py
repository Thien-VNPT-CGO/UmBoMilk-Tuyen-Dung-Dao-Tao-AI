"""PHASE 4: interview slots, preview conflicts, workflow states, RBAC."""
from datetime import date

from app.core.security import mint_token
from app.workflows.interview import (
    day_slots,
    find_conflicts,
    generate_slots,
    is_business_day,
    next_business_day,
    overlaps,
    parse_slot,
)


def _hdr(role="HR"):
    return {"Authorization": "Bearer " + mint_token(sub="hr1", role=role)}


def test_slots_business_hours():
    slots = day_slots()
    assert slots[0] == "08:00-08:30" and slots[-1] == "16:30-17:00"
    assert len(slots) == 18  # 08:00..16:30 moi 30p
    assert is_business_day(date(2026, 9, 14))  # Thu 2
    assert not is_business_day(date(2026, 9, 13))  # Chu nhat
    assert generate_slots(date(2026, 9, 13), 4) == []
    assert generate_slots(date(2026, 9, 14), 4) == slots[:4]
    assert overlaps(480, 510, 495, 525) and not overlaps(480, 510, 510, 540)
    assert parse_slot("08:00-08:30") == (480, 510)
    assert parse_slot("17:00-17:30") is None
    assert parse_slot("08:00-09:00") is None  # phai 30p
    assert next_business_day(date(2026, 9, 12)).weekday() == 0  # T7 -> T2


def test_conflict_detection():
    existing = [{"interviewDate": "2026-09-14", "timeSlot": "08:00-08:30", "applicantName": "A"}]
    assert find_conflicts("2026-09-14", "08:00-08:30", existing) == existing
    assert len(find_conflicts("2026-09-14", "08:15-08:45", existing)) == 1
    assert find_conflicts("2026-09-14", "08:30-09:00", existing) == []
    assert find_conflicts("2026-09-15", "08:00-08:30", existing) == []


def test_bulk_preview_offline_core(client):
    # Core offline -> van preview duoc (conflict rong), RBAC giu
    body = {"items": [{"applicant_id": "a1", "interviewDate": "2026-09-14", "timeSlot": "08:00-08:30"},
                      {"applicant_id": "a2", "interviewDate": "2026-09-14", "timeSlot": "17:00-17:30"}]}
    assert client.post("/api/vip/interviews/bulk-preview", json=body).status_code == 401
    r = client.post("/api/vip/interviews/bulk-preview", json=body, headers=_hdr("VIEWER"))
    assert r.status_code == 403
    r = client.post("/api/vip/interviews/bulk-preview", json=body, headers=_hdr("HR"))
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert rows[0]["ok"] is True and rows[1]["ok"] is False
    assert r.json()["summary"] == {"ok": 1, "conflict": 1, "meets": 1, "zalos": 1}
    assert r.json()["confirm_required"] is True


def test_confirm_complete_no_autopass(client):
    h = _hdr("HR")
    r = client.post("/api/vip/interviews/iv1/confirm", headers=h)
    assert r.json()["confirmation"] == "CONFIRMED"
    r = client.post("/api/vip/interviews/iv1/complete", headers=h)
    assert r.json()["auto_pass"] is False
    assert r.json()["next"] == "WAITING_HR_REVIEW"
    assert client.get("/api/vip/interviews/state/nope", headers=h).status_code == 404
