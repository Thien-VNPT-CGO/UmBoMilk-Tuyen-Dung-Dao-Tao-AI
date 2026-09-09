"""Daily HR Morning brief builder (Master §11). Pure function + job wrapper."""
from __future__ import annotations


def build_brief(applicants: list, interviews: list, employees: list,
                zalo_failed: int = 0, sync_conflicts: int = 0,
                off_conflicts: int = 0) -> dict:
    iv_today = [i for i in interviews if isinstance(i, dict)]
    unconfirmed = [i for i in iv_today
                   if (i.get("confirmationStatus") or "WAITING_CONFIRM") == "WAITING_CONFIRM"]
    training = [e for e in employees if isinstance(e, dict)
                and (e.get("status") or "").upper() == "TRAINING"]
    test_pending = [e for e in employees if isinstance(e, dict) and e.get("testFinalPending")]
    review = [a for a in applicants if isinstance(a, dict)
              and a.get("status") == "WAITING_HR_REVIEW"]
    lines = [
        f"PHONG VAN HOM NAY  {len(iv_today)}",
        f"DA XAC NHAN        {len(iv_today) - len(unconfirmed)}",
        f"CHUA XAC NHAN      {len(unconfirmed)}",
        f"TRAINING ACTIVE    {len(training)}",
        f"TEST CHO DUYET     {len(test_pending)}",
        f"PV CHO REVIEW      {len(review)}",
        f"OFF CONFLICT       {off_conflicts}",
        f"ZALO FAILED        {zalo_failed}",
        f"SYNC CONFLICT      {sync_conflicts}",
    ]
    return {"text": "\n".join(lines),
            "counts": {"interviews": len(iv_today), "confirmed": len(iv_today) - len(unconfirmed),
                       "unconfirmed": len(unconfirmed), "training": len(training),
                       "test_pending": len(test_pending), "review": len(review),
                       "zalo_failed": zalo_failed, "sync_conflicts": sync_conflicts,
                       "off_conflicts": off_conflicts}}
