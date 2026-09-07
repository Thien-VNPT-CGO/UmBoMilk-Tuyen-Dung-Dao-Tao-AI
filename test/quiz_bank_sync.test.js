const test = require('node:test');
const assert = require('node:assert');

const BASE_URL = 'http://127.0.0.1:3000';

test('Quiz Bank Real Google Sheet Sync & Random 25 Questions Constraint', async (t) => {
  // Lấy token Admin
  const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Master@@2027' })
  });
  const adminData = await adminRes.json();
  const token = adminData.token;
  assert.ok(token, 'Đăng nhập admin thành công');

  await t.test('GET /api/quiz/status trả đúng cấu hình Google Sheet 1h06Tr... và ngân hàng đề >= 25 câu', async () => {
    const res = await fetch(`${BASE_URL}/api/quiz/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.config.spreadsheetId, '1h06TrHMRnBOHMkp7Ri4Rz8yRw8ptemQp0ftjMldHYdc');
    assert.ok(data.total >= 25, `Ngân hàng đề có ${data.total} câu (yêu cầu >= 25)`);
    assert.strictEqual(data.ready, true);
  });

  await t.test('POST /api/quiz/sync đồng bộ thành công câu hỏi thật từ Google Sheet', async () => {
    const res = await fetch(`${BASE_URL}/api/quiz/sync`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.updated >= 25, `Số câu cập nhật từ Sheet: ${data.updated}`);
  });

  await t.test('GET /api/courses không còn câu hỏi mock/giả lập nào', async () => {
    const res = await fetch(`${BASE_URL}/api/courses`);
    assert.strictEqual(res.status, 200);
    const courses = await res.json();
    assert.ok(courses.length > 0);
    const questions = courses[0].questions || [];
    assert.ok(questions.length >= 25);
    const mockExists = questions.some(q => q.question && q.question.includes('Thành phần chính của món Trà Sữa Ụm Bò Truyền Thống là gì?'));
    assert.strictEqual(mockExists, false, 'Không được còn câu hỏi mock trên hệ thống');
    // Kiểm tra câu hỏi thật đầu tiên
    const realExists = questions.some(q => q.question && q.question.includes('Sữa tươi của Ụm Bò Milk có nguồn gốc từ đâu'));
    assert.strictEqual(realExists, true, 'Có câu hỏi thật từ Google Sheet 1h06Tr...');
  });

  await t.test('POST /api/quiz/open và /api/courses/:id/submit nộp bài thành công 25 câu không lỗi', async () => {
    // 1. Tạo nhân viên training mẫu (gắn cờ test)
    const testPhone = '0909990' + Math.floor(Math.random() * 900 + 100);
    const createEmpRes = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        name: 'Test Submit Quiz',
        phone: testPhone,
        branchId: 'CN1',
        shift: 'SÁNG',
        type: 'TRAINING',
        status: 'TRAINING',
        startDate: '2026-08-01',
        isTest: true
      })
    });
    const createEmpData = await createEmpRes.json();
    assert.ok(createEmpData.employee && createEmpData.employee.employeeId, `Tạo NV lỗi: ${JSON.stringify(createEmpData)}`);
    const testEmpId = createEmpData.employee.employeeId;

    try {
      // 2. Mở đề thi 25 câu
      const openRes = await fetch(`${BASE_URL}/api/quiz/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-is-test': 'true' },
        body: JSON.stringify({ employeeId: testEmpId, force: true, isTest: true })
      });
      assert.strictEqual(openRes.status, 200);
      const openData = await openRes.json();
      assert.strictEqual(openData.questions.length, 25);
      assert.strictEqual(openData.questionIds.length, 25);

      // 3. Nộp bài với 25 câu trả lời
      const answers = Array(25).fill(1); // Chọn đáp án B cho tất cả 25 câu
      const submitRes = await fetch(`${BASE_URL}/api/courses/${openData.courseId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-is-test': 'true' },
        body: JSON.stringify({
          employeeId: testEmpId,
          answers,
          timeSpent: 70,
          questionIds: openData.questionIds,
          isTest: true
        })
      });
      const submitData = await submitRes.json();
      assert.strictEqual(submitRes.status, 200, `Nộp bài thất bại: ${JSON.stringify(submitData)}`);
      assert.strictEqual(submitData.success, true);
      assert.ok(submitData.testResult);
      assert.strictEqual(submitData.testResult.total, 25);
      assert.ok(typeof submitData.testResult.score === 'number');
    } finally {
      // 4. Dọn dẹp nhân viên test triệt để
      await fetch(`${BASE_URL}/api/employees/${testEmpId}?hard=true`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  });
});
