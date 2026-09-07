const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const DATA_FILE = path.join(__dirname, '..', 'data', 'db.json');

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return r.json();
}

describe('Realtime Notifications to Admin/HR & Training Auto-Swap OFF Test Suite', () => {
  let adminToken = '';
  let initialEmployeesCount = 0;
  let testEmployeeId = null;
  let testPhone = '';

  before(async () => {
    if (fs.existsSync(DATA_FILE)) {
      const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      initialEmployeesCount = (db.employees || []).length;
    }

    const auth = await login('admin', 'Master@@2027');
    adminToken = auth.token;
    assert.ok(adminToken, 'Đăng nhập admin thành công');

    // Dọn dẹp dữ liệu test cũ nếu có
    await fetch(`${BASE}/api/admin/clean-test-data`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
  });

  after(async () => {
    if (adminToken) {
      await fetch(`${BASE}/api/admin/clean-test-data`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
    }

    if (fs.existsSync(DATA_FILE)) {
      const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const testEmps = (db.employees || []).filter(e => e.isTest || (e.name && e.name.toLowerCase().includes('test')));
      assert.strictEqual(testEmps.length, 0, 'data/db.json không chứa nhân viên test');
      assert.strictEqual((db.employees || []).length, initialEmployeesCount, 'Số lượng nhân viên thật được bảo toàn nguyên vẹn');
    }
  });

  it('1. Tạo nhân viên Training test và đăng ký 5 ngày OFF ban đầu', async () => {
    testPhone = '090777' + Math.floor(1000 + Math.random() * 9000);
    const createRes = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'x-is-test': 'true'
      },
      body: JSON.stringify({
        name: 'Test Realtime Training Emp',
        phone: testPhone,
        role: 'TRAINING',
        type: 'TRAINING',
        status: 'TRAINING',
        branchId: 'CN1',
        branchName: 'Chi nhánh 1',
        shift: 'CA_SANG',
        startDate: '2026-09-10',
        isTest: true
      })
    });
    const created = await createRes.json();
    assert.strictEqual(createRes.status, 200, 'Tạo nhân viên trả về mã 200');
    assert.ok(created.employee && created.employee.employeeId, 'Tạo nhân viên test thành công');
    testEmployeeId = created.employee.employeeId;

    // Đăng ký 5 ngày OFF cho nhân viên training
    // 12 ngày thử việc từ 2026-09-10 đến 2026-09-21
    const offDates = [
      '2026-09-11',
      '2026-09-13',
      '2026-09-15',
      '2026-09-17',
      '2026-09-19'
    ];

    const regRes = await fetch(`${BASE}/api/employee/register-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: testEmployeeId,
        offDates
      })
    });
    const regData = await regRes.json();
    assert.strictEqual(regRes.status, 200, 'Đăng ký 5 ngày OFF trả về mã 200');
    assert.strictEqual(regData.success, true, 'Đăng ký 5 ngày OFF thành công');

    // Kiểm tra thông báo Admin đã được tạo từ register-off
    const notifRes = await fetch(`${BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const notifs = await notifRes.json();
    const offNotif = notifs.find(n => n.employeeId === testEmployeeId && n.title && n.title.includes('đăng ký 5 ngày OFF'));
    assert.ok(offNotif, 'Admin nhận được thông báo khi nhân viên đăng ký 5 ngày OFF');
  });

  it('2. Kiểm tra lịch 12 ngày thử việc: Đúng chuẩn 7 ngày TRAINING và 5 ngày OFF', async () => {
    const schedRes = await fetch(`${BASE}/api/schedules?branchId=CN1&startDate=2026-09-10&endDate=2026-09-21`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(schedRes.status, 200);
    const scheds = await schedRes.json();
    
    // Tìm các tuần có lịch của testEmployeeId
    const empSchedules = scheds.filter(s => s.employeeId === testEmployeeId);
    assert.ok(empSchedules.length > 0, 'Có lịch làm việc được tạo');

    // Gom toàn bộ các ngày trong kỳ 12 ngày thử việc (2026-09-10 đến 2026-09-21)
    const trialDays = [];
    empSchedules.forEach(s => {
      (s.days || []).forEach(d => {
        if (d.date >= '2026-09-10' && d.date <= '2026-09-21') {
          trialDays.push(d);
        }
      });
    });

    assert.strictEqual(trialDays.length, 12, 'Có đúng 12 ngày trong kỳ thử việc');

    const workingCount = trialDays.filter(s => s.status === 'WORKING').length;
    const offCount = trialDays.filter(s => s.status === 'OFF').length;

    assert.strictEqual(workingCount, 7, 'Có chính xác 7 ngày WORKING');
    assert.strictEqual(offCount, 5, 'Có chính xác 5 ngày OFF');

    // Ngày 2026-09-10 là ngày WORKING đầu tiên
    const firstDay = trialDays.find(s => s.date === '2026-09-10');
    assert.ok(firstDay && firstDay.status === 'WORKING', 'Ngày 2026-09-10 là WORKING');

    // Ngày 2026-09-11 là ngày OFF
    const secondDay = trialDays.find(s => s.date === '2026-09-11');
    assert.ok(secondDay && secondDay.status === 'OFF', 'Ngày 2026-09-11 là OFF');
  });

  it('3. Đổi ca training sang ngày OFF: Tự động hoán đổi ngày OFF, giữ đúng 7 ngày làm & 5 ngày OFF', async () => {
    // Đổi từ ngày WORKING (2026-09-10) sang ngày OFF (2026-09-11) với ca 'CA_CHIEU'
    const swapRes = await fetch(`${BASE}/api/training/shift-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: testEmployeeId,
        fromDate: '2026-09-10',
        toDate: '2026-09-11',
        toShift: 'CA_CHIEU',
        reason: 'Em bận việc ngày 10 nên xin chuyển sang ngày 11 (đang là ngày OFF)',
        isAdd: false
      })
    });

    const swapData = await swapRes.json();
    assert.strictEqual(swapRes.status, 200, `Yêu cầu đổi ca thành công 200: ${JSON.stringify(swapData)}`);
    assert.strictEqual(swapData.success, true, 'Đổi ca thành công');
    assert.strictEqual(swapData.isAutoSwap, true, 'Được nhận diện là Tự Động Hoán Đổi OFF');
    assert.strictEqual(swapData.autoApproved, true, 'Hệ thống tự động duyệt ngay lập tức');

    // Kiểm tra danh sách 5 ngày OFF mới của nhân viên
    assert.strictEqual(swapData.registeredOffDates.length, 5, 'Vẫn luôn có chính xác 5 ngày OFF');
    assert.ok(swapData.registeredOffDates.includes('2026-09-10'), 'Ngày 2026-09-10 đã chuyển thành ngày OFF');
    assert.ok(!swapData.registeredOffDates.includes('2026-09-11'), 'Ngày 2026-09-11 không còn là ngày OFF');

    // Kiểm tra lịch biểu sau khi đổi ca
    const schedRes = await fetch(`${BASE}/api/schedules?branchId=CN1&startDate=2026-09-10&endDate=2026-09-21`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const scheds = await schedRes.json();
    const empSchedules = scheds.filter(s => s.employeeId === testEmployeeId);

    const trialDays = [];
    empSchedules.forEach(s => {
      (s.days || []).forEach(d => {
        if (d.date >= '2026-09-10' && d.date <= '2026-09-21') {
          trialDays.push(d);
        }
      });
    });

    const workingCount = trialDays.filter(s => s.status === 'WORKING').length;
    const offCount = trialDays.filter(s => s.status === 'OFF').length;

    assert.strictEqual(workingCount, 7, 'Sau khi hoán đổi: Vẫn luôn có chính xác 7 ngày WORKING');
    assert.strictEqual(offCount, 5, 'Sau khi hoán đổi: Vẫn luôn có chính xác 5 ngày OFF');

    const day10 = trialDays.find(s => s.date === '2026-09-10');
    assert.strictEqual(day10.status, 'OFF', 'Ngày 2026-09-10 chuyển thành OFF');

    const day11 = trialDays.find(s => s.date === '2026-09-11');
    assert.strictEqual(day11.status, 'WORKING', 'Ngày 2026-09-11 chuyển thành WORKING');
    assert.strictEqual(day11.shift, 'CA_CHIEU', 'Ngày 2026-09-11 có ca làm là CA_CHIEU');

    // Kiểm tra thông báo Admin đã ghi nhận hành động hoán đổi ngày OFF
    const notifRes = await fetch(`${BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const notifs = await notifRes.json();
    const swapNotif = notifs.find(n => n.employeeId === testEmployeeId && n.title && n.title.includes('Tự động đổi ca'));
    assert.ok(swapNotif, 'Admin nhận được thông báo tự động đổi ca & hoán đổi ngày OFF');
  });

  it('4. Nhân viên gửi yêu cầu đổi thiết bị: Admin & HR nhận thông báo realtime', async () => {
    const devRes = await fetch(`${BASE}/api/auth/device-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: testEmployeeId,
        reason: 'Em mới đổi sang điện thoại mới',
        deviceId: 'DEV-TEST-PHONE-123'
      })
    });

    const devData = await devRes.json();
    assert.strictEqual(devRes.status, 200, `Gửi yêu cầu đổi thiết bị trả về 200: ${JSON.stringify(devData)}`);
    assert.strictEqual(devData.success, true, 'Gửi yêu cầu đổi thiết bị thành công');

    const notifRes = await fetch(`${BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const notifs = await notifRes.json();
    const devNotif = notifs.find(n => n.employeeId === testEmployeeId && n.title && n.title.includes('Yêu cầu Đổi thiết bị'));
    assert.ok(devNotif, 'Admin nhận được thông báo yêu cầu đổi thiết bị của nhân viên');
  });

  it('5. Nhân viên nộp bài thi E-learning: Admin & HR nhận thông báo kết quả realtime', async () => {
    // 1. Mở đề thi 25 câu
    const openRes = await fetch(`${BASE}/api/quiz/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-is-test': 'true' },
      body: JSON.stringify({ employeeId: testEmployeeId, force: true, isTest: true })
    });
    assert.strictEqual(openRes.status, 200);
    const openData = await openRes.json();
    assert.ok(openData.courseId, 'Mở đề thi thành công');

    // 2. Nộp bài với 25 câu trả lời
    const answers = Array(25).fill(1); // Chọn đáp án
    const submitRes = await fetch(`${BASE}/api/courses/${openData.courseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testEmployeeId,
        answers,
        timeSpent: 65,
        questionIds: openData.questionIds,
        isTest: true
      })
    });

    const submitData = await submitRes.json();
    assert.strictEqual(submitRes.status, 200, `Nộp bài thi thành công: ${JSON.stringify(submitData)}`);
    assert.strictEqual(submitData.success, true);

    const notifRes = await fetch(`${BASE}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const notifs = await notifRes.json();
    const quizNotif = notifs.find(n => n.employeeId === testEmployeeId && n.title && (n.title.includes('Bài TEST') || n.title.includes('Bài thi')));
    assert.ok(quizNotif, 'Admin nhận được thông báo khi nhân viên nộp bài thi');
  });
});
