"""VIP events API: buffer tu Socket adapter (PHASE 2 doc-only realtime)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import current_user
from app.integrations.socket_adapter import get_adapter

router = APIRouter(prefix="/api/vip/events", tags=["events"])


@router.get("/latest")
def latest(n: int = 20, user: dict = Depends(current_user)):
    adapter = get_adapter()
    return {"events": adapter.latest(max(1, min(n, 50))), "connected": adapter.connected}
