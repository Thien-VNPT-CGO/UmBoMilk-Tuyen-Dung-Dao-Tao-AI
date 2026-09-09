"""Idempotency + retry backoff (Master §24). Engine day du o PHASE 9."""
from __future__ import annotations

RETRY_DELAYS_SEC = [30, 120, 600, 1800]  # 30s, 2m, 10m, 30m


def action_key(*parts: str) -> str:
    return ":".join(p.strip().upper() for p in parts if p)


def interview_reminder_key(interview_id: str, kind: str) -> str:
    return action_key("INTERVIEW", interview_id, kind)  # kind: T30/T15/T5


def zalo_key(business_event: str, recipient: str) -> str:
    return action_key("ZALO", business_event, recipient)


class MemoryIdempotency:
    """Store tam in-memory (PHASE 2). PHASE 9 chuyen Redis/DB + DLQ UI."""

    def __init__(self):
        self._done: set[str] = set()

    def seen(self, key: str) -> bool:
        return key in self._done

    def mark(self, key: str) -> bool:
        """Tra ve False neu da ton tai (SKIP), True neu moi (EXECUTE)."""
        if key in self._done:
            return False
        self._done.add(key)
        return True
