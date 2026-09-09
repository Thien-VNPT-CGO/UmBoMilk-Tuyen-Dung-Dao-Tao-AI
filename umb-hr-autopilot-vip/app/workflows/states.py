"""State machines (Master §8). Dinh nghia + validator chuyen trang thai.

Workflow state luu DB (workflow_states), khong suy duy nhat tu UI.
Engine day du o PHASE 4-7; day la nen dung chung + co test.
"""
from __future__ import annotations

CANDIDATE_FLOW = [
    "NEW", "AI_SCREENED", "READY_INTERVIEW",
    "INTERVIEW_SCHEDULED_PENDING_CONFIRM", "CONFIRMED", "INTERVIEWING",
    "PROCESSING_INTERVIEW", "WAITING_HR_REVIEW",
]

CANDIDATE_TERMINAL = {
    "WAITING_HR_REVIEW": ["READY_TRAINING", "FAIL", "NO_SHOW", "RESCHEDULE"],
    "READY_TRAINING": [],
    "FAIL": [],
    "NO_SHOW": ["RESCHEDULE"],
    "RESCHEDULE": ["INTERVIEW_SCHEDULED_PENDING_CONFIRM"],
}

TRAINING_FLOW = [
    "TRAINING_CREATED", "TRAINING_ACTIVE", "TRAINING_COMPLETED",
    "WAITING_TEST", "TEST_SCHEDULED", "TEST_CONFIRMED", "TEST_PROCESSING",
    "WAITING_HR_REVIEW",
]

TRAINING_TERMINAL = {
    "WAITING_HR_REVIEW": ["FAIL", "RETEST", "PASS_WAITING_OFFICIAL"],
    "FAIL": [],
    "RETEST": ["TEST_SCHEDULED"],
    "PASS_WAITING_OFFICIAL": ["OFFICIAL"],
    "OFFICIAL": [],
}

TEST_DECISIONS = ["FAIL", "RETEST", "PASS_WAITING_OFFICIAL_APPROVAL"]


def _linear_ok(flow: list[str], frm: str, to: str) -> bool:
    try:
        return flow.index(to) == flow.index(frm) + 1
    except ValueError:
        return False


def can_transition(entity: str, frm: str, to: str) -> bool:
    if entity == "candidate":
        if frm in CANDIDATE_TERMINAL:
            return to in CANDIDATE_TERMINAL[frm]
        return _linear_ok(CANDIDATE_FLOW, frm, to)
    if entity == "training":
        if frm in TRAINING_TERMINAL:
            return to in TRAINING_TERMINAL[frm]
        return _linear_ok(TRAINING_FLOW, frm, to)
    return False


def next_states(entity: str, frm: str) -> list[str]:
    if entity == "candidate":
        if frm in CANDIDATE_TERMINAL:
            return list(CANDIDATE_TERMINAL[frm])
        try:
            return [CANDIDATE_FLOW[CANDIDATE_FLOW.index(frm) + 1]]
        except (ValueError, IndexError):
            return []
    if entity == "training":
        if frm in TRAINING_TERMINAL:
            return list(TRAINING_TERMINAL[frm])
        try:
            return [TRAINING_FLOW[TRAINING_FLOW.index(frm) + 1]]
        except (ValueError, IndexError):
            return []
    return []
