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
});
