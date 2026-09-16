const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';

describe('Doi soat NV Sheet 17iXM (khong cham du lieu that)', () => {
  it('1. Helper isSheetHeaderCode chan dong header', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const m = src.match(/function isSheetHeaderCode\(code\)\{[^}]*\}/);
    assert.ok(m, 'thieu helper isSheetHeaderCode');
    const cases = [['Mã NV', true], ['ID', true], ['Họ tên', true], ['', true], [null, true], ['CN130_UBM07092026_NV3184', false], ['2418b6a3-0fa0-4f16-becb-fa1fc6df9e43', false]];
    const body = m[0].slice(m[0].indexOf('{') + 1, m[0].lastIndexOf('}'));
    const f = new Function('code', body);
    cases.forEach(([input, expected]) => {
      assert.strictEqual(f(input), expected, `isSheetHeaderCode(${JSON.stringify(input)})`);
    });
  });

  it('2. Pull NV bo qua dong header (static guard)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(src.includes('isSheetHeaderCode(maNV)'), 'pull NV thieu guard header');
    assert.ok(src.includes('isSheetHeaderCode(id)'), 'pull applicants thieu guard header');
  });

  it('3. Endpoint reconcile-employees yeu cau Admin', async () => {
    const noAuth = await fetch(BASE + '/api/admin/reconcile-employees', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    assert.strictEqual(noAuth.status, 401, 'thieu auth phai 401, duoc ' + noAuth.status);
  });

  it('4. syncSheetTab tra ve appended/updated (static guard)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(src.includes('droppedTest, droppedDupPhone, droppedJunk, updated, appended'), 'syncSheetTab phai tra counts');
    assert.ok(src.includes('putOk'), 'syncSheetTab phai bao trang thai ghi');
  });

  it('5. Don header rac Sheet + bao loi ghi that bai', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(src.includes('function isSheetJunkHeaderRow'), 'thieu don header rac');
    assert.ok(src.includes('droppedJunk'), 'thieu dem droppedJunk');
    assert.ok(src.includes('Ghi ') && src.includes('THAT BAI'), 'thieu log loi ghi Sheet');
  });
});
