const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const tg = require('../services/telegram');

function buildValidInitData(botToken, user = { id: 123456, first_name: 'Test' }) {
  const params = new URLSearchParams({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'test-query',
  });
  const keys = [...params.keys()].sort();
  const dcs = keys.map((k) => `${k}=${params.get(k)}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

describe('Telegram Mini App — tích hợp (giữ nguyên chức năng cũ)', () => {
  it('1. services/telegram.js verify đúng spec (valid + sai chữ ký)', () => {
    const botToken = 'TEST:bot-token-123';
    const good = buildValidInitData(botToken);
    const v = tg.verifyTelegramInitData(good, botToken);
    assert.equal(v.ok, true);
    assert.equal(v.user.id, 123456);
    const bad = tg.verifyTelegramInitData(good + 'x', botToken);
    assert.equal(bad.ok, false);
    const noTok = tg.verifyTelegramInitData(good, '');
    assert.equal(noTok.ok, false);
  });

  it('2. handleTelegramUpdate trả lời /start + /help không crash', async () => {
    const a1 = await tg.handleTelegramUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/start' } }, { webAppUrl: 'https://x/telegram' });
    assert.ok(a1.length === 1 && a1[0].chatId === 1);
    const a2 = await tg.handleTelegramUpdate({ message: { chat: { id: 1 }, from: { id: 1 }, text: '/help' } }, {});
    assert.ok(a2[0].text.includes('/link'));
  });

  it('3. public/telegram.html tồn tại + nhúng Telegram WebApp SDK + 3 cổng', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'telegram.html'), 'utf8');
    assert.ok(html.includes('telegram-web-app.js'));
    assert.ok(html.includes('/employee') && html.includes('/admin') && html.includes('/finance'));
  });

  it('4. GET /telegram trả về Mini App HTML', async () => {
    const r = await fetch(`${BASE}/telegram`);
    assert.equal(r.status, 200);
    const t = await r.text();
    assert.ok(t.includes('telegram-web-app.js'));
  });

  it('5. GET /api/telegram/config không lộ token', async () => {
    const r = await fetch(`${BASE}/api/telegram/config`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok('enabled' in j && 'botUsername' in j && 'webAppUrl' in j);
    assert.ok(!('botToken' in j), 'config public không được lộ botToken');
  });

  it('6. POST /api/telegram/auth từ chối initData giả', async () => {
    const r = await fetch(`${BASE}/api/telegram/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: 'user=%7B%7D&hash=deadbeef' }),
    });
    assert.ok([401, 503].includes(r.status));
  });

  it('7b. Mini App native đầy đủ trang (static guard, không còn iframe-only)', () => {
    const emp = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg-employee.js'), 'utf8');
    const adm = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg-admin.js'), 'utf8');
    const fin = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg-finance.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'telegram.html'), 'utf8');
    for (const p of ['emp-home', 'emp-att', 'emp-sched', 'emp-off', 'emp-sos', 'emp-swap', 'emp-learn', 'emp-notif', 'emp-device', 'emp-account', 'emp-salary']) {
      assert.ok(emp.includes(`pages['${p}']`), 'thiếu trang NV ' + p);
    }
    const boot = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg-boot.js'), 'utf8');
    assert.ok(boot.includes(`pages['emp-link']`), 'thiếu màn liên kết NV riêng');
    assert.ok(boot.includes("T.go('emp-link'"), 'Bot NV phải khóa vào màn NV riêng, không qua hub chung');
    for (const p of ['hr-home', 'hr-applicants', 'hr-emps', 'hr-sched', 'hr-approve', 'hr-attrec', 'hr-zalo', 'hr-reports', 'hr-learn', 'hr-users', 'hr-settings', 'hr-audit']) {
      assert.ok(adm.includes(`pages['${p}']`), 'thiếu trang HR ' + p);
    }
    for (const p of ['fin-home', 'fin-pay', 'fin-dp', 'fin-ksk', 'fin-daily', 'fin-cf']) {
      assert.ok(fin.includes(`pages['${p}']`), 'thiếu trang Finance ' + p);
    }
    assert.ok(html.includes('/tg/tg-core.js') && html.includes('/tg/tg-boot.js'), 'telegram.html phải nạp app native');
    assert.ok(!html.includes('<iframe'), 'Mini App thực thụ không dùng iframe');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg.css'), 'utf8');
    for (const m of ['--umb-grad', '.ripple', 'page-enter', '@keyframes', '@media (min-width:1100px)', '.tg-toast.show']) {
      assert.ok(css.includes(m), 'theme hồng thiếu hiệu ứng: ' + m);
    }
  });

  it('7. Settings masked có telegram.botToken (không lộ secret)', async () => {
    let login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Master@@2027' }),
    }).then((r) => r.json());
    if (!login.token) {
      login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      }).then((r) => r.json());
    }
    assert.ok(login.token);
    const s = await fetch(`${BASE}/api/settings`, { headers: { Authorization: `Bearer ${login.token}` } }).then((r) => r.json());
    assert.ok(s.settings.telegram, 'settings phải có khối telegram');
    const tok = s.settings.telegram.botToken || '';
    assert.ok(!tok.includes(':'), 'botToken phải masked, không lộ token thật');
  });
});
