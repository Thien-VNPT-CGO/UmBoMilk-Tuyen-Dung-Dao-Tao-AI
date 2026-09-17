const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const TEST_TG = 'TEST_AI_TG_1';
const TEST_EMP = 'TEST_AI_RELAY_1';

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.json();
}

describe('Lễ tân AI Bot NV tóm tắt tin gửi Bot chủ', () => {
  it('1. Code relay + AI caller có mặt (static guard)', () => {
    const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    for (const s of ['async function aiChat(', 'async function summarizeEmployeeMessage(', 'relayEmployeeMessage', 'TELEGRAM_CHAT_RELAY']) {
      assert.ok(srv.includes(s), 'thiếu ' + s);
    }
  });

  it('2. Tin tự do Bot NV đi qua relay (unit, không cần server)', async () => {
    const tg = require('../services/telegram');
    const a = await tg.handleTelegramUpdate(
      { message: { chat: { id: 5 }, from: { id: 5, username: 'nv' }, text: 'mai em xin off' } },
      { role: 'employee', relayEmployeeMessage: async () => ({ text: 'RELAY_OK' }) }
    );
    assert.equal(a[0].text, 'RELAY_OK');
    const h = await tg.handleTelegramUpdate(
      { message: { chat: { id: 5 }, from: { id: 5 }, text: 'hello' } },
      { role: 'hr' }
    );
    assert.ok(!h[0].text.includes('RELAY_OK'));
  });

  it('3. Live: chat chưa liên kết được hướng dẫn link, không spam HR', async () => {
    let a = await login('admin', 'Master@@2027');
    if (!a.token) a = await login('admin', 'admin123');
    assert.ok(a.token);
    // bật token giả để webhook đi hết luồng relay mà không gọi mạng thật
    const prev = await fetch(`${BASE}/api/settings`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json());
    const prevTok = (prev.settings.telegram || {}).empBotToken || '';
    try {
      await fetch(`${BASE}/api/telegram/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
        body: JSON.stringify({ empBotToken: 'TEST_DUMMY_TOKEN' }),
      });
      const chatsBefore = await fetch(`${BASE}/api/telegram/hr-chats`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json());
      const w = await fetch(`${BASE}/api/telegram/webhook/employee`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { chat: { id: 'TEST_AI_NOLINK' }, from: { id: 'TEST_AI_NOLINK' }, text: 'mai em xin off ca sang' } }),
      });
      assert.equal(w.status, 200);
      const chatsAfter = await fetch(`${BASE}/api/telegram/hr-chats`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json());
      assert.equal(chatsAfter.count, chatsBefore.count, 'chat test không được dính vào subscribers');
    } finally {
      await fetch(`${BASE}/api/telegram/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
        body: JSON.stringify({ empBotToken: prevTok }),
      });
    }
  });

  it('4. Live: NV test chat -> chặn an toàn, dọn sạch link', async () => {
    let a = await login('admin', 'Master@@2027');
    if (!a.token) a = await login('admin', 'admin123');
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` };
    // tạo NV + key test (saveDB tự lọc khi lưu đĩa)
    const emp = await fetch(`${BASE}/api/employees`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ employeeId: TEST_EMP, name: 'Test AI Relay', phone: '0909990001', branchId: 'CN2', shift: 'CA_TOI', type: 'TRAINING', status: 'TRAINING' }),
    }).then((r) => r.json()).catch(() => ({}));
    const empId = emp.employee?.employeeId || emp.employeeId || TEST_EMP;
    await fetch(`${BASE}/api/keys/generate`, { method: 'POST', headers: H, body: JSON.stringify({ employeeId: empId }) }).catch(() => {});
    const keys = await fetch(`${BASE}/api/keys`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json()).catch(() => []);
    const keyRec = (Array.isArray(keys) ? keys : []).find((k) => k.employeeId === empId);
    const prev = await fetch(`${BASE}/api/settings`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json());
    const prevTok = (prev.settings.telegram || {}).empBotToken || '';
    try {
      await fetch(`${BASE}/api/telegram/settings`, {
        method: 'PUT', headers: H, body: JSON.stringify({ empBotToken: 'TEST_DUMMY_TOKEN' }),
      });
      if (keyRec) {
        await fetch(`${BASE}/api/telegram/link`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramId: TEST_TG, employeeId: empId, key: keyRec.key }),
        });
      }
      const w = await fetch(`${BASE}/api/telegram/webhook/employee`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { chat: { id: TEST_TG }, from: { id: TEST_TG }, text: 'cho em doi ca toi mai' } }),
      });
      assert.equal(w.status, 200);
    } finally {
      await fetch(`${BASE}/api/telegram/unlink`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramId: TEST_TG }),
      }).catch(() => {});
      if (emp.id) await fetch(`${BASE}/api/employees/${emp.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${a.token}` } }).catch(() => {});
      await fetch(`${BASE}/api/telegram/settings`, {
        method: 'PUT', headers: H, body: JSON.stringify({ empBotToken: prevTok }),
      }).catch(() => {});
    }
    const links = await fetch(`${BASE}/api/telegram/links`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json());
    assert.ok(!(links.links || []).some((l) => String(l.telegramId) === TEST_TG), 'rò rỉ link test');
  });
});
