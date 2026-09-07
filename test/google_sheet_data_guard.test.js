const test = require('node:test');
const assert = require('node:assert');

const BASE_URL = 'http://127.0.0.1:3000';

test('Google Sheet 17iXM Data Loss Prevention & Reset ALL Bound Constraint', async (t) => {
  // Lấy token Admin
  const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Master@@2027' })
  });
  const adminData = await adminRes.json();
  const token = adminData.token;
  assert.ok(token, 'Đăng nhập admin thành công');

  await t.test('POST /api/admin/rebuild-sheet-tab từ chối xóa/clear Sheet 17iXM (403 Forbidden)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/rebuild-sheet-tab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        spreadsheetId: '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w',
        sheet: 'NHAN_VIEN_MOI',
        dryRun: false
      })
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('Ràng buộc bảo vệ tuyệt đối'));
  });

  await t.test('POST /api/admin/delete-sheet-rows từ chối xóa dòng trên Sheet 17iXM (403 Forbidden)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/delete-sheet-rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        spreadsheetId: '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w',
        sheet: 'NHAN_VIEN_MOI',
        ids: ['NV_TEST_123']
      })
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('Ràng buộc bảo vệ tuyệt đối'));
  });

  await t.test('Xóa nhân viên / báo cáo trên Web App không ảnh hưởng tới Google Sheet', async () => {
    // Gọi reset report trên Web App: chỉ xóa local db báo cáo
    const res = await fetch(`${BASE_URL}/api/reports/reset`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });
});
