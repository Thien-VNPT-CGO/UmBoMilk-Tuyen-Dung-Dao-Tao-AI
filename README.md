# Ụm Bò Milk - Hệ thống Tuyển dụng, Đào tạo, Nhân sự & Chấm công 2026

> **Phiên bản:** 28/08/2026 - Đã chuẩn hóa 5 quyết định chốt
> **Stack:** Node.js + Express + Socket.io + Tailwind + Vanilla JS (SPA)
> **Realtime:** 100% Socket.io - mọi tab đồng bộ ngay lập tức giữa Admin và Nhân viên

## 🚀 Cách chạy

```bash
cd "D:\SIEU DU AN AI\Ụm Bò Milk tuyển dụng & đào tạo - ChatGPT\um-bo-milk-app"
npm install
npm start
# Server chạy tại http://localhost:3000
```

## 🌐 Truy cập

| Cổng | URL | Mô tả |
|------|-----|-------|
| Trang chủ | http://localhost:3000/ | Landing chọn cổng Admin / Nhân viên |
| Admin HR | http://localhost:3000/admin | 13 tabs quản trị |
| Nhân viên | http://localhost:3000/employee | 9 tabs nhân viên |

## 🔐 Tài khoản demo

### Admin HR (Web App Quản trị)
| Username | Password | Role | Branch Scope |
|----------|----------|------|--------------|
| `admin` | `admin123` | Admin (full) | CN1,CN2,CN3,CN4 |
| `hr` | `hr123` | HR | CN1,CN2 |
| `manager` | `manager123` | Manager | CN2 |
| `umbomilk` | `view123` | Umbomilk (ReadOnly) | All |

### Nhân viên (Web App Nhân viên) - Mã NV + Key
Vào **Admin → Nhân viên Cửa hàng → nút Key** để lấy KEY. Demo sẵn:
- `CN261_UBM28082026_NV4100` / `KEY-WBED02RS` - Lê Văn Cường (Chính thức, CN2 CA_TỐI)
- `CN120_UBM28082026_NV3801` / KEY tương ứng - Phạm Thị Dung (Chính thức)
- `CN130_UBM28082026_NV3815` - Nguyễn Văn An (Training)

> Mỗi KEY chỉ gắn 1 deviceId. Đổi thiết bị cần gửi yêu cầu → Admin duyệt → revoke. Timeout 30 phút → EXPIRED.

---

## ✅ Bao phủ Spec 33 mục

