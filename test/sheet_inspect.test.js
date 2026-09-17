const { describe, it } = require('node:test');
const assert = require('node:assert');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';

describe('Kiểm tra Sheet nguồn (read-only, không đụng DB)', () => {
  it('1. Không token -> 401', async () => {
    const r = await fetch(`${BASE}/api/admin/sheet/inspect`);
    assert.equal(r.status, 401);
  });

  it('2. Admin ở test mode -> ok:false + lý do, không gọi Google thật', async () => {
    let a = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Master@@2027' }),
    }).then((r) => r.json());
    if (!a.token) {
      a = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      }).then((r) => r.json());
    }
    assert.ok(a.token);
    const j = await fetch(`${BASE}/api/admin/sheet/inspect`, {
      headers: { Authorization: `Bearer ${a.token}` },
    }).then((r) => r.json());
    assert.equal(j.ok, false, 'test mode thiếu ServiceAccount thật');
    assert.ok(j.reason, 'phải có lý do');
  });
});
