# SECURITY MODEL — VIP (Master §36, §37, §38, §45)

- **User auth**: VIP JWT riêng (`HS256`, `iss=umb-vip`, expiry 12h), cookie
  HttpOnly (`umb_vip_token`) hoặc `Authorization: Bearer`. Login proxy Node
  Core để tái dùng users/RBAC/branchScope; không lưu password Node.
- **Service auth**: `X-VIP-Client`/`X-VIP-Secret` (timing-safe compare) cho
  server-to-server; thiếu `VIP_SERVICE_SECRET` → từ chối. Service secret không
  bao giờ xuất hiện ở HTML/JS (có test).
- **RBAC**: `SUPER_ADMIN > ADMIN > HR > BRANCH_MANAGER > VIEWER`;
  `Manager→BRANCH_MANAGER` lọc theo scope; AI Command/bulk không vượt scope;
  high-risk cần HR approval; License Admin cần ADMIN.
- **Audit**: mọi action quan trọng ghi actor/action/entity/before/after/
  timestamp/ip/correlation_id/source; không xóa audit từ UI (PHASE 3+).
- **Hygiene**: không hard-code secret; log JSON có mask; rate-limit/auth-limit
  ở reverse proxy + FastAPI (PHASE 12 hardening); 2FA cho License Super Admin
  (PHASE 10); `.env` không commit (xem `.env.example`, `.gitignore`).
