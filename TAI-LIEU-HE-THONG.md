# TÀI LIỆU HỆ THỐNG ỤM BÒ MILK — Tuyển dụng, Đào tạo & Quản trị Nhân sự

> Tổng hợp từ toàn bộ codebase (`server.js`, `public/admin.html` + `public/js/admin.js`,
> `public/employee.html` + `public/js/employee.js`, `public/finance.html` + `public/js/finance.js`,
> `public/css/shared.css`, `public/js/mascot.js`, `public/js/schedule-ocr.js`).
> Múi giờ hệ thống: `Asia/Ho_Chi_Minh`. DB: `data/db.json` (JSON file).

---

## 1. TỔNG QUAN

| Web App | File | Đối tượng | Đăng nhập |
|---|---|---|---|
| **Admin / HR** (`/admin`) | `admin.html` + `js/admin.js` (~6.6k dòng) | Admin, HR, Quản lý | Username + password → JWT 12h |
| **Nhân viên** (`/employee`) | `employee.html` + `js/employee.js` (~3.3k dòng) | NV Training + Chính thức | Mã NV + Key + Device binding (1 key = 1 thiết bị) |
| **Tài chính** (`/finance`) | `finance.html` + `js/finance.js` | Kế toán | Finance Key **hoặc** Email + Cashflow Key (2 luồng riêng) |

Dùng chung: Tailwind CDN, font Be Vietnam Pro, Font Awesome 6.5, Socket.io realtime,
Google Sheet 17iXM (DB), Sheet 1rcq (Form), Sheet quiz 1h06, Sheet tài chính 13Y4.
Design tokens dùng chung: `public/css/shared.css`.

---

## 2. PHÂN QUYỀN (RBAC)

### 2.1 Role mặc định → Tab (`admin.js:218-224`)

| Role | Tab được thấy |
|---|---|
| **Admin** | Tất cả 18 tab |
| **HR** | Tổng quan, Nhân viên mới, Lịch PV, NV Cửa hàng, Lịch làm việc, Đổi ca, Duyệt phiếu, Bản ghi điểm danh, Đào tạo (9 tab — không có Tài chính/Cashflow/Cài đặt/Audit) |
| **Manager** | Tổng quan, NV Cửa hàng, Lịch, Đổi ca, Duyệt phiếu, Điểm danh (6 tab) |
| **Umbomilk** | Tổng quan, Nhân viên mới, NV Cửa hàng, Điểm danh (4 tab) |

### 2.2 Cơ chế ghi đè
- Mỗi user có mảng `allowedTabs` riêng; nếu có thì **dùng nguyên văn**, bỏ qua mặc định role
  (`getUserAllowedTabIds`, `admin.js:226-238`).
- Admin sửa tick từng tab trong Cài đặt → Người dùng (`PUT /api/users/:id`), sidebar render
  lại realtime (`toggleUserTab`, `admin.js:5835`).
- `switchTab` chặn tab không phép (trừ Admin), toast + chuyển về tab đầu được phép.
- Cổng Finance/Cashflow dùng JWT **riêng biệt** (`Finance` / `Cashflow` role), không dùng chung
  phân quyền tab Admin.

### 2.3 Phân cấp duyệt chi tiền (Cashflow)
| Cấp | Email | Hạn mức |
|---|---|---|
| L1 (nhỏ) | `thehung.170291@gmail.com` | < 2 triệu |
| L2 (vừa) | `thaovo2604@gmail.com` | 2 – <10 triệu |
| L3 (Admin Tổng) | `umbomilk@gmail.com` | Mọi khoản (full quyền) |
- Key theo email, hạn 24h / 7 ngày / 30 ngày / 6 tháng / 1 năm; hết hạn tự logout, key cũ vô hiệu.

---

## 3. WEB ADMIN — 18 TAB

