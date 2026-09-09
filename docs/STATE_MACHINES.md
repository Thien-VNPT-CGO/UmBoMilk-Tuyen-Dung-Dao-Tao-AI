# STATE MACHINES — Hiện tại vs VIP đề xuất (PHASE 0, chỉ map không sửa)

## 1. Candidate (hiện tại: Applicants)

Hiện tại (`db.applicants.status`): `NEW -> SCORED -> INTERVIEW (schedule) -> PASS/FAIL/REJECTED -> convert -> Training`.
Poller tự `INTERVIEW -> PASS` khi Meet end (`passSource=AUTO_MEET_END`, `server.js:2622-2662`) — **P0 phải bỏ** (Master §6.1).

VIP đề xuất (Master §8.1):
```
NEW -> AI_SCREENED -> READY_INTERVIEW -> INTERVIEW_SCHEDULED_PENDING_CONFIRM
-> CONFIRMED -> INTERVIEWING -> PROCESSING_INTERVIEW -> WAITING_HR_REVIEW
-> {PASS->READY_TRAINING | FAIL | NO_SHOW | RESCHEDULE}
```
Lưu `workflow_states` Postgres, không suy từ UI. Giữ compat event `interview:auto_pass` nhưng không dùng để PASS.

## 2. Training (12 ngày = 7 work + 5 off)

Hiện tại: `convert` tạo Training 12 ngày (`startDate/endDate`), `register-off` 5 OFF, `trainingShiftRequests` đổi/thêm ca (2-3 ca/ngày), lịch 12 ngày (7 TRAINING + 5 OFF), `WAITING_TEST` sau đủ 7.
Không giả 7 ngày liên tục; nguồn `NHAN_VIEN_TRAINING + PHIEU_OFF_HANG_TUAN(TRAINING_OFF) + RECORD_DIEM_DANH`.

VIP (§8.2):
```
TRAINING_CREATED -> TRAINING_ACTIVE -> 1/7...7/7 -> TRAINING_COMPLETED
-> WAITING_TEST -> TEST_SCHEDULED -> TEST_CONFIRMED -> TEST_PROCESSING
-> WAITING_HR_REVIEW -> {FAIL | RETEST | PASS_WAITING_OFFICIAL}
```
Đủ 7 valid => `TRAINING_COMPLETED`, notify HR+employee, `next_best_action=CREATE_TEST_SCHEDULE`.

## 3. Test đầu ra (hiện tại vs VIP)

Hiện tại (`server.js:4991-5039`): `part1Scores+part2Scores` max 20, `isPassed = p1>6 && p2>6`, `testScore = total/20*100`, status `PASSED_TEST/FAILED_TEST`. Chưa có thang Master, chưa phân AI-propose vs HR-final, chưa lưu `evidence_timestamp/hr_score/final_score` đầy đủ.

VIP (§19): mỗi câu `1/0.5/0`, 2 nhóm (Kiến thức & Ứng xử 10 câu + Vận hành 10 câu), lưu `{question, expected_answer, employee_answer, ai_score, ai_reason, ai_confidence, evidence_timestamp, hr_score, final_score}`, final thang 10: `<5 FAIL | 5-<8 RETEST | >=8 PASS_WAITING_OFFICIAL_APPROVAL`. Flow `AI EVALUATION -> HR REVIEW -> FINAL RESULT`. Không auto logout trước HR confirm; FAIL mới schedule logout/revoke.

## 4. Official + OFF 2 ngày/tuần + Weekly schedule

Hiện tại: `transition-official` -> OFFICIAL; OFF Official `POST /api/off-requests` max 2/tuần, window T6 12:00-T7 15:00 (`isOffWindowOpen`, `vipTestMode` bypass), FCFS cùng `branch+shift+date` 1 slot, khác shift/branch được trùng; `lockedWeeks` khóa sau duyệt; `approve-test-week` + `generate-next-week-draft` + `autoCoordinate`.
VIP (§8.3, §20-21):
```
WAITING_OFFICIAL_APPROVAL -(HR confirm)-> OFFICIAL -> WEEKLY_OFF_REGISTRATION
-> SCHEDULE_GENERATED -> ATTENDANCE_ACTIVE
```
Scheduler dùng OR-Tools CP-SAT (không dùng LLM giải constraint), hard (approved OFF, branch, shift, staffing, no duplicate/day, shift change) + soft (fairness, fixed-shift...), flow `Generate Draft->Validate->Preview->HR Approve->Write Node->Socket->Sheet`.

## 5. Attendance realtime

Hiện tại: `checkin/out` PUBLIC (ảnh+GPS) -> `db.attendances` + `violations` + Zalo CHECKIN + `attendances:update`.
VIP (§18): raw `RECORD_DIEM_DANH` (không lấy BAO_CAO_CHAM_CONG), states `NOT_STARTED/CHECKED_IN/COMPLETED/LATE/MISSING_CHECKOUT/ABSENT/OFF/VIOLATION`, aggregate sau.

## 6. Next Best Action (chưa có — PHASE 3)

Cần thêm `next_best_action/reason/priority` per candidate/employee: mới->TẠO LỊCH PV; có lịch chưa confirm->NHẮC XÁC NHẬN; 7/7->TẠO LỊCH TEST; TEST 8.6->DUYỆT OFFICIAL.
