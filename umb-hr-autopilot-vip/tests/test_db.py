"""Foundation: DB Stage A tables khoi tao duoc (SQLite dev + Postgres-ready)."""
from app.db.base import Base, build_engine


def test_create_all_sqlite_memory():
    eng = build_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    tables = set(Base.metadata.tables.keys())
    for t in ("workflow_states", "automation_jobs", "idempotency_keys", "exceptions",
              "notifications", "ai_evaluations", "transcripts", "vip_license_plans",
              "vip_license_keys", "vip_license_devices", "vip_license_sessions",
              "reconciliation_records"):
        assert t in tables, t


def test_workflow_crud_memory():
    from sqlalchemy.orm import sessionmaker

    from app.db.models import WorkflowState

    eng = build_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    s = S()
    s.add(WorkflowState(entity_type="candidate", entity_id="c1",
                        state="READY_INTERVIEW", correlation_id="corr1"))
    s.commit()
    got = s.query(WorkflowState).filter_by(entity_id="c1").one()
    assert got.state == "READY_INTERVIEW"
    s.close()