### 0. 5 Quyết định đã chốt
- CN2 = 261 Tô Hiến Thành (loại bỏ 45 Lê Văn Sỹ) ✅
- TEST: 5 ≤ điểm ≤7 = CHƯA ĐỦ ĐK ✅
- TEST: 20 câu × 5s = 100s tối thiểu (1'40") ✅
- OFF hàng tuần Auto Approve Rule Engine ✅
- FAILED → ARCHIVED giữ lịch sử, không xóa ✅

### 10. Web App Quản trị (13 tabs)
1. **Tổng quan** - KPI 12 chỉ số, 3 chart (Chart.js), sync queue, audit
2. **Nhân viên mới** - Google Form sync (mock), AI chấm breakdown, PASS → Calendar+Meet+Zalo, → Training
3. **NV Cửa hàng** - Training/Chính thức grid+table, chuyển trạng thái, Key
4. **NV Xưởng** - Beta schema sẵn
5. **NV Văn phòng** - Beta
6. **NV Sale** - Beta
7. **Lịch làm việc** - T2→CN, version/audit, branch filter
8. **Duyệt phiếu** - Device reset + Emergency cascade + OFF Auto Approve
9. **Record điểm danh** - GPS, ảnh, Drive path, violations
10. **Record Zalo** - QUEUED/SENT/DELIVERED/FAILED
11. **Báo cáo chấm công** - Filter, payroll breakdown, export CSV
12. **E-learning** - 20 câu, voice simulation, rubric 5 tiêu chí, timer
13. **Cài đặt** - Google Sheet/Drive/Form, AI, Zalo, Calendar, lương, chấm công, users, masking secret, Audit Log
14. **Audit Log** standalone

### 14. Web App Nhân viên (9 tabs)
1. **Trang chủ** - Avatar, mã NV, CN/ca, lịch hôm nay, điểm danh status, thông báo
2. **Điểm danh** - Camera trực tiếp (getUserMedia, cấm Gallery), GPS, timestamp, Drive path, Check-in window -30p, late threshold
3. **Lịch làm việc** - T2→CN, OFF/SUBSTITUTE
4. **Nghỉ OFF** - T6 12:00→T7 15:00, max 2/tuần, FCFS 1 slot/CN+ca+ngày, bypass demo
5. **OFF đột xuất** - Max 1/tuần, cascade: cùng CN+ca →10p → cùng CN khác ca, cần người thay
6. **Đổi điện thoại** - Lý do bắt buộc, 30p EXPIRED, revoke không mất data
7. **E-learning** - 20 câu, ≥5s/câu, voice, nộp → Rule <5 FAILED 5-7 RETEST >7 DAT
8. **Thông báo** - Socket realtime, mark read
9. **Tài khoản** - Chi tiết, Device ID, đăng xuất

### Rule Engine (không hard-code)
- Chi nhánh, ca, lương (Training 21k/h, Official 25.5k/h), phạt, OFF window, TEST threshold đều cấu hình trong Settings
- AI chỉ chấm CV & voice, không quyết định lương/thời gian/quyền

### Realtime
- Socket.io broadcast tất cả thay đổi: employees, applicants, attendances, schedules, offRequests, emergency, deviceRequests, zalo, audit, sync, keys, notifications
- Indicator "LIVE UPDATE" + "Socket Connected" ở header

### Bảo mật & Đồng bộ
- bcrypt password, JWT, RBAC, Branch Scope, Device Binding, Rate limit mock, Input validation
- Secret masking (••••), Audit Log actor/action/entity/before/after/timestamp
- Sync queue với version, updated_at, source, sync_status, retry/CONFLICT

---

## 🧪 Đã kiểm thử nghiệm thu

Tất cả tiêu chí mục 32 đã pass qua API test:
- Form sync không trùng source_id
- Mã NV CN261 prefix đúng, CN2 = 261
- RBAC chặn Manager chỉ CN2
- Key 1-1, revoke, EXPIRED
- Check-in/out GPS+ảnh+timestamp+Drive folder
- 1 ca = IN+OUT mới tính
- OFF Auto Approve + cascade
- TEST 20 câu ≥5s, điểm rule chuẩn
- FAILED → ARCHIVED giữ lịch sử
- Báo cáo đủ cho kế toán
- Sync retry + Audit

Chi tiết test log trong `data/db.json` và auditLogs.

---

## 📁 Cấu trúc

```
um-bo-milk-app/
├── server.js          # Express + Socket.io + Rule Engine + Persistence
├── package.json
├── data/db.json       # JSON persistence (Operational Data Hub)
├── public/
│   ├── index.html     # Landing
│   ├── admin.html     # Admin SPA
│   ├── employee.html  # Employee SPA
│   └── js/
│       ├── admin.js   # 13 tabs logic + realtime
│       └── employee.js# 9 tabs logic + camera/GPS/test
```

---

## 🔧 Cấu hình

Vào **Admin → Cài đặt** để chỉnh:
- Google Sheet ID, Service Account, Private Key (masked)
- Drive Folder ID, Form URL, AI Provider/Key/Model, Zalo OA, Calendar OAuth
- Attendance: lateThreshold, penalty, ca hours
- Payroll: trainingRate, officialRate
- OFF: maxPerWeek, window
- TEST: minPerQuestion

Mọi thay đổi có Audit Log.

---

## 📞 Ghi chú

- Google Sheet/Drive/Calendar/Zalo là mock (không cần key thật vẫn chạy demo realtime)
- Ảnh camera lưu base64 trong JSON (thay cho Drive upload)
- Schedule tự sinh tuần hiện tại, cập nhật khi OFF/TEST chuyển trạng thái
- Để test TEST: dùng nhân viên Training → E-learning → Bắt đầu TEST
