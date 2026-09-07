const test = require('node:test');
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

test('Comprehensive Attendance, Training Shifts, 5 Days OFF & HR Approval Center Suite', async (t) => {
  let adminToken = '';
  let initialEmployeesCount = 0;
  let testTrainingEmp = null;
  let testOfficialEmp1 = null;
  let testOfficialEmp2 = null;
  let testTrainingToken = '';
  let testOfficialToken1 = '';
  let testOfficialToken2 = '';

  // Setup: Get admin token and record initial count
  const auth = await login('admin', 'Master@@2027');
  adminToken = auth.token;
  assert.ok(adminToken, 'Admin đăng nhập thành công');

  if (fs.existsSync(DATA_FILE)) {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    initialEmployeesCount = (db.employees || []).length;
  }

  // Cleanup any leftovers from prior runs
  await fetch(`${BASE}/api/admin/clean-test-data`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  // Helper to create employee
  async function createTestEmployee(prefix, status = 'TRAINING', shift = 'CA_SANG') {
    const phone = '0988' + Math.floor(100000 + Math.random() * 900000);
    const body = {
      name: `Test ${prefix} ${Date.now()}`,
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
    assert.ok(res.status === 200 || res.status === 201, `Tạo nhân viên ${prefix} thất bại: ${JSON.stringify(data)}`);
    const emp = data.employee || data;
    const key = data.key;

    // Login employee
    const empLogin = await fetch(`${BASE}/api/auth/employee-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: emp.employeeId, key: key?.key, deviceId: `DEV-TEST-${prefix}` })
    });
    const empData = await empLogin.json();
    assert.strictEqual(empLogin.status, 200, `Employee login error: ${JSON.stringify(empData)}`);

    return { emp, key, token: empData.token };
  }

  // Create test employees
  const tr = await createTestEmployee('Training', 'TRAINING', 'CA_SANG');
  testTrainingEmp = tr.emp;
  testTrainingToken = tr.token;

  const off1 = await createTestEmployee('Official1', 'OFFICIAL', 'CA_SANG');
  testOfficialEmp1 = off1.emp;
  testOfficialToken1 = off1.token;

  const off2 = await createTestEmployee('Official2', 'OFFICIAL', 'CA_CHIEU');
  testOfficialEmp2 = off2.emp;
  testOfficialToken2 = off2.token;

  const dummyImage = 'data:image/jpeg;base64,' + 'A'.repeat(120);

  // -------------------------------------------------------------
  // Test 1: Check-in Official window logic
  // -------------------------------------------------------------
  await t.test('1. Check-in Official window: mở trước 30p, không đóng sau 60p, tự động sang checkout trước 1h kết thúc', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

    // Case 1A: Check-in quá sớm (> 30 phút trước ca, ví dụ 06:20 ca CA_SANG 07:00) -> Bị từ chối
    const earlyCheckin = await fetch(`${BASE}/api/attendance/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testOfficialToken1}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testOfficialEmp1.employeeId,
        gps: '10.7960, 106.6910',
        address: '130 Vạn Kiếp, P.3, Bình Thạnh',
        image: dummyImage,
        shift: 'CA_SANG',
        isCameraCapture: true,
        mockTime: `${today}T06:20:00+07:00`,
        isTest: true
      })
    });
    const earlyData = await earlyCheckin.json();
    assert.strictEqual(earlyCheckin.status, 400);
    assert.ok(earlyData.error.includes('mở trước 30 phút') || earlyData.error.includes('Chưa đến giờ'), 'Báo lỗi chưa mở check-in trước 30p');

    // Case 1B: Check-in muộn sau 60 phút (ví dụ 08:15, ca bắt đầu 07:00) -> KHÔNG đóng, vẫn được check-in kèm phạt
    const lateCheckin = await fetch(`${BASE}/api/attendance/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testOfficialToken1}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testOfficialEmp1.employeeId,
        gps: '10.7960, 106.6910',
        address: '130 Vạn Kiếp, P.3, Bình Thạnh',
        image: dummyImage,
        shift: 'CA_SANG',
        isCameraCapture: true,
        mockTime: `${today}T08:15:00+07:00`,
        isTest: true
      })
    });
    const lateData = await lateCheckin.json();
    assert.strictEqual(lateCheckin.status, 200, `Check-in muộn 75p vẫn được duyệt: ${JSON.stringify(lateData)}`);
    const violations = lateData.violations || (lateData.attendance && lateData.attendance.violations) || [];
    assert.ok(violations.some(v => v.includes('TRE') || v.includes('LATE')), 'Ghi nhận vi phạm đi trễ');

    // Case 1C: Nhân viên chính thức khác chưa check in, đến giờ shiftEnd - 60m (11:15 của ca 07:00-12:00)
    // Check-in sẽ bị tự động đóng và thông báo chuyển sang check-out
    const off3 = await createTestEmployee('Official3', 'OFFICIAL', 'CA_SANG');

    const closeCheckinRes = await fetch(`${BASE}/api/attendance/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${off3.token}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: off3.emp.employeeId,
        gps: '10.7960, 106.6910',
        address: '130 Vạn Kiếp, P.3, Bình Thạnh',
        image: dummyImage,
        shift: 'CA_SANG',
        isCameraCapture: true,
        mockTime: `${today}T11:15:00+07:00`,
        isTest: true
      })
    });
    const closeCheckinData = await closeCheckinRes.json();
    assert.strictEqual(closeCheckinRes.status, 400);
    assert.ok(closeCheckinData.error.includes('đã tự động đóng Check-in') || closeCheckinData.error.includes('chuyển sang Check-out'), 'Đóng check-in khi trước giờ kết thúc 1 tiếng');

    // Case 1D: Nhân viên chưa check-in bấm check-out lúc 11:20 -> Tự động xử lý phạt KHONG_CHECKIN thay vì chặn lỗi 400
    const autoCheckoutRes = await fetch(`${BASE}/api/attendance/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${off3.token}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: off3.emp.employeeId,
        gps: '10.7960, 106.6910',
        address: '130 Vạn Kiếp, P.3, Bình Thạnh',
        image: dummyImage,
        shift: 'CA_SANG',
        isCameraCapture: true,
        mockTime: `${today}T11:20:00+07:00`,
        isTest: true
      })
    });
    const autoCheckoutData = await autoCheckoutRes.json();
    assert.strictEqual(autoCheckoutRes.status, 200, `Check-out tự động ghi nhận khi chưa check-in: ${JSON.stringify(autoCheckoutData)}`);
    const outViolations = autoCheckoutData.violations || (autoCheckoutData.attendance && autoCheckoutData.attendance.violations) || [];
    assert.ok(outViolations.includes('KHONG_CHECKIN'), 'Ghi nhận vi phạm KHONG_CHECKIN');
  });

  // -------------------------------------------------------------
  // Test 2: Training employee shift change & add shift history
  // -------------------------------------------------------------
  let trainingShiftReqId = '';
  let trainingAddShiftReqId = '';
  const futureDate1 = '2026-09-12';
  const futureDate2 = '2026-09-13';

  await t.test('2. Nhân viên Training: Đổi ca & Thêm ca lưu lịch sử đầy đủ và trả về cho web app', async () => {
    // 2A: Yêu cầu Đổi ca (CHANGE_SHIFT)
    const changeRes = await fetch(`${BASE}/api/training/shift-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        date: futureDate1,
        fromShift: 'CA_SANG',
        toShift: 'CA_CHIEU',
        reason: 'Bận học sáng, xin đổi sang ca chiều',
        isTest: true
      })
    });
    const changeData = await changeRes.json();
    assert.strictEqual(changeRes.status, 200, `Gửi yêu cầu đổi ca training: ${JSON.stringify(changeData)}`);
    assert.strictEqual(changeData.request.type, 'CHANGE_SHIFT');
    assert.strictEqual(changeData.request.status, 'PENDING');
    trainingShiftReqId = changeData.request.id;

    // 2B: Yêu cầu Thêm ca (ADD_SHIFT)
    const addRes = await fetch(`${BASE}/api/training/shift-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        date: futureDate2,
        isAdd: true,
        toShift: 'CA_TOI',
        reason: 'Muốn học thêm kỹ năng ca tối',
        isTest: true
      })
    });
    const addData = await addRes.json();
    assert.strictEqual(addRes.status, 200, `Gửi yêu cầu thêm ca training: ${JSON.stringify(addData)}`);
    assert.strictEqual(addData.request.type, 'ADD_SHIFT');
    assert.strictEqual(addData.request.status, 'PENDING');
    trainingAddShiftReqId = addData.request.id;

    // 2C: Lấy lịch sử yêu cầu của nhân viên training qua API
    const historyRes = await fetch(`${BASE}/api/training/shift-change?employeeId=${testTrainingEmp.employeeId}`, {
      headers: { 'Authorization': `Bearer ${testTrainingToken}` }
    });
    const historyData = await historyRes.json();
    assert.strictEqual(historyRes.status, 200);
    assert.ok(Array.isArray(historyData));
    const myReqs = historyData.filter(r => r.employeeId === testTrainingEmp.employeeId);
    assert.strictEqual(myReqs.length, 2, 'Lịch sử hiển thị đủ 2 yêu cầu ĐỔI CA và THÊM CA');
    assert.ok(myReqs.some(r => r.type === 'CHANGE_SHIFT'));
    assert.ok(myReqs.some(r => r.type === 'ADD_SHIFT'));
  });

  // -------------------------------------------------------------
  // Test 3: Training employee 5 days OFF registration
  // -------------------------------------------------------------
  await t.test('3. Nhân viên Training: Đăng ký 5 ngày OFF lưu vào hồ sơ và trả về registeredOffDates', async () => {
    const offDates = [
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19'
    ];

    const offRes = await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testTrainingToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        employeeId: testTrainingEmp.employeeId,
        dates: offDates,
        reason: '5 ngày nghỉ học kỳ đào tạo',
        isTest: true
      })
    });
    const offData = await offRes.json();
    assert.strictEqual(offRes.status, 200, `Đăng ký 5 ngày OFF: ${JSON.stringify(offData)}`);

    // Kiểm tra thông tin nhân viên trả về qua /api/employee/me
    const meRes = await fetch(`${BASE}/api/employee/me`, {
      headers: { 'Authorization': `Bearer ${testTrainingToken}` }
    });
    const meData = await meRes.json();
    assert.strictEqual(meRes.status, 200);
    const empObj = meData.employee || meData;
    assert.strictEqual(empObj.trainingOffDays, 5, 'trainingOffDays đúng 5');
    assert.ok(Array.isArray(empObj.registeredOffDates), 'Có mảng registeredOffDates');
    assert.strictEqual(empObj.registeredOffDates.length, 5, 'Lưu đủ 5 ngày');
    assert.deepStrictEqual(empObj.registeredOffDates, offDates);
  });

  // -------------------------------------------------------------
  // Test 4: HR Web App Approval Center
  // -------------------------------------------------------------
  await t.test('4. Web app HR: Duyệt/Từ chối yêu cầu của Nhân viên Training và Nhân viên Chính thức', async () => {
    // 4A: HR Duyệt yêu cầu đổi ca của nhân viên training
    const trApproveRes = await fetch(`${BASE}/api/training/shift-change/${trainingShiftReqId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const trApproveText = await trApproveRes.text();
    let trApproveData;
    try { trApproveData = JSON.parse(trApproveText); } catch(e) { throw new Error(`4A failed on ID '${trainingShiftReqId}': status=${trApproveRes.status} body=${trApproveText.slice(0, 200)}`); }
    assert.strictEqual(trApproveRes.status, 200, `HR duyệt đổi ca training: ${JSON.stringify(trApproveData)}`);
    assert.strictEqual(trApproveData.request.status, 'APPROVED');

    // 4B: HR Từ chối yêu cầu thêm ca của nhân viên training
    const trRejectRes = await fetch(`${BASE}/api/training/shift-change/${trainingAddShiftReqId}/reject`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const trRejectText = await trRejectRes.text();
    let trRejectData;
    try { trRejectData = JSON.parse(trRejectText); } catch(e) { throw new Error(`4B failed on ID '${trainingAddShiftReqId}': status=${trRejectRes.status} body=${trRejectText.slice(0, 200)}`); }
    assert.strictEqual(trRejectRes.status, 200, `HR từ chối thêm ca training: ${JSON.stringify(trRejectData)}`);
    assert.strictEqual(trRejectData.request.status, 'REJECTED');

    // 4C: Nhân viên chính thức tạo yêu cầu đổi ca (<24h)
    const swapCreateRes = await fetch(`${BASE}/api/shift-swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testOfficialToken1}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        requesterId: testOfficialEmp1.employeeId,
        date: '2026-09-20',
        fromShift: 'CA_SANG',
        toShift: 'CA_CHIEU',
        targetEmployeeId: testOfficialEmp2.employeeId,
        reason: 'Có việc gia đình chiều 20/09',
        isTest: true
      })
    });
    const swapText = await swapCreateRes.text();
    let swapData;
    try { swapData = JSON.parse(swapText); } catch(e) { throw new Error(`4C create failed: status=${swapCreateRes.status} body=${swapText.slice(0, 300)}`); }
    assert.strictEqual(swapCreateRes.status, 200, `Tạo yêu cầu đổi ca chính thức: ${JSON.stringify(swapData)}`);
    const swapId = swapData.request?.id || swapData.swap?.id || swapData.id;
    assert.ok(swapId, `Phải có swapId hợp lệ, nhận được: ${JSON.stringify(swapData)}`);

    // 4D: HR Duyệt yêu cầu đổi ca chính thức
    const hrSwapApprove = await fetch(`${BASE}/api/shift-swap/${swapId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const hrSwapApproveText = await hrSwapApprove.text();
    let hrSwapApproveData;
    try { hrSwapApproveData = JSON.parse(hrSwapApproveText); } catch(e) { throw new Error(`4D failed on ID '${swapId}': status=${hrSwapApprove.status} body=${hrSwapApproveText.slice(0, 200)}`); }
    assert.strictEqual(hrSwapApprove.status, 200, `HR duyệt đổi ca chính thức: ${JSON.stringify(hrSwapApproveData)}`);
    const appReq = hrSwapApproveData.request || hrSwapApproveData.swap;
    assert.strictEqual(appReq.status, 'APPROVED');

    // 4E: Tạo yêu cầu đổi ca thứ 2 và HR Từ chối
    const swapCreateRes2 = await fetch(`${BASE}/api/shift-swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testOfficialToken1}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        requesterId: testOfficialEmp1.employeeId,
        date: '2026-09-21',
        fromShift: 'CA_SANG',
        toShift: 'CA_TOI',
        targetEmployeeId: testOfficialEmp2.employeeId,
        reason: 'Muốn đổi ca tối',
        isTest: true
      })
    });
    const swapText2 = await swapCreateRes2.text();
    let swapData2;
    try { swapData2 = JSON.parse(swapText2); } catch(e) { throw new Error(`4E create failed: status=${swapCreateRes2.status} body=${swapText2.slice(0, 300)}`); }
    const swapId2 = swapData2.request?.id || swapData2.swap?.id || swapData2.id;
    assert.ok(swapId2, `Phải có swapId2 hợp lệ, nhận được: ${JSON.stringify(swapData2)}`);

    const hrSwapReject = await fetch(`${BASE}/api/shift-swap/${swapId2}/reject`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const hrSwapRejectText = await hrSwapReject.text();
    let hrSwapRejectData;
    try { hrSwapRejectData = JSON.parse(hrSwapRejectText); } catch(e) { throw new Error(`4E failed on ID '${swapId2}': status=${hrSwapReject.status} body=${hrSwapRejectText.slice(0, 200)}`); }
    assert.strictEqual(hrSwapReject.status, 200, `HR từ chối đổi ca chính thức: ${JSON.stringify(hrSwapRejectData)}`);
    const rejReq = hrSwapRejectData.request || hrSwapRejectData.swap;
    assert.strictEqual(rejReq.status, 'REJECTED');
  });

  // Cleanup all test data
  await fetch(`${BASE}/api/admin/clean-test-data`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  // Verify no test employees remain in db.json
  if (fs.existsSync(DATA_FILE)) {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const testEmps = (db.employees || []).filter(e => e.isTest || (e.name && e.name.toLowerCase().includes('test')));
    assert.strictEqual(testEmps.length, 0, 'data/db.json không chứa nhân viên test sau khi dọn dẹp');
    assert.strictEqual((db.employees || []).length, initialEmployeesCount, 'Số lượng nhân viên thật trong db.json được bảo tồn nguyên vẹn');
  }
});
