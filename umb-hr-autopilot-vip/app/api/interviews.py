"""Interview Autopilot API (Master §15, §42).

- bulk-preview: validate business hours + conflict, dem Meet/Zalo se tao.
  Khong thuc thi action high-impact ngay — HR xac nhan (ASSISTED).
- bulk-create: moi item idempotency key rieng; partial success
  (10 SUCCESS / 2 FAILED kieu mau), khong fail all vi 1 record loi.
- confirm/complete: luu VIP workflow_states; complete = PROCESSING (HR review),
  KHONG auto-PASS.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_db, require_rank
from app.automation.idempotency import MemoryIdempotency, interview_reminder_key
from app.db.models import WorkflowState
from app.integrations.node_core import NodeCoreClient
from app.workflows.interview import find_conflicts, parse_slot

router = APIRouter(prefix="/api/vip/interviews", tags=["vip-interviews"])
_idem = MemoryIdempotency()


class BulkItem(BaseModel):
    applicant_id: str
    interviewDate: str
    timeSlot: str


class BulkIn(BaseModel):
    items: list[BulkItem]


def _existing_interviews(client: NodeCoreClient) -> list:
    try:
        r = client.get("/api/interviews")
        if r.status_code == 200 and isinstance(r.json(), list):
            return r.json()
    except Exception:
        pass
    return []


@router.post("/bulk-preview")
def bulk_preview(body: BulkIn, user: dict = Depends(require_rank("HR"))):
    client = NodeCoreClient()
    existing = _existing_interviews(client)
    rows = []
    ok = 0
    for it in body.items:
        valid = parse_slot(it.timeSlot) is not None
        conflicts = find_conflicts(it.interviewDate, it.timeSlot, existing) if valid else []
        row_ok = valid and not conflicts
        ok += 1 if row_ok else 0
        rows.append({"applicant_id": it.applicant_id, "interviewDate": it.interviewDate,
                     "timeSlot": it.timeSlot, "ok": row_ok,
                     "reason": None if row_ok else ("INVALID_SLOT" if not valid else "BOOKING_CONFLICT")})
    return {"rows": rows, "summary": {"ok": ok, "conflict": len(body.items) - ok,
                                      "meets": ok, "zalos": ok},
            "confirm_required": True}


@router.post("/bulk-create")
def bulk_create(body: BulkIn, user: dict = Depends(require_rank("HR")),
                db: Session = Depends(get_db)):
    actor = user.get("sub", "HR")
    client = NodeCoreClient()
    success, failed = [], []
    for it in body.items:
        key = interview_reminder_key(it.applicant_id, f"{it.interviewDate}:{it.timeSlot}")
        if not _idem.mark(key):
            failed.append({"applicant_id": it.applicant_id, "error": "DUPLICATE_IDEMPOTENT_SKIP"})
            continue
        try:
            r = client.post(f"/api/applicants/{it.applicant_id}/schedule-interview",
                            {"interviewDate": it.interviewDate, "timeSlot": it.timeSlot},
                            actor=actor)
            if r.status_code == 200:
                success.append({"applicant_id": it.applicant_id})
                db.add(WorkflowState(entity_type="candidate", entity_id=it.applicant_id,
                                     state="INTERVIEW_SCHEDULED_PENDING_CONFIRM",
                                     source="VIP_AUTOMATION", correlation_id=key[:12]))
            else:
                try:
                    err = r.json().get("error", f"HTTP {r.status_code}")
                except Exception:
                    err = f"HTTP {r.status_code}"
                failed.append({"applicant_id": it.applicant_id, "error": err})
        except Exception as e:
            failed.append({"applicant_id": it.applicant_id, "error": str(e)[:200]})
    db.commit()
    return {"success": len(success), "failed": len(failed),
            "success_items": success, "failed_items": failed}


@router.post("/{interview_id}/confirm")
def confirm(interview_id: str, user: dict = Depends(require_rank("HR")),
            db: Session = Depends(get_db)):
    db.add(WorkflowState(entity_type="interview", entity_id=interview_id,
                         state="CONFIRMED", source="WEB_HR",
                         correlation_id=user.get("sub", "")[:12]))
    db.commit()
    return {"success": True, "interview_id": interview_id, "confirmation": "CONFIRMED"}


@router.post("/{interview_id}/complete")
def complete(interview_id: str, user: dict = Depends(require_rank("HR")),
             db: Session = Depends(get_db)):
    """Ket thuc PV -> PROCESSING (cho transcript/AI/HR review). KHONG PASS."""
    db.add(WorkflowState(entity_type="interview", entity_id=interview_id,
                         state="PROCESSING_INTERVIEW", source="WEB_HR",
                         correlation_id=user.get("sub", "")[:12]))
    db.commit()
    return {"success": True, "interview_id": interview_id,
            "next": "WAITING_HR_REVIEW", "auto_pass": False,
            "at": datetime.now().isoformat()}


@router.get("/state/{applicant_id}")
def candidate_state(applicant_id: str, user: dict = Depends(current_user),
                    db: Session = Depends(get_db)):
    rows = (db.query(WorkflowState).filter_by(entity_type="candidate", entity_id=applicant_id)
            .order_by(WorkflowState.id.desc()).limit(5).all())
    if not rows:
        raise HTTPException(status_code=404, detail="Chua co workflow state")
    return {"entity_id": applicant_id, "state": rows[0].state,
            "history": [r.state for r in rows]}
