"""PHASE 5: timeline 12 ngay, 7/7 detector, attendance anomalies."""
from datetime import date

from app.core.security import mint_token
from app.workflows.attendance_rules import classify, detect_anomalies
from app.workflows.training import build_timeline, detect_completion, progress


def _hdr(role="HR"):
    return {"Authorization": "Bearer " + mint_token(sub="hr1", role=role)}


def test_timeline_7_5():
    tl = build_timeline(date(2026, 9, 7),
                        {"2026-09-08", "2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"},
                        set())
    assert len(tl) == 12
    assert sum(1 for d in tl if d["kind"] == "OFF") == 5
    assert sum(1 for d in tl if d["kind"] == "TRAINING") == 7
    p = progress(tl)
    assert p == {"work_valid": 0, "work_total": 7, "off": 5, "off_total": 5,
                 "completed_7_7": False}


def test_detector_ready():
    offs = {"2026-09-08", "2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"}
    tl = build_timeline(date(2026, 9, 7), offs, set())
    present = {d["date"] for d in tl if d["kind"] == "TRAINING"}
    assert len(present) == 7
    r = detect_completion({"startDate": "2026-09-07"}, offs, present)
    assert r["ready"] is True
    assert r["next_best_action"] == "CREATE_TEST_SCHEDULE"
    assert r["notify"] == ["HR", "EMPLOYEE"]
    r2 = detect_completion({"startDate": "2026-09-07"}, offs, set())
    assert r2["ready"] is False
    assert detect_completion({"startDate": "xx"}, set(), set())["ok"] is False


def test_attendance_rules():
    assert classify({"status": "OFF"}) == "OFF"
    assert classify({"checkIn": {"time": "07:00"}, "checkOut": {"time": "12:00"}}) == "COMPLETED"
    assert classify({"checkIn": {"time": "07:00"}}) == "MISSING_CHECKOUT"
    assert classify({"checkIn": {"time": "07:20"}, "checkOut": {"time": "12:00"},
                     "lateMin": 20}) == "LATE"
    assert classify({"expected": True}) == "ABSENT"
    assert classify({}) == "NOT_STARTED"
    an = detect_anomalies([
        {"employeeId": "E1", "date": "2026-09-09", "checkIn": {"time": "07:00"}},
        {"employeeId": "E2", "date": "2026-09-09", "expected": True},
        {"employeeId": "E3", "date": "2026-09-09", "checkIn": {"time": "1"},
         "checkOut": {"time": "2"}},
    ])
    assert [a["type"] for a in an] == ["MISSING_CHECKOUT", "ABSENT"]
    assert an[0]["priority"] == "HIGH"


def test_timeline_api(client):
    r = client.post("/api/vip/training/timeline",
                    json={"startDate": "2026-09-07", "offDates": ["2026-09-08"]},
                    headers=_hdr())
    assert r.status_code == 200 and len(r.json()["timeline"]) == 12
    assert client.post("/api/vip/training/timeline", json={},
                       headers=_hdr()).status_code == 422


def test_live_degraded(client):
    r = client.get("/api/vip/attendance/live", headers=_hdr())
    assert r.status_code == 200 and r.json()["degraded"] is True
    r = client.get("/api/vip/training/active", headers=_hdr())
    assert r.status_code == 200 and "count" in r.json()
