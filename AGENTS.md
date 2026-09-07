# QUY TẮC & RÀNG BUỘC PHÁT TRIỂN HỆ THỐNG ỤM BÒ MILK

## 1. NGUYÊN TẮC CỐT LÕI (BẮT BUỘC TUÂN THỦ)

### A. Làm đúng và đủ theo yêu cầu của Người Dùng (Strict Scope Adherence)
- Chỉ thực hiện chính xác những gì người dùng yêu cầu trong từng lượt yêu cầu.
- Tuyệt đối KHÔNG tự ý mở rộng phạm vi, KHÔNG tự ý sửa đổi hoặc xóa bỏ các luồng nghiệp vụ khác.
- KHÔNG tự tiện tái cấu trúc (refactor) hoặc thay đổi kiến trúc các phần không liên quan nếu không có chỉ định từ người dùng.

### B. Giữ nguyên 100% các chức năng hiện có (Preserve Existing Functionality)
- Tất cả các module, giao diện, API, tiện ích trên Web App phải được giữ nguyên vẹn:
  1. **Web App Quản trị (Admin / HR)**: Quản lý ứng viên, nhân viên (Mới, Training, Chính thức), E-learning, Trung tâm duyệt yêu cầu (HR Approval Center), phân quyền chi nhánh, cài đặt hệ thống.
  2. **Web App Nhân viên (Employee)**: Điểm danh Check-in/Check-out, đăng ký OFF, đổi ca làm việc, học tập, nộp bài thi, thông báo, báo hỏng thiết bị, mã khóa ca khẩn cấp.
  3. **Cổng Tài chính (Finance)**: Báo cáo ma trận công 1-31 ngày, hoàn cọc đồng phục, hoàn tiền khám sức khỏe, bảng tính lương đối soát tổng hợp.
  4. **Cơ chế Realtime & Google Sheet Sync**: Đồng bộ Google Sheet 17iXM đa tầng, chống trùng SĐT, bảo vệ dữ liệu không bị ghi đè, WebSocket thông báo realtime giữa nhân viên và Admin/HR.
  5. **Bảo mật & Session**: Token JWT, forceLogout tức thì khi HR xóa hoặc chuyển trạng thái nhân viên, Device Binding.

### C. Ràng buộc kiểm thử không hồi quy (Zero Regression)
- Trước và sau bất kỳ thay đổi nào, phải bảo đảm toàn bộ các bài kiểm thử hiện có (`npm test`, `verify_force_logout.js`) đều tiếp tục PASS 100%.
- Không làm rò rỉ dữ liệu test vào cơ sở dữ liệu thật (`data/db.json`) hoặc Google Sheet.
