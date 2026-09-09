"""PHASE 11: DB leases + migration repo khong wired (zero regression)."""
import threading
from datetime import timedelta

from sqlalchemy.orm import sessionmaker

from app.db.base import Base, build_engine
from app.db.locks import acquire, is_locked, release


def _mem():
    eng = build_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    return sessionmaker(bind=eng)()


def test_lease_acquire_release():
    db = _mem()
    assert acquire(db, "OFF:CN1:CA_SANG:2026-09-21", "HR1", ttl_sec=30)
    assert is_locked(db, "OFF:CN1:CA_SANG:2026-09-21")
    assert not acquire(db, "OFF:CN1:CA_SANG:2026-09-21", "HR2", ttl_sec=30)
    assert release(db, "OFF:CN1:CA_SANG:2026-09-21", "HR1")
    assert not is_locked(db, "OFF:CN1:CA_SANG:2026-09-21")
    assert acquire(db, "OFF:CN1:CA_SANG:2026-09-21", "HR2", ttl_sec=30)
    assert not release(db, "OFF:CN1:CA_SANG:2026-09-21", "HR1")  # sai owner
    db.close()


def test_lease_expiry_reclaim():
    db = _mem()
    assert acquire(db, "K", "A", ttl_sec=-1)  # het han ngay
    assert acquire(db, "K", "B", ttl_sec=30)  # reclaim duoc
    db.close()


def test_lease_concurrent_one_wins(tmp_path):
    eng = build_engine(f"sqlite:///{tmp_path}/leases.db")
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    wins, lock = [], threading.Lock()

    def go(owner):
        s = S()
        try:
            if acquire(s, "INTERVIEW:2026-09-14:08:00", owner, ttl_sec=30):
                with lock:
                    wins.append(owner)
        finally:
            s.close()

    ts = [threading.Thread(target=go, args=(f"O{i}",)) for i in range(6)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(wins) == 1


def test_vip_repository_not_wired():
    # Dam bao services/vipRepository.js ton tai NHUNG server.js khong require
    # (zero runtime impact). Doc file thay vi import.
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[2]  # um-bo-milk-app/
    repo = root / "services" / "vipRepository.js"
    assert repo.exists()
    server = (root / "server.js").read_text(encoding="utf-8")
    assert "vipRepository" not in server
    text = repo.read_text(encoding="utf-8")
    assert "dualRead" in text and "dualWrite" in text and "STAGE_B_ENTITIES" in text
