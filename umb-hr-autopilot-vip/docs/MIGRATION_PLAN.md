# MIGRATION PLAN — Postgres staged (Master §39, PHASE 11)

> Nguyên tắc: không big-bang, không rewrite Core, `db.json` còn đến khi Stage C
> verify xong. Mọi bước đều có rollback (fallback JSON) + regression `test:ci`.

## Stage A (HIỆN TẠI — xong)

- Node `db.json` giữ nguyên là Operational Data Hub.
- VIP Postgres (dev SQLite) chỉ lưu dữ liệu MỚI: `workflow_states`,
  `automation_jobs`, `idempotency_keys`, `exceptions`, `notifications`,
  `ai_evaluations`, `transcripts`, `vip_license_*`, `reconciliation_records`,
  `audit_logs`, `leases`.
- Không vòng lặp sync (§4 envelope).

## Stage B (chuẩn bị — file có sẵn, chưa bật)

- Concurrency entities sang Postgres trước: interview appointments, test
  appointments, off locks, job queue, license/session, audit index.
- VIP: `app/db/locks.py` (lease nguyên tử, thay `SELECT-rồi-INSERT`), Alembic
  versions, `DATABASE_URL` production.
- Node: `um-bo-milk-app/services/vipRepository.js` (**mới, chưa wired** —
  cố tình chưa `require` để zero regression). Khi bật: `dualRead` (Postgres
  trước, fallback JSON) + `dualWrite` (ghi cả hai, 1 backend lỗi vẫn OK),
  rollout từng entity theo `STAGE_B_ENTITIES`, mỗi entity + test đồng thời
  (concurrent booking → 1 success) + `test:ci` xanh mới sang entity tiếp theo.
- Postgres prod thêm `pg_advisory_xact_lock` cho booking/OFF hot paths.

## Stage C (sau khi B ổn)

- Migrate employee operational data; dual-run 1–2 tuần; đối chiếu
  reconciliation `MATCH` 100% mới cắt JSON thành read-only rồi archive.
- Không xóa `db.json` ngay; giữ backup `data/archive/`.

## Rollback

- Mọi dual path default về JSON khi Postgres lỗi (xem `dualRead`).
- Kill switch: `VIP_USE_POSTGRES=0` (sẽ thêm khi wiring Stage B).
