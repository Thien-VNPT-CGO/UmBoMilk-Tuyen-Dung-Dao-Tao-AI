"""SQLAlchemy 2 engine/session. Postgres production, SQLite dev."""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def build_engine(url: str | None = None):
    s = get_settings()
    db_url = url or s.sqlalchemy_url
    return create_engine(db_url, connect_args=_connect_args(db_url), pool_pre_ping=True)


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db(url: str | None = None) -> None:
    from app.db import models  # noqa: F401  (register tables)
    eng = build_engine(url) if url else engine
    Base.metadata.create_all(bind=eng)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
