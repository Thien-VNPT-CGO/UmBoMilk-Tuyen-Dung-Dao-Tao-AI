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

describe('Admin nạp lại DB từ đĩa (scp db.json -> reload, khỏi restart)', () => {
  it('1. Không token -> 401', async () => {
    const r = await fetch(`${BASE}/api/admin/db/reload`, { method: 'POST' });
    assert.equal(r.status, 401);
  });

  it('2. HR (không phải Admin) -> 403', async () => {
    const h = await login('hr', 'hr123');
    assert.ok(h.token);
    const r = await fetch(`${BASE}/api/admin/db/reload`, {
      method: 'POST', headers: { Authorization: `Bearer ${h.token}` },
    });
    assert.equal(r.status, 403);
  });

  it('3. Admin reload cùng file -> 200, số liệu nhất quán, không mất dữ liệu', async () => {
    let a = await login('admin', 'Master@@2027');
    if (!a.token) a = await login('admin', 'admin123');
    assert.ok(a.token);
    const before = await fetch(`${BASE}/health`).then((r) => r.json());
    const r = await fetch(`${BASE}/api/admin/db/reload`, {
      method: 'POST', headers: { Authorization: `Bearer ${a.token}` },
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.success, true);
    assert.ok(j.employees >= 0 && j.keys >= 0);
    const after = await fetch(`${BASE}/health`).then((r) => r.json());
    assert.equal(after.employees, before.employees, 'reload cùng file không được đổi số NV');
    assert.equal(after.employees, j.employees);
  });
});
