const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Admin/HR thu hoi phieu doi ca NV Chinh thuc: lich hoan ve nhu truoc khi duyet.
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
function daysAhead(n) { const d = new Date(); d.setDate(d.getDate() + n); return fmtLocal(d); }
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
    body: JSON.stringify({ name: `SwapRevoke ${tag}`, phone: rndPhone(), branchId: branch, shift, category: 'STORE', isTest: true })
  }, adminToken);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const empId = c.body.employee.employeeId;
  await api(`/api/employees/${empId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);
  return empId;
}
async function getDay(adminToken, empId, date) {
  const s = await api(`/api/schedules?employeeId=${empId}`, {}, adminToken);
  const days = (Array.isArray(s.body) ? s.body : []).flatMap(x => x.days || []);
  return days.find(d => d.date === date);
}

describe('Admin/HR thu hoi phieu doi ca (hoan lich)', () => {
  let adminToken, hrToken;

  before(async () => {
    adminToken = await login('admin', 'Master@@2027');
    hrToken = await login('hr', 'hr123');
    assert.ok(adminToken, 'admin login');
    assert.ok(hrToken, 'hr login');
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: true }) }, adminToken);
  });

  after(async () => {
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: false }) }, adminToken);
      const list = await api('/api/employees', {}, adminToken);
      for (const e of (Array.isArray(list.body) ? list.body : [])) {
        if ((e.name || '').startsWith('SwapRevoke')) {
          await api(`/api/employees/${e.employeeId}?hard=true`, { method: 'DELETE' }, adminToken);
        }
      }
    } catch (_) {}
  });

  it('1. TH1 doi ca truc tiep + thu hoi: lich 2 NV hoan ve (snapshot)', async () => {
    const empA = await makeOfficial(adminToken, 'A', 'CN2', 'CA_SANG');
    const empB = await makeOfficial(adminToken, 'B', 'CN2', 'CA_CHIEU');
    const date = daysAhead(30);
    const c = await api('/api/shift-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: empA, date, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', targetEmployeeId: empB, reason: 'Revoke test TH1' })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const reqId = c.body.request.id;
    // B chap nhan -> APPROVED + lich 2 NV doi
    const acc = await api(`/api/shift-swap/${reqId}/respond`, {
      method: 'POST', body: JSON.stringify({ employeeId: empB, action: 'ACCEPT' })
    });
    assert.equal(acc.status, 200, JSON.stringify(acc.body));
    assert.equal(acc.body.request.status, 'APPROVED');
    assert.ok(Array.isArray(acc.body.request.beforeSchedule) && acc.body.request.beforeSchedule.length === 2, 'phai co snapshot 2 ngay: ' + JSON.stringify(acc.body.request.beforeSchedule));
    let dayA = await getDay(adminToken, empA, date);
    let dayB = await getDay(adminToken, empB, date);
    assert.equal(dayA.status, 'OFF', 'A phai OFF');
    assert.equal(dayA.substituteFor, empB, 'A ghi nguoi thay B');
    assert.equal(dayB.status, 'WORKING_DOUBLE', 'B phai 2 ca');
    assert.equal(dayB.secondShift, 'CA_SANG', 'B them ca sang cua A');
    // Admin thu hoi
    const rv = await api(`/api/shift-swap/${reqId}/revoke`, { method: 'POST' }, adminToken);
    assert.equal(rv.status, 200, JSON.stringify(rv.body));
    assert.equal(rv.body.request.status, 'REVOKED');
    assert.ok((rv.body.revertedDays || 0) >= 2, JSON.stringify(rv.body));
    dayA = await getDay(adminToken, empA, date);
    dayB = await getDay(adminToken, empB, date);
    assert.equal(dayA.status, 'WORKING', 'A ve lam');
    assert.equal(dayA.shift, 'CA_SANG', 'A ve ca sang');
    assert.ok(!dayA.substituteFor && !dayA.secondShift && !dayA.doubleShiftGiven, 'A sach dau swap');
    assert.equal(dayB.status, 'WORKING', 'B ve 1 ca');
    assert.equal(dayB.shift, 'CA_CHIEU', 'B ve ca chieu');
    assert.ok(!dayB.secondShift && !dayB.substituteFor && !dayB.doubleShiftInfo, 'B sach dau swap');
    // Thu hoi lan 2 -> 400
    const rv2 = await api(`/api/shift-swap/${reqId}/revoke`, { method: 'POST' }, adminToken);
    assert.equal(rv2.status, 400, JSON.stringify(rv2.body));
  });

  it('2. HR duyet broadcast + HR thu hoi: lich ve ca goc', async () => {
    const empC = await makeOfficial(adminToken, 'C', 'CN2', 'CA_SANG');
    const mon = mondayWeeksAhead(9);
    const weekStart = fmtLocal(mon);
    const d = new Date(mon); d.setDate(d.getDate() + 2);
    const date = fmtLocal(d);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const dd = new Date(mon); dd.setDate(dd.getDate() + i);
      return { date: fmtLocal(dd), dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: 'CA_SANG', status: 'WORKING' };
    });
    const sc = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: empC, weekStart, days }) }, adminToken);
    assert.equal(sc.status, 200, JSON.stringify(sc.body));
    const c = await api('/api/shift-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: empC, date, fromShift: 'CA_SANG', toShift: 'CA_TOI', reason: 'Revoke test HR' })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const reqId = c.body.request.id;
    const ap = await api(`/api/shift-swap/${reqId}/approve`, { method: 'POST' }, hrToken);
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    let day = await getDay(adminToken, empC, date);
    assert.equal(day.shift, 'CA_TOI', 'sau duyet phai ca toi');
    // HR thu hoi (quyen HR duoc phep)
    const rv = await api(`/api/shift-swap/${reqId}/revoke`, { method: 'POST' }, hrToken);
    assert.equal(rv.status, 200, JSON.stringify(rv.body));
    assert.equal(rv.body.request.status, 'REVOKED');
    day = await getDay(adminToken, empC, date);
    assert.equal(day.shift, 'CA_SANG', 'sau thu hoi ve ca sang');
    assert.equal(day.status, 'WORKING', 'sau thu hoi van lam');
    assert.ok(!day.substituteFor, 'sach substituteFor');
  });

  it('3. OFF<->ca lam: duyet roi thu hoi lat ve (snapshot + flip)', async () => {
    const empD = await makeOfficial(adminToken, 'D', 'CN2', 'CA_CHIEU');
    const mon = mondayWeeksAhead(11);
    const weekStart = fmtLocal(mon);
    const dOff = new Date(mon);
    const dWork = new Date(mon); dWork.setDate(dWork.getDate() + 1);
    const offDate = fmtLocal(dOff), workDate = fmtLocal(dWork);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const dd = new Date(mon); dd.setDate(dd.getDate() + i);
      const ds = fmtLocal(dd);
      const isOff = ds === offDate;
      return { date: ds, dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: isOff ? 'OFF' : 'CA_CHIEU', status: isOff ? 'OFF' : 'WORKING' };
    });
    const sc = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: empD, weekStart, days }) }, adminToken);
    assert.equal(sc.status, 200, JSON.stringify(sc.body));
    const k = await api('/api/swap-keys', { method: 'POST', body: JSON.stringify({ employeeId: empD }) }, adminToken);
    assert.equal(k.status, 200, JSON.stringify(k.body));
    const c = await api('/api/off-work-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: empD, offDate, workDate, reason: 'Revoke test off-work', swapCode: k.body.key.code })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const reqId = c.body.request.id;
    const ap = await api(`/api/off-work-swap/${reqId}/approve`, { method: 'POST' }, adminToken);
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    let d1 = await getDay(adminToken, empD, offDate);
    let d2 = await getDay(adminToken, empD, workDate);
    assert.equal(d1.status, 'WORKING', 'offDate thanh lam sau duyet');
    assert.equal(d2.status, 'OFF', 'workDate thanh OFF sau duyet');
    // Thu hoi
    const rv = await api(`/api/off-work-swap/${reqId}/revoke`, { method: 'POST' }, adminToken);
    assert.equal(rv.status, 200, JSON.stringify(rv.body));
    assert.equal(rv.body.request.status, 'REVOKED');
    assert.equal(rv.body.revertedDays, 2, JSON.stringify(rv.body));
    d1 = await getDay(adminToken, empD, offDate);
    d2 = await getDay(adminToken, empD, workDate);
    assert.equal(d1.status, 'OFF', 'offDate ve OFF');
    assert.equal(d2.status, 'WORKING', 'workDate ve lam');
    assert.equal(d2.shift, 'CA_CHIEU', 'workDate ve dung ca');
  });

  it('4. Guard: 404 / 400 / 401 + thu hoi phieu PENDING khong doi lich', async () => {
    const nf = await api('/api/shift-swap/nope-id/revoke', { method: 'POST' }, adminToken);
    assert.equal(nf.status, 404, JSON.stringify(nf.body));
    const nf2 = await api('/api/off-work-swap/nope-id/revoke', { method: 'POST' }, adminToken);
    assert.equal(nf2.status, 404, JSON.stringify(nf2.body));
    const na = await api('/api/shift-swap/nope-id/revoke', { method: 'POST' });
    assert.equal(na.status, 401, JSON.stringify(na.body));
    // Phieu PENDING thu hoi duoc, khong doi lich
    const empE = await makeOfficial(adminToken, 'E', 'CN2', 'CA_SANG');
    const date = daysAhead(40);
    const c = await api('/api/shift-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: empE, date, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', reason: 'Revoke pending test' })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const rv = await api(`/api/shift-swap/${c.body.request.id}/revoke`, { method: 'POST' }, adminToken);
    assert.equal(rv.status, 200, JSON.stringify(rv.body));
    assert.equal(rv.body.request.status, 'REVOKED');
    assert.equal(rv.body.revertedDays || 0, 0, 'PENDING khong doi lich');
  });

  it('5. UI co nut Thu hoi + realtime phieu doi ca 2 dau', () => {
    const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    assert.ok(admin.includes('Thu hồi (hoàn lịch)'), 'thieu nut Thu hoi');
    assert.ok(admin.includes("'revoke'"), 'thieu action revoke');
    assert.ok(admin.includes("active==='shiftSwap'"), 'tab shiftSwap phai realtime reload');
    const emp = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(emp.includes('shiftSwap:update'), 'NV phai nghe shiftSwap:update');
    assert.ok(emp.includes('tab-shiftSwap'), 'NV phai refresh tab-shiftSwap');
    assert.ok(admin.includes('restoreWeek0914'), 'thieu ham restoreWeek0914');
    assert.ok(admin.includes('/api/admin/db/restore-week-2026-09-14'), 'thieu goi API restore tuan');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    assert.ok(html.includes('restoreWeek0914()'), 'thieu nut Khoi phuc lich tuan 14-20/09');
  });

  it('6. Du lieu test khong ro ri vao db.json', async () => {
    const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.json'), 'utf8'));
    const tickets = (db.shiftSwapRequests || []).filter(x => (x.requesterName || '').startsWith('SwapRevoke'));
    assert.equal(tickets.length, 0, 'db.json khong duoc dinh phieu test');
  });
});
