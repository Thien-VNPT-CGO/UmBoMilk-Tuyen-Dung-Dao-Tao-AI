"""RBAC + Branch Scope ke thua Node Core (Master §37).

VIP roles: SUPER_ADMIN > ADMIN > HR > BRANCH_MANAGER > VIEWER.
- Node `Admin`  -> ADMIN (full; SUPER_ADMIN chi dat tay trong VIP DB).
- Node `HR`    -> HR (full du lieu, chuc nang han che hon Admin).
- Node `Manager` -> BRANCH_MANAGER (loc theo branchScope).
- Node `Umbomilk` (ReadOnly) -> VIEWER.
AI Command / bulk action KHONG duoc vuot branch scope cua HR.
"""
from __future__ import annotations

ROLE_RANK = {
    "VIEWER": 1,
    "BRANCH_MANAGER": 2,
    "HR": 3,
    "ADMIN": 4,
    "SUPER_ADMIN": 5,
}

NODE_ROLE_MAP = {
    "Admin": "ADMIN",
    "HR": "HR",
    "Manager": "BRANCH_MANAGER",
    "Umbomilk": "VIEWER",
}


def map_node_role(node_role: str) -> str:
    return NODE_ROLE_MAP.get(node_role or "", "VIEWER")


def has_rank(role: str, minimum: str) -> bool:
    return ROLE_RANK.get(role or "", 0) >= ROLE_RANK.get(minimum or "", 99)


def filter_by_branch_scope(items: list[dict], role: str, scope: list[str],
                           branch_field: str = "branchId") -> list[dict]:
    """HR/ADMIN/VIEWER xem full (giong Node branchScopeFilter); BRANCH_MANAGER loc theo scope."""
    if role in ("ADMIN", "SUPER_ADMIN", "HR", "VIEWER") or not scope:
        if role == "BRANCH_MANAGER" and scope:
            return [x for x in items if x.get(branch_field) in scope]
        return list(items)
    return [x for x in items if x.get(branch_field) in scope]


def can_approve(role: str) -> bool:
    """High-risk action can HR approval (Master §9-10, §33)."""
    return has_rank(role, "HR")


def can_admin_license(role: str) -> bool:
    return has_rank(role, "ADMIN")
