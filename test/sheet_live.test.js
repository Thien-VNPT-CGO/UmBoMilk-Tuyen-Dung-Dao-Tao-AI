const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';

describe('Sheet là sự thật: đọc live đúng tab đúng cột', () => {
  it('1. Không token -> 401', async () => {
    const r = await fetch(`${BASE}/api/sheet/live/NHAN_VIEN_TRAINING`);
    assert.equal(r.status, 401);
  });

  it('2. Tab lạ -> 400', async () => {
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
    const r = await fetch(`${BASE}/api/sheet/live/TAB_BAY`, {
      headers: { Authorization: `Bearer ${a.token}` },
    });
    assert.equal(r.status, 400);
  });

  it('3. Test mode thiếu SA thật -> ok:false, không gọi Google', async () => {
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
    const j = await fetch(`${BASE}/api/sheet/live/NHAN_VIEN_TRAINING`, {
      headers: { Authorization: `Bearer ${a.token}` },
    }).then((r) => r.json());
    assert.equal(j.ok, false);
    assert.ok(j.reason);
  });

  it('4. Pull chịu được tab thiếu cột SĐT + client có nút Sheet trực tiếp (static)', () => {
    const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(srv.includes('SHEET_LIVE_TABS'), 'thiếu allowlist tab live');
    assert.ok(srv.includes('hasPhone?'), 'pull phải chịu tab thiếu cột SĐT');
    const core = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg-core.js'), 'utf8');
    assert.ok(core.includes('async function sheetLive('), 'thiếu helper sheetLive');
    const adm = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg-admin.js'), 'utf8');
    assert.ok(adm.includes('data-live'), 'hr-emps thiếu nút Sheet trực tiếp');
    const emp = fs.readFileSync(path.join(__dirname, '..', 'public', 'tg', 'tg-employee.js'), 'utf8');
    assert.ok(emp.includes('data-schedlive'), 'emp-sched thiếu nút lịch Sheet trực tiếp');
  });
});
