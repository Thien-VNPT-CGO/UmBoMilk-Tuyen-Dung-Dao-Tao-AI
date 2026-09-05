/**
 * Ụm Bò Milk - Realtime Google Sheet Synchronization Webhook
 * Target Spreadsheet ID: 17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w
 * 
 * HƯỚNG DẪN KÍCH HOẠT ĐỒNG BỘ REALTIME 100%:
 * 1. Truy cập Google Sheet: https://docs.google.com/spreadsheets/d/17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w/edit
 * 2. Mở "Tiện ích mở rộng" (Extensions) -> chọn "Apps Script".
 * 3. Xóa mã mặc định và DÁN TOÀN BỘ MÃ NÀY vào tệp Code.gs.
 * 4. Nhấn "Triển khai" (Deploy) -> "Triển khai dưới dạng ứng dụng web" (New deployment -> Web app).
 * 5. Cấu hình triển khai:
 *    - Mô tả: Um Bo Milk Realtime Sync Webhook
 *    - Thực thi dưới danh nghĩa: Tôi (Execute as: Me)
 *    - Ai có quyền truy cập: Bất kỳ ai (Who has access: Anyone)
 * 6. Nhấn "Triển khai" (Ủy quyền nếu Google yêu cầu).
 * 7. SAO CHÉP Webhook URL (dạng https://script.google.com/macros/s/.../exec).
 * 8. Dán URL này vào Web App Ụm Bò Milk: Admin -> Cài đặt -> Google Sheet Webhook URL -> Nhấn "Lưu cài đặt".
 */

var WEBHOOK_SECRET = "umbomilk_secret_2026";

function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : null;
    if (!contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "No post content" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(contents);
    if (data.secret && data.secret !== WEBHOOK_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized Secret" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var sheetName = data.sheetName;
    var operation = data.operation; // CREATE, UPDATE, DELETE, SYNC
    var payload = data.payload;
    
    if (!sheetName || !payload) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing sheetName or payload" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    syncRow(sheet, operation, payload);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, sheetName: sheetName, syncedAt: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "ONLINE", 
    system: "Ụm Bò Milk Realtime Sync Engine 2026", 
    spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId() 
  })).setMimeType(ContentService.MimeType.JSON);
}

function syncRow(sheet, operation, payload) {
  var headers = getHeadersForSheet(sheet.getName());
  ensureHeaders(sheet, headers);
  
  var data = sheet.getDataRange().getValues();
  var targetRowIndex = -1;
  
  var idValue = payload.id || payload.employeeId || payload.applicantId || payload.source_id;
  
  if (idValue && data.length > 1) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idValue)) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }
  
  // RÀNG BUỘC TUYỆT ĐỐI (09/2026): Google Sheet KHÔNG BAO GIỜ bị xóa dòng.
  // Web xóa local -> Sheet GIỮ NGUYÊN vĩnh viễn. Mọi lệnh DELETE/HARD_DELETE từ webhook đều bị bỏ qua.
  if (operation === 'DELETE' || operation === 'HARD_DELETE' || operation === 'DELETE_ROW') {
    return;
  }
  
  var rowValues = formatPayloadToRow(sheet.getName(), payload);
  
  if (targetRowIndex > 0) {
    sheet.getRange(targetRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#FCE4EC").setFontColor("#881337");
  }
}

