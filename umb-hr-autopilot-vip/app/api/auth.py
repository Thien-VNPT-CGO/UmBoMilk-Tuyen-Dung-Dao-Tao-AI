"""VIP auth: proxy login Node Core (lay role/branchScope that) + mint VIP JWT.

Master §36: khong dung hr/hr123 lam service credential production.
Dev co the dung account Node de test; VIP mint token rieng, luu HttpOnly cookie.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.api.deps import COOKIE_NAME, current_user
from app.core.config import get_settings
from app.core.permissions import map_node_role
from app.core.security import mint_token, verify_password
from app.integrations.node_core import NodeCoreClient

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginIn, response: Response):
    s = get_settings()
    # 1) Thu Node Core proxy (that nhat: dung users/RBAC/branchScope san co)
    try:
        data = NodeCoreClient().login(body.username, body.password)
        node_user = data.get("user", {})
        role = map_node_role(node_user.get("role", ""))
        scope = node_user.get("branchScope", []) or []
        sub = node_user.get("username", body.username)
    except Exception:
        # 2) Dev fallback: tai khoan dev cuc bo (khong thay the Node o production)
        if s.is_prod:
            raise HTTPException(status_code=401, detail="Sai tai khoan")
        if body.username != s.DEV_ADMIN_USER or not s.DEV_ADMIN_HASH or \
                not verify_password(body.password, s.DEV_ADMIN_HASH):
            raise HTTPException(status_code=401, detail="Sai tai khoan")
        role, scope, sub = s.DEV_ROLE, [], body.username
    token = mint_token(sub=sub, role=role, branch_scope=scope)
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax", max_age=60 * 60 * 12)
    return {"success": True, "token": token, "user": {"username": sub, "role": role, "branchScope": scope}}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"success": True}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return {"username": user.get("sub"), "role": user.get("role"),
            "branchScope": user.get("branch_scope", [])}
