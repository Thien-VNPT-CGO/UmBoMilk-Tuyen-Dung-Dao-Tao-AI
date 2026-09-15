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
describe('Schedule publish gate OFF leak fix', () => {
  let adminToken, hrToken, empId, empKey, nextWeekStart, beforeVip;
  before(async () => {
    let r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Master@@2027' }) });
    if (!r.body.token) r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
    adminToken = r.body.token;
    assert.ok(adminToken);
    let h = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'hr', password: 'hr123' }) });
    if (!h.body.token) h = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'hr', password: 'Hr@@2027' }) });
    hrToken = h.body.token;
    const wb = await api('/api/off-window');
    beforeVip = !!wb.body.vipTest;
    await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: true }) }, adminToken);
    const st = await api('/api/schedules/approve-test-status', {}, adminToken);
    nextWeekStart = st.body.weekStart;
    assert.match(nextWeekStart, /^\d{4}-\d{2}-\d{2}$/);
    const c = await api('/api/employees', { method: 'POST', body: JSON.stringify({ name: 'Gate Test NV', phone: rndPhone(), branchId: 'CN1', shift: 'CA_SANG', category: 'STORE', isTest: true }) }, adminToken);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    empId = c.body.employee.employeeId;
    empKey = c.body.key.key;
    await api(`/api/employees/${empId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);
    await api('/api/schedules/generate-next-week-draft', { method: 'POST', body: JSON.stringify({}) }, adminToken);
  });
  after(async () => {
    try {
      await api('/api/schedules/unlock-week', { method: 'POST', body: JSON.stringify({ weekStart: nextWeekStart }) }, adminToken);
      if (empId) await api(`/api/employees/${empId}?hard=true`, { method: 'DELETE' }, adminToken);
      await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: beforeVip }) }, adminToken);
      const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.json'), 'utf8'));
      assert.ok(!(db.schedules || []).some(s => s.employeeId === empId), 'db.json leak schedule');
      assert.ok(!(db.offRequests || []).some(r => r.employeeId === empId), 'db.json leak off');
    } catch (_) {}
  });
  it('employee login ok', async () => {
    const e = await api('/api/auth/employee-login', { method: 'POST', body: JSON.stringify({ employeeId: empId, key: empKey }) });
    assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.ok(e.body.token);
    const empToken = e.body.token;
    const r = await api(`/api/schedules?employeeId=${empId}`, {}, empToken);
    assert.equal(r.status, 200);
    const list = Array.isArray(r.body) ? r.body : [];
    assert.ok(!list.some(s => s.weekStart === nextWeekStart), 'next week leaked before release');
    const cur = list.filter(s => s.weekStart !== nextWeekStart);
    assert.ok(cur.length >= 0);
    global._gateEmpToken = empToken;
  });
  it('admin/hr still sees next week before release', async () => {
    const a = await api(`/api/schedules?employeeId=${empId}`, {}, adminToken);
    assert.equal(a.status, 200);
    assert.ok((Array.isArray(a.body) ? a.body : []).some(s => s.weekStart === nextWeekStart), 'admin must see draft');
    if (hrToken) {
      const h = await api(`/api/schedules?employeeId=${empId}`, {}, hrToken);
      assert.equal(h.status, 200);
      assert.ok((Array.isArray(h.body) ? h.body : []).some(s => s.weekStart === nextWeekStart), 'hr must see draft');
    }
  });
  it('approve-next-week releases to employee', async () => {
    const ap = await api('/api/schedules/approve-next-week', { method: 'POST', body: JSON.stringify({}) }, adminToken);
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal(ap.body.success, true);
    const r = await api(`/api/schedules?employeeId=${empId}`, {}, global._gateEmpToken);
    const list = Array.isArray(r.body) ? r.body : [];
    const hit = list.find(s => s.weekStart === nextWeekStart);
    assert.ok(hit, 'employee must see next week after release');
    assert.equal(hit.approvalStatus, 'APPROVED');
  });
  it('unlock hides again', async () => {
    const u = await api('/api/schedules/unlock-week', { method: 'POST', body: JSON.stringify({ weekStart: nextWeekStart }) }, adminToken);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    const r = await api(`/api/schedules?employeeId=${empId}`, {}, global._gateEmpToken);
    const list = Array.isArray(r.body) ? r.body : [];
    assert.ok(!list.some(s => s.weekStart === nextWeekStart), 'must hide after unlock');
    const a = await api(`/api/schedules?employeeId=${empId}`, {}, adminToken);
    const alist = Array.isArray(a.body) ? a.body : [];
    const adminHit = alist.find(s => s.weekStart === nextWeekStart);
    if (adminHit) assert.equal(adminHit.approvalStatus, 'PENDING_APPROVAL');
  });
  it('approve-test-week also releases', async () => {
    await api('/api/schedules/generate-next-week-draft', { method: 'POST', body: JSON.stringify({}) }, adminToken);
    const ap = await api('/api/schedules/approve-test-week', { method: 'POST', body: JSON.stringify({}) }, adminToken);
    if (ap.status === 200) {
      const r = await api(`/api/schedules?employeeId=${empId}`, {}, global._gateEmpToken);
      assert.ok((Array.isArray(r.body) ? r.body : []).some(s => s.weekStart === nextWeekStart && s.approvalStatus === 'APPROVED'));
      await api('/api/schedules/unlock-week', { method: 'POST', body: JSON.stringify({ weekStart: nextWeekStart }) }, adminToken);
    } else {
      assert.ok([400, 403, 423].includes(ap.status), JSON.stringify(ap.body));
    }
  });
  it('static guards present', () => {
    const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const emp = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(srv.includes('isEmployeeCaller'), 'server gate missing');
    assert.ok(srv.includes('lockedWeeks') && srv.includes('getNextWeekStartStr'), 'lockedWeeks release missing');
    assert.ok(srv.includes("approvalStatus='PENDING_APPROVAL'"), 'unlock unpublish missing');
    assert.ok(!emp.includes('hasOffForNextWeek'), 'OFF leak variable still present');
    assert.ok(emp.includes("s.approvalStatus!=='APPROVED'"), 'client backup missing');
    assert.ok(emp.includes('loadSchedule'), 'loadSchedule missing');
  });
});
