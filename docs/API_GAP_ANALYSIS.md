# API GAP ANALYSIS — Core hiện có vs Tool VIP cần (PHASE 0)

> Nguyên tắc: reuse `Existing REST API` trước, chỉ thêm `Internal VIP API` khi không đủ/an toàn (Master §2.2, §42). Không rewrite `server.js`.

## 1. P0 gaps (PHASE 1, Master §6)

| # | Yêu cầu | Hiện trạng (evidence) | Việc cần làm (không phá Core) |
|---|---|---|---|
| 6.1 | Bỏ auto-PASS khi Meet end | `server.js:2622-2662` poller 30s: `nowMs>=endMs -> applicants.status=PASS, passSource=AUTO_MEET_END, interviews.status=COMPLETED + emit interview:auto_pass` | Chuyển `COMPLETED -> COMPLETED_WAITING_PROCESSING -> transcript/notes -> AI eval -> WAITING_HR_REVIEW -> HR PASS/FAIL/RESCHEDULE`; giữ emit compat nhưng không PASS |
| 6.2 | Interview business hours thật | `POST /api/applicants/:id/schedule-interview` chỉ `slotKey=date_slot` string compare (`server.js:2511-2514`), KW `16:30/17:00/Sunday/businessHour` = 0 | Enforce T2-T7, 08:00-17:00, 30p/slot, last start 16:30, no Sunday/past/overlap/double-booking, transaction/lock (Stage B Postgres/Redis) |
| 6.3 | Reminder T-30/T-15/T-5 idempotent | Chỉ T-30 (`reminderSent` bool, `server.js:2609-2620`, window `reminderMs..start+30m`), KW `reminder_due`=1 | Thêm T-15 + T-5 (prepare Meet + HR notify), key `INTERVIEW:{id}:T30/T15/T5`, SUCCESS=>SKIP, restart không duplicate |
| 6.4 | Zalo inbound confirmation | `zalo`=147 refs outbound (`/api/zalo/send`, `sendZaloBotNotification`), KW `inbound/CONFIRMED/NEED_RESCHEDULE`=0 | Thêm webhook inbound parse: positive (`xác nhận, đồng ý, tham gia, ok, yes, có...`)=>CONFIRMED; negative (`không, bận, hủy, cancel...`)=>NEED_RESCHEDULE/DECLINED; ambiguous=>Exception Inbox; adapter `OfficialOA/ConfiguredWebhook/Mock(dev)` |
| 6.5 | TEST scoring chuẩn Master | `evaluate-test`: max 20, `p1>6&&p2>6=>PASSED_TEST`, scale 100; chưa có `<5/5-8/>=8`, chưa tách ai_score vs hr_score | Compatibility layer: giữ API cũ, thêm `finalize` theo thang 10 + lưu `{ai_score,hr_score,final_score,evidence,confidence}`, AI chỉ propose, HR override + audit, không auto promote/logout |
| 6.6 | Security inventory employee-facing | 27 routes không `authMiddleware` (xem SECURITY_GAP) | Phân loại public thật vs cần auth/signed token, thêm employee auth/token, giữ Employee Portal chạy, regression đầy đủ |

## 2. Reuse matrix (Master §5)

Core đã đủ cho VIP read/subscribe: `/api/auth/login, /api/employees, /api/applicants(+score/schedule-interview/status/convert), /api/interviews, /api/zalo/send, /api/attendances(+checkin/checkout), /api/schedules(+auto-official/auto-training/approve-next-week/generate-draft/coordinate), /api/off-requests(+off-window/register-off), /api/employees/:id/schedule-test|evaluate-test|complete-meet-test|trigger-online-test, /api/settings(masked), /api/audit-logs, /api/sync-queue(+status/diagnostic), /api/dashboard/kpi|charts` + finance/report APIs.
Socket đã có đủ `applicants/employees/attendances/interviews/interview:reminder_due/interview:auto_pass/schedules:update/approved/draftReady/offRequests/zalo/notifications/sync/audit/hr:action/forceLogout/settings/keys/testResults/trainingShiftRequests/automation:heartbeat` — VIP subscribe thay vì polling.

## 3. Internal VIP API đề xuất (chỉ thêm khi cần, `routes/vip.js` + `services/vipIntegration.js`)

```
GET  /api/vip/state/candidate/:id
GET  /api/vip/state/employee/:id
POST /api/vip/interviews/bulk-preview
POST /api/vip/interviews/bulk-create (per-item idempotency, partial success 10 OK/2 FAIL)
POST /api/vip/interviews/:id/confirm
POST /api/vip/interviews/:id/complete (COMPLETED_WAITING_PROCESSING, không PASS)
POST /api/vip/test/:id/finalize (HR confirm + override audit)
POST /api/vip/employees/:id/promote-official (ASSISTED, HR approve)
GET  /api/vip/reconciliation/snapshot
POST /api/vip/reconciliation/resolve (human confirm, không auto overwrite)
GET  /api/vip/system/health (NODE, VIP DB, Redis, worker, Socket, Sheet/Drive/Calendar/Meet, Zalo, AI, License)
```

## 4. Non-goals PHASE 0

Không thêm endpoint, không sửa rule, không migrate Postgres, không đụng `db.json`. VIP Foundation (FastAPI + Postgres + Redis + Node/Socket adapter) bắt đầu PHASE 2 sau khi P0 xong.
