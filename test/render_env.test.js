const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return r.json();
}

describe('Môi trường Render (18 biến) - Realtime Binding', () => {
  let adminToken;
  before(async () => {
    let a = await login('admin', 'Master@@2027');
    if (!a || !a.token) a = await login('admin', 'admin123');
    adminToken = a.token;
    assert.ok(adminToken, 'Admin token should be present');
  });

  it('GET /api/admin/env trả đúng 18 biến môi trường chuẩn', async () => {
    const r = await fetch(`${BASE}/api/admin/env`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.total, 18);
    assert.equal(data.renderYamlCount, 18);
    assert.ok(Array.isArray(data.envList));
    assert.equal(data.envList.length, 18);
    assert.ok(typeof data.configured === 'number');
    assert.ok(typeof data.missing === 'number');
    assert.equal(data.configured + data.missing, 18);

    // Kiểm tra các biến cốt lõi
    const keys = data.envList.map(e => e.key);
    assert.ok(keys.includes('NODE_ENV'));
    assert.ok(keys.includes('GOOGLE_SHEET_SPREADSHEET_ID'));
    assert.ok(keys.includes('GOOGLE_SHEET_TARGET_DATABASE_ID'));
    assert.ok(keys.includes('GOOGLE_SERVICE_ACCOUNT_EMAIL'));
    assert.ok(keys.includes('FINANCE_MASTER_ID'));
  });

  it('POST /api/admin/env/sync ép đồng bộ realtime thành công', async () => {
    const r = await fetch(`${BASE}/api/admin/env/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.success, true);
    assert.ok(data.data);
    assert.equal(data.data.total, 18);
  });
});
