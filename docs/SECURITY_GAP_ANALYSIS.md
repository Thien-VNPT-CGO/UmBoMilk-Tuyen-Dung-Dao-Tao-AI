# SECURITY GAP ANALYSIS — PHASE 0 (inventory, chưa sửa)

> Đo thực: `authMiddleware` (JWT) + `roleCheck([...])` + `branchScopeFilter` (`server.js:1220-1245`); `financeAuthMiddleware` riêng; `express-rate-limit` (`authLimiter`) cho login; `helmet`, `express-validator`, `sanitizeString`; settings mask `privateKey •`; audit full.

## 1. Public inventory (27 routes không `authMiddleware` — cần phân loại PHASE 1 §6.6)

| Nhóm | Routes | Đánh giá sơ bộ |
|---|---|---|
| Static/health | `GET /, /admin, /employee, /finance, /health` | Giữ public (UI + health check Render/CI) |
| Auth | `POST /api/auth/login|employee-login|finance-login|device-request` | Giữ public + rate-limit (đã có `authLimiter`), không dùng `hr/hr123` production (thêm `VIP_SERVICE_CLIENT_ID/SECRET` + `vipServiceAuthMiddleware` + `X-VIP-Service/Actor/Correlation-Id`, PHASE 2) |
| Recruitment inbound | `POST /api/applicants` (Form tạo applicants), `POST /api/recruitment/form-submit` (Google Form/Sheet webhook) | Giữ public nhưng cần signed webhook secret + chống trùng SĐT 409 (đã có) + rate-limit + không leak Sheet ID |
| Employee self-service | `POST /api/attendance/checkin|checkout`, `POST /api/employee/register-off`, `POST /api/off-requests`, `POST /api/emergency-requests(+respond)`, `POST /api/shift-swap(+respond)`, `POST /api/training/shift-change`, `POST /api/courses/:id/submit`, `POST /api/quiz/open`, `GET /api/quiz/status`, `GET /api/attendance/official-monthly`, `GET /api/employee/me`, `GET /api/interviews`, `GET /api/notifications`, `GET /api/off-window`, `GET /api/courses` | **Nhóm cần review kỹ nhất**: hiện tin employeeId/key/deviceId trong body thay vì auth header; cần thêm employee auth/token hoặc signed action token mà không phá Employee Portal; `GET /api/interviews|notifications` lộ danh sách nếu không filter theo employee |
| Finance login | `POST /api/auth/finance-login` public | Giữ + rate-limit, finance APIs còn lại đã `financeAuthMiddleware` |

Không phát hiện `vipServiceAuth` (0 refs) — VIP service auth chưa có, đúng kỳ vọng PHASE 0.

## 2. RBAC / Branch scope (hiện tại tốt, VIP kế thừa)

- `roleCheck(['Admin','HR','Manager',...])` bao phủ hầu hết routes nhạy cảm; `branchScopeFilter`: Admin/HR/Umbomilk xem full, Manager lọc `branchScope`, employee filter theo `employeeId`.
- Test `branchScope realtime filter` PASS (manager chỉ CN2).
- VIP roles (`SUPER_ADMIN/ADMIN/HR/BRANCH_MANAGER/VIEWER`) phải kế thừa + enforce backend; AI Command không vượt branch scope; high-risk cần HR approval queue.

## 3. Secret & log hygiene

- `GET /api/settings/masked` mask privateKey (`•`), test `settings masked - no leak` PASS.
- `.env` tồn tại local (không commit secret — cần verify `.gitignore` đã gồm `.env`/backup DB trước production).
- Nếu ZIP/source từng chia sẻ + `.env` chứa secret thật => rotate trước production (Master §45).
- VIP: structured JSON logs `{request_id, correlation_id, job_id, actor, entity_id}`, cấm log password/JWT/token/private key/activation secret; metrics `jobs_success/failed, zalo_fail, sheet_conflict, interview_conflict, ai_review_required, socket_reconnect`.

## 4. Rate limit / validation / device / license

- `authLimiter` cho login; cần mở rộng `rate limit activation/login` cho VIP License + Zalo + bulk.
- `sanitizeString`, `express-validator` đã dùng rải rác; cần input validation đầy đủ cho VIP bulk/AI command.
- Device Binding 1-1 + EXPIRED + `needDeviceReset` hiện tốt; **cấm reuse `/api/keys` làm VIP License** — VIP dùng namespace `VIP_LICENSE_PLAN/KEY/DEVICE/SESSION` riêng (7 plans, 826 keys, expiry từ first activation, server time, TEST unlimited + global 10m, 2H max 2, còn lại 1 device, reset device không reset expiry).
- Khuyến nghị 2FA cho License Super Admin; HttpOnly/secure token, CSRF nếu cookie, JWT expiry, service secret rotation.

## 5. Kế hoạch PHASE 1 (§6.6, không làm trong PHASE 0)

1. Lập danh sách endpoint công khai (bảng §1).
2. Quyết định endpoint nào thực sự public (static/health/auth/webhook đúng secret).
3. Thêm employee auth/signed token cho self-service, giữ Employee Portal chạy.
4. Full regression (`test:ci` + force-logout).
