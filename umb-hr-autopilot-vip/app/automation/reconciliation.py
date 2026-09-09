"""Reconciliation: Node Core vs VIP workflow (Master §25).

Dinh ky doi chieu; mismatch -> DATA_CONFLICT (Exception Inbox).
KHONG auto overwrite khi khong chac source thang.
"""
from __future__ import annotations


def reconcile(entity_type: str, entity_id: str, node_state: str,
              vip_state: str, sheet_state: str = "") -> dict:
    states = {s for s in (node_state, vip_state, sheet_state) if s}
    if len(states) <= 1:
        return {"status": "MATCH"}
    # NEU VIP dang o trang thai cho (PENDING/PROCESSING) thi tin Node hon.
    if (vip_state or "").endswith(("PENDING", "PROCESSING", "PENDING_CONFIRM")):
        recommended = "NODE_CORE"
    elif not node_state:
        recommended = "VIP"
    else:
        recommended = "NODE_CORE"
    return {"status": "DATA_CONFLICT",
            "detail": f"{entity_type}:{entity_id} Node={node_state} Sheet={sheet_state} VIP={vip_state}",
            "recommended_source": recommended}
