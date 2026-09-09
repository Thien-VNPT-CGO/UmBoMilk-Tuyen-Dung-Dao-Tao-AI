# WEBSITE INTEGRATION MAP — UMB HR Core hiện tại (PHASE 0)

> Nguồn đo thực: `server.js` 9933 dòng (regex `app.(get|post|put|patch|delete)('path')` => **165 routes**), `data/db.json` top-level 30 keys, `public/*.html` + `public/js/*`.
> Master Prompt ghi "170 routes" — chênh 5 routes do: static pages (`/`, `/admin`, `/employee`, `/finance`, `/health` x2), redirect/shim (`/api/overtime`, `/api/overtime/reports`, `/api/leave/reports`), dual-path (`/api/attendance/checkin|check-in`, `/training/shift-change|shift-requests`). Tổng đo được 165 là đầy đủ để reuse; không thiếu nhóm nghiệp vụ nào trong §5 Master.

## 1. Portals & static

| Portal | File | JS | Ghi chú |
|---|---|---|---|
| Landing | `public/index.html` (`GET /`) | — | Chọn cổng Admin/Employee/Finance |
| Admin HR | `public/admin.html` (`GET /admin`) | `public/js/admin.js` 357KB | 13 tabs + hrToast + `hr:action` realtime (Req #10) |
| Employee | `public/employee.html` (`GET /employee`) | `public/js/employee.js` 166KB | 9 tabs, camera sau + GPS thật (PLAN #5d/6a), OFF, emergency, E-learning 20 câu |
| Finance | `public/finance.html` (`GET /finance`) | `public/js/finance.js` 36KB | Matrix 1-31, đồng phục, khám SK, payroll-summary |

Health: `GET /health` + `GET /api/health` (public, cho CI + Render).

## 2. Full route catalog (165)

### 2.1 Auth / users / keys (Employee Key — KHÔNG phải VIP License)

```
POST /api/auth/login (public, rate-limited) -> JWT 12h {id,username,role,branchScope,allowedTabs}
POST /api/auth/employee-login (public, rate-limited) {employeeId,key,deviceId} -> Device Binding 1-1, 30p EXPIRED, needDeviceReset
POST /api/auth/finance-login (public) -> financeKeys
POST /api/auth/device-request (public) -> deviceRequests PENDING -> HR duyệt
GET  /api/employee/me (public + token employee) -> {valid} hoặc 401 {forceLogout:true}
GET  /api/keys (auth) | POST /api/keys/generate (auth) | POST /api/keys/:id/revoke (auth)
GET  /api/device-requests (auth) | POST /api/device-requests/:id/approve|reject (auth)
GET  /api/users (Admin) | POST /api/users (Admin) | PUT /api/users/:id (Admin) | DELETE /api/users/:id (Admin)
GET  /api/finance-keys (Admin) | POST /api/finance-keys/generate (Admin) | POST /api/finance-keys/:id/revoke (Admin)
```

### 2.2 Applicants / Interviews (P0 §6.1-6.4)

```
GET  /api/applicants (auth)
POST /api/applicants (PUBLIC — Form/Sheet inbound, chống trùng SĐT 409)
POST /api/applicants/:id/score (auth) — AI chấm breakdown
POST /api/applicants/:id/schedule-interview (auth, HR) — slotKey string compare (xem GAP)
POST /api/applicants/:id/status (auth) — PASS tạo Zalo invite stub Meet link random
POST /api/applicants/:id/convert (auth) — PASS -> Training 12 ngày (7 work + 5 off), shift map, branch
DELETE /api/applicants/:id (auth)
GET  /api/interviews (PUBLIC — employee-facing, cần review §6.6)
POST /api/interviews/clear-all (Admin)
Poller 30s: T-30 reminder (reminderSent bool) + AUTO-PASS khi Meet end (server.js:2596-2669)
```

### 2.3 Employees / Training / Test (P0 §6.5)

```
GET  /api/employees (auth + branchScope)
POST /api/employees (HR) — sinh mã CNxxx_UBMddmmyyyy_NVxxxx, Key 1-1, TEST_GUARD
POST /api/employees/import-official (HR) — upsert Official
POST /api/employees/import-training (HR) — upsert Training theo phone/employeeId (PLAN #3)
PUT  /api/employees/:id (HR/Manager) — ARCHIVED => forceLogout
DELETE /api/employees/:id (?hard=true) (HR) — cascade local, GIỮ Sheet 17iXM
DELETE /api/employees/:id/purge (auth)
POST /api/employees/:id/transition (HR/Manager) | POST /api/employees/:id/transition-official (HR)
POST /api/employees/:id/trigger-online-test (auth) | POST /api/employees/:id/schedule-test (auth, gap 90m) | POST /api/employees/:id/complete-meet-test (auth) | POST /api/employees/:id/evaluate-test (auth, 20-criteria, rule hiện tại p1>6 && p2>6 — xem GAP vs Master <5/5-8/>=8)
GET  /api/test-results | GET /api/courses | POST /api/courses/:id/submit (PUBLIC) | POST /api/courses/import (HR) | POST /api/quiz/open (PUBLIC) | POST /api/quiz/config (Admin) | POST /api/quiz/sync (HR) | GET /api/quiz/status (PUBLIC)
```

### 2.4 Attendance / Schedules / OFF / Swap / Emergency (Master §17-21)

```
GET  /api/attendances (auth) — GPS+ảnh+Drive path, violations
POST /api/attendance/checkin|check-in (PUBLIC employee-facing, bắt buộc image data:image/* base64, GPS)
POST /api/attendance/checkout|check-out (PUBLIC, bắt buộc image)
GET  /api/attendance/official-monthly (PUBLIC + employeeId+month)
GET  /api/attendance/anomalies (auth) | GET|POST /api/attendance/adjustments (auth) | POST /api/attendance/adjustments/:id/approve|reject (HR)
GET  /api/schedules (auth) | POST /api/schedules (auth) | POST /api/schedules/auto-official|auto-training (HR/Manager) | POST /api/schedules/coordinate (HR/Manager) | GET /api/schedules/next-week (auth) | POST /api/schedules/approve-next-week (HR) | POST /api/schedules/generate-next-week-draft (HR) | GET /api/schedules/approve-test-status (HR/Manager) | POST /api/schedules/approve-test-week (HR)
GET+POST /api/training/shift-change (+alias shift-requests) | POST approve|reject (HR/Manager)
GET  /api/shift-swap (auth) | POST /api/shift-swap (PUBLIC) | POST /api/shift-swap/:id/approve|reject (HR/Manager) | POST /api/shift-swap/:id/respond (PUBLIC) | POST /api/shift-swap/hr-broadcast (HR/Manager)
GET  /api/off-requests (auth) | POST /api/off-requests (PUBLIC — Official max 2/tuần FCFS + Training 5 ngày, window T6 12:00-T7 15:00, vipTestMode bypass)
POST /api/employee/register-off (PUBLIC — Training 5 OFF / 12 ngày)
GET  /api/off-window (PUBLIC) + broadcast offWindow:update mỗi 60s
POST /api/admin/off-vip (Admin, bật/tắt vipTestMode)
GET  /api/emergency-requests (auth) | POST /api/emergency-requests (PUBLIC) | POST /api/emergency-requests/:id/respond (PUBLIC)
GET  /api/overtime-requests (auth) | POST /api/overtime-requests (auth) | POST approve|reject (HR/Manager) | POST /api/overtime (shim) | GET /api/overtime/reports (redirect)
GET  /api/leave-requests (auth) | POST (auth) | POST approve|reject (HR/Manager) | GET /api/leave/balances (auth) | GET /api/leave/reports (redirect)
```

### 2.5 Zalo / Drive / Sheet sync / Reports / Settings / Admin

```
POST /api/zalo/send (auth) — sendZaloBotNotification QUEUED->SENT, type INTERVIEW_INVITE/REMINDER_30MIN/CHECKIN... | POST /api/zalo/test (Admin) | GET /api/zalo-records (auth)
GET  /api/drive/files (auth) | POST /api/drive/upload (auth) — hiện tạo folder + meta, chưa upload binary thật (PLAN #8 GAP)
POST /api/recruitment/form-submit (PUBLIC webhook Form/Sheet) | POST /api/recruitment/sync-form (auth) | POST /api/sheets/cleanup-form (Admin) | GET /api/sheets/form-info (auth)
GET  /api/sync-queue (auth) | POST /api/sync-queue/clear-failed|clear-all|retry-all (auth) | POST /api/sync-queue/:id/retry (auth) | GET /api/sync/status (auth) | GET /api/sync/diagnostic (Admin) | POST /api/sync/test-webhook (Admin)
POST /api/admin/pull-from-sheet (Admin) | POST /api/admin/sync-from-sheet (Admin, upsert theo employeeId, không push ngược) | POST /api/admin/sync-down-deletions (Admin) | POST /api/admin/rebuild-sheet-tab (Admin, 403 với 17iXM) | POST /api/admin/delete-sheet-rows (Admin, 403 với 17iXM) | POST /api/admin/test-sheet-access (Admin) | GET /api/admin/inspect-sheet (Admin) | POST /api/admin/clean-test-data (Admin) | POST /api/admin/env/sync (Admin) | GET /api/admin/env (Admin, 18 vars) | POST /api/render/deploy-hook
GET  /api/reports/attendance|payroll|overview|monthly|daily (auth, payroll cần HR) | GET /api/reports/export/:type (auth) | POST /api/reports/reset (Admin)
GET  /api/settings (HR/Manager) | GET /api/settings/masked (auth, mask privateKey •) | PUT /api/settings (Admin, audit)
GET  /api/branches | GET /api/notifications (PUBLIC? — xem SECURITY_GAP) | POST /api/notifications/:id/read | GET /api/audit-logs (auth) | GET /api/dashboard/kpi|charts (auth)
Finance (financeAuthMiddleware): GET overview|monthly|daily|anomalies|matrix|dong-phuc|kham-suc-khoe|payroll-summary|export/payroll-input + sheets master-data|dong-phuc|kham-suc-khoe|template-info (GET+POST) | POST /api/auth/finance-login
POST /api/system/reset (Admin)
```

## 3. Source-of-truth & ownership (hiện tại -> VIP đề xuất)

| Entity | Write owner hiện tại | Read/mirror | VIP DB (Stage A, không đụng Core) |
|---|---|---|---|
| employees/applicants/keys | Node Core `db.json` (HR Web + Form webhook) | Sheet 17iXM mirror 1 chiều, VIP read-only adapter | workflow_states, exceptions, notifications mirror |
| interviews | Node `db.interviews` (HR tạo, poller auto) | Sheet + Zalo outbound | interview workflow state, idempotency `INTERVIEW:{id}:T30/T15`, bulk preview |
| attendance raw | Employee checkin/out -> `db.attendances` (RECORD_DIEM_DANH) | Báo cáo aggregate, Sheet | anomaly events, attendance.* event delta |
| schedules/off | HR auto + employee register -> `db.schedules/offRequests` | Sheet tabs, offWindow broadcast | schedule draft/preview, OFF locks (Stage B Postgres) |
| test | HR schedule + employee submit + HR evaluate -> `db.testResults/employees.testSchedule` | Sheet | ai_evaluations, transcripts, rubric proposals, HR override audit |
| zalo | Node `sendZaloBotNotification` outbound only | `db.zaloRecords` QUEUED/SENT/FAILED | message_id, retry_count, DLQ, inbound parse (mới) |
| sync | `syncQueue {version,updated_at,source,sync_status}` + TEST_GUARD | Sheet 17iXM (không xóa dòng) | reconciliation_records, DATA_CONFLICT inbox |
| audit/users/settings | Node audit(actor,action,entity,before,after,ip) + RBAC branchScope | Admin UI | VIP audit index (actor, correlation_id, source WEB_HR/WEB_EMPLOYEE/GOOGLE_SHEET/VIP_AUTOMATION...) |
| license | Employee Key (`/api/keys`, Device Binding) — **cấm reuse** | — | `VIP_LICENSE_*` namespace riêng, 826 keys, first-activation expiry (PHASE 10) |

Nguyên tắc chống loop (Master §4): mọi event VIP phải có `source/version/correlation_id/idempotency_key/updated_at`; `sync-from-sheet` không `addSyncQueue`; xóa local không xóa Sheet; không `Website→Sheet→VIP→Website→Sheet`.
