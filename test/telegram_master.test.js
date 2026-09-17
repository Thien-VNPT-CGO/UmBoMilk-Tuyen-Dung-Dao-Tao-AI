const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const TEST_CHAT = 'TEST_HRCHK_1';

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.json();
}

describe('Bot chủ HR thu thập tin từ Bot NV', () => {
  it('1. Mirror 8 sự kiện NV trong notifyAdminAndHR (static guard)', () => {
    const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    for (const a of ['checkin', 'checkout', 'register_off_training', 'register_off_official', 'emergency_request', 'training_shift_swap_off', 'shift_swap_accepted', 'off_work_swap_request']) {
      assert.ok(srv.includes(`'${a}'`), 'thiếu mirror action ' + a);
    }
    assert.ok(srv.includes('notifyHRMaster(kind'), 'thiếu gọi notifyHRMaster');
    assert.ok(srv.includes('isTestRecord(probe)'), 'phải chặn bản ghi test');
  });

  it('2. HR chats: 401/403 + upsert qua webhook HR + xóa sạch (không rò rỉ db)', async () => {
    const g0 = await fetch(`${BASE}/api/telegram/hr-chats`);
    assert.equal(g0.status, 401);
    const h = await login('hr', 'hr123');
    assert.ok(h.token);
    const g1 = await fetch(`${BASE}/api/telegram/hr-chats`, { headers: { Authorization: `Bearer ${h.token}` } });
    assert.equal(g1.status, 200);
    // giả lập 1 tin nhắn tới Bot HR -> chat tự vào danh sách nhận tin
    const w = await fetch(`${BASE}/api/telegram/webhook/hr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { chat: { id: TEST_CHAT }, from: { id: TEST_CHAT, username: 'test_hr' }, text: '/start' } }),
    });
    assert.equal(w.status, 200);
    let a = await login('admin', 'Master@@2027');
    if (!a.token) a = await login('admin', 'admin123');
    const list = await fetch(`${BASE}/api/telegram/hr-chats`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json());
    assert.ok(list.chats.some((c) => String(c.chatId) === TEST_CHAT), 'thiếu chat test vừa upsert');
    const del = await fetch(`${BASE}/api/telegram/hr-chats/${TEST_CHAT}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${a.token}` },
    }).then((r) => r.json());
    assert.equal(del.removed, 1);
    const list2 = await fetch(`${BASE}/api/telegram/hr-chats`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json());
    assert.ok(!list2.chats.some((c) => String(c.chatId) === TEST_CHAT), 'rò rỉ chat test trong db');
  });

  it('3. Công tắc notify từng loại (bật/tắt + khôi phục)', async () => {
    let a = await login('admin', 'Master@@2027');
    if (!a.token) a = await login('admin', 'admin123');
    const H = (body) => fetch(`${BASE}/api/telegram/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` }, body: JSON.stringify(body),
    }).then((r) => r.json());
    try {
      const off = await H({ notify: { checkin: false } });
      assert.equal(off.settings.notify.checkin, false);
      const on = await H({ notify: { checkin: true } });
      assert.equal(on.settings.notify.checkin, true);
    } finally {
      await H({ notify: { checkin: true, checkout: true, off: true, swap: true } });
    }
  });
});
