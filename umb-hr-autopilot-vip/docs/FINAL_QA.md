# FINAL QA — VIP (Master §43, §48, §49 → PHASE 12)

Chạy: `python -m pytest` (76 tests) + smoke `uvicorn :8001` + Node `test:ci`.

## 1. Load / concurrency / failover

- License single-device concurrent (4 threads, file DB): đúng 1 success.
- Lease concurrent (6 threads): 1 winner. Idempotency 20 threads: 1 execute.
- Failover: Core offline → mọi endpoint đọc Core degraded-safe (200/4xx,
  không 500); Socket adapter trả status không treo; 1 integration lỗi không
  sập tool (`/api/vip/system/health`).
- OR-Tools CP-SAT: case 4 NV × 7 ngày solve < 5s, fairness max-min ≤ 2.

## 2. Security review (có test tự động `test_final_qa.py`)

- Quét source `app/ + templates/`: không `BEGIN PRIVATE KEY / AKfyc /
  ya29. / xox / sk-ant- / ghp_ / AIzaSy`; không file `.env` trong repo.
- Service secret không ra browser (test HTML/JS). Log mask secret.
- RBAC backend mọi router (401 không token, 403 sai role — có test).
- Rate-limit login/license: thực hiện ở reverse proxy production (ghi nhận;
  Node đã có `authLimiter`; VIP thêm ở hardening production).
- JWT expiry 12h; `hr/hr123` không dùng làm service credential; 2FA License
  Super Admin theo PHASE 10 khi production.

## 3. UI Definition of Done (§48)

Sidebar + collapse, topbar pills realtime (HTMX 30s), button
hover/pressed/loading/disabled, toast manager, notification bell, skeleton,
drawer employee (PHASE sau), command palette Ctrl+K (mở PHASE 8 ở `/`),
responsive mobile/tablet (`md:`, `max-w-6xl`), dark/light (localStorage +
prefers-color-scheme), reduced-motion, realtime không reload full page, health
+ automation indicators. Chart trang trí: không (đúng §28).

## 4. Business Definition of Done (§49) — trạng thái

| Nhóm | Trạng thái PHASE 12 |
|---|---|
| Core preservation (Admin/Employee/Finance chạy, regression PASS, không mất data) | ✅ `test:ci` 69/69 + force-logout 5/5 |
| Realtime (candidate/attendance/interview/training/test/off/zalo/sync) | ✅ Socket adapter 21 events + envelope; UI Live Activity |
| Automation (morning brief, NBA, inbox, bulk, reminders, Zalo confirm, 7/7, TEST flow, OFF conflict, schedule preview, retry/idempotency/DLQ) | ✅ jobs + API + UI inbox |
| AI (Command Center, evidence eval, confidence gate, no invented evidence, HR approval high-risk) | ✅ rule-based (provider hook sau); gate 0.90/0.65; `INSUFFICIENT_EVIDENCE` |
| License (7 plans, 826 keys, device limits, first-activation expiry, server time, auto logout, admin center) | ✅ + audit |
| Security (no hardcode, service auth, RBAC, branch scope, audit) | ✅ (rate-limit proxy + 2FA prod theo checklist) |

## 5. Deployment readiness

Dev: SQLite + memory fallback chạy ngay. Production checklist
(`docs/DEPLOYMENT.md`): `DATABASE_URL` + Alembic, `REDIS_URL`, secrets thật,
Celery Beat thay runner, proxy rate-limit, 24/7 host (không serverless sleep).
