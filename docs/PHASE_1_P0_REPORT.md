# PHASE 1 — P0 CORE FIX REPORT (09/09/2026)

> Phạm vi: Master §6.1–6.6. Chỉ sửa P0, giữ tương thích UI/API cũ, zero regression.
> Regression: `npm run test:ci` → **69/69 PASS** (52 cũ + 17 mới) + `verify_force_logout.js` 5/5 PASS.

## 1. Thay đổi trong `server.js` (+279/-20 dòng)

| # | Master | Thay đổi | Tương thích |
|---|---|---|---|
| 6.1 | Bỏ auto-PASS khi Meet end | Poller: `SCHEDULED` + hết giờ → `COMPLETED_WAITING_PROCESSING`, applicant `INTERVIEW` → `WAITING_HR_REVIEW`, audit `INTERVIEW_COMPLETED_WAITING_REVIEW` | Giữ emit `interview:auto_pass` (payload thêm `autoPassDisabled:true, nextStatus`) cho UI cũ; HR vẫn PASS tay qua `/api/applicants/:id/status` |
| 6.2 | Business hours thật | Mới `parseInterviewSlot/validateInterviewSlot/checkInterviewOverlap`: T2–T7, 08:00–17:00, 30p/slot, slot cuối 16:30, cấm Sunday/quá khứ, overlap theo khoảng giờ (không chỉ `slotKey` string) | Giữ check `slotKey` cũ + thêm overlap; reschedule reset flag reminder |
| 6.3 | Reminder T-30/T-15/T-5 | Thêm `reminderT15Sent/reminderT5Sent` (giữ `reminderSent` cho T-30), mỗi loại gửi đúng 1 lần, flag persist `db.json`; T-5 chỉ notify HR (`hr:action` + `interview:reminder_due kind:T5_HR_PREPARE`), không spam ứng viên | Kind mới trong event cũ `interview:reminder_due` (`T30/T15/T5_HR_PREPARE`) |
| 6.4 | Zalo inbound | Mới `POST /api/zalo/inbound` (public + verify secret tùy chọn): normalize không dấu → POSITIVE (`ok, xác nhận, đồng ý...`) → `CONFIRMED`; NEGATIVE (`bận, hủy...`) → `NEED_RESCHEDULE`; UNKNOWN → notify HR (Exception Inbox), không tự quyết; dedupe 60s; emit `zalo:received` | Không đụng outbound; invite Zalo giờ yêu cầu `XÁC NHẬN THAM GIA` để parse được |
| 6.5 | TEST scoring | `evaluate-test` giữ nguyên field cũ (`isPassed/resultStatus/testScore`) + thêm `totalScore10/recommendation (FAIL/RETEST/PASS_WAITING_OFFICIAL_APPROVAL)/needsHrReview`; mới `POST /api/vip/test/:id/finalize` (HR confirm, audit `HR_OVERRIDE_SCORE/CONFIRM_TEST_RESULT`); không auto logout | UI cũ đọc field cũ vẫn chạy; finalize là endpoint mới |
| 6.6 | Security inventory | Mới `GET /api/vip/security/inventory` (Admin/HR): 31 public endpoints + phân loại `KEEP_PUBLIC/ADD_EMPLOYEE_AUTH/ADD_SIGNED_WEBHOOK/REVIEW`, không trả secret | Endpoint mới, không đổi auth cũ |

Bug phụ phát hiện khi test (đúng comment code + AGENTS.md zero-leak): timer `bootPullFromMasterSheet` 12s chạy cả trong test/CI → kéo 24 NV thật vào DB test. Đã guard `OUTBOUND_SYNC_DISABLED`; inbound webhook bỏ persist/notify/saveDB khi test (`x-is-test`/isTest/`NODE_ENV=test`).

## 2. Test mới `test/p0_core_fix.test.js` (17 asserts, 16 cases)

Business hours (T2 08:00 pass, 16:30 pass, 17:00/Sunday/quá khứ reject, overlap string + overlap thật 08:15-08:45 reject 409), no auto-PASS, Zalo inbound (POSITIVE/NEGATIVE/UNKNOWN/dedupe), TEST (4.5→FAIL, 6.0→RETEST, 8.5→PASS_WAITING + HR finalize + reject decision lạ), inventory (401 không token, 200 HR, không leak secret).

## 3. Zero-regression & dữ liệu

- `git status`: chỉ `M server.js`, `?? test/p0_core_fix.test.js`, `?? docs/` (6 file PHASE 0 + file này). Không đụng `public/*`, test cũ, Sheet.
- `data/db.json` (gitignored): sau run giữ đúng baseline PHASE 0 — employees 28, keys 38, applicants 2, interviews 0, 0 test records, 0 inbound leak. Backup trước dọn: `data/archive/db_before_phase1_cleanup.json`.
- Ghi chú tồn tại từ trước (ngoài scope, không sửa): suite cũ rò ~1 orphan key `/run` (đã dọn về 38) và `zaloRecords/notifications` tăng dần theo run (giờ 300/500); khuyến nghị bổ sung cleanup `after()` cho suite cũ ở phase sau.

## 4. Exit PHASE 1

- [x] 6 nhóm P0 xong, regression 69/69 + force-logout 5/5 PASS
- [x] Không sửa test cũ để PASS, không phá luồng Admin/Employee/Finance
- Sẵn sàng PHASE 2 (VIP Foundation: FastAPI + Postgres + Redis + Node/Socket adapter).