| # | Tab | Chức năng chính |
|---|---|---|
| 1 | **Tổng quan** | 17 KPI realtime, 3 biểu đồ, hàng đợi sync, xem trước audit |
| 2 | **Nhân viên mới** | Ứng viên từ Google Form: chấm AI, rubric PV, đặt lịch Meet, chuyển Thử việc |
| 3 | **Lịch phỏng vấn** | Slot Meet 30 phút, đếm ngược, PASS, lịch Google |
| 4 | **NV Cửa hàng** | Trung tâm nhân sự: 2 sub-tab Thử việc/Chính thức, lộ trình 12 ngày, thi 7/7, lên chính thức, key, import CSV |
| 5-7 | **NV Xưởng / Văn phòng / Sale** | Beta (khung sẵn) |
| 8 | **Lịch làm việc** | Lưới T2→CN theo 5 nhóm, màu chấm công realtime, lọc "chỉ NV có ca hôm nay", AI cân lịch, duyệt/khóa/mở khóa tuần, xóa tuần |
| 9 | **Đổi ca** | HR broadcast <24h, duyệt/từ chối/thu hồi, lật OFF↔ca thủ công, backup ảnh OCR, key swap, phiếu OFF↔ca |
| 10 | **Duyệt phiếu** | HR Approval Center: đổi/thêm ca Training, đổi ca chính thức, reset thiết bị, thu hồi OFF |
| 11 | **Bản ghi điểm danh** | Bản ghi GPS + ảnh theo ngày/CN, xuất ZIP, mail tuần |
| 12 | **Lịch sử Zalo** | Log gửi Zalo (QUEUED/SENT/DELIVERED/FAILED) |
| 13 | **Khóa Tài chính** | Cấp key WEEK/MONTH/YEAR mở cổng Finance |
| 14 | **Keys Cashflow** | Cấp key theo email + thời hạn (mục 2.3) |
| 15 | **Trung tâm Google Sheet** | Cấu hình Sheet ID, webhook, service account, ENV Render |
| 16 | **Đào tạo** | Ngân hàng đề từ Sheet, khóa học, kết quả, mở đề 25 câu; quy tắc <5 LOẠI / 5–<8 thi lại / ≥8 ĐẠT |
| 17 | **Cài đặt** | Lương, OFF, thi, ngày lễ, feature flags, người dùng, reset hệ thống |
| 18 | **Nhật ký hệ thống** | Audit log actor/action/entity |

Mobile: bottom nav chỉ 5 tab (Tổng quan, Mới, Cửa hàng, Lịch, Duyệt).

---

## 4. WEB NHÂN VIÊN — TAB & LUỒNG

### 4.1 Tab theo loại NV
- **Training**: Trang chủ, Điểm danh, Lịch, Nghỉ OFF (tối đa 5 ngày), Đào tạo, Tài khoản.
  Ẩn: Đổi ca, OFF CA LÀM. Đủ 7 ngày training thì khóa Điểm danh/Lịch chờ duyệt chính thức.
- **Chính thức** (mở theo cờ Cài đặt): thêm Đổi ca, OFF CA LÀM, Lương AI; tab Nghỉ OFF mặc định tắt.

### 4.2 Điểm danh (camera + GPS)
- Camera tự mở trước ca 30 phút, khóa ngoài giờ + đếm ngược ca tới.
- Chụp cam trước/sau (cam trước preview mirror, ảnh lưu đúng chiều).
- Cổng chất lượng: tick áo đồng phục + bảng tên rõ; GPS thật (accuracy <200m, tọa độ).
- Khung giờ chính thức: mở trước 30p, đóng check-in trước hết ca 1h (tự chuyển checkout);
  phạt trễ 5p −30k / 30p −50% / 60p −100% ca.

### 4.3 Nghỉ OFF
- Chính thức: đăng ký 2 ngày/tuần, cửa sổ **T6 12:00 → T7 15:00**; AI tự xếp lịch sau 15:00 T7
  (cùng CN+cùng ca không trùng ngày, chia 3/4 ca/tuần, ≥12 ngày/tháng); HR duyệt/khóa/phát lịch.
- Training: tối đa 5 ngày OFF trong 12 ngày thử việc.

