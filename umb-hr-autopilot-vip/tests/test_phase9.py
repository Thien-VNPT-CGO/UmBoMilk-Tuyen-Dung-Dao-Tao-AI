"""PHASE 9: jobs, DLQ, reconciliation, morning brief, kill switch."""
from app.automation.jobs import JOB_DEFS, Runner, job_attendance_anomalies, job_morning_brief, job_reconciliation, job_training_detector
from app.automation.morning import build_brief
from app.automation.reconciliation import reconcile
from app.core.security import mint_token
from app.db.base import SessionLocal
from app.db.models import AutomationJob


def _hdr(role="ADMIN"):
    return {"Authorization": "Bearer " + mint_token(sub="admin1", role=role)}


def test_job_registry_complete():
    names = {n for n, _i, _m in JOB_DEFS}
    for need in ("sheet_sync_check", "zalo_retry_scan", "interview_reminders",
                 "training_detector", "test_reminder", "off_window_check",
                 "weekly_draft_check", "attendance_agg", "license_expiry_check",
                 "reconciliation_run", "dead_job_monitor", "morning_brief"):
        assert need in names, need


def test_training_detector_job():
    emps = [{"employeeId": "E1", "startDate": "2026-09-07"},
            {"employeeId": "E2", "startDate": "2026-09-07"}]
    offs = {"E1": ["2026-09-08", "2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"],
            "E2": ["2026-09-08"]}
    present = {"E1": ["2026-09-07", "2026-09-09", "2026-09-11", "2026-09-13",
                      "2026-09-15", "2026-09-17", "2026-09-18"],
               "E2": ["2026-09-07"]}
    r = job_training_detector(emps, offs, present)
    assert r["ready"] == ["E1"]
    r2 = job_training_detector(emps, offs, present)  # idempotent: SKIP lan 2
    assert r2["ready"] == []


def test_reconciliation():
    assert reconcile("employee", "E1", "TRAINING", "TRAINING")["status"] == "MATCH"
    c = reconcile("employee", "E1", "TRAINING", "OFFICIAL", "TRAINING")
    assert c["status"] == "DATA_CONFLICT"
    assert "E1" in c["detail"] and c["recommended_source"] == "NODE_CORE"
    assert job_reconciliation([{"entity_type": "e", "entity_id": "1",
                                "node": "A", "vip": "A"}])["conflicts"] == []


def test_morning_brief_format():
    b = build_brief([{"status": "WAITING_HR_REVIEW"}],
                    [{"confirmationStatus": "CONFIRMED"}, {}],
                    [{"status": "TRAINING"}], zalo_failed=2, sync_conflicts=0,
                    off_conflicts=1)
    assert "PHONG VAN HOM NAY  2" in b["text"]
    assert "CHUA XAC NHAN      1" in b["text"]
    assert b["counts"] == {"interviews": 2, "confirmed": 1, "unconfirmed": 1,
                           "training": 1, "test_pending": 0, "review": 1,
                           "zalo_failed": 2, "sync_conflicts": 0, "off_conflicts": 1}


def test_automation_center_api(client):
    h = _hdr()
    r = client.get("/api/automation", headers=h)
    assert r.status_code == 200 and len(r.json()["jobs"]) == len(JOB_DEFS)
    # mode change can ADMIN
    assert client.post("/api/automation/sheet_sync_check/mode", json={"mode": "MANUAL"},
                       headers=_hdr("HR")).status_code == 403
    r = client.post("/api/automation/sheet_sync_check/mode", json={"mode": "MANUAL"}, headers=h)
    assert r.json()["mode"] == "MANUAL"
    assert client.post("/api/automation/sheet_sync_check/mode", json={"mode": "X"}, headers=h).status_code == 400
    assert client.post("/api/automation/nope/mode", json={"mode": "MANUAL"}, headers=h).status_code == 404
    # kill switch
    assert client.post("/api/automation/pause-all", headers=h).json()["paused_all"] is True
    assert client.post("/api/automation/resume-all", headers=h).json()["paused_all"] is False
    # DLQ: tao DEAD truc tiep roi retry/ignore
    db = SessionLocal()
    j = db.query(AutomationJob).filter_by(name="zalo_retry_scan").one()
    j.status = "DEAD"
    j.last_error = "boom"
    db.commit()
    db.close()
    dlq = client.get("/api/automation/dlq", headers=h).json()
    assert any(x["name"] == "zalo_retry_scan" for x in dlq["items"])
    assert client.post("/api/automation/dlq/zalo_retry_scan/retry", headers=h).json()["action"] == "RETRY"
    db = SessionLocal()
    db.query(AutomationJob).filter_by(name="zalo_retry_scan").update({AutomationJob.status: "DEAD"})
    db.commit()
    db.close()
    assert client.post("/api/automation/dlq/zalo_retry_scan/ignore", headers=h).json()["action"] == "IGNORE"
    db = SessionLocal()
    db.query(AutomationJob).filter_by(name="zalo_retry_scan").update({AutomationJob.status: "READY"})
    db.commit()
    db.close()


def test_runner_tick_idempotent():
    r = Runner(SessionLocal, tick_sec=0.01)
    r.ensure_jobs()
    first = r.tick()
    assert len(first["ran"]) > 0
    second = r.tick()  # cung phut -> idempotent SKIP
    assert second["ran"] == []
