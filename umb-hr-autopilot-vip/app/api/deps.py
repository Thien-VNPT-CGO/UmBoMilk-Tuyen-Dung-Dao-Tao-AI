"""FastAPI dependencies: user JWT (cookie HttpOnly / Bearer) + service auth."""
from __future__ import annotations

from fastapi import Cookie, Depends, Header, HTTPException, status

from app.core.permissions import has_rank
from app.core.security import check_service_auth, decode_token

COOKIE_NAME = "umb_vip_token"


def _decode_bearer(authorization: str | None) -> dict | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return decode_token(authorization[7:])
    except Exception:
        return None


def current_user(authorization: str | None = Header(default=None),
                 umb_vip_token: str | None = Cookie(default=None)) -> dict:
    claims = _decode_bearer(authorization)
    if claims is None and umb_vip_token:
        try:
            claims = decode_token(umb_vip_token)
        except Exception:
            claims = None
    if not claims:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chua dang nhap")
    return claims


def require_rank(minimum: str):
    def dep(user: dict = Depends(current_user)) -> dict:
        if not has_rank(user.get("role", ""), minimum):
            raise HTTPException(status_code=403, detail="Khong co quyen")
        return user
    return dep


def service_auth(x_vip_client: str | None = Header(default=None, alias="X-VIP-Client"),
                 x_vip_secret: str | None = Header(default=None, alias="X-VIP-Secret")) -> dict:
    if not check_service_auth(x_vip_client or "", x_vip_secret or ""):
        raise HTTPException(status_code=401, detail="Service auth khong hop le")
    return {"client": x_vip_client}


def get_db():
    from app.db.base import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
