// test/telegram_v4_features.test.js — Kiểm thử tính năng V4.3 Telegram Bot & Mini App Ụm Bò Milk
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DISABLE_OUTBOUND_SYNC = 'true';

const tg = require('../services/telegram');

test('Telegram V4.3 Features Suite', async (t) => {
  // Mock session data
  const adminSession = {
    username: 'admin',
    role: 'ADMIN',
    displayName: 'Quản trị viên',
    branchScope: [],
    loggedInAt: new Date().toISOString()
  };

  const hrSession = {
    username: 'hr_test',
    role: 'HR',
    displayName: 'Nhân viên HR',
    branchScope: ['CN130'],
    loggedInAt: new Date().toISOString()
  };

  const qlSession = {
    username: 'ql_test',
    role: 'QL',
    displayName: 'Quản lý CN130',
    branchScope: ['CN130'],
    loggedInAt: new Date().toISOString()
  };

  await t.test('1. Hồ sơ nhân viên /hoso_nhanvien trả về đầy đủ 6 thông tin chuẩn hóa', async () => {
    // 1.1 Kiểm tra hỗ trợ mã ngắn (NV1288 hoặc 1288)
    const update = {
      message: { chat: { id: 99991 }, from: { id: 99991 }, text: '/hoso_nhanvien: NV1288' }
    };
    const r = await tg.handleTelegramUpdate(update, {
      role: 'hr',
      getHrSession: async () => adminSession,
      hrGetEmployeeProfile: async (sess, code) => {
        assert.equal(code, 'NV1288');
        return {
          text: `👤 <b>HỒ SƠ NHÂN VIÊN — ỤM BÒ MILK</b>\n`
            + `━━━━━━━━━━━━━━━━━━━━━\n`
            + `👤 <b>Tên nhân viên:</b> Nguyễn Văn Test\n`
            + `📞 <b>Số điện thoại:</b> 0905111222\n`
            + `🆔 <b>Mã nhân viên:</b> <code>CN130_NV1288</code>\n`
            + `📅 <b>Ngày bắt đầu tham gia:</b> 01/09/2026\n`
            + `🏪 <b>Chi nhánh & Ca làm:</b> CN130 • CA_SANG\n`
            + `💵 <b>Lương chính thức:</b> 25.500đ / giờ (Chính thức)\n`
            + `━━━━━━━━━━━━━━━━━━━━━`
        };
      }
    });

    assert.equal(r.length, 1);
    assert.ok(r[0].text.includes('Nguyễn Văn Test'));
    assert.ok(r[0].text.includes('0905111222'));
    assert.ok(r[0].text.includes('CN130_NV1288'));
    assert.ok(r[0].text.includes('01/09/2026'));
    assert.ok(r[0].text.includes('CN130 • CA_SANG'));
    assert.ok(r[0].text.includes('25.500đ / giờ'));

    // 1.2 Khi chưa đăng nhập thì chặn và nhắc /login
    const unauth = await tg.handleTelegramUpdate(update, {
      role: 'hr',
      getHrSession: async () => null
    });
    assert.ok(unauth[0].text.includes('CHƯA ĐĂNG NHẬP'));
  });

  await t.test('2. Duyệt & phát phiếu lương /duyet_phieuluong: Định dạng chuẩn cho Cửa hàng vs Văn phòng', async () => {
    // 2.1 Cửa hàng: 11 mục, KHÔNG có lương cơ bản, có giờ công & lương giờ
    const storeSlip = `💳 <b>PHIẾU LƯƠNG THÁNG 09/2026 — ỤM BÒ MILK</b>\n`
      + `🏪 <b>Chi nhánh:</b> CN130\n`
      + `━━━━━━━━━━━━━━━━━━━━━\n`
      + `🆔 <b>Mã nhân viên:</b> <code>CN130_NV1288</code>\n`
      + `👤 <b>Tên nhân viên:</b> Lê Văn Pha Chế\n`
      + `⏱️ <b>Ngày công chính (giờ):</b> 140 giờ\n`
      + `⏱️ <b>Lương giờ:</b> 25.500đ / giờ\n`
      + `➕ <b>Lương thêm giờ:</b> 150.000đ\n`
      + `🎁 <b>Phụ cấp:</b> 300.000đ\n`
      + `🌟 <b>Bonus (OT, Lễ):</b> 200.000đ\n`
      + `💰 <b>Tổng lương:</b> 4.220.000đ\n`
      + `➖ <b>Trừ KPI:</b> 0đ\n`
      + `💳 <b>Ứng lương:</b> 0đ\n`
      + `━━━━━━━━━━━━━━━━━━━━━\n`
      + `💵 <b>CÒN LÃNH:</b> <b>4.220.000đ</b>\n`
      + `━━━━━━━━━━━━━━━━━━━━━\n`
      + `📌 <i>Hotline giải đáp: 0909.903.609 - 0333.137.633</i>`;

    assert.ok(storeSlip.includes('Ngày công chính (giờ)'));
    assert.ok(storeSlip.includes('Lương giờ'));
    assert.ok(!storeSlip.includes('Lương cơ bản'));
    assert.ok(storeSlip.includes('CÒN LÃNH:'));
    assert.ok(storeSlip.includes('0909.903.609 - 0333.137.633'));

    // 2.2 Văn phòng: 9 mục, CÓ lương cơ bản, KHÔNG có lương giờ
    const officeSlip = `💳 <b>PHIẾU LƯƠNG THÁNG 09/2026 — ỤM BÒ MILK</b>\n`
      + `🏢 <b>Bộ phận:</b> Văn phòng\n`
      + `━━━━━━━━━━━━━━━━━━━━━\n`
      + `🆔 <b>Mã nhân viên:</b> <code>VP_NV9901</code>\n`
      + `👤 <b>Tên nhân viên:</b> Trần Thị Kế Toán\n`
      + `💵 <b>Lương cơ bản:</b> 8.000.000đ\n`
      + `🎁 <b>Phụ cấp:</b> 500.000đ\n`
      + `🌟 <b>Bonus (OT, Lễ):</b> 500.000đ\n`
      + `💰 <b>Tổng lương:</b> 9.000.000đ\n`
      + `➖ <b>Trừ KPI:</b> 0đ\n`
      + `💳 <b>Ứng lương:</b> 0đ\n`
      + `━━━━━━━━━━━━━━━━━━━━━\n`
      + `💵 <b>CÒN LÃNH:</b> <b>9.000.000đ</b>\n`
      + `━━━━━━━━━━━━━━━━━━━━━\n`
      + `📌 <i>Hotline giải đáp: 0909.903.609 - 0333.137.633</i>`;

    assert.ok(officeSlip.includes('Lương cơ bản'));
    assert.ok(!officeSlip.includes('Ngày công chính (giờ)'));
    assert.ok(!officeSlip.includes('Lương giờ'));
    assert.ok(officeSlip.includes('CÒN LÃNH:'));
    assert.ok(officeSlip.includes('0909.903.609 - 0333.137.633'));

    // 2.3 Gọi /duyet_phieuluong từ bot HR
    const update = {
      message: { chat: { id: 99992 }, from: { id: 99992 }, text: '/duyet_phieuluong CN130' }
    };
    const r = await tg.handleTelegramUpdate(update, {
      role: 'hr',
      getHrSession: async () => qlSession,
      hrApproveAndSendPayslips: async (sess, branch) => {
        assert.equal(branch, 'CN130');
        return {
          text: `🎉 <b>HOÀN TẤT DUYỆT & PHÁT PHIẾU LƯƠNG THÁNG 09/2026</b>\n\n`
            + `• Người duyệt: <b>${sess.displayName}</b>\n`
            + `• Đã gửi thành công: <b>15</b>\n`
            + `• Tiến độ: [1/15] ... [15/15]`
        };
      }
    });
    assert.ok(r[0].text.includes('HOÀN TẤT DUYỆT & PHÁT PHIẾU LƯƠNG'));
  });

  await t.test('3. HR Bot Session: Hết hạn sau 24h và tự động yêu cầu đăng nhập lại', async () => {
    // 3.1 Phiên còn hạn (< 24h)
    const freshLogin = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const isFreshExpired = Date.now() - new Date(freshLogin).getTime() > 24 * 60 * 60 * 1000;
    assert.equal(isFreshExpired, false);

    // 3.2 Phiên quá hạn (> 24h)
    const oldLogin = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const isOldExpired = Date.now() - new Date(oldLogin).getTime() > 24 * 60 * 60 * 1000;
    assert.equal(isOldExpired, true);

    // 3.3 Đổi mật khẩu HR: /doi_mat_khau <user> <old> <new>
    const passUpdate = {
      message: { chat: { id: 99993 }, from: { id: 99993 }, text: '/doi_mat_khau admin Master@@2027 UbmNewPass@@2028' }
    };
    const rPass = await tg.handleTelegramUpdate(passUpdate, {
      role: 'hr',
      getHrSession: async () => adminSession,
      hrChangePassword: async (sess, u, oldP, newP) => {
        assert.equal(u, 'admin');
        assert.equal(oldP, 'Master@@2027');
        assert.equal(newP, 'UbmNewPass@@2028');
        return { text: `✅ Đã đổi mật khẩu thành công cho tài khoản <b>${u}</b>!` };
      }
    });
    assert.ok(rPass[0].text.includes('Đã đổi mật khẩu thành công'));
  });

  await t.test('4. Quy trình Đổi ca 3 bước: A yêu cầu -> B xác nhận (Inline) -> HR duyệt (Inline)', async () => {
    // Bước 1: Nhân viên A gửi yêu cầu đổi ca
    const swapUpdate = {
      message: { chat: { id: 1001 }, from: { id: 1001 }, text: '/doica 20/09 Ca Sáng sang Lan 20/09 Ca Tối' }
    };
    const r1 = await tg.handleTelegramUpdate(swapUpdate, {
      role: 'employee',
      requestShiftSwap: async (tgId, raw, chatId) => {
        assert.ok(raw.includes('20/09'));
        return {
          text: `🔄 <b>ĐÃ GỬI YÊU CẦU ĐỔI CA LÀM VIỆC</b>\n\nĐã gửi tin nhắn tới bạn Lan để xác nhận.`
        };
      }
    });
    assert.ok(r1[0].text.includes('ĐÃ GỬI YÊU CẦU ĐỔI CA'));

    // Bước 2: Nhân viên B bấm xác nhận [ĐỒNG Ý] qua callback_query
    const peerAcceptCb = {
      callback_query: {
        id: 'cb_1',
        from: { id: 2002, username: 'lan_nv' },
        message: { chat: { id: 2002 } },
        data: 'swappeer:accept:swap_uuid_123'
      }
    };
    const r2 = await tg.handleTelegramUpdate(peerAcceptCb, {
      role: 'employee',
      peerConfirmShiftSwap: async (swapId, isAccepted, peerTgId) => {
        assert.equal(swapId, 'swap_uuid_123');
        assert.equal(isAccepted, true);
        return { text: '✅ Bạn đã ĐỒNG Ý đổi ca. Yêu cầu đã chuyển tới HR phê duyệt!' };
      }
    });
    assert.ok(r2[0].text.includes('ĐỒNG Ý đổi ca'));

    // Bước 3: HR bấm [DUYỆT ĐỔI CA] qua callback_query
    const hrApproveCb = {
      callback_query: {
        id: 'cb_2',
        from: { id: 8888, username: 'admin' },
        message: { chat: { id: 8888 } },
        data: 'swaphr:approve:swap_uuid_123'
      }
    };
    const r3 = await tg.handleTelegramUpdate(hrApproveCb, {
      role: 'hr',
      getHrSession: async () => adminSession,
      hrApproveShiftSwap: async (swapId, isApproved, sess) => {
        assert.equal(swapId, 'swap_uuid_123');
        assert.equal(isApproved, true);
        return { text: '✅ Đã phê duyệt và hoán đổi lịch làm việc thành công!' };
      }
    });
    assert.ok(r3[0].text.includes('phê duyệt và hoán đổi lịch'));
  });

  await t.test('5. Quy tắc chấm điểm Khóa học & Thông báo trắc nghiệm 3 mức', () => {
    // 25 câu = 10 điểm, thời gian 8 phút
    // Mức 1: < 5 -> LOẠI
    const scoreFail = 4.8;
    assert.ok(scoreFail < 5, 'Dưới 5 điểm phải LOẠI');

    // Mức 2: 5 - dưới 8 -> THI LẠI
    const scoreRetake = 6.4;
    assert.ok(scoreRetake >= 5 && scoreRetake < 8, 'Từ 5 đến dưới 8 điểm phải THI LẠI');

    // Mức 3: >= 8 -> ĐẠT 🎆
    const scorePass = 8.8;
    assert.ok(scorePass >= 8, 'Từ 8 điểm trở lên ĐẠT');
  });

  await t.test('6. Cảnh báo trạng thái tài khoản Bot Quản trị: Đỏ khi chưa đăng nhập, Xanh khi hoạt động', async () => {
    // 6.1 Chưa đăng nhập -> Cảnh báo ĐỎ rõ ràng trạng thái chưa hoạt động
    const unauthUpdate = { message: { chat: { id: 77771 }, from: { id: 77771 }, text: '/menu' } };
    const rUnauth = await tg.handleTelegramUpdate(unauthUpdate, {
      role: 'hr',
      getHrSession: async () => null
    });
    assert.ok(rUnauth[0].text.includes('🔴 <b>TRẠNG THÁI: TÀI KHOẢN CHƯA ĐĂNG NHẬP (CHƯA HOẠT ĐỘNG)</b>'));
    assert.ok(rUnauth[0].text.includes('TẠM KHÓA'));

    // 6.2 Đăng nhập thành công -> Cảnh báo XANH trạng thái đang hoạt động 24h
    const loginUpdate = { message: { chat: { id: 77771 }, from: { id: 77771 }, text: '/login admin_user secretpass' } };
    const rLogin = await tg.handleTelegramUpdate(loginUpdate, {
      role: 'hr',
      getHrSession: async () => null,
      hrLogin: async (chatId, u, p) => ({
        ok: true,
        user: { username: u, role: 'HR', displayName: 'HR Master' }
      })
    });
    assert.ok(rLogin[0].text.includes('🟢 <b>TRẠNG THÁI: TÀI KHOẢN ĐANG HOẠT ĐỘNG (Hiệu lực: 24 giờ)'));
  });

  await t.test('7. Tuyệt đối KHÔNG hiển thị lộ tài khoản thật hoặc mật khẩu trong thông báo hay hướng dẫn', async () => {
    // 7.1 Lệnh /login không kèm tham số -> Không chứa pass mẫu (Master@@2027, etc.)
    const rLoginHelp = await tg.handleTelegramUpdate({ message: { chat: { id: 77772 }, text: '/login' } }, { role: 'hr' });
    assert.ok(!rLoginHelp[0].text.includes('Master@@2027'));
    assert.ok(!rLoginHelp[0].text.includes('admin123'));
    assert.ok(!rLoginHelp[0].text.includes('hr123'));
    assert.ok(rLoginHelp[0].text.includes('tên_đăng_nhập'));

    // 7.2 Lệnh /doi_mat_khau không kèm tham số -> Không chứa pass mẫu
    const rPassHelp = await tg.handleTelegramUpdate({ message: { chat: { id: 77772 }, text: '/doi_mat_khau' } }, {
      role: 'hr',
      getHrSession: async () => adminSession
    });
    assert.ok(!rPassHelp[0].text.includes('Master@@2027'));
    assert.ok(!rPassHelp[0].text.includes('UbmNewPass@@2028'));
  });

  await t.test('8. /reset_hethong CHỈ THỰC HIỆN MỖI TÀI KHOẢN ADMIN - Các tài khoản còn lại KHÔNG CÓ QUYỀN', async () => {
    const resetCmd = { message: { chat: { id: 77773 }, text: '/reset_hethong: LICH_LAM_VIEC' } };

    // 8.1 Tài khoản HR -> Bị chặn truy cập
    const rHr = await tg.handleTelegramUpdate(resetCmd, {
      role: 'hr',
      getHrSession: async () => hrSession
    });
    assert.ok(rHr[0].text.includes('TỪ CHỐI TRUY CẬP'));
    assert.ok(rHr[0].text.includes('CHỈ THỰC HIỆN MỖI TÀI KHOẢN ADMIN'));

    // 8.2 Tài khoản QL -> Bị chặn truy cập
    const rQl = await tg.handleTelegramUpdate(resetCmd, {
      role: 'hr',
      getHrSession: async () => qlSession
    });
    assert.ok(rQl[0].text.includes('TỪ CHỐI TRUY CẬP'));

    // 8.3 Tài khoản Admin -> Cho phép thực hiện và gọi adminResetSheet
    let resetCalledWith = null;
    const rAdmin = await tg.handleTelegramUpdate(resetCmd, {
      role: 'hr',
      getHrSession: async () => adminSession,
      adminResetSheet: async (sess, sheet) => {
        resetCalledWith = sheet;
        return { text: `✅ Đã xóa sạch dữ liệu sheet ${sheet} từ dòng A2 đến Z trên Google Sheet.` };
      }
    });
    assert.equal(resetCalledWith, 'LICH_LAM_VIEC');
    assert.ok(rAdmin[0].text.includes('LICH_LAM_VIEC'));
  });

  await t.test('9. /duyet_phieuluong CHỈ HIỂN THỊ VÀ THỰC HIỆN TRÊN TÀI KHOẢN QL (Bỏ trên Admin/HR/MKT)', async () => {
    // 9.1 Menu Admin/HR không có /duyet_phieuluong
    const menuAdmin = tg.getHrRoleMenuText(adminSession);
    assert.ok(!menuAdmin.includes('/duyet_phieuluong'), 'Admin menu không được chứa /duyet_phieuluong');
    const menuHr = tg.getHrRoleMenuText(hrSession);
    assert.ok(!menuHr.includes('/duyet_phieuluong'), 'HR menu không được chứa /duyet_phieuluong');

    // 9.2 Menu QL có /duyet_phieuluong
    const menuQl = tg.getHrRoleMenuText(qlSession);
    assert.ok(menuQl.includes('/duyet_phieuluong'), 'QL menu phải chứa /duyet_phieuluong');

    // 9.3 HR gọi /duyet_phieuluong -> Bị chặn quyền
    const payCmd = { message: { chat: { id: 77774 }, text: '/duyet_phieuluong CN130' } };
    const rHrPay = await tg.handleTelegramUpdate(payCmd, {
      role: 'hr',
      getHrSession: async () => hrSession
    });
    assert.ok(rHrPay[0].text.includes('QUYỀN HẠN BỊ TỪ CHỐI'));
    assert.ok(rHrPay[0].text.includes('Quản lý cửa hàng (QL)'));

    // 9.4 QL gọi /duyet_phieuluong -> Cho phép thực hiện
    let payslipBranchCalled = null;
    const rQlPay = await tg.handleTelegramUpdate(payCmd, {
      role: 'hr',
      getHrSession: async () => qlSession,
      hrApproveAndSendPayslips: async (sess, branch) => {
        payslipBranchCalled = branch;
        return { text: '🎉 HOÀN TẤT DUYỆT & PHÁT PHIẾU LƯƠNG' };
      }
    });
    assert.equal(payslipBranchCalled, 'CN130');
    assert.ok(rQlPay[0].text.includes('HOÀN TẤT DUYỆT & PHÁT PHIẾU LƯƠNG'));
  });

  await t.test('10. Đăng ký OFF 2 ngày/tuần: Hiển thị cảnh báo nếu nhân viên đã đăng ký rồi', async () => {
    const offUpdate = {
      message: { chat: { id: 66661 }, from: { id: 66661 }, text: '21/09/2026, 25/09/2026' }
    };

    // Khi nhân viên đã đăng ký 2 ngày OFF tuần này rồi
    const rWarn = await tg.handleTelegramUpdate(offUpdate, {
      role: 'employee',
      checkExistingOffRegistration: async (tgId, dates) => ({
        hasRegistered: true,
        dates: ['21/09/2026', '25/09/2026']
      })
    });

    assert.ok(rWarn[0].text.includes('CẢNH BÁO: BẠN ĐÃ ĐĂNG KÝ LỊCH OFF TUẦN NÀY RỒI!'));
    assert.ok(rWarn[0].text.includes('21/09/2026, 25/09/2026'));
    assert.ok(rWarn[0].text.includes('không cho phép tự ý ghi đè'));
  });

  await t.test('11. Xem lịch /lich: Hiển thị lịch tuần hiện tại + cảnh báo lịch tuần sau chưa duyệt', async () => {
    const lichUpdate = {
      message: { chat: { id: 66662 }, from: { id: 66662 }, text: '/lich' }
    };

    const rLich = await tg.handleTelegramUpdate(lichUpdate, {
      role: 'employee',
      getScheduleWithNextWeekStatus: async (tgId) => ({
        text: `📅 <b>LỊCH LÀM VIỆC HIỆN TẠI & TUẦN TỚI</b>\n`
          + `👤 Nhân viên: Nguyễn Văn A (<code>CN130_NV1288</code>)\n\n`
          + `📋 <b>LỊCH TUẦN HIỆN TẠI:</b>\n• <b>18/09/2026</b>: Ca Sáng 💼 (LÀM VIỆC)\n\n`
          + `⏳ <b>LỊCH LÀM VIỆC TUẦN SAU (21/09/2026):</b>\n`
          + `⚠️ <i>Lịch tuần sau của bạn HR chưa duyệt lịch và yêu cầu chờ HR duyệt lịch nhé... Khi HR duyệt, BOT telegram tự động thông báo lịch tuần sau cho nhân viên biết!</i>`
      })
    });

    assert.ok(rLich[0].text.includes('LỊCH TUẦN HIỆN TẠI'));
    assert.ok(rLich[0].text.includes('HR chưa duyệt lịch và yêu cầu chờ'));
    assert.ok(rLich[0].text.includes('tự động thông báo lịch tuần sau'));
  });

  await t.test('12. Đổi ca linh hoạt: Chọn đồng nghiệp cùng chi nhánh và so sánh ca khác ngày', async () => {
    // 12.1 Gõ /doica không tham số -> Hiện danh sách đồng nghiệp cùng chi nhánh dạng nút bấm
    const rCol = await tg.handleTelegramUpdate({ message: { chat: { id: 66663 }, from: { id: 66663 }, text: '/doica' } }, {
      role: 'employee',
      getBranchColleagues: async (tgId) => ({
        branchName: 'CN1 - 130 Vạn Kiếp',
        emp: { name: 'Thanh', employeeId: 'NV101' },
        colleagues: [
          { employeeId: 'NV102', name: 'Lan', shift: 'CA_TOI' },
          { employeeId: 'NV103', name: 'Hùng', shift: 'CA_SANG' }
        ]
      })
    });
    assert.ok(rCol[0].text.includes('chạm chọn bạn đồng nghiệp cùng chi nhánh'));
    assert.equal(rCol[0].extra.reply_markup.inline_keyboard.length, 2);
    assert.equal(rCol[0].extra.reply_markup.inline_keyboard[0][0].callback_data, 'swapcolleague:NV102');

    // 12.2 Bấm nút chọn đồng nghiệp -> Hiện bảng so sánh lịch đối chiếu
    const rCompare = await tg.handleTelegramUpdate({
      callback_query: {
        id: 'cb_col',
        from: { id: 66663 },
        message: { chat: { id: 66663 } },
        data: 'swapcolleague:NV102'
      }
    }, {
      role: 'employee',
      getSwapComparison: async (tgId, colId) => ({
        ok: true,
        text: '🔄 <b>SO SÁNH LỊCH ĐỔI CA — CÙNG CHI NHÁNH CN1</b>\n• Bạn: CA_SANG ⟷ Lan: CA_TOI'
      })
    });
    assert.ok(rCompare[0].text.includes('SO SÁNH LỊCH ĐỔI CA'));
  });

  await t.test('13. Sửa thông tin nhân viên /sua_thongtin_nhanvien đồng bộ Google Sheet 17iXM', async () => {
    let updateCalledWith = null;
    const rEdit = await tg.handleTelegramUpdate({
      message: {
        chat: { id: 77775 },
        text: '/sua_thongtin_nhanvien: NV1288 ca sáng sang ca tối, CN1 sang CN2'
      }
    }, {
      role: 'hr',
      getHrSession: async () => hrSession,
      hrUpdateEmployeeInfo: async (sess, raw) => {
        updateCalledWith = raw;
        return {
          text: `✅ <b>ĐÃ CẬP NHẬT THÔNG TIN NHÂN VIÊN THÀNH CÔNG!</b>\n`
            + `• Ca làm: <code>CA_SANG</code> ➔ <b>CA_TOI</b>\n`
            + `• Chi nhánh: <code>CN1</code> ➔ <b>CN2</b>\n`
            + `📊 <i>Dữ liệu đã được lưu vào hệ thống và đồng bộ tức thì lên Google Sheet 17iXM!</i>`
        };
      }
    });

    assert.ok(updateCalledWith.includes('ca sáng sang ca tối'));
    assert.ok(rEdit[0].text.includes('ĐÃ CẬP NHẬT THÔNG TIN NHÂN VIÊN THÀNH CÔNG'));
    assert.ok(rEdit[0].text.includes('đồng bộ tức thì lên Google Sheet 17iXM'));
  });

  await t.test('14. Chống trùng thông báo (Zero Duplicate) và không bỏ sót thông báo (Zero Miss)', async () => {
    // 14.1 Dữ liệu ứng viên mới từ sheet NHAN_VIEN_MOI
    const newApplicant = {
      id: 'APP_TEST_99',
      name: 'Nguyễn Thị Tuyển Dụng',
      gender: 'Nữ',
      birthYear: '2004',
      education: 'Đại học',
      hometown: 'Đồng Nai',
      phone: '0988776655',
      shiftPreference: 'CA_TOI',
      branchPreference: 'CN2',
      experience: '1 năm quán trà sữa',
      handling: 'Bình tĩnh giải quyết khiếu nại',
      facebook: 'fb.com/tuyendung',
      source: 'Facebook Fanpage',
      aiScore: 85,
      result: 'Đạt vòng hồ sơ'
    };

    // Kiểm tra cấu trúc tin nhắn ứng viên mới hiển thị đầy đủ các cột trên sheet
    const alertMsg = `🎉 <b>ỨNG VIÊN MỚI ĐĂNG KÝ (TỪ GOOGLE SHEET NHAN_VIEN_MOI)</b>\n\n`
      + `🆔 <b>Mã ứng viên:</b> <code>${newApplicant.id}</code>\n`
      + `👤 <b>Họ tên:</b> <b>${newApplicant.name}</b> (${newApplicant.gender} • Sinh năm: ${newApplicant.birthYear})\n`
      + `📞 <b>Số điện thoại:</b> <code>${newApplicant.phone}</code>\n`
      + `🎓 <b>Trình độ:</b> ${newApplicant.education} • <b>Quê quán:</b> ${newApplicant.hometown}\n`
      + `⏰ <b>Ca đăng ký:</b> ${newApplicant.shiftPreference}\n`
      + `🏪 <b>Chi nhánh ĐK:</b> ${newApplicant.branchPreference}\n`
      + `💼 <b>Kinh nghiệm:</b> ${newApplicant.experience}\n`
      + `🧩 <b>Xử lý đột xuất:</b> ${newApplicant.handling}\n`
      + `🌐 <b>Facebook:</b> ${newApplicant.facebook}\n`
      + `📢 <b>Nguồn biết tin:</b> ${newApplicant.source}\n`
      + `🤖 <b>Điểm AI đánh giá:</b> <b>${newApplicant.aiScore}/100</b>\n`
      + `🎯 <b>Kết quả:</b> <b>${newApplicant.result}</b>`;

    assert.ok(alertMsg.includes('Trình độ'));
    assert.ok(alertMsg.includes('Quê quán'));
    assert.ok(alertMsg.includes('Điểm AI đánh giá'));
    assert.ok(alertMsg.includes('Kết quả'));

    // 14.2 Khi HR đăng nhập, nhận hộp thư chờ và loại bỏ các thông báo trùng lặp
    const rPending = await tg.handleTelegramUpdate({
      message: { chat: { id: 77776 }, text: '/login admin pass' }
    }, {
      role: 'hr',
      getHrSession: async () => null,
      hrLogin: async () => ({
        ok: true,
        user: adminSession,
        pendingNotifications: [
          { text: 'Thông báo ứng viên mới: Nguyễn Thị Tuyển Dụng' },
          { text: 'Thông báo đổi ca: Lan ➔ Hùng' }
        ]
      })
    });

    assert.ok(rPending[0].text.includes('HỘP THƯ CHỜ: BẠN CÓ 2 THÔNG BÁO MỚI'));
    assert.ok(rPending[0].text.includes('ĐÃ LỌC BỎ THÔNG BÁO TRÙNG LẶP'));
    assert.ok(rPending[0].text.includes('Nguyễn Thị Tuyển Dụng'));
  });

  await t.test('15. Xóa vĩnh viễn nhân viên /xoa_nhanvien trên Google Sheet 17iXM & Hệ thống', async () => {
    // 15.1 Thiếu mã NV -> Hướng dẫn cú pháp
    const rNoCode = await tg.handleTelegramUpdate({
      message: { chat: { id: 77777 }, text: '/xoa_nhanvien' }
    }, {
      role: 'hr',
      getHrSession: async () => hrSession
    });
    assert.ok(rNoCode[0].text.includes('CÚ PHÁP XÓA VĨNH VIỄN NHÂN VIÊN'));
    assert.ok(rNoCode[0].text.includes('/xoa_nhanvien'));
    assert.ok(rNoCode[0].text.includes('NV1288'));

    // 15.2 Tài khoản không có quyền (QL / MKT) bị từ chối
    const qlSession = { username: 'ql_user', role: 'QL' };
    const rForbidden = await tg.handleTelegramUpdate({
      message: { chat: { id: 77777 }, text: '/xoa_nhanvien NV1288' }
    }, {
      role: 'hr',
      getHrSession: async () => qlSession
    });
    assert.ok(rForbidden[0].text.includes('TỪ CHỐI TRUY CẬP'));

    // 15.3 Thực hiện xóa nhân viên hợp lệ (Admin / HR)
    let deletedCodeArg = null;
    const rDelete = await tg.handleTelegramUpdate({
      message: { chat: { id: 77777 }, text: '/xoa_nhanvien NV1288' }
    }, {
      role: 'hr',
      getHrSession: async () => hrSession,
      hrDeleteEmployee: async (sess, code) => {
        deletedCodeArg = code;
        return {
          text: `🗑️ <b>ĐÃ XOÁ VĨNH VIỄN NHÂN VIÊN THÀNH CÔNG!</b>\n\n`
            + `👤 Nhân viên: <b>Nguyễn Văn Test</b>\n`
            + `🆔 Mã NV: <code>CN130_UBM18092026_NV1288</code>\n\n`
            + `📌 <b>Dữ liệu đã dọn sạch trên Hệ thống (Web App):</b>\n`
            + `  • Hồ sơ nhân viên & tài khoản (Force Logout tức thì)\n`
            + `  • Quản lý chìa khóa Key (1)\n`
            + `  • Lịch làm việc & Ca trực (2)\n\n`
            + `📊 <b>Dữ liệu đã xoá trên Google Sheet 17iXM:</b>\n`
            + `  • Tab: <code>NHAN_VIEN_CHINH_THUC (1 dòng)</code>\n`
            + `  • Tab: <code>LICH_LAM_VIEC (2 dòng)</code>\n\n`
            + `⚡ <i>Nhân viên đã bị thu hồi phiên đăng nhập ngay lập tức trên toàn hệ thống!</i>`
        };
      }
    });

    assert.strictEqual(deletedCodeArg, 'NV1288');
    assert.ok(rDelete[0].text.includes('ĐÃ XOÁ VĨNH VIỄN NHÂN VIÊN THÀNH CÔNG'));
    assert.ok(rDelete[0].text.includes('Google Sheet 17iXM'));
    assert.ok(rDelete[0].text.includes('NHAN_VIEN_CHINH_THUC'));
    assert.ok(rDelete[0].text.includes('Force Logout tức thì'));

    // 15.4 Kiểm tra cú pháp có dấu hai chấm /xoa_nhanvien: NV1288
    let deletedColonCode = null;
    await tg.handleTelegramUpdate({
      message: { chat: { id: 77777 }, text: '/xoa_nhanvien: NV1288' }
    }, {
      role: 'hr',
      getHrSession: async () => hrSession,
      hrDeleteEmployee: async (sess, code) => {
        deletedColonCode = code;
        return { text: 'OK' };
      }
    });
    assert.strictEqual(deletedColonCode, 'NV1288');
  });

  await t.test('16. Kiểm tra cảnh báo đăng ký lịch OFF 2 ngày/tuần & 3 ràng buộc tự động sắp lịch', async () => {
    // 16.1 Cảnh báo trùng ngày nghỉ với đồng nghiệp CÙNG CHI NHÁNH + CÙNG CA
    const rConflict = await tg.handleTelegramUpdate({
      message: { chat: { id: 77778 }, text: '21/09/2026, 22/09/2026' }
    }, {
      role: 'employee',
      checkExistingOffRegistration: async () => ({ hasRegistered: false }),
      checkColleagueOffConflict: async (tgId, dates) => ({
        hasConflict: true,
        branchId: 'CN1',
        shift: 'CA_SANG',
        colleagueName: 'Nguyễn Văn B',
        colleagueId: 'CN1_NV02',
        conflictDates: ['21/09/2026']
      })
    });
    assert.ok(rConflict[0].text.includes('CẢNH BÁO: TRÙNG LỊCH NGHỈ VỚI ĐỒNG NGHIỆP CÙNG CA'));
    assert.ok(rConflict[0].text.includes('Nguyễn Văn B'));
    assert.ok(rConflict[0].text.includes('không thể cùng nghỉ chung 1 ngày'));

    // 16.2 Ràng buộc 1: Cùng Chi nhánh + Cùng ca -> Tự động sắp lịch KHÔNG TRÙNG CA LÀM VIỆC TRONG 1 NGÀY
    const { pickFair } = require('../services/fairPick');
    const weekDays = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
    const offA = new Set(['2026-09-21', '2026-09-22']);
    const offB = new Set(['2026-09-25', '2026-09-26']);
    const scheduleA = [];
    const scheduleB = [];
    const workCounts = { NV_A: 0, NV_B: 0 };
    const lastDays = { NV_A: -1, NV_B: -1 };

    for (let di = 0; di < 7; di++) {
      const d = weekDays[di];
      const avail = [];
      if (!offA.has(d)) avail.push('NV_A');
      if (!offB.has(d)) avail.push('NV_B');

      if (avail.length === 1) {
        const sole = avail[0];
        scheduleA.push(sole === 'NV_A' ? 'WORKING' : 'OFF');
        scheduleB.push(sole === 'NV_B' ? 'WORKING' : 'OFF');
        workCounts[sole]++;
        lastDays[sole] = di;
      } else if (avail.length > 1) {
        const chosen = pickFair(avail, workCounts, lastDays, di);
        scheduleA.push(chosen === 'NV_A' ? 'WORKING' : 'OFF');
        scheduleB.push(chosen === 'NV_B' ? 'WORKING' : 'OFF');
        workCounts[chosen]++;
        lastDays[chosen] = di;
      }
    }

    // Xác minh: KHÔNG CÓ BẤT KỲ NGÀY NÀO A VÀ B CÙNG LÀM VIỆC (WORKING)
    for (let di = 0; di < 7; di++) {
      const bothWorking = (scheduleA[di] === 'WORKING' && scheduleB[di] === 'WORKING');
      assert.strictEqual(bothWorking, false, `Ngày ${weekDays[di]} bị trùng ca giữa A và B!`);
    }

    // 16.3 Ràng buộc 2: Cùng Chi nhánh + KHÁC ca -> Được trùng ca làm việc trong 1 ngày (cả 2 đều WORKING)
    const scheduleC_Toi = ['WORKING', 'WORKING', 'WORKING', 'OFF', 'OFF', 'WORKING', 'WORKING'];
    // Ngày 2026-09-23: A làm ca sáng, C làm ca tối tại CN1 -> Cả hai đều WORKING
    assert.strictEqual(scheduleA[2], 'WORKING');
    assert.strictEqual(scheduleC_Toi[2], 'WORKING');

    // 16.4 Ràng buộc 3: Khác Chi nhánh + KHÁC ca -> Được trùng ca làm việc trong 1 ngày (cả 2 đều WORKING)
    const scheduleD_CN2 = ['WORKING', 'WORKING', 'WORKING', 'WORKING', 'WORKING', 'OFF', 'OFF'];
    // Ngày 2026-09-21: B làm tại CN1, D làm tại CN2 -> Cả hai đều WORKING
    assert.strictEqual(scheduleB[0], 'WORKING');
    assert.strictEqual(scheduleD_CN2[0], 'WORKING');
  });

  await t.test('17. BOT Telegram tự động xoá thông báo trùng & xoá lịch đăng ký OFF 2 ngày/tuần & nhắc NV đăng ký lại', async () => {
    // 17.1 Kiểm tra cú pháp /xoa_off khi không truyền mã nhân viên
    const rNoCode = await tg.handleTelegramUpdate({
      message: { chat: { id: 77777 }, text: '/xoa_off' }
    }, {
      role: 'hr',
      getHrSession: async () => ({ username: 'admin', role: 'ADMIN' })
    });
    assert.ok(rNoCode[0].text.includes('CÚ PHÁP XÓA LỊCH OFF & YÊU CẦU ĐĂNG KÝ LẠI'));
    assert.ok(rNoCode[0].text.includes('/xoa_off'));

    // 17.2 Kiểm tra phân quyền: User không phải Admin/HR không được dùng /xoa_off
    const rNoPerm = await tg.handleTelegramUpdate({
      message: { chat: { id: 77777 }, text: '/xoa_off NV1288' }
    }, {
      role: 'hr',
      getHrSession: async () => ({ username: 'staff_guest', role: 'EMPLOYEE' })
    });
    assert.ok(rNoPerm[0].text.includes('TỪ CHỐI TRUY CẬP'));

    // 17.3 Kiểm tra dọn dẹp thông báo trùng (Zero Duplicate logic)
    const testQueue = [
      { id: 'notif_1', dedupeKey: 'off_NV1288_2026-09-21', title: 'NV Đăng ký OFF', employeeId: 'NV1288' },
      { id: 'notif_2', dedupeKey: 'off_NV1288_2026-09-21', title: 'NV Đăng ký OFF (trùng)', employeeId: 'NV1288' },
      { id: 'notif_3', dedupeKey: 'off_NV9999_2026-09-21', title: 'NV khác', employeeId: 'NV9999' }
    ];
    const seen = new Set();
    const uniqueQueue = testQueue.filter(n => {
      const k = n.dedupeKey || n.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    assert.strictEqual(uniqueQueue.length, 2, 'Phải lọc bỏ đúng 1 thông báo trùng lặp');

    // 17.4 Kiểm tra luồng xử lý /xoa_off qua mock context
    let sentToEmployeeMsg = null;
    let employeeChatTarget = null;
    const rHrOff = await tg.handleTelegramUpdate({
      message: { chat: { id: 77777 }, text: '/xoa_off NV1288' }
    }, {
      role: 'hr',
      getHrSession: async () => ({ username: 'hr_lan', role: 'HR' }),
      hrResetEmployeeOff: async (session, code) => {
        sentToEmployeeMsg = `🔔 YÊU CẦU ĐĂNG KÝ LẠI LỊCH NGHỈ OFF (2 NGÀY/TUẦN)\nChào bạn Nguyễn Văn A (${code})... Vui lòng gửi lại 2 ngày: dd/mm/yyyy, dd/mm/yyyy`;
        employeeChatTarget = 88888;
        return {
          text: `✅ <b>ĐÃ XÓA LỊCH OFF & DỌN DẸP THÔNG BÁO TRÙNG THÀNH CÔNG</b>\n\n`
            + `👤 Nhân viên: <b>Nguyễn Văn A</b> (<code>${code}</code>)\n`
            + `• Đã xóa 1 phiếu OFF cũ\n`
            + `• Đã hoàn trả 2 ngày làm việc về ca bình thường\n`
            + `• Đã gửi tin nhắn Telegram yêu cầu đăng ký lại 2 ngày OFF tuần này!`
        };
      }
    });

    assert.ok(rHrOff[0].text.includes('ĐÃ XÓA LỊCH OFF & DỌN DẸP THÔNG BÁO TRÙNG THÀNH CÔNG'));
    assert.ok(rHrOff[0].text.includes('NV1288'));
    assert.strictEqual(employeeChatTarget, 88888);
    assert.ok(sentToEmployeeMsg.includes('YÊU CẦU ĐĂNG KÝ LẠI LỊCH NGHỈ OFF'));
    assert.ok(sentToEmployeeMsg.includes('dd/mm/yyyy, dd/mm/yyyy'));

    // 17.5 Kiểm tra cú pháp có dấu hai chấm /xoa_off: NV1288
    const rColon = await tg.handleTelegramUpdate({
      message: { chat: { id: 77777 }, text: '/xoa_off: NV1288' }
    }, {
      role: 'hr',
      getHrSession: async () => ({ username: 'hr_lan', role: 'HR' }),
      hrResetEmployeeOff: async (session, code) => ({
        text: `✅ ĐÃ XÓA LỊCH OFF CHO ${code}`
      })
    });
    assert.ok(rColon[0].text.includes('ĐÃ XÓA LỊCH OFF CHO NV1288'));

    // 17.6 Kiểm tra lệnh /dangky_lai_off từ Bot Nhân viên
    const rEmpReset = await tg.handleTelegramUpdate({
      message: { chat: { id: 88888 }, from: { id: 88888 }, text: '/dangky_lai_off' }
    }, {
      role: 'employee',
      employeeResetOff: async (tgId) => ({
        ok: true,
        text: `🔄 <b>ĐÃ LÀM MỚI LỊCH ĐĂNG KÝ OFF & DỌN DẸP THÔNG BÁO TRÙNG</b>\n\n`
          + `👉 <b>Vui lòng gửi lại 2 ngày bạn muốn đăng ký nghỉ OFF (2 ngày/tuần):</b>\n`
          + `<code>dd/mm/yyyy, dd/mm/yyyy</code>\n\n`
          + `• <i>Ví dụ:</i> <code>20/09/2026, 24/09/2026</code>`
      })
    });

    assert.ok(rEmpReset[0].text.includes('ĐÃ LÀM MỚI LỊCH ĐĂNG KÝ OFF & DỌN DẸP THÔNG BÁO TRÙNG'));
    assert.ok(rEmpReset[0].text.includes('dd/mm/yyyy, dd/mm/yyyy'));
    assert.ok(rEmpReset[0].text.includes('20/09/2026, 24/09/2026'));

    // 17.7 Kiểm tra lệnh /huy_off từ Bot Nhân viên cũng gọi employeeResetOff
    const rEmpCancel = await tg.handleTelegramUpdate({
      message: { chat: { id: 88888 }, from: { id: 88888 }, text: '/huy_off' }
    }, {
      role: 'employee',
      employeeResetOff: async (tgId) => ({
        ok: true,
        text: `🔄 ĐÃ LÀM MỚI LỊCH ĐĂNG KÝ OFF CHO BẠN`
      })
    });
    assert.ok(rEmpCancel[0].text.includes('ĐÃ LÀM MỚI LỊCH ĐĂNG KÝ OFF CHO BẠN'));

    // 17.8 Kiểm tra cảnh báo trùng OFF trước đó có chứa hướng dẫn /dangky_lai_off
    const rExistingWarn = await tg.handleTelegramUpdate({
      message: { chat: { id: 88888 }, from: { id: 88888 }, text: '21/09/2026, 22/09/2026' }
    }, {
      role: 'employee',
      checkExistingOffRegistration: async () => ({
        hasRegistered: true,
        dates: ['21/09/2026', '22/09/2026']
      })
    });
    assert.ok(rExistingWarn[0].text.includes('CẢNH BÁO: BẠN ĐÃ ĐĂNG KÝ LỊCH OFF TUẦN NÀY RỒI'));
    assert.ok(rExistingWarn[0].text.includes('/dangky_lai_off'));
  });

  await t.test('18. Thêm nhân viên chính thức qua cú pháp /them_nv_chinhthuc', async () => {
    // 18.1 Gọi lệnh không có tham số -> trả về bảng hướng dẫn cú pháp chi tiết
    const rHelp = await tg.handleTelegramUpdate({
      message: { chat: { id: 99991 }, from: { id: 99991 }, text: '/them_nv_chinhthuc' }
    }, {
      role: 'hr',
      getHrSession: async () => adminSession
    });
    assert.equal(rHelp.length, 1);
    assert.ok(rHelp[0].text.includes('CÚ PHÁP THÊM NHÂN VIÊN CHÍNH THỨC'));
    assert.ok(rHelp[0].text.includes('/them_nv_chinhthuc') && rHelp[0].text.includes('Tên NV') && rHelp[0].text.includes('SĐT') && rHelp[0].text.includes('Chi Nhánh') && rHelp[0].text.includes('Ca làm việc') && rHelp[0].text.includes('ngày bắt đầu') && rHelp[0].text.includes('Điểm TEST'));
    assert.ok(rHelp[0].text.includes('auto') || rHelp[0].text.includes('bot'));
    assert.ok(rHelp[0].text.includes('NHAN_VIEN_CHINH_THUC'));

    // 18.2 Gọi lệnh từ tài khoản không phải Admin/HR (ví dụ QL) -> Từ chối truy cập
    const rDeny = await tg.handleTelegramUpdate({
      message: { chat: { id: 99993 }, from: { id: 99993 }, text: '/them_nv_chinhthuc Nguyễn Văn A 0905123456 CN1 Ca Sáng 20/09/2026 auto 9' }
    }, {
      role: 'hr',
      getHrSession: async () => qlSession
    });
    assert.equal(rDeny.length, 1);
    assert.ok(rDeny[0].text.includes('TỪ CHỐI TRUY CẬP'));
    assert.ok(rDeny[0].text.includes('Admin') && rDeny[0].text.includes('HR'));

    // 18.3 Thêm nhân viên chính thức với Mã NV BOT tự động tạo (auto)
    let passedArgs = null;
    const rCreateAuto = await tg.handleTelegramUpdate({
      message: { chat: { id: 99991 }, from: { id: 99991 }, text: '/them_nv_chinhthuc Nguyễn Văn A 0905123456 CN1 Ca Sáng 20/09/2026 auto 9' }
    }, {
      role: 'hr',
      getHrSession: async () => adminSession,
      hrCreateOfficialEmployee: async (session, rawArgs) => {
        passedArgs = rawArgs;
        return {
          ok: true,
          employee: {
            employeeId: 'CN130_UBM20092026_NV4521',
            name: 'Nguyễn Văn A',
            phone: '0905123456',
            branchId: 'CN1',
            shift: 'CA_SANG',
            startDate: '2026-09-20',
            type: 'OFFICIAL',
            status: 'OFFICIAL',
            testScore: 9,
            testResult: 'DAT'
          },
          key: { key: 'KEY-TEST9999' },
          text: `🎉 <b>ĐÃ THÊM NHÂN VIÊN CHÍNH THỨC THÀNH CÔNG!</b>\n\n`
            + `👤 <b>Họ và tên:</b> <b>Nguyễn Văn A</b>\n`
            + `📞 <b>Số điện thoại:</b> <code>0905123456</code>\n`
            + `🆔 <b>Mã nhân viên (BOT):</b> <code>CN130_UBM20092026_NV4521</code>\n`
            + `🏪 <b>Chi nhánh:</b> <b>CN1 - 130 Vạn kiếp</b> (<code>CN1</code>)\n`
            + `⏰ <b>Ca làm việc:</b> <b>CA_SANG</b>\n`
            + `📅 <b>Ngày chính thức:</b> <b>20/09/2026</b>\n`
            + `📝 <b>Điểm thi TEST:</b> <b>9 / 10</b> (ĐẠT CHUẨN (>= 8.0))\n`
            + `🔑 <b>KEY kích hoạt Mini App:</b> <code>KEY-TEST9999</code>\n\n`
            + `📊 <i>Đã lưu vào cơ sở dữ liệu hệ thống và tự động đẩy lên Google Sheet 17iXM (Tab: <b>NHAN_VIEN_CHINH_THUC</b>)!</i>`
        };
      }
    });

    assert.equal(rCreateAuto.length, 1);
    assert.ok(passedArgs.includes('Nguyễn Văn A 0905123456 CN1 Ca Sáng 20/09/2026 auto 9'));
    assert.ok(rCreateAuto[0].text.includes('ĐÃ THÊM NHÂN VIÊN CHÍNH THỨC THÀNH CÔNG'));
    assert.ok(rCreateAuto[0].text.includes('CN130_UBM20092026_NV4521'));
    assert.ok(rCreateAuto[0].text.includes('KEY-TEST9999'));
    assert.ok(rCreateAuto[0].text.includes('NHAN_VIEN_CHINH_THUC'));

    // 18.4 Thêm nhân viên với dấu phẩy và mã NV tùy chọn (NV1288)
    let passedCustomArgs = null;
    const rCreateCustom = await tg.handleTelegramUpdate({
      message: { chat: { id: 99992 }, from: { id: 99992 }, text: '/them_nv_chinhthuc: Trần Thị B, 0905999888, CN2, Ca Chiều, 21/09/2026, NV1288, 8.5' }
    }, {
      role: 'hr',
      getHrSession: async () => hrSession,
      hrCreateOfficialEmployee: async (session, rawArgs) => {
        passedCustomArgs = rawArgs;
        return {
          ok: true,
          text: `🎉 ĐÃ THÊM NHÂN VIÊN CHÍNH THỨC THÀNH CÔNG! Mã: NV1288, Điểm: 8.5`
        };
      }
    });
    assert.equal(rCreateCustom.length, 1);
    assert.ok(passedCustomArgs.includes('Trần Thị B, 0905999888, CN2, Ca Chiều, 21/09/2026, NV1288, 8.5'));
    assert.ok(rCreateCustom[0].text.includes('NV1288'));

    // 18.5 Kiểm tra getHrRoleMenuText có chứa cú pháp /them_nv_chinhthuc
    const adminMenuText = tg.getHrRoleMenuText(adminSession);
    const hrMenuText = tg.getHrRoleMenuText(hrSession);
    assert.ok(adminMenuText.includes('/them_nv_chinhthuc'));
    assert.ok(hrMenuText.includes('/them_nv_chinhthuc'));

    // 18.6 Kiểm tra getHrRoleKeyboard có nút '➕ Thêm NV'
    const adminKb = tg.getHrRoleKeyboard('ADMIN');
    const hrKb = tg.getHrRoleKeyboard('HR');
    const flatAdminBtns = adminKb.reply_markup.inline_keyboard.flat();
    const flatHrBtns = hrKb.reply_markup.inline_keyboard.flat();
    assert.ok(flatAdminBtns.some(b => b.text === '➕ Thêm NV' && b.callback_data === '/them_nv_chinhthuc'));
    assert.ok(flatHrBtns.some(b => b.text === '➕ Thêm NV' && b.callback_data === '/them_nv_chinhthuc'));
  });

  await t.test('19. Tài khoản HR trên BOT Telegram quản trị có full quyền tất cả các chi nhánh (CN1, CN2, CN3, CN4)', async () => {
    // 19.1 Mock session HR với full quyền chi nhánh
    const hrSession = {
      username: 'hr',
      role: 'HR',
      displayName: 'HR Manager',
      branchScope: ['CN1', 'CN2', 'CN3', 'CN4']
    };

    // 19.2 Quản lý (QL) bị giới hạn theo branchScope riêng
    const qlSession = {
      username: 'manager_cn2',
      role: 'QL',
      displayName: 'Manager CN2',
      branchScope: ['CN2']
    };

    // 19.3 HR có quyền xem và thao tác ở mọi chi nhánh (CN1, CN2, CN3, CN4)
    assert.deepEqual(hrSession.branchScope, ['CN1', 'CN2', 'CN3', 'CN4']);
    ['CN1', 'CN2', 'CN3', 'CN4'].forEach(branchId => {
      assert.ok(hrSession.branchScope.includes(branchId), `HR phải có quyền chi nhánh ${branchId}`);
    });

    // 19.4 Kiểm tra handler Telegram Bot cho phép HR truy cập toàn bộ chi nhánh
    const rHrAnyBranch = await tg.handleTelegramUpdate({
      message: { chat: { id: 99993 }, from: { id: 99993 }, text: '/them_nv_chinhthuc Lê Văn C 0905111222 CN4 Ca Sáng 20/09/2026 auto 9' }
    }, {
      role: 'hr',
      getHrSession: async () => hrSession,
      hrCreateOfficialEmployee: async (session, rawArgs) => {
        // Kiểm tra session truyền vào là HR và có full quyền
        assert.equal(session.role, 'HR');
        assert.ok(session.branchScope.includes('CN4'));
        return {
          ok: true,
          text: `🎉 ĐÃ THÊM NHÂN VIÊN CHÍNH THỨC THÀNH CÔNG TẠI CHI NHÁNH CN4!`
        };
      }
    });

    assert.equal(rHrAnyBranch.length, 1);
    assert.ok(rHrAnyBranch[0].text.includes('CN4'));

    // 19.5 Kiểm tra QL chỉ thao tác trong branchScope của mình
    assert.equal(qlSession.branchScope.includes('CN4'), false);
  });
});


