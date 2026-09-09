"""UMB HR Autopilot VIP — shared Settings (Master §3, §36, §40, §45).

Moi secret doc tu env. Khong hard-code. Khong log secret.
Postgres production (DATABASE_URL); SQLite file cho dev (VIP_DB_PATH).
Redis tuy chon — thieu thi health=DEGRADED + fallback in-memory.
"""
from __future__ import annotations

import os
from functools import lru_cache


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


class Settings:
    ENV: str = _env("VIP_ENV", "dev")
    HOST: str = _env("VIP_HOST", "127.0.0.1")
    PORT: int = int(_env("VIP_PORT", "8001") or 8001)
    SECRET_KEY: str = _env("VIP_SECRET_KEY", "dev-only-insecure-secret-key-32-chars")
    JWT_EXPIRES_MIN: int = int(_env("VIP_JWT_EXPIRES_MIN", "720") or 720)

    NODE_CORE_URL: str = _env("NODE_CORE_URL", "http://127.0.0.1:3000").rstrip("/")
    NODE_CORE_TIMEOUT_SEC: float = float(_env("NODE_CORE_TIMEOUT_SEC", "10") or 10)

    SERVICE_CLIENT_ID: str = _env("VIP_SERVICE_CLIENT_ID", "vip-service")
    SERVICE_SECRET: str = _env("VIP_SERVICE_SECRET", "")

    DEV_ADMIN_USER: str = _env("VIP_DEV_ADMIN_USER", "admin")
    DEV_ADMIN_HASH: str = _env("VIP_DEV_ADMIN_HASH", "")
    DEV_ROLE: str = _env("VIP_DEV_ROLE", "ADMIN")

    DATABASE_URL: str = _env("DATABASE_URL", "")
    DB_PATH: str = _env("VIP_DB_PATH", "")

    REDIS_URL: str = _env("REDIS_URL", "")

    AI_CONF_AUTO: float = 0.90
    AI_CONF_ASSISTED: float = 0.65

    @property
    def sqlalchemy_url(self) -> str:
        if self.DATABASE_URL:
            url = self.DATABASE_URL
            # Render/Railway cap postgres:// — chuan hoa cho SQLAlchemy+psycopg
            if url.startswith("postgres://"):
                url = "postgresql+psycopg://" + url[len("postgres://"):]
            return url
        from app.core.paths import default_db_path
        path = self.DB_PATH or default_db_path()
        parent = os.path.dirname(os.path.abspath(path))
        os.makedirs(parent, exist_ok=True)
        return f"sqlite:///{os.path.abspath(path)}"

    @property
    def is_prod(self) -> bool:
        return self.ENV.lower() in ("prod", "production")


@lru_cache
def get_settings() -> Settings:
    return Settings()
