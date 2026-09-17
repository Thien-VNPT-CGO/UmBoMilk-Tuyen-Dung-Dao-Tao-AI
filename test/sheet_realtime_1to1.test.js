// test/sheet_realtime_1to1.test.js
// Kiểm thử Luồng Realtime 1:1 với Google Sheet (Không dùng Socket)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PORT = 3899;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess = null;

describe('Luồng Realtime 1:1 Google Sheet & Telegram Mini App (Không Dùng Socket)', () => {
  before(async () => {
    process.env.PORT = String(PORT);
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_OUTBOUND_SYNC = 'true';
    process.env.JWT_SECRET = 'test-secret-key-sheet-1to1-2026';
    process.env.GOOGLE_SHEET_WEBHOOK_SECRET = 'umbomilk_secret_2026';

    const { fork } = require('child_process');
    serverProcess = fork(path.join(__dirname, '..', 'server.js'), [], {
      env: { ...process.env, PORT: String(PORT) },
      silent: true
    });

    // Chờ server khởi động
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${BASE}/health`);
        if (r.ok) break;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
    }
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('1. Telegram Mini App HTML (telegram.html) không chứa thư viện socket.io', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'telegram.html'), 'utf8');
    assert.ok(!html.includes('socket.io/socket.io.js'), 'telegram.html không được nhúng socket.io');
    assert.ok(html.includes('telegram-web-app.js'), 'telegram.html phải giữ Telegram WebApp SDK');
  });

  it('2. API GET /api/sync/version trả về phiên bản CSDL phục vụ Smart Polling', async () => {
    const res = await fetch(`${BASE}/api/sync/version`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.version, 'Phải có trường version');
    assert.ok(data.timestamp, 'Phải có trường timestamp');
  });

  it('3. Inbound Webhook: Từ chối nếu sai secret', async () => {
    const res = await fetch(`${BASE}/api/sync/sheet-inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: 'wrong_secret',
        sheetName: 'NHAN_VIEN_TRAINING',
        rowNumber: 2,
        rowValues: ['id-1', 'CN261_TEST_01', 'Test User', '0901234567']
      })
    });
    assert.strictEqual(res.status, 401);
  });

  it('4. Inbound Webhook (Chiều 2: Sheet -> Web App): Sửa nhân viên trên Google Sheet cập nhật vào Web App', async () => {
    // 1. Lấy version hiện tại
    const vBefore = await fetch(`${BASE}/api/sync/version`).then(r => r.json());

    // 2. Tạo hoặc sửa nhân viên qua Sheet Inbound
    const res = await fetch(`${BASE}/api/sync/sheet-inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: 'umbomilk_secret_2026',
        sheetName: 'NHAN_VIEN_TRAINING',
        rowNumber: 2,
        rowValues: [
          'id-test-01',
          'CN261_UBM17092026_NV9999',
          'Nguyễn Văn A (Đổi từ Sheet)',
          '0908889999',
          'KEY-TEST01',
          'CN2',
          'CA_SANG',
          '2026-09-17',
          '2026-09-24',
          '7',
          'TRAINING'
        ],
        operation: 'UPDATE'
      })
    });

    assert.strictEqual(res.status, 200);
    const result = await res.json();
    assert.strictEqual(result.success, true);
    assert.ok(result.version >= vBefore.version, 'Version phải tăng hoặc giữ nguyên tiến trình');
  });

  it('5. Apps Script file có chứa trigger onSheetEditRealtime và menu cài đặt', () => {
    const gs = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'google-apps-script.gs'), 'utf8');
    assert.ok(gs.includes('function onSheetEditRealtime'), 'Phải có hàm onSheetEditRealtime');
    assert.ok(gs.includes('setupRealtimeTrigger'), 'Phải có hàm setupRealtimeTrigger');
    assert.ok(gs.includes('promptSetBackendUrl'), 'Phải có hàm promptSetBackendUrl');
  });
});
