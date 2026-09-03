# Kế hoạch 10 yêu cầu – Ụm Bò Milk 2026 (Realtime Ràng buộc)

**Ngày:** 03/09/2026  
**Sheet chính:** https://docs.google.com/spreadsheets/d/17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w  
**Drive:** https://drive.google.com/drive/folders/1-Wy-Di6KvfeGCKoTV7TSuFQpY_yKNy-1

---

## 1. Google Sheet 17iXM – 1 chiều + Admin đồng bộ lại theo mã NV
**Hiện trạng:** `cascadeDeletePerson()` (server.js:2011) gọi `deleteOutboundFromMasterDatabaseSheet()` xóa cả 2 sheet (17iXM + 1rcq) → vi phạm yêu cầu “không xóa Sheet”.
**Mục tiêu:** 
- HR xóa trên Web App (soft ARCHIVED / hard cascade) → **không** xóa row trên 17iXM (vẫn lưu cá nhân). Chỉ xóa local `db.json`.
- Thêm nút **Admin → Đồng bộ từ Google Sheet** (chỉ Admin thấy) → fetch Sheet 17iXM qua ServiceAccount / webhook `GET` → tìm `employeeId` → upsert lại `db.employees` + `db.keys` theo đúng mã NV bị xóa trước đó.
- Khi đồng bộ lại, **không** push ngược lên Sheet (vì đã tồn tại) → `syncQueue` skip `EMPLOYEE` nếu `source=SYNC_FROM_SHEET`.

**Thay đổi:**
- `server.js:2112` tách `deleteOutboundFromMasterDatabaseSheet` → thêm param `deleteFromMaster=false` mặc định, chỉ xóa `1rcq` (Form) nếu cần, giữ `17iXM`.
- `server.js:2011` `cascadeDeletePerson` → truyền `deleteFromMaster=false`.
- `server.js` thêm `POST /api/admin/sync-from-sheet {employeeId}` (Admin only) → đọc Sheet 17iXM `values` → tìm row có `Mã NV == employeeId` → parse `server.js:99 SHEET_DEFINITIONS` headers → tạo lại `employee` + `key` (giữ Key cũ nếu có trên Sheet, nếu Sheet chưa có cột Key thì giữ key hiện tại hoặc sinh mới) → `db.employees.push` → `io.emit employees:update` + `keys:update` → **không** `addSyncQueue` để tránh loop.
- `server.js:99` thêm cột `Key` vào `SHEET_DEFINITIONS.NHAN_VIEN_TRAINING` + `NHAN_VIEN_CHINH_THUC` (vị trí cuối trước `Sync`).
- `public/admin.html` thêm nút `Đồng bộ từ Sheet (Admin)` cạnh `Retry/Clear` trong `dashSync` → modal nhập `Mã NV`.
- `public/js/admin.js` thêm `async syncFromSheet()` gọi API trên, toast hiệu ứng.

**Verify:** Tạo NV → hard delete → check Sheet 17iXM row vẫn còn (manual check) → Admin sync lại → NV xuất hiện lại trong Web App với đúng mã NV.

---

## 2. Địa chỉ Cty dưới chữ ỤM BÒ MILK • HR ADMIN
**Hiện trạng:** `admin.html:72` chỉ hiện `ỤM BÒ MILK • HR ADMIN` + `Realtime • CN2 - ...` không có địa chỉ full.
**Mục tiêu:** Cập nhật `address` mặc định CN2 thành `Số 10 Đặng Thai Mai, Phường Phú Nhuận, TP. Hồ Chí Minh` và hiển thị dưới dòng HR ADMIN.
**Thay đổi:**
- `server.js:54` `DEFAULT_BRANCHES[CN2].address = 'Số 10 Đặng Thai Mai, Phường Phú Nhuận, TP. Hồ Chí Minh'` (đã có trong db.json hiện tại nhưng code vẫn là `261 Tô Hiến Thành` → đồng bộ).
- `public/admin.html:72-74` thêm dòng `<div class="text-[10px] text-pink-500">Số 10 Đặng Thai Mai, Phường Phú Nhuận, TP. Hồ Chí Minh</div>` dưới HR ADMIN.
- `public/js/admin.js:99` fallback `getBranchFull` cập nhật.

---

