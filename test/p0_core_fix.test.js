const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// P0 Core Fix suite (Master 6.1-6.6 / 43): chay khi server dang bat (npm run test:ci)
const BASE = process.env.TEST_BASE || 'http://localhost:3000';

function rndPhone() { return '090' + Math.floor(1000000 + Math.random() * 9000000); }
function fmt(d) { return d.toISOString().slice(0, 10); }
function nextWeekday(target) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  return fmt(d);
}
async function login(u, p) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-is-test': 'true' }, body: JSON.stringify({ username: u, password: p }) });
  return r.json();
}
async function api(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', 'x-is-test': 'true', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { ...opts, headers });
  let j = {};
  try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}

describe('P0 Core Fix (Master 6.1-6.6)', () => {
  let adminToken, hrToken;
  const createdApplicants = [];
  const createdEmployees = [];

  before(async () => {
    let a = await login('admin', 'Master@@2027');
    if (!a || !a.token) a = await login('admin', 'admin123');
    adminToken = a.token;
    let h = await login('hr', 'hr123');
    hrToken = h.token || adminToken;
    assert.ok(adminToken, 'admin token required');
  });

  after(async () => {
    for (const id of createdApplicants) {
      try { await api(`/api/applicants/${id}`, { method: 'DELETE' }, adminToken); } catch (_) {}
    }
    for (const eid of createdEmployees) {
      try { await api(`/api/employees/${eid}?hard=true`, { method: 'DELETE' }, adminToken); } catch (_) {}
    }
  });

  async function createApplicant(tag) {
    const r = await api('/api/applicants', {
      method: 'POST',
      body: JSON.stringify({
        name: `P0 Test ${tag}`,
        phone: rndPhone(),
        branchPreference: 'CN2',
        shiftPreference: 'CA_SANG',
        gender: 'Nam',
        birthYear: '2000',
        education: 'Dai hoc',
        hometown: 'TP.HCM',
        experience: 'Da tung lam FNB tai quan sua',
        handling: 'Ho tro doi ca linh hoat, bao truoc',
        facebook: 'https://fb.com/p0test',
        source: 'Facebook',
        isTest: true
      })
    });
    assert.equal(r.status, 200, `create applicant ${tag}: ` + JSON.stringify(r.body));
    createdApplicants.push(r.body.id);
    return r.body;
  }

  it('1. T2 08:00 -> pass (business hours hop le)', async () => {
    const monday = nextWeekday(1);
    const app = await createApplicant('Mon08');
    const r = await api(`/api/applicants/${app.id}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({ interviewDate: monday, timeSlot: '08:00-08:30' })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.applicant.status, 'INTERVIEW');
    assert.notEqual(r.body.applicant.status, 'PASS');
    assert.equal(r.body.interview.confirmationStatus, 'WAITING_CONFIRM');
    global.__p0Monday = monday;
    global.__p0App1 = app;
  });

  it('2. 16:30 -> pass (slot cuoi)', async () => {
    const app = await createApplicant('LastSlot');
    const r = await api(`/api/applicants/${app.id}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({ interviewDate: global.__p0Monday, timeSlot: '16:30-17:00' })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    global.__p0App2 = app;
  });

  it('3. 17:00 -> reject (qua 17:00)', async () => {
    const app = await createApplicant('Late');
    const r = await api(`/api/applicants/${app.id}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({ interviewDate: global.__p0Monday, timeSlot: '17:00-17:30' })
    }, adminToken);
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  it('4. Sunday -> reject', async () => {
    const sunday = nextWeekday(0);
    const app = await createApplicant('Sunday');
    const r = await api(`/api/applicants/${app.id}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({ interviewDate: sunday, timeSlot: '08:00-08:30' })
    }, adminToken);
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  it('5. overlap -> reject 409 (trung slot 08:00)', async () => {
    const app = await createApplicant('Overlap');
    const r = await api(`/api/applicants/${app.id}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({ interviewDate: global.__p0Monday, timeSlot: '08:00-08:30' })
    }, adminToken);
    assert.equal(r.status, 409, JSON.stringify(r.body));
  });

  it('5b. overlap that su (08:15-08:45 giao nhau) -> reject', async () => {
    const app = await createApplicant('Overlap2');
    const r = await api(`/api/applicants/${app.id}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({ interviewDate: global.__p0Monday, timeSlot: '08:15-08:45' })
    }, adminToken);
    assert.ok([400, 409].includes(r.status), JSON.stringify(r.body));
  });

  it('6. qua khu -> reject', async () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const app = await createApplicant('Past');
    const r = await api(`/api/applicants/${app.id}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({ interviewDate: fmt(y), timeSlot: '08:00-08:30' })
    }, adminToken);
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  it('7. Meet ket thuc khong auto-PASS (schedule xong van INTERVIEW)', async () => {
    const r = await api('/api/applicants', { method: 'GET' }, adminToken);
    const list = Array.isArray(r.body) ? r.body : [];
    const app1 = list.find(a => a.id === (global.__p0App1 && global.__p0App1.id));
    assert.ok(app1, 'applicant 1 ton tai');
    assert.notEqual(app1.status, 'PASS');
    assert.ok(['INTERVIEW', 'WAITING_HR_REVIEW'].includes(app1.status), app1.status);
  });

  it('8. Zalo inbound ok -> CONFIRMED', async () => {
    const r = await api('/api/zalo/inbound', {
      method: 'POST',
      body: JSON.stringify({ phone: global.__p0App1.phone, text: 'ok' })
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.classification, 'POSITIVE');
    assert.equal(r.body.confirmationStatus, 'CONFIRMED');
  });

  it('9. Zalo inbound xac nhan (dau tieng Viet) -> CONFIRMED', async () => {
    const r = await api('/api/zalo/inbound', {
      method: 'POST',
      body: JSON.stringify({ phone: global.__p0App2.phone, text: 'Xác nhận tham gia' })
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.classification, 'POSITIVE');
  });

  it('10. Zalo inbound ban -> NEED_RESCHEDULE', async () => {
    const app = await createApplicant('Busy');
    await api(`/api/applicants/${app.id}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({ interviewDate: global.__p0Monday, timeSlot: '09:00-09:30' })
    }, adminToken);
    const r = await api('/api/zalo/inbound', {
      method: 'POST',
      body: JSON.stringify({ phone: app.phone, text: 'bận, hủy nhé' })
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.classification, 'NEGATIVE');
    assert.equal(r.body.confirmationStatus, 'NEED_RESCHEDULE');
  });

  it('11. Zalo inbound ambiguous -> Exception (UNKNOWN)', async () => {
    const r = await api('/api/zalo/inbound', {
      method: 'POST',
      body: JSON.stringify({ phone: rndPhone(), text: 'cho em hoi luong bao nhieu a' })
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.classification, 'UNKNOWN');
  });

  it('12. Zalo inbound duplicate -> deduped', async () => {
    const phone = rndPhone();
    const first = await api('/api/zalo/inbound', { method: 'POST', body: JSON.stringify({ phone, text: 'ok', message_id: 'MSG-DUP-1' }) });
    assert.equal(first.status, 200);
    const second = await api('/api/zalo/inbound', { method: 'POST', body: JSON.stringify({ phone, text: 'ok', message_id: 'MSG-DUP-1' }) });
    assert.equal(second.status, 200);
    assert.equal(second.body.deduped, true);
  });

  async function createEmployee(tag) {
    const r = await api('/api/employees', {
      method: 'POST',
      body: JSON.stringify({ name: `P0 Test Emp ${tag}`, phone: rndPhone(), branchId: 'CN2', shift: 'CA_SANG', category: 'STORE', isTest: true })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    createdEmployees.push(r.body.employee.employeeId);
    return r.body.employee;
  }

  it('13. TEST 4.5/10 -> FAIL recommendation (khong tu promote)', async () => {
    const emp = await createEmployee('Fail');
    const r = await api(`/api/employees/${emp.employeeId}/evaluate-test`, {
      method: 'POST',
      body: JSON.stringify({ evaluatorName: 'HR', part1Scores: [1, 1, 1, 1, 0.5], part2Scores: [1, 1, 1, 1, 0.5] })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.totalScore10, 4.5);
    assert.equal(r.body.recommendation, 'FAIL');
    assert.equal(r.body.needsHrReview, true);
    assert.ok(r.body.resultStatus, 'giu tuong thich resultStatus cu');
  });

  it('14. TEST 6.0/10 -> RETEST', async () => {
    const emp = await createEmployee('Retest');
    const r = await api(`/api/employees/${emp.employeeId}/evaluate-test`, {
      method: 'POST',
      body: JSON.stringify({ evaluatorName: 'HR', part1Scores: [1, 1, 1, 1, 1, 1], part2Scores: [1, 1, 1, 1, 1, 1] })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.totalScore10, 6);
    assert.equal(r.body.recommendation, 'RETEST');
  });

  it('15. TEST 8.5/10 -> PASS_WAITING_OFFICIAL_APPROVAL + HR finalize', async () => {
    const emp = await createEmployee('PassWait');
    const r = await api(`/api/employees/${emp.employeeId}/evaluate-test`, {
      method: 'POST',
      body: JSON.stringify({ evaluatorName: 'HR', part1Scores: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], part2Scores: [1, 1, 1, 1, 1, 1, 1, 1, 0.5] })
    }, adminToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.totalScore10, 8.5);
    assert.equal(r.body.recommendation, 'PASS_WAITING_OFFICIAL_APPROVAL');
    const f = await api(`/api/vip/test/${emp.employeeId}/finalize`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'PASS_WAITING_OFFICIAL_APPROVAL', notes: 'HR duyet' })
    }, hrToken);
    assert.equal(f.status, 200, JSON.stringify(f.body));
    assert.equal(f.body.employee.testFinalPending, false);
    const bad = await api(`/api/vip/test/${emp.employeeId}/finalize`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'AUTO_PASS' })
    }, hrToken);
    assert.equal(bad.status, 400);
  });

  it('16. Security inventory: khong token -> 401, HR -> 200', async () => {
    const noAuth = await api('/api/vip/security/inventory', { method: 'GET' });
    assert.equal(noAuth.status, 401);
    const r = await api('/api/vip/security/inventory', { method: 'GET' }, hrToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.count > 20);
    assert.ok(Array.isArray(r.body.endpoints));
    const hasCheckin = r.body.endpoints.some(e => e.path.includes('checkin'));
    assert.ok(hasCheckin);
    const secretLeak = JSON.stringify(r.body).toLowerCase();
    assert.ok(!secretLeak.includes('private key') && !secretLeak.includes('begin'));
  });
});
