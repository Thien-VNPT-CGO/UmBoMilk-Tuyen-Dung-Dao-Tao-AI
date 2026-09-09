# DEPLOYMENT — VIP (Master §46)

## Node Core

Giữ deployment hiện tại (port 3000). Không sửa Core ở PHASE 2.

## VIP Backend (cần chạy 24/7 ở production)

```
FastAPI (uvicorn) :8001  +  PostgreSQL  +  Redis  +  Worker/Scheduler (PHASE 9)
```

| Biến | Dev | Production |
|---|---|---|
| `DATABASE_URL` | (trống → SQLite `./data/vip.db`) | `postgresql+psycopg://…` + `alembic upgrade head` |
| `REDIS_URL` | (trống → DEGRADED, fallback memory) | `redis://…` bắt buộc cho jobs/locks (PHASE 9) |
| `VIP_SECRET_KEY` | dev-only | random 32+ ký tự, rotate định kỳ |
| `VIP_SERVICE_SECRET` | test-only | bắt buộc, không expose frontend |
| `NODE_CORE_URL` | `http://127.0.0.1:3000` | URL Core nội bộ + `VIP_SERVICE_*` |

Không deploy background jobs quan trọng trên serverless dễ sleep khi chưa có
worker bền vững. Health tổng hợp: `GET /api/vip/system/health`.

## UI

VIP Web deploy riêng được, nhưng backend automation phải persistent (PHASE 9).
