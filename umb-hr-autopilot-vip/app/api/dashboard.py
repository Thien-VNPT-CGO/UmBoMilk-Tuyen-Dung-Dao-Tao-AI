"""Dashboard shell data: uu tien action, khong chi KPI (Master §29).

Doc du lieu qua Node adapter; Core loi thi tra degraded + danh sach rong
(khong sap UI). Next Best Action / Exception Inbox day du o PHASE 3.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import current_user
from app.core.permissions import filter_by_branch_scope
from app.integrations.node_core import NodeCoreClient
from app.workflows.next_action import candidate_action, employee_action

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _safe_list(client: NodeCoreClient, path: str, token: str | None) -> list:
    try:
        r = client.get(path, token=token)
        if r.status_code != 200:
            return []
        body = r.json()
        if isinstance(body, list):
            return body
        if isinstance(body, dict) and isinstance(body.get("data"), list):
            return body["data"]
        return []
    except Exception:
        return []


@router.get("/today")
def today(user: dict = Depends(current_user)):
    role = user.get("role", "VIEWER")
    scope = user.get("branch_scope", []) or []
    # VIP chua co user token cua Node -> goi khong token; Node tu filter/guard.
    client = NodeCoreClient()
    applicants = _safe_list(client, "/api/applicants", None)
    interviews = _safe_list(client, "/api/interviews", None)
    interviews = filter_by_branch_scope(
        [i for i in interviews if isinstance(i, dict)], role, scope, "branchPreference")
    needs_action = []
    unconfirmed = [i for i in interviews
                   if isinstance(i, dict) and (i.get("confirmationStatus") in (None, "WAITING_CONFIRM", ""))]
    if unconfirmed:
        needs_action.append({"kind": "INTERVIEW_UNCONFIRMED", "count": len(unconfirmed),
                             "label": f"{len(unconfirmed)} lich PV chua xac nhan"})
    waiting_review = [a for a in applicants
                      if isinstance(a, dict) and a.get("status") == "WAITING_HR_REVIEW"]
    if waiting_review:
        needs_action.append({"kind": "REVIEW_PENDING", "count": len(waiting_review),
                             "label": f"{len(waiting_review)} PV cho HR duyet"})
    return {"needs_action": needs_action,
            "counts": {"interviews": len(interviews), "applicants": len(applicants)},
            "degraded": True}


@router.get("/brief")
def brief(user: dict = Depends(current_user)):
    """Daily HR Brief data (Master §11): dem + hanh dong, khong chi KPI."""
    from datetime import datetime
    role = user.get("role", "VIEWER")
    scope = user.get("branch_scope", []) or []
    client = NodeCoreClient()
    applicants = _safe_list(client, "/api/applicants", None)
    interviews = _safe_list(client, "/api/interviews", None)
    employees = _safe_list(client, "/api/employees", None)
    zalo = _safe_list(client, "/api/zalo-records", None)
    offs = _safe_list(client, "/api/off-requests", None)
    interviews = [i for i in interviews if isinstance(i, dict)]
    interviews = filter_by_branch_scope(interviews, role, scope, "branchPreference")
    today = datetime.now().strftime("%Y-%m-%d")
    iv_today = [i for i in interviews if i.get("interviewDate") == today]
    unconfirmed = [i for i in iv_today
                   if (i.get("confirmationStatus") or "WAITING_CONFIRM") == "WAITING_CONFIRM"]
    confirmed = [i for i in iv_today if i.get("confirmationStatus") == "CONFIRMED"]
    waiting_review = [a for a in applicants if isinstance(a, dict)
                      and a.get("status") == "WAITING_HR_REVIEW"]
    training = [e for e in employees if isinstance(e, dict)
                and (e.get("status") or "").upper() == "TRAINING"]
    ready_77 = [e for e in training
                if isinstance(e.get("trainingDaysCompleted", 0), (int, float))
                and e.get("trainingDaysCompleted", 0) >= 7]
    test_pending = [e for e in employees if isinstance(e, dict)
                    and e.get("testFinalPending")]
    zalo_failed = [z for z in zalo if isinstance(z, dict)
                   and (z.get("status") or "").upper() == "FAILED"][:50]
    actions = []
    for a in waiting_review[:20]:
        na = candidate_action(a)
        actions.append({"entity": a.get("name", "?"), **na})
    for e in ready_77[:20]:
        na = employee_action(e)
        actions.append({"entity": e.get("name", "?"), **na})
    return {
        "date": today,
        "interview_today": len(iv_today),
        "confirmed": len(confirmed),
        "unconfirmed": len(unconfirmed),
        "training_active": len(training),
        "ready_7_7": len(ready_77),
        "test_pending": len(test_pending),
        "off_requests": len(offs),
        "zalo_failed": len(zalo_failed),
        "waiting_review": len(waiting_review),
        "next_actions": actions[:30],
        "degraded": True,
    }
