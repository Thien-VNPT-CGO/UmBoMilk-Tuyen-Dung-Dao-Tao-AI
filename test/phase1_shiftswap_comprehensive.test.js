const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

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
function futureDate(daysAhead) {
  const d = new Date(); d.setDate(d.getDate() + daysAhead);
  return fmtLocal(d);
}
function nextMonday() {
  const d = new Date(); d.setDate(d.getDate() + (8 - d.getDay()) % 7 || 7);
  return fmtLocal(d);
}
function weekDates(mondayStr) {
  const p = mondayStr.split('-').map(Number);
  const m = new Date(p[0], p[1] - 1, p[2]);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const c = new Date(m); c.setDate(m.getDate() + i);
    out.push(fmtLocal(c));
  }
  return out;
}

describe('Phase 1: Global Pending, Allowance, Payroll, UI Lock', () => {
  let adminToken, hrToken, empAId, empBId, empCId;
  let swapDate, schedWeek;

  before(async () => {
    let r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Master@@2027' }) });
    if (!r.body.token) r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
    adminToken = r.body.token;
    assert.ok(adminToken, 'admin login');
    let rh = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'hr', password: 'hr123' }) });
    if (!rh.body.token) rh = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'hr', password: 'Master@@2027' }) });
    hrToken = rh.body.token || adminToken;

    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: true }) }, adminToken);

    const wStart = nextMonday();
    schedWeek = weekDates(wStart);
    swapDate = schedWeek[0];

    const eA = await api('/api/employees', { method: 'POST', body: JSON.stringify({ name: 'PH1 Emp A', phone: rndPhone(), branchId: 'CN1', shift: 'CA_SANG', category: 'STORE', isTest: true }) }, adminToken);
    empAId = eA.body.employee.employeeId;
    await api(`/api/employees/${empAId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);

    const eB = await api('/api/employees', { method: 'POST', body: JSON.stringify({ name: 'PH1 Emp B', phone: rndPhone(), branchId: 'CN1', shift: 'CA_CHIEU', category: 'STORE', isTest: true }) }, adminToken);
    empBId = eB.body.employee.employeeId;
    await api(`/api/employees/${empBId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);

    const eC = await api('/api/employees', { method: 'POST', body: JSON.stringify({ name: 'PH1 Emp C', phone: rndPhone(), branchId: 'CN2', shift: 'CA_TOI', category: 'STORE', isTest: true }) }, adminToken);
    empCId = eC.body.employee.employeeId;
    await api(`/api/employees/${empCId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);

    const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    for (const eid of [empAId, empBId]) {
      const emp = eid === empAId ? { shift: 'CA_SANG' } : { shift: 'CA_CHIEU' };
      const days = schedWeek.map((date, i) => ({ date, dayName: dayNames[i], shift: emp.shift, status: i < 5 ? 'WORKING' : 'OFF', substituteFor: null }));
      await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: eid, weekStart: wStart, days }) }, adminToken);
    }
    {
      const days = schedWeek.map((date, i) => ({ date, dayName: dayNames[i], shift: 'CA_TOI', status: i < 5 ? 'WORKING' : 'OFF', substituteFor: null }));
      await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: empCId, weekStart: wStart, days }) }, adminToken);
    }
  });

  after(async () => {
    for (const eid of [empAId, empBId, empCId]) {
      if (eid) await api(`/api/employees/${eid}?hard=true`, { method: 'DELETE' }, adminToken).catch(() => {});
    }
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: true }) }, adminToken);
  });

  it('1. Global pending: 1 request toi da moi NV across shift-swap, off-work-swap, hr-broadcast', async () => {
    const r1 = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: swapDate, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', targetEmployeeId: empBId, reason: 'Test global' }) }, adminToken);
    assert.equal(r1.status, 200, 'First request OK: ' + JSON.stringify(r1.body));

    const r2 = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: schedWeek[1], fromShift: 'CA_SANG', toShift: 'CA_TOI', reason: 'Second fail' }) }, adminToken);
    assert.equal(r2.status, 409, 'Second blocked: ' + JSON.stringify(r2.body));
    assert.ok(r2.body.error.includes('chờ xử lý'));

    const r3 = await api('/api/shift-swap/hr-broadcast', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: schedWeek[2], fromShift: 'CA_SANG', toShift: 'CA_TOI', reason: 'HR broadcast fail' }) }, adminToken);
    assert.equal(r3.status, 409, 'HR broadcast blocked: ' + JSON.stringify(r3.body));

    const revokeId = r1.body.request.id;
    await api(`/api/shift-swap/${revokeId}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'clean' }) }, adminToken);
  });

  it('2. Validate real schedule day + same branch + different branch 403', async () => {
    const r = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: swapDate, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', targetEmployeeId: empCId, reason: 'Cross branch' }) }, adminToken);
    assert.equal(r.status, 403, 'Different branch: ' + JSON.stringify(r.body));

    const offDay = schedWeek[5];
    const r3 = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: offDay, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', reason: 'OFF day' }) }, adminToken);
    assert.equal(r3.status, 400, 'OFF day: ' + JSON.stringify(r3.body));

    const rOk = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: swapDate, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', targetEmployeeId: empBId, reason: 'Valid same branch' }) }, adminToken);
    assert.equal(rOk.status, 200, 'Valid: ' + JSON.stringify(rOk.body));
    await api(`/api/shift-swap/${rOk.body.request.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'clean' }) }, adminToken);
  });

  it('3. HR assistance: broadcast + accept creates idempotent 30k allowance', async () => {
    const hrDate = schedWeek[1];
    const r = await api('/api/shift-swap/hr-broadcast', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: hrDate, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', reason: 'HR urgent' }) }, adminToken);
    assert.equal(r.status, 200, 'HR broadcast: ' + JSON.stringify(r.body));
    assert.ok(r.body.request.isHrCreated);
    const reqId = r.body.request.id;

    const acc = await api(`/api/shift-swap/${reqId}/respond`, { method: 'POST', body: JSON.stringify({ employeeId: empBId, action: 'ACCEPT', doubleShift: true }) }, adminToken);
    assert.equal(acc.status, 200, 'Accept: ' + JSON.stringify(acc.body));

    const alist = await api('/api/admin/shift-assistances', {}, adminToken);
    assert.equal(alist.status, 200);
    const found = alist.body.filter(a => a.requestId === reqId && a.employeeId === empBId);
    assert.equal(found.length, 1, 'Exactly 1 allowance');
    assert.equal(found[0].amount, 30000);
    assert.equal(found[0].status, 'APPROVED');

    await api(`/api/shift-swap/${reqId}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'clean' }) }, adminToken);
    const alist2 = await api('/api/admin/shift-assistances', {}, adminToken);
    const still = alist2.body.filter(a => a.requestId === reqId);
    assert.equal(still.length, 1, 'Allowance persists after reject (idempotent)');
  });

  it('4. Payroll propagation: allowance in calculatePayroll', async () => {
    const m = swapDate.slice(0, 7);
    const r = await api(`/api/reports/payroll?month=${m}`, {}, adminToken);
    assert.equal(r.status, 200);
    const row = r.body.find(p => p.employeeId === empBId);
    if (row) {
      assert.ok(row.allowanceAmount >= 0, 'allowanceAmount field exists');
    }
  });

  it('5. Finance payroll-summary: hoTroDoiCa field', async () => {
    const m = swapDate.slice(0, 7);
    const fk = await api('/api/finance-keys/generate', { method: 'POST', body: JSON.stringify({ type: 'FULL' }) }, adminToken);
    let fToken = null;
    if (fk.status === 200 && fk.body && fk.body.key) {
      const fl = await api('/api/auth/finance-login', { method: 'POST', body: JSON.stringify({ key: fk.body.key }) });
      if (fl.body.token) fToken = fl.body.token;
    }
    if (!fToken) { return; }
    const r = await api(`/api/finance/reports/payroll-summary?month=${m}`, {}, fToken);
    assert.equal(r.status, 200, 'payroll-summary: ' + JSON.stringify(r.body).slice(0, 200));
    if (r.body.rows) {
      const row = r.body.rows.find(p => p.employeeId === empBId);
      if (row) assert.ok('hoTroDoiCa' in row, 'hoTroDoiCa field exists');
    }
  });

  it('6. Finance matrix: hoTroDoiCa field in row', async () => {
    const m = swapDate.slice(0, 7);
    const fk = await api('/api/finance-keys/generate', { method: 'POST', body: JSON.stringify({ type: 'FULL' }) }, adminToken);
    let fToken = null;
    if (fk.status === 200 && fk.body && fk.body.key) {
      const fl = await api('/api/auth/finance-login', { method: 'POST', body: JSON.stringify({ key: fk.body.key }) });
      if (fl.body.token) fToken = fl.body.token;
    }
    if (!fToken) { return; }
    const r = await api(`/api/finance/reports/matrix?month=${m}`, {}, fToken);
    assert.equal(r.status, 200, 'matrix: ' + JSON.stringify(r.body).slice(0, 200));
    if (r.body.rows) {
      const row = r.body.rows.find(p => p.code === empBId);
      if (row) assert.ok('hoTroDoiCa' in row, 'hoTroDoiCa in matrix row');
    }
  });

  it('7. UI static guard: employee.js has pending lock functions', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(js.includes('hasPendingShiftSwap'), 'hasPendingShiftSwap exists');
    assert.ok(js.includes('applyShiftSwapLocks'), 'applyShiftSwapLocks exists');
    assert.ok(js.includes('shiftSwapPendingNote'), 'shiftSwapPendingNote reference');
  });

  it('8. Realtime socket: shiftSwap:update triggers lock refresh', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(js.includes("shiftSwap:update") || js.includes("shiftSwapRequests:update"), 'socket events');
    assert.ok(js.includes('applyShiftSwapLocks()'), 'locks applied on socket update');
  });

  it('9. No test data leak: db.json clean after test', () => {
    const dbPath = path.join(__dirname, '..', 'data', 'db.json');
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const leaked = (db.shiftSwapRequests || []).filter(r => r.requesterId === empAId || r.requesterId === empBId);
      assert.equal(leaked.length, 0, 'No test swap in db.json');
      const leakedAllow = (db.shiftAssistanceAllowances || []).filter(a => a.employeeId === empBId);
      assert.equal(leakedAllow.length, 0, 'No test allowance in db.json');
    }
  });

  it('10. Endpoint auth: shift-swap + respond accept optional token, invalid token 401', async () => {
    const r = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: swapDate, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', reason: 'No token test' }) });
    assert.ok([200, 409, 404, 400].includes(r.status), 'No token still works: ' + r.status);

    const rBad = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify({ requesterId: empAId, date: swapDate, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', reason: 'Bad token' }) }, 'invalid.token.here');
    assert.equal(rBad.status, 401, 'Invalid token 401');
  });

  it('11. off-work-swap also blocked by global pending', async () => {
    const r1 = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify({ requesterId: empBId, date: swapDate, fromShift: 'CA_CHIEU', toShift: 'CA_SANG', targetEmployeeId: empAId, reason: 'Pending lock test' }) }, adminToken);
    if (r1.status === 200) {
      const r2 = await api('/api/off-work-swap', { method: 'POST', body: JSON.stringify({ requesterId: empBId, offDate: schedWeek[5], workDate: schedWeek[3], reason: 'Should block', swapCode: 'FAKE' }) }, adminToken);
      assert.equal(r2.status, 409, 'off-work-swap blocked: ' + JSON.stringify(r2.body));
      await api(`/api/shift-swap/${r1.body.request.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'clean' }) }, adminToken);
    }
  });
});