## 3. Training – Nút Import cập nhật dữ liệu training hiện tại
**Hiện trạng:** Chỉ có `Import Official` (tab OFFICIAL). Tab TRAINING không có import.
**Mục tiêu:** Thêm `Import Training` tương tự, cho phép cập nhật NV training hiện tại (upsert theo SĐT / Mã NV).
**Thay đổi:**
- `public/admin.html:341` duplicate `importTrainingControls` (ẩn mặc định, chỉ hiện khi `switchEmpStoreTab('TRAINING')`).
- `public/js/admin.js:2171` `switchEmpStoreTab` → toggle cả 2 controls.
- `public/js/admin.js` thêm `handleTrainingImport()` reuse `parseCSVText` → `POST /api/employees/import-training` (mới) với `category=STORE, type=TRAINING, status=TRAINING`.
- `server.js:815` thêm `POST /api/employees/import-training` (logic giống `import-official` nhưng `type=TRAINING`, cho phép update nếu `phone` hoặc `employeeId` đã tồn tại → update thay vì skip).

---

## 4. Lịch làm việc Training + Official – AI đơn giản dễ hiểu
**Hiện trạng:** `public/js/admin.js:3419 renderSchedules` phức tạp, `employee.js:924 loadSchedule` riêng biệt, thiếu AI giải thích.
**Mục tiêu:** Đồng nhất UI lịch tuần giữa HR và nhân viên, thêm giải thích AI ngắn gọn (vd: “AI xếp T2→CN: 5 ngày OFF đã chọn → 7 ngày WORKING”).
**Thay đổi:**
- Tách `server.js` logic `buildFull7DaysForWeek` thành helper chung dùng cho cả Training (12 ngày) và Official (tuần T2→CN).
- `public/admin.html:451 #scheduleGrid` + `public/employee.html:494 #scheduleList` dùng chung template card (branch, shift, status badge, tooltip AI).
- Thêm badge `AI Auto` + tooltip khi hover.

---

## 5. Web App Training – 5 nhóm con
**5a. OFF 5 ngày reload mất:** `employee.js:605 renderTrainingOffPicker` bug do `localStorage` + `reload` + không persist `checked`. Sửa: lưu `checked` vào `localStorage.trainingOffDraft` mỗi `onchange`, debounce 300ms, khi reload restore, `submit` mới clear. Thêm realtime `socket.on('employees:update')` cập nhật `registeredOffDates` và hiển thị danh sách badge OFF (đã có nhưng chỉ khi `===5`).
**5b. Lịch UI:** Dùng chung template HR, responsive `grid-cols-7` → `grid-cols-2 sm:grid-cols-4 md:grid-cols-7` cho mobile, thêm nút `Đổi ca` / `Thêm ca` (2 ca/ngày) → `POST /api/training-shift-request` (đã có `server.js:2770`) nhưng thêm UI cho Training (hiện chỉ có request riêng). Khi đăng ký → `status PENDING` → HR duyệt 15p auto → `io.emit schedules:update` + `notifications:update`.
**5c. Thông báo:** `employee.html:29 NAV notifs` → ẩn khỏi `getVisibleNav()` cho cả Training, chỉ giữ bell `employee.html:269 #notifCount`.
**5d. Camera sau + GPS thật:** `employee.js:754 startCamera` đổi `facingMode:'user'` → `'environment'` (sau), thêm `getGPS` bắt buộc: nếu `err.code==1` (PERMISSION_DENIED) hoặc `position.coords.accuracy > 100` → toast lỗi `Yêu cầu bật GPS` và block `submitCheckin`. Mock fallback `10.762622...` → xóa, chỉ dùng GPS thật.

---

## 6. Web App Official – 4 nhóm con
**6a. Camera/GPS:** giống 5d.
**6b. Lịch:** giống 5b nhưng không có thêm ca (chỉ đổi ca qua `emergency`).
**6c. Ẩn thông báo:** như 5c.
**6d. Bảng lương:** `employee.js:1432 loadSalaryTab` redesign `CHI TIẾT BẢNG CÔNG` → card responsive `grid-cols-1 lg:grid-cols-2`, font lớn, badge màu.
**6e. OFF hàng tuần:** `employee.js:1008 loadOff` đã có `isOffWindowOpen()` nhưng `TRAINING_HIDDEN_TABS` ẩn với training → với official cần `style.display` dựa trên `isOffWindowOpen()` realtime (setInterval 60s) → ẩn nút khi `day !=5/6` hoặc `hour` ngoài 12:00-15:00.
**6f. OFF đột xuất:** `public/js/employee.js:1040` + `employee.html` tab `emergency` → chỉ hiện khi `mySchedules.some(s=>s.weekStart==nextWeekStr)` (đã có) nhưng cần thêm check `offAiStatus` đã duyệt xong → `localStorage.nextWeekReady`.

