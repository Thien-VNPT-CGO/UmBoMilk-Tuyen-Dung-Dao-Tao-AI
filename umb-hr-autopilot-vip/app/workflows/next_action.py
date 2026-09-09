"""Next Best Action (Master §9). HR khong phai tu nho SOP.

Rule cu, deterministic. Moi candidate/employee co:
next_best_action / next_action_reason / next_action_priority.
"""
from __future__ import annotations


def candidate_action(c: dict) -> dict:
    status = (c.get("status") or "").upper()
    has_schedule = bool(c.get("interview") or c.get("interviewDate"))
    confirmed = (c.get("confirmationStatus") or "").upper() == "CONFIRMED"
    if status in ("NEW", "NEW_APPLICANT", "AI_SCREENED", "READY_INTERVIEW"):
        return {"next_best_action": "TAO_LICH_PHONG_VAN",
                "next_action_reason": "Ung vien moi, chua co lich",
                "next_action_priority": "HIGH"}
    if status == "INTERVIEW" and has_schedule and not confirmed:
        return {"next_best_action": "NHAC_XAC_NHAN",
                "next_action_reason": "Da co lich nhung chua xac nhan",
                "next_action_priority": "HIGH"}
    if status == "WAITING_HR_REVIEW":
        return {"next_best_action": "DUYET_PV",
                "next_action_reason": "Phong van xong, cho HR PASS/FAIL/RESCHEDULE",
                "next_action_priority": "HIGH"}
    if status == "PASS":
        return {"next_best_action": "CHUYEN_TRAINING",
                "next_action_reason": "Da PASS, san sang chuyen Training",
                "next_action_priority": "NORMAL"}
    return {"next_best_action": "THEO_DOI",
            "next_action_reason": f"Trang thai {status or '?'}",
            "next_action_priority": "LOW"}


def employee_action(e: dict) -> dict:
    status = (e.get("status") or "").upper()
    if status in ("PASSED_TEST",) or (e.get("testRecommendation") == "PASS_WAITING_OFFICIAL_APPROVAL"
                                      and e.get("testFinalPending", False)):
        return {"next_best_action": "DUYET_OFFICIAL",
                "next_action_reason": f"TEST {e.get('testScore10', '?')} cho duyet Official",
                "next_action_priority": "HIGH"}
    if status == "TRAINING":
        days = e.get("trainingDaysCompleted", e.get("trainingDays", 0)) or 0
        if isinstance(days, (int, float)) and days >= 7:
            return {"next_best_action": "TAO_LICH_TEST",
                    "next_action_reason": "Training du 7/7",
                    "next_action_priority": "HIGH"}
        return {"next_best_action": "THEO_DOI_TRAINING",
                "next_action_reason": f"Training tien do {days}/7",
                "next_action_priority": "NORMAL"}
    if status == "OFFICIAL":
        return {"next_best_action": "THEO_DOI_CHAM_CONG",
                "next_action_reason": "Nhan vien chinh thuc",
                "next_action_priority": "LOW"}
    return {"next_best_action": "THEO_DOI",
            "next_action_reason": f"Trang thai {status or '?'}",
            "next_action_priority": "LOW"}
