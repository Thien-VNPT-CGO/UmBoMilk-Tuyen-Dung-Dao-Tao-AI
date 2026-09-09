"""PHASE 7: OFF window/conflict + OR-Tools scheduler + draft/approve."""
from datetime import datetime

from app.core.security import mint_token
from app.workflows.off_rules import (
    check_conflict,
    is_window_open,
    validate_off_request,
    week_dates,
)
from app.workflows.scheduler import schedule_week
from zoneinfo import ZoneInfo


def _hdr(role="HR"):
    return {"Authorization": "Bearer " + mint_token(sub="hr1", role=role)}


def test_window_rules():
    vn = ZoneInfo("Asia/Ho_Chi_Minh")
    assert is_window_open(datetime(2026, 9, 11, 12, 0, tzinfo=vn))  # T6 12:00
    assert is_window_open(datetime(2026, 9, 12, 14, 59, tzinfo=vn))  # T7 14:59
    assert not is_window_open(datetime(2026, 9, 12, 15, 0, tzinfo=vn))  # T7 15:00
    assert not is_window_open(datetime(2026, 9, 14, 10, 0, tzinfo=vn))  # T2
    assert validate_off_request(["2026-09-21", "2026-09-22"],
                                now=datetime(2026, 9, 11, 13, 0, tzinfo=vn))["ok"]
    assert not validate_off_request(["2026-09-21"],
                                    now=datetime(2026, 9, 11, 13, 0, tzinfo=vn))["ok"]
    assert not validate_off_request(["2026-09-21", "2026-09-22"],
                                    now=datetime(2026, 9, 14, 10, 0, tzinfo=vn))["ok"]
    assert len(week_dates("2026-09-14")) == 7


def test_conflict_first_wins():
    approved = [{"branchId": "CN1", "shift": "CA_SANG", "off_date": "2026-09-21",
                 "employeeId": "E1"}]
    # cung branch+shift+date -> nguoi sau reject
    assert check_conflict("CN1", "CA_SANG", "2026-09-21", approved)["employeeId"] == "E1"
    # cung branch khac shift -> allowed
    assert check_conflict("CN1", "CA_TOI", "2026-09-21", approved) is None
    # khac branch -> allowed
    assert check_conflict("CN2", "CA_SANG", "2026-09-21", approved) is None


def test_ortools_scheduler():
    emps = [{"id": f"E{i}", "branchId": "CN1", "shifts": ["CA_SANG", "CA_TOI"]}
            for i in range(4)]
    staffing = {d: {"CA_SANG": 1, "CA_TOI": 1} for d in
                ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]}
    res = schedule_week(emps, staffing, time_limit_sec=5)
    assert res["ok"]
    a = res["assignments"]
    # hard: moi NV moi ngay toi da 1 ca
    for eid, days in a.items():
        assert len(days) == 7
    # hard: staffing du (it nhat 1 NV moi ca moi ngay)
    for d in ["MON", "TUE"]:
        on = [e for e in emps if a[e["id"]][d] != "OFF"]
        assert len(on) >= 2
    # soft: fairness chenh lech <= 2 voi case can bang
    assert res["stats"]["max_load"] - res["stats"]["min_load"] <= 2
    # hard: OFF duoc ton trong
    res2 = schedule_week(emps, staffing, off={("E0", "MON")}, time_limit_sec=5)
    assert res2["assignments"]["E0"]["MON"] == "OFF"


def test_off_check_api(client):
    r = client.get("/api/vip/schedule/off-window", headers=_hdr())
    assert r.status_code == 200 and "isOpen" in r.json()
    # ngoai window (bay gio) hoac sai so ngay -> 400; conflict -> 409
    r = client.post("/api/vip/schedule/off-check",
                    json={"branchId": "CN1", "shift": "CA_SANG", "dates": ["2026-09-21"]},
                    headers=_hdr())
    assert r.status_code == 400
    r = client.post("/api/vip/schedule/off-check",
                    json={"branchId": "CN1", "shift": "CA_SANG",
                          "dates": ["2026-09-21", "2026-09-22"],
                          "approved": [{"branchId": "CN1", "shift": "CA_SANG",
                                        "off_date": "2026-09-21", "employeeId": "E1"}]},
                    headers=_hdr())
    assert r.status_code in (400, 409)  # 400 neu ngoai window, 409 neu trong window


def test_draft_approve_api(client):
    h = _hdr()
    emps = [{"id": "E1", "shifts": ["CA_SANG"]}, {"id": "E2", "shifts": ["CA_SANG"]}]
    staffing = {"MON": {"CA_SANG": 1}}
    r = client.post("/api/vip/schedule/draft",
                    json={"employees": emps, "staffing": staffing}, headers=h)
    assert r.status_code == 200
    did = r.json()["draft_id"]
    assert r.json()["ok"] is True
    r = client.post(f"/api/vip/schedule/approve/{did}", headers=h)
    assert r.status_code == 200 and r.json()["success"] is True
    assert r.status_code == 200
    assert client.post("/api/vip/schedule/approve/999999", headers=h).status_code == 404
    assert client.post("/api/vip/schedule/draft",
                       json={"employees": emps, "staffing": staffing},
                       headers=_hdr("VIEWER")).status_code == 403
