"""VIP auth: user JWT (HttpOnly cookie / Bearer) + service-to-service auth.

Master §36: production KHONG dung `hr/hr123` lam service credential.
Service goi Node Core kem X-VIP-Service / X-VIP-Actor / X-Correlation-Id.
Service secret KHONG bao gio expose frontend.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings

ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def mint_token(sub: str, role: str, branch_scope: list[str] | None = None,
               extra: dict | None = None, minutes: int | None = None) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "role": role,
        "branch_scope": branch_scope or [],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes or s.JWT_EXPIRES_MIN)).timestamp()),
        "jti": uuid.uuid4().hex,
        "iss": "umb-vip",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, s.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    s = get_settings()
    return jwt.decode(token, s.SECRET_KEY, algorithms=[ALGORITHM], issuer="umb-vip")


def check_service_auth(client_id: str, secret: str) -> bool:
    """Service-to-service auth (timing-safe compare). Dev cho phep khi chua cau hinh? KHONG —
    production bat buoc co secret; thieu secret thi tu choi de tranh mode mo."""
    import hmac
    s = get_settings()
    if not s.SERVICE_SECRET:
        return False
    return hmac.compare_digest(client_id or "", s.SERVICE_CLIENT_ID) and \
        hmac.compare_digest(secret or "", s.SERVICE_SECRET)


def new_correlation_id() -> str:
    return uuid.uuid4().hex[:12]
