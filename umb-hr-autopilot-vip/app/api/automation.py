"""Automation Center API (Master §32): mode/status, kill switch, DLQ."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_rank
from app.automation.jobs import JOB_DEFS
from app.automation.modes import MODES
from app.db.models import AutomationJob

router = APIRouter(prefix="/api/automation", tags=["automation"])


def _row(job: AutomationJob) -> dict:
    interval = next((i for n, i, _m in JOB_DEFS if n == job.name), 0)
    return {"name": job.name, "mode": job.mode, "status": job.status,
            "interval_sec": interval, "last_run": job.last_run.isoformat() if job.last_run else None,
            "next_run": job.next_run.isoformat() if job.next_run else None,
            "success": job.success_count, "errors": job.error_count,
            "last_error": job.last_error}


@router.get("")
def list_jobs(user: dict = Depends(require_rank("HR")),
              db: Session = Depends(get_db)):
    names = {j.name for j in db.query(AutomationJob).all()}
    for name, _i, mode in JOB_DEFS:
        if name not in names:
            db.add(AutomationJob(name=name, mode=mode, status="READY"))
    db.commit()
    return {"jobs": [_row(j) for j in db.query(AutomationJob).order_by(AutomationJob.id).all()],
            "paused_all": False}


class ModeIn(BaseModel):
    mode: str


@router.post("/{name}/mode")
def set_mode(name: str, body: ModeIn, user: dict = Depends(require_rank("ADMIN")),
             db: Session = Depends(get_db)):
    if body.mode not in MODES:
        raise HTTPException(status_code=400, detail="mode: MANUAL/ASSISTED/AUTOPILOT")
    job = db.query(AutomationJob).filter_by(name=name).one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job khong ton tai")
    job.mode = body.mode
    db.commit()
    return {"success": True, "name": name, "mode": body.mode}


@router.post("/pause-all")
def pause_all(user: dict = Depends(require_rank("ADMIN")),
              db: Session = Depends(get_db)):
    """Global Kill Switch: PAUSE ALL AUTOMATION."""
    db.query(AutomationJob).update({AutomationJob.status: "PAUSED"})
    db.commit()
    return {"success": True, "paused_all": True}


@router.post("/resume-all")
def resume_all(user: dict = Depends(require_rank("ADMIN")),
               db: Session = Depends(get_db)):
    db.query(AutomationJob).filter_by(status="PAUSED").update({AutomationJob.status: "READY"})
    db.commit()
    return {"success": True, "paused_all": False}


@router.get("/dlq")
def dlq(user: dict = Depends(require_rank("HR")), db: Session = Depends(get_db)):
    dead = db.query(AutomationJob).filter_by(status="DEAD").all()
    return {"items": [_row(j) for j in dead]}


@router.post("/dlq/{name}/retry")
def dlq_retry(name: str, user: dict = Depends(require_rank("ADMIN")),
              db: Session = Depends(get_db)):
    job = db.query(AutomationJob).filter_by(name=name, status="DEAD").one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Khong co trong DLQ")
    job.status = "READY"
    job.last_error = ""
    db.commit()
    return {"success": True, "action": "RETRY", "name": name}


@router.post("/dlq/{name}/ignore")
def dlq_ignore(name: str, user: dict = Depends(require_rank("ADMIN")),
               db: Session = Depends(get_db)):
    job = db.query(AutomationJob).filter_by(name=name, status="DEAD").one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Khong co trong DLQ")
    job.status = "IGNORED"
    db.commit()
    return {"success": True, "action": "IGNORE", "name": name}