function getHeadersForSheet(name) {
  switch (name) {
    case 'NHAN_VIEN_MOI':
      return ['ID / Source ID', 'Họ và tên', 'Số điện thoại', 'Chi nhánh', 'Vị trí', 'Trạng thái', 'Điểm AI', 'Thời gian nộp'];
    case 'NHAN_VIEN_TRAINING':
    case 'NHAN_VIEN_CHINH_THUC':
      return ['Mã NV', 'Họ tên', 'SĐT', 'Chi nhánh', 'Ca mặc định', 'Trạng thái', 'Ngày vào làm', 'Thời gian cập nhật'];
    case 'RECORD_DIEM_DANH':
      return ['ID Điểm danh', 'Mã NV', 'Họ tên', 'Chi nhánh', 'Loại', 'Thời gian', 'Vĩ độ', 'Kinh độ', 'Drive Path'];
    case 'LICH_LAM_VIEC':
      return ['ID Lịch', 'Mã NV', 'Chi nhánh', 'Ngày', 'Ca', 'Trạng thái', 'Phiên bản'];
    case 'PHIEU_OFF_HANG_TUAN':
      return ['ID Phiếu', 'Mã NV', 'Chi nhánh', 'Ngày OFF', 'Ca', 'Lý do', 'Trạng thái', 'Ngày tạo'];
    case 'PHIEU_OFF_DOT_XUAT':
      return ['ID Khẩn cấp', 'Mã NV', 'Chi nhánh', 'Ngày', 'Ca', 'Lý do', 'NV Thay thế', 'Trạng thái'];
    case 'PHIEU_DOI_THIET_BI':
      return ['ID Đổi máy', 'Mã NV', 'Lý do', 'Trạng thái', 'Device ID Cũ', 'Device ID Mới'];
    case 'KET_QUA_TEST':
      return ['ID Kết quả', 'Mã NV', 'Tên NV', 'Số câu đúng', 'Tổng điểm', 'Kết quả', 'Thời gian nộp'];
    case 'RECORD_ZALO':
      return ['ID Record', 'Mã NV', 'Số Zalo', 'Mẫu tin', 'Trạng thái', 'Thời gian gửi'];
    default:
      return ['ID', 'Payload JSON', 'Thời gian cập nhật'];
  }
}

function formatPayloadToRow(name, payload) {
  var now = new Date().toLocaleString('vi-VN');
  switch (name) {
    case 'NHAN_VIEN_MOI':
      return [payload.id || payload.source_id || '', payload.name || '', payload.phone || '', payload.branchId || '', payload.position || '', payload.status || '', payload.aiScore || '', payload.submittedAt || now];
    case 'NHAN_VIEN_TRAINING':
    case 'NHAN_VIEN_CHINH_THUC':
      return [payload.employeeId || payload.id || '', payload.name || '', payload.phone || '', payload.branchId || '', payload.shift || '', payload.status || '', payload.startDate || now, now];
    case 'RECORD_DIEM_DANH':
      return [payload.id || '', payload.employeeId || '', payload.name || '', payload.branchId || '', payload.type || '', payload.timestamp || now, payload.lat || '', payload.lng || '', payload.drivePath || ''];
    case 'LICH_LAM_VIEC':
      return [payload.id || '', payload.employeeId || '', payload.branchId || '', payload.date || '', payload.shift || '', payload.status || '', payload.version || 1];
    case 'PHIEU_OFF_HANG_TUAN':
      return [payload.id || '', payload.employeeId || '', payload.branchId || '', payload.offDate || '', payload.shift || '', payload.reason || '', payload.status || '', payload.createdAt || now];
    case 'PHIEU_OFF_DOT_XUAT':
      return [payload.id || '', payload.employeeId || '', payload.branchId || '', payload.date || '', payload.shift || '', payload.reason || '', payload.substituteEmployeeId || '', payload.status || ''];
    case 'PHIEU_DOI_THIET_BI':
      return [payload.id || '', payload.employeeId || '', payload.reason || '', payload.status || '', payload.oldDeviceId || '', payload.newDeviceId || ''];
    case 'KET_QUA_TEST':
      return [payload.id || '', payload.employeeId || '', payload.name || '', payload.correctCount || 0, payload.score || 0, payload.result || '', payload.completedAt || now];
    case 'RECORD_ZALO':
      return [payload.id || '', payload.employeeId || '', payload.phone || '', payload.template || '', payload.status || '', payload.sentAt || now];
    default:
      return [payload.id || '', JSON.stringify(payload), now];
  }
}
