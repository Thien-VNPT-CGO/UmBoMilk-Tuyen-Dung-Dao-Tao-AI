const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

test('Training Multi-Shift Scheduling (2-3 ca/ngày), OFF Day Constraint & Auto Attendance Recognition Suite', async (t) => {
  let adminToken = '';
  let testTrainingEmp = null;
  let testTrainingToken = '';
  let workingDate = '';
  let offDate = '';
  const dummyImage = 'data:image/jpeg;base64,' + 'A'.repeat(120);

  // 1. Admin Login
  const auth = await login('admin', 'Master@@2027');
  adminToken = auth.token;
  assert.ok(adminToken, 'Admin login success');

  // Helper create employee
  async function createTestEmployee(prefix, status = 'TRAINING', shift = 'CA_SANG') {
    const phone = '0977' + Math.floor(100000 + Math.random() * 900000);
    const body = {
      name: `Test MultiShift ${prefix} ${Date.now()}`,
      phone: phone,
      cccd: '079' + Math.floor(100000000 + Math.random() * 900000000),
      branchId: 'CN1',
      shift: shift,
      status: status,
      role: 'Staff',
      salaryRate: 25000,
      isTest: true
    };
    const res = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'x-is-test': 'true'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    const emp = data.employee;
    const key = data.key;

    // Login employee
    const empLogin = await fetch(`${BASE}/api/auth/employee-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: emp.employeeId, key: key?.key, deviceId: `DEV-TEST-${prefix}` })
    });
    const empData = await empLogin.json();
    return { emp, key, token: empData.token };
  }

  const tr = await createTestEmployee('TrainingMulti', 'TRAINING', 'CA_SANG');
  testTrainingEmp = tr.emp;
  testTrainingToken = tr.token;
  assert.ok(testTrainingEmp && testTrainingToken, 'Tạo nhân viên training và đăng nhập thành công');

  // Đăng ký 5 ngày OFF ban đầu để xác định rõ ngày WORKING và ngày OFF
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const startD = new Date(todayStr);
  const trialDays = [];
  for (let i = 0; i < 12; i++) {
    const cur = new Date(startD);
    cur.setDate(startD.getDate() + i);
    trialDays.push(cur.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  }

  // 5 ngày OFF: ngày thứ 2, 4, 6, 8, 10
  const offDates5 = [trialDays[1], trialDays[3], trialDays[5], trialDays[7], trialDays[9]];
  const offRes = await fetch(`${BASE}/api/off-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
    body: JSON.stringify({
      employeeId: testTrainingEmp.employeeId,
      dates: offDates5,
      reason: 'Đăng ký 5 ngày OFF thử việc',
      isTest: true
    })
  });
  assert.strictEqual(offRes.status, 200, 'Đăng ký 5 ngày OFF thành công');

  workingDate = trialDays[2]; // Ngày thứ 3 (chắc chắn là WORKING)
  offDate = trialDays[1]; // Ngày thứ 2 (chắc chắn là OFF)

  // ----------------------------------------------------------------
  // Test 1: Chặn thêm ca vào ngày nghỉ OFF
  // ----------------------------------------------------------------
  await t.test('1. Thêm ca vào ngày nghỉ OFF -> Bị từ chối 400 Bad Request', async () => {
    const addOffRes = await fetch(`${BASE}/api/training/shift-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        date: offDate,
        isAdd: true,
        toShift: 'CA_CHIEU',
        reason: 'Muốn đi làm thêm ca vào ngày OFF',
        isTest: true
      })
    });
    const addOffData = await addOffRes.json();
    assert.strictEqual(addOffRes.status, 400, `Phải trả về 400: ${JSON.stringify(addOffData)}`);
    assert.ok(addOffData.error.includes('Không thể thêm ca vào ngày nghỉ OFF'), 'Thông báo lỗi chặn ngày nghỉ OFF chuẩn xác');
  });

  // ----------------------------------------------------------------
  // Test 2: Thêm ca thứ 2 thành công trên ngày làm việc
  // ----------------------------------------------------------------
  let shift2ReqId = '';
  await t.test('2. Thêm ca thứ 2 trên ngày làm việc (WORKING) -> Thành công và HR duyệt -> 2 ca/ngày', async () => {
    const addRes = await fetch(`${BASE}/api/training/shift-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        date: workingDate,
        isAdd: true,
        toShift: 'CA_CHIEU',
        reason: 'Muốn học thêm ca chiều để rút ngắn thử việc',
        isTest: true
      })
    });
    const addData = await addRes.json();
    assert.strictEqual(addRes.status, 200, `Thêm ca 2 gửi thành công: ${JSON.stringify(addData)}`);
    assert.strictEqual(addData.request.type, 'ADD_SHIFT');
    assert.strictEqual(addData.request.status, 'PENDING');
    shift2ReqId = addData.request.id;

    // HR Duyệt đơn thêm ca thứ 2
    const approveRes = await fetch(`${BASE}/api/training/shift-change/${shift2ReqId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' }
    });
    const approveData = await approveRes.json();
    assert.strictEqual(approveRes.status, 200, `HR duyệt ca 2 thành công: ${JSON.stringify(approveData)}`);

    // Kiểm tra lịch nhân viên trên ngày đó: đã có 2 ca
    const schedRes = await fetch(`${BASE}/api/schedules?employeeId=${testTrainingEmp.employeeId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const schedList = await schedRes.json();
    const day = schedList.flatMap(s => s.days).find(d => d.date === workingDate);
    assert.ok(day, 'Tìm thấy ngày trong lịch');
    assert.strictEqual(day.status, 'WORKING');
    assert.ok(day.shift === 'CA_SANG' || day.shift === 'CA_CHIEU');
    assert.strictEqual(day.shift2, 'CA_CHIEU', 'Lịch đã lưu ca thứ 2 là CA_CHIEU');
    assert.ok(Array.isArray(day.shifts) && day.shifts.includes('CA_SANG') && day.shifts.includes('CA_CHIEU'), 'day.shifts lưu đủ 2 ca');
  });

  // ----------------------------------------------------------------
  // Test 3: Thêm ca thứ 3 thành công trên cùng ngày làm việc
  // ----------------------------------------------------------------
  let shift3ReqId = '';
  await t.test('3. Thêm ca thứ 3 trên cùng ngày làm việc -> Thành công và HR duyệt -> 3 ca/ngày', async () => {
    const add3Res = await fetch(`${BASE}/api/training/shift-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        date: workingDate,
        isAdd: true,
        toShift: 'CA_TOI',
        reason: 'Muốn học thêm ca tối để đẩy nhanh tối đa tiến độ',
        isTest: true
      })
    });
    const add3Data = await add3Res.json();
    assert.strictEqual(add3Res.status, 200, `Thêm ca 3 gửi thành công: ${JSON.stringify(add3Data)}`);
    assert.strictEqual(add3Data.request.type, 'ADD_SHIFT');
    shift3ReqId = add3Data.request.id;

    // HR Duyệt đơn thêm ca thứ 3
    const approve3Res = await fetch(`${BASE}/api/training/shift-change/${shift3ReqId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' }
    });
    const approve3Data = await approve3Res.json();
    assert.strictEqual(approve3Res.status, 200, `HR duyệt ca 3 thành công: ${JSON.stringify(approve3Data)}`);

    // Kiểm tra lịch nhân viên trên ngày đó: đã có đủ 3 ca
    const schedRes = await fetch(`${BASE}/api/schedules?employeeId=${testTrainingEmp.employeeId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const schedList = await schedRes.json();
    const day = schedList.flatMap(s => s.days).find(d => d.date === workingDate);
    assert.ok(day, 'Tìm thấy ngày trong lịch');
    assert.strictEqual(day.status, 'WORKING');
    assert.strictEqual(day.shift3, 'CA_TOI', 'Lịch đã lưu ca thứ 3 là CA_TOI');
    assert.ok(Array.isArray(day.shifts) && day.shifts.length === 3, 'day.shifts lưu đủ 3 ca');
    assert.ok(day.shifts.includes('CA_SANG') && day.shifts.includes('CA_CHIEU') && day.shifts.includes('CA_TOI'));
  });

  // ----------------------------------------------------------------
  // Test 4: Chặn trùng ca hoặc vượt quá 3 ca
  // ----------------------------------------------------------------
  await t.test('4. Chặn thêm ca thứ 4 hoặc trùng ca trên ngày đã có 3 ca -> Bị từ chối 400', async () => {
    const dupRes = await fetch(`${BASE}/api/training/shift-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        date: workingDate,
        isAdd: true,
        toShift: 'CA_SANG',
        reason: 'Thêm ca trùng',
        isTest: true
      })
    });
    const dupData = await dupRes.json();
    assert.strictEqual(dupRes.status, 400);
    assert.ok(dupData.error.includes('đã có ca CA_SANG') || dupData.error.includes('tối đa 3 ca'), 'Chặn thêm trùng ca');
  });

  // ----------------------------------------------------------------
  // Test 5: Điểm danh đa ca trong 1 ngày (Check-in & Check-out độc lập từng ca)
  // ----------------------------------------------------------------
  await t.test('5. Tự động nhận diện ca và sẵn sàng check-in + check-out 2 ca trên cùng 1 ngày', async () => {
    // Thêm ca chiều vào ngày hôm nay (todayStr) nếu todayStr đang là WORKING
    const schedRes = await fetch(`${BASE}/api/schedules?employeeId=${testTrainingEmp.employeeId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const schedList = await schedRes.json();
    let todayDay = schedList.flatMap(s => s.days).find(d => d.date === todayStr);

    if (todayDay && todayDay.status === 'WORKING') {
      const addTodayRes = await fetch(`${BASE}/api/training/shift-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
        body: JSON.stringify({
          employeeId: testTrainingEmp.employeeId,
          date: todayStr,
          isAdd: true,
          toShift: 'CA_CHIEU',
          reason: 'Thêm ca chiều hôm nay',
          isTest: true
        })
      });
      const addTodayData = await addTodayRes.json();
      if (addTodayRes.status === 200 && addTodayData.request?.id) {
        await fetch(`${BASE}/api/training/shift-change/${addTodayData.request.id}/approve`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' }
        });
      }
    }

    // A. Check-in Ca 1 (CA_SANG) lúc 07:05
    const in1Res = await fetch(`${BASE}/api/attendance/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        gps: '10.7960, 106.6910',
        address: '130 Vạn Kiếp, P.3, Bình Thạnh',
        image: dummyImage,
        shift: 'CA_SANG',
        isCameraCapture: true,
        mockTime: `${todayStr}T07:05:00+07:00`,
        isTest: true
      })
    });
    const in1Data = await in1Res.json();
    assert.strictEqual(in1Res.status, 200, `Check-in Ca 1 thành công: ${JSON.stringify(in1Data)}`);
    assert.strictEqual(in1Data.shift, 'CA_SANG');

    // B. Check-out Ca 1 (CA_SANG) lúc 12:05
    const out1Res = await fetch(`${BASE}/api/attendance/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        gps: '10.7960, 106.6910',
        address: '130 Vạn Kiếp, P.3, Bình Thạnh',
        image: dummyImage,
        shift: 'CA_SANG',
        isCameraCapture: true,
        mockTime: `${todayStr}T12:05:00+07:00`,
        isTest: true
      })
    });
    const out1Data = await out1Res.json();
    assert.strictEqual(out1Res.status, 200, `Check-out Ca 1 thành công: ${JSON.stringify(out1Data)}`);
    assert.strictEqual(out1Data.status, 'COMPLETED');

    // C. Check-in Ca 2 (CA_CHIEU) lúc 12:10 trên CÙNG NGÀY -> Hệ thống cho phép và tự nhận diện
    const in2Res = await fetch(`${BASE}/api/attendance/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        gps: '10.7960, 106.6910',
        address: '130 Vạn Kiếp, P.3, Bình Thạnh',
        image: dummyImage,
        shift: 'CA_CHIEU',
        isCameraCapture: true,
        mockTime: `${todayStr}T12:10:00+07:00`,
        isTest: true
      })
    });
    const in2Data = await in2Res.json();
    assert.strictEqual(in2Res.status, 200, `Check-in Ca 2 cùng ngày thành công (không bị lỗi đã check-in): ${JSON.stringify(in2Data)}`);
    assert.strictEqual(in2Data.shift, 'CA_CHIEU');

    // D. Check-out Ca 2 (CA_CHIEU) lúc 18:02
    const out2Res = await fetch(`${BASE}/api/attendance/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        gps: '10.7960, 106.6910',
        address: '130 Vạn Kiếp, P.3, Bình Thạnh',
        image: dummyImage,
        shift: 'CA_CHIEU',
        isCameraCapture: true,
        mockTime: `${todayStr}T18:02:00+07:00`,
        isTest: true
      })
    });
    const out2Data = await out2Res.json();
    assert.strictEqual(out2Res.status, 200, `Check-out Ca 2 thành công: ${JSON.stringify(out2Data)}`);
    assert.strictEqual(out2Data.status, 'COMPLETED');

    // Kiểm tra danh sách điểm danh: có 2 bản ghi COMPLETED trên cùng ngày hôm nay
    const allAttRes = await fetch(`${BASE}/api/attendances?employeeId=${testTrainingEmp.employeeId}&date=${todayStr}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const allAtts = await allAttRes.json();
    const todayCompleted = allAtts.filter(a => a.date === todayStr && a.status === 'COMPLETED');
    assert.ok(todayCompleted.length >= 2, `Có ít nhất 2 ca đã hoàn thành trên cùng ngày: ${todayCompleted.length}`);
    assert.ok(todayCompleted.some(a => a.shift === 'CA_SANG'), 'Có Ca Sáng hoàn thành');
    assert.ok(todayCompleted.some(a => a.shift === 'CA_CHIEU'), 'Có Ca Chiều hoàn thành');
  });

  // Cleanup test data
  await fetch(`${BASE}/api/admin/clean-test-data`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
});
