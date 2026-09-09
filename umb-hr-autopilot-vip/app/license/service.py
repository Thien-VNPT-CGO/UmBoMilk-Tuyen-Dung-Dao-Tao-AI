"""VIP License service (Master §35). Namespace rieng — cam reuse Employee Key.

- 7 plans, tong 826 keys. Expiry tu FIRST ACTIVATION, server time.
- 6M = calendar month, 1Y = calendar year. TEST: unlimited devices + global
  expiry 10m chung. 2H: max 2. Con lai: 1 device.
- Admin reset device KHONG reset expiry. Lock/revoke -> revoke sessions
  (realtime logout: LICENSE_EXPIRED / revoked).
"""
from __future__ import annotations

import secrets
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import mint_token, new_correlation_id
from app.db.models import (
    AuditLog,
    VipLicenseDevice,
    VipLicenseKey,
    VipLicensePlan,
    VipLicenseSession,
)
from app.license.plans import PLANS

_lock = threading.Lock()

TEST_MINUTES = 10
DURATIONS = {"TEST": ("minutes", 10), "2H": ("hours", 2), "24H": ("hours", 24),
             "7D": ("days", 7), "30D": ("days", 30)}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _add_calendar(base: datetime, months: int = 0, years: int = 0) -> datetime:
    y, m = base.year + years, base.month + months
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    import calendar
    last = calendar.monthrange(y, m)[1]
    return base.replace(year=y, month=m, day=min(base.day, last))


def compute_expiry(plan_code: str, first_activation: datetime) -> datetime:
    if plan_code == "6M":
        return _add_calendar(first_activation, months=6)
    if plan_code == "1Y":
        return _add_calendar(first_activation, years=1)
    kind, val = DURATIONS[plan_code]
    if kind == "minutes":
        return first_activation + timedelta(minutes=val)
    if kind == "hours":
        return first_activation + timedelta(hours=val)
    return first_activation + timedelta(days=val)


def _gen_key(plan_code: str) -> str:
    return f"UMB{plan_code}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"


def seed_inventory(db: Session) -> dict:
    """Tao du inventory 826 keys (idempotent theo plan counts)."""
    for p in PLANS:
        if not db.query(VipLicensePlan).filter_by(code=p.code).one_or_none():
            db.add(VipLicensePlan(code=p.code, duration_desc=p.duration_desc,
                                  max_devices=p.max_devices or 0, inventory=p.inventory))
    db.commit()
    created = 0
    for p in PLANS:
        have = db.query(VipLicenseKey).filter_by(plan_code=p.code).count()
        for _ in range(max(0, p.inventory - have)):
            db.add(VipLicenseKey(key=_gen_key(p.code), plan_code=p.code, status="NEW"))
            created += 1
    db.commit()
    total = db.query(VipLicenseKey).count()
    return {"created": created, "total": total}


def _expire_if_due(key: VipLicenseKey, now: datetime) -> bool:
    if key.status == "ACTIVE" and key.expires_at and now >= key.expires_at.replace(tzinfo=timezone.utc):
        key.status = "EXPIRED"
        return True
    return False


def _audit(db: Session, actor: str, action: str, key: VipLicenseKey, before: dict):
    db.add(AuditLog(actor=actor, action=action, entity="VIP_LICENSE",
                    entity_id=key.key, before=before,
                    after={"status": key.status}, correlation_id=new_correlation_id(),
                    source="VIP"))


