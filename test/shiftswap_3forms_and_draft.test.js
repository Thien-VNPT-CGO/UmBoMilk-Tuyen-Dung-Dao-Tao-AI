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

function rndPhone() { return '093' + Math.floor(1000000 + Math.random() * 9000000); }
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
    body: JSON.stringify({ name: `Swap3Forms ${tag}`, phone: rndPhone(), branchId: branch, shift, category: 'STORE', isTest: true })
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

describe('3 Forms Shift Swap & Single Date Off-Work-Swap Verification', () => {
  let adminToken;
  const createdEmployees = [];

  before(async () => {
    adminToken = await login('admin', 'Master@@2027');
    assert.ok(adminToken, 'admin login');
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: true }) }, adminToken);
  });

  after(async () => {
    // Cleanup created test employees
    for (const id of createdEmployees) {
      try {
        await api(`/api/employees/${id}`, { method: 'DELETE' }, adminToken);
      } catch (_) {}
    }
  });

  it('1. Form 1 (Tự đổi OFF ↔ Ca làm): Ràng buộc validation (lý do bắt buộc, ngày bắt buộc)', async () => {
    const emp1 = await makeOfficial(adminToken, 'Emp1', 'CN1', 'CA_SANG');
    createdEmployees.push(emp1);
    const targetDate = daysAhead(10);

    // Missing reason
    const r1 = await api('/api/off-work-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: emp1, date: targetDate, toType: 'OFF', reason: '' })
    });
    assert.equal(r1.status, 400, 'Lý do bắt buộc');

    // Missing date
    const r2 = await api('/api/off-work-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: emp1, date: '', toType: 'OFF', reason: 'Co viec rieng' })
    });
    assert.equal(r2.status, 400, 'Ngày bắt buộc');
  });

  it('2. Form 1: Đổi ngày làm việc sang Nghỉ (OFF) -> HR duyệt -> Đổi lịch -> HR thu hồi -> Hoàn lịch', async () => {
    const emp2 = await makeOfficial(adminToken, 'Emp2', 'CN1', 'CA_SANG');
    createdEmployees.push(emp2);

    // Setup schedule for week ahead
    const m = mondayWeeksAhead(2);
    const weekStart = fmtLocal(m);
    const targetDate = daysAhead(14);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(m);
      d.setDate(m.getDate() + i);
      const ds = fmtLocal(d);
      return { date: ds, dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: 'CA_SANG', status: 'WORKING' };
    });
    const sc = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: emp2, weekStart, days }) }, adminToken);
    assert.equal(sc.status, 200, JSON.stringify(sc.body));

    // Submit switch to OFF
    const c = await api('/api/off-work-swap', {
      method: 'POST',
      body: JSON.stringify({
        requesterId: emp2,
        date: days[2].date,
        toType: 'OFF',
        reason: 'Nghi viec gia dinh can thiet'
      })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const reqId = c.body.request.id;
    assert.equal(c.body.request.toType, 'OFF');

    // HR approves
    const ap = await api(`/api/off-work-swap/${reqId}/approve`, { method: 'POST' }, adminToken);
    assert.equal(ap.status, 200, JSON.stringify(ap.body));

    let dayCheck = await getDay(adminToken, emp2, days[2].date);
    assert.equal(dayCheck.status, 'OFF');
    assert.equal(dayCheck.shift, 'OFF');

    // HR revokes (hoàn lịch)
    const rv = await api(`/api/off-work-swap/${reqId}/revoke`, { method: 'POST' }, adminToken);
    assert.equal(rv.status, 200, JSON.stringify(rv.body));
    assert.equal(rv.body.request.status, 'REVOKED');

    dayCheck = await getDay(adminToken, emp2, days[2].date);
    assert.equal(dayCheck.status, 'WORKING');
    assert.equal(dayCheck.shift, 'CA_SANG');
  });

  it('3. Form 1: Đổi ngày nghỉ (OFF) sang Ca làm (CA_TOI) -> HR duyệt -> Đổi lịch -> HR thu hồi -> Hoàn lịch', async () => {
    const emp3 = await makeOfficial(adminToken, 'Emp3', 'CN2', 'CA_CHIEU');
    createdEmployees.push(emp3);

    const m = mondayWeeksAhead(3);
    const weekStart = fmtLocal(m);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(m);
      d.setDate(m.getDate() + i);
      const ds = fmtLocal(d);
      const isOff = i === 1;
      return { date: ds, dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: isOff ? 'OFF' : 'CA_CHIEU', status: isOff ? 'OFF' : 'WORKING' };
    });
    const sc = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: emp3, weekStart, days }) }, adminToken);
    assert.equal(sc.status, 200, JSON.stringify(sc.body));

    const offDate = days[1].date;

    // Submit switch to WORKING with CA_TOI
    const c = await api('/api/off-work-swap', {
      method: 'POST',
      body: JSON.stringify({
        requesterId: emp3,
        date: offDate,
        toType: 'WORKING',
        workShift: 'CA_TOI',
        reason: 'Dang ky tang ca kiem them thu nhap'
      })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const reqId = c.body.request.id;

    // HR approves
    const ap = await api(`/api/off-work-swap/${reqId}/approve`, { method: 'POST' }, adminToken);
    assert.equal(ap.status, 200, JSON.stringify(ap.body));

    let dayCheck = await getDay(adminToken, emp3, offDate);
    assert.equal(dayCheck.status, 'WORKING');
    assert.equal(dayCheck.shift, 'CA_TOI');

    // HR revokes
    const rv = await api(`/api/off-work-swap/${reqId}/revoke`, { method: 'POST' }, adminToken);
    assert.equal(rv.status, 200, JSON.stringify(rv.body));

    dayCheck = await getDay(adminToken, emp3, offDate);
    assert.equal(dayCheck.status, 'OFF');
    assert.equal(dayCheck.shift, 'OFF');
  });

  it('4. Backward compatibility: Vẫn hỗ trợ tráo 2 ngày offDate và workDate', async () => {
    const emp4 = await makeOfficial(adminToken, 'Emp4', 'CN1', 'CA_SANG');
    createdEmployees.push(emp4);

    const m = mondayWeeksAhead(4);
    const weekStart = fmtLocal(m);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(m);
      d.setDate(m.getDate() + i);
      const ds = fmtLocal(d);
      const isOff = i === 0;
      return { date: ds, dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: isOff ? 'OFF' : 'CA_SANG', status: isOff ? 'OFF' : 'WORKING' };
    });
    await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: emp4, weekStart, days }) }, adminToken);

    const c = await api('/api/off-work-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: emp4, offDate: days[0].date, workDate: days[3].date, reason: 'Trao doi 2 ngay' })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
  });

  it('5. Form 2 linh hoat cung ngay / khac ngay: duyet ap dung dung ngay tung ben', async () => {
    const empA = await makeOfficial(adminToken, 'FlexA', 'CN3', 'CA_SANG');
    const empB = await makeOfficial(adminToken, 'FlexB', 'CN3', 'CA_CHIEU');
    createdEmployees.push(empA, empB);
    const m = mondayWeeksAhead(6);
    const weekStart = fmtLocal(m);
    for (const emp of [empA, empB]) {
      const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
        const d = new Date(m);
        d.setDate(m.getDate() + i);
        return { date: fmtLocal(d), dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: 'CA_SANG', status: 'WORKING' };
      });
      await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: emp, weekStart, days }) }, adminToken);
    }
    const dMon = new Date(m); const dWed = new Date(m); dWed.setDate(dWed.getDate() + 2);
    const dateA = fmtLocal(dMon), dateB = fmtLocal(dWed);

    const c1 = await api('/api/shift-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: empA, date: dateA, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', targetEmployeeId: empB, targetDate: dateB, reason: 'Khac ngay linh hoat' })
    });
    assert.equal(c1.status, 200, JSON.stringify(c1.body));
    assert.equal(c1.body.request.targetDate, dateB, 'phai luu targetDate');
    await api(`/api/shift-swap/${c1.body.request.id}/respond`, { method: 'POST', body: JSON.stringify({ employeeId: empB, action: 'ACCEPT' }) });
    const ap1 = await api(`/api/shift-swap/${c1.body.request.id}/approve`, { method: 'POST' }, adminToken);
    assert.equal(ap1.status, 200, JSON.stringify(ap1.body));
    const dayA1 = await getDay(adminToken, empA, dateA);
    const dayB1 = await getDay(adminToken, empB, dateB);
    assert.equal(dayA1.status, 'OFF', 'A OFF dung ngay cua A');
    assert.equal(dayB1.status, 'WORKING_DOUBLE', 'B 2 ca dung ngay cua B');
    assert.equal(dayB1.secondShift, 'CA_SANG', 'B nhan ca sang cua A');

    const c2 = await api('/api/shift-swap', {
      method: 'POST',
      body: JSON.stringify({ requesterId: empA, date: dateB, fromShift: 'CA_CHIEU', toShift: 'CA_SANG', targetEmployeeId: empB, targetDate: dateB, reason: 'Cung ngay linh hoat' })
    });
    assert.equal(c2.status, 200, JSON.stringify(c2.body));
    await api(`/api/shift-swap/${c2.body.request.id}/respond`, { method: 'POST', body: JSON.stringify({ employeeId: empB, action: 'ACCEPT' }) });
    const ap2 = await api(`/api/shift-swap/${c2.body.request.id}/approve`, { method: 'POST' }, adminToken);
    assert.equal(ap2.status, 200, JSON.stringify(ap2.body));
    const dayA2 = await getDay(adminToken, empA, dateB);
    assert.equal(dayA2.status, 'OFF', 'A OFF dung ngay chung');
  });
});
