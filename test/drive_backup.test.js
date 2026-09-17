const { describe, it } = require('node:test');
const assert = require('node:assert');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.json();
}

describe('Drive auto-backup db.json (kho cấp 2, đêm 02:00 + nút bấm)', () => {
  it('1. Không token -> 401', async () => {
    const r = await fetch(`${BASE}/api/admin/drive/backup`, { method: 'POST' });
    assert.equal(r.status, 401);
  });

  it('2. HR (không phải Admin) -> 403, không đẩy gì ra ngoài', async () => {
    const h = await login('hr', 'hr123');
    assert.ok(h.token);
    const r = await fetch(`${BASE}/api/admin/drive/backup`, {
      method: 'POST', headers: { Authorization: `Bearer ${h.token}` },
    });
    assert.equal(r.status, 403);
  });

  it('3. Admin ở chế độ test -> success:false + lý do, không gọi Drive thật', async () => {
    let a = await login('admin', 'Master@@2027');
    if (!a.token) a = await login('admin', 'admin123');
    assert.ok(a.token);
    const before = await fetch(`${BASE}/api/admin/drive/backups`, {
      headers: { Authorization: `Bearer ${a.token}` },
    }).then((r) => r.json());
    const r = await fetch(`${BASE}/api/admin/drive/backup`, {
      method: 'POST', headers: { Authorization: `Bearer ${a.token}` },
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.success, false, 'test mode không được đẩy thật');
    assert.ok(j.reason, 'phải có lý do skip');
    const after = await fetch(`${BASE}/api/admin/drive/backups`, {
      headers: { Authorization: `Bearer ${a.token}` },
    }).then((r) => r.json());
    assert.equal(after.count, before.count, 'không được ghi log backup giả');
  });

  it('4. Nút Backup có mặt trên web Admin + Mini App (static guard)', async () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    const tg = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg-admin.js'), 'utf8');
    assert.ok(html.includes('backupDbToDriveNow()'), 'admin.html thiếu nút Backup Drive');
    assert.ok(js.includes('/api/admin/drive/backup'), 'admin.js thiếu gọi backup');
    assert.ok(tg.includes('/api/admin/drive/backup'), 'Mini App thiếu nút backup');
  });
});
