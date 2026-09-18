const { describe, it } = require('node:test');
const assert = require('node:assert');
const tg = require('../services/telegram');

describe('Telegram Bot — /kiemtra_xoa (quyền thu hồi tin nhắn)', () => {
  const adminSession = { username: 'admin', role: 'ADMIN', displayName: 'Administrator' };
  const hrSession = { username: 'hr', role: 'HR', displayName: 'HR' };

  it('1. Non-Admin bị từ chối (HR)', async () => {
    const r = await tg.handleTelegramUpdate(
      { message: { chat: { id: 90001 }, text: '/kiemtra_xoa' } },
      { role: 'hr', getHrSession: async () => hrSession }
    );
    assert.ok(r[0].text.includes('chỉ dành cho'), 'HR phải bị từ chối');
  });

  it('2. Chưa đăng nhập -> cảnh báo đỏ', async () => {
    const r = await tg.handleTelegramUpdate(
      { message: { chat: { id: 90001 }, text: '/kiemtra_xoa' } },
      { role: 'hr', getHrSession: async () => null }
    );
    assert.ok(r[0].text.includes('CHƯA ĐĂNG NHẬP'));
  });

  it('3. Admin + mock hrTestDelete -> trả đúng kết quả', async () => {
    const r = await tg.handleTelegramUpdate(
      { message: { chat: { id: 90001 }, text: '/kiemtra_xoa' } },
      {
        role: 'hr',
        getHrSession: async () => adminSession,
        hrTestDelete: async (sess, chatId) => {
          assert.equal(chatId, 90001, 'phải truyền đúng chatId hiện tại');
          assert.equal(sess.username, 'admin');
          return { text: '✅ <b>Bot CÓ quyền thu hồi tin nhắn trên chat này.</b>' };
        }
      }
    );
    assert.ok(r[0].text.includes('CÓ quyền thu hồi'));
  });

  it('4. Admin nhưng thiếu ctx.hrTestDelete -> fallback', async () => {
    const r = await tg.handleTelegramUpdate(
      { message: { chat: { id: 90001 }, text: '/kiemtra_xoa' } },
      { role: 'hr', getHrSession: async () => adminSession }
    );
    assert.ok(r[0].text.includes('tạm thời không khả dụng'));
  });

  it('5. Menu Admin và help liệt kê /kiemtra_xoa', async () => {
    assert.ok(tg.getHrRoleMenuText(adminSession).includes('/kiemtra_xoa'), 'menu Admin phải có /kiemtra_xoa');
    assert.ok(tg.HELP_TEXTS.hr.includes('/kiemtra_xoa'), 'help HR phải có /kiemtra_xoa');
  });
});
