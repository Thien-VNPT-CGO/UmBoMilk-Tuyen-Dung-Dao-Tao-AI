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
});