def activate(db: Session, key_str: str, device_id: str,
             now: datetime | None = None) -> dict:
    """Kich hoat. Server time authoritative. Tra ve session token hoac loi."""
    now = now or _now()
    with _lock:  # single-process guard; Postgres dung row-lock o prod (PHASE 11)
        key = db.query(VipLicenseKey).filter_by(key=key_str).one_or_none()
        if not key:
            return {"ok": False, "error": "KEY_NOT_FOUND"}
        if key.status in ("LOCKED", "REVOKED"):
            return {"ok": False, "error": f"KEY_{key.status}"}
        _expire_if_due(key, now)
        if key.status == "EXPIRED":
            db.commit()
            return {"ok": False, "error": "KEY_EXPIRED", "realtime": "LICENSE_EXPIRED"}
        if key.status == "NEW":
            key.first_activated_at = now
            if key.plan_code == "TEST":
                # Global expiry chung cho TEST: key TEST dau tien dat moc
                first = (db.query(VipLicenseKey)
                         .filter(VipLicenseKey.plan_code == "TEST",
                                 VipLicenseKey.first_activated_at.isnot(None))
                         .order_by(VipLicenseKey.first_activated_at).first())
                base = first.first_activated_at if first else now
                key.expires_at = base.replace(tzinfo=timezone.utc) + timedelta(minutes=TEST_MINUTES)
                # Dong bo global cho cac TEST key khac
                for other in db.query(VipLicenseKey).filter_by(plan_code="TEST").all():
                    if other.expires_at is None:
                        other.expires_at = key.expires_at
            else:
                key.expires_at = compute_expiry(key.plan_code, now)
            key.status = "ACTIVE"
            _audit(db, device_id, "LICENSE_ACTIVATE", key, {"status": "NEW"})
        devices = db.query(VipLicenseDevice).filter_by(key_id=key.id).all()
        known = [d for d in devices if d.device_id == device_id]
        if not known:
            from app.license.plans import get_plan
            plan = get_plan(key.plan_code)
            limit = plan.max_devices  # None = unlimited
            if limit is not None and len(devices) >= limit:
                db.commit()
                return {"ok": False, "error": "DEVICE_LIMIT",
                        "max_devices": limit}
            db.add(VipLicenseDevice(key_id=key.id, device_id=device_id))
        token = mint_token(sub=f"license:{key.id}", role="LICENSED",
                           extra={"license_key": key.key, "plan": key.plan_code})
        import jwt as _jwt
        jti = _jwt.decode(token, options={"verify_signature": False}).get("jti", "")
        db.add(VipLicenseSession(key_id=key.id, device_id=device_id, token_jti=jti))
        db.commit()
        exp = key.expires_at
        exp_iso = exp.isoformat() if exp else None
        return {"ok": True, "token": token, "plan": key.plan_code,
                "expires_at": exp_iso}


def check_session(db: Session, token: str) -> dict:
    """Verify token con hieu luc (expiry/lock/revoke). Client clock khong anh huong."""
    from app.core.security import decode_token
    try:
        claims = decode_token(token)
    except Exception:
        return {"ok": False, "error": "INVALID_TOKEN"}
    if not str(claims.get("sub", "")).startswith("license:"):
        return {"ok": False, "error": "NOT_LICENSE_TOKEN"}
    ses = db.query(VipLicenseSession).filter_by(token_jti=claims.get("jti", "")).one_or_none()
    if not ses or ses.revoked:
        return {"ok": False, "error": "SESSION_REVOKED", "realtime": "LICENSE_EXPIRED"}
    key = db.query(VipLicenseKey).filter_by(id=ses.key_id).one_or_none()
    if not key or key.status != "ACTIVE":
        return {"ok": False, "error": f"KEY_{key.status if key else 'GONE'}",
                "realtime": "LICENSE_EXPIRED"}
    if key.expires_at and _now() >= key.expires_at.replace(tzinfo=timezone.utc):
        key.status = "EXPIRED"
        db.commit()
        return {"ok": False, "error": "KEY_EXPIRED", "realtime": "LICENSE_EXPIRED"}
    return {"ok": True, "plan": key.plan_code, "key": key.key}


def admin_action(db: Session, actor: str, key_str: str, action: str,
                 value: str = "") -> dict:
    key = db.query(VipLicenseKey).filter_by(key=key_str).one_or_none()
    if not key:
        return {"ok": False, "error": "KEY_NOT_FOUND"}
    before = {"status": key.status}
    if action == "lock":
        key.status = "LOCKED"
    elif action == "unlock":
        key.status = "ACTIVE" if key.first_activated_at else "NEW"
    elif action == "revoke":
        key.status = "REVOKED"
    elif action == "extend":
        days = int(value or 0)
        if key.expires_at:
            key.expires_at = key.expires_at.replace(tzinfo=timezone.utc) + timedelta(days=days)
    elif action == "reset_device":
        db.query(VipLicenseDevice).filter_by(key_id=key.id).delete()
        # KHONG reset expiry
    elif action == "force_logout":
        db.query(VipLicenseSession).filter_by(key_id=key.id).update({VipLicenseSession.revoked: 1})
    else:
        return {"ok": False, "error": "UNKNOWN_ACTION"}
    if action in ("lock", "revoke", "force_logout"):
        db.query(VipLicenseSession).filter_by(key_id=key.id).update({VipLicenseSession.revoked: 1})
    _audit(db, actor, f"LICENSE_{action.upper()}", key, before)
    db.commit()
    return {"ok": True, "action": action, "status": key.status,
            "realtime": "LICENSE_EXPIRED" if action in ("lock", "revoke", "force_logout") else None}
