"""PHASE 8: NLU rule-based + preview-first + bulk partial + RBAC."""
from app.ai.command_router import parse_command
from app.core.security import mint_token


def _hdr(role="HR"):
    return {"Authorization": "Bearer " + mint_token(sub="hr1", role=role)}


def test_parse_intents():
    p = parse_command("Xếp lịch phỏng vấn các ứng viên chưa có lịch vào sáng mai")
    assert p["intent"] == "bulk_schedule_interview"
    assert p["args"]["date"] is not None and len(p["args"]["slots"]) > 0
    assert all(s < "12:00-12:30" for s in p["args"]["slots"])  # sang
    p2 = parse_command("nhắc xác nhận giúp tôi")
    assert p2["intent"] == "remind_unconfirmed" and p2["confidence"] == 0.9
    assert parse_command("báo cáo hôm nay")["intent"] == "morning_brief"
    assert parse_command("duyệt test")["intent"] == "list_test_pending"
    assert parse_command("xyz abc 123")["intent"] == "needs_clarification"


def test_command_preview_guards(client):
    assert client.post("/api/vip/ai/command", json={"text": "x"}).status_code == 401
    r = client.post("/api/vip/ai/command", json={"text": "Xếp lịch phỏng vấn sáng mai"},
                    headers=_hdr("VIEWER"))
    assert r.status_code == 403
    r = client.post("/api/vip/ai/command",
                    json={"text": "Xếp lịch phỏng vấn các ứng viên chưa có lịch vào sáng mai"},
                    headers=_hdr())
    assert r.status_code == 200
    body = r.json()
    assert body["intent"] == "bulk_schedule_interview"
    assert body["requires_confirmation"] is True
    assert "rbac" in body
    r = client.post("/api/vip/ai/command", json={"text": "   "}, headers=_hdr())
    assert r.status_code == 400


def test_execute_needs_confirm_and_safe(client):
    h = _hdr()
    r = client.post("/api/vip/ai/execute",
                    json={"intent": "morning_brief", "confirmed": False}, headers=h)
    assert r.status_code == 400
    # Core offline -> degraded nhung van 200
    r = client.post("/api/vip/ai/execute",
                    json={"intent": "morning_brief", "confirmed": True}, headers=h)
    assert r.status_code == 200 and r.json()["degraded"] is True
    r = client.post("/api/vip/ai/execute",
                    json={"intent": "remind_unconfirmed", "confirmed": True}, headers=h)
    assert r.status_code == 200 and "reminded" in r.json()
    # bulk thieu applicant_ids -> 400 (khong thuc thi mu)
    r = client.post("/api/vip/ai/execute",
                    json={"intent": "bulk_schedule_interview",
                          "args": {"date": "2026-09-14", "slots": ["08:00-08:30"]},
                          "confirmed": True}, headers=h)
    assert r.status_code == 400
    r = client.post("/api/vip/ai/execute",
                    json={"intent": "unknown_xyz", "confirmed": True}, headers=h)
    assert r.status_code == 400
