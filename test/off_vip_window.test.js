const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// VIP test OFF 2 ngay/tuan (Master: Admin bat -> NV chinh thuc dang ky moi luc,
// giu nguyen TH1/TH2; tat -> ve khung T6 12:00-T7 15:00) + gio VN.
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
function isoDay(d) { return d.toISOString().slice(0, 10); }
function mondayWeeksAhead(n) {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + n * 7;
  const m = new Date(d);
  m.setDate(diff);
  return m;
}

describe('VIP test OFF 2 ngay/tuan + gio VN', () => {
  let adminToken;
  let empId;

  before(async () => {
    const r = await api('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Master@@2027' })
    });
    let j = r.body;
    if (!j.token) {
      const r2 = await api('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123' })
      });
      j = r2.body;
    }
    adminToken = j.token;
    assert.ok(adminToken, 'admin login');
    // Tat VIP de bat dau tu trang thai chuan
    await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken);
  });

  after(async () => {
    try {
      await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken);
      if (empId) await api(`/api/employees/${empId}?hard=true`, { method: 'DELETE' }, adminToken);
    } catch (_) {}
  });

  it('1. Tao NV chinh thuc (test) de dang ky OFF', async () => {
    const c = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'VIP OFF Test', phone: rndPhone(), branchId: 'CN1', shift: 'CA_SANG', category: 'STORE', isTest: true })
    }, adminToken);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    empId = c.body.employee.employeeId;
    const u = await api(`/api/employees/${empId}`, {
      method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' })
    }, adminToken);
    assert.equal(u.status, 200, JSON.stringify(u.body));
  });

  it('2. Admin bat VIP -> off-window mo + vipTest true', async () => {
    const t = await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: true }) }, adminToken);
    assert.equal(t.status, 200, JSON.stringify(t.body));
    const w = await api('/api/off-window');
    assert.equal(w.body.vipTest, true, JSON.stringify(w.body));
    assert.equal(w.body.isOpen, true, JSON.stringify(w.body));
  });

  it('3. VIP bat: NV chinh thuc dang ky 2 ngay OFF thanh cong (ngoai khung gio van duoc)', async () => {
    const mon = mondayWeeksAhead(4);
    const d1 = new Date(mon); const d2 = new Date(mon); d2.setDate(d2.getDate() + 1);
    const r = await api('/api/off-requests', {
      method: 'POST', body: JSON.stringify({ employeeId: empId, dates: [isoDay(d1), isoDay(d2)] })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'APPROVED');
  });

  it('4. TH1 van giu khi VIP bat: trung CN+ca bi 409', async () => {
    // Dung ngay da co nguoi OFF? Tao NV2 cung CN+ca dang ky trung ngay voi NV1
    const c = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'VIP OFF Test 2', phone: rndPhone(), branchId: 'CN1', shift: 'CA_SANG', category: 'STORE', isTest: true })
    }, adminToken);
    const emp2 = c.body.employee.employeeId;
    await api(`/api/employees/${emp2}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);
    const mon = mondayWeeksAhead(4);
    const d1 = new Date(mon);
    const r = await api('/api/off-requests', {
      method: 'POST', body: JSON.stringify({ employeeId: emp2, dates: [isoDay(d1), isoDay(new Date(mon.getTime() + 2 * 864e5))] })
    }, adminToken);
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.ok(String(r.body.error || '').includes('TH1'), JSON.stringify(r.body));
    await api(`/api/employees/${emp2}?hard=true`, { method: 'DELETE' }, adminToken);
  });

  it('5. Admin tat VIP -> ve khung gio (ngoai window thi 400)', async () => {
    await api('/api/admin/off-vip', { method: 'POST', body: JSON.stringify({ enabled: false }) }, adminToken);
    const w = await api('/api/off-window');
    assert.equal(w.body.vipTest, false, JSON.stringify(w.body));
    if (!w.body.isOpen) {
      const mon = mondayWeeksAhead(5);
      const d1 = new Date(mon);
      const r = await api('/api/off-requests', {
        method: 'POST', body: JSON.stringify({ employeeId: empId, dates: [isoDay(d1)] })
      }, adminToken);
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.ok(/khung gi|đã có|tối đa/i.test(String(r.body.error || '')), JSON.stringify(r.body));
    }
  });

  it('6. Frontend khong khoa tab OFF khi VIP bat (static guard)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    const spots = [
      "n.id === 'off' && isFriday && !window._offVipTest",
      "id === 'off' && !window._offVipTest",
    ];
    for (const s of spots) assert.ok(src.includes(s), 'thieu bypass VIP: ' + s);
  });

  it('7. Gio VN: getNextMonday dung ngay VN hien tai', async () => {
    // Gian tiep qua approve-test-status: weekStart phai la Thu 2 tuan sau theo gio VN
    const r = await api('/api/schedules/approve-test-status', {}, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ws = r.body.weekStart;
    assert.match(ws, /^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(ws + 'T00:00:00');
    assert.equal(d.getDay(), 1, 'weekStart phai la Thu 2, got ' + ws);
  });

  it('8. Status co lockInfo + unlock tuan chua khoa (an toan, khong doi du lieu)', async () => {
    const s = await api('/api/schedules/approve-test-status', {}, adminToken);
    assert.equal(s.status, 200);
    assert.ok('lockInfo' in s.body, JSON.stringify(s.body));
    const u = await api('/api/schedules/unlock-week', {
      method: 'POST', body: JSON.stringify({ weekStart: '2099-01-04' })
    }, adminToken);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.equal(u.body.wasLocked, false);
    assert.equal(u.body.locked, false);
  });

  it('9. Unlock: sai weekStart -> 400, thieu auth -> 401', async () => {
    const bad = await api('/api/schedules/unlock-week', {
      method: 'POST', body: JSON.stringify({ weekStart: 'not-a-date' })
    }, adminToken);
    assert.equal(bad.status, 400, JSON.stringify(bad.body));
    const noAuth = await api('/api/schedules/unlock-week', {
      method: 'POST', body: JSON.stringify({})
    });
    assert.equal(noAuth.status, 401, JSON.stringify(noAuth.body));
  });

  it('10. Admin UI co nut Mo khoa + hien ai khoa', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    assert.ok(src.includes('unlockWeek'), 'thieu unlockWeek');
    assert.ok(src.includes('lockInfo'), 'thieu lockInfo');
    assert.ok(src.includes('MỞ KHÓA TUẦN'), 'thieu nut Mo khoa');
  });
});
