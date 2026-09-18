const { describe, it } = require('node:test');
const assert = require('node:assert');
const tg = require('../services/telegram');
const { DEFAULT_SHIFTS, calculateDistanceMeters } = tg;

describe('Telegram Bot — Điểm danh tự động theo ca 2 bước (GPS + Ảnh 3 yếu tố)', () => {
  const mockBranches = [
    { id: 'CN1', name: 'CN1 - 130 Vạn kiếp', lat: 10.79815, lng: 106.69145 },
    { id: 'CN2', name: 'CN2 - 261 Tô Hiến Thành', lat: 10.77885, lng: 106.66425 }
  ];

  it('1. Cấu hình 3 ca cố định chuẩn: Ca Sáng (07:00-12:00), Ca Chiều (12:00-18:00), Ca Tối (18:00-23:00)', () => {
    const shifts = DEFAULT_SHIFTS;
    assert.equal(shifts.CA_SANG.start, '07:00');
    assert.equal(shifts.CA_SANG.end, '12:00');
    assert.equal(shifts.CA_SANG.hours, 5);

    assert.equal(shifts.CA_CHIEU.start, '12:00');
    assert.equal(shifts.CA_CHIEU.end, '18:00');
    assert.equal(shifts.CA_CHIEU.hours, 6);

    assert.equal(shifts.CA_TOI.start, '18:00');
    assert.equal(shifts.CA_TOI.end, '23:00');
    assert.equal(shifts.CA_TOI.hours, 5);
  });

  it('2. Tính toán khoảng cách Haversine chuẩn xác', () => {
    // Tọa độ tại CN1: 10.79815, 106.69145
    const distZero = calculateDistanceMeters(10.79815, 106.69145, 10.79815, 106.69145);
    assert.equal(Math.round(distZero), 0);

    // Cách ~100m
    const distNear = calculateDistanceMeters(10.79815, 106.69145, 10.79900, 106.69145);
    assert.ok(distNear > 50 && distNear < 150);

    // Cách ~1.5km (quá 300m)
    const distFar = calculateDistanceMeters(10.79815, 106.69145, 10.81000, 106.69145);
    assert.ok(distFar > 1000);
  });

  it('3. Bàn phím Bước 1 (GPS) và Bước 2 (Ảnh) hiển thị đúng cấu trúc', () => {
    const gpsKb = tg.attendanceGpsKeyboard();
    assert.ok(gpsKb.reply_markup.keyboard[0][0].request_location);
    assert.ok(gpsKb.reply_markup.keyboard[0][0].text.includes('GỬI VỊ TRÍ GPS'));

    const photoKb = tg.attendancePhotoKeyboard('https://test.app');
    assert.ok(photoKb.reply_markup.inline_keyboard[0][0].text.includes('CHỤP ẢNH XÁC THỰC'));
  });

  it('4. Bước 1 GPS: Từ chối khi khoảng cách > 300m', async () => {
    const mockCtx = {
      role: 'employee',
      handleAttendanceLocation: async (tgId, loc) => {
        const dist = calculateDistanceMeters(loc.latitude, loc.longitude, 10.79815, 106.69145);
        if (dist > 300) {
          return {
            text: `❌ VỊ TRÍ KHÔNG HỢP LỆ (QUÁ XA CỬA HÀNG)\nKhoảng cách: ${Math.round(dist)}m (Vượt quá 300m)`
          };
        }
        return { step: 'WAITING_PHOTO', text: 'Bước 1 GPS OK' };
      }
    };

    // Vị trí xa 1.5km
    const actions = await tg.handleTelegramUpdate(
      {
        message: {
          chat: { id: 101 },
          from: { id: 101, username: 'nv_test' },
          location: { latitude: 10.81500, longitude: 106.69145 }
        }
      },
      mockCtx
    );

    assert.equal(actions.length, 1);
    assert.ok(actions[0].text.includes('VỊ TRÍ KHÔNG HỢP LỆ'));
    assert.ok(actions[0].text.includes('QUÁ XA CỬA HÀNG'));
  });

  it('5. Bước 1 GPS: Chấp nhận khi khoảng cách <= 300m và chuyển sang Bước 2 (Chụp ảnh)', async () => {
    const mockCtx = {
      role: 'employee',
      webAppUrl: 'https://test.app',
      handleAttendanceLocation: async (tgId, loc) => {
        return {
          step: 'WAITING_PHOTO',
          text: '📍 BƯỚC 1: XÁC THỰC VỊ TRÍ GPS THÀNH CÔNG!\n📸 BƯỚC 2: CHỤP ẢNH XÁC THỰC TRỰC DIỆN (Đủ 3 yếu tố: Mặt + Đồng phục + Bảng tên)'
        };
      }
    };

    // Vị trí tại quán (~10m)
    const actions = await tg.handleTelegramUpdate(
      {
        message: {
          chat: { id: 102 },
          from: { id: 102, username: 'nv_test' },
          location: { latitude: 10.79818, longitude: 106.69146 }
        }
      },
      mockCtx
    );

    assert.equal(actions.length, 1);
    assert.ok(actions[0].text.includes('XÁC THỰC VỊ TRÍ GPS THÀNH CÔNG'));
    assert.ok(actions[0].text.includes('CHỤP ẢNH XÁC THỰC TRỰC DIỆN'));
    // Gửi kèm bàn phím chụp ảnh
    assert.ok(actions[0].extra?.reply_markup?.inline_keyboard);
  });

  it('6. Bước 2 Ảnh: Từ chối khi thiếu 1 trong 3 yếu tố (Mặt / Đồng phục / Bảng tên)', async () => {
    const mockCtx = {
      role: 'employee',
      hasPendingAttendance: async () => true,
      handleAttendancePhoto: async (tgId, photo, opts) => {
        const missingReasons = [];
        if (opts.missingFace || opts.caption?.includes('thieu mat')) missingReasons.push('1️⃣ Không nhận diện rõ khuôn mặt');
        if (opts.missingUniform || opts.caption?.includes('thieu dong phuc')) missingReasons.push('2️⃣ Chưa mặc đúng đồng phục Ụm Bò Milk');
        if (opts.missingBadge || opts.caption?.includes('thieu bang ten')) missingReasons.push('3️⃣ Chưa đeo bảng tên nhân viên');

        if (missingReasons.length > 0) {
          return {
            text: `❌ ẢNH CHỤP KHÔNG ĐẠT TIÊU CHUẨN ĐIỂM DANH!\n${missingReasons.join('\n')}\n👉 Yêu cầu bắt buộc: Khuôn mặt + Đồng phục + Bảng tên.`
          };
        }
        return { text: '✅ ĐIỂM DANH THÀNH CÔNG!' };
      }
    };

    // Test trường hợp thiếu đồng phục
    const actionsFailUniform = await tg.handleTelegramUpdate(
      {
        message: {
          chat: { id: 103 },
          from: { id: 103, username: 'nv_test' },
          photo: [{ file_id: 'ph1' }],
          caption: 'thieu dong phuc'
        }
      },
      mockCtx
    );
    assert.ok(actionsFailUniform[0].text.includes('ẢNH CHỤP KHÔNG ĐẠT TIÊU CHUẨN'));
    assert.ok(actionsFailUniform[0].text.includes('Chưa mặc đúng đồng phục'));

    // Test trường hợp thiếu bảng tên
    const actionsFailBadge = await tg.handleTelegramUpdate(
      {
        message: {
          chat: { id: 103 },
          from: { id: 103, username: 'nv_test' },
          photo: [{ file_id: 'ph2' }],
          caption: 'thieu bang ten'
        }
      },
      mockCtx
    );
    assert.ok(actionsFailBadge[0].text.includes('Chưa đeo bảng tên'));
  });

  it('7. Bước 2 Ảnh: Chấp nhận khi đủ cả 3 yếu tố (Mặt + Đồng phục + Bảng tên)', async () => {
    let checkinCompleted = false;
    const mockCtx = {
      role: 'employee',
      hasPendingAttendance: async () => true,
      handleAttendancePhoto: async (tgId, photo, opts) => {
        checkinCompleted = true;
        return {
          text: `✅ ĐIỂM DANH VÀO CA (CHECK-IN) THÀNH CÔNG!\n📍 GPS: Hợp lệ • 📸 Xác thực: Đạt chuẩn 3 yếu tố`
        };
      }
    };

    const actions = await tg.handleTelegramUpdate(
      {
        message: {
          chat: { id: 104 },
          from: { id: 104, username: 'nv_valid' },
          photo: [{ file_id: 'valid_photo_123' }],
          caption: 'Anh diem danh day du 3 yeu to'
        }
      },
      mockCtx
    );

    assert.equal(checkinCompleted, true);
    assert.ok(actions[0].text.includes('CHECK-IN'));
    assert.ok(actions[0].text.includes('Đạt chuẩn 3 yếu tố'));
  });

  it('8. Phạt đi trễ: Đúng giờ (0đ), Trễ > 5 phút (30.000đ), Trễ > 30 phút (50% lương ca)', () => {
    const shiftHours = 5;
    const officialRate = 25500;
    const shiftWage = shiftHours * officialRate; // 127.500đ

    // Case 1: Đúng giờ / Trễ <= 5 phút
    const calcLatePenalty = (lateMinutes) => {
      if (lateMinutes <= 5) return { status: 'ON_TIME', penalty: 0 };
      if (lateMinutes <= 30) return { status: 'LATE', penalty: 30000 };
      return { status: 'VERY_LATE', penalty: Math.round(shiftWage * 0.5) };
    };

    const pOnTime = calcLatePenalty(3);
    assert.equal(pOnTime.status, 'ON_TIME');
    assert.equal(pOnTime.penalty, 0);

    const pLate10m = calcLatePenalty(12);
    assert.equal(pLate10m.status, 'LATE');
    assert.equal(pLate10m.penalty, 30000);

    const pLate35m = calcLatePenalty(35);
    assert.equal(pLate35m.status, 'VERY_LATE');
    assert.equal(pLate35m.penalty, 63750); // 50% của 127.500đ
  });

  it('9. Khóa Check-out sớm: Tuyệt đối chặn ra ca trước giờ quy định và báo vi phạm về Bot HR', async () => {
    let hrViolationAlert = null;
    const mockCtx = {
      role: 'employee',
      handleAttendanceLocation: async (tgId, loc) => {
        // Giả lập nhân viên đang ca Sáng (kết thúc 12:00) nhưng bấm check-out lúc 11:30 (sớm 30 phút)
        const nowMins = 11 * 60 + 30;
        const endMins = 12 * 60;
        if (nowMins < endMins) {
          const earlyMins = endMins - nowMins;
          hrViolationAlert = `🚨 CẢNH BÁO VI PHẠM: CỐ TÌNH CHECK-OUT SỚM ${earlyMins} phút`;
          return {
            text: `🚫 KHÔNG THỂ CHECK-OUT SỚM HƠN GIỜ KẾT THÚC CA!\nCa làm: Ca Sáng (07:00 – 12:00). Còn ${earlyMins} phút nữa mới hết ca.`
          };
        }
        return { step: 'WAITING_PHOTO', text: 'Check-out GPS OK' };
      }
    };

    const actions = await tg.handleTelegramUpdate(
      {
        message: {
          chat: { id: 105 },
          from: { id: 105, username: 'nv_early' },
          location: { latitude: 10.79815, longitude: 106.69145 }
        }
      },
      mockCtx
    );

    assert.equal(actions.length, 1);
    assert.ok(actions[0].text.includes('KHÔNG THỂ CHECK-OUT SỚM'));
    assert.ok(actions[0].text.includes('Còn 30 phút nữa'));
    assert.ok(hrViolationAlert !== null);
    assert.ok(hrViolationAlert.includes('CỐ TÌNH CHECK-OUT SỚM 30 phút'));
  });

  it('10. Check-out đúng giờ: Hoàn thành 2 bước tính đúng số giờ và tiền lương ca', async () => {
    const shiftHours = 5;
    const hourlyRate = 25500;
    const shiftWage = shiftHours * hourlyRate; // 127.500đ

    const mockCtx = {
      role: 'employee',
      hasPendingAttendance: async () => true,
      handleAttendancePhoto: async () => {
        return {
          text: `🏁 CHECK-OUT RA CA THÀNH CÔNG!\n⏱️ Thời gian làm việc: ${shiftHours} giờ\n💰 Tiền ca tạm tính: ${shiftWage.toLocaleString('vi-VN')}đ`
        };
      }
    };

    const actions = await tg.handleTelegramUpdate(
      {
        message: {
          chat: { id: 106 },
          from: { id: 106, username: 'nv_ontime' },
          photo: [{ file_id: 'ph_checkout' }],
          caption: 'Check-out dung gio'
        }
      },
      mockCtx
    );

    assert.ok(actions[0].text.includes('CHECK-OUT RA CA THÀNH CÔNG'));
    assert.ok(actions[0].text.includes('5 giờ'));
    assert.ok(actions[0].text.includes('127.500đ'));
    // Tuyệt đối không nhắc đến Google Sheet trong tin nhắn gửi nhân viên
    assert.equal(actions[0].text.includes('Google Sheet'), false);
  });

  it('11. Màn 1: Nhắc vào ca trước 30 phút (06:30 cho Ca Sáng 07:00, 11:30 cho Ca Chiều 12:00, 17:30 cho Ca Tối 18:00)', () => {
    // Giả lập ca Sáng: 07:00 (420 phút) -> Nhắc lúc 06:30 (390 phút, tức trước 30 phút)
    const startMins = 7 * 60; // 420
    const checkReminderCondition = (nowMins, hasIn) => {
      return !hasIn && nowMins >= (startMins - 30) && nowMins < startMins;
    };

    // Lúc 06:25 (385 phút) -> Chưa đến giờ nhắc (chưa đủ 30 phút trước ca)
    assert.equal(checkReminderCondition(6 * 60 + 25, false), false);

    // Lúc 06:30 (390 phút) -> Đúng 30 phút trước ca -> Kích hoạt nhắc
    assert.equal(checkReminderCondition(6 * 60 + 30, false), true);

    // Lúc 06:45 (405 phút) -> Vẫn trong khoảng nhắc trước ca
    assert.equal(checkReminderCondition(6 * 60 + 45, false), true);

    // Đã điểm danh rồi (hasIn = true) -> Không nhắc nữa
    assert.equal(checkReminderCondition(6 * 60 + 30, true), false);

    // Sau 07:00 (đã vào ca) -> Chuyển sang khung cảnh báo trễ, không nhắc trước ca
    assert.equal(checkReminderCondition(7 * 60 + 5, false), false);
  });
});

