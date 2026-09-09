"""OFF + Schedule API (Master §20, §21, §42). Preview -> HR Approve."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_db, require_rank
from app.db.models import WorkflowState
from app.integrations.node_core import NodeCoreClient
from app.workflows.off_rules import check_conflict, is_window_open, validate_off_request
from app.workflows.scheduler import DAYS, schedule_week

router = APIRouter(prefix="/api/vip/schedule", tags=["vip-schedule"])


@router.get("/off-window")
def off_window(user: dict = Depends(current_user)):
    return {"isOpen": is_window_open(), "window": "T6 12:00 - T7 15:00 (VN)"}


class OffCheckIn(BaseModel):
    branchId: str
    shift: str
    dates: list[str]
    approved: list[dict] = []


@router.post("/off-check")
def off_check(body: OffCheckIn, user: dict = Depends(current_user)):
    v = validate_off_request(body.dates)
    if not v["ok"]:
        raise HTTPException(status_code=400, detail=v["error"])
    conflicts = []
    for d in body.dates:
        c = check_conflict(body.branchId, body.shift, d, body.approved)
        if c:
            conflicts.append({"date": d, "winner": c.get("employeeId")})
    if conflicts:
        raise HTTPException(status_code=409, detail={"conflicts": conflicts})
    return {"ok": True}


class DraftIn(BaseModel):
    employees: list[dict]
    staffing: dict[str, dict[str, int]]
    off: list[list[str]] = []  # [[emp_id, day]]
    fixed_shift: dict[str, str] = {}


@router.post("/draft")
def draft(body: DraftIn, user: dict = Depends(require_rank("HR")),
          db: Session = Depends(get_db)):
    res = schedule_week(body.employees, body.staffing,
                        off=set(map(tuple, body.off)), fixed_shift=body.fixed_shift)
    if not res["ok"]:
        raise HTTPException(status_code=422, detail=res.get("reason", "NO_SOLUTION"))
    w = WorkflowState(entity_type="schedule", entity_id=f"draft-{datetime.now().date()}",
                      state="DRAFT_READY", source="VIP_AUTOMATION",
                      correlation_id=user.get("sub", "")[:12],
                      payload={"assignments": res["assignments"], "stats": res["stats"]})
    db.add(w)
    db.commit()
    db.refresh(w)
    return {"draft_id": w.id, **res}


@router.post("/approve/{draft_id}")
def approve(draft_id: int, user: dict = Depends(require_rank("HR")),
            db: Session = Depends(get_db)):
    w = db.query(WorkflowState).filter_by(id=draft_id).one_or_none()
    if not w or w.entity_type != "schedule":
        raise HTTPException(status_code=404, detail="Draft khong ton tai")
    w.state = "APPROVED"
    db.commit()
    # Best-effort write ve Node Core (that bai thi van giu APPROVED + retry PHASE 9)
    node_ok = False
    try:
        r = NodeCoreClient().post("/api/schedules/approve-next-week", {},
                                  actor=user.get("sub", "HR"))
        node_ok = r.status_code == 200
    except Exception:
        node_ok = False
    return {"success": True, "draft_id": draft_id, "node_synced": node_ok}
