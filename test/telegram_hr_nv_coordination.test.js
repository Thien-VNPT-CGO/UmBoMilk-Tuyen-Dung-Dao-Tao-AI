const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const tg = require('../services/telegram');

describe('Telegram Bot — Phối hợp 2 Bot (HR & NV), Phân quyền Role & Ma trận lịch tuần', () => {

  // 1. Kiểm tra khung giờ đăng ký OFF (12h00 T6 -> 15h00 T7 Giờ Việt Nam)
  it('1. Khung giờ đăng ký OFF: Nhận diện chính xác BEFORE, OPEN, AFTER', () => {
    // Helper mô phỏng checkOffWindowStatus
    function simWindow(dayOfWeek, hour, minute = 0) {
      const timeNum = hour + minute / 60;
      if (dayOfWeek === 5) {
        if (timeNum < 12) return { isOpen: false, state: 'BEFORE' };
        return { isOpen: true, state: 'OPEN' };
      }
      if (dayOfWeek === 6) {
        if (timeNum <= 15) return { isOpen: true, state: 'OPEN' };
        return { isOpen: false, state: 'AFTER' };
      }
      if (dayOfWeek === 0) return { isOpen: false, state: 'AFTER' };
      return { isOpen: false, state: 'BEFORE' };
    }

    assert.equal(simWindow(5, 10).state, 'BEFORE'); // T6 10h00
    assert.equal(simWindow(5, 12).state, 'OPEN');   // T6 12h00
    assert.equal(simWindow(5, 20).state, 'OPEN');   // T6 20h00
    assert.equal(simWindow(6, 14).state, 'OPEN');   // T7 14h00
    assert.equal(simWindow(6, 15, 1).state, 'AFTER'); // T7 15h01
    assert.equal(simWindow(6, 18).state, 'AFTER');  // T7 18h00
    assert.equal(simWindow(0, 10).state, 'AFTER');  // CN 10h00
    assert.equal(simWindow(1, 9).state, 'BEFORE');  // T2 09h00
  });

  // 2. Bot NV: Cảnh báo khi nhắn /dang_ky_OFF trước hoặc sau khung giờ
  it('2. Bot NV phản hồi chính xác thông điệp khi /dang_ky_OFF ngoài khung giờ', async () => {
    // Trường hợp CHƯA ĐẾN GIỜ (BEFORE)
    const ctxBefore = {
      role: 'employee',
      checkOffWindow: () => ({ isOpen: false, state: 'BEFORE' })
    };
    const actBefore = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, text: '/dang_ky_OFF' } },
      ctxBefore
    );
    assert.ok(actBefore[0].text.includes('CHƯA ĐẾN KHUNG GIỜ ĐĂNG KÝ LỊCH OFF'));
    assert.ok(actBefore[0].text.includes('12h00 Thứ 6'));

    // Trường hợp ĐÃ HẾT HẠN (AFTER)
    const ctxAfter = {
      role: 'employee',
      checkOffWindow: () => ({ isOpen: false, state: 'AFTER' })
    };
    const actAfter = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, text: '/dang_ky_off' } },
      ctxAfter
    );
    assert.ok(actAfter[0].text.includes('ĐÃ HẾT HẠN KHUNG GIỜ ĐĂNG KÝ LỊCH OFF'));
    assert.ok(actAfter[0].text.includes('AI đang xếp lịch'));
    assert.ok(actAfter[0].text.includes('/sos'));

    // Trường hợp ĐANG MỞ (OPEN)
    const ctxOpen = {
      role: 'employee',
      checkOffWindow: () => ({ isOpen: true, state: 'OPEN' })
    };
    const actOpen = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, text: '/dang_ky_OFF' } },
      ctxOpen
    );
    assert.ok(actOpen[0].text.includes('CỔNG ĐĂNG KÝ TUẦN ĐÃ MỞ') || actOpen[0].text.includes('CỔNG ĐĂNG KÝ LỊCH OFF TUẦN ĐÃ MỞ'));
  });

  // 3. Bot NV: Cú pháp /sos phản hồi kênh hỗ trợ khẩn cấp
  it('3. Cú pháp /sos trên Bot NV phản hồi thông tin khẩn cấp', async () => {
    const act = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, text: '/sos' } },
      { role: 'employee' }
    );
    assert.ok(act[0].text.includes('KÊNH HỖ TRỢ KHẨN CẤP / BÁO CA ĐỘT XUẤT (SOS)'));
    assert.ok(act[0].text.includes('0842.112.530'));
  });

  // 4. Bot HR: Yêu cầu đăng nhập trước khi dùng các lệnh quản trị
  it('4. Bot HR chặn lệnh khi chưa đăng nhập và hướng dẫn /login', async () => {
    let session = null;
    const ctxHrUnauth = {
      role: 'hr',
      getHrSession: async () => session,
      hrLogin: async (chatId, u, p) => {
        if (u === 'admin' && p === 'Master@@2027') {
          session = { username: 'admin', role: 'Admin', displayName: 'Administrator' };
          return { ok: true, user: session };
        }
        return { ok: false, error: 'Sai mật khẩu' };
      }
    };

    // Khi chưa đăng nhập mà gõ /tonghop_lich
    const actBlocked = await tg.handleTelegramUpdate(
      { message: { chat: { id: 999 }, text: '/tonghop_lich' } },
      ctxHrUnauth
    );
    assert.ok(actBlocked[0].text.includes('BẠN CHƯA ĐĂNG NHẬP VÀO HỆ THỐNG HR/ADMIN'));
    assert.ok(actBlocked[0].text.includes('/login'));

    // Đăng nhập sai
    const actFail = await tg.handleTelegramUpdate(
      { message: { chat: { id: 999 }, text: '/login admin wrongpass' } },
      ctxHrUnauth
    );
    assert.ok(actFail[0].text.includes('Đăng nhập thất bại'));

    // Đăng nhập đúng
    const actSuccess = await tg.handleTelegramUpdate(
      { message: { chat: { id: 999 }, text: '/login admin Master@@2027' } },
      ctxHrUnauth
    );
    assert.ok(actSuccess[0].text.includes('ĐĂNG NHẬP THÀNH CÔNG'));
    assert.ok(actSuccess[0].text.includes('ADMIN'));
  });

  // 5. Bot HR: Phân quyền vai trò (Admin vs HR vs QL vs MKT)
  it('5. Phân quyền menu và lệnh theo vai trò Admin, HR, QL, MKT', async () => {
    // Menu Admin có /users, /capquyen, /test, /delete_test
    const adminMenu = tg.getHrRoleMenuText({ role: 'Admin', displayName: 'Quản trị viên', username: 'admin' });
    assert.ok(adminMenu.includes('BẢNG ĐIỀU KHIỂN ADMIN'));
    assert.ok(adminMenu.includes('/users'));
    assert.ok(adminMenu.includes('/capquyen'));
    assert.ok(adminMenu.includes('/test'));
    assert.ok(adminMenu.includes('/delete_test'));

    // Menu HR có /tonghop_lich, /sap_lich_nv, /duyet, /baocao
    const hrMenu = tg.getHrRoleMenuText({ role: 'HR', displayName: 'Nhân sự Lan', username: 'hr_lan' });
    assert.ok(hrMenu.includes('BẢNG CHỨC NĂNG NHÂN SỰ (HR)'));
    assert.ok(hrMenu.includes('/tonghop_lich'));
    assert.ok(hrMenu.includes('/sap_lich_nv'));
    assert.ok(!hrMenu.includes('/delete_test')); // HR không có lệnh delete_test

    // Menu QL (Quản lý cửa hàng) có chi nhánh
    const qlMenu = tg.getHrRoleMenuText({ role: 'QL', displayName: 'Quản lý CN1', username: 'ql_cn1', branchScope: ['CN130'] });
    assert.ok(qlMenu.includes('BẢNG QUẢN LÝ CỬA HÀNG'));
    assert.ok(qlMenu.includes('/diemdanh_cn'));
    assert.ok(qlMenu.includes('/lich_cn'));

    // Menu MKT
    const mktMenu = tg.getHrRoleMenuText({ role: 'MKT', displayName: 'Marketing Tuấn', username: 'mkt_tuan' });
    assert.ok(mktMenu.includes('BẢNG CHỨC NĂNG MARKETING'));
    assert.ok(mktMenu.includes('/broadcast_mkt'));
    assert.ok(mktMenu.includes('/sukien'));
  });

  // 6. Bot HR: Tài khoản không phải Admin bị chặn khi gõ /test hoặc /delete_test
  it('6. Tài khoản HR bị chặn khi cố thực hiện /test hoặc /delete_test', async () => {
    const hrSession = { username: 'hr_user', role: 'HR', displayName: 'HR Staff' };
    const ctx = {
      role: 'hr',
      getHrSession: async () => hrSession
    };

    const actTest = await tg.handleTelegramUpdate(
      { message: { chat: { id: 500 }, text: '/test off' } },
      ctx
    );
    assert.ok(actTest[0].text.includes('chỉ dành riêng cho tài khoản Admin'));

    const actDel = await tg.handleTelegramUpdate(
      { message: { chat: { id: 500 }, text: '/delete_test' } },
      ctx
    );
    assert.ok(actDel[0].text.includes('chỉ dành riêng cho tài khoản Admin'));
  });

  // 7. Bot HR: Lệnh /tonghop_lich hiển thị ma trận 🟢/🔴 và cảnh báo tải ca thấp
  it('7. /tonghop_lich hiển thị ma trận lịch tuần và cảnh báo nhân viên < 2 ca/tuần', async () => {
    const adminSession = { username: 'admin', role: 'Admin', displayName: 'Boss' };
    const ctx = {
      role: 'hr',
      getHrSession: async () => adminSession,
      getScheduleMatrix: async (week) => {
        return {
          text: '📅 <b>TỔNG HỢP MA TRẬN LỊCH TUẦN</b>\n\n'
            + '🏪 <b>CN130 • CA_SANG</b>\n'
            + '• <b>Nguyễn Văn A</b> (<code>NV1288</code>) [4 ca]: T2:🟢 T3:🟢 T4:🔴 T5:🟢 T6:🟢 T7:🔴 CN:🔴\n'
            + '• <b>Trần Thị B</b> (<code>NV4100</code>) [1 ca]: T2:🔴 T3:🔴 T4:🟢 T5:🔴 T6:🔴 T7:🔴 CN:🔴\n\n'
            + '⚠️ <b>CẢNH BÁO TẢI CA THẤP (< 2 CA/TUẦN):</b>\n'
            + '⚠️ <b>Trần Thị B</b> (<code>NV4100</code>) chỉ có <b>1 ca/tuần</b> (< 2 ca)!'
        };
      }
    };

    const act = await tg.handleTelegramUpdate(
      { message: { chat: { id: 500 }, text: '/tonghop_lich' } },
      ctx
    );
    assert.ok(act[0].text.includes('TỔNG HỢP MA TRẬN LỊCH TUẦN'));
    assert.ok(act[0].text.includes('🟢'));
    assert.ok(act[0].text.includes('🔴'));
    assert.ok(act[0].text.includes('CẢNH BÁO TẢI CA THẤP'));
  });

  // 8. Bot HR: Lệnh /sap_lich_nv hỗ trợ mã ngắn NV1288 và cảnh báo trùng ca
  it('8. /sap_lich_nv gọi hàm điều chỉnh lịch với mã ngắn và trả về kết quả', async () => {
    const adminSession = { username: 'admin', role: 'Admin' };
    let calledEmp = '', calledSpec = '';
    const ctx = {
      role: 'hr',
      getHrSession: async () => adminSession,
      hrReschedule: async (sess, empQuery, spec) => {
        calledEmp = empQuery;
        calledSpec = spec;
        return {
          text: `✅ <b>ĐÃ CẬP NHẬT LỊCH THÀNH CÔNG</b>\n👤 Nhân viên: Nguyễn Văn A (<code>${empQuery}</code>)\n📊 Ma trận tuần: T2:🟢 | T3:🟢 | T4:🔴 | T5:🟢 | T6:🟢 | T7:🔴 | CN:🟢`
        };
      }
    };

    const act = await tg.handleTelegramUpdate(
      { message: { chat: { id: 500 }, text: '/sap_lich_nv NV1288 T2-ON, T3-ON, T4-OFF, T5-ON, T6-ON, T7-OFF, CN-ON' } },
      ctx
    );
    assert.equal(calledEmp, 'NV1288');
    assert.ok(calledSpec.includes('T2-ON'));
    assert.ok(act[0].text.includes('ĐÃ CẬP NHẬT LỊCH THÀNH CÔNG'));
    assert.ok(act[0].text.includes('NV1288'));
  });

  // 9. Bot HR: Admin chạy /test và /delete_test
  it('9. Admin chạy /test tạo bản ghi test và /delete_test dọn dẹp sạch', async () => {
    const adminSession = { username: 'admin', role: 'Admin' };
    let testCreated = false, testDeleted = false;

    const ctx = {
      role: 'hr',
      getHrSession: async () => adminSession,
      adminRunTest: async (type) => {
        testCreated = true;
        return { text: `🧪 [TEST MODE] Đã tạo bản ghi test thành công: ${type} (isTest: true).` };
      },
      adminDeleteTest: async () => {
        testDeleted = true;
        return { text: '🗑️ ĐÃ DỌN DẸP SẠCH SẼ TOÀN BỘ DỮ LIỆU TEST: Phiếu OFF test đã xóa: 1' };
      }
    };

    const actRun = await tg.handleTelegramUpdate(
      { message: { chat: { id: 500 }, text: '/test off' } },
      ctx
    );
    assert.equal(testCreated, true);
    assert.ok(actRun[0].text.includes('[TEST MODE]'));

    const actDel = await tg.handleTelegramUpdate(
      { message: { chat: { id: 500 }, text: '/delete_test' } },
      ctx
    );
    assert.equal(testDeleted, true);
    assert.ok(actDel[0].text.includes('ĐÃ DỌN DẸP SẠCH SẼ TOÀN BỘ DỮ LIỆU TEST'));
  });
});
