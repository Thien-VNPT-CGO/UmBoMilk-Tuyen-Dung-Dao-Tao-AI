"""Exception Inbox (Master §12): chi viec Automation khong tu giai quyet.

Status: OPEN / ACKNOWLEDGED / RESOLVED / IGNORED.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_db, require_rank
from app.db.models import ExceptionItem

router = APIRouter(prefix="/api/exceptions", tags=["exceptions"])

PRIORITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "NORMAL": 2}


class ExceptionIn(BaseModel):
    category: str
    priority: str = "NORMAL"
    entity_type: str = ""
    entity_id: str = ""
    summary: str = ""
    reason: str = ""
    suggested_action: str = ""
    assigned_to: str = ""


@router.get("")
def list_exceptions(status: str = "OPEN", user: dict = Depends(current_user),
                    db: Session = Depends(get_db)):
    q = db.query(ExceptionItem)
    if status != "ALL":
        q = q.filter(ExceptionItem.status == status)
    items = q.order_by(ExceptionItem.id.desc()).limit(200).all()
    items = sorted(items, key=lambda x: (PRIORITY_ORDER.get(x.priority, 9), -x.id))
    return {"items": [{
        "id": x.id, "category": x.category, "priority": x.priority,
        "entity_type": x.entity_type, "entity_id": x.entity_id,
        "summary": x.summary, "reason": x.reason,
        "suggested_action": x.suggested_action, "status": x.status,
        "assigned_to": x.assigned_to, "created_at": x.created_at.isoformat() if x.created_at else None,
        "resolved_by": x.resolved_by,
        "resolved_at": x.resolved_at.isoformat() if x.resolved_at else None,
    } for x in items]}


@router.post("")
def create_exception(body: ExceptionIn, user: dict = Depends(require_rank("HR")),
                     db: Session = Depends(get_db)):
    if body.priority not in PRIORITY_ORDER:
        raise HTTPException(status_code=400, detail="priority: CRITICAL/HIGH/NORMAL")
    x = ExceptionItem(category=body.category[:64], priority=body.priority,
                      entity_type=body.entity_type[:32], entity_id=body.entity_id[:128],
                      summary=body.summary[:256], reason=body.reason,
                      suggested_action=body.suggested_action[:256],
                      assigned_to=body.assigned_to[:64])
    db.add(x)
    db.commit()
    db.refresh(x)
    return {"success": True, "id": x.id}


@router.post("/{item_id}/ack")
def ack(item_id: int, user: dict = Depends(current_user), db: Session = Depends(get_db)):
    x = db.query(ExceptionItem).filter_by(id=item_id).one_or_none()
    if not x:
        raise HTTPException(status_code=404, detail="Khong tim thay")
    x.status = "ACKNOWLEDGED"
    x.assigned_to = user.get("sub", "")
    db.commit()
    return {"success": True}


@router.post("/{item_id}/resolve")
def resolve(item_id: int, user: dict = Depends(require_rank("HR")),
            db: Session = Depends(get_db)):
    x = db.query(ExceptionItem).filter_by(id=item_id).one_or_none()
    if not x:
        raise HTTPException(status_code=404, detail="Khong tim thay")
    x.status = "RESOLVED"
    x.resolved_by = user.get("sub", "")
    x.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True}


@router.post("/{item_id}/ignore")
def ignore(item_id: int, user: dict = Depends(require_rank("HR")),
           db: Session = Depends(get_db)):
    x = db.query(ExceptionItem).filter_by(id=item_id).one_or_none()
    if not x:
        raise HTTPException(status_code=404, detail="Khong tim thay")
    x.status = "IGNORED"
    x.resolved_by = user.get("sub", "")
    x.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True}
