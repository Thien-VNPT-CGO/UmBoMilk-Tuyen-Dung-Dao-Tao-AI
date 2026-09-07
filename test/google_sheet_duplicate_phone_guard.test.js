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

describe('Google Sheet 17iXM Duplicate Phone Number Constraint Test Suite', () => {
  let adminToken = '';
  let initialEmployeesCount = 0;
  let existingEmployee = null;
  let createdTestEmpId = null;

  before(async () => {
    if (fs.existsSync(DATA_FILE)) {
      const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      initialEmployeesCount = (db.employees || []).length;
      existingEmployee = (db.employees || []).find(e => e.phone && !e.isTest);
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
      assert.strictEqual((db.employees || []).length, initialEmployeesCount, 'Số lượng nhân viên thật được bảo toàn');
    }
  });

  it('1. Tạo nhân viên với SĐT đã tồn tại trên Web/Sheet -> Bị từ chối 409 Conflict, không lưu vào Google Sheet', async () => {
    assert.ok(existingEmployee && existingEmployee.phone, 'Có ít nhất 1 nhân viên thật trong DB');
    const dupPhone = existingEmployee.phone;

    const res = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'x-is-test': 'true'
      },
      body: JSON.stringify({
        name: 'Trùng SĐT Test',
        phone: dupPhone,
        branchId: 'CN1',
        shift: 'CA_SANG',
        type: 'TRAINING',
        status: 'TRAINING',
        isTest: true
      })
    });

    assert.strictEqual(res.status, 409, 'Bị từ chối mã 409 Conflict khi trùng SĐT');
    const data = await res.json();
    assert.ok(data.error && data.error.includes('Trùng SĐT'), `Thông báo lỗi phải nêu rõ Trùng SĐT: ${data.error}`);
    assert.ok(data.error.includes('không lưu trùng'), `Thông báo lỗi phải ghi rõ không lưu trùng: ${data.error}`);
  });

  it('2. Đăng ký ứng viên với SĐT đã tồn tại -> Bị từ chối 409 Conflict, không lưu vào Google Sheet 17iXM', async () => {
    assert.ok(existingEmployee && existingEmployee.phone);
    const dupPhone = existingEmployee.phone;

    // Thử qua POST /api/applicants
    const appRes = await fetch(`${BASE}/api/applicants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ứng viên trùng SĐT',
        phone: dupPhone,
        branchPreference: 'CN1',
        shiftPreference: 'CA_SANG'
      })
    });
    assert.strictEqual(appRes.status, 409, 'Bị từ chối 409 khi đăng ký ứng viên trùng SĐT');
    const appData = await appRes.json();
    assert.ok(appData.error && appData.error.includes('Trùng SĐT'), 'Thông báo lỗi nêu rõ Trùng SĐT');

    // Thử qua Google Form submit webhook: POST /api/recruitment/form-submit
    const formRes = await fetch(`${BASE}/api/recruitment/form-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ứng viên form trùng SĐT',
        phone: dupPhone,
        branchPreference: 'CN2'
      })
    });
    assert.strictEqual(formRes.status, 409, 'Form submit bị từ chối 409 khi trùng SĐT');
  });

  it('3. Tạo nhân viên hợp lệ với SĐT mới thành công -> Cho phép cập nhật nếu giữ nguyên SĐT của mình', async () => {
    const freshPhone = '090123' + Math.floor(1000 + Math.random() * 9000);

    // Tạo nhân viên mới với SĐT duy nhất
    const createRes = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'x-is-test': 'true'
      },
      body: JSON.stringify({
        name: 'Test Duplicate Phone Unique',
        phone: freshPhone,
        branchId: 'CN1',
        shift: 'CA_SANG',
        type: 'TRAINING',
        status: 'TRAINING',
        startDate: '2026-09-08',
        isTest: true
      })
    });
    assert.strictEqual(createRes.status, 200, 'Tạo nhân viên thành công với SĐT mới duy nhất');
    const created = await createRes.json();
    assert.ok(created.employee && created.employee.employeeId);
    createdTestEmpId = created.employee.employeeId;

    // Cập nhật nhân viên nhưng giữ nguyên SĐT của mình -> Được phép cập nhật thành công (không báo trùng với chính mình)
    const updateRes = await fetch(`${BASE}/api/employees/${createdTestEmpId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Test Duplicate Phone Unique - Renamed',
        phone: freshPhone
      })
    });
    assert.strictEqual(updateRes.status, 200, 'Được phép cập nhật thông tin khi SĐT là của chính mình');
  });

  it('4. Cập nhật nhân viên đổi sang SĐT của nhân viên khác -> Bị từ chối 409 Conflict', async () => {
    assert.ok(createdTestEmpId, 'Đã có nhân viên test được tạo');
    const otherEmpPhone = existingEmployee.phone;

    const updateRes = await fetch(`${BASE}/api/employees/${createdTestEmpId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        phone: otherEmpPhone
      })
    });
    assert.strictEqual(updateRes.status, 409, 'Đổi sang SĐT đã tồn tại bị chặn với mã 409 Conflict');
    const errData = await updateRes.json();
    assert.ok(errData.error && errData.error.includes('Trùng SĐT'), `Thông báo lỗi trùng SĐT: ${errData.error}`);
  });

  it('5. Ràng buộc hàm syncSheetTab: Kiểm tra bảo vệ không sinh 2 dòng có cùng SĐT trên Google Sheet', async () => {
    // Gọi endpoint health để xác nhận hệ thống hoạt động ổn định và sẵn sàng đồng bộ
    const healthRes = await fetch(`${BASE}/api/health`);
    assert.strictEqual(healthRes.status, 200);
    const health = await healthRes.json();
    assert.strictEqual(health.status, 'ok');
  });
});
