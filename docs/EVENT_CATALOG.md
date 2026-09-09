# EVENT CATALOG — Socket.io hiện tại (PHASE 0)

> Đo thực: `io.emit/socket.emit` trong `server.js` = **48 events**; `socket.on` server = `disconnect`, `ping:heartbeat`; `admin.js socket.on` = 11; `employee.js socket.on` = 4; `finance.js` = 0 (polling REST).

## 1. Server emits (48)

```
adjustments:update, admin:notification, applicants:update, attendances:update, audit:new,
automation:heartbeat, courses:update, db:init, db:update, deviceRequests:update, drive:update,
emergencyRequests:update, employee:action, employee:forceLogout, employees:update,
finance:dongPhuc:update, finance:forceLogout, finance:khamSK:update, finance:masterData:update,
financeKeys:update, hr:action, interview:auto_pass, interview:reminder_due, interviews:update,
keys:update, leave:update, notifications:update, offRequests:update, offWindow:update,
overtime:new, overtime:update, payrollPeriods:update, payrollSnapshots:update, penalties:update,
pong:heartbeat, render:env:update, schedules:approved, schedules:draftReady, schedules:update,
settings:update, shiftSwap:update, shiftSwapRequests:update, sync:update, system:reset,
testResults:update, trainingShiftRequests:update, users:update, zalo:update
```

## 2. Client subscribe hiện tại

- `admin.js` (11): `admin:notification, automation:heartbeat, connect, connect_error, disconnect, employee:action, hr:action, interview:auto_pass, render:env:update, sync:update, system:reset` + fetch lại list + `hrToast(action,success)` (PLAN #10).
- `employee.js` (4): `connect, disconnect, employee:forceLogout, offWindow:update` + bell `#notifCount`, ẩn nav notifs với Training (PLAN #5c).
- `finance.js` (0 socket): chỉ REST finance — VIP cần bổ sung subscribe `finance:*` nếu muốn realtime Finance.

## 3. Mapping sang VIP internal events (Master §7) — chưa implement, PHASE 4-9

| VIP event chuẩn | Nguồn Node hiện tại | Ghi chú adapter |
|---|---|---|
| candidate.created/updated/screened | `applicants:update` + `audit:new` | Delta theo `version/updated_at`, không gửi full DB cho AI |
| interview.created/confirmed/reminder_due/started/completed/no_show | `interviews:update`, `interview:reminder_due`, `interview:auto_pass` (giữ compat nhưng không dùng để PASS) | Tách T-30/T-15/T-5 idempotent; COMPLETED_WAITING_PROCESSING thay AUTO PASS |
| training.started/attendance_updated/completed | `employees:update`, `trainingShiftRequests:update`, `schedules:update` | 7/7 detector từ NHAN_VIEN_TRAINING + TRAINING_OFF + RECORD_DIEM_DANH |
| test.ready/scheduled/completed/evaluation_ready/reviewed | `testResults:update`, `employees:update`, `courses:update` | Rubric proposal + HR override + final rule |
| attendance.checkin/checkout/late/missing | `attendances:update` (raw RECORD_DIEM_DANH, không dùng BAO_CAO_CHAM_CONG) | Rule/anomaly engine, VIOLATION/LATE/MISSING_CHECKOUT |
| off.requested/approved/conflict | `offRequests:update`, `offWindow:update`, `schedules:approved/draftReady` | FCFS lock branch+shift+date |
| schedule.draft_ready/approved | `schedules:draftReady/approved/update` | OR-Tools preview/approve |
| zalo.received/sent/failed | `zalo:update` (hiện chỉ sent/failed) | Thêm inbound webhook `zalo.received` (P0 §6.4) |
| sheet.synced/conflict | `sync:update`, `db:update`, `drive:update` | Reconciliation DATA_CONFLICT inbox |
| system.integration_failed/recovered | `automation:heartbeat`, `render:env:update`, `system:reset`, `settings:update` | System Health HEALTHY/DEGRADED/FAILED |

Chuẩn envelope VIP (khi implement): `{event_id, event_type, entity_type, entity_id, source, version, occurred_at, correlation_id, payload}` với `source ∈ {WEB_HR, WEB_EMPLOYEE, GOOGLE_SHEET, VIP_AUTOMATION, VIP_AI, SYSTEM}`.
Realtime VIP: `Node Socket.io -> VIP Event Adapter (python-socketio) -> normalize -> workflow/exception/notification -> VIP WebSocket/SSE -> HR UI` (không polling toàn hệ thống, reconnect lấy missed state, duplicate event process-once).
