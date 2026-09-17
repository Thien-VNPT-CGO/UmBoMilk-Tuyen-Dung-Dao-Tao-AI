const { describe, it } = require('node:test');
const assert = require('node:assert');
const tg = require('../services/telegram');

describe('Telegram Bot — Đăng ký lịch OFF 2 ngày/tuần qua chat bot', () => {
  it('1. extractOffDates trích xuất chính xác định dạng dd/mm/yyyy', () => {
    const d1 = tg.extractOffDates('18/09/2026, 22/09/2026');
    assert.deepEqual(d1, ['2026-09-18', '2026-09-22']);

    const d2 = tg.extractOffDates('Em muốn xin nghỉ 05/10/2026 và 08/10/2026 ạ');
    assert.deepEqual(d2, ['2026-10-05', '2026-10-08']);

    const d3 = tg.extractOffDates('/off 18/09/2026, 22/09/2026');
    assert.deepEqual(d3, ['2026-09-18', '2026-09-22']);

    const d4 = tg.extractOffDates('Tin nhắn bình thường không có ngày');
    assert.deepEqual(d4, []);
  });

  it('2. isOffRegistration nhận diện tin nhắn đăng ký OFF vs tin chat thường', () => {
    // Trường hợp gửi trực tiếp 2 ngày: "18/09/2026, 22/09/2026"
    assert.equal(tg.isOffRegistration('18/09/2026, 22/09/2026'), true);
    assert.equal(tg.isOffRegistration('18/09/2026 và 22/09/2026'), true);
    assert.equal(tg.isOffRegistration('/off 18/09/2026, 22/09/2026'), true);
    assert.equal(tg.isOffRegistration('Đăng ký lịch off 18/09/2026, 22/09/2026'), true);

    // Không có ngày -> không phải đăng ký OFF trực tiếp
    assert.equal(tg.isOffRegistration('mai em xin off'), false);
    assert.equal(tg.isOffRegistration('chào bot'), false);
    assert.equal(tg.isOffRegistration('/off'), true); // lệnh /off để xem hướng dẫn cú pháp
  });

  it('3. handleTelegramUpdate gọi đúng registerOffSchedule khi nhân viên chat 2 ngày', async () => {
    let called = false;
    let passedDates = [];
    const mockCtx = {
      role: 'employee',
      registerOffSchedule: async (tgId, dates) => {
        called = true;
        passedDates = dates;
        return { text: 'ĐÃ_GHI_NHẬN_OFF_OK' };
      }
    };

    const actions = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, from: { id: 100 }, text: '18/09/2026, 22/09/2026' } },
      mockCtx
    );

    assert.equal(called, true);
    assert.deepEqual(passedDates, ['2026-09-18', '2026-09-22']);
    assert.ok(actions[0].text.includes('ĐÃ_GHI_NHẬN_OFF_OK'));
  });

  it('4. Gửi /off không kèm ngày sẽ nhận hướng dẫn cú pháp dd/mm/yyyy', async () => {
    const actions = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, from: { id: 100 }, text: '/off' } },
      { role: 'employee' }
    );
    assert.ok(actions[0].text.includes('Đăng ký lịch OFF (2 ngày/tuần)'));
    assert.ok(actions[0].text.includes('18/09/2026, 22/09/2026'));
  });

  it('5. Cú pháp thao tác nhanh /menu, /app, /doica, /baohong phản hồi chính xác', async () => {
    const m = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, from: { id: 100 }, text: '/menu' } },
      { role: 'employee', webAppUrl: 'https://x' }
    );
    assert.ok(m[0].text.includes('BẢNG CHỨC NĂNG NHANH'));
    assert.ok(m[0].extra && m[0].extra.reply_markup);

    const d = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, from: { id: 100 }, text: '/doica' } },
      { role: 'employee', webAppUrl: 'https://x' }
    );
    assert.ok(d[0].text.includes('Đổi ca'));

    const b = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, from: { id: 100 }, text: '/baohong' } },
      { role: 'employee', webAppUrl: 'https://x' }
    );
    assert.ok(b[0].text.includes('Báo hỏng'));
  });

  it('6. Cú pháp /link SĐT và số điện thoại trực tiếp gọi linkByPhone', async () => {
    let linkedPhone = '';
    const mockCtx = {
      role: 'employee',
      linkByPhone: async (tgId, username, phone) => {
        linkedPhone = phone;
        return { ok: true, label: 'Nguyễn Văn A (CN130_UBM_NV01)' };
      }
    };

    // Trường hợp /link 0842112530
    const a1 = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, from: { id: 100 }, text: '/link 0842112530' } },
      mockCtx
    );
    assert.equal(linkedPhone, '0842112530');
    assert.ok(a1[0].text.includes('Đã liên kết thành công'));

    // Trường hợp nhắn trực tiếp số điện thoại 0842112530
    linkedPhone = '';
    const a2 = await tg.handleTelegramUpdate(
      { message: { chat: { id: 100 }, from: { id: 100 }, text: '0842112530' } },
      mockCtx
    );
    assert.equal(linkedPhone, '0842112530');
    assert.ok(a2[0].text.includes('Đã liên kết thành công'));
  });

  it('7. Xử lý update.edited_message khi nhân viên sửa tin nhắn trên Telegram', async () => {
    let linkedPhone = '';
    const mockCtx = {
      role: 'employee',
      linkByPhone: async (tgId, username, phone) => {
        linkedPhone = phone;
        return { ok: true, label: 'Nguyễn Văn A (CN130_UBM_NV01)' };
      }
    };

    // Khi người dùng edit tin nhắn thành /link 0842112530
    const a = await tg.handleTelegramUpdate(
      { edited_message: { chat: { id: 100 }, from: { id: 100 }, text: '/link 0842112530' } },
      mockCtx
    );
    assert.equal(linkedPhone, '0842112530');
    assert.ok(a[0].text.includes('Đã liên kết thành công'));
  });

  it('8. Nhấn các nút chức năng (callback_query) phản hồi chat trực tiếp, không ép mở Mini App', async () => {
    const mockCtx = {
      role: 'employee',
      webAppUrl: 'https://test.app',
      getTodayStatus: async () => ({ text: '📍 TÌNH TRẠNG ĐIỂM DANH: Vào ca: ✅' }),
      getSchedule: async () => ({ text: '📅 LỊCH LÀM VIỆC 7 NGÀY TỚI: 18/09 Ca sáng' }),
      getSalary: async () => ({ text: '💰 TẠM TÍNH LƯƠNG: 5.000.000đ' })
    };

    // 1. Điểm danh
    const aDiemDanh = await tg.handleTelegramUpdate(
      { callback_query: { id: 'c1', message: { chat: { id: 100 } }, from: { id: 100 }, data: '/diemdanh' } },
      mockCtx
    );
    assert.ok(aDiemDanh[0].text.includes('ĐIỂM DANH'));
    assert.equal(aDiemDanh[0].extra?.reply_markup, undefined);

    // 2. Lịch làm
    const aLich = await tg.handleTelegramUpdate(
      { callback_query: { id: 'c2', message: { chat: { id: 100 } }, from: { id: 100 }, data: '/lich' } },
      mockCtx
    );
    assert.ok(aLich[0].text.includes('LỊCH LÀM VIỆC'));
    assert.equal(aLich[0].extra?.reply_markup, undefined);

    // 3. Đăng ký OFF
    const aOff = await tg.handleTelegramUpdate(
      { callback_query: { id: 'c3', message: { chat: { id: 100 } }, from: { id: 100 }, data: '/off' } },
      mockCtx
    );
    assert.ok(aOff[0].text.includes('Đăng ký lịch OFF'));
    assert.equal(aOff[0].extra?.reply_markup, undefined);

    // 4. Xem lương
    const aLuong = await tg.handleTelegramUpdate(
      { callback_query: { id: 'c4', message: { chat: { id: 100 } }, from: { id: 100 }, data: '/luong' } },
      mockCtx
    );
    assert.ok(aLuong[0].text.includes('LƯƠNG'));
    assert.equal(aLuong[0].extra?.reply_markup, undefined);

    // 5. Đổi ca
    const aDoiCa = await tg.handleTelegramUpdate(
      { callback_query: { id: 'c5', message: { chat: { id: 100 } }, from: { id: 100 }, data: '/doica' } },
      mockCtx
    );
    assert.ok(aDoiCa[0].text.includes('Đổi ca') || aDoiCa[0].text.includes('ĐỔI CA'));
    assert.equal(aDoiCa[0].extra?.reply_markup, undefined);

    // 6. Báo hỏng
    const aBaoHong = await tg.handleTelegramUpdate(
      { callback_query: { id: 'c6', message: { chat: { id: 100 } }, from: { id: 100 }, data: '/baohong' } },
      mockCtx
    );
    assert.ok(aBaoHong[0].text.includes('Báo hỏng') || aBaoHong[0].text.includes('BÁO HỎNG'));
    assert.equal(aBaoHong[0].extra?.reply_markup, undefined);
  });
});


