const { describe, it } = require('node:test');
const assert = require('node:assert');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const tg = require('../services/telegram');

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.json();
}

describe('Telegram 3 Bot (HR/NV/KT) + HR quản lý Bot NV', () => {
  it('1. HELP_TEXTS phân biệt 3 vai trò', () => {
    assert.ok(tg.HELP_TEXTS.hr.includes('/duyet'));
    assert.ok(tg.HELP_TEXTS.employee.includes('/link'));
    assert.ok(tg.HELP_TEXTS.finance.includes('/luong'));
    assert.deepEqual(tg.BOT_ROLES, ['hr', 'employee', 'finance']);
  });

  it('2. Lệnh theo vai trò (/duyet HR, /diemdanh NV, /broadcast)', async () => {
    const hr = await tg.handleTelegramUpdate(
      { message: { chat: { id: 1 }, from: { id: 1 }, text: '/duyet' } },
      { role: 'hr', getPendingCounts: async () => ({ text: 'PENDING: 3' }) }
    );
    assert.ok(hr[0].text.includes('PENDING'));
    const bc = await tg.handleTelegramUpdate(
      { message: { chat: { id: 1 }, from: { id: 9 }, text: '/broadcast chào' } },
      { role: 'hr', broadcastToEmployees: async () => ({ text: 'Đã gửi tới 5' }) }
    );
    assert.ok(bc[0].text.includes('5'));
    const att = await tg.handleTelegramUpdate(
      { message: { chat: { id: 2 }, from: { id: 2 }, text: '/diemdanh' } },
      { role: 'employee', getTodayStatus: async () => ({ text: 'Vào ca: ✅' }) }
    );
    assert.ok(att[0].text.includes('Vào ca'));
  });

  it('3. GET 3 Mini App URL đều 200, không iframe', async () => {
    for (const p of ['/telegram', '/tg-hr', '/tg-employee', '/tg-finance']) {
      const r = await fetch(`${BASE}${p}`);
      assert.equal(r.status, 200, p);
      const t = await r.text();
      assert.ok(t.includes('/tg/tg-boot.js'), p + ' thiếu app native');
    }
  });

  it('4. Config theo role không lộ token', async () => {
    for (const role of ['hr', 'employee', 'finance']) {
      const j = await fetch(`${BASE}/api/telegram/config?role=${role}`).then((r) => r.json());
      assert.equal(j.role, role);
      assert.ok(!('botToken' in j) && !('empBotToken' in j) && !('finBotToken' in j));
      assert.ok(Array.isArray(j.bots) && j.bots.length === 3);
    }
  });

  it('5. Webhook 3 bot nhận update không crash (kể cả khi chưa có token)', async () => {
    for (const role of ['hr', 'employee', 'finance']) {
      const r = await fetch(`${BASE}/api/telegram/webhook/${role}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { chat: { id: 1 }, text: '/start' } }),
      });
      assert.equal(r.status, 200, role);
    }
  });

  it('6. setup-bots + emp-broadcast yêu cầu Admin (401 không token)', async () => {
    const s = await fetch(`${BASE}/api/telegram/setup-bots`, { method: 'POST' });
    assert.equal(s.status, 401);
    const b = await fetch(`${BASE}/api/telegram/emp-broadcast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x' }),
    });
    assert.equal(b.status, 401);
  });

  it('7. HR gọi emp-broadcast ở test mode không gửi thật', async () => {
    let a = await login('admin', 'Master@@2027');
    if (!a.token) a = await login('admin', 'admin123');
    assert.ok(a.token);
    const r = await fetch(`${BASE}/api/telegram/emp-broadcast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ text: 'test broadcast' }),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, false, 'test mode không được gửi thật');
  });
});
