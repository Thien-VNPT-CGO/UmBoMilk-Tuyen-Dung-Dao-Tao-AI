"""Training + Attendance API (Master §17, §18)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import current_user
from app.integrations.node_core import NodeCoreClient
from app.workflows.attendance_rules import classify, detect_anomalies
from app.workflows.training import build_timeline, daterange_12, detect_completion, progress

router = APIRouter(prefix="/api/vip", tags=["vip-training-attendance"])


class TimelineIn(BaseModel):
    startDate: str
    offDates: list[str] = []
    presentDates: list[str] = []


@router.post("/training/timeline")
def timeline(body: TimelineIn, user: dict = Depends(current_user)):
    y, m, d = map(int, body.startDate.split("-"))
    tl = build_timeline(date(y, m, d), set(body.offDates), set(body.presentDates))
    return {"timeline": tl, "progress": progress(tl)}


class DetectIn(BaseModel):
    employee: dict
    offDates: list[str] = []
    presentDates: list[str] = []


@router.post("/training/detect-completion")
def detect(body: DetectIn, user: dict = Depends(current_user)):
    return detect_completion(body.employee, set(body.offDates), set(body.presentDates))


@router.get("/attendance/live")
def live(user: dict = Depends(current_user)):
    client = NodeCoreClient()
    recs: list = []
    try:
        r = client.get("/api/attendances")
        if r.status_code == 200 and isinstance(r.json(), list):
            recs = r.json()
    except Exception:
        pass
    states = [{"employeeId": x.get("employeeId"), "date": x.get("date"),
               "state": classify(x)} for x in recs if isinstance(x, dict)]
    return {"records": states, "anomalies": detect_anomalies(recs), "degraded": True}


@router.get("/training/active")
def active_training(user: dict = Depends(current_user)):
    client = NodeCoreClient()
    emps: list = []
    try:
        r = client.get("/api/employees")
        if r.status_code == 200 and isinstance(r.json(), list):
            emps = [e for e in r.json()
                    if isinstance(e, dict) and (e.get("status") or "").upper() == "TRAINING"]
    except Exception:
        pass
    return {"count": len(emps),
            "items": [{"employeeId": e.get("employeeId"), "name": e.get("name"),
                       "startDate": e.get("startDate")} for e in emps],
            "degraded": True}
