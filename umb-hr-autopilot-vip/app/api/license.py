"""License API: activation (public, rate-limit o proxy) + admin center (ADMIN)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_rank
from app.db.models import AuditLog, VipLicenseDevice, VipLicenseKey, VipLicensePlan
from app.license import service

router = APIRouter(tags=["license"])


class ActivateIn(BaseModel):
    key: str
    device_id: str


@router.post("/api/license/activate")
def activate(body: ActivateIn, db: Session = Depends(get_db)):
    if not body.key or not body.device_id:
        raise HTTPException(status_code=400, detail="Thieu key/device_id")
    out = service.activate(db, body.key.strip(), body.device_id.strip())
    if not out.get("ok"):
        code = 401 if out.get("error") in ("KEY_EXPIRED",) else 403
        if out.get("error") == "KEY_NOT_FOUND":
            code = 404
        raise HTTPException(status_code=code, detail=out)
    return out


@router.get("/api/license/status")
def license_status(token: str, db: Session = Depends(get_db)):
    out = service.check_session(db, token)
    if not out.get("ok"):
        raise HTTPException(status_code=401, detail=out)
    return out


admin = APIRouter(prefix="/api/admin/license", tags=["admin-license"])


@admin.post("/seed")
def seed(user: dict = Depends(require_rank("ADMIN")), db: Session = Depends(get_db)):
    return service.seed_inventory(db)


@admin.get("/keys")
def list_keys(plan: str = "", status: str = "", user: dict = Depends(require_rank("ADMIN")),
             db: Session = Depends(get_db)):
    q = db.query(VipLicenseKey)
    if plan:
        q = q.filter_by(plan_code=plan)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(VipLicenseKey.id).limit(500).all()
    return {"total": q.count(), "plans": [
        {"code": p.code, "max_devices": p.max_devices, "inventory": p.inventory}
        for p in db.query(VipLicensePlan).all()],
        "items": [{"key": k.key, "plan": k.plan_code, "status": k.status,
                   "expires_at": k.expires_at.isoformat() if k.expires_at else None,
                   "devices": db.query(VipLicenseDevice).filter_by(key_id=k.id).count()}
                  for k in rows]}


class AdminActIn(BaseModel):
    action: str  # lock/unlock/revoke/extend/reset_device/force_logout
    value: str = ""


@admin.post("/keys/{key}/action")
def admin_action(key: str, body: AdminActIn, user: dict = Depends(require_rank("ADMIN")),
                 db: Session = Depends(get_db)):
    out = service.admin_action(db, user.get("sub", "ADMIN"), key, body.action, body.value)
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out)
    return out


@admin.get("/audit")
def audit_list(user: dict = Depends(require_rank("ADMIN")), db: Session = Depends(get_db)):
    rows = (db.query(AuditLog).filter_by(entity="VIP_LICENSE")
            .order_by(AuditLog.id.desc()).limit(100).all())
    return {"items": [{"actor": r.actor, "action": r.action, "entity_id": r.entity_id,
                       "before": r.before, "after": r.after,
                       "at": r.created_at.isoformat() if r.created_at else None}
                      for r in rows]}