---

## 7. HR Responsive mobile/ipad + fix lỗi chữ
**Hiện trạng:** `admin.html:35 @media (max-width:768px)` đã có nhưng nhiều bảng `overflow-auto` chữ tràn, `nav` dài.
**Thay đổi:**
- `admin.html:35` tăng `header` blur, `kpiGrid` 2 cột, `scheduleGrid` responsive, `table` horizontal scroll với `min-w-[600px]`.
- Fix `text-[11px]` → `text-xs sm:text-sm`, `whitespace-nowrap` cho `Mã NV`.
- Test trên iPad (768-1024) với `lg:grid-cols-3`.

---

## 8. Google Drive – thực lưu ảnh/txt
**Hiện trạng:** `server.js:2925 addDriveFile` tạo `driveFiles[]` nhưng `meta.content` thiếu → upload chỉ tạo folder, không upload file. `server.js:3382` gọi `addDriveFile(..., 'Anh_chup_cua_hang.jpg', {gps})` không truyền base64.
**Mục tiêu:** Khi attendance `checkin` với `image` base64 → tạo 2 file: `Anh_chup_...jpg` (binary) + `Thong_tin.txt` (gps, time, address) upload thật qua `upload/drive/v3/files?uploadType=multipart`.
**Thay đổi:**
- `server.js:3382` truyền `meta.content = imageBase64` (strip `data:image/jpeg;base64,`) + `mimeType='image/jpeg'`.
- `server.js:2925` sửa `ensureDriveFolderCake` trả về `folderId`, sau đó `uploadFile` với `multipart` gồm `metadata` + `media` base64 → `driveFiles[].url` cập nhật `https://drive.google.com/file/d/${fileId}/view`.
- Thêm fallback local nếu `privateKey` trống → lưu base64 vào `db.json` với `sync_status='LOCAL'` (đã có prune logic `server.js:285`).

---

## 9. Cột Key trên Google Sheet 17iXM
**Hiện trạng:** `SHEET_DEFINITIONS` không có cột Key, `syncToGoogleSheet` không map `KEY`.
**Thay đổi:**
- `server.js:103` `NHAN_VIEN_TRAINING` headers thêm `'Key'` trước `Version` (17→18 cột).
- `server.js:104` `NHAN_VIEN_CHINH_THUC` headers thêm `'Key'` (14→15 cột).
- `server.js:497` `sheetMap` thêm `KEY:'TAI_KHOAN'` hoặc `NHAN_VIEN_TRAINING` tùy loại → nhưng yêu cầu 17iXM là Master DB → thêm `KEY` vào `NHAN_VIEN_TRAINING/CHINH_THUC`.
- `server.js:805` khi tạoNV → `addSyncQueue('EMPLOYEE','CREATE', {..., key: key.key})` → `syncToGoogleSheet` sẽ ghi Key vào Sheet.
- `server.js:3050` `syncSheetTab` cho `NHAN_VIEN_TRAINING/CHINH_THUC` thêm `keyRec?.key || ''`.
- `scripts/google-apps-script.gs:109` `getHeadersForSheet` cập nhật headers mới.

---

## 10. Hiệu ứng thông báo HR thao tác
**Hiện trạng:** Một số `admin.js` có `showToast` nhưng không đồng nhất.
**Mục tiêu:** Mỗi click HR (duyệt, xóa, import, chuyển trạng thái, tạo lịch) đều có `showToast` + `socket` realtime + animation.
**Thay đổi:**
- `public/js/admin.js` thêm helper `hrToast(action, success)` với icon + sound (optional) + `confetti` nhẹ.
- Bọc tất cả `api()` calls trong `try/catch` với `showToast` success/error.
- Thêm `server.js` audit `io.emit('hr:action', {actor, action, timestamp})` → `admin.js` `socket.on('hr:action')` hiển thị banner.

---

## Thứ tự triển khai (đề xuất 3 đợt)
**Đợt 1 (ngay):** 1,2,9 (Sheet 1 chiều + Key + địa chỉ) → dễ, không đụng UI nhiều.
**Đợt 2:** 3,8,10 (Import training + Drive thực + Toast) → backend.
**Đợt 3:** 5,6,4,7 (Employee Training/Official + Lịch + Responsive HR) → UI lớn, cần test kỹ mobile.

**Verify mỗi đợt:** `npm test` + manual `verify_force_logout.js` + check Sheet 17iXM row còn + Drive folder có file.

