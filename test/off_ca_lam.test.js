const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// OFF CA LAM (doi ten tu OFF dot xuat): nhan moi + flow thay ca giu nguyen.
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
async function login(u, p) {
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
  return r.body.token;
}

describe('OFF CA LAM (doi ten + hien thi thay ca)', () => {
  let adminToken;

  before(async () => {
    adminToken = await login('admin', 'Master@@2027') || await login('admin', 'admin123');
    assert.ok(adminToken, 'admin login');
  });

  it('1. Nhan cu da doi het, dinh danh ky thuat giu nguyen', () => {
    const files = ['public/js/employee.js', 'public/employee.html', 'public/js/admin.js', 'public/admin.html', 'server.js']
      .map(f => ({ f, src: fs.readFileSync(path.join(__dirname, '..', f), 'utf8') }));
    for (const { f, src } of files) {
      assert.ok(!/OFF đột xuất|OFF ĐỘT XUẤT|Nghỉ đột xuất|nghỉ đột xuất/.test(src), f + ' con nhan cu');
      assert.ok(src.includes('OFF CA LÀM'), f + ' thieu nhan moi');
    }
    const srv = files.find(x => x.f === 'server.js').src;
    assert.ok(srv.includes('EMERGENCY_OFF'), 'mat status EMERGENCY_OFF');
    assert.ok(srv.includes("app.post('/api/emergency-requests'"), 'mat route emergency');
    assert.ok(srv.includes('PHIEU_OFF_DOT_XUAT'), 'mat tab Sheet');
  });

  it('2. Form hien ca hien tai + banner nguoi thay ca', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'employee.html'), 'utf8');
    assert.ok(html.includes('id="emShiftInfo"'), 'thieu chip ca hien tai');
    assert.ok(js.includes('Ca hiện tại của bạn'), 'chua fill ca hien tai');
    assert.ok(js.includes('đang thay ca ngày'), 'thieu banner nguoi thay');
  });

  it('3. Flow OFF CA LAM chay: tao phieu -> lich EMERGENCY_PENDING', async () => {
    const c = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: 'OffCaLam Test', phone: rndPhone(), branchId: 'CN2', shift: 'CA_SANG', category: 'STORE', isTest: true })
    }, adminToken);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const empId = c.body.employee.employeeId;
    await api(`/api/employees/${empId}`, { method: 'PUT', body: JSON.stringify({ status: 'OFFICIAL', type: 'OFFICIAL' }) }, adminToken);
    const d = new Date(); d.setDate(d.getDate() + 9);
    const r = await api('/api/emergency-requests', {
      method: 'POST', body: JSON.stringify({ employeeId: empId, date: fmtLocal(d), reason: 'Viec gia dinh' })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'PENDING');
    const s = await api(`/api/schedules?employeeId=${empId}`, {}, adminToken);
    const days = (Array.isArray(s.body) ? s.body : []).flatMap(x => x.days || []);
    assert.ok(days.some(x => x.date === fmtLocal(d) && x.status === 'EMERGENCY_PENDING'), 'lich phai EMERGENCY_PENDING');
    await api(`/api/employees/${empId}?hard=true`, { method: 'DELETE' }, adminToken);
  });
});
