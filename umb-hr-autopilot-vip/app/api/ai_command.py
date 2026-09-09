"""AI Command Center API (Master §13, §14). Preview-first + bulk partial success."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai.command_router import parse_command
from app.api.deps import get_db, require_rank
from app.automation.idempotency import MemoryIdempotency
from app.db.models import Notification
from app.integrations.node_core import NodeCoreClient

router = APIRouter(prefix="/api/vip/ai", tags=["vip-ai"])
_idem = MemoryIdempotency()


class CmdIn(BaseModel):
    text: str


class ExecIn(BaseModel):
    intent: str
    args: dict = {}
    applicant_ids: list[str] = []
    confirmed: bool = False


@router.post("/command")
def command(body: CmdIn, user: dict = Depends(require_rank("HR"))):
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Thieu lenh")
    parsed = parse_command(body.text)
    preview: dict = {"intent": parsed["intent"]}
    if parsed["intent"] == "bulk_schedule_interview":
        preview["info"] = (f"Se tao lich ngay {parsed['args'].get('date') or '?'} "
                           f"({len(parsed['args'].get('slots', []))} slots goi y). "
                           f"Chon ung vien + HR xac nhan truoc khi tao.")
    elif parsed["intent"] == "needs_clarification":
        preview["info"] = "Chua hieu ro. Thu: 'Xep lich phong van ... sang mai'."
    else:
        preview["info"] = f"San sang thuc thi {parsed['intent']} sau khi HR xac nhan."
    return {**parsed, "preview": preview, "requires_confirmation": True,
            "rbac": {"role": user.get("role"), "scope": user.get("branch_scope", [])}}


@router.post("/execute")
def execute(body: ExecIn, user: dict = Depends(require_rank("HR")),
            db: Session = Depends(get_db)):
    if not body.confirmed:
        raise HTTPException(status_code=400, detail="Can HR xac nhan (confirmed=true)")
    actor = user.get("sub", "HR")
    client = NodeCoreClient()
    if body.intent == "morning_brief":
        try:
            r = client.get("/api/applicants")
            n = len(r.json()) if r.status_code == 200 and isinstance(r.json(), list) else 0
        except Exception:
            n = 0
        return {"intent": body.intent, "brief": {"applicants": n}, "degraded": True}
    if body.intent == "remind_unconfirmed":
        try:
            r = client.get("/api/interviews")
            items = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
        except Exception:
            items = []
        pending = [i for i in items if isinstance(i, dict)
                   and (i.get("confirmationStatus") or "WAITING_CONFIRM") == "WAITING_CONFIRM"]
        db.add(Notification(category="interview", actor=actor,
                            title=f"Nhac xac nhan {len(pending)} lich PV",
                            content=f"HR {actor} kich remind qua AI Command"))
        db.commit()
        return {"intent": body.intent, "reminded": len(pending)}
    if body.intent == "bulk_schedule_interview":
        if not body.args.get("date") or not body.applicant_ids:
            raise HTTPException(status_code=400, detail="Can date + applicant_ids")
        slots: list = body.args.get("slots", [])
        success, failed = [], []
        for idx, aid in enumerate(body.applicant_ids):
            slot = slots[idx % len(slots)] if slots else "08:00-08:30"
            key = f"AI:{aid}:{body.args.get('date')}:{slot}"
            if not _idem.mark(key):
                failed.append({"applicant_id": aid, "error": "DUPLICATE_IDEMPOTENT_SKIP"})
                continue
            try:
                r = client.post(f"/api/applicants/{aid}/schedule-interview",
                                {"interviewDate": body.args.get("date"), "timeSlot": slot},
                                actor=actor)
                if r.status_code == 200:
                    success.append({"applicant_id": aid, "slot": slot})
                else:
                    failed.append({"applicant_id": aid, "error": f"HTTP {r.status_code}"})
            except Exception as e:
                failed.append({"applicant_id": aid, "error": str(e)[:200]})
        db.commit()
        return {"intent": body.intent, "success": len(success), "failed": len(failed),
                "success_items": success, "failed_items": failed}
    raise HTTPException(status_code=400, detail=f"Intent chua ho tro execute: {body.intent}")
