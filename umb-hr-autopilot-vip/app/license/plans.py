"""VIP License plans (Master §35). Namespace RIENG — cam reuse Employee Key.

Expiry bat dau tu FIRST ACTIVATION, server time authoritative.
Admin day du o PHASE 10; day la bang plans + validator device limit.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Plan:
    code: str
    duration_desc: str
    max_devices: int | None  # None = unlimited (TEST)
    inventory: int


PLANS = [
    Plan("TEST", "10 phut", None, 1),
    Plan("2H", "2 gio", 2, 450),
    Plan("24H", "24 gio", 1, 250),
    Plan("7D", "7 ngay", 1, 85),
    Plan("30D", "30 ngay", 1, 20),
    Plan("6M", "6 thang (calendar month)", 1, 15),
    Plan("1Y", "1 nam (calendar year)", 1, 5),
]

TOTAL_KEYS = sum(p.inventory for p in PLANS)
assert TOTAL_KEYS == 826, TOTAL_KEYS


def get_plan(code: str) -> Plan | None:
    for p in PLANS:
        if p.code == code:
            return p
    return None


def device_allowed(plan_code: str, bound_count: int) -> bool:
    """TEST unlimited; 2H toi da 2; con lai 1 device."""
    plan = get_plan(plan_code)
    if plan is None:
        return False
    if plan.max_devices is None:
        return True
    return bound_count < plan.max_devices
