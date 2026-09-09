"""Foundation: modes (§10), confidence gate (§26), license plans (§35)."""
from app.ai.confidence_gate import gate, insufficient
from app.automation.idempotency import (
    MemoryIdempotency,
    action_key,
    interview_reminder_key,
    zalo_key,
)
from app.automation.modes import get_mode, is_high_risk
from app.license.plans import TOTAL_KEYS, device_allowed, get_plan


def test_default_modes():
    assert get_mode("sheet_sync") == "AUTOPILOT"
    assert get_mode("bulk_create_interview") == "ASSISTED"
    assert get_mode("promote_official") == "ASSISTED"
    assert get_mode("system_reset") == "MANUAL"
    assert get_mode("hr_override_score") == "MANUAL"
    assert is_high_risk("promote_official") and is_high_risk("system_reset")
    assert not is_high_risk("sheet_sync")


def test_confidence_gate():
    assert gate(0.95) == "AUTO"
    assert gate(0.90) == "AUTO"
    assert gate(0.80) == "ASSISTED"
    assert gate(0.65) == "ASSISTED"
    assert gate(0.64) == "HR_REVIEW"
    assert insufficient() == {"score": None, "status": "INSUFFICIENT_EVIDENCE"}


def test_license_inventory():
    assert TOTAL_KEYS == 826
    assert get_plan("2H").max_devices == 2
    assert get_plan("TEST").max_devices is None
    assert device_allowed("TEST", 99)
    assert device_allowed("2H", 1) and not device_allowed("2H", 2)
    assert device_allowed("30D", 0) and not device_allowed("30D", 1)
    assert not device_allowed("XXX", 0)


def test_idempotency_keys():
    assert interview_reminder_key("abc", "T30") == "INTERVIEW:ABC:T30"
    assert zalo_key("invite", "0901") == "ZALO:INVITE:0901"
    assert action_key("a", "b") == "A:B"
    m = MemoryIdempotency()
    assert m.mark("K1") is True
    assert m.mark("K1") is False  # SKIP khi da SUCCESS
    assert m.seen("K1")
