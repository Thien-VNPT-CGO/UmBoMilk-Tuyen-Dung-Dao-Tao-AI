"""System Health realtime (Master §34). Mot integration loi khong sap tool."""
from __future__ import annotations

import os

from fastapi import APIRouter

from app.core.config import get_settings
from app.integrations.node_core import NodeCoreClient
from app.integrations.socket_adapter import get_adapter

router = APIRouter(tags=["health"])


def _redis_status() -> dict:
    s = get_settings()
    if not s.REDIS_URL:
        return {"status": "DEGRADED", "note": "Chua cau hinh REDIS_URL (fallback in-memory)"}
    try:
        import redis
        r = redis.Redis.from_url(s.REDIS_URL, socket_timeout=3)
        r.ping()
        return {"status": "HEALTHY"}
    except Exception as e:
        return {"status": "FAILED", "error": str(e)[:200]}


def _db_status() -> dict:
    try:
        from app.db.base import build_engine
        eng = build_engine()
        with eng.connect() as c:
            c.exec_driver_sql("SELECT 1")
        return {"status": "HEALTHY"}
    except Exception as e:
        return {"status": "FAILED", "error": str(e)[:200]}


@router.get("/api/vip/system/health")
def system_health():
    node = NodeCoreClient().health()
    adapter = get_adapter().status()
    socket_status = "HEALTHY" if adapter["connected"] else "DEGRADED"
    checks = {
        "NODE_CORE_API": node.get("status", "FAILED"),
        "VIP_DATABASE": _db_status().get("status"),
        "REDIS": _redis_status().get("status"),
        "SOCKET_IO": socket_status,
        "GOOGLE_SHEET": "DEGRADED",   # PHASE 9 reconciliation se do chi tiet
        "ZALO": "DEGRADED",           # PHASE 4 autopilot se do chi tiet
        "AI_PROVIDER": "HEALTHY" if os.environ.get("AI_API_KEY") else "DEGRADED",
        "LICENSE": "READY",           # PHASE 10
    }
    overall = "HEALTHY" if all(v == "HEALTHY" for v in checks.values()) else (
        "FAILED" if "FAILED" in checks.values() else "DEGRADED")
    return {"overall": overall, "checks": checks, "node": node, "socket": adapter}


@router.get("/health")
def health():
    return {"status": "ok", "service": "umb-hr-autopilot-vip"}
