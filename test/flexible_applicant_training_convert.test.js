const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
let adminToken = '';
const TEST_PHONE = '09' + Math.floor(10000000 + Math.random() * 89999999);
let createdApplicantId = '';
let createdEmployeeId = '';

describe('Flexible Applicant Training Convert (>= 2 Ca / >= 2 Chi Nhánh) Suite', () => {
  before(async () => {
    // 1. Login admin
    let loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Master@@2027' })
    });
    if (loginRes.status !== 200) {
      loginRes = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
      });
    }
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200, 'Admin login thành công');
    adminToken = loginData.token;
  });

  after(async () => {
    // Dọn dẹp sạch sẽ test data khỏi db.json
    try {
      const dbPath = path.join(__dirname, '..', 'data', 'db.json');
      if (fs.existsSync(dbPath)) {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (createdApplicantId) {
          db.applicants = db.applicants.filter(a => a.id !== createdApplicantId && a.phone !== TEST_PHONE);
        }
        if (createdEmployeeId) {
          db.employees = db.employees.filter(e => e.employeeId !== createdEmployeeId && e.phone !== TEST_PHONE);
          db.keys = db.keys.filter(k => k.employeeId !== createdEmployeeId);
          db.schedules = db.schedules.filter(s => s.employeeId !== createdEmployeeId);
        }
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
      }
    } catch (e) {
      console.error('Cleanup error:', e.message);
    }
  });

  it('1. Đăng ký ứng viên với Ca: "Có thể làm từ 2 Ca trở lên" và Chi nhánh: "Có thể làm 2 chi nhánh trở lên"', async () => {
    const regRes = await fetch(`${BASE}/api/applicants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Nguyễn Linh Hoạt TEST',
        phone: TEST_PHONE,
        email: 'linhhoat.test@gmail.com',
        shiftPreference: 'Có thể làm từ 2 Ca trở lên',
        branchPreference: 'Có thể làm 2 chi nhánh trở lên',
        gender: 'Nữ',
        birthYear: '2004',
        education: 'Đại học',
        hometown: 'TP.HCM',
        experience: 'Đã từng làm FNB',
        handling: 'Hỗ trợ đổi ca linh hoạt',
        facebook: 'https://fb.com/linhhoat',
        source: 'Google Form'
      })
    });

    const regData = await regRes.json();
    assert.strictEqual(regRes.status, 200, 'Tạo ứng viên thành công');
    assert.ok(regData.id, 'Có id ứng viên');
    createdApplicantId = regData.id;

    // Kiểm tra thông tin ban đầu lưu đúng văn bản linh hoạt
    assert.strictEqual(regData.shiftText, 'Có thể làm từ 2 Ca trở lên');
    assert.strictEqual(regData.branchText, 'Có thể làm 2 chi nhánh trở lên');
    assert.strictEqual(regData.status, 'NEW_APPLICANT');
  });

  it('2. HR bấm chức năng Training và cập nhật Ca làm việc = CA_SANG, Chi nhánh = CN1', async () => {
    // Chuyển sang PASS phỏng vấn trước
    await fetch(`${BASE}/api/applicants/${createdApplicantId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'PASS' })
    });

    // HR thực hiện chuyển Training với Ca chỉ định = CA_SANG và Chi nhánh = CN1
    const convertRes = await fetch(`${BASE}/api/applicants/${createdApplicantId}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        startDate: '2026-09-10',
        trainingDays: 12,
        shift: 'CA_SANG',
        branchId: 'CN1'
      })
    });

    const convertData = await convertRes.json();
    assert.strictEqual(convertRes.status, 200, 'Chuyển training thành công');
    assert.ok(convertData.employee, 'Có dữ liệu nhân viên mới');
    assert.ok(convertData.key, 'Có key kích hoạt cho nhân viên');
    createdEmployeeId = convertData.employee.employeeId;

    // Kiểm tra nhân viên Training mới tạo ra đúng Ca và Chi nhánh HR đã chọn
    assert.strictEqual(convertData.employee.branchId, 'CN1', 'Chi nhánh nhân viên training là CN1');
    assert.strictEqual(convertData.employee.shift, 'CA_SANG', 'Ca nhân viên training là CA_SANG');
    assert.strictEqual(convertData.employee.status, 'TRAINING', 'Trạng thái nhân viên là TRAINING');
    assert.strictEqual(convertData.employee.type, 'TRAINING', 'Loại nhân viên là TRAINING');
    assert.ok(createdEmployeeId.startsWith('CN130_'), 'Mã NV tạo đúng prefix chi nhánh CN1 (CN130_)');
  });

  it('3. Bản ghi Ứng viên trên Web App đã được cập nhật lại Ca làm việc và Chi nhánh làm việc cụ thể', async () => {
    const listRes = await fetch(`${BASE}/api/applicants`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const applicants = await listRes.json();
    const updatedApp = applicants.find(a => a.id === createdApplicantId);

    assert.ok(updatedApp, 'Tìm thấy ứng viên sau khi convert');
    assert.strictEqual(updatedApp.status, 'CONVERTED', 'Trạng thái ứng viên chuyển thành CONVERTED');
    assert.strictEqual(updatedApp.convertedEmployeeId, createdEmployeeId, 'Lưu đúng mã NV liên kết');
    
    // RÀNG BUỘC CỐT LÕI: Ca làm việc và Chi nhánh làm việc đã được cập nhật lại
    assert.strictEqual(updatedApp.shiftPreference, 'CA_SANG', 'shiftPreference cập nhật thành CA_SANG');
    assert.strictEqual(updatedApp.shiftText, 'Ca Sáng: 7g00 - 12g00', 'shiftText cập nhật sang tên ca chuẩn');
    assert.strictEqual(updatedApp.branchPreference, 'CN1', 'branchPreference cập nhật thành CN1');
    assert.ok(updatedApp.branchText.includes('CN1'), 'branchText cập nhật sang chi nhánh CN1');
  });

  it('4. Lịch làm việc (Tab Lịch làm việc) tự động tạo cho 12 ngày thử việc đúng Ca và Chi nhánh', async () => {
    const schedRes = await fetch(`${BASE}/api/schedules?employeeId=${createdEmployeeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const schedules = await schedRes.json();
    const myScheds = schedules.filter(s => s.employeeId === createdEmployeeId);
    assert.ok(myScheds.length > 0, 'Có lịch làm việc được tạo');

    // Kiểm tra các ca làm việc trong lịch
    const allDays = myScheds.flatMap(s => s.days);
    const workingDays = allDays.filter(d => d.status === 'WORKING');
    assert.ok(workingDays.length > 0, 'Có ngày làm việc');
    workingDays.forEach(d => {
      assert.strictEqual(d.shift, 'CA_SANG', 'Tất cả các ca làm việc xếp đúng CA_SANG');
    });
  });

  it('5. Đồng bộ Google Sheet: Kiểm tra hàng đợi syncQueue và trạng thái đồng bộ', async () => {
    const statusRes = await fetch(`${BASE}/api/sync/status`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const statusData = await statusRes.json();
    assert.ok(statusData, 'Lấy được sync status');
    assert.ok(Array.isArray(statusData.queue), 'Queue là một mảng');

    // Kiểm tra thông qua GET /api/employees tìm thấy nhân viên mới với đúng ca và chi nhánh
    const empRes = await fetch(`${BASE}/api/employees`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const employees = await empRes.json();
    const newEmp = employees.find(e => e.employeeId === createdEmployeeId);
    assert.ok(newEmp, 'Nhân viên mới tồn tại trên Web App');
    assert.strictEqual(newEmp.shift, 'CA_SANG', 'Nhân viên mới có ca CA_SANG');
    assert.strictEqual(newEmp.branchId, 'CN1', 'Nhân viên mới có chi nhánh CN1');
  });
});
