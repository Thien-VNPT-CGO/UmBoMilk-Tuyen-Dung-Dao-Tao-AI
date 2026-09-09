"""PHASE 10: License Center (Master §35 + §43 cases 31-40)."""
import threading
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import sessionmaker

from app.core.security import mint_token
from app.db.base import Base, build_engine
from app.db.models import VipLicenseDevice, VipLicenseKey
from app.license import service
from app.license.plans import TOTAL_KEYS


def _mem_session():
    eng = build_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    return sessionmaker(bind=eng)()


def test_seed_826():
    db = _mem_session()
    out = service.seed_inventory(db)
    assert out["total"] == 826 == TOTAL_KEYS
    out2 = service.seed_inventory(db)  # idempotent
    assert out2["total"] == 826 and out2["created"] == 0
    db.close()


def _get_key(db, plan):
    return db.query(VipLicenseKey).filter_by(plan_code=plan).first().key


def test_test_plan_unlimited_global_expiry():
    db = _mem_session()
    service.seed_inventory(db)
    now = datetime.now(timezone.utc)
    k1, k2 = _get_key(db, "TEST"), [k.key for k in
                                    db.query(VipLicenseKey).filter_by(plan_code="TEST").all()][0]
    r1 = service.activate(db, k1, "D1", now)
    assert r1["ok"]
    # TEST global expiry 10m chung
    exp1 = r1["expires_at"]
    keys = db.query(VipLicenseKey).filter_by(plan_code="TEST").all()
    assert all(k.expires_at and k.expires_at.isoformat() == exp1 for k in keys)
    # unlimited devices
    for i in range(5):
        assert service.activate(db, k1, f"DX{i}", now)["ok"]
    db.close()


def test_2h_max_2_third_rejected():
    db = _mem_session()
    service.seed_inventory(db)
    k = _get_key(db, "2H")
    now = datetime.now(timezone.utc)
    assert service.activate(db, k, "D1", now)["ok"]
    assert service.activate(db, k, "D2", now)["ok"]
    r = service.activate(db, k, "D3", now)
    assert not r["ok"] and r["error"] == "DEVICE_LIMIT" and r["max_devices"] == 2
    db.close()


def test_single_device_second_rejected_and_reset_keeps_expiry():
    db = _mem_session()
    service.seed_inventory(db)
    for plan in ("24H", "7D", "30D", "6M", "1Y"):
        k = _get_key(db, plan)
        now = datetime.now(timezone.utc)
        r1 = service.activate(db, k, "D1", now)
        assert r1["ok"], plan
        exp_before = r1["expires_at"]
        assert not service.activate(db, k, "D2", now)["ok"]
        # reset device khong reset expiry
        assert service.admin_action(db, "ADMIN", k, "reset_device")["ok"]
        r2 = service.activate(db, k, "D2", now)
        assert r2["ok"] and r2["expires_at"] == exp_before
    db.close()


def test_expiry_calendar_and_server_time():
    db = _mem_session()
    service.seed_inventory(db)
    k6 = _get_key(db, "6M")
    base = datetime(2026, 1, 31, 12, 0, tzinfo=timezone.utc)
    assert service.compute_expiry("6M", base) == datetime(2026, 7, 31, 12, 0, tzinfo=timezone.utc)
    k1 = _get_key(db, "1Y")
    assert service.compute_expiry("1Y", datetime(2026, 2, 28, tzinfo=timezone.utc)).year == 2027
    # het han -> reject + realtime LICENSE_EXPIRED (server time, khong phu thuoc client clock)
    k = _get_key(db, "24H")
    r = service.activate(db, k, "D1", base)
    assert r["ok"]
    late = base + timedelta(hours=25)
    # gia lap het han
    key = db.query(VipLicenseKey).filter_by(key=k).one()
    key.expires_at = base  # het han ngay
    db.commit()
    r2 = service.activate(db, k, "D1", late)
    assert not r2["ok"] and r2["realtime"] == "LICENSE_EXPIRED"
    db.close()


def test_admin_lock_realtime_logout_and_audit():
    db = _mem_session()
    service.seed_inventory(db)
    k = _get_key(db, "30D")
    now = datetime.now(timezone.utc)
    r = service.activate(db, k, "D1", now)
    token = r["token"]
    assert service.check_session(db, token)["ok"]
    assert service.admin_action(db, "ADMIN", k, "lock")["ok"]
    assert service.admin_action(db, "ADMIN", k, "lock")["realtime"] == "LICENSE_EXPIRED"
    assert not service.check_session(db, token)["ok"]
    assert service.admin_action(db, "ADMIN", k, "unlock")["ok"]
    # session cu da bi revoke khi lock -> phai activate lai (dung device)
    r_new = service.activate(db, k, "D1", now)
    assert r_new["ok"]
    assert service.check_session(db, r_new["token"])["ok"]
    assert service.admin_action(db, "ADMIN", k, "force_logout")["ok"]
    assert service.check_session(db, r_new["token"])["error"] == "SESSION_REVOKED"
    assert service.admin_action(db, "ADMIN", k, "revoke")["ok"]
    assert service.admin_action(db, "ADMIN", k, "nope")["ok"] is False
    from app.db.models import AuditLog
    assert db.query(AuditLog).filter_by(entity="VIP_LICENSE").count() >= 5
    db.close()


def test_concurrent_single_device_one_wins(tmp_path):
    eng = build_engine(f"sqlite:///{tmp_path}/lic.db")
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    service.seed_inventory(S())
    db0 = S()
    k = _get_key(db0, "24H")
    db0.close()
    wins, lock = [], threading.Lock()

    def go(dev):
        s = S()
        try:
            r = service.activate(s, k, dev)
            if r.get("ok"):
                with lock:
                    wins.append(dev)
        finally:
            s.close()

    ts = [threading.Thread(target=go, args=(f"D{i}",)) for i in range(4)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(wins) == 1  # chi 1 success


def test_license_api_guards(client):
    # public activate nhung sai key -> 404; thieu field -> 400/422
    r = client.post("/api/license/activate", json={"key": "NOPE", "device_id": "D"})
    assert r.status_code == 404
    r = client.post("/api/license/activate", json={"key": "", "device_id": ""})
    assert r.status_code in (400, 422)
    assert client.get("/api/license/status?token=x").status_code == 401
    # admin can ADMIN
    h = {"Authorization": "Bearer " + mint_token(sub="a", role="HR")}
    assert client.post("/api/admin/license/seed", headers=h).status_code == 403
