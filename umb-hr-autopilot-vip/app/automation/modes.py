"""Automation modes (Master §10). Moi automation co MANUAL/ASSISTED/AUTOPILOT."""
from __future__ import annotations

MODES = ("MANUAL", "ASSISTED", "AUTOPILOT")

DEFAULT_MODES = {
    "sheet_sync": "AUTOPILOT",
    "zalo_reminder": "AUTOPILOT",
    "interview_confirmation_parse": "AUTOPILOT",
    "attendance_anomaly_detection": "AUTOPILOT",
    "training_7_7_detector": "AUTOPILOT",
    "bulk_create_interview": "ASSISTED",
    "create_test_schedule": "ASSISTED",
    "weekly_schedule": "ASSISTED",
    "fail_candidate": "ASSISTED",
    "hr_override_score": "MANUAL",
    "promote_official": "ASSISTED",
    "system_reset": "MANUAL",
}


def get_mode(name: str, overrides: dict | None = None) -> str:
    if overrides and name in overrides and overrides[name] in MODES:
        return overrides[name]
    return DEFAULT_MODES.get(name, "MANUAL")


def is_high_risk(name: str) -> bool:
    return get_mode(name) in ("MANUAL", "ASSISTED") and name in (
        "fail_candidate", "hr_override_score", "promote_official", "system_reset")
