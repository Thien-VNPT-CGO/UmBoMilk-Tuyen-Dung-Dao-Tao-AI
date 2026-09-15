const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:3000';
const H = { 'Content-Type': 'application/json', 'x-is-test': 'true' };
async function api(p, opts = {}, token) {
  const headers = { ...H, ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE_URL + p, { ...opts, headers });
  let j = {};
  try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}
function loadOCR() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'schedule-ocr.js'), 'utf8');
  const sandboxWindow = {};
  const fn = new Function('window', 'module', src + '\nreturn window.ScheduleOCR;');
  return fn(sandboxWindow, undefined);
}
let _bk = 0;
function W(text, x0, x1, y0, y1, sameLine, conf) { return { text, x0, x1, y0, y1, conf: conf == null ? 90 : conf, bk: '1/1/1/' + (sameLine || (++_bk)) }; }

test('Schedule image backup: OCR parser + Admin APIs', async (t) => {
  await t.test('parser: map dung o anh mau CN111 (ngay/shift/khop ten)', async () => {
    const OCR = loadOCR();
    const dates = ['14/09/2026', '15/09/2026', '16/09/2026', '17/09/2026', '18/09/2026', '19/09/2026', '20/09/2026'];
    const words = [];
    dates.forEach((d, i) => words.push(W(d, 200 + i * 150, 280 + i * 150, 90, 115)));
    words.push(W('sáng', 20, 70, 190, 215), W('trưa', 20, 70, 310, 335), W('chiều', 20, 70, 430, 455));
    words.push(W('CN 111', 400, 520, 40, 65));
    words.push(W('Lê Thư (7h-12h)', 165, 290, 188, 216));
    words.push(W('Trâm Anh (12h-18h)', 915, 1055, 308, 336));
    words.push(W('Q.lý Kiểm tra: Bảo Châu', 315, 505, 308, 336));
    words.push(W('Thảo Vy (18h-23h)', 465, 605, 428, 456));
    const roster = [
      { employeeId: 'NV_A', name: 'Lê Thư', branchId: 'CN4' },
      { employeeId: 'NV_B', name: 'Trâm Anh', branchId: 'CN4' },
      { employeeId: 'NV_C', name: 'Bảo Châu', branchId: 'CN4' }
    ];
    const r = OCR.mapGrid(words, roster, { branchId: 'CN4' });
    assert.ok(!r.error, JSON.stringify(r));
    assert.strictEqual(r.weekStart, '2026-09-14');
    const a = r.entries.find(e => e.employeeId === 'NV_A');
    assert.ok(a, 'thieu Le Thu');
    assert.strictEqual(a.date, '2026-09-14');
    assert.strictEqual(a.shift, 'CA_SANG');
    const b = r.entries.find(e => e.employeeId === 'NV_B');
    assert.ok(b, 'thieu Tram Anh');
    assert.strictEqual(b.date, '2026-09-19');
    assert.strictEqual(b.shift, 'CA_CHIEU');
    assert.ok(!r.entries.some(e => e.employeeId === 'NV_C'), 'dong Q.ly Kiem tra phai bo qua');
    assert.ok(r.imageBranch && r.imageBranch.label === '111' && r.imageBranch.branchId === 'CN4', 'nhan dien CN111 -> CN4');
    assert.strictEqual(OCR.IMAGE_BRANCH_MAP['261'], 'CN2');
    const un = r.unmatched.find(u => u.text.includes('Thảo Vy'));
    assert.ok(un, 'Thao Vy ngoai roster phai unmatched');
    assert.ok(r.avgConfidence >= 0.7, 'do tin cay thap: ' + r.avgConfidence);
  });

  await t.test('parser: nhan nen mau conf thap + nhan lech phai (fallback)', async () => {
    const OCR = loadOCR();
    const words = [];
    ['14/09/2026', '15/09/2026', '16/09/2026', '17/09/2026', '18/09/2026', '19/09/2026', '20/09/2026'].forEach((d, i) => words.push(W(d, 200 + i * 150, 280 + i * 150, 90, 115)));
    words.push(W('sáng', 20, 70, 190, 215, null, 22));
    words.push(W('trưa', 20, 70, 310, 335, null, 24));
    words.push(W('chiều', 20, 70, 430, 455, null, 21));
    words.push(W('Lê Thư (7h-12h)', 165, 290, 188, 216));
    const roster = [{ employeeId: 'NV_A', name: 'Lê Thư', branchId: 'CN4' }];
    const r = OCR.mapGrid(words, roster, { branchId: 'CN4' });
    assert.ok(!r.error, JSON.stringify(r));
    assert.ok(r.entries.some(e => e.employeeId === 'NV_A' && e.shift === 'CA_SANG'), 'nhan conf thap phai nhan');

    const words2 = [];
    ['14/09/2026', '15/09/2026'].forEach((d, i) => words2.push(W(d, 200 + i * 150, 280 + i * 150, 90, 115)));
    words2.push(W('sáng', 1250, 1300, 190, 215));
    words2.push(W('trưa', 1250, 1300, 310, 335));
    words2.push(W('Lê Thư', 165, 260, 188, 216));
    const r2 = OCR.mapGrid(words2, roster, { branchId: 'CN4' });
    assert.ok(!r2.error, JSON.stringify(r2));
    assert.ok(r2.entries.some(e => e.employeeId === 'NV_A'), 'fallback cum nhan phai nhan');

    const r3 = OCR.mapGrid([W('hello', 10, 60, 10, 30)], roster, {});
    assert.strictEqual(r3.error, 'NO_DATES');
    const r4 = OCR.mapGrid([W('14/09/2026', 200, 280, 90, 115)], roster, {});
    assert.strictEqual(r4.error, 'NO_SHIFT_ROWS');
    assert.ok(r4.debug && r4.debug.includes('words='), 'loi phai kem debug');
  });

  await t.test('parser: fuzzy khong dau + nguong', async () => {
    const OCR = loadOCR();
    assert.strictEqual(OCR.norm('Trâm Anh'), 'tram anh');
    assert.ok(OCR.similarity('Le Thu', 'Lê Thư') >= 0.99);
    const m = OCR.matchName('Le Thu', [{ employeeId: 'X', name: 'Lê Thư', branchId: 'CN4' }], 'CN4');
    assert.ok(m && m.employeeId === 'X');
    const no = OCR.matchName('Nguyen Van Xyz', [{ employeeId: 'X', name: 'Lê Thư', branchId: 'CN4' }], 'CN4');
    assert.strictEqual(no, null);
    assert.strictEqual(OCR.isoFromDMY('thứ hai (14/09/2026)'), '2026-09-14');
    assert.strictEqual(OCR.mondayOf('2026-09-16'), '2026-09-14');
    assert.strictEqual(OCR.shiftHintOf('Trâm Anh (18h-23h)'), 'CA_TOI');
  });

  await t.test('API backup CRUD + restore (Admin-only, khong ro ri)', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Master@@2027' }) });
    const token = login.body.token;
    assert.ok(token);
    let hrToken = null;
    try {
      const h = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'hr', password: 'hr123' }) });
      hrToken = h.body.token || null;
    } catch (_) {}

    const mkEmp = async (name) => {
      const phone = '09099' + Math.floor(Math.random() * 90000 + 10000);
      const c = await api('/api/employees', { method: 'POST', body: JSON.stringify({ name, phone, branchId: 'CN4', shift: 'CA_SANG', type: 'OFFICIAL', status: 'OFFICIAL', isTest: true }) }, token);
      assert.strictEqual(c.status, 200, JSON.stringify(c.body));
      return c.body.employee.employeeId;
    };
    const empA = await mkEmp('Backup Test A');
    const empB = await mkEmp('Backup Test B');
    let backupId = null;
    try {
      const noAuth = await api('/api/admin/schedule-backups', { method: 'POST', body: JSON.stringify({}) });
      assert.strictEqual(noAuth.status, 401);
      if (hrToken) {
        const hr = await api('/api/admin/schedule-backups', { method: 'POST', body: JSON.stringify({}) }, hrToken);
        assert.strictEqual(hr.status, 403);
      }
      const badBranch = await api('/api/admin/schedule-backups', { method: 'POST', body: JSON.stringify({ branchId: 'CN111', weekStart: '2026-09-14', entries: [{ employeeId: empA, date: '2026-09-15', shift: 'CA_SANG' }] }) }, token);
      assert.strictEqual(badBranch.status, 400);
      const badShift = await api('/api/admin/schedule-backups', { method: 'POST', body: JSON.stringify({ branchId: 'CN4', weekStart: '2026-09-14', entries: [{ employeeId: empA, date: '2026-09-15', shift: 'CA_X' }] }) }, token);
      assert.strictEqual(badShift.status, 400);
      const badDay = await api('/api/admin/schedule-backups', { method: 'POST', body: JSON.stringify({ branchId: 'CN4', weekStart: '2026-09-15', entries: [{ employeeId: empA, date: '2026-09-15', shift: 'CA_SANG' }] }) }, token);
      assert.strictEqual(badDay.status, 400);
      const badEmp = await api('/api/admin/schedule-backups', { method: 'POST', body: JSON.stringify({ branchId: 'CN4', weekStart: '2026-09-14', entries: [{ employeeId: 'NOPE', date: '2026-09-15', shift: 'CA_SANG' }] }) }, token);
      assert.strictEqual(badEmp.status, 400);

      const ok = await api('/api/admin/schedule-backups', { method: 'POST', body: JSON.stringify({ branchId: 'CN4', weekStart: '2026-09-14', source: 'OCR_AUTO', entries: [
        { employeeId: empA, date: '2026-09-15', shift: 'CA_SANG', confidence: 0.95 },
        { employeeId: empA, date: '2026-09-16', shift: 'CA_CHIEU', confidence: 0.9 },
        { employeeId: empB, date: '2026-09-15', shift: 'CA_TOI', confidence: 0.92 }
      ] }) }, token);
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      backupId = ok.body.backup.id;
      assert.ok(backupId);

      const list = await api('/api/admin/schedule-backups', {}, token);
      assert.strictEqual(list.status, 200);
      assert.ok(list.body.some(b => b.id === backupId && b.entryCount === 3));

      const one = await api('/api/admin/schedule-backups/' + backupId, {}, token);
      assert.strictEqual(one.status, 200);
      assert.strictEqual(one.body.entries.length, 3);

      const rs = await api('/api/admin/schedule-backups/' + backupId + '/restore', { method: 'POST', body: JSON.stringify({}) }, token);
      assert.strictEqual(rs.status, 200, JSON.stringify(rs.body));
      assert.strictEqual(rs.body.written, 2);

      const sched = await api('/api/schedules?employeeId=' + empA, {}, token);
      const hit = (Array.isArray(sched.body) ? sched.body : []).find(s => s.weekStart === '2026-09-14');
      assert.ok(hit, 'thieu lich tuan backup');
      assert.strictEqual(hit.approvalStatus, 'APPROVED');
      const dayOf = (d) => hit.days.find(x => x.date === d);
      assert.strictEqual(dayOf('2026-09-15').status, 'WORKING');
      assert.strictEqual(dayOf('2026-09-15').shift, 'CA_SANG');
      assert.strictEqual(dayOf('2026-09-16').status, 'WORKING');
      assert.strictEqual(dayOf('2026-09-16').shift, 'CA_CHIEU');
      assert.strictEqual(dayOf('2026-09-14').status, 'OFF');

      const del = await api('/api/admin/schedule-backups/' + backupId, { method: 'DELETE' }, token);
      assert.strictEqual(del.status, 200);
      backupId = null;
      const gone = await api('/api/admin/schedule-backups/' + 'nope', {}, token);
      assert.strictEqual(gone.status, 404);
    } finally {
      if (backupId) await api('/api/admin/schedule-backups/' + backupId, { method: 'DELETE' }, token);
      await api('/api/employees/' + empA + '?hard=true', { method: 'DELETE' }, token);
      await api('/api/employees/' + empB + '?hard=true', { method: 'DELETE' }, token);
      const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.json'), 'utf8'));
      assert.ok(!(db.scheduleBackups || []).some(b => (b.entries || []).some(e => e.employeeId === empA || e.employeeId === empB)), 'ro ri backup test');
      assert.ok(!(db.schedules || []).some(s => s.employeeId === empA || s.employeeId === empB), 'ro ri lich test');
    }
  });
});
