const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Rang buoc mac dinh tab web NV Chinh thuc:
// Hien: Diem danh, Lich, Luong AI, OFF CA LAM. An: Doi ca, Nghi OFF, Tai khoan.
describe('Mac dinh hien thi web NV Chinh thuc', () => {
  it('1. DEFAULT_SETTINGS.features dung nhu anh duyet', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const m = src.match(/features:\s*\{[^}]*\}/);
    assert.ok(m, 'khong tim thay DEFAULT features');
    const f = m[0];
    assert.ok(f.includes('employeeShiftSwap: false'), 'Doi ca mac dinh tat');
    assert.ok(f.includes('empAttendance: true'), 'Diem danh mac dinh bat');
    assert.ok(f.includes('empSchedule: true'), 'Lich mac dinh bat');
    assert.ok(f.includes('empSalary: true'), 'Luong AI mac dinh bat');
    assert.ok(f.includes('empOff: false'), 'Nghi OFF mac dinh tat');
    assert.ok(f.includes('empEmergency: true'), 'OFF CA LAM mac dinh bat');
    assert.ok(f.includes('empAccount: false'), 'Tai khoan mac dinh tat');
  });

  it('2. Subtitle Cài đặt mo ta dung mac dinh', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    assert.ok(html.includes('Điểm danh, Lịch, Lương AI, OFF CA LÀM'), 'subtitle phai liet ke dung 4 tab mac dinh');
    assert.ok(!html.includes('(mặc định chỉ Trang chủ)'), 'khong con subtitle cu sai');
  });

  it('3. Web NV an tab theo dung co (static guard)', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    for (const k of ['empAttendance', 'empSchedule', 'empSalary', 'empOff', 'empEmergency', 'empAccount']) {
      assert.ok(js.includes('F.' + k), 'employee.js phai doc co ' + k);
    }
  });

  it('4. Quyen HR mac dinh co Ban ghi diem danh (attendance) va Dao tao (elearning)', () => {
    const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    assert.ok(adminJs.includes("if (role === 'HR') return ['dashboard', 'applicants', 'interviews', 'employees-store', 'schedule', 'shiftSwap', 'requests', 'attendance', 'elearning'];"), 'admin.js khong co tabs mac dinh dung cho HR');

    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(serverJs.includes("'attendance', 'elearning'"), 'server.js missing HR default tabs');
  });

  it('5. Admin co HRMS shell va shared data table styles', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'shared.css'), 'utf8');
    for (const className of ['hrms-topbar', 'hrms-sidebar', 'hrms-workspace']) {
      assert.ok(html.includes(className), 'admin.html thieu ' + className);
      assert.ok(css.includes('.' + className), 'shared.css thieu ' + className);
    }
    assert.ok(css.includes('.hrms-workspace thead'), 'shared.css thieu style data table Admin');
  });

  it('6. Employee co HRMS shell va shared components', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'employee.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'shared.css'), 'utf8');
    for (const className of ['hrms-topbar', 'hrms-sidebar', 'hrms-workspace']) {
      assert.ok(html.includes(className), 'employee.html thieu ' + className);
      assert.ok(css.includes('.' + className), 'shared.css thieu ' + className);
    }
    for (const comp of ['.card', '.stat-pill', '.cam-wrap', '.section-title', '.title-icon', '#mobileNav']) {
      assert.ok(css.includes(comp), 'shared.css thieu component Employee ' + comp);
    }
  });

  it('7. Finance co HRMS shell', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'finance.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'shared.css'), 'utf8');
    for (const className of ['hrms-topbar', 'hrms-workspace']) {
      assert.ok(html.includes(className), 'finance.html thieu ' + className);
      assert.ok(css.includes('.' + className), 'shared.css thieu ' + className);
    }
    assert.ok(css.includes('.finance-topbar'), 'shared.css thieu style finance-topbar');
    assert.ok(css.includes('.finance-workspace'), 'shared.css thieu style finance-workspace');
  });
});
