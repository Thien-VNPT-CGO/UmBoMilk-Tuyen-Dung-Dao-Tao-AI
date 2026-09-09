"""DB leases cho concurrency cao (Master §20, §39 Stage B).

Thay the pattern `SELECT roi INSERT` khong khoa bang lease nguyen tu:
insert-or-reclaim-if-expired. SQLite: UNIQUE PK + catch IntegrityError.
Postgres: them pg_advisory_xact_lock (docs/MIGRATION_PLAN.md).
"""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Lease

_local = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def acquire(db: Session, name: str, owner: str, ttl_sec: int = 30) -> bool:
    """True = giu lease. Het han thi reclaim. Tien trinh khac giu -> False."""
    now = _now()
    with _local:
        row = db.query(Lease).filter_by(name=name).one_or_none()
        exp = row.expires_at if row else None
        if exp is not None and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if row is None or (exp is not None and exp <= now):
            try:
                if row is None:
                    db.add(Lease(name=name, owner=owner,
                                 expires_at=now + timedelta(seconds=ttl_sec)))
                else:
                    row.owner = owner
                    row.expires_at = now + timedelta(seconds=ttl_sec)
                db.commit()
                return True
            except IntegrityError:
                db.rollback()
                return False
        return False


def release(db: Session, name: str, owner: str) -> bool:
    with _local:
        row = db.query(Lease).filter_by(name=name, owner=owner).one_or_none()
        if not row:
            return False
        db.delete(row)
        db.commit()
        return True


def is_locked(db: Session, name: str) -> bool:
    row = db.query(Lease).filter_by(name=name).one_or_none()
    if not row:
        return False
    exp = row.expires_at
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp is None or exp > _now()
