const test = require('node:test');
const assert = require('node:assert');

const BASE_URL = 'http://127.0.0.1:3000';

test('Finance Reports & 3 Sheet Templates', async (t) => {
  // 1. Tạo Finance Key hoặc dùng key có sẵn
  let token = '';
  // Đăng nhập finance bằng key
  const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Master@@2027' })
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.token;

  // Tạo finance key mới
  const keyGenRes = await fetch(`${BASE_URL}/api/finance-keys/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ type: 'WEEK' })
  });
  const keyGenData = await keyGenRes.json();
  assert.ok(keyGenData.key, 'Tạo key thành công');

  // Đăng nhập finance bằng key vừa tạo
  const loginRes = await fetch(`${BASE_URL}/api/auth/finance-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: keyGenData.key })
  });
  const loginData = await loginRes.json();
  assert.ok(loginData.token, 'Đăng nhập finance thành công');
  token = loginData.token;

  await t.test('GET /api/finance/reports/matrix trả đúng cấu trúc ma trận 1-31 ngày', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/reports/matrix?month=2026-07`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.daysInMonth, 31);
    assert.ok(data.title.includes('07.2026'));
    assert.ok(Array.isArray(data.rows));
    assert.ok(data.summary);
  });

  await t.test('GET /api/finance/reports/dong-phuc trả danh sách nhân sự hoàn cọc đồng phục', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/reports/dong-phuc`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.rows));
  });

  await t.test('POST /api/finance/reports/dong-phuc lưu thông tin hoàn đồng phục', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/reports/dong-phuc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        bhCode: 'BH.TEST01',
        soTien: 300000,
        tienHoan: 300000,
        kiHoan: '15/07/2026',
        hoanDot1: 'Hoàn thành',
        ghiChu: 'Hoàn 100%'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.row.bhCode, 'BH.TEST01');
  });

  await t.test('GET /api/finance/reports/kham-suc-khoe trả danh sách hoàn tiền khám sức khỏe', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/reports/kham-suc-khoe`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.rows));
  });

  await t.test('POST /api/finance/reports/kham-suc-khoe lưu thông tin khám sức khỏe', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/reports/kham-suc-khoe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        bhCode: 'BH.TEST01',
        ngayKiHD: '2026-01-15',
        ngayHoan: '2026-07-15',
        ngayKham: '2026-01-20',
        tienKham: 160000,
        mucDuyet: 160000,
        tinhTrangHoan: 'ĐÃ HOÀN TRẢ GIẤY KHÁM',
        ghiChu: 'HOÀN 100% CHO NHÂN SỰ'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.row.bhCode, 'BH.TEST01');
  });

  await t.test('GET /api/finance/reports/payroll-summary trả bảng tính lương đối soát tổng hợp', async () => {
    const res = await fetch(`${BASE_URL}/api/finance/reports/payroll-summary?month=2026-07`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.rows));
  });

  // Dọn dẹp key test sau khi test xong
  if(keyGenData.id){
    await fetch(`${BASE_URL}/api/finance-keys/${keyGenData.id}/revoke`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
  }
  // Dọn dẹp BH.TEST01 khỏi db
  const fs = require('fs');
  try{
    const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
    if(db.financeDongPhuc) db.financeDongPhuc = db.financeDongPhuc.filter(r => r.bhCode !== 'BH.TEST01');
    if(db.financeKhamSK) db.financeKhamSK = db.financeKhamSK.filter(r => r.bhCode !== 'BH.TEST01');
    if(db.financeKeys) db.financeKeys = db.financeKeys.filter(k => k.id !== keyGenData.id);
    fs.writeFileSync('data/db.json', JSON.stringify(db, null, 2));
  }catch(_){}
});
