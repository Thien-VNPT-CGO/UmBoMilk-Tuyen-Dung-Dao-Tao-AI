"""Foundation: state machines (Master §8)."""
from app.workflows.states import TEST_DECISIONS, can_transition, next_states


def test_candidate_linear():
    assert can_transition("candidate", "NEW", "AI_SCREENED")
    assert can_transition("candidate", "CONFIRMED", "INTERVIEWING")
    assert not can_transition("candidate", "NEW", "CONFIRMED")  # khong nhay coc
    assert not can_transition("candidate", "CONFIRMED", "NEW")  # khong di lui


def test_candidate_review_branches():
    assert can_transition("candidate", "WAITING_HR_REVIEW", "READY_TRAINING")
    assert can_transition("candidate", "WAITING_HR_REVIEW", "FAIL")
    assert can_transition("candidate", "WAITING_HR_REVIEW", "NO_SHOW")
    assert not can_transition("candidate", "WAITING_HR_REVIEW", "INTERVIEWING")
    assert set(next_states("candidate", "WAITING_HR_REVIEW")) == {
        "READY_TRAINING", "FAIL", "NO_SHOW", "RESCHEDULE"}


def test_training_flow():
    # Mo hinh rut gon: tien do 1/7..7/7 nam trong payload (PHASE 5 detector),
    # nen ACTIVE->COMPLETED la buoc ke trong danh sach.
    assert can_transition("training", "TRAINING_ACTIVE", "TRAINING_COMPLETED")
    assert not can_transition("training", "TRAINING_ACTIVE", "WAITING_TEST")
    assert can_transition("training", "WAITING_HR_REVIEW", "RETEST")
    assert can_transition("training", "RETEST", "TEST_SCHEDULED")
    assert can_transition("training", "WAITING_HR_REVIEW", "PASS_WAITING_OFFICIAL")
    assert "FAIL" in TEST_DECISIONS
