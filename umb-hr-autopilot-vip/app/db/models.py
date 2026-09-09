"""VIP PostgreSQL tables — Stage A (Master §39).

Chi luu du lieu MOI cua VIP (workflow/automation/notify/AI/license/exception/
reconciliation). KHONG migrate operational data (db.json) o phase nay.
Moi event co source/version/correlation_id/idempotency_key/updated_at (§4).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _now():
    return datetime.now(timezone.utc)


class WorkflowState(Base):
    __tablename__ = "workflow_states"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(32), index=True)  # candidate/training/test/official
    entity_id: Mapped[str] = mapped_column(String(128), index=True)
    state: Mapped[str] = mapped_column(String(64), index=True)
    source: Mapped[str] = mapped_column(String(32), default="VIP_AUTOMATION")
    version: Mapped[int] = mapped_column(Integer, default=1)
    correlation_id: Mapped[str] = mapped_column(String(64), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AutomationJob(Base):
    __tablename__ = "automation_jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    mode: Mapped[str] = mapped_column(String(16), default="AUTOPILOT")  # MANUAL/ASSISTED/AUTOPILOT
    status: Mapped[str] = mapped_column(String(16), default="READY")
    idempotency_key: Mapped[str] = mapped_column(String(128), default="", index=True)
    last_run: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="SUCCESS")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ExceptionItem(Base):
    __tablename__ = "exceptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    priority: Mapped[str] = mapped_column(String(16), default="NORMAL", index=True)
    entity_type: Mapped[str] = mapped_column(String(32), default="")
    entity_id: Mapped[str] = mapped_column(String(128), default="")
    summary: Mapped[str] = mapped_column(String(256), default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    suggested_action: Mapped[str] = mapped_column(String(256), default="")
    status: Mapped[str] = mapped_column(String(16), default="OPEN", index=True)
    assigned_to: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    resolved_by: Mapped[str] = mapped_column(String(64), default="")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(32), default="system", index=True)
    title: Mapped[str] = mapped_column(String(256), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    actor: Mapped[str] = mapped_column(String(64), default="SYSTEM")
    entity_id: Mapped[str] = mapped_column(String(128), default="")
    read: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AiEvaluation(Base):
    __tablename__ = "ai_evaluations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(32), index=True)
    entity_id: Mapped[str] = mapped_column(String(128), index=True)
    kind: Mapped[str] = mapped_column(String(32), default="interview")  # interview/test
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), default="PROPOSED")  # PROPOSED/CONFIRMED/INSUFFICIENT_EVIDENCE
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Transcript(Base):
    __tablename__ = "transcripts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(32), default="interview")
    entity_id: Mapped[str] = mapped_column(String(128), index=True)
    segments: Mapped[dict] = mapped_column(JSON, default=dict)  # [{speaker,start_time,end_time,text}]
    source: Mapped[str] = mapped_column(String(32), default="MANUAL")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VipLicensePlan(Base):
    __tablename__ = "vip_license_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    duration_desc: Mapped[str] = mapped_column(String(64), default="")
    max_devices: Mapped[int] = mapped_column(Integer, default=1)
    inventory: Mapped[int] = mapped_column(Integer, default=0)


class VipLicenseKey(Base):
    __tablename__ = "vip_license_keys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    plan_code: Mapped[str] = mapped_column(String(16), index=True)
    status: Mapped[str] = mapped_column(String(16), default="NEW", index=True)  # NEW/ACTIVE/LOCKED/REVOKED/EXPIRED
    first_activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_to: Mapped[str] = mapped_column(String(64), default="")


class VipLicenseDevice(Base):
    __tablename__ = "vip_license_devices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key_id: Mapped[int] = mapped_column(Integer, index=True)
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    bound_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VipLicenseSession(Base):
    __tablename__ = "vip_license_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key_id: Mapped[int] = mapped_column(Integer, index=True)
    device_id: Mapped[str] = mapped_column(String(128), default="")
    token_jti: Mapped[str] = mapped_column(String(64), default="", index=True)
    revoked: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ReconciliationRecord(Base):
    __tablename__ = "reconciliation_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(32), index=True)
    entity_id: Mapped[str] = mapped_column(String(128), index=True)
    node_state: Mapped[str] = mapped_column(String(64), default="")
    sheet_state: Mapped[str] = mapped_column(String(64), default="")
    vip_state: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(16), default="MATCH", index=True)  # MATCH/DATA_CONFLICT/RESOLVED
    recommended_source: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(64), default="", index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity: Mapped[str] = mapped_column(String(64), default="")
    entity_id: Mapped[str] = mapped_column(String(128), default="")
    before: Mapped[dict] = mapped_column(JSON, default=dict)
    after: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str] = mapped_column(String(64), default="")
    correlation_id: Mapped[str] = mapped_column(String(64), default="")
    source: Mapped[str] = mapped_column(String(32), default="VIP")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Lease(Base):
    """DB lease cho concurrency entities (interview/test/off/license) — Stage B.

    SQLite dev: unique constraint + expiry. Postgres prod: dung kem
    pg_advisory_xact_lock (xem docs/MIGRATION_PLAN.md). Khong dung
    SELECT-roi-INSERT khong khoa (Master §20)."""

    __tablename__ = "leases"
    name: Mapped[str] = mapped_column(String(128), primary_key=True)
    owner: Mapped[str] = mapped_column(String(64), default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