### 4.4 Tab Quản lý Đổi Ca (1 tab, 3 loại)
- **Ràng buộc 1 phiếu PENDING** toàn cục (chờ đồng nghiệp hoặc chờ duyệt) — có banner khóa tạo mới.
- **Tự đổi OFF↔ca**: 1 ngày + đổi sang Nghỉ/Ca làm (+ chọn ca) → gửi thẳng Admin/HR.
- **Tráo với đồng nghiệp**: ngày/ca (hoặc OFF) của bạn + ngày/ca (hoặc OFF) của B, cùng/khác ngày,
  cùng chi nhánh → B đồng ý → chờ duyệt.
- **Nhờ làm thay**: nhường ca (mặc định ca hiện tại, khóa sửa) → B làm 2 ca/ngày.
- B từ chối → phiếu Hủy (mở gate); người tạo được tự Hủy phiếu chờ; Admin duyệt mới đổi lịch
  (B nhận +30.000đ phụ cấp ca hỗ trợ, cộng lương + đồng bộ Finance).

### 4.5 Thi trắc nghiệm
- HR mở đề 25 câu random từ 40 câu Sheet, hiệu lực 24h, đếm ngược; 8 phút, thang 10:
  **<5 LOẠI** (Training: logout sau 15p; Chính thức: HR đánh giá) • **5–<8 thi lại** (chờ HR mở mới)
  • **≥8 ĐẠT** (pháo hoa; Training → chờ duyệt chính thức).
- NV chính thức tự mở đề bị 403 — chỉ làm bài HR đã mở.

### 4.6 Khác
- Lương AI: 21k (Training) / 25.5k (Chính thức)/giờ theo ca (Sáng 5h, Trưa 6h, Tối 5h),
  nhân lễ/Tết, cộng phụ cấp, trừ giảm trừ.
- Bảo mật: 1 key = 1 thiết bị, đổi máy cần HR duyệt; HR xóa/khóa → forceLogout tức thì
  (HTTP 401 + socket realtime).

---

## 5. CỔNG TÀI CHÍNH

### 5.1 Đăng nhập kép
- **Kế toán chấm công**: Finance Key (`FIN-W/M/Y-XXXX`) → 6 tab công/lương.
- **Kế toán dòng tiền**: Email (3 tài khoản phân cấp) + Cashflow Key → 4 tab cashflow.

### 5.2 6 tab chấm công/lương
1. **Ma trận 1–31**: lưới công tháng, sticky 4 cột, ô xanh lương HV 21k / trắng CT 25.5k / vàng tổng.
2. **Hoàn đồng phục**: chuẩn 300k, đợt hoàn.
3. **Hoàn khám SK**: trần 160k, +6 tháng tự tính, 4 trạng thái.
4. **Lương tổng hợp**: Thực lĩnh = HV + CT + Lễ/Tết (×2, ×3 mùng 3–5) + ĐP + KSK − giảm trừ; KPI + xuất Excel.
5. **Chi tiết ngày** 6. **Sai lệch công**.

### 5.3 4 tab dòng tiền
1. **Gom quỹ 8 TK** (4 cửa hàng + 4 appfood → 1 TK tổng, chỉ L3) + dự báo số dư.
2. **Duyệt chi đa cấp** theo hạn mức (L1→L2→L3), chống duyệt 2 lần, **chống chi trùng** (hash số tiền+người nhận+nội dung+ngày, khóa 48h).
3. **Chi cố định & báo động**: bill định kỳ, nhắc hạn ≤7 ngày, cảnh báo thiếu tiền.
4. **Báo cáo dòng tiền** theo CN/ngày (vào/ra).

---

## 6. LUỒNG NGHIỆP VỤ END-TO-END

1. **Tuyển dụng**: Form Google → ứng viên (AI chấm 14 tiêu chí) → PV Meet → ĐẠT → chuyển Training
   (tạo mã NV + key + lịch 12 ngày: 7 làm + 5 OFF).
2. **Training**: điểm danh 7 ngày → thi 25 câu (≥8) → HR duyệt → Chính thức.
3. **Vận hành tuần**: T6 12:00–T7 15:00 đăng ký OFF → AI xếp lịch → HR kiểm tra/duyệt/khóa →
   mở khóa phát lịch (NV chỉ thấy tuần sau sau khi phát) → chấm công → lương.
