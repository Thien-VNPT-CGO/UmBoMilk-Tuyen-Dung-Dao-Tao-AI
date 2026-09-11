const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Chong ro ri test vao phieu doi ca (saveDB filter shiftSwapRequests/trainingShiftRequests).
const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const H = { 'Content-Type': 'application/json', 'x-is-test': 'true' };

async function api(p, opts = {}, token) {
  const headers = { ...H, ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { ...opts, headers });
  let j = {};
  try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}
function rndPhone() { return '090' + Math.floor(1000000 + Math.random() * 9000000); }
function fmtLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Chong ro ri test vao phieu doi ca', () => {
  let adminToken, empId, reqId;

  before(async () => {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Master@@2027' }) });
    adminToken = r.body.token || (await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).body.token;
    assert.ok(adminToken, 'admin login');
  });

  after(async () => {
    try {
      if (empId) await api(`/api/employees/${empId}?hard=true`, { method: 'DELETE' }, adminToken);
    } catch (_) {}
  });

  it('1. Tao phieu doi ca test -> realtime thay, file db.json sach', async () => {
    const c = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'Swap Test Guard', phone: rndPhone(), branchId: 'CN2', shift: 'CA_SANG', category: 'STORE', isTest: true })
    }, adminToken);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    empId = c.body.employee.employeeId;
    await api(`/api/employees/${empId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);
    const d = new Date(); d.setDate(d.getDate() + 30);
    const r = await api('/api/shift-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: empId, date: fmtLocal(d), fromShift: 'CA_SANG', toShift: 'CA_CHIEU', reason: 'Test guard' })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    reqId = r.body.request?.id || r.body.id;
    assert.ok(reqId, 'phai co id phieu: ' + JSON.stringify(r.body));
    // Realtime: API van tra ve
    const g = await api(`/api/shift-swap?employeeId=${empId}`, {}, adminToken);
    assert.ok((Array.isArray(g.body) ? g.body : []).some(x => x.id === reqId), 'API phai thay phieu');
    // File: da loc sach test
    const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.json'), 'utf8'));
    assert.ok(!(db.shiftSwapRequests || []).some(x => x.id === reqId), 'db.json khong duoc dinh phieu test');
  });
});
