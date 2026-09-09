# BASELINE REPORT — PHASE 0 (UMB HR AUTOPILOT VIP)

> Ngày: 09/09/2026
> Phạm vi: audit source hiện tại, không sửa business behavior
> Baseline commit: `3a88460` (branch `main`, working tree clean trước audit)
> Lệnh chuẩn: `npm run test:ci` (boot server `NODE_ENV=test` + `DISABLE_OUTBOUND_SYNC=true`)

## 1. Snapshot source

| Item | Giá trị thực đo |
|---|---|
| `server.js` | 9933 dòng, Express + Socket.io, persistence `data/db.json` |
| `public/js/admin.js` | 356955 bytes (~13 tabs Admin) |
| `public/js/employee.js` | 165921 bytes (~9 tabs Employee) |
| `public/js/finance.js` | 36384 bytes |
| `package.json` | `um-bo-milk-hr-system@1.0.0`, deps: express 4.19, socket.io 4.7, jsonwebtoken 9, bcryptjs 2.4, helmet 8.3, express-rate-limit 8.7, multer, nodemailer, uuid |
| `data/db.json` | 1746391 bytes; users 4, branches 4, employees 28, applicants 2, keys 38(+1?), attendances 39, schedules 39, offRequests 5, trainingShiftRequests 44, shiftSwapRequests 16, testResults 3, auditLogs 500, zaloRecords 195, syncQueue 176, notifications 395, interviews 0 |
| `prisma/schema.prisma` | Đã có models Employee/Applicant/Attendance/Schedule/Key/OffRequest/EmergencyRequest/PayrollPeriod/Snapshot/AuditLog — **chưa phải persistence chính** |
| `services/dbAdapter.js` | Tồn tại, chưa thay thế `db.json` |
| `scripts/ci-test.js` | Boot server test, đợi `/health`, chạy `test/*.test.js` + `verify_force_logout.js`, TEST_GUARD chặn sync Sheet thật |

Backup: git working tree clean tại `3a88460`; khuyến nghị tag `phase0-baseline-20260909` trước khi sang PHASE 1. Không tạo file backup nhị phân trong repo để tránh phình repo. `data/db.json` không bị ghi đè bởi test (TEST_GUARD + cleanup trong `verify_force_logout.js` finally).

## 2. Kết quả baseline `npm run test:ci` (09/09/2026)

`npm test` trực tiếp (không boot server) FAIL toàn bộ với `ECONNREFUSED 127.0.0.1:3000` — đây là hành vi đúng theo thiết kế test (cần server). Lệnh chuẩn `npm run test:ci` cho kết quả:

```
tests 52, suites 6, pass 52, fail 0
+ verify_force_logout.js: 5/5 PASS (soft delete, hard delete, PUT ARCHIVED, not-exist, socket realtime)
[CI-TEST] TẤT CẢ PASS
```

Chi tiết suite:
1. Comprehensive Attendance, Training Shifts, 5 Days OFF & HR Approval Center — PASS
2. Finance Reports & 3 Sheet Templates (matrix 1-31, đồng phục, khám SK, payroll-summary) — PASS
3. Flexible Applicant Training Convert (>=2 ca / >=2 CN) — PASS (5/5)
4. Google Sheet 17iXM Data Loss Prevention & Reset ALL Bound — PASS (403 khi rebuild/delete 17iXM)
5. Google Sheet Duplicate Phone Guard (409 conflict) — PASS (5/5)
6. Quiz Bank Real Sheet Sync (>=25 câu, submit 25 câu) — PASS
7. Realtime & Automation (health, branchScope, settings masked, sync status, drive) — PASS
8. Realtime Notifications + Training Auto-Swap OFF — PASS
9. Realtime OFF & AI Scheduling Coordination — PASS
10. Render Env 18 biến — PASS
11. Training Multi-Shift (2-3 ca/ngày, OFF constraint, auto attendance) — PASS

Kết luận: **baseline PASS 100%, đủ điều kiện exit PHASE 0**.

## 3. Regression guard đã xác minh

- `TEST_GUARD` (`x-is-test`, `isTest`) bỏ qua `addSyncQueue` / `syncOutboundToMasterDatabaseSheet` — log `[TEST GUARD]` xuất hiện xuyên suốt, không đẩy dữ liệu test lên Sheet 17iXM.
- `verify_force_logout.js` finally tự dọn `employees/keys/syncQueue` chứa `test`/`isTest` và hard-delete test employees.
- Ràng buộc Sheet 17iXM: xóa local giữ Sheet (`keptOnSheet: true`, `[CASCADE DELETE] Local only`), rebuild/delete 17iXM bị 403.
- ForceLogout: `401 + {forceLogout:true}` sau soft/hard/PUT ARCHIVED + `socket employee:forceLogout` realtime — PASS.

## 4. Phạm vi PHASE 0 (không đổi behavior)

- Chỉ đọc + đo + viết `docs/` (6 file này). Không sửa `server.js`, `public/js/*`, `data/db.json`, test.
- P0 phát hiện được ghi trong `API_GAP_ANALYSIS.md` / `SECURITY_GAP_ANALYSIS.md`, để dành PHASE 1, không sửa ngay.

## 5. Exit criteria

- [x] Backup định danh (commit `3a88460`, tree clean)
- [x] Full tests PASS via `test:ci`
- [x] 5 docs map tạo đủ (xem `docs/`)
- [x] Zero file business bị sửa
