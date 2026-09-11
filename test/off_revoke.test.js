const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Admin thu hoi phieu OFF: xoa phieu + lich ve WORKING nhu chua dang ky.
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
function mondayWeeksAhead(n) {
  const d = new Date();
  const day = d.getDay();
  const m = new Date(d);
  m.setDate(d.getDate() - day + (day === 0 ? -6 : 1) + n * 7);
  m.setHours(12, 0, 0, 0);
  return m;
}
async function login(u, p) {
  let r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
  if (!r.body.token && u === 'admin') {
    r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: 'admin123' }) });
  }
  return r.body.token;
}
async function makeOfficial(adminToken, tag, branch, shift) {
  const c = await api('/api/employees', {
    method: 'POST',
    body: JSON.stringify({ name: `Revoke Test ${tag}`, phone: rndPhone(), branchId: branch, shift, category: 'STORE', isTest: true })
  }, adminToken);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const empId = c.body.employee.employeeId;
  await api(`/api/employees/${empId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);
  return empId;
}

describe('Admin thu hoi phieu OFF', () => {
  let adminToken, hrToken;

  before(async () => {
    adminToken = await login('admin', 'Master@@2027');
    hrToken = await login('hr', 'hr123');
    assert.ok(adminToken, 'admin login');
    await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: true }) }, adminToken);
  });

  after(async () => {
    try {
      await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken);
      const list = await api('/api/employees', {}, adminToken);
      for (const e of (Array.isArray(list.body) ? list.body : [])) {
        if ((e.name || '').startsWith('Revoke Test')) {
          await api(`/api/employees/${e.employeeId}?hard=true`, { method: 'DELETE' }, adminToken);
        }
      }
    } catch (_) {}
  });

  it('1. Thu hoi: lich ve WORKING + dang ky lai duoc (official)', async () => {
    const empId = await makeOfficial(adminToken, 'A', 'CN2', 'CA_CHIEU');
    const mon = mondayWeeksAhead(6);
    const weekStart = fmtLocal(mon);
    const d2 = new Date(mon); d2.setDate(d2.getDate() + 1);
    const dates = [fmtLocal(mon), fmtLocal(d2)];
    const reg = await api('/api/off-requests', { method: 'POST', body: JSON.stringify({ employeeId: empId, dates }) }, adminToken);
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    const offId = reg.body.id;
    // Dung lich tuan do voi 2 ngay OFF (mo phong trang thai sau dang ky)
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(mon); d.setDate(d.getDate() + i);
      const ds = fmtLocal(d);
      const isOff = dates.includes(ds);
      return { date: ds, dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: isOff ? 'OFF' : 'CA_CHIEU', status: isOff ? 'OFF' : 'WORKING' };
    });
    const sc = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: empId, weekStart, days }) }, adminToken);
    assert.equal(sc.status, 200, JSON.stringify(sc.body));
    // Lich da OFF
    let s = await api(`/api/schedules?employeeId=${empId}`, {}, adminToken);
    let mine = (Array.isArray(s.body) ? s.body : []).flatMap(x => x.days || []).filter(d => dates.includes(d.date));
    assert.ok(mine.length > 0 && mine.every(d => d.status === 'OFF'), 'lich phai OFF truoc thu hoi');
    // Thu hoi
    const rv = await api(`/api/off-requests/${offId}/revoke`, { method: 'POST' }, adminToken);
    assert.equal(rv.status, 200, JSON.stringify(rv.body));
    assert.ok(rv.body.restoredDays >= 1, JSON.stringify(rv.body));
    // Phieu bien mat + lich ve WORKING
    const o = await api(`/api/off-requests?employeeId=${empId}`, {}, adminToken);
    assert.equal((Array.isArray(o.body) ? o.body : []).length, 0, 'phieu phai het');
    s = await api(`/api/schedules?employeeId=${empId}`, {}, adminToken);
    mine = (Array.isArray(s.body) ? s.body : []).flatMap(x => x.days || []).filter(d => dates.includes(d.date));
    assert.ok(mine.length > 0 && mine.every(d => d.status === 'WORKING'), 'lich phai ve WORKING');
    // Dang ky lai duoc ngay lap tuc (ve mac dinh)
    const reg2 = await api('/api/off-requests', { method: 'POST', body: JSON.stringify({ employeeId: empId, dates }) }, adminToken);
    assert.equal(reg2.status, 200, JSON.stringify(reg2.body));
  });

  it('2. Training: thu hoi xoa registeredOffDates', async () => {
    const c = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'Revoke Test T', phone: rndPhone(), branchId: 'CN1', shift: 'CA_SANG', category: 'STORE', isTest: true })
    }, adminToken);
    const empId = c.body.employee.employeeId;
    // Ngay OFF phai nam trong 12 ngay trial (startDate cua NV)
    const me0 = await api('/api/employees', {}, adminToken);
    const emp0 = (Array.isArray(me0.body) ? me0.body : []).find(e => e.employeeId === empId);
    const sd = new Date((emp0.startDate || fmtLocal(new Date())).split('T')[0] + 'T12:00:00');
    const dates = [0, 1, 2, 3, 4].map(i => { const d = new Date(sd); d.setDate(d.getDate() + i); return fmtLocal(d); });
    const reg = await api('/api/employee/register-off', { method: 'POST', body: JSON.stringify({ employeeId: empId, offDates: dates }) }, adminToken);
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    const rv = await api(`/api/off-requests/${reg.body.id || reg.body.offRequest?.id}/revoke`, { method: 'POST' }, adminToken);
    // register-off co the khong tra id: lay tu list
    let offId = reg.body.id || reg.body.offRequest?.id;
    if (rv.status === 404) {
      const o = await api(`/api/off-requests?employeeId=${empId}`, {}, adminToken);
      offId = (Array.isArray(o.body) ? o.body : [])[0]?.id;
      const rv2 = await api(`/api/off-requests/${offId}/revoke`, { method: 'POST' }, adminToken);
      assert.equal(rv2.status, 200, JSON.stringify(rv2.body));
    } else {
      assert.equal(rv.status, 200, JSON.stringify(rv.body));
    }
    const me = await api('/api/employees', {}, adminToken);
    const emp = (Array.isArray(me.body) ? me.body : []).find(e => e.employeeId === empId);
    assert.ok(!emp.registeredOffDates || emp.registeredOffDates.length === 0, 'training ve chua dang ky');
  });

  it('3. Khong ton tai 404, HR 403, thieu auth 401', async () => {
    const nf = await api('/api/off-requests/nope-id/revoke', { method: 'POST' }, adminToken);
    assert.equal(nf.status, 404, JSON.stringify(nf.body));
    const f = await api('/api/off-requests/nope-id/revoke', { method: 'POST' }, hrToken);
    assert.equal(f.status, 403, JSON.stringify(f.body));
    const na = await api('/api/off-requests/nope-id/revoke', { method: 'POST' });
    assert.equal(na.status, 401, JSON.stringify(na.body));
  });

  it('4. UI co nut Thu hoi (Admin only, static guard)', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    assert.ok(js.includes('revokeOffRequest'), 'thieu ham thu hoi');
    assert.ok(js.includes('/api/off-requests/') && js.includes('/revoke'), 'thieu goi API thu hoi');
    assert.ok(js.includes('Thu hồi'), 'thieu nut Thu hoi');
  });
});
