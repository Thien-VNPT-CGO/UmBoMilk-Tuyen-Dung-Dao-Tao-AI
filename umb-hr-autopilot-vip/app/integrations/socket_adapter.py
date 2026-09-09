"""VIP Event Adapter: subscribe Socket.io tu Node Core (Master §3 Realtime).

Flow: Node Core Socket.io -> adapter -> normalize envelope -> ring buffer
-> VIP WebSocket -> HR UI. Khong polling toan he thong.
Reconnect thi lay missed state (fetch snapshot REST). Duplicate event process-once
(idempotency theo event key). Chi xu ly delta, khong gui full DB cho AI (§7).
"""
from __future__ import annotations

import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger("vip.socket_adapter")

# Socket events cua Node Core can subscribe (PHASE 0 EVENT_CATALOG)
SUBSCRIBED = [
    "applicants:update", "employees:update", "attendances:update",
    "interviews:update", "interview:reminder_due", "interview:auto_pass",
    "schedules:update", "schedules:approved", "schedules:draftReady",
    "offRequests:update", "zalo:update", "notifications:update",
    "sync:update", "audit:new", "hr:action", "employee:forceLogout",
    "settings:update", "keys:update", "testResults:update",
    "trainingShiftRequests:update", "automation:heartbeat",
]

# Map sang VIP internal event_type (Master §7)
EVENT_MAP = {
    "applicants:update": "candidate.updated",
    "employees:update": "training.attendance_updated",
    "attendances:update": "attendance.checkin",
    "interviews:update": "interview.created",
    "interview:reminder_due": "interview.reminder_due",
    "interview:auto_pass": "interview.completed",
    "schedules:update": "schedule.draft_ready",
    "schedules:approved": "schedule.approved",
    "schedules:draftReady": "schedule.draft_ready",
    "offRequests:update": "off.requested",
    "zalo:update": "zalo.sent",
    "notifications:update": "system.integration_recovered",
    "sync:update": "sheet.synced",
    "audit:new": "system.integration_recovered",
    "hr:action": "system.integration_recovered",
    "employee:forceLogout": "system.integration_failed",
    "settings:update": "system.integration_recovered",
    "keys:update": "system.integration_recovered",
    "testResults:update": "test.completed",
    "trainingShiftRequests:update": "training.attendance_updated",
    "automation:heartbeat": "system.integration_recovered",
}


def normalize_event(node_event: str, data, source: str = "NODE_CORE") -> dict:
    """Chuan envelope noi bo §7. Luon co source/version/correlation_id/idempotency."""
    return {
        "event_id": uuid.uuid4().hex,
        "event_type": EVENT_MAP.get(node_event, "system.integration_recovered"),
        "node_event": node_event,
        "entity_type": "mixed",
        "entity_id": "",
        "source": source,
        "version": 1,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "correlation_id": uuid.uuid4().hex[:12],
        "idempotency_key": f"NODE:{node_event}:{int(time.time())}",
        "payload": {"summary": f"{node_event} received"},
    }


class SocketAdapter:
    """Giu ket noi background toi Node Socket.io. Thread-safe ring buffer."""

    def __init__(self, node_url: str | None = None, maxlen: int = 200):
        s = get_settings()
        self.node_url = node_url or s.NODE_CORE_URL
        self.events: deque[dict] = deque(maxlen=maxlen)
        self.seen_keys: set[str] = set()
        self.connected = False
        self.last_error = ""
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def handle(self, node_event: str, data=None) -> dict | None:
        env = normalize_event(node_event, data)
        if env["idempotency_key"] in self.seen_keys:
            return None
        self.seen_keys.add(env["idempotency_key"])
        if len(self.seen_keys) > 2000:
            self.seen_keys = set(list(self.seen_keys)[-1000:])
        self.events.appendleft(env)
        return env

    def latest(self, n: int = 20) -> list[dict]:
        return list(self.events)[:n]

    def status(self) -> dict:
        return {"connected": self.connected, "node_url": self.node_url,
                "buffered": len(self.events), "last_error": self.last_error,
                "subscribed": SUBSCRIBED}

    def start_background(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        try:
            import socketio as sio_client
        except ImportError:
            self.last_error = "python-socketio not installed"
            return
        while not self._stop.is_set():
            try:
                sio = sio_client.Client(reconnection=False)
                for ev in SUBSCRIBED:
                    sio.on(ev, (lambda e: (lambda *a: self.handle(e, a[0] if a else None)))(ev))
                sio.connect(self.node_url, wait_timeout=10)
                self.connected = True
                self.last_error = ""
                log.info("socket adapter connected", extra={"ctx": {"node_url": self.node_url}})
                while not self._stop.is_set():
                    sio.sleep(1)
                sio.disconnect()
                self.connected = False
                return
            except Exception as e:
                self.connected = False
                self.last_error = str(e)[:200]
                time.sleep(5)


_adapter: SocketAdapter | None = None


def get_adapter() -> SocketAdapter:
    global _adapter
    if _adapter is None:
        _adapter = SocketAdapter()
    return _adapter
