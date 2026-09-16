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
    body: JSON.stringify({ name: `SwapTab ${tag}`, phone: rndPhone(), branchId: branch, shift, category: 'STORE', isTest: true })
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
async function hrNotifsFor(requestId) {
  const n = await api('/api/notifications', {});
  return (Array.isArray(n.body) ? n.body : []).filter(x => x.to === 'HR' && x.data && x.data.requestId === requestId);
}
async function empNotifs(empId, type) {
  const n = await api('/api/notifications?employeeId=' + empId, {});
  return (Array.isArray(n.body) ? n.body : []).filter(x => !type || x.type === type);
}

describe('Tab Quan ly Doi Ca thong nhat (Official)', () => {
  let adminToken, empA, empB;

  before(async () => {
    adminToken = await login('admin', 'Master@@2027');
    assert.ok(adminToken, 'admin login');
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: true }) }, adminToken);
    empA = await makeOfficial(adminToken, 'A', 'CN2', 'CA_SANG');
    empB = await makeOfficial(adminToken, 'B', 'CN2', 'CA_CHIEU');
    const mon = mondayWeeksAhead(13);
    const weekStart = fmtLocal(mon);
    for (const [emp, offIdx] of [[empA, 0], [empB, 1]]) {
      const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
        const dd = new Date(mon); dd.setDate(dd.getDate() + i);
        const ds = fmtLocal(dd);
        const isOff = i === offIdx;
        return { date: ds, dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: isOff ? 'OFF' : 'CA_SANG', status: isOff ? 'OFF' : 'WORKING' };
      });
      const sc = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: emp, weekStart, days }) }, adminToken);
      assert.equal(sc.status, 200, JSON.stringify(sc.body));
    }
  });

  after(async () => {
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: true }) }, adminToken);
      for (const e of [empA, empB]) {
        if (e) await api(`/api/employees/${e}?hard=true`, { method: 'DELETE' }, adminToken);
      }
      const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.json'), 'utf8'));
      assert.ok(!(db.shiftSwapRequests || []).some(r => r.requesterId === empA || r.requesterId === empB), 'ro ri phieu test');
      assert.ok(!(db.schedules || []).some(s => s.employeeId === empA || s.employeeId === empB), 'ro ri lich test');
    } catch (_) {}
  });

  it('1. Tu doi OFF<->ca lam khong can key, bao thang Admin/HR', async () => {
    const mon = mondayWeeksAhead(13);
    const offD = new Date(mon); const workD = new Date(mon); workD.setDate(workD.getDate() + 2);
    const c = await api('/api/off-work-swap', {
      method: 'POST', body: JSON.stringify({ requesterId: empA, offDate: fmtLocal(offD), workDate: fmtLocal(workD), reason: 'Tu doi khong key' })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.request.status, 'PENDING');
    const hn = await hrNotifsFor(c.body.request.id);
    assert.ok(hn.some(n => (n.action || '').includes('off_work_swap')), 'Admin/HR phai nhan TB tu doi');
    const ap = await api(`/api/off-work-swap/${c.body.request.id}/approve`, { method: 'POST' }, adminToken);
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
  });

  it('2. Trao doi voi dong nghiep: tao khong bao Admin/HR, B dong y moi bao', async () => {
    const date = daysAhead(50);
    const c = await api('/api/shift-swap', {
      method: 'POST', body: JSON.stringify({ requesterId: empA, date, fromShift: 'CA_SANG', toShift: 'CA_CHIEU', targetEmployeeId: empB, reason: 'Trao doi test' })
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.request.status, 'PENDING_TARGET');
    const hn0 = await hrNotifsFor(c.body.request.id);
    assert.equal(hn0.length, 0, 'Admin/HR khong duoc bao khi B chua dong y: ' + JSON.stringify(hn0.map(n => n.action)));
    const inv = await empNotifs(empB, 'SHIFT_SWAP_INVITE');
    assert.ok(inv.length > 0, 'B phai nhan loi moi');
    const acc = await api(`/api/shift-swap/${c.body.request.id}/respond`, {
      method: 'POST', body: JSON.stringify({ employeeId: empB, action: 'ACCEPT' })
    });
    assert.equal(acc.status, 200, JSON.stringify(acc.body));
    assert.equal(acc.body.request.status, 'PENDING_HR');
    const before = await getDay(adminToken, empA, date);
    const hn1 = await hrNotifsFor(c.body.request.id);
    assert.ok(hn1.some(n => (n.action || '').includes('accepted')), 'Admin/HR phai nhan TB sau khi B dong y');
    const na = await empNotifs(empA, 'SHIFT_SWAP_ACCEPTED');
    assert.ok(na.length > 0, 'A phai nhan TB B dong y');
    global._tabReqId = c.body.request.id;
    global._tabReqDate = date;
  });

  it('3. Dang PENDING_HR thi tao moi bi 409, duyet xong thi mo khoa', async () => {
    const dup = await api('/api/shift-swap', {
      method: 'POST', body: JSON.stringify({ requesterId: empA, date: daysAhead(51), fromShift: 'CA_SANG', toShift: 'CA_TOI', targetEmployeeId: empB, reason: 'Bi chan' })
    });
    assert.equal(dup.status, 409, JSON.stringify(dup.body));
    const ap = await api(`/api/shift-swap/${global._tabReqId}/approve`, { method: 'POST' }, adminToken);
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal(ap.body.request.status, 'APPROVED');
    const dayA = await getDay(adminToken, empA, global._tabReqDate);
    const dayB = await getDay(adminToken, empB, global._tabReqDate);
    assert.equal(dayA.status, 'OFF', 'A OFF sau duyet');
    assert.equal(dayB.status, 'WORKING_DOUBLE', 'B 2 ca sau duyet');
    const nA = await empNotifs(empA, 'SHIFT_SWAP_APPROVED');
    const nB = await empNotifs(empB, 'SHIFT_SWAP_APPROVED');
    assert.ok(nA.length > 0 && nB.length > 0, 'A va B phai nhan TB duyet');
    const ok = await api('/api/shift-swap', {
      method: 'POST', body: JSON.stringify({ requesterId: empA, date: daysAhead(52), fromShift: 'CA_SANG', toShift: 'CA_TOI', targetEmployeeId: empB, reason: 'Sau duyet mo khoa' })
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    global._tabReqId2 = ok.body.request.id;
  });

  it('4. B tu choi -> phieu huy, A tao moi ngay duoc', async () => {
    const rej = await api(`/api/shift-swap/${global._tabReqId2}/respond`, {
      method: 'POST', body: JSON.stringify({ employeeId: empB, action: 'REJECT' })
    });
    assert.equal(rej.status, 200, JSON.stringify(rej.body));
    assert.equal(rej.body.request.status, 'CANCELLED');
    const nA = await empNotifs(empA, 'SHIFT_SWAP_CANCELLED');
    assert.ok(nA.length > 0, 'A phai nhan TB huy');
    const ok = await api('/api/shift-swap', {
      method: 'POST', body: JSON.stringify({ requesterId: empA, date: daysAhead(53), fromShift: 'CA_SANG', toShift: 'CA_TOI', targetEmployeeId: empB, reason: 'Sau huy tao moi' })
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    global._tabReqId3 = ok.body.request.id;
  });

  it('5. A tu huy phieu dang cho -> mo khoa + bao B', async () => {
    const cancel = await api(`/api/shift-swap/${global._tabReqId3}/cancel`, {
      method: 'POST', body: JSON.stringify({ employeeId: empA })
    });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
    assert.equal(cancel.body.request.status, 'CANCELLED');
    const nB = await empNotifs(empB, 'SHIFT_SWAP_CANCELLED');
    assert.ok(nB.length > 0, 'B phai nhan TB A huy');
    const again = await api(`/api/shift-swap/${global._tabReqId3}/cancel`, {
      method: 'POST', body: JSON.stringify({ employeeId: empB })
    });
    assert.equal(again.status, 403, 'B khong duoc huy phieu cua A');
    const ok = await api('/api/shift-swap', {
      method: 'POST', body: JSON.stringify({ requesterId: empA, date: daysAhead(54), fromShift: 'CA_SANG', toShift: 'CA_TOI', targetEmployeeId: empB, reason: 'Sau tu huy' })
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    await api(`/api/shift-swap/${ok.body.request.id}/cancel`, {
      method: 'POST', body: JSON.stringify({ employeeId: empA })
    });
  });

  it('6. UI tab Quan ly Doi Ca: 3 lua chon + banner + nut huy', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'employee.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(html.includes('Quản lý Đổi Ca'), 'thieu tieu de tab');
    assert.ok(html.includes('name="swapType"'), 'thieu radio 3 lua chon');
    assert.ok(html.includes('swapTypeGuide'), 'thieu huong dan');
    assert.ok(html.includes('swapDynamicForm'), 'thieu form dong');
    assert.ok(html.includes('shiftSwapPendingNote'), 'thieu banner trang thai');
    assert.ok(html.includes('Hủy yêu cầu') || js.includes('Hủy yêu cầu'), 'thieu nut huy');
    assert.ok(!html.includes('offWorkKeyBox'), 'phai bo form key cu');
    assert.ok(js.includes('renderSwapForm'), 'thieu renderSwapForm');
    assert.ok(js.includes('submitSelfSwap'), 'thieu submitSelfSwap');
    assert.ok(js.includes('submitPeerSwap'), 'thieu submitPeerSwap');
    assert.ok(js.includes('submitCoverSwap'), 'thieu submitCoverSwap');
    assert.ok(js.includes('cancelShiftSwap'), 'thieu cancelShiftSwap');
    assert.ok(js.includes('/api/shift-swap/') && js.includes('/cancel'), 'thieu goi API huy');
  });
});