4. **Đổi ca**: tạo (gate 1 pending) → B xác nhận → HR duyệt → đổi lịch + TB 2 chiều (+30k nếu hỗ trợ);
   từ chối/hủy/thu hồi đều mở gate và hoàn lịch (snapshot).
5. **Thi định kỳ NV chính thức**: HR mở → 24h → 3 khung điểm (không đổi status, thi lại chờ HR).
6. **Kế toán**: ma trận công → hoàn ĐP/KSK → chốt lương → xuất Excel; dòng tiền gom quỹ →
   duyệt chi phân cấp → báo cáo.
7. **Backup lịch ảnh**: Admin upload ảnh lịch CN → OCR Tesseract tiếng Việt (nhận diện CN111→CN4,
   CN120→CN3, CN130→CN1, CN261→CN2) → đối chiếu tên roster → lưu backup → khôi phục 1-click.

---

## 7. REALTIME & ĐỒNG BỘ SHEET

- **Socket.io**: mọi thay đổi phát `employees/update`, `schedules/update`, `shiftSwap:update`,
  `notifications/update`…; forceLogout tức thì 2 kênh (HTTP 401 + socket).
- **Kéo (Sheet→Web)**: boot + mỗi 60s + nút tay; upsert theo Mã NV, chỉ ghi đè khi Sheet mới hơn;
  **không bao giờ xóa local** (trừ endpoint xóa theo Sheet do Admin gọi); bỏ qua dòng header-rác.
- **Đẩy (Web→Sheet)**: hàng đợi `syncQueue` + merge ghi đè theo ID/SĐT (chống trùng SĐT, dọn test,
  dọn header-rác, báo trạng thái ghi); **không bao giờ xóa dòng Sheet** khi xóa local;
  tắt hoàn toàn ở chế độ test (`DISABLE_OUTBOUND_SYNC`).
- **Chống trùng SĐT toàn cục** (web + Sheet): tạo mới/cập nhật trùng → 409.
- **Đối soát NV** (`POST /api/admin/reconcile-employees`, Admin): pull → push 2 tab NV →
  đọc lại Sheet xác minh → chỉ đánh `SYNCED` khi dòng có thật, còn lại `PENDING` + liệt kê.

## 8. QUY TẮC BẢO VỆ DỮ LIỆU
- Mọi bản ghi test (`isTest`, tên/phone test, header `x-is-test`) bị chặn khỏi Sheet và file DB thật.
- Xóa nhân viên: giữ dòng Sheet (local-only), audit đầy đủ, forceLogout tức thì.
- Khóa version 999 chống auto-pull ghi đè lịch đã duyệt; confirm 2 lớp cho thao tác hủy diệt.
- CI (`node scripts/ci-test.js`, ~190 test) + `verify_force_logout.js` phải PASS 100% trước/sau mọi đổi code.

## 9. BẢN ĐỒ FILE
- `server.js` (~11.6k dòng): toàn bộ API + socket + job nền + sync Sheet.
- `public/js/admin.js` (~6.6k) + `admin.html`: web quản trị 18 tab.
- `public/js/employee.js` (~3.3k) + `employee.html`: web nhân viên.
- `public/js/finance.js` + `finance.html`: cổng tài chính 2 luồng × (6+4) tab.
- `public/js/schedule-ocr.js`: OCR lưới lịch + fuzzy tên (`window.ScheduleOCR`).
- `public/js/mascot.js`: Bò Sữa AI — **chỉ Admin**: cố định góc phải, kéo-thả (tự nhận diện trang),
  nhạc sau 5 phút rảnh, đọc thơ/truyện sữa + hỏi thăm HR, 5 giọng (Nam/Nữ/Adam/Eva/Google),
  đọc nối tiếp từng thông báo, tôn trọng tắt tiếng.
- `public/css/shared.css`: design tokens + shell HRMS + component dùng chung.
- `test/`: ~190 test theo từng module (`npm test` chạy đơn lẻ cần server; `scripts/ci-test.js` chạy chuẩn).
