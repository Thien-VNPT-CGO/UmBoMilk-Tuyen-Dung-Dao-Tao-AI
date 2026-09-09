# PHASE 2 — VIP FOUNDATION REPORT (09/09/2026)

> Dự án mới: `umb-hr-autopilot-vip/` (sibling của `um-bo-milk-app/`, không sửa Core).
> Python 3.11 (máy dev; code tương thích 3.11/3.12, không dùng syntax 3.12-only).

## 1. Đã dựng (Master §3, §36–§41)

| Hạng mục | File | Ghi chú |
|---|---|---|
| Config | `app/core/config.py` | Env-only secrets; `DATABASE_URL` (Postgres prod) / SQLite dev `./data/vip.db`; `REDIS_URL` optional |
| Security | `app/core/security.py` | bcrypt, VIP JWT (`HS256`, `iss=umb-vip`), service auth timing-safe (thiếu secret → từ chối) |
| Logging | `app/core/logging.py` | JSON + mask secret (có test không leak) |
| RBAC | `app/core/permissions.py` | Map `Admin/HR/Manager/Umbomilk`, `BRANCH_MANAGER` lọc scope, `can_approve/can_admin_license` |
| DB Stage A | `app/db/models.py` (12 bảng) | workflow_states, automation_jobs, idempotency_keys, exceptions, notifications, ai_evaluations, transcripts, vip_license_*, reconciliation_records |
| Node adapter | `app/integrations/node_core.py` | httpx + headers `X-VIP-Service/Actor/Correlation-Id`; proxy login lấy role/scope thật |
| Socket adapter | `app/integrations/socket_adapter.py` | Subscribe 21 events (§5), envelope `source/version/correlation_id/idempotency`, ring buffer 200, dedupe, reconnect loop, missed-state qua REST |
| Auth API | `app/api/auth.py` | Proxy Node → mint VIP JWT (cookie HttpOnly); dev fallback chỉ non-prod |
| Health API | `app/api/health.py` | `GET /api/vip/system/health` 8 checks (1 integration lỗi không sập tool) |
| Dashboard API | `app/api/dashboard.py` | `/api/dashboard/today` degraded-safe (Core lỗi → list rỗng + `degraded:true`) |
| Events API | `app/api/events.py` | `/api/vip/events/latest` cho Live Activity |
| Rules nền | `workflows/states.py`, `automation/modes.py`, `automation/idempotency.py`, `ai/confidence_gate.py`, `license/plans.py` | State machines, default modes 12 automations, retry delays 30s/2m/10m/30m, gate 0.90/0.65, 7 plans = 826 keys |
| Shell UI | `templates/{base,dashboard,login}.html`, `static/{app.css,app.js}` | Sidebar 16 mục (§28), topbar pills realtime (HTMX 30s), dark mode, toast, ⌘K palette, skeleton, `prefers-reduced-motion` |
| Migration | `alembic.ini`, `alembic/env.py` | `DATABASE_URL` + `upgrade head` cho Postgres (PHASE 11); dev SQLite tự `create_all` |
| Docs | `README.md`, `docs/{DEPLOYMENT,SECURITY_MODEL}.md`, `.env.example`, `.gitignore` | Không commit `.env`/`.db` |

## 2. Verify

- **VIP pytest: 25/25 PASS** (`tests/`): security (hash/token/service-auth/mask),
  permissions (map/rank/scope/gates), modes+gate+plans (826 keys, device limits),
  states (candidate/training transitions), idempotency, socket envelope/dedupe,
  DB create-all 12 bảng + CRUD, API (health shape, 401 guards, secret không ra browser).
- **Smoke test** (`uvicorn :8001`): `/health ok`, system health degraded-safe khi
  Core offline (`NODE_CORE_API FAILED`, DB `HEALTHY`, Redis `DEGRADED`), login +
  dashboard render (2KB/10.6KB HTML).
- **Node regression** `npm run test:ci`: **69/69 + force-logout 5/5 PASS**.
- `data/db.json` giữ baseline (NV 28, keys 38, applicants 2, interviews 0, 0 test
  records, 0 inbound). Fix kèm: `pyproject` package discovery; Starlette 1.x
  `TemplateResponse(request, ...)` + lifespan (bỏ `on_event` deprecated).

## 3. Ràng buộc môi trường ghi nhận

- Không có Postgres/Redis/Docker local → dev dùng SQLite + memory fallback;
  production bắt buộc `DATABASE_URL/REDIS_URL/VIP_SERVICE_SECRET/VIP_SECRET_KEY`.
- Suite Node cũ rò ~1 orphan key/run (tồn tại từ trước, đã dọn về 38 sau mỗi run).

## 4. Exit PHASE 2

- [x] FastAPI + auth + Postgres/Redis-ready + adapters + health + shell UI
- [x] VIP pytest + Node regression PASS, zero sửa Core
- Sẵn sàng **PHASE 3** (Today Dashboard + Exception Inbox + Live Activity +
  Notification Center + Next Best Action).
