const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Batch 8: doi ca HR-gate, OFF-block diem danh, nhan OFF CA LAM, hieu ung + TTS.
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
function mondayOf(d) {
  const m = new Date(d); const day = m.getDay();
  m.setDate(m.getDate() - day + (day === 0 ? -6 : 1)); m.setHours(12, 0, 0, 0);
  return m;
}
async function login(u, p) {
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
  return r.body.token;
}
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(200);

describe('Batch 8: doi ca HR-gate + OFF-block + hieu ung + TTS', () => {
  let adminToken, empId, empKey;

  async function makeEmp(tag) {
    const c = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: `Batch8 Test ${tag}`, phone: rndPhone(), branchId: 'CN2', shift: 'CA_SANG', category: 'STORE', isTest: true })
    }, adminToken);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const id = c.body.employee.employeeId;
    await api(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);
    return { id, key: c.body.key.key };
  }
  async function ensureEmp() {
    const list = await api('/api/employees', {}, adminToken);
    const found = (Array.isArray(list.body) ? list.body : []).some(x => x.employeeId === empId);
    if (!found) {
      const nu = await makeEmp('Again');
      empId = nu.id; empKey = nu.key;
    }
    return empId;
  }

  before(async () => {
    adminToken = await login('admin', 'Master@@2027') || await login('admin', 'admin123');
    assert.ok(adminToken, 'admin login');
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: false }) }, adminToken);
  });

  after(async () => {
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: false }) }, adminToken);
      const list = await api('/api/employees', {}, adminToken);
      for (const e of (Array.isArray(list.body) ? list.body : [])) {
        if ((e.name || '').startsWith('Batch8 Test')) {
          await api(`/api/employees/${e.employeeId}?hard=true`, { method: 'DELETE' }, adminToken);
        }
      }
    } catch (_) {}
  });

  it('1. Mac dinh tat doi ca NV + me tra flag', async () => {
    const s = await api('/api/settings/masked', {}, adminToken);
    assert.equal(s.body.features.employeeShiftSwap, false, 'mac dinh phai tat: ' + JSON.stringify(s.body).slice(0, 200));
    const nu = await makeEmp('Main');
    empId = nu.id; empKey = nu.key;
    const el = await api('/api/auth/employee-login', { method: 'POST', body: JSON.stringify({ employeeId: empId, key: empKey, deviceId: 'b8-dev' }) });
    const me = await api('/api/employee/me', {}, el.body.token);
    assert.equal(me.body.valid, true);
    assert.equal(me.body.features.employeeShiftSwap, false);
  });

  it('2. Tat: tao phieu doi ca 403; bat: 200', async () => {
    await ensureEmp();
    const d = new Date(); d.setDate(d.getDate() + 20);
    const payload = { requesterId: empId, date: fmtLocal(d), fromShift: 'CA_SANG', toShift: 'CA_CHIEU', reason: 'Batch8' };
    const off = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify(payload) }, adminToken);
    assert.equal(off.status, 403, JSON.stringify(off.body));
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: true }) }, adminToken);
    const on = await api('/api/shift-swap', { method: 'POST', body: JSON.stringify(payload) }, adminToken);
    assert.equal(on.status, 200, JSON.stringify(on.body));
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ path: 'features.employeeShiftSwap', value: false }) }, adminToken);
  });

  it('3. Ngay OFF: checkin 400; ngay WORKING: checkin 200', async () => {
    await ensureEmp();
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const mon = mondayOf(today);
    const ws = fmtLocal(mon);
    const todayStr = fmtLocal(today);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date(mon); d.setDate(d.getDate() + i);
      const ds = fmtLocal(d);
      const isOff = ds === todayStr;
      return { date: ds, dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], shift: isOff ? 'OFF' : 'CA_SANG', status: isOff ? 'OFF' : 'WORKING' };
    });
    const sc = await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: empId, weekStart: ws, days }) }, adminToken);
    assert.equal(sc.status, 200, JSON.stringify(sc.body));
    const mt = new Date(today); mt.setHours(7, 30, 0, 0);
    const off = await api('/api/attendance/checkin', {
      method: 'POST',
      body: JSON.stringify({ employeeId: empId, gps: '10.762622,106.660172', address: 'Batch8 Street', image: IMG, mockTime: mt.toISOString(), isTest: true })
    });
    assert.equal(off.status, 400, JSON.stringify(off.body));
    assert.ok(/OFF theo lịch/.test(off.body.error || ''), JSON.stringify(off.body));
    // Mo lai WORKING -> checkin duoc
    const days2 = days.map(x => x.date === todayStr ? { ...x, shift: 'CA_SANG', status: 'WORKING' } : x);
    await api('/api/schedules', { method: 'POST', body: JSON.stringify({ employeeId: empId, weekStart: ws, days: days2 }) }, adminToken);
    const ok = await api('/api/attendance/checkin', {
      method: 'POST',
      body: JSON.stringify({ employeeId: empId, gps: '10.762622,106.660172', address: 'Batch8 Street', image: IMG, mockTime: mt.toISOString(), isTest: true })
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  it('4. Nhan OFF CA LAM + hieu ung + TTS co mat (static guard)', () => {
    const ej = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    const aj = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    const eh = fs.readFileSync(path.join(__dirname, '..', 'public', 'employee.html'), 'utf8');
    const ah = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    assert.ok(ej.includes("statusText = 'OFF CA LÀM'"), 'lich NV thieu OFF CA LAM');
    assert.ok(ej.includes('window._shiftSwapEnabled'), 'thieu flag swap NV');
    assert.ok(ej.includes('Hôm nay bạn OFF theo lịch'), 'thieu chan OFF UI');
    for (const [n, src] of [['admin.js', aj], ['employee.js', ej]]) {
      assert.ok(src.includes('umb-toast'), n + ' thieu toast effect');
      assert.ok(src.includes('speakUmb'), n + ' thieu TTS');
      assert.ok(src.includes('toggleUmbTts'), n + ' thieu nut TTS');
      assert.ok(src.includes('umbSetLoading'), n + ' thieu loading');
    }
    for (const [n, src] of [['admin.html', ah], ['employee.html', eh]]) {
      assert.ok(src.includes('umb-toast'), n + ' thieu CSS toast');
      assert.ok(src.includes('prefers-reduced-motion'), n + ' thieu reduced-motion');
    }
    assert.ok(ej.includes('setShiftSwap') || aj.includes('setShiftSwap'), 'thieu toggle HR');
  });
});
