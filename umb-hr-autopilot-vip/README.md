# UMB HR Autopilot VIP — PHASE 2 Foundation

> Python Control Center cho HR (Master `UMB_HR_AUTOPILOT_MASTER_PROMPT_FINAL_V3.md`).
> PHASE 2: auth, Postgres/Redis-ready, Node Core adapter, Socket adapter,
> realtime health, modern shell UI. Không đụng Node Core (`um-bo-milk-app/`).

## Chạy dev

```bash
cd umb-hr-autopilot-vip
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -e ".[dev]"       # hoac: pip install -r <tu pyproject>
copy .env.example .env
python -m pytest              # VIP pytest foundation
uvicorn app.main:app --host 127.0.0.1 --port 8001
# UI: http://127.0.0.1:8001/ (login) -> /dashboard (shell)
```

Mặc định dev: SQLite `./data/vip.db` (tự tạo), Redis thiếu → health `DEGRADED`
+ fallback in-memory (không sập tool). Production: đặt `DATABASE_URL`
(Postgres) + `REDIS_URL` + `VIP_SERVICE_SECRET` + `VIP_SECRET_KEY` thật.

## Login

- Ưu tiên proxy Node Core `POST /api/auth/login` (lấy đúng role/branchScope,
  map `Admin→ADMIN, HR→HR, Manager→BRANCH_MANAGER, Umbomilk→VIEWER`), mint VIP
  JWT riêng vào cookie HttpOnly.
- Dev fallback chỉ khi `VIP_ENV != prod` + `VIP_DEV_ADMIN_HASH` (bcrypt).

## Cấu trúc (Master §41, rút gọn PHASE 2)

```
app/main.py  core/{config,security,logging,permissions}
api/{auth,dashboard,events,health}  integrations/{node_core,socket_adapter}
workflows/states  automation/{modes,idempotency}  ai/confidence_gate
license/plans  db/{base,models}  templates/  static/  tests/  docs/
```

PHASE 3+: Dashboard/Exceptionimax, PHASE 4+: workflow engines, PHASE 9: Celery/
job engine + DLQ + reconciliation, PHASE 10: License Center, PHASE 11: migration.

## Quy tắc

- Không hard-code secret; không log secret (xem `core/logging.mask`).
- Rule nghiệp vụ cứng bằng code (không LLM): business hours, conflict, OFF,
  threshold, branch scope, license expiry.
- Mọi event có `source/version/correlation_id/idempotency_key/updated_at`;
  không tạo vòng lặp sync với Sheet/Core.
- High-risk action cần HR approval (`permissions.can_approve`).
