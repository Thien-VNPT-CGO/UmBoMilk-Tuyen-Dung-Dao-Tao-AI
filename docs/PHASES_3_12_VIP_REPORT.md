# PHASES 3–12 — VIP AUTOPILOT REPORT (09/09/2026)

> Triển khai trên `umb-hr-autopilot-vip/` (Python). `um-bo-milk-app/` (Node Core)
> chỉ thêm 1 file mới `services/vipRepository.js` **chưa wired** (zero runtime).
> Không sửa test cũ, không phá luồng Admin/Employee/Finance.

## 1. Tổng hợp theo phase

| Phase | Nội dung | File chính | Test |
|---|---|---|---|
| 3 | Today Dashboard (`/brief`), Exception Inbox (OPEN/ACK/RESOLVED/IGNORED), Notification Center, Next Best Action | `api/{dashboard,inbox,notifications}.py`, `workflows/next_action.py`, `templates/inbox.html` | `test_phase3.py` |
| 4 | Interview Autopilot: slot gen business hours, bulk-preview (conflict), bulk-create (partial success + idempotency/item), confirm/complete (không auto-PASS), workflow_states | `api/interviews.py`, `workflows/interview.py` | `test_phase4.py` |
| 5 | Training 12 ngày (7+5, không giả liên tục), 7/7 detector, attendance realtime + anomaly (LATE/MISSING_CHECKOUT/ABSENT/VIOLATION) | `api/training.py`, `workflows/{training,attendance_rules}.py` | `test_phase5.py` |
| 6 | TEST AI: schedule 90p (last start 15:30), rubric 1/0.5/0, final `<5/5–8/≥8`, transcript ingest, propose→HR finalize (ủy quyền Node) | `api/test_center.py`, `workflows/test_rules.py` | `test_phase6.py` |
| 7 | OFF (window T6 12:00–T7 15:00 VN, FCFS branch+shift+date), **OR-Tools CP-SAT** scheduler (hard + fairness soft), draft→approve (+best-effort Node sync) | `api/scheduling.py`, `workflows/{off_rules,scheduler}.py` | `test_phase7.py` |
| 8 | AI Command Center: rule-based NLU (lịch PV/nhắc/test/brief), preview-first, execute (confirm=true, RBAC/scope, bulk partial + idempotency) | `api/ai_command.py`, `ai/command_router.py` | `test_phase8.py` |
| 9 | Automation 24/7: 12 jobs registry, in-process runner (Celery swap prod), idempotency+retry delays+DLQ (retry/ignore), reconciliation (DATA_CONFLICT, không auto overwrite), morning brief | `api/automation.py`, `automation/{jobs,morning,reconciliation}.py` | `test_phase9.py` |
| 10 | License Center: seed 826 keys, activation (first-activation expiry, 6M/1Y calendar, server time), TEST global 10m + unlimited, 2H max 2, reset-device giữ expiry, lock/revoke→realtime logout, admin + audit | `api/license.py`, `license/service.py` (+`AuditLog`) | `test_phase10.py` |
| 11 | Migration hardening: `db/locks.py` (lease nguyên tử, thay SELECT-rồi-INSERT), `services/vipRepository.js` (dual-read/write, **chưa wired**), `docs/MIGRATION_PLAN.md` (A/B/C + rollback) | `app/db/{locks,models}`, `docs/MIGRATION_PLAN.md` | `test_phase11.py` |
| 12 | Final QA: concurrency (license/lease/idempotency threads), failover degraded-safe, quét secret, responsive + reduced-motion, DoD mapping | `docs/FINAL_QA.md` | `test_final_qa.py` |

## 2. Verify cuối

- **VIP pytest: 76/76 PASS.**
- **Node `test:ci`: 69/69 + force-logout 5/5 PASS** (không sửa Core behavior).
- `data/db.json` giữ baseline PHASE 0 (NV 28, keys 38, applicants 2, interviews 0,
  0 test records, 0 inbound leak). Backup: `data/archive/db_before_phase1_cleanup.json`.
- Smoke `uvicorn :8001`: `/health ok`, system health degraded-safe, login + dashboard render.

## 3. Nợ kỹ thuật ghi nhận (ngoài scope, không chặn)

- Suite Node cũ rò ~1 orphan key/run (đã dọn về 38 sau mỗi run) và
  `zaloRecords/notifications` tăng dần — nên bổ sung cleanup `after()` cho suite cũ.
- Rate-limit VIP + 2FA License Super Admin thực hiện ở production hardening.
- Celery Beat thay in-process runner; `pg_advisory_xact_lock` khi wiring Stage B.
- AI provider (OpenAI/Whisper) cắm vào `ai/` khi có key — rule engine vẫn chạy độc lập.
