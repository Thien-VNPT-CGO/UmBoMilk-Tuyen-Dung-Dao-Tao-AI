/* TG Employee — 9 tab nhân viên native: dùng đúng API web hiện tại. */
(function () {
  const T = window.TG;
  const SHIFT_HOURS = { CA_SANG: 5, CA_CHIEU: 6, CA_TRUA: 6, CA_TOI: 5 };

  function deviceId() {
    let d = T.store.get('device_id', null);
    if (!d) {
      try { const u = T.WA && T.WA.initDataUnsafe && T.WA.initDataUnsafe.user; if (u && u.id) d = 'tg-' + u.id; } catch (e) {}
      if (!d) d = 'tgweb-' + Math.random().toString(36).slice(2, 10);
      T.store.set('device_id', d);
    }
    return d;
  }

  async function me() {
    const j = await T.empApi('/api/employee/me');
    if (j.employee) T.store.set('emp_user', j.employee);
    return j;
  }
  function emp() { return T.store.get('emp_user', null); }

  // ---------- Trang chủ ----------
  T.pages['emp-home'] = async () => {
    let e = emp();
    try { const j = await me(); e = j.employee; } catch (err) {
      if (err.status === 401) { T.store.del('emp_token'); T.store.del('emp_user'); T.setTabs([]); T.go('emp-link', {}, true); return ''; }
      throw err;
    }
    const today = T.vnToday();
    let sched = [], att = [], notifs = [];
    try { sched = await T.empApi('/api/schedules?employeeId=' + encodeURIComponent(e.employeeId)); } catch (ex) {}
    try { att = await T.empApi('/api/attendances?employeeId=' + encodeURIComponent(e.employeeId) + '&date=' + today); } catch (ex) {}
    try { notifs = await T.empApi('/api/notifications?employeeId=' + encodeURIComponent(e.employeeId)); } catch (ex) {}
    const list = Array.isArray(sched) ? sched : (sched.schedules || sched.data || []);
    const todaySched = list.filter((s) => String(s.date).split('T')[0] === today);
    const recs = Array.isArray(att) ? att : (att.attendances || att.data || []);
    const rec = recs[0];
    const allN = Array.isArray(notifs) ? notifs : (notifs.notifications || notifs.data || []);
    const unread = allN.filter((n) => !n.read && !n.isRead).length;
    const dayStr = todaySched.length
      ? todaySched.map((s) => T.shiftVi(s.shift) + ' • ' + (s.status || 'WORKING')).join('<br>')
      : 'Hôm nay OFF / chưa có lịch';
    return ''
      + '<div class="tg-card"><div class="tg-row"><div class="ic">🧑‍🍳</div><div class="bd"><div class="tt">' + T.esc(e.name) + '</div>'
      + '<div class="sm">' + T.esc(e.employeeId) + ' • ' + T.esc(e.type === 'OFFICIAL' ? 'Chính thức' : 'Training') + ' • ' + T.esc(e.branchId || '') + '</div></div>'
      + T.statusBadge(e.status) + '</div></div>'
      + '<div class="tg-kpi">'
      + '<div class="k"><div class="n">' + (rec && rec.checkIn ? '✅' : '—') + '</div><div class="l">Check-in</div></div>'
      + '<div class="k"><div class="n">' + (rec && rec.checkOut ? '✅' : '—') + '</div><div class="l">Check-out</div></div>'
      + '<div class="k"><div class="n">🔔' + unread + '</div><div class="l">Chưa đọc</div></div></div>'
      + '<div class="tg-sec">Lịch hôm nay (' + T.fmtDMY(today) + ')</div>'
      + '<div class="tg-card">' + dayStr + '</div>'
      + '<div class="tg-sec">Thông báo mới</div>'
      + '<div class="tg-card">' + (allN.slice(0, 4).map((n) => '<div class="tg-row"><div class="ic">📣</div><div class="bd"><div class="tt">' + T.esc(n.title || n.type || 'Thông báo') + '</div><div class="sm">' + T.esc((n.content || n.message || '').slice(0, 90)) + '</div></div></div>').join('') || T.empty('Chưa có thông báo')) + '</div>';
  };

  // ---------- Điểm danh ----------
  let streamRef = null, capIn = null, capOut = null;
  async function startCam() {
    stopCam();
    try {
      streamRef = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      const v = T.$('tgCam');
      if (v) { v.srcObject = streamRef; await v.play().catch(() => {}); }
      return true;
    } catch (e) { T.toast('Không mở được camera: ' + e.message); return false; }
  }
  function stopCam() { try { if (streamRef) streamRef.getTracks().forEach((t) => t.stop()); streamRef = null; } catch (e) {} }
  function snap() {
    const v = T.$('tgCam');
    if (!v || !v.videoWidth) { T.toast('Camera chưa sẵn sàng'); return null; }
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return c.toDataURL('image/jpeg', 0.7);
  }
  T.pages['emp-att'] = async () => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    const today = T.vnToday();
    let recs = [];
    try { recs = await T.empApi('/api/attendances?employeeId=' + encodeURIComponent(e.employeeId) + '&date=' + today); } catch (ex) {}
    const arr = Array.isArray(recs) ? recs : (recs.attendances || recs.data || []);
    const rec = arr[0] || {};
    const hasIn = !!(rec.checkIn || rec.checkInAt || rec.checkin);
    const hasOut = !!(rec.checkOut || rec.checkOutAt || rec.checkout);

    const shiftCodes = {
      CA_SANG: { name: 'Ca Sáng (07:00 - 12:00)', end: '12:00', endMinutes: 12 * 60 },
      CA_CHIEU: { name: 'Ca Chiều (12:00 - 18:00)', end: '18:00', endMinutes: 18 * 60 },
      CA_TRUA: { name: 'Ca Chiều (12:00 - 18:00)', end: '18:00', endMinutes: 18 * 60 },
      CA_TOI: { name: 'Ca Tối (18:00 - 23:00)', end: '23:00', endMinutes: 23 * 60 }
    };
    const sInfo = shiftCodes[e.shift] || shiftCodes.CA_SANG;
    let isEarlyCheckout = false;
    let curTimeStr = '';
    try {
      const now = new Date();
      curTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
      const [curH, curM] = curTimeStr.split(':').map(Number);
      const curMinutes = (curH || 0) * 60 + (curM || 0);
      isEarlyCheckout = curMinutes < sInfo.endMinutes;
    } catch (err) { isEarlyCheckout = false; }

    const earlyAlertHtml = (hasIn && !hasOut && isEarlyCheckout)
      ? '<div style="background:#fef2f2;border:1px solid #ef4444;color:#991b1b;padding:12px;border-radius:12px;margin:10px 0;font-size:13px;line-height:1.4">'
        + '⛔ <b>CẢNH BÁO CHƯA ĐẾN GIỜ CHECK-OUT!</b><br>'
        + 'Ca làm việc của bạn: <b>' + sInfo.name + '</b> (kết thúc lúc <b>' + sInfo.end + '</b>).<br>'
        + 'Hiện tại: <b>' + curTimeStr.slice(0, 5) + '</b>. Vui lòng hoàn thành đủ giờ ca trước khi bấm Ra ca.'
        + '</div>'
      : '';

    const canOut = hasIn && !hasOut && !isEarlyCheckout;

    let hist = [];
    try { hist = await T.empApi('/api/attendances?employeeId=' + encodeURIComponent(e.employeeId)); } catch (ex) {}
    const harr = (Array.isArray(hist) ? hist : (hist.attendances || hist.data || [])).slice(0, 10);
    return ''
      + '<div class="tg-card"><h3>📍 Điểm danh GPS & Camera trực diện</h3>'
      + '<div style="font-size:13px;color:var(--tg-hint);margin-bottom:8px">' + T.fmtDMY(today) + ' — <b>' + T.shiftVi(e.shift) + '</b></div>'
      + '<div class="tg-flex"><div>' + T.badge(hasIn ? 'Đã Check-in' : 'Chưa Check-in', hasIn ? 'b-ok' : 'b-warn') + '</div><div>' + T.badge(hasOut ? 'Đã Check-out' : 'Chưa Check-out', hasOut ? 'b-ok' : 'b-warn') + '</div></div>'
      + earlyAlertHtml
      + '<div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:10px 14px;border-radius:12px;margin:10px 0;font-size:12px;line-height:1.4">'
      + '📸 <b>Yêu cầu chụp ảnh 3 yếu tố trực diện:</b><br>'
      + '1️⃣ Khuôn mặt chính diện rõ nét.<br>'
      + '2️⃣ Áo đồng phục Ụm Bò Milk.<br>'
      + '3️⃣ Thẻ nhân viên đeo ngay ngắn trước ngực.'
      + '</div>'
      + '<video id="tgCam" class="tg-cam" style="margin-top:6px" playsinline muted></video>'
      + '<div class="tg-flex" style="margin-top:8px"><button class="tg-btn ghost" id="btnCam">📷 Mở camera</button><button class="tg-btn ghost" id="btnSnap">📸 Chụp</button></div>'
      + '<div id="capPrev" class="sm" style="font-size:12px;color:var(--tg-hint);margin-top:6px">Chưa có ảnh. Ảnh chụp trực tiếp kèm toạ độ GPS.</div>'
      + '<div class="tg-flex" style="margin-top:8px"><button class="tg-btn ok" id="btnIn" ' + (hasIn ? 'disabled style="opacity:.5"' : '') + '>Vào ca</button>'
      + '<button class="tg-btn" id="btnOut" ' + (!canOut ? 'disabled style="opacity:.5;cursor:not-allowed"' : '') + '>Ra ca</button></div></div>'
      + '<div class="tg-sec">Lịch sử chấm công gần đây</div><div class="tg-card">'
      + (harr.map((a) => {
        const d = a.date || a.workDate || '';
        const ci = a.checkIn || a.checkInAt || a.checkin || ''; const co = a.checkOut || a.checkOutAt || a.checkout || '';
        return '<div class="tg-row"><div class="ic">🗓️</div><div class="bd"><div class="tt">' + T.fmtDMY(d) + ' • ' + T.esc(a.shift || '') + '</div>'
          + '<div class="sm">Vào: ' + T.esc(String(ci).slice(11, 16) || String(ci).slice(0, 5) || '—') + ' • Ra: ' + T.esc(String(co).slice(11, 16) || String(co).slice(0, 5) || '—') + '</div></div>' + T.statusBadge(a.status || (co ? 'CHECKED_OUT' : ci ? 'CHECKED_IN' : '—')) + '</div>';
      }).join('') || T.empty('Chưa có lượt chấm công')) + '</div>';
  };
  T.pages['emp-att:mount'] = async () => {
    const e = emp();
    let img = null;
    const prev = () => { const p = T.$('capPrev'); if (p) p.innerHTML = img ? '✅ Đã có ảnh (' + Math.round(img.length / 1024) + ' KB)' : 'Chưa có ảnh.'; };
    if (T.$('btnCam')) T.$('btnCam').onclick = () => startCam();
    if (T.$('btnSnap')) T.$('btnSnap').onclick = () => { img = snap(); if (img) { T.notifyOk(); prev(); } };
    async function submit(kind) {
      if (!img) { T.toast('Vui lòng chụp ảnh khuôn mặt + áo + thẻ'); return; }
      T.toast('Đang xác thực toạ độ GPS...');
      const g = await T.getGPS();
      const body = { employeeId: e.employeeId, gps: g.lat != null ? (g.lat + ',' + g.lng) : '', address: '', image: img, shift: e.shift, isCameraCapture: true };
      try {
        await T.empApi(kind === 'in' ? '/api/attendance/checkin' : '/api/attendance/checkout', { method: 'POST', body });
        T.notifyOk();
        T.toast(kind === 'in' ? 'Check-in thành công ✅ Đang đóng app...' : 'Check-out thành công ✅ Đang đóng app...');
        stopCam();
        T.refresh();
        setTimeout(() => {
          try {
            if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.close === 'function') {
              window.Telegram.WebApp.close();
            }
          } catch(e) {}
        }, 1200);
      } catch (err) { T.notifyErr(); T.toast(err.message || 'Gửi thất bại'); }
    }
    if (T.$('btnIn')) T.$('btnIn').onclick = () => submit('in');
    if (T.$('btnOut')) T.$('btnOut').onclick = () => submit('out');
    startCam();
  };

  // ---------- Lịch ----------
  T.pages['emp-sched'] = async (p) => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    const live = !!(p && p.live);
    let list = [];
    try {
      if (live) {
        const rows = await T.sheetLive('LICH_LAM_VIEC', (u) => T.empApi(u));
        list = rows.filter((r) => String(r['Mã NV'] || '') === e.employeeId).map((r) => ({ date: r['Ngày'], shift: r['Ca'], status: r['Trạng thái'], branchId: r['Chi nhánh'], substituteFor: r['Người thay'] }));
      } else {
        const j = await T.empApi('/api/schedules?employeeId=' + encodeURIComponent(e.employeeId));
        list = Array.isArray(j) ? j : (j.schedules || j.data || []);
      }
    } catch (ex) { return '<div class="tg-card">⚠️ ' + (live ? 'Sheet: ' : '') + T.esc(ex.message) + (live ? '<button class="tg-btn ghost" onclick="TG.go(\'emp-sched\')">Về nguồn server</button>' : '') + '</div>'; }
    const sorted = list.slice().sort((a, b) => String(a.date) > String(b.date) ? 1 : -1).slice(0, 21);
    const tgBtn = '<div class="tg-card"><button class="tg-btn ' + (live ? '' : 'ghost') + '" data-schedlive="' + (live ? '' : '1') + '">' + (live ? '📄 Lịch Sheet trực tiếp ✅' : '📄 Lịch Sheet trực tiếp') + '</button></div>';
    return tgBtn + '<div class="tg-sec">Lịch làm việc (' + sorted.length + ' ngày tới)</div><div class="tg-card">'
      + (sorted.map((s) => '<div class="tg-row"><div class="ic">' + (String(s.status).includes('OFF') ? '🌙' : '☀️') + '</div><div class="bd"><div class="tt">' + T.fmtDMY(s.date) + ' • ' + T.shiftVi(s.shift) + '</div>'
        + '<div class="sm">' + T.esc(s.branchId || '') + (s.substituteFor ? ' • Thay: ' + T.esc(s.substituteFor) : '') + '</div></div>' + T.statusBadge(s.status) + '</div>').join('') || T.empty('Chưa có lịch')) + '</div>';
  };
  T.pages['emp-sched:mount'] = async () => {
    document.querySelectorAll('[data-schedlive]').forEach((b) => { b.onclick = () => T.go('emp-sched', { live: b.dataset.schedlive ? 1 : 0 }); });
  };

  // ---------- Hub "Thêm" ----------
  T.pages['emp-more'] = async () => {
    const e = emp() || {};
    const isOff = e.type === 'OFFICIAL';
    return '<div class="tg-sec">Nghỉ & đổi ca</div><div class="tg-grid">'
      + '<button class="tg-menu" data-go="emp-off"><span class="mi">🌙</span>Nghỉ OFF</button>'
      + '<button class="tg-menu" data-go="emp-sos"><span class="mi">🆘</span>OFF đột xuất</button>'
      + '<button class="tg-menu" data-go="emp-swap"><span class="mi">🔄</span>Đổi ca</button>'
      + '<button class="tg-menu" data-go="emp-learn"><span class="mi">🎓</span>Học tập' + (isOff ? '' : ' & TEST') + '</button></div>'
      + '<div class="tg-sec">Tài khoản</div><div class="tg-grid">'
      + '<button class="tg-menu" data-go="emp-notif"><span class="mi">🔔</span>Thông báo</button>'
      + '<button class="tg-menu" data-go="emp-device"><span class="mi">📱</span>Đổi ĐT</button>'
      + '<button class="tg-menu" data-go="emp-salary"><span class="mi">💰</span>Lương</button>'
      + '<button class="tg-menu" data-go="emp-account"><span class="mi">👤</span>Tài khoản</button></div>';
  };
  T.pages['emp-more:mount'] = async () => {
    document.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => T.go(b.dataset.go); });
  };

  // ---------- OFF ----------
  T.pages['emp-off'] = async () => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    let win = {}, mine = [];
    try { win = await T.empApi('/api/off-window'); } catch (ex) {}
    try { const j = await T.empApi('/api/off-requests?employeeId=' + encodeURIComponent(e.employeeId)); mine = Array.isArray(j) ? j : (j.requests || j.data || []); } catch (ex) {}
    const maxN = e.type === 'OFFICIAL' ? 2 : 5;
    const open = !!win.isOpen;
    return '<div class="tg-card"><h3>🌙 Đăng ký OFF (' + (e.type === 'OFFICIAL' ? 'Chính thức: tối đa 2 ngày/tuần' : 'Training: 5 ngày OFF đợt đào tạo') + ')</h3>'
      + '<div>' + (open ? T.badge('Đang mở đăng ký', 'b-ok') : T.badge('Ngoài khung giờ (T6 12:00 → T7 15:00)', 'b-warn')) + (win.vipTest ? ' ' + T.badge('VIP TEST', 'b-info') : '') + '</div>'
      + '<label class="tg-lab">Chọn ngày (tối đa ' + maxN + ')</label><input id="offDates" class="tg-inp" placeholder="YYYY-MM-DD, cách nhau dấu phẩy">'
      + '<button class="tg-btn" id="btnOff" ' + (open ? '' : 'disabled style="opacity:.5"') + '>Gửi đăng ký</button></div>'
      + '<div class="tg-sec">Phiếu của tôi</div><div class="tg-card">'
      + (mine.map((r) => '<div class="tg-row"><div class="ic">📝</div><div class="bd"><div class="tt">' + T.esc((r.dates || []).map(T.fmtDMY).join(', ')) + '</div><div class="sm">' + T.esc(r.createdAt || r.created_at || '') + '</div></div>' + T.statusBadge(r.status) + '</div>').join('') || T.empty('Chưa có phiếu')) + '</div>';
  };
  T.pages['emp-off:mount'] = async () => {
    const e = emp();
    const maxN = e.type === 'OFFICIAL' ? 2 : 5;
    if (T.$('btnOff')) T.$('btnOff').onclick = async () => {
      const dates = T.$('offDates').value.split(',').map((s) => s.trim()).filter(Boolean);
      if (!dates.length || dates.length > maxN) { T.toast('Chọn 1–' + maxN + ' ngày (YYYY-MM-DD)'); return; }
      try {
        if (e.type === 'OFFICIAL') await T.empApi('/api/off-requests', { method: 'POST', body: { employeeId: e.employeeId, dates } });
        else await T.empApi('/api/employee/register-off', { method: 'POST', body: { employeeId: e.employeeId, offDates: dates } });
        T.notifyOk(); T.toast('Gửi thành công ✅'); T.refresh();
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    };
  };

  // ---------- SOS / Emergency ----------
  T.pages['emp-sos'] = async () => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    let mine = [], invites = [];
    try {
      const j = await T.empApi('/api/emergency-requests');
      const arr = Array.isArray(j) ? j : (j.requests || j.data || []);
      mine = arr.filter((r) => r.employeeId === e.employeeId);
      invites = arr.filter((r) => r.employeeId !== e.employeeId && (r.branchId === e.branchId || !r.branchId));
    } catch (ex) {}
    let notifs = [];
    try { const j = await T.empApi('/api/notifications?employeeId=' + encodeURIComponent(e.employeeId)); const a = Array.isArray(j) ? j : (j.notifications || j.data || []); notifs = a.filter((n) => n.type === 'SUBSTITUTE_INVITE' && !n.read && !n.isRead); } catch (ex) {}
    return '<div class="tg-card"><h3>🆘 OFF đột xuất (tối đa 1 ngày/tuần, cần người thay)</h3>'
      + '<label class="tg-lab">Ngày cần nghỉ</label><input id="sosDate" type="date" class="tg-inp" value="' + T.vnToday() + '">'
      + '<label class="tg-lab">Lý do</label><input id="sosReason" class="tg-inp" placeholder="Lý do nghỉ đột xuất...">'
      + '<button class="tg-btn" id="btnSos">Gửi yêu cầu</button></div>'
      + (notifs.length ? '<div class="tg-sec">Lời mời thay ca (' + notifs.length + ')</div><div class="tg-card">' + notifs.map((n, i) => '<div class="tg-row"><div class="ic">🙏</div><div class="bd"><div class="tt">' + T.esc(n.title || 'Mời thay ca') + '</div><div class="sm">' + T.esc((n.content || n.message || '').slice(0, 100)) + '</div></div><button class="tg-btn sm ok" data-ni="' + i + '">Xem</button></div>').join('') + '</div>' : '')
      + '<div class="tg-sec">Phiếu của tôi</div><div class="tg-card">'
      + (mine.map((r) => '<div class="tg-row"><div class="ic">🆘</div><div class="bd"><div class="tt">' + T.fmtDMY(r.date) + ' • ' + T.esc(r.reason || '') + '</div><div class="sm">Thay: ' + T.esc(r.substituteId || r.substitute || 'chưa có') + '</div></div>' + T.statusBadge(r.status) + '</div>').join('') || T.empty('Chưa có phiếu')) + '</div>'
      + '<div class="tg-sec">Người cần thay (' + invites.length + ')</div><div class="tg-card">'
      + (invites.slice(0, 10).map((r) => '<div class="tg-row"><div class="ic">🤝</div><div class="bd"><div class="tt">' + T.esc(r.employeeId || '') + ' • ' + T.fmtDMY(r.date) + '</div><div class="sm">' + T.esc(r.reason || '') + '</div></div><button class="tg-btn sm ok" data-acc="' + r.id + '">Nhận</button> <button class="tg-btn sm ghost" data-rej="' + r.id + '">Từ chối</button></div>').join('') || T.empty('Không có yêu cầu')) + '</div>';
  };
  T.pages['emp-sos:mount'] = async () => {
    const e = emp();
    if (T.$('btnSos')) T.$('btnSos').onclick = async () => {
      const date = T.$('sosDate').value, reason = T.$('sosReason').value.trim();
      if (!date || !reason) { T.toast('Nhập ngày + lý do'); return; }
      try { await T.empApi('/api/emergency-requests', { method: 'POST', body: { employeeId: e.employeeId, date, reason } }); T.notifyOk(); T.toast('Đã gửi ✅'); T.refresh(); }
      catch (err) { T.notifyErr(); T.toast(err.message); }
    };
    document.querySelectorAll('[data-acc]').forEach((b) => { b.onclick = async () => {
      try { await T.empApi('/api/emergency-requests/' + b.dataset.acc + '/respond', { method: 'POST', body: { substituteId: e.employeeId, action: 'APPROVE' } }); T.notifyOk(); T.toast('Đã nhận thay ca ✅'); T.refresh(); }
      catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-rej]').forEach((b) => { b.onclick = async () => {
      try { await T.empApi('/api/emergency-requests/' + b.dataset.rej + '/respond', { method: 'POST', body: { substituteId: e.employeeId, action: 'REJECT' } }); T.toast('Đã từ chối'); T.refresh(); }
      catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-ni]').forEach((b) => { b.onclick = () => T.go('emp-notif'); });
  };

  // ---------- Đổi ca ----------
  T.pages['emp-swap'] = async () => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    const isTraining = e.type !== 'OFFICIAL';
    let mine = [], reqs = [];
    try {
      if (isTraining) { const j = await T.empApi('/api/training/shift-requests?employeeId=' + encodeURIComponent(e.employeeId)); mine = Array.isArray(j) ? j : (j.requests || j.data || []); }
      else { const j = await T.empApi('/api/shift-swap?employeeId=' + encodeURIComponent(e.employeeId)); mine = Array.isArray(j) ? j : (j.requests || j.data || []); }
    } catch (ex) {}
    try {
      if (!isTraining) { const j = await T.empApi('/api/shift-swap?branch=' + encodeURIComponent(e.branchId || '')); const a = Array.isArray(j) ? j : (j.requests || j.data || []); reqs = a.filter((r) => r.requesterId !== e.employeeId).slice(0, 10); }
    } catch (ex) {}
    return '<div class="tg-card"><h3>🔄 Đổi ca (' + (isTraining ? 'Training' : 'Chính thức') + ')</h3>'
      + '<label class="tg-lab">Ngày của bạn</label><input id="swDate" type="date" class="tg-inp" value="' + T.vnToday() + '">'
      + (isTraining
        ? '<label class="tg-lab">Ca mới</label><select id="swTo" class="tg-sel"><option>CA_SANG</option><option>CA_CHIEU</option><option>CA_TOI</option></select>'
        : '<label class="tg-lab">Đổi sang OFF hay ca khác?</label><select id="swTo" class="tg-sel"><option value="OFF">Nghỉ OFF</option><option value="CA_SANG">CA_SANG</option><option value="CA_CHIEU">CA_CHIEU</option><option value="CA_TOI">CA_TOI</option></select>'
        + '<label class="tg-lab">Mã NV muốn tráo cùng (để trống = gửi HR)</label><input id="swTarget" class="tg-inp" placeholder="Mã NV...">')
      + '<label class="tg-lab">Lý do</label><input id="swReason" class="tg-inp" placeholder="Lý do đổi ca...">'
      + '<button class="tg-btn" id="btnSwap">Gửi yêu cầu</button></div>'
      + '<div class="tg-sec">Phiếu của tôi</div><div class="tg-card">'
      + (mine.map((r) => '<div class="tg-row"><div class="ic">🔄</div><div class="bd"><div class="tt">' + T.fmtDMY(r.date) + ' → ' + T.esc(r.toShift || r.toType || '') + '</div><div class="sm">' + T.esc(r.reason || '') + '</div></div>' + T.statusBadge(r.status) + (r.status === 'PENDING' && r.id ? ' <button class="tg-btn sm danger" data-cancel="' + r.id + '">Hủy</button>' : '') + '</div>').join('') || T.empty('Chưa có phiếu')) + '</div>'
      + (!isTraining && reqs.length ? '<div class="tg-sec">Lời mời tráo ca</div><div class="tg-card">' + reqs.map((r) => '<div class="tg-row"><div class="ic">🤝</div><div class="bd"><div class="tt">' + T.esc(r.requesterId || '') + ' • ' + T.fmtDMY(r.date) + '</div><div class="sm">' + T.esc(r.reason || '') + '</div></div><button class="tg-btn sm ok" data-ok="' + r.id + '">Đồng ý</button></div>').join('') + '</div>' : '');
  };
  T.pages['emp-swap:mount'] = async () => {
    const e = emp(); const isTraining = e.type !== 'OFFICIAL';
    if (T.$('btnSwap')) T.$('btnSwap').onclick = async () => {
      const date = T.$('swDate').value, to = T.$('swTo').value, reason = T.$('swReason').value.trim();
      if (!date || !reason) { T.toast('Nhập ngày + lý do'); return; }
      try {
        if (isTraining) await T.empApi('/api/training/shift-change', { method: 'POST', body: { employeeId: e.employeeId, date, toShift: to, reason } });
        else {
          const target = (T.$('swTarget') || {}).value || '';
          if (to === 'OFF' && !target) await T.empApi('/api/off-work-swap', { method: 'POST', body: { requesterId: e.employeeId, date, toType: 'OFF', reason } });
          else await T.empApi('/api/shift-swap', { method: 'POST', body: { requesterId: e.employeeId, date, toShift: to, targetEmployeeId: target || undefined, reason } });
        }
        T.notifyOk(); T.toast('Đã gửi ✅'); T.refresh();
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    };
    document.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = async () => {
      try { await T.empApi('/api/shift-swap/' + b.dataset.cancel + '/cancel', { method: 'POST', body: { employeeId: e.employeeId } }); T.toast('Đã hủy'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-ok]').forEach((b) => { b.onclick = async () => {
      try { await T.empApi('/api/shift-swap/' + b.dataset.ok + '/respond', { method: 'POST', body: { employeeId: e.employeeId, action: 'ACCEPT' } }); T.notifyOk(); T.toast('Đã đồng ý ✅'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
  };

  // ---------- Học tập / TEST ----------
  let quizState = null;
  T.pages['emp-learn'] = async () => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    if (quizState) return quizHTML();
    let courses = [], results = [];
    try { const j = await T.empApi('/api/courses'); courses = Array.isArray(j) ? j : (j.courses || j.data || []); } catch (ex) {}
    try { const j = await T.empApi('/api/test-results?employeeId=' + encodeURIComponent(e.employeeId)); results = Array.isArray(j) ? j : (j.results || j.data || []); } catch (ex) {}
    return '<div class="tg-card"><h3>🎓 E-learning & TEST đầu ra</h3><div class="sm" style="font-size:12px;color:var(--tg-hint)">25 câu • Quy tắc: &lt;5 LOẠI • 5–7 THI LẠI • &gt;7 ĐẠT</div>'
      + (courses.slice(0, 5).map((c, i) => '<div class="tg-row"><div class="ic">📝</div><div class="bd"><div class="tt">' + T.esc(c.name || c.title || ('Đề ' + (i + 1))) + '</div><div class="sm">' + T.esc(c.id || '') + '</div></div><button class="tg-btn sm" data-course="' + T.esc(c.id || '') + '">Làm bài</button></div>').join('') || T.empty('Chưa có đề thi')) + '</div>'
      + '<div class="tg-sec">Kết quả gần đây</div><div class="tg-card">'
      + (results.slice(0, 5).map((r) => '<div class="tg-row"><div class="ic">🏆</div><div class="bd"><div class="tt">Điểm: ' + T.esc(r.score != null ? r.score : (r.correct + '/' + r.total)) + '</div><div class="sm">' + T.esc(r.createdAt || r.created_at || '') + '</div></div>' + T.statusBadge(r.result || '') + '</div>').join('') || T.empty('Chưa thi lần nào')) + '</div>';
  };
  function quizHTML() {
    const q = quizState.questions[quizState.idx];
    const total = quizState.questions.length;
    return '<div class="tg-card"><h3>Câu ' + (quizState.idx + 1) + '/' + total + ' ⏱ ' + quizState.left + 's</h3>'
      + '<div class="tg-progress"><div style="width:' + Math.round((quizState.idx / total) * 100) + '%"></div></div>'
      + '<div style="font-weight:700;margin-top:10px">' + T.esc(q.question || q.text || q.q) + '</div>'
      + (q.options || q.choices || []).map((o, i) => '<button class="tg-quiz-opt' + (quizState.answers[quizState.idx] === i ? ' sel' : '') + '" data-opt="' + i + '">' + T.esc(typeof o === 'string' ? o : (o.text || o.label)) + '</button>').join('')
      + '<div class="tg-flex" style="margin-top:10px"><button class="tg-btn ghost" id="qPrev">← Trước</button><button class="tg-btn" id="qNext">' + (quizState.idx === total - 1 ? 'Nộp bài' : 'Tiếp →') + '</button></div></div>';
  }
  T.pages['emp-learn:mount'] = async () => {
    const e = emp();
    document.querySelectorAll('[data-course]').forEach((b) => { b.onclick = async () => {
      try {
        T.toast('Đang mở đề...');
        const j = await T.empApi('/api/quiz/open', { method: 'POST', body: { employeeId: e.employeeId } });
        const qs = j.questions || j.course?.questions || j.quiz?.questions || [];
        if (!qs.length) { T.toast('Đề trống'); return; }
        quizState = { courseId: b.dataset.course || j.courseId, questions: qs, idx: 0, answers: {}, left: 8 * 60, qids: qs.map((q) => q.id) };
        quizTick();
        T.refresh();
      } catch (err) { T.toast(err.message); }
    }; });
    if (!quizState) return;
    const t = setInterval(() => { if (!quizState) { clearInterval(t); return; } quizState.left--; const h = document.querySelector('.tg-card h3'); if (h) h.innerHTML = 'Câu ' + (quizState.idx + 1) + '/' + quizState.questions.length + ' ⏱ ' + quizState.left + 's'; if (quizState.left <= 0) { clearInterval(t); submitQuiz(); } }, 1000);
    document.querySelectorAll('[data-opt]').forEach((b) => { b.onclick = () => { quizState.answers[quizState.idx] = Number(b.dataset.opt); T.haptic('light'); T.refresh(); }; });
    if (T.$('qPrev')) T.$('qPrev').onclick = () => { if (quizState.idx > 0) { quizState.idx--; T.refresh(); } };
    if (T.$('qNext')) T.$('qNext').onclick = async () => {
      if (quizState.idx < quizState.questions.length - 1) { quizState.idx++; T.refresh(); }
      else if (await T.confirmDlg('Nộp bài?')) submitQuiz();
    };
    async function submitQuiz() {
      const qs = quizState; quizState = null; clearInterval(t);
      const answers = qs.questions.map((_, i) => (qs.answers[i] != null ? qs.answers[i] : -1));
      try {
        const j = await T.empApi('/api/courses/' + encodeURIComponent(qs.courseId || 'quiz') + '/submit', { method: 'POST', body: { employeeId: e.employeeId, answers, timeSpent: 8 * 60 - qs.left, questionIds: qs.qids } });
        T.notifyOk();
        T.go('emp-result', { score: j.score != null ? j.score : (j.testResult && j.testResult.score), result: (j.testResult && (j.testResult.result || j.testResult.testResult)) || j.result });
      } catch (err) { T.notifyErr(); T.toast(err.message); T.refresh(); }
    }
  };
  function quizTick() {}
  T.pages['emp-result'] = async (p) => '<div class="tg-card" style="text-align:center;padding:30px 14px"><div style="font-size:48px">🏆</div><h3>Kết quả</h3><div style="font-size:28px;font-weight:900">' + T.esc(p.score != null ? p.score : '—') + '</div><div style="margin-top:8px">' + T.statusBadge(p.result || '') + '</div><button class="tg-btn" onclick="TG.go(\'emp-learn\')">Về học tập</button></div>';

  // ---------- Thông báo ----------
  T.pages['emp-notif'] = async () => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    let arr = [];
    try { const j = await T.empApi('/api/notifications?employeeId=' + encodeURIComponent(e.employeeId)); arr = Array.isArray(j) ? j : (j.notifications || j.data || []); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    return '<div class="tg-card">' + (arr.map((n) => '<div class="tg-row"><div class="ic">' + ((n.read || n.isRead) ? '📭' : '📬') + '</div><div class="bd"><div class="tt">' + T.esc(n.title || n.type || '') + '</div><div class="sm">' + T.esc(n.content || n.message || '') + '</div></div>' + (!(n.read || n.isRead) && n.id ? '<button class="tg-btn sm ghost" data-read="' + n.id + '">Đọc</button>' : '') + '</div>').join('') || T.empty('Chưa có thông báo')) + '</div>';
  };
  T.pages['emp-notif:mount'] = async () => {
    document.querySelectorAll('[data-read]').forEach((b) => { b.onclick = async () => {
      try { await T.empApi('/api/notifications/' + b.dataset.read + '/read', { method: 'POST' }); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
  };

  // ---------- Đổi điện thoại ----------
  T.pages['emp-device'] = async () => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    let arr = [];
    try { const j = await T.empApi('/api/device-requests'); arr = Array.isArray(j) ? j : (j.requests || j.data || []); arr = arr.filter((r) => r.employeeId === e.employeeId); } catch (ex) {}
    return '<div class="tg-card"><h3>📱 Yêu cầu đổi điện thoại</h3><div class="sm" style="font-size:12px;color:var(--tg-hint)">Lý do bắt buộc • HR duyệt trong 30 phút • Dữ liệu giữ nguyên</div>'
      + '<label class="tg-lab">Lý do</label><input id="dvReason" class="tg-inp" placeholder="VD: mất máy, đổi máy mới...">'
      + '<button class="tg-btn" id="btnDv">Gửi yêu cầu</button></div>'
      + '<div class="tg-sec">Lịch sử</div><div class="tg-card">'
      + (arr.map((r) => '<div class="tg-row"><div class="ic">📱</div><div class="bd"><div class="tt">' + T.esc(r.reason || '') + '</div><div class="sm">' + T.esc(r.createdAt || r.created_at || '') + '</div></div>' + T.statusBadge(r.status) + '</div>').join('') || T.empty('Chưa có yêu cầu')) + '</div>';
  };
  T.pages['emp-device:mount'] = async () => {
    const e = emp();
    if (T.$('btnDv')) T.$('btnDv').onclick = async () => {
      const reason = T.$('dvReason').value.trim();
      if (!reason) { T.toast('Nhập lý do'); return; }
      try { await T.empApi('/api/auth/device-request', { method: 'POST', body: { employeeId: e.employeeId, reason, deviceId: deviceId() } }); T.notifyOk(); T.toast('Đã gửi ✅'); T.refresh(); }
      catch (err) { T.toast(err.message); }
    };
  };

  // ---------- Lương ----------
  T.pages['emp-salary'] = async () => {
    const e = emp(); if (!e) return T.empty('Chưa đăng nhập');
    const m = T.vnToday().slice(0, 7);
    let arr = [];
    try { const j = await T.empApi('/api/attendances?employeeId=' + encodeURIComponent(e.employeeId)); arr = Array.isArray(j) ? j : (j.attendances || j.data || []); } catch (ex) {}
    const month = arr.filter((a) => String(a.date || '').startsWith(m));
    const rate = e.type === 'OFFICIAL' ? 25500 : 21000;
    let shifts = 0, total = 0;
    month.forEach((a) => {
      const ci = a.checkIn || a.checkInAt, co = a.checkOut || a.checkOutAt;
      if (ci && co) { shifts++; total += (SHIFT_HOURS[a.shift] || 5) * rate; }
    });
    return '<div class="tg-card"><h3>💰 Lương tháng ' + m + '</h3><div class="tg-kpi">'
      + '<div class="k"><div class="n">' + shifts + '</div><div class="l">Ca hợp lệ</div></div>'
      + '<div class="k"><div class="n" style="font-size:15px">' + T.fmtMoney(rate) + '</div><div class="l">Đơn giá/giờ</div></div>'
      + '<div class="k"><div class="n" style="font-size:15px">' + T.fmtMoney(total) + '</div><div class="l">Tạm tính</div></div></div>'
      + '<div class="sm" style="font-size:11px;color:var(--tg-hint);margin-top:8px">Tạm tính = ca đủ IN+OUT × giờ ca × đơn giá. Số chính thức do kế toán chốt (trừ phạt + điều chỉnh).</div></div>';
  };

  // ---------- Tài khoản ----------
  T.pages['emp-account'] = async () => {
    const e = emp() || {};
    return '<div class="tg-card"><div class="tg-row"><div class="ic">👤</div><div class="bd"><div class="tt">' + T.esc(e.name || '') + '</div><div class="sm">' + T.esc(e.employeeId || '') + ' • ' + T.esc(e.phone || '') + '</div></div></div>'
      + '<div class="tg-row"><div class="ic">🏪</div><div class="bd"><div class="tt">Chi nhánh & ca</div><div class="sm">' + T.esc(e.branchId || '') + ' • ' + T.shiftVi(e.shift) + '</div></div></div>'
      + '<div class="tg-row"><div class="ic">📱</div><div class="bd"><div class="tt">Thiết bị</div><div class="sm">' + T.esc(deviceId()) + '</div></div></div></div>'
      + '<button class="tg-btn danger" id="btnLogout">Đăng xuất</button>';
  };
  T.pages['emp-account:mount'] = async () => {
    if (T.$('btnLogout')) T.$('btnLogout').onclick = async () => {
      if (!await T.confirmDlg('Đăng xuất khỏi Mini App?')) return;
      T.store.del('emp_token'); T.store.del('emp_user'); T.setTabs([]); T.go('emp-link', {}, true);
    };
  };

  window.TG_EMP = { deviceId, me };
})();
