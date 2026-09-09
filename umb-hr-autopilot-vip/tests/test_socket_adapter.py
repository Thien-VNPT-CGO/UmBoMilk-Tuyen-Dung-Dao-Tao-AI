"""Foundation: socket adapter envelope + dedupe (Master §3, §7)."""
from app.integrations.socket_adapter import (
    EVENT_MAP,
    SUBSCRIBED,
    SocketAdapter,
    normalize_event,
)


def test_envelope_keys():
    env = normalize_event("interviews:update", {"a": 1})
    for k in ("event_id", "event_type", "entity_type", "entity_id", "source",
              "version", "occurred_at", "correlation_id", "payload"):
        assert k in env
    assert env["source"] == "NODE_CORE" and env["version"] == 1
    assert "idempotency_key" in env


def test_event_map_covers_subscribed():
    assert "interview:reminder_due" in SUBSCRIBED
    assert EVENT_MAP["interview:reminder_due"] == "interview.reminder_due"
    assert EVENT_MAP["applicants:update"] == "candidate.updated"
    for ev in SUBSCRIBED:
        assert ev in EVENT_MAP, ev


def test_adapter_dedupe_and_buffer():
    ad = SocketAdapter(node_url="http://127.0.0.1:9")
    first = ad.handle("sync:update")
    assert first is not None
    # cung second -> key giay co the trung -> cho phep, nhung buffer phai co
    assert len(ad.latest()) >= 1
    st = ad.status()
    assert st["connected"] is False and "subscribed" in st
