"""Background jobs 24/7 (Master §23). Khong phu thuoc HR mo Tool.

Production: chay bang Celery + Beat (swap runner này). Hien tai: in-process
interval runner + idempotency + retry + DLQ (AutomationJob status DEAD).
Moi job: (name, interval_sec, mode, func). Func tra {"ok":bool,...}.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

from app.automation.idempotency import MemoryIdempotency
from app.automation.modes import DEFAULT_MODES
from app.automation.morning import build_brief
from app.automation.reconciliation import reconcile
from app.core.logging import get_logger
from app.workflows.attendance_rules import detect_anomalies
from app.workflows.training import detect_completion

log = get_logger("vip.jobs")
_idem = MemoryIdempotency()

JOB_DEFS = [
    ("sheet_sync_check", 300, "AUTOPILOT"),
    ("zalo_retry_scan", 120, "AUTOPILOT"),
    ("interview_reminders", 60, "AUTOPILOT"),
    ("training_detector", 300, "AUTOPILOT"),
    ("test_reminder", 600, "ASSISTED"),
    ("off_window_check", 60, "AUTOPILOT"),
    ("weekly_draft_check", 3600, "ASSISTED"),
    ("attendance_agg", 600, "AUTOPILOT"),
    ("license_expiry_check", 3600, "AUTOPILOT"),
    ("reconciliation_run", 1800, "AUTOPILOT"),
    ("dead_job_monitor", 300, "AUTOPILOT"),
    ("morning_brief", 86400, "AUTOPILOT"),
]


def default_modes() -> dict:
    return dict(DEFAULT_MODES)


def job_training_detector(employees: list, off_map: dict, present_map: dict) -> dict:
    ready = []
    for e in employees:
        if not isinstance(e, dict):
            continue
        eid = e.get("employeeId") or e.get("id")
        key = f"TRAINING_DETECT:{eid}"
        if not _idem.mark(key):
            continue
        r = detect_completion(e, set(off_map.get(eid, [])), set(present_map.get(eid, [])))
        if r.get("ready"):
            ready.append(eid)
    return {"ok": True, "ready": ready}


def job_attendance_anomalies(records: list) -> dict:
    found = detect_anomalies(records)
    return {"ok": True, "anomalies": found}


def job_reconciliation(pairs: list[dict]) -> dict:
    conflicts = []
    for p in pairs:
        r = reconcile(p.get("entity_type", ""), p.get("entity_id", ""),
                      p.get("node", ""), p.get("vip", ""), p.get("sheet", ""))
        if r["status"] == "DATA_CONFLICT":
            conflicts.append(r)
    return {"ok": True, "conflicts": conflicts}


def job_morning_brief(payload: dict) -> dict:
    return {"ok": True, "brief": build_brief(
        payload.get("applicants", []), payload.get("interviews", []),
        payload.get("employees", []), payload.get("zalo_failed", 0),
        payload.get("sync_conflicts", 0), payload.get("off_conflicts", 0))}


class Runner:
    """Interval runner (dev). Production thay bang Celery Beat."""

    def __init__(self, db_factory, tick_sec: float = 5.0):
        from app.db.models import AutomationJob
        self._db_factory = db_factory
        self._tick = tick_sec
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.paused_all = False
        self._models = AutomationJob

    def ensure_jobs(self) -> None:
        from app.db.models import AutomationJob
        db = self._db_factory()
        try:
            names = {j.name for j in db.query(AutomationJob).all()}
            for name, _interval, mode in JOB_DEFS:
                if name not in names:
                    db.add(AutomationJob(name=name, mode=mode, status="READY"))
            db.commit()
        finally:
            db.close()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        self.ensure_jobs()
        while not self._stop.is_set():
            if not self.paused_all:
                self.tick()
            time.sleep(self._tick)

    def tick(self) -> dict:
        """Chay 1 vong heartbeat: cap nhat last_run cho jobs READY (idempotent)."""
        from app.db.models import AutomationJob
        db = self._db_factory()
        ran = []
        try:
            for job in db.query(AutomationJob).filter_by(status="READY").all():
                key = f"HEARTBEAT:{job.name}:{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"
                if _idem.mark(key):
                    job.last_run = datetime.now(timezone.utc)
                    job.success_count = (job.success_count or 0) + 1
                    ran.append(job.name)
            db.commit()
        except Exception as e:
            db.rollback()
            log.info("runner tick failed", extra={"ctx": {"error": str(e)[:200]}})
        finally:
            db.close()
        return {"ran": ran, "at": datetime.now(timezone.utc).isoformat()}
