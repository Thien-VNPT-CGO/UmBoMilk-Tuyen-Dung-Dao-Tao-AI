"""TEST Center API (Master §19 + §42 internal VIP API).

AI de xuat -> HR review -> FINAL. Khong auto logout truoc HR confirm.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_db, require_rank
from app.db.models import AiEvaluation, Transcript
from app.integrations.node_core import NodeCoreClient
from app.workflows.test_rules import (
    propose,
    validate_test_slot,
    validate_transcript,
)

router = APIRouter(prefix="/api/vip/test", tags=["vip-test"])


class SlotIn(BaseModel):
    scheduledAt: str


@router.post("/schedule-validate")
def schedule_validate(body: SlotIn, user: dict = Depends(require_rank("HR"))):
    try:
        when = datetime.fromisoformat(body.scheduledAt)
    except Exception:
        raise HTTPException(status_code=400, detail="scheduledAt ISO khong hop le")
    v = validate_test_slot(when)
    if not v["ok"]:
        raise HTTPException(status_code=400, detail=v["error"])
    return {"ok": True, "duration_min": 90}


class ScoreIn(BaseModel):
    employee_id: str
    part1: list[float]
    part2: list[float]
    confidence: float = 0.0


@router.post("/propose")
def propose_score(body: ScoreIn, user: dict = Depends(require_rank("HR")),
                  db: Session = Depends(get_db)):
    out = propose(body.part1, body.part2, body.confidence)
    if not out["ok"]:
        raise HTTPException(status_code=400, detail=out["error"])
    db.add(AiEvaluation(entity_type="test", entity_id=body.employee_id, kind="test",
                        result=out, confidence=body.confidence,
                        status="INSUFFICIENT_EVIDENCE" if out.get("status") == "INSUFFICIENT_EVIDENCE" else "PROPOSED"))
    db.commit()
    return out


class TranscriptIn(BaseModel):
    employee_id: str
    segments: list[dict]
    source: str = "MANUAL"


@router.post("/transcript")
def ingest_transcript(body: TranscriptIn, user: dict = Depends(require_rank("HR")),
                      db: Session = Depends(get_db)):
    v = validate_transcript(body.segments)
    if not v["ok"]:
        raise HTTPException(status_code=400, detail=v["error"])
    db.add(Transcript(entity_type="test", entity_id=body.employee_id,
                      segments={"segments": body.segments}, source=body.source[:32]))
    db.commit()
    return {"success": True, "count": v["count"]}


class FinalizeIn(BaseModel):
    decision: str
    hr_scores: dict | None = None
    notes: str = ""


@router.post("/{employee_id}/finalize")
def finalize(employee_id: str, body: FinalizeIn,
             user: dict = Depends(require_rank("HR"))):
    """Uy quyen ve Node `/api/vip/test/:id/finalize` (giữ 1 nguồn quyết định)."""
    if body.decision not in ("FAIL", "RETEST", "PASS_WAITING_OFFICIAL_APPROVAL"):
        raise HTTPException(status_code=400, detail="Decision khong hop le")
    client = NodeCoreClient()
    try:
        r = client.post(f"/api/vip/test/{employee_id}/finalize",
                        {"decision": body.decision, "hrScores": body.hr_scores,
                         "notes": body.notes}, actor=user.get("sub", "HR"))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Node Core loi: {e}"[:200])
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail="Node tu choi finalize")
    return {"success": True, "decision": body.decision}
