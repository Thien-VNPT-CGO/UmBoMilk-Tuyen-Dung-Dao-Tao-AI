const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Diem danh -> Sheet kem anh: logic noi URL Drive + auto-tao tab.
// Upload live can ServiceAccount that -> bao phu boi static guard + regression suite.
const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

describe('Diem danh sync Sheet kem anh', () => {
  it('1. Row RECORD_DIEM_DANH dung Drive URL (khong phai path local)', () => {
    assert.ok(SRC.includes("a.checkIn?.driveUrl||a.checkIn?.drivePath||''"), 'thieu driveUrl vao');
    assert.ok(SRC.includes("a.checkOut?.driveUrl||a.checkOut?.drivePath||''"), 'thieu driveUrl ra');
  });

  it('2. Upload xong gan URL ve diem danh + share xem', () => {
    assert.ok(SRC.includes('function linkDriveUrlToAttendance'), 'thieu linkDriveUrlToAttendance');
    assert.ok(SRC.includes('linkDriveUrlToAttendance(meta, file.url, upData.id)'), 'chua goi sau upload');
    assert.ok(SRC.includes('shareDrivePublicRead(token, upData.id)'), 'chua share public');
    assert.ok(SRC.includes("permissions"), 'thieu Drive permissions API');
  });

  it('3. Check-in/out truyen attendanceId + slot vao Drive meta', () => {
    assert.ok(SRC.includes("attendanceId: newRec.id, slot: 'checkIn'"), 'thieu link checkin');
    assert.ok(SRC.includes("attendanceId: record.id, slot: 'checkOut'"), 'thieu link checkout');
  });

  it('4. Realtime path tu tao tab thieu (throttle 60s)', () => {
    assert.ok(SRC.includes('_lastEnsureSheetsAt'), 'thieu throttle ensure');
    assert.ok(SRC.includes('await ensureSheetsExist()'), 'realtime chua ensure tab');
  });

  it('5. Rang buoc cu con nguyen: RAW (khong USER_ENTERED), loc test, TEST_GUARD', () => {
    assert.ok(SRC.includes('valueInputOption=RAW'), 'mat valueInputOption RAW');
    assert.ok(SRC.includes('!isTestRecord(a)'), 'mat loc test attendance');
    assert.ok(SRC.includes('OUTBOUND_SYNC_DISABLED') , 'mat guard test CI');
  });
});
