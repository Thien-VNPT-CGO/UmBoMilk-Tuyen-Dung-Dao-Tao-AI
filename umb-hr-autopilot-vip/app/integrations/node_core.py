"""Adapter goi Node Core hien tai qua REST (Master §2.2 uu tien #1).

Khong rewrite Core. Moi request kem service headers:
X-VIP-Service / X-VIP-Actor / X-Correlation-Id (§36).
User context (actor) de Audit biet HR nao khoi tao action.
"""
from __future__ import annotations

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.security import new_correlation_id

log = get_logger("vip.node_core")


class NodeCoreClient:
    def __init__(self, base_url: str | None = None, timeout: float | None = None,
                 service_id: str | None = None, service_secret: str | None = None):
        s = get_settings()
        self.base = (base_url or s.NODE_CORE_URL).rstrip("/")
        self.timeout = timeout or s.NODE_CORE_TIMEOUT_SEC
        self.service_id = service_id or s.SERVICE_CLIENT_ID
        self.service_secret = service_secret or s.SERVICE_SECRET

    def _headers(self, actor: str = "SYSTEM", token: str | None = None) -> dict:
        h = {
            "Content-Type": "application/json",
            "X-VIP-Service": self.service_id,
            "X-VIP-Actor": actor,
            "X-Correlation-Id": new_correlation_id(),
        }
        if token:
            h["Authorization"] = f"Bearer {token}"
        return h

    def _url(self, path: str) -> str:
        return f"{self.base}{path}"

    def get(self, path: str, token: str | None = None, actor: str = "SYSTEM",
            params: dict | None = None) -> httpx.Response:
        with httpx.Client(timeout=self.timeout) as c:
            return c.get(self._url(path), headers=self._headers(actor, token), params=params)

    def post(self, path: str, json: dict | None = None, token: str | None = None,
             actor: str = "SYSTEM") -> httpx.Response:
        with httpx.Client(timeout=self.timeout) as c:
            return c.post(self._url(path), headers=self._headers(actor, token), json=json or {})

    def health(self) -> dict:
        try:
            r = self.get("/health")
            return {"status": "HEALTHY" if r.status_code == 200 else "DEGRADED",
                    "http": r.status_code, "body": r.json() if r.status_code == 200 else {}}
        except Exception as e:
            log.info("node health failed", extra={"ctx": {"error": str(e)[:200]}})
            return {"status": "FAILED", "error": str(e)[:200]}

    def login(self, username: str, password: str) -> dict:
        """Proxy login ve Node de lay role/branchScope that (khong luu password)."""
        r = self.post("/api/auth/login", {"username": username, "password": password})
        if r.status_code != 200:
            raise ValueError("login failed")
        return r.json()
