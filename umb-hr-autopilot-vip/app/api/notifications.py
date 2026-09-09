"""Notification Center (Master §31): bell + unread badge, realtime tu VIP."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_db, require_rank
from app.db.models import Notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

CATEGORIES = ("all", "action", "interview", "training", "test", "attendance", "system")


class NotifyIn(BaseModel):
    category: str = "system"
    title: str = ""
    content: str = ""
    entity_id: str = ""


@router.get("")
def list_notifs(category: str = "all", unread: bool = False,
                user: dict = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(Notification).order_by(Notification.id.desc()).limit(100)
    items = q.all()
    if category != "all":
        items = [x for x in items if x.category == category]
    if unread:
        items = [x for x in items if not x.read]
    return {"items": [{
        "id": x.id, "category": x.category, "title": x.title, "content": x.content,
        "actor": x.actor, "entity_id": x.entity_id, "read": bool(x.read),
        "created_at": x.created_at.isoformat() if x.created_at else None,
    } for x in items],
        "unread": db.query(Notification).filter_by(read=0).count()}


@router.post("")
def push(body: NotifyIn, user: dict = Depends(require_rank("HR")),
         db: Session = Depends(get_db)):
    n = Notification(category=body.category[:32], title=body.title[:256],
                     content=body.content, actor=user.get("sub", "SYSTEM"),
                     entity_id=body.entity_id[:128])
    db.add(n)
    db.commit()
    db.refresh(n)
    return {"success": True, "id": n.id}


@router.post("/{nid}/read")
def mark_read(nid: int, user: dict = Depends(current_user),
              db: Session = Depends(get_db)):
    n = db.query(Notification).filter_by(id=nid).one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Khong tim thay")
    n.read = 1
    db.commit()
    return {"success": True}
