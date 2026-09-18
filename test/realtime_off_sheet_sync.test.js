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

describe('Realtime OFF & AI Scheduling Coordination Test Suite', () => {
  let adminToken = '';
  let initialEmployeesCount = 0;

  before(async () => {
    // Đọc số lượng nhân viên gốc
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
    // Dọn dẹp dữ liệu test sau khi hoàn tất
    if (adminToken) {
      await fetch(`${BASE}/api/admin/clean-test-data`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
    }

    // Kiểm tra sau khi chạy test: data/db.json không bị dính dữ liệu rác
    if (fs.existsSync(DATA_FILE)) {
      const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const testEmps = (db.employees || []).filter(e => e.isTest || (e.name && e.name.toLowerCase().includes('test')));
      assert.strictEqual(testEmps.length, 0, 'data/db.json không chứa nhân viên test');
      assert.strictEqual((db.employees || []).length, initialEmployeesCount, 'Số lượng nhân viên thật được giữ nguyên');
    }
  });

  it('1. Nhân viên Training: Đăng ký tối đa 5 ngày OFF thành công và tự động tạo/cập nhật lịch', async () => {
    // 1. Tạo nhân viên Training test
    const testPhone = '090888' + Math.floor(1000 + Math.random() * 9000);
    const empRes = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        name: 'Test Training Realtime OFF',
        phone: testPhone,
        branchId: 'CN1',
        shift: 'CA_SANG',
        startDate: '2026-09-08',
        type: 'TRAINING',
        status: 'TRAINING',
        isTest: true
      })
    });
    assert.strictEqual(empRes.status, 200);
    const empData = await empRes.json();
    const emp = empData.employee;
    assert.ok(emp && emp.employeeId);

    // 2. Thử đăng ký 6 ngày OFF -> Bị từ chối 400
    const overDates = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
    const rejectRes = await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        employeeId: emp.employeeId,
        dates: overDates
      })
    });
    assert.strictEqual(rejectRes.status, 400);
    const rejectData = await rejectRes.json();
    assert.ok(rejectData.error.includes('tối đa 5 ngày'));

    // 3. Đăng ký đúng 5 ngày OFF -> Thành công 200, Auto-Approve
    const validDates = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'];
    const offRes = await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        employeeId: emp.employeeId,
        dates: validDates
      })
    });
    assert.strictEqual(offRes.status, 200);
    const offData = await offRes.json();
    assert.strictEqual(offData.status, 'APPROVED');
    assert.strictEqual(offData.type, 'TRAINING_OFF');
    assert.strictEqual(offData.dates.length, 5);

    // 4. Kiểm tra lịch làm việc được cập nhật ngay lập tức: 5 ngày OFF mang status OFF, ngày còn lại WORKING
    const schedRes = await fetch(`${BASE}/api/schedules?employeeId=${emp.employeeId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(schedRes.status, 200);
    const schedules = await schedRes.json();
    assert.ok(schedules.length > 0, 'Đã tạo lịch cho nhân viên Training');

    const allDays = schedules.flatMap(s => s.days || []);
    for (const d of validDates) {
      const dayRec = allDays.find(x => x.date === d);
      assert.ok(dayRec, `Có ngày ${d} trong lịch`);
      assert.strictEqual(dayRec.status, 'OFF', `Ngày ${d} phải có status OFF`);
      assert.strictEqual(dayRec.shift, 'OFF', `Ngày ${d} phải có shift OFF`);
    }
  });

  it('2. Nhân viên Chính thức: Đăng ký 2 ngày OFF tuần sau -> chỉ lưu phiếu (chờ AI sau 15:00 T7), draft PENDING sau khi AI chạy', async () => {
    // 1. Tạo nhân viên Official test
    const testPhone = '090777' + Math.floor(1000 + Math.random() * 9000);
    const empRes = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({
        name: 'Test Official Realtime OFF',
        phone: testPhone,
        branchId: 'CN2',
        shift: 'CA_CHIEU',
        type: 'OFFICIAL',
        status: 'OFFICIAL',
        isTest: true
      })
    });
    assert.strictEqual(empRes.status, 200);
    const empData = await empRes.json();
    const emp = empData.employee;
    assert.ok(emp && emp.employeeId);

    // Tính ngày Thứ 2 tuần sau
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToNextMon = (dayOfWeek === 0 ? 1 : 8 - dayOfWeek);
    const nextMon = new Date(now);
    nextMon.setDate(now.getDate() + diffToNextMon);
    nextMon.setHours(0, 0, 0, 0);

    const fmtDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const nextWeekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(nextMon);
      d.setDate(nextMon.getDate() + i);
      nextWeekDates.push(fmtDate(d));
    }

    // 2. Thử đăng ký 3 ngày OFF -> Bị từ chối 400
    const rejectRes = await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        employeeId: emp.employeeId,
        dates: [nextWeekDates[0], nextWeekDates[1], nextWeekDates[2]],
        bypassWindow: true
      })
    });
    assert.strictEqual(rejectRes.status, 400);

    // 3. Đăng ký đúng 2 ngày OFF tuần sau -> Thành công 200
    const chosenOffDates = [nextWeekDates[0], nextWeekDates[1]]; // T2 và T3 OFF
    const offRes = await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        employeeId: emp.employeeId,
        dates: chosenOffDates,
        bypassWindow: true
      })
    });
    assert.strictEqual(offRes.status, 200);
    const offData = await offRes.json();
    assert.strictEqual(offData.status, 'APPROVED');
    assert.strictEqual(offData.deferred, true, 'Phiếu Official được giữ lại chờ AI xếp sau 15:00 T7');

    // 4. RÀNG BUỘC AI SAU 15:00 T7: lịch tuần sau CHƯA được dựng ngay khi đăng ký
    const nextWeekStartStr = fmtDate(nextMon);
    let schedRes = await fetch(`${BASE}/api/schedules?employeeId=${emp.employeeId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(schedRes.status, 200);
    let schedules = await schedRes.json();
    assert.ok(!schedules.some(s => s.weekStart === nextWeekStartStr), 'Lịch tuần sau chưa tồn tại ngay sau đăng ký (chờ AI batch sau 15:00 T7)');

    // 5. AI batch xếp lịch (mô phỏng AUTO_T7_15:00) -> draft PENDING_APPROVAL, 2 ngày đã chọn phải OFF
    const draftRes = await fetch(`${BASE}/api/schedules/generate-next-week-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({})
    });
    assert.strictEqual(draftRes.status, 200);

    schedRes = await fetch(`${BASE}/api/schedules?employeeId=${emp.employeeId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(schedRes.status, 200);
    schedules = await schedRes.json();
    const nextWeekSched = schedules.find(s => s.weekStart === nextWeekStartStr);

    assert.ok(nextWeekSched, 'AI đã dựng lịch tuần sau cho NV đã đăng ký OFF');
    assert.strictEqual(nextWeekSched.approvalStatus, 'PENDING_APPROVAL', 'Lịch AI mang trạng thái chờ HR duyệt');

    for (const d of chosenOffDates) {
      const dayRec = nextWeekSched.days.find(x => x.date === d);
      assert.ok(dayRec, `Có ngày ${d} trong lịch AI`);
      assert.strictEqual(dayRec.status, 'OFF', `Ngày đã đăng ký ${d} phải OFF trong lịch AI`);
    }
  });

  it('3. Ràng buộc AI Sắp Lịch: 3 điều kiện (Cùng CN cùng ca / Cùng CN khác ca / Khác CN)', async () => {
    const nextMon = new Date();
    const dayOfWeek = nextMon.getDay();
    const diffToNextMon = (dayOfWeek === 0 ? 1 : 8 - dayOfWeek);
    nextMon.setDate(nextMon.getDate() + diffToNextMon);
    nextMon.setHours(0, 0, 0, 0);

    const fmtDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const nextWeekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(nextMon);
      d.setDate(nextMon.getDate() + i);
      nextWeekDates.push(fmtDate(d));
    }
    const weekStartStr = fmtDate(nextMon);

    // Tạo 4 nhân viên test
    // NV A: CN3, CA_SANG
    const empARes = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({ name: 'Test NV A (CN3 CA_SANG)', phone: '090111' + Math.floor(1000 + Math.random() * 9000), branchId: 'CN3', shift: 'CA_SANG', type: 'OFFICIAL', status: 'OFFICIAL', isTest: true })
    });
    const { employee: empA } = await empARes.json();

    // NV B: CN3, CA_SANG (Cùng CN + Cùng Ca với A)
    const empBRes = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({ name: 'Test NV B (CN3 CA_SANG)', phone: '090222' + Math.floor(1000 + Math.random() * 9000), branchId: 'CN3', shift: 'CA_SANG', type: 'OFFICIAL', status: 'OFFICIAL', isTest: true })
    });
    const { employee: empB } = await empBRes.json();

    // NV C: CN3, CA_TOI (Cùng CN + Khác Ca với A)
    const empCRes = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({ name: 'Test NV C (CN3 CA_TOI)', phone: '090333' + Math.floor(1000 + Math.random() * 9000), branchId: 'CN3', shift: 'CA_TOI', type: 'OFFICIAL', status: 'OFFICIAL', isTest: true })
    });
    const { employee: empC } = await empCRes.json();

    // NV D: CN4, CA_TOI (Khác CN + Khác Ca với A)
    const empDRes = await fetch(`${BASE}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({ name: 'Test NV D (CN4 CA_TOI)', phone: '090444' + Math.floor(1000 + Math.random() * 9000), branchId: 'CN4', shift: 'CA_TOI', type: 'OFFICIAL', status: 'OFFICIAL', isTest: true })
    });
    const { employee: empD } = await empDRes.json();

    // NV A đăng ký OFF ngày 0 và 1 (T2, T3) -> ngày 2 (T4) là WORKING
    const rA = await (await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({ employeeId: empA.employeeId, dates: [nextWeekDates[0], nextWeekDates[1]], bypassWindow: true })
    })).json();
    assert.strictEqual(rA.status, 'APPROVED', `NV A đăng ký OFF thành công: ${JSON.stringify(rA)}`);

    // NV B đăng ký OFF ngày 5 và 6 (T7, CN) -> ngày 2 (T4) cũng là WORKING lúc ban đầu
    const rB = await (await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({ employeeId: empB.employeeId, dates: [nextWeekDates[5], nextWeekDates[6]], bypassWindow: true })
    })).json();
    assert.strictEqual(rB.status, 'APPROVED', `NV B đăng ký OFF thành công: ${JSON.stringify(rB)}`);

    // NV C đăng ký OFF ngày 5 và 6 (T7, CN) -> ngày 2 (T4) là WORKING
    const rC = await (await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({ employeeId: empC.employeeId, dates: [nextWeekDates[5], nextWeekDates[6]], bypassWindow: true })
    })).json();
    assert.strictEqual(rC.status, 'APPROVED', `NV C đăng ký OFF thành công: ${JSON.stringify(rC)}`);

    // NV D đăng ký OFF ngày 5 và 6 (T7, CN) -> ngày 2 (T4) là WORKING
    const rD = await (await fetch(`${BASE}/api/off-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'x-is-test': 'true' },
      body: JSON.stringify({ employeeId: empD.employeeId, dates: [nextWeekDates[5], nextWeekDates[6]], bypassWindow: true })
    })).json();
    assert.strictEqual(rD.status, 'APPROVED', `NV D đăng ký OFF thành công: ${JSON.stringify(rD)}`);

    // AI batch xếp lịch sau 15:00 T7 (mô phỏng AUTO_T7_15:00) cho tất cả NV đã đăng ký OFF,
    // rồi cân lịch chống trùng ca
    const draftRes = await fetch(`${BASE}/api/schedules/generate-next-week-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({})
    });
    assert.strictEqual(draftRes.status, 200);

    // Chạy AI cân lịch tuần sau
    const coordRes = await fetch(`${BASE}/api/schedules/coordinate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ weekStart: weekStartStr })
    });
    assert.strictEqual(coordRes.status, 200);

    // Lấy lại lịch của cả 4 nhân viên
    const schedA = (await (await fetch(`${BASE}/api/schedules?employeeId=${empA.employeeId}`, { headers: { Authorization: `Bearer ${adminToken}` } })).json()).find(s => s.weekStart === weekStartStr);
    const schedB = (await (await fetch(`${BASE}/api/schedules?employeeId=${empB.employeeId}`, { headers: { Authorization: `Bearer ${adminToken}` } })).json()).find(s => s.weekStart === weekStartStr);
    const schedC = (await (await fetch(`${BASE}/api/schedules?employeeId=${empC.employeeId}`, { headers: { Authorization: `Bearer ${adminToken}` } })).json()).find(s => s.weekStart === weekStartStr);
    const schedD = (await (await fetch(`${BASE}/api/schedules?employeeId=${empD.employeeId}`, { headers: { Authorization: `Bearer ${adminToken}` } })).json()).find(s => s.weekStart === weekStartStr);
    for (const [s, code] of [[schedA, 'A'], [schedB, 'B'], [schedC, 'C'], [schedD, 'D']]) {
      assert.ok(s, `NV ${code} đã có lịch tuần sau sau khi AI batch xếp`);
    }

    const targetDate = nextWeekDates[2]; // Thứ 4
    const statusA = schedA.days.find(d => d.date === targetDate).status;
    const statusB = schedB.days.find(d => d.date === targetDate).status;

    // ĐIỀU KIỆN 1: Cùng Chi nhánh (CN3) + Cùng Ca (CA_SANG) -> KHÔNG trùng ca làm việc trong ngày
    // A và B không bao giờ cùng WORKING (AI chia ca công bằng, ca trực có thể thuộc NV khác trong nhóm)
    const workingCountAB = (statusA === 'WORKING' ? 1 : 0) + (statusB === 'WORKING' ? 1 : 0);
    assert.ok(workingCountAB <= 1, `Cùng CN cùng ca: tối đa 1 người WORKING vào ngày ${targetDate} (A: ${statusA}, B: ${statusB})`);

    // Ngày đã đăng ký OFF của từng NV phải OFF trong lịch AI
    for (const [sched, code, offs] of [
      [schedA, 'A', [nextWeekDates[0], nextWeekDates[1]]],
      [schedB, 'B', [nextWeekDates[5], nextWeekDates[6]]],
      [schedC, 'C', [nextWeekDates[5], nextWeekDates[6]]],
      [schedD, 'D', [nextWeekDates[5], nextWeekDates[6]]]
    ]) {
      for (const d of offs) {
        assert.strictEqual(sched.days.find(x => x.date === d).status, 'OFF', `NV ${code}: ngày đã đăng ký ${d} phải OFF`);
      }
    }

    // ĐIỀU KIỆN 2+3 (bất biến nhóm, chỉ xét 4 NV test để loại nhiễu dữ liệu thật):
    // gom các ngày WORKING theo (chi nhánh, ca, ngày) — mỗi slot tối đa 1 NV.
    // Cùng CN khác ca (A vs C) và khác CN (D) không chung slot nên không bị lật.
    const slotOf = {};
    for (const [sched, emp] of [[schedA, empA], [schedB, empB], [schedC, empC], [schedD, empD]]) {
      for (const d of (sched.days || [])) {
        if (d.status !== 'WORKING') continue;
        const key = `${emp.branchId}|${d.shift}|${d.date}`;
        slotOf[key] = slotOf[key] || [];
        slotOf[key].push(emp.employeeId);
      }
    }
    const overbooked = Object.entries(slotOf).filter(([, ids]) => ids.length > 1);
    assert.strictEqual(overbooked.length, 0, `Không slot nào trùng ca: ${JSON.stringify(overbooked.slice(0, 3))}`);
  });
});
