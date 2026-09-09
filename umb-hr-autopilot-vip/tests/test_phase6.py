"""PHASE 6: TEST 90m scheduler, rubric 1/0.5/0, final rule, transcript, override."""
from datetime import datetime

import pytest

from app.core.security import mint_token
from app.workflows.test_rules import (
    check_test_overlap,
    final_recommendation,
    propose,
    score_group,
    validate_test_slot,
    validate_transcript,
)


def _hdr(role="HR"):
    return {"Authorization": "Bearer " + mint_token(sub="hr1", role=role)}


def test_slot_rules():
    assert validate_test_slot(datetime(2026, 9, 14, 8, 0))["ok"]  # T2 08:00
    assert validate_test_slot(datetime(2026, 9, 14, 15, 30))["ok"]  # last start
    assert not validate_test_slot(datetime(2026, 9, 14, 15, 31))["ok"]
    assert not validate_test_slot(datetime(2026, 9, 14, 16, 0))["ok"]  # vuot 17:00
    assert not validate_test_slot(datetime(2026, 9, 13, 10, 0))["ok"]  # Sunday
    base = datetime(2026, 9, 14, 9, 0)
    assert check_test_overlap(base, [datetime(2026, 9, 14, 10, 0)]) != []  # 60p < 90
    assert check_test_overlap(base, [datetime(2026, 9, 14, 10, 30)]) == []  # dung 90


def test_rubric_and_final_rule():
    assert score_group([1.0] * 10)["total"] == 10
    assert score_group([0.5] * 10)["total"] == 5
    bad = score_group([1.0] * 9)
    assert not bad["ok"]
    bad2 = score_group([0.7] + [1.0] * 9)
    assert not bad2["ok"]  # chi 1/0.5/0
    assert final_recommendation(9.8)["recommendation"] == "FAIL"  # 4.9
    assert final_recommendation(10.0)["recommendation"] == "RETEST"  # 5.0
    assert final_recommendation(15.98)["recommendation"] == "RETEST"  # 7.99
    assert final_recommendation(16.0)["recommendation"] == "PASS_WAITING_OFFICIAL_APPROVAL"  # 8.0


def test_propose_and_insufficient():
    out = propose([1.0] * 10, [1.0] * 10, confidence=0.9)
    assert out["recommendation"] == "PASS_WAITING_OFFICIAL_APPROVAL"
    assert out["ai_proposal"] is True
    low = propose([1.0] * 10, [1.0] * 10, confidence=0.5)
    assert low["status"] == "INSUFFICIENT_EVIDENCE" and low["score"] is None
    bad = propose([1.0] * 5, [1.0] * 10)
    assert not bad["ok"]


def test_transcript_validation():
    good = [{"speaker": "HR", "start_time": 0, "end_time": 5, "text": "chao"}]
    assert validate_transcript(good) == {"ok": True, "count": 1}
    assert not validate_transcript([{"speaker": "HR"}])["ok"]
    assert not validate_transcript([{"speaker": "a", "start_time": 0, "end_time": 1}])["ok"]


def test_schedule_validate_api(client):
    r = client.post("/api/vip/test/schedule-validate",
                    json={"scheduledAt": "2026-09-14T08:00:00"}, headers=_hdr())
    assert r.status_code == 200 and r.json()["duration_min"] == 90
    r = client.post("/api/vip/test/schedule-validate",
                    json={"scheduledAt": "2026-09-13T08:00:00"}, headers=_hdr())
    assert r.status_code == 400
    r = client.post("/api/vip/test/schedule-validate",
                    json={"scheduledAt": "not-a-date"}, headers=_hdr())
    assert r.status_code == 400


def test_propose_and_transcript_api(client):
    h = _hdr()
    r = client.post("/api/vip/test/propose",
                    json={"employee_id": "E1", "part1": [1.0] * 10,
                          "part2": [0.5] * 10, "confidence": 0.8}, headers=h)
    assert r.status_code == 200
    assert r.json()["total10"] == 7.5 and r.json()["recommendation"] == "RETEST"
    r = client.post("/api/vip/test/propose",
                    json={"employee_id": "E1", "part1": [2.0] * 10,
                          "part2": [1.0] * 10}, headers=h)
    assert r.status_code == 400
    r = client.post("/api/vip/test/transcript",
                    json={"employee_id": "E1", "segments": [
                        {"speaker": "HR", "start_time": 0, "end_time": 3, "text": "hi"}]},
                    headers=h)
    assert r.status_code == 200 and r.json()["count"] == 1
    # finalize uy quyen Node; Core offline -> 502, khong crash; decision la -> 400
    r = client.post("/api/vip/test/E1/finalize", json={"decision": "AUTO"},
                    headers=h)
    assert r.status_code == 400
    r = client.post("/api/vip/test/E1/finalize",
                    json={"decision": "RETEST"}, headers=h)
    assert r.status_code in (200, 502)
