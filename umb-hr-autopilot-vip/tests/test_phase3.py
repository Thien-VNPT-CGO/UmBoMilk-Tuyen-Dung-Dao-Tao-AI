"""PHASE 3: inbox/notifications RBAC + Next Best Action rules."""
import pytest

from app.core.security import mint_token
from app.workflows.next_action import candidate_action, employee_action


def _hdr(role="HR"):
    return {"Authorization": "Bearer " + mint_token(sub="hr1", role=role)}


def test_inbox_crud_guards(client):
    assert client.get("/api/exceptions").status_code == 401
    # create can HR
    r = client.post("/api/exceptions", json={"category": "ZALO_UNKNOWN", "priority": "HIGH",
                                             "summary": "test", "suggested_action": "xem"},
                    headers=_hdr("VIEWER"))
    assert r.status_code == 403
    r = client.post("/api/exceptions", json={"category": "ZALO_UNKNOWN", "priority": "HIGH",
                                             "summary": "test", "suggested_action": "xem"},
                    headers=_hdr("HR"))
    assert r.status_code == 200
    eid = r.json()["id"]
    # invalid priority
    r = client.post("/api/exceptions", json={"category": "X", "priority": "URGENT"},
                    headers=_hdr("HR"))
    assert r.status_code == 400
    # ack/resolve flow
    assert client.post(f"/api/exceptions/{eid}/ack", headers=_hdr("HR")).status_code == 200
    lst = client.get("/api/exceptions?status=ACKNOWLEDGED", headers=_hdr("HR")).json()
    assert any(x["id"] == eid for x in lst["items"])
    assert client.post(f"/api/exceptions/{eid}/resolve", headers=_hdr("HR")).status_code == 200
    assert client.post("/api/exceptions/999999/resolve", headers=_hdr("HR")).status_code == 404


def test_notifications_flow(client):
    assert client.get("/api/notifications").status_code == 401
    r = client.post("/api/notifications", json={"category": "interview", "title": "t", "content": "c"},
                    headers=_hdr("HR"))
    assert r.status_code == 200
    nid = r.json()["id"]
    lst = client.get("/api/notifications", headers=_hdr("HR")).json()
    assert lst["unread"] >= 1 and any(x["id"] == nid for x in lst["items"])
    assert client.post(f"/api/notifications/{nid}/read", headers=_hdr("HR")).status_code == 200
    assert client.post("/api/notifications/999999/read", headers=_hdr("HR")).status_code == 404


def test_next_best_action_rules():
    assert candidate_action({"status": "NEW"})["next_best_action"] == "TAO_LICH_PHONG_VAN"
    assert candidate_action({"status": "INTERVIEW", "interview": {"id": 1}})["next_best_action"] == "NHAC_XAC_NHAN"
    assert candidate_action({"status": "WAITING_HR_REVIEW"})["next_best_action"] == "DUYET_PV"
    assert candidate_action({"status": "PASS"})["next_best_action"] == "CHUYEN_TRAINING"
    assert employee_action({"status": "TRAINING", "trainingDaysCompleted": 7})["next_best_action"] == "TAO_LICH_TEST"
    assert employee_action({"status": "TRAINING", "trainingDaysCompleted": 3})["next_best_action"] == "THEO_DOI_TRAINING"
    e = {"status": "TRAINING", "testRecommendation": "PASS_WAITING_OFFICIAL_APPROVAL",
         "testFinalPending": True, "testScore10": 8.6}
    assert employee_action(e)["next_best_action"] == "DUYET_OFFICIAL"
    assert employee_action({"status": "OFFICIAL"})["next_best_action"] == "THEO_DOI_CHAM_CONG"


def test_brief_degraded_without_core(client):
    # Core offline (127.0.0.1:9) -> van 200, counts 0, degraded
    r = client.get("/api/dashboard/brief", headers=_hdr("HR"))
    assert r.status_code == 200
    body = r.json()
    assert body["interview_today"] == 0 and body["degraded"] is True
    assert "next_actions" in body
