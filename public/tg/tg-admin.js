/* TG Admin — quản trị native: dùng đúng API web HR hiện tại. */
(function () {
  const T = window.TG;
  const H = T.hrApi;

  function hu() { return T.store.get('hr_user', null); }
  function mondayStr(d) {
    const x = new Date(d); const day = x.getDay(); const diff = x.getDate() - day + (day === 0 ? -6 : 1);
    x.setDate(diff);
    return x.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  }

  // ---------- Đăng nhập HR ----------
  T.pages['hr-login'] = async () => '<div class="tg-card"><h3>🛡️ Đăng nhập Quản trị</h3>'
    + '<label class="tg-lab">Tài khoản</label><input id="hrU" class="tg-inp" placeholder="admin / hr / manager" autocomplete="username">'
    + '<label class="tg-lab">Mật khẩu</label><input id="hrP" type="password" class="tg-inp" placeholder="••••••••" autocomplete="current-password">'
    + '<button class="tg-btn" id="btnHrLogin">Đăng nhập</button></div>';
  T.pages['hr-login:mount'] = async () => {
    T.$('btnHrLogin').onclick = async () => {
      try {
        const j = await T.call('/api/auth/login', { method: 'POST', body: { username: T.$('hrU').value.trim(), password: T.$('hrP').value } });
        T.store.set('hr_token', j.token); T.store.set('hr_user', j.user);
        T.notifyOk(); T.toast('Xin chào ' + (j.user.displayName || j.user.username));
        window.TG_APP.bootTabs();
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    };
  };

  // ---------- Tổng quan ----------
  T.pages['hr-home'] = async () => {
    let kpi = {}, sync = [];
    try { kpi = await H('/api/dashboard/kpi'); } catch (ex) {}
    try { const j = await H('/api/sync-queue'); sync = Array.isArray(j) ? j : (j.queue || j.data || []); } catch (ex) {}
    const pend = sync.filter((s) => s.sync_status === 'PENDING' || s.sync_status === 'FAILED').length;
    const k = (v) => (v != null ? v : '—');
    const cards = [
      ['Ứng viên', k(kpi.applicants ?? kpi.newApplicants)], ['Training', k(kpi.training)], ['Chính thức', k(kpi.official ?? kpi.officials)],
      ['Làm hôm nay', k(kpi.workingToday)], ['Đi trễ', k(kpi.lateToday)], ['Vắng', k(kpi.absentToday)],
      ['OFF hôm nay', k(kpi.offToday)], ['Chờ duyệt', k(kpi.pendingRequests)], ['Thiếu C/O', k(kpi.missingCheckout)],
    ];
    return '<div class="tg-sec">Tổng quan</div><div class="tg-kpi">'
      + cards.map((c) => '<div class="k"><div class="n">' + c[1] + '</div><div class="l">' + c[0] + '</div></div>').join('') + '</div>'
      + '<div class="tg-card" style="margin-top:12px"><div class="tg-row"><div class="ic">🔄</div><div class="bd"><div class="tt">Đồng bộ Sheet</div><div class="sm">' + pend + ' mục chờ/lỗi • ' + sync.length + ' tổng</div></div><button class="tg-btn sm" data-act="pull">Kéo Sheet</button></div></div>'
      + '<div class="tg-sec">Tác vụ nhanh</div><div class="tg-grid">'
      + '<button class="tg-menu" data-go="hr-applicants"><span class="mi">🧲</span>UV mới</button>'
      + '<button class="tg-menu" data-go="hr-emps"><span class="mi">👥</span>Nhân sự</button>'
      + '<button class="tg-menu" data-go="hr-approve"><span class="mi">✅</span>Duyệt</button>'
      + '<button class="tg-menu" data-go="hr-sched"><span class="mi">📅</span>Lịch</button></div>';
  };
  T.pages['hr-home:mount'] = async () => {
    document.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => T.go(b.dataset.go); });
    document.querySelectorAll('[data-act="pull"]').forEach((b) => { b.onclick = async () => {
      try { T.toast('Đang kéo Sheet...'); await H('/api/admin/pull-from-sheet', { method: 'POST' }); T.notifyOk(); T.toast('Đã kéo ✅'); T.refresh(); }
      catch (err) { T.toast(err.message); }
    }; });
  };

  // ---------- Hub NV / Thêm ----------
  T.pages['hr-staff'] = async () => '<div class="tg-sec">Nhân sự</div><div class="tg-grid">'
    + '<button class="tg-menu" data-go="hr-applicants"><span class="mi">🧲</span>UV mới</button>'
    + '<button class="tg-menu" data-go="hr-emps" data-p="TRAINING"><span class="mi">🌱</span>Training</button>'
    + '<button class="tg-menu" data-go="hr-emps" data-p="OFFICIAL"><span class="mi">⭐</span>Chính thức</button>'
    + '<button class="tg-menu" data-go="hr-sched"><span class="mi">📅</span>Lịch</button></div>'
    + '<div class="tg-sec">Quản lý khác</div><div class="tg-grid">'
    + '<button class="tg-menu" data-go="hr-attrec"><span class="mi">🗓️</span>Chấm công</button>'
    + '<button class="tg-menu" data-go="hr-reports"><span class="mi">📊</span>Báo cáo</button>'
    + '<button class="tg-menu" data-go="hr-learn"><span class="mi">🎓</span>E-learning</button>'
    + '<button class="tg-menu" data-go="hr-zalo"><span class="mi">💬</span>Zalo</button></div>'
    + '<div class="tg-sec">Hệ thống</div><div class="tg-grid">'
    + '<button class="tg-menu" data-go="hr-users"><span class="mi">🔑</span>Users</button>'
    + '<button class="tg-menu" data-go="hr-settings"><span class="mi">⚙️</span>Cài đặt</button>'
    + '<button class="tg-menu" data-go="hr-audit"><span class="mi">📜</span>Nhật ký</button>'
    + '<button class="tg-menu" data-go="hr-tg"><span class="mi">✈️</span>Telegram</button></div>';
  T.pages['hr-staff:mount'] = async () => {
    document.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => T.go(b.dataset.go, b.dataset.p ? { type: b.dataset.p } : {}); });
  };

  // ---------- Ứng viên ----------
  T.pages['hr-applicants'] = async () => {
    let arr = [];
    try { const j = await H('/api/applicants'); arr = Array.isArray(j) ? j : (j.applicants || j.data || []); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    return '<div class="tg-card"><div class="tg-row"><div class="ic">🧲</div><div class="bd"><div class="tt">Ứng viên mới (' + arr.length + ')</div><div class="sm">Form → AI chấm → PV → Training</div></div><button class="tg-btn sm" data-act="sync">Đồng bộ Form</button></div></div>'
      + '<div class="tg-card">' + (arr.slice(0, 50).map((a) => '<div class="tg-row"><div class="ic">👤</div><div class="bd"><div class="tt">' + T.esc(a.name || '') + ' • ' + T.esc(a.phone || '') + '</div><div class="sm">AI: ' + T.esc(a.aiScore != null ? a.aiScore : '—') + ' • ' + T.esc(a.branchText || a.branchPreference || '') + '</div></div>' + T.statusBadge(a.status) + ' <button class="tg-btn sm ghost" data-open="' + a.id + '">Chi tiết</button></div>').join('') || T.empty('Chưa có ứng viên')) + '</div>';
  };
  T.pages['hr-applicants:mount'] = async () => {
    document.querySelectorAll('[data-act="sync"]').forEach((b) => { b.onclick = async () => {
      try { T.toast('Đang đồng bộ...'); await H('/api/recruitment/sync-form', { method: 'POST' }); T.notifyOk(); T.toast('Xong ✅'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => T.go('hr-applicant', { id: b.dataset.open }); });
  };
  T.pages['hr-applicant'] = async (p) => {
    let a = null;
    try { const j = await H('/api/applicants'); const arr = Array.isArray(j) ? j : (j.applicants || j.data || []); a = arr.find((x) => String(x.id) === String(p.id)); } catch (ex) {}
    if (!a) return T.empty('Không tìm thấy ứng viên');
    return '<div class="tg-card"><h3>' + T.esc(a.name || '') + '</h3>'
      + '<div class="sm" style="font-size:13px">📞 ' + T.esc(a.phone || '') + ' • ' + T.esc(a.gender || '') + ' • ' + T.esc(a.birthYear || '') + '<br>🎓 ' + T.esc(a.education || '') + ' • Quê: ' + T.esc(a.hometown || '') + '<br>🕐 Ca: ' + T.esc(a.shiftText || a.shiftPreference || '') + ' • CN: ' + T.esc(a.branchText || a.branchPreference || '') + '<br>💼 KN: ' + T.esc(a.experience || '') + '<br>⭐ AI: ' + T.esc(a.aiScore != null ? a.aiScore : '—') + ' ' + T.statusBadge(a.status) + '</div></div>'
      + '<div class="tg-card"><h3>Thao tác</h3><div class="tg-flex">'
      + '<button class="tg-btn ok" data-st="PASS">PASS</button><button class="tg-btn danger" data-st="FAIL">FAIL</button></div>'
      + '<label class="tg-lab">Đặt lịch PV (YYYY-MM-DD HH:mm)</label><div class="tg-flex"><input id="pvAt" class="tg-inp" placeholder="2026-09-20 08:00"><button class="tg-btn" data-act="pv" style="max-width:110px">Đặt lịch</button></div>'
      + '<div class="tg-flex" style="margin-top:8px"><button class="tg-btn" data-act="conv">→ Training</button><button class="tg-btn danger" data-act="del">Xóa</button></div></div>';
  };
  T.pages['hr-applicant:mount'] = async (p) => {
    const id = p.id;
    document.querySelectorAll('[data-st]').forEach((b) => { b.onclick = async () => {
      try { await H('/api/applicants/' + id + '/status', { method: 'POST', body: { status: b.dataset.st } }); T.notifyOk(); T.toast('Đã cập nhật'); T.go('hr-applicants'); } catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
      const act = b.dataset.act;
      try {
        if (act === 'pv') { const at = T.$('pvAt').value.trim(); if (!at) { T.toast('Nhập thời gian'); return; } await H('/api/applicants/' + id + '/schedule-interview', { method: 'POST', body: { at } }); }
        if (act === 'conv') { if (!await T.confirmDlg('Chuyển ứng viên thành Training (cấp mã NV + key)?')) return; await H('/api/applicants/' + id + '/convert', { method: 'POST' }); }
        if (act === 'del') { if (!await T.confirmDlg('Xóa ứng viên này?')) return; await T.call('/api/applicants/' + id, { method: 'DELETE', token: T.S.hr }); }
        T.notifyOk(); T.toast('Xong ✅'); T.go('hr-applicants');
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    }; });
  };

  // ---------- Nhân viên ----------
  T.pages['hr-emps'] = async (p) => {
    let arr = [];
    try { const j = await H('/api/employees'); arr = Array.isArray(j) ? j : (j.employees || j.data || []); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    const type = (p && p.type) || '';
    const q = (p && p.q) || '';
    let list = arr;
    if (type) list = list.filter((e) => e.type === type);
    if (q) list = list.filter((e) => (e.name + e.employeeId + (e.phone || '')).toLowerCase().includes(q.toLowerCase()));
    return '<div class="tg-card"><input id="empQ" class="tg-inp" placeholder="🔍 Tên / mã NV / SĐT..." value="' + T.esc(q) + '">'
      + '<div class="tg-flex" style="margin-top:8px"><button class="tg-btn ghost" data-t="">Tất cả</button><button class="tg-btn ghost" data-t="TRAINING">Training</button><button class="tg-btn ghost" data-t="OFFICIAL">Chính thức</button></div></div>'
      + '<div class="tg-card">' + (list.slice(0, 60).map((e) => '<div class="tg-row"><div class="ic">👷</div><div class="bd"><div class="tt">' + T.esc(e.name || '') + '</div><div class="sm">' + T.esc(e.employeeId || '') + ' • ' + T.esc(e.branchId || '') + ' • ' + T.shiftVi(e.shift) + '</div></div>' + T.statusBadge(e.status) + ' <button class="tg-btn sm ghost" data-open="' + e.id + '">›</button></div>').join('') || T.empty('Không có nhân viên')) + '</div>'
      + '<div class="sm" style="font-size:12px;color:var(--tg-hint);text-align:center">Hiển thị ' + Math.min(60, list.length) + '/' + list.length + '</div>';
  };
  T.pages['hr-emps:mount'] = async (p) => {
    document.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => T.go('hr-emps', { type: b.dataset.t, q: (T.$('empQ') || {}).value || '' }); });
    if (T.$('empQ')) T.$('empQ').onchange = () => T.go('hr-emps', { type: (p && p.type) || '', q: T.$('empQ').value });
    document.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => T.go('hr-emp', { id: b.dataset.open }); });
  };
  T.pages['hr-emp'] = async (p) => {
    let e = null, keys = [];
    try { const j = await H('/api/employees'); const arr = Array.isArray(j) ? j : (j.employees || j.data || []); e = arr.find((x) => String(x.id) === String(p.id)); } catch (ex) {}
    if (!e) return T.empty('Không tìm thấy NV');
    try { const j = await H('/api/keys'); const arr = Array.isArray(j) ? j : (j.keys || j.data || []); keys = arr.filter((k) => k.employeeId === e.employeeId); } catch (ex) {}
    return '<div class="tg-card"><h3>' + T.esc(e.name || '') + '</h3><div class="sm" style="font-size:13px">' + T.esc(e.employeeId || '') + ' • 📞 ' + T.esc(e.phone || '') + '<br>' + T.esc(e.branchId || '') + ' • ' + T.shiftVi(e.shift) + ' • Điểm TEST: ' + T.esc(e.testScore != null ? e.testScore : '—') + ' ' + T.statusBadge(e.status) + '</div></div>'
      + '<div class="tg-card"><h3>🔑 Key (' + keys.length + ')</h3>' + (keys.map((k) => '<div class="tg-row"><div class="ic">🔑</div><div class="bd"><div class="tt">' + T.esc(k.key) + '</div><div class="sm">Thiết bị: ' + T.esc(k.deviceId || 'chưa gắn') + '</div></div>' + T.statusBadge(k.status) + (k.status === 'ACTIVE' ? ' <button class="tg-btn sm danger" data-revoke="' + k.id + '">Thu hồi</button>' : '') + '</div>').join('') || T.empty('Chưa có key'))
      + '<button class="tg-btn" data-act="genkey">+ Cấp key mới</button></div>'
      + '<div class="tg-card"><h3>Thao tác</h3><div class="tg-flex">'
      + (e.type === 'TRAINING' ? '<button class="tg-btn ok" data-act="official">→ Chính thức</button>' : '')
      + '<button class="tg-btn ghost" data-act="archive">Archive</button><button class="tg-btn danger" data-act="del">Xóa</button></div></div>';
  };
  T.pages['hr-emp:mount'] = async (p) => {
    document.querySelectorAll('[data-revoke]').forEach((b) => { b.onclick = async () => {
      if (!await T.confirmDlg('Thu hồi key này?')) return;
      try { await H('/api/keys/' + b.dataset.revoke + '/revoke', { method: 'POST' }); T.toast('Đã thu hồi'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
      const act = b.dataset.act;
      try {
        let empId = null;
        try { const j = await H('/api/employees'); const arr = Array.isArray(j) ? j : (j.employees || j.data || []); const e0 = arr.find((x) => String(x.id) === String(p.id)); empId = e0 && e0.employeeId; } catch (ex) {}
        if (act === 'genkey') await H('/api/keys/generate', { method: 'POST', body: { employeeId: empId } });
        if (act === 'official') { if (!await T.confirmDlg('Chuyển sang Chính thức?')) return; await H('/api/employees/' + p.id + '/transition', { method: 'POST' }); }
        if (act === 'archive') { if (!await T.confirmDlg('Archive nhân viên?')) return; await T.call('/api/employees/' + p.id, { method: 'PUT', token: T.S.hr, body: { status: 'ARCHIVED' } }); }
        if (act === 'del') { if (!await T.confirmDlg('XÓA nhân viên (giữ trên Sheet)?')) return; await T.call('/api/employees/' + p.id, { method: 'DELETE', token: T.S.hr }); T.go('hr-emps'); return; }
        T.notifyOk(); T.toast('Xong ✅'); T.refresh();
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    }; });
  };

  // ---------- Lịch ----------
  T.pages['hr-sched'] = async () => {
    const ws = mondayStr(new Date());
    let list = [];
    try { const j = await H('/api/schedules?weekStart=' + ws); list = Array.isArray(j) ? j : (j.schedules || j.data || []); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    return '<div class="tg-card"><h3>📅 Lịch tuần từ ' + T.fmtDMY(ws) + ' (' + list.length + ' ca)</h3>'
      + '<div class="tg-flex"><button class="tg-btn ghost" data-act="coord">🤖 Điều phối AI</button><button class="tg-btn ghost" data-act="draft">+ Nháp tuần sau</button></div>'
      + '<div class="tg-flex" style="margin-top:8px"><button class="tg-btn ok" data-act="approve">Duyệt tuần sau</button><button class="tg-btn danger" data-act="delweek">Xóa tuần</button></div></div>'
      + '<div class="tg-card"><div class="tg-scroll"><table class="tg-table"><tr><th>NV</th><th>Ngày</th><th>Ca</th><th>TT</th><th></th></tr>'
      + (list.slice(0, 80).map((s) => '<tr><td>' + T.esc(s.employeeId || '') + '</td><td>' + T.fmtDMY(s.date) + '</td><td>' + T.esc(s.shift || '') + '</td><td>' + T.esc(s.status || '') + '</td>'
        + '<td><button class="tg-btn sm ghost" data-flip="' + s.id + '">Lật</button></td></tr>').join('') || '<tr><td colspan="5">Chưa có lịch</td></tr>') + '</table></div></div>';
  };
  T.pages['hr-sched:mount'] = async () => {
    const ws = mondayStr(new Date());
    document.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
      const act = b.dataset.act;
      try {
        if (act === 'coord') { T.toast('AI đang điều phối...'); await H('/api/schedules/coordinate', { method: 'POST', body: { weekStart: ws } }); }
        if (act === 'draft') await H('/api/schedules/generate-next-week-draft', { method: 'POST' });
        if (act === 'approve') { if (!await T.confirmDlg('Duyệt lịch tuần sau?')) return; await H('/api/schedules/approve-next-week', { method: 'POST' }); }
        if (act === 'delweek') { if (!await T.confirmDlg('XÓA toàn bộ lịch tuần này?')) return; await H('/api/schedules/delete-week', { method: 'POST', body: { weekStart: ws } }); }
        T.notifyOk(); T.toast('Xong ✅'); T.refresh();
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-flip]').forEach((b) => { b.onclick = async () => {
      try { await H('/api/schedules/manual-flip', { method: 'POST', body: { id: b.dataset.flip } }); T.toast('Đã lật'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
  };

  // ---------- Duyệt (gộp 6 loại) ----------
  const APPR = [
    { k: 'device', label: '📱 Thiết bị', list: '/api/device-requests', act: (id, a) => '/api/device-requests/' + id + '/' + a },
    { k: 'emerg', label: '🆘 Đột xuất', list: '/api/emergency-requests' },
    { k: 'off', label: '🌙 OFF', list: '/api/off-requests' },
    { k: 'train', label: '🔄 Đổi ca TN', list: '/api/training/shift-change', act: (id, a) => '/api/training/shift-change/' + id + '/' + a },
    { k: 'swap', label: '🔀 Đổi ca CT', list: '/api/shift-swap', act: (id, a) => '/api/shift-swap/' + id + '/' + a },
    { k: 'adj', label: '🩹 Điều chỉnh công', list: '/api/attendance/adjustments', act: (id, a) => '/api/attendance/adjustments/' + id + '/' + (a === 'approve' ? 'approve' : 'reject') },
  ];
  T.pages['hr-approve'] = async (p) => {
    const cur = (p && p.k) || 'device';
    const def = APPR.find((a) => a.k === cur) || APPR[0];
    let arr = [];
    try { const j = await H(def.list); arr = Array.isArray(j) ? j : (j.requests || j.data || j.adjustments || []); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    const pend = arr.filter((r) => String(r.status).toUpperCase() === 'PENDING');
    return '<div class="tg-flex">' + APPR.map((a) => '<button class="tg-btn sm' + (a.k === cur ? '' : ' ghost') + '" data-k="' + a.k + '">' + a.label + '</button>').join('') + '</div>'
      + '<div class="tg-sec">' + def.label + ' — chờ duyệt (' + pend.length + '/' + arr.length + ')</div><div class="tg-card">'
      + (arr.slice(0, 40).map((r, i) => '<div class="tg-row"><div class="ic">📩</div><div class="bd"><div class="tt">' + T.esc(r.employeeId || r.requesterId || '') + ' • ' + T.esc(r.date || r.createdAt || r.created_at || '') + '</div><div class="sm">' + T.esc(r.reason || r.content || r.note || '').slice(0, 80) + '</div></div>' + T.statusBadge(r.status)
        + (String(r.status).toUpperCase() === 'PENDING' && def.act ? ' <button class="tg-btn sm ok" data-ok="' + i + '">Duyệt</button> <button class="tg-btn sm danger" data-no="' + i + '">Từ chối</button>' : '') + '</div>').join('') || T.empty('Không có phiếu')) + '</div>';
  };
  T.pages['hr-approve:mount'] = async (p) => {
    const cur = (p && p.k) || 'device';
    const def = APPR.find((a) => a.k === cur);
    document.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => T.go('hr-approve', { k: b.dataset.k }); });
    if (!def || !def.act) return;
    const ids = [];
    try { const j = await H(def.list); const arr = Array.isArray(j) ? j : (j.requests || j.data || j.adjustments || []); arr.slice(0, 40).forEach((r) => ids.push(r.id)); } catch (ex) {}
    document.querySelectorAll('[data-ok]').forEach((b) => { b.onclick = async () => {
      try { await H(def.act(ids[Number(b.dataset.ok)], 'approve'), { method: 'POST' }); T.notifyOk(); T.toast('Đã duyệt ✅'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-no]').forEach((b) => { b.onclick = async () => {
      try { await H(def.act(ids[Number(b.dataset.no)], 'reject'), { method: 'POST' }); T.toast('Đã từ chối'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
  };

  // ---------- Chấm công / Zalo / Báo cáo ----------
  T.pages['hr-attrec'] = async () => {
    const d = T.vnToday();
    let arr = [];
    try { const j = await H('/api/attendances?date=' + d); arr = Array.isArray(j) ? j : (j.attendances || j.data || []); } catch (ex) {}
    return '<div class="tg-sec">Chấm công hôm nay (' + arr.length + ')</div><div class="tg-card"><div class="tg-scroll"><table class="tg-table"><tr><th>NV</th><th>Ca</th><th>Vào</th><th>Ra</th><th>TT</th></tr>'
      + (arr.slice(0, 60).map((a) => '<tr><td>' + T.esc(a.employeeId || '') + '</td><td>' + T.esc(a.shift || '') + '</td><td>' + T.esc(String(a.checkIn || a.checkInAt || '').slice(11, 16)) + '</td><td>' + T.esc(String(a.checkOut || a.checkOutAt || '').slice(11, 16)) + '</td><td>' + T.esc(a.status || '') + '</td></tr>').join('') || '<tr><td colspan="5">Chưa có</td></tr>') + '</table></div></div>';
  };
  T.pages['hr-zalo'] = async () => {
    let arr = [];
    try { const j = await H('/api/zalo-records'); arr = Array.isArray(j) ? j : (j.records || j.data || []); } catch (ex) {}
    return '<div class="tg-card"><h3>💬 Record Zalo</h3><div class="tg-flex"><input id="zPhone" class="tg-inp" placeholder="SĐT test..."><button class="tg-btn" data-act="test" style="max-width:110px">Gửi test</button></div></div>'
      + '<div class="tg-card">' + (arr.slice(0, 30).map((z) => '<div class="tg-row"><div class="ic">✉️</div><div class="bd"><div class="tt">' + T.esc(z.receiver || z.phone || '') + '</div><div class="sm">' + T.esc((z.content || '').slice(0, 80)) + '</div></div>' + T.statusBadge(z.status) + '</div>').join('') || T.empty('Chưa có')) + '</div>';
  };
  T.pages['hr-zalo:mount'] = async () => {
    document.querySelectorAll('[data-act="test"]').forEach((b) => { b.onclick = async () => {
      const phone = (T.$('zPhone') || {}).value || '';
      if (!phone) { T.toast('Nhập SĐT'); return; }
      try { await H('/api/zalo/test', { method: 'POST', body: { phone } }); T.toast('Đã gửi test'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
  };
  T.pages['hr-reports'] = async () => {
    const m = T.vnToday().slice(0, 7);
    let att = null, pay = null;
    try { att = await H('/api/reports/attendance?startDate=' + m + '-01&endDate=' + m + '-28'); } catch (ex) {}
    try { pay = await H('/api/reports/payroll?month=' + m); } catch (ex) {}
    const rows = (att && (att.rows || att.data)) || [];
    const prows = (pay && (pay.rows || pay.data)) || [];
    return '<div class="tg-sec">Báo cáo tháng ' + m + '</div>'
      + '<div class="tg-card"><h3>📊 Chấm công (' + rows.length + ')</h3><div class="tg-scroll"><table class="tg-table"><tr><th>NV</th><th>Ca</th><th>Trễ</th><th>Thiếu C/O</th></tr>'
      + (rows.slice(0, 40).map((r) => '<tr><td>' + T.esc(r.employeeId || r.name || '') + '</td><td>' + T.esc(r.shifts ?? r.totalShifts ?? '') + '</td><td>' + T.esc(r.late ?? '') + '</td><td>' + T.esc(r.missingCheckout ?? '') + '</td></tr>').join('') || '<tr><td colspan="4">Trống</td></tr>') + '</table></div></div>'
      + '<div class="tg-card"><h3>💰 Lương đối soát (' + prows.length + ')</h3><div class="tg-scroll"><table class="tg-table"><tr><th>NV</th><th>Thực nhận</th></tr>'
      + (prows.slice(0, 40).map((r) => '<tr><td>' + T.esc(r.employeeId || r.name || '') + '</td><td>' + T.fmtMoney(r.net ?? r.total ?? 0) + '</td></tr>').join('') || '<tr><td colspan="2">Trống</td></tr>') + '</table></div></div>';
  };

  // ---------- E-learning quản trị ----------
  T.pages['hr-learn'] = async () => {
    let courses = [], results = [], qs = {};
    try { const j = await H('/api/courses'); courses = Array.isArray(j) ? j : (j.courses || j.data || []); } catch (ex) {}
    try { const j = await H('/api/test-results'); results = Array.isArray(j) ? j : (j.results || j.data || []); } catch (ex) {}
    try { qs = await H('/api/quiz/status'); } catch (ex) {}
    return '<div class="tg-card"><div class="tg-row"><div class="ic">📚</div><div class="bd"><div class="tt">Ngân hàng đề</div><div class="sm">' + T.esc(JSON.stringify(qs).slice(0, 100)) + '</div></div><button class="tg-btn sm" data-act="sync">Đồng bộ đề</button></div></div>'
      + '<div class="tg-sec">Kết quả TEST (' + results.length + ')</div><div class="tg-card">'
      + (results.slice(0, 30).map((r) => '<div class="tg-row"><div class="ic">🏆</div><div class="bd"><div class="tt">' + T.esc(r.employeeId || '') + ' • ' + T.esc(r.score != null ? r.score : '') + '</div><div class="sm">' + T.esc(r.createdAt || r.created_at || '') + '</div></div>' + T.statusBadge(r.result || '') + '</div>').join('') || T.empty('Chưa có')) + '</div>';
  };
  T.pages['hr-learn:mount'] = async () => {
    document.querySelectorAll('[data-act="sync"]').forEach((b) => { b.onclick = async () => {
      try { T.toast('Đang đồng bộ...'); await H('/api/quiz/sync', { method: 'POST' }); T.notifyOk(); T.toast('Xong ✅'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
  };

  // ---------- Users / Settings / Audit / Telegram ----------
  T.pages['hr-users'] = async () => {
    let arr = [];
    try { const j = await H('/api/users'); arr = Array.isArray(j) ? j : (j.users || j.data || []); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    return '<div class="tg-card"><h3>🔑 Tài khoản HR (' + arr.length + ')</h3>'
      + arr.map((u) => '<div class="tg-row"><div class="ic">👤</div><div class="bd"><div class="tt">' + T.esc(u.username || '') + ' • ' + T.esc(u.role || '') + '</div><div class="sm">' + T.esc((u.branchScope || []).join(',')) + '</div></div><button class="tg-btn sm danger" data-del="' + u.id + '">Xóa</button></div>').join('')
      + '<label class="tg-lab">Tạo mới: username / password / role</label><div class="tg-flex"><input id="nuU" class="tg-inp" placeholder="username"><input id="nuP" class="tg-inp" placeholder="password"><select id="nuR" class="tg-sel"><option>HR</option><option>Manager</option><option>Umbomilk</option><option>Admin</option></select></div>'
      + '<button class="tg-btn" data-act="add">+ Tạo tài khoản</button></div>';
  };
  T.pages['hr-users:mount'] = async () => {
    document.querySelectorAll('[data-act="add"]').forEach((b) => { b.onclick = async () => {
      try { await H('/api/users', { method: 'POST', body: { username: T.$('nuU').value.trim(), password: T.$('nuP').value, role: T.$('nuR').value } }); T.notifyOk(); T.toast('Đã tạo ✅'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => {
      if (!await T.confirmDlg('Xóa tài khoản này?')) return;
      try { await T.call('/api/users/' + b.dataset.del, { method: 'DELETE', token: T.S.hr }); T.toast('Đã xóa'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
  };
  T.pages['hr-settings'] = async () => {
    let s = {};
    try { const j = await H('/api/settings'); s = j.settings || {}; } catch (ex) {}
    const tg = s.telegram || {};
    return '<div class="tg-card"><h3>✈️ Telegram 3 Bot</h3>'
      + '<div class="sm" style="font-size:13px">HR: @' + T.esc(tg.botUsername || '') + ' ' + (tg.botToken ? '(OK)' : '(CHƯA)') + '<br>NV: @' + T.esc(tg.empBotUsername || '') + ' ' + (tg.empBotToken ? '(OK)' : '(CHƯA)') + '<br>KT: @' + T.esc(tg.finBotUsername || '') + ' ' + (tg.finBotToken ? '(OK)' : '(CHƯA)') + '<br>WebApp: ' + T.esc(tg.webAppUrl || '') + '</div>'
      + '<label class="tg-lab">HR username / Token mới</label><div class="tg-flex"><input id="tgU" class="tg-inp" value="' + T.esc(tg.botUsername || '') + '"><input id="tgT" class="tg-inp" placeholder="Token HR..."></div>'
      + '<label class="tg-lab">NV username / Token mới</label><div class="tg-flex"><input id="tgEU" class="tg-inp" value="' + T.esc(tg.empBotUsername || '') + '"><input id="tgET" class="tg-inp" placeholder="Token NV..."></div>'
      + '<label class="tg-lab">KT username / Token mới</label><div class="tg-flex"><input id="tgFU" class="tg-inp" value="' + T.esc(tg.finBotUsername || '') + '"><input id="tgFT" class="tg-inp" placeholder="Token KT..."></div>'
      + '<label class="tg-lab">WebApp URL gốc</label><input id="tgW" class="tg-inp" value="' + T.esc(tg.webAppUrl || '') + '">'
      + '<button class="tg-btn" data-act="savetg">Lưu Telegram</button></div>'
      + '<div class="tg-card"><h3>🧰 Tiện ích</h3><div class="tg-flex">'
      + '<button class="tg-btn ghost" data-act="vip">VIP OFF</button><button class="tg-btn ghost" data-act="reload">Nạp DB</button></div>'
      + '<button class="tg-btn ghost" style="margin-top:8px" data-act="drvbak">☁️ Backup Drive ngay (tự động 02:00)</button>'
      + '<div class="tg-flex" style="margin-top:8px"><button class="tg-btn ghost" data-act="finkey">+ FIN-KEY</button><button class="tg-btn danger" data-act="logout">Đăng xuất HR</button></div></div>';
  };
  T.pages['hr-settings:mount'] = async () => {
    document.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
      const act = b.dataset.act;
      try {
        if (act === 'savetg') {
          const body = { botUsername: T.$('tgU').value.trim(), empBotUsername: T.$('tgEU').value.trim(), finBotUsername: T.$('tgFU').value.trim(), webAppUrl: T.$('tgW').value.trim() };
          if (T.$('tgT').value.trim()) body.botToken = T.$('tgT').value.trim();
          if (T.$('tgET').value.trim()) body.empBotToken = T.$('tgET').value.trim();
          if (T.$('tgFT').value.trim()) body.finBotToken = T.$('tgFT').value.trim();
          await H('/api/telegram/settings', { method: 'PUT', body }); T.notifyOk(); T.toast('Đã lưu ✅'); T.refresh();
        }
        if (act === 'vip') { await H('/api/admin/off-vip', { method: 'POST' }); T.toast('Đã chuyển VIP'); T.refresh(); }
        if (act === 'reload') { if (!await T.confirmDlg('Nạp lại db.json từ đĩa?')) return; const j = await H('/api/admin/db/reload', { method: 'POST' }); T.notifyOk(); T.toast('Đã nạp: ' + j.employees + ' NV ✅'); }
        if (act === 'drvbak') { const j = await H('/api/admin/drive/backup', { method: 'POST' }); if (j.success) { T.notifyOk(); T.toast('Backup OK: ' + j.name + ' ✅'); } else T.toast(j.reason || 'Chưa cấu hình Drive'); }
        if (act === 'finkey') { await H('/api/finance-keys/generate', { method: 'POST', body: { type: 'PAYROLL' } }); T.notifyOk(); T.toast('Đã tạo FIN-KEY ✅'); }
        if (act === 'logout') { T.store.del('hr_token'); T.store.del('hr_user'); location.reload(); }
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    }; });
  };
  T.pages['hr-audit'] = async () => {
    let arr = [];
    try { const j = await H('/api/audit-logs'); arr = Array.isArray(j) ? j : (j.logs || j.data || []); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    return '<div class="tg-card">' + (arr.slice(0, 40).map((l) => '<div class="tg-row"><div class="ic">📜</div><div class="bd"><div class="tt">' + T.esc(l.actor || '') + ' • ' + T.esc(l.action || '') + '</div><div class="sm">' + T.esc(l.entity || '') + ' • ' + T.esc(l.timestamp || l.at || '') + '</div></div></div>').join('') || T.empty('Chưa có log')) + '</div>';
  };
  T.pages['hr-tg'] = async () => {
    let links = [], bots = [], subs = [], nz = {};
    try { const j = await H('/api/telegram/links'); links = j.links || []; } catch (ex) {}
    try { const j = await T.call('/api/telegram/config'); bots = j.bots || []; } catch (ex) {}
    try { const j = await H('/api/telegram/hr-chats'); subs = j.chats || []; } catch (ex) {}
    try { const j = await H('/api/settings'); nz = (j.settings && j.settings.telegram && j.settings.telegram.notify) || {}; } catch (ex) {}
    const bIcon = { hr: '🛡️', employee: '🧑‍🍳', finance: '💰' };
    return '<div class="tg-card"><h3>🤖 3 Bot Telegram</h3>'
      + bots.map((b) => '<div class="tg-row"><div class="ic">' + (bIcon[b.role] || '🤖') + '</div><div class="bd"><div class="tt">@' + T.esc(b.botUsername || b.role) + '</div><div class="sm">' + T.esc(b.webAppUrl || '') + '</div></div>' + (b.hasToken ? T.badge('Token OK', 'b-ok') : T.badge('Thiếu token', 'b-bad')) + '</div>').join('')
      + '<button class="tg-btn" data-act="setup">⚙️ Gắn webhook + Menu cả 3 Bot</button><div class="sm" id="setupOut" style="font-size:12px;color:var(--tg-hint);margin-top:6px"></div></div>'
      + '<div class="tg-card"><h3>👑 Bot chủ HR nhận tin NV</h3><div class="sm" style="font-size:12px;color:var(--tg-hint)">Ai /start Bot HR thì tự vào danh sách. Tắt loại nào thì Bot chủ không nhận loại đó.</div>'
      + [['checkin', '📍 Check-in'], ['checkout', '🏁 Check-out'], ['off', '🌙 Đăng ký OFF'], ['swap', '🔄 Đổi ca']].map((x) => '<div class="tg-row"><div class="bd"><div class="tt">' + x[1] + '</div></div><button class="tg-btn sm' + (nz[x[0]] === false ? ' ghost' : ' ok') + '" data-nz="' + x[0] + '">' + (nz[x[0]] === false ? 'Tắt' : 'Bật') + '</button></div>').join('') + '</div>'
      + '<div class="tg-card"><h3>👥 Người nhận tin Bot chủ (' + subs.length + ')</h3>'
      + (subs.map((s) => '<div class="tg-row"><div class="ic">👤</div><div class="bd"><div class="tt">@' + T.esc(s.username || s.chatId) + '</div><div class="sm">' + T.esc(s.lastSeen || s.createdAt || '') + '</div></div><button class="tg-btn sm danger" data-unsub="' + T.esc(s.chatId) + '">Xóa</button></div>').join('') || T.empty('Chưa ai /start Bot HR')) + '</div>'
      + '<div class="tg-card"><h3>📣 Broadcast qua Bot Nhân viên (quản lý Bot NV)</h3>'
      + '<div class="tg-flex"><input id="bcBranch" class="tg-inp" placeholder="Chi nhánh (trống = tất cả)"><input id="bcText" class="tg-inp" placeholder="Nội dung..."></div>'
      + '<button class="tg-btn" data-act="bc">Gửi broadcast</button></div>'
      + '<div class="tg-card"><h3>✈️ Liên kết Telegram (' + links.length + ')</h3>'
      + (links.slice(0, 40).map((l) => '<div class="tg-row"><div class="ic">🔗</div><div class="bd"><div class="tt">' + T.esc(l.employeeId || '') + '</div><div class="sm">TG: ' + T.esc(l.telegramId || '') + ' • @' + T.esc(l.username || '') + '</div></div><button class="tg-btn sm ghost" data-msg="' + T.esc(l.employeeId || '') + '">Nhắn</button></div>').join('') || T.empty('Chưa ai liên kết')) + '</div>';
  };
  T.pages['hr-tg:mount'] = async () => {
    document.querySelectorAll('[data-act="setup"]').forEach((b) => { b.onclick = async () => {
      try {
        T.toast('Đang gắn webhook 3 bot...');
        const j = await H('/api/telegram/setup-bots', { method: 'POST' });
        const rows = Object.keys(j.results || {}).map((k) => k + ': ' + (j.results[k].ok ? 'OK ✅' : ('Lỗi: ' + (j.results[k].error || ''))));
        const o = T.$('setupOut'); if (o) o.innerHTML = rows.join('<br>');
        T.notifyOk(); T.toast('Xong — kiểm tra từng bot');
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-act="bc"]').forEach((b) => { b.onclick = async () => {
      const text = (T.$('bcText') || {}).value || '';
      const branchId = ((T.$('bcBranch') || {}).value || '').trim().toUpperCase();
      if (!text.trim()) { T.toast('Nhập nội dung'); return; }
      try {
        const j = await H('/api/telegram/emp-broadcast', { method: 'POST', body: { text, branchId: branchId || undefined } });
        T.notifyOk(); T.toast(j.text ? j.text.replace(/<[^>]+>/g, '') : 'Đã gửi');
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-nz]').forEach((b) => { b.onclick = async () => {
      const k = b.dataset.nz;
      const cur = b.textContent.trim() === 'Bật';
      try { await H('/api/telegram/settings', { method: 'PUT', body: { notify: { [k]: !cur } } }); T.toast(cur ? 'Đã tắt' : 'Đã bật'); T.refresh(); }
      catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-unsub]').forEach((b) => { b.onclick = async () => {
      if (!await T.confirmDlg('Xóa người nhận này khỏi Bot chủ?')) return;
      try { await T.call('/api/telegram/hr-chats/' + encodeURIComponent(b.dataset.unsub), { method: 'DELETE', token: T.S.hr }); T.toast('Đã xóa'); T.refresh(); }
      catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-msg]').forEach((b) => { b.onclick = async () => {
      const text = prompt('Nhắn tới ' + b.dataset.msg + ':');
      if (!text) return;
      try { await H('/api/telegram/send', { method: 'POST', body: { employeeId: b.dataset.msg, text, role: 'employee' } }); T.toast('Đã gửi ✅'); }
      catch (err) { T.toast(err.message); }
    }; });
  };
})();
