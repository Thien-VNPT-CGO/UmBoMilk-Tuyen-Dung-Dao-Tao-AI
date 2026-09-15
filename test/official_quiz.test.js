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

test('Quiz dinh ky cho NV Chinh thuc (25/40, 24h, 3 khung diem)', async (t) => {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Master@@2027' }) });
  const token = login.body.token;
  assert.ok(token, 'Dang nhap admin thanh cong');

  const phone = '0909990' + Math.floor(Math.random() * 900 + 100);
  const c = await api('/api/employees', { method: 'POST', body: JSON.stringify({ name: 'Test Quiz Official', phone, branchId: 'CN1', shift: 'SÁNG', type: 'OFFICIAL', status: 'OFFICIAL', startDate: '2026-01-01', isTest: true }) }, token);
  assert.strictEqual(c.status, 200, `Tao NV chinh thuc loi: ${JSON.stringify(c.body)}`);
  const empId = c.body.employee.employeeId;
  assert.ok(empId);

  const bankRes = await api('/api/courses');
  const bank = (bankRes.body[0] && bankRes.body[0].questions) || [];
  assert.ok(bank.length >= 25, 'Ngan hang de < 25 cau');
  const correctOf = {};
  bank.forEach(q => { correctOf[q.id] = q.correct; });
  const courseId = bankRes.body[0].id;
  const buildAnswers = (ids, nCorrect) => ids.map((id, i) => {
    const corr = correctOf[id];
    if (i < nCorrect) return corr;
    return corr === 1 ? 2 : 1;
  });

  try {
    await t.test('NV tu mo de khi chua co de -> 403 cho HR mo', async () => {
      const raw = await fetch(BASE_URL + '/api/quiz/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: empId }) });
      assert.strictEqual(raw.status, 403, JSON.stringify(await raw.json()));
    });

    let firstIds;
    await t.test('HR mo de cho NV chinh thuc -> 25 cau, han 24h', async () => {
      const r = await api('/api/quiz/open', { method: 'POST', body: JSON.stringify({ employeeId: empId, openedBy: 'HR' }) });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.questions.length, 25);
      assert.strictEqual(r.body.questionIds.length, 25);
      firstIds = r.body.questionIds;
      const left = new Date(r.body.expiresAt).getTime() - Date.now();
      assert.ok(left > 23 * 3600 * 1000 && left <= 24 * 3600 * 1000 + 5 * 60 * 1000, `Han de sai: ${left}`);
    });

    await t.test('NV tu tiep tuc (resume) dung 25 cau cu', async () => {
      const r = await api('/api/quiz/open', { method: 'POST', body: JSON.stringify({ employeeId: empId }) });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body.questionIds, firstIds);
    });

    await t.test('Nop full dung -> DAT, van OFFICIAL', async () => {
      const r = await api(`/api/courses/${courseId}/submit`, { method: 'POST', body: JSON.stringify({ employeeId: empId, answers: buildAnswers(firstIds, 25), timeSpent: 60, questionIds: firstIds }) });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.testResult.result, 'DAT');
      assert.strictEqual(r.body.testResult.score, 10);
      assert.strictEqual(r.body.employee.type, 'OFFICIAL');
      assert.strictEqual(r.body.employee.status, 'OFFICIAL');
    });

    await t.test('Diem 6 -> THI LAI, van OFFICIAL, tu mo lai -> 403', async () => {
      const o = await api('/api/quiz/open', { method: 'POST', body: JSON.stringify({ employeeId: empId, openedBy: 'HR' }) });
      assert.strictEqual(o.status, 200, JSON.stringify(o.body));
      const r = await api(`/api/courses/${courseId}/submit`, { method: 'POST', body: JSON.stringify({ employeeId: empId, answers: buildAnswers(o.body.questionIds, 15), timeSpent: 60, questionIds: o.body.questionIds }) });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.testResult.result, 'CHUA_DU_DK');
      assert.strictEqual(r.body.testResult.score, 6);
      assert.strictEqual(r.body.employee.type, 'OFFICIAL');
      assert.strictEqual(r.body.employee.status, 'OFFICIAL');
      const selfRaw = await fetch(BASE_URL + '/api/quiz/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: empId }) });
      assert.strictEqual(selfRaw.status, 403, JSON.stringify(await selfRaw.json()));
    });

    await t.test('Diem 4 -> LOAI, van OFFICIAL (khong ARCHIVED/logout)', async () => {
      const o = await api('/api/quiz/open', { method: 'POST', body: JSON.stringify({ employeeId: empId, openedBy: 'HR' }) });
      assert.strictEqual(o.status, 200, JSON.stringify(o.body));
      const r = await api(`/api/courses/${courseId}/submit`, { method: 'POST', body: JSON.stringify({ employeeId: empId, answers: buildAnswers(o.body.questionIds, 10), timeSpent: 60, questionIds: o.body.questionIds }) });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.testResult.result, 'FAILED');
      assert.strictEqual(r.body.testResult.score, 4);
      assert.strictEqual(r.body.employee.type, 'OFFICIAL');
      assert.strictEqual(r.body.employee.status, 'OFFICIAL');
    });

    await t.test('Static guard UI/server cho quiz chinh thuc', async () => {
      const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
      assert.ok(srv.includes('_isOfficialQuizEmp'), 'server thieu nhanh official');
      assert.ok(srv.includes('Bài thi định kỳ do HR mở'), 'server thieu chan tu mo official');
      const empJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
      assert.ok(empJs.includes("ts.type === 'ONLINE_QUIZ' && ts.status === 'IN_PROGRESS'"), 'employee thieu mo tab khi co de');
      assert.ok(empJs.includes('quizExpiryCountdown'), 'employee thieu dem nguoc 24h');
      assert.ok(empJs.includes('showFireworks()'), 'employee thieu phao hoa DAT');
      assert.ok(empJs.includes('Chờ HR mở đề thi định kỳ'), 'employee thieu nut cho HR');
      const admJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
      assert.ok(admJs.includes('Mở đề 25 câu'), 'admin thieu nut mo de official');
      assert.ok(admJs.includes('quizOptOnlineApp'), 'admin thieu an option training khi official');
    });
  } finally {
    await api(`/api/employees/${empId}?hard=true`, { method: 'DELETE' }, token);
  }
});
