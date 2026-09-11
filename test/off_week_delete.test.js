const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Xoa lich tuan (Admin only): schedules + offRequests + go khoa, co audit.
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
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
  return r.body.token;
}

describe('Xoa lich tuan dang ky OFF (Admin)', () => {
  let adminToken, hrToken, empId;
  let weekStart;

  before(async () => {
    adminToken = await login('admin', 'Master@@2027') || await login('admin', 'admin123');
    hrToken = await login('hr', 'hr123');
    assert.ok(adminToken, 'admin login');
    assert.ok(hrToken, 'hr login');
    await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: true }) }, adminToken);
    const mon = mondayWeeksAhead(6);
    weekStart = fmtLocal(mon);
    const d2 = new Date(mon); d2.setDate(d2.getDate() + 1);
    const c = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'Del Week Test', phone: rndPhone(), branchId: 'CN3', shift: 'CA_TOI', category: 'STORE', isTest: true })
    }, adminToken);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    empId = c.body.employee.employeeId;
    await api(`/api/employees/${empId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);
    const d2s = fmtLocal(d2);
    const r = await api('/api/off-requests', {
      method: 'POST', body: JSON.stringify({ employeeId: empId, dates: [weekStart, d2s] })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // Tao lich truc tiep cho dung tuan (flow OFF tu dong chi ghi lich tuan sau)
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(mon); d.setDate(d.getDate() + i);
      return { date: fmtLocal(d), dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: 'CA_TOI', status: 'WORKING' };
    });
    const s = await api('/api/schedules', {
      method: 'POST', body: JSON.stringify({ employeeId: empId, weekStart, days })
    }, adminToken);
    assert.equal(s.status, 200, JSON.stringify(s.body));
  });

  after(async () => {
    try {
      await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken);
      if (empId) await api(`/api/employees/${empId}?hard=true`, { method: 'DELETE' }, adminToken);
    } catch (_) {}
  });

  it('1. Tuan co lich + phieu OFF truoc khi xoa', async () => {
    const s = await api(`/api/schedules?employeeId=${empId}`, {}, adminToken);
    const mine = (Array.isArray(s.body) ? s.body : []).filter(x => x.weekStart === weekStart);
    assert.ok(mine.length >= 1, 'phai co lich tuan ' + weekStart);
  });

  it('2. HR khong duoc xoa (403), thieu auth (401), sai weekStart (400)', async () => {
    const f = await api('/api/schedules/delete-week', { method: 'POST', body: JSON.stringify({ weekStart }) }, hrToken);
    assert.equal(f.status, 403, JSON.stringify(f.body));
    const na = await api('/api/schedules/delete-week', { method: 'POST', body: JSON.stringify({ weekStart }) });
    assert.equal(na.status, 401, JSON.stringify(na.body));
    const bad = await api('/api/schedules/delete-week', { method: 'POST', body: JSON.stringify({ weekStart: 'tuan-x' }) }, adminToken);
    assert.equal(bad.status, 400, JSON.stringify(bad.body));
  });

  it('3. Admin xoa: sach lich + phieu + go khoa', async () => {
    const d = await api('/api/schedules/delete-week', { method: 'POST', body: JSON.stringify({ weekStart }) }, adminToken);
    assert.equal(d.status, 200, JSON.stringify(d.body));
    assert.ok(d.body.deletedSchedules >= 1, JSON.stringify(d.body));
    assert.ok(d.body.deletedOffRequests >= 1, JSON.stringify(d.body));
    const s = await api(`/api/schedules?employeeId=${empId}`, {}, adminToken);
    const mine = (Array.isArray(s.body) ? s.body : []).filter(x => x.weekStart === weekStart);
    assert.equal(mine.length, 0, 'lich tuan phai sach');
    const o = await api(`/api/off-requests?employeeId=${empId}`, {}, adminToken);
    const mineOff = Array.isArray(o.body) ? o.body : [];
    assert.equal(mineOff.length, 0, 'phieu OFF tuan phai sach: ' + JSON.stringify(mineOff));
  });

  it('4. Admin UI co nut Xoa tuan (static guard)', async () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    assert.ok(html.includes('deleteNextWeek'), 'thieu nut Xoa tuan');
    assert.ok(js.includes('/api/schedules/delete-week'), 'thieu goi API xoa tuan');
  });
});
