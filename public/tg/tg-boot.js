/* TG boot — cổng chọn vai trò + tabs + realtime socket. */
(function () {
  const T = window.TG;

  async function tryTelegramAuth() {
    try {
      const initData = T.WA && T.WA.initData;
      if (!initData) return { linked: false };
      const j = await T.call('/api/telegram/auth', { method: 'POST', body: { initData } });
      if (j.linked && j.token) {
        T.store.set('emp_token', j.token);
        T.store.set('emp_user', j.employee);
        return { linked: true, employee: j.employee };
      }
      return { linked: false, telegramId: j.telegramId, user: j.telegramUser };
    } catch (e) { return { linked: false }; }
  }

  T.pages['hub'] = async () => {
    const hasEmp = !!T.S.emp, hasHr = !!T.S.hr, hasFin = !!T.S.fin;
    let tgUser = '';
    try { const u = T.WA && T.WA.initDataUnsafe && T.WA.initDataUnsafe.user; if (u) tgUser = (u.first_name || '') + (u.username ? ' (@' + u.username + ')' : ''); } catch (e) {}
    return T.heroHTML(tgUser || 'Mini App nhân sự nội bộ')
      + '<div class="tg-sec">Chọn cổng làm việc</div>'
      + '<div class="tg-card">'
      + '<button class="tg-menu" data-role="emp" style="margin-bottom:8px"><span class="mi">🧑‍🍳</span>Nhân viên' + (hasEmp ? ' ✅' : '') + '</button>'
      + '<button class="tg-menu" data-role="hr" style="margin-bottom:8px"><span class="mi">🛡️</span>Quản trị HR' + (hasHr ? ' ✅' : '') + '</button>'
      + '<button class="tg-menu" data-role="fin"><span class="mi">💰</span>Tài chính' + (hasFin ? ' ✅' : '') + '</button></div>'
      + '<div id="linkBox"></div>';
  };
  T.pages['hub:mount'] = async () => {
    document.querySelectorAll('[data-role]').forEach((b) => { b.onclick = () => enterRole(b.dataset.role); });
    if (!T.S.emp) {
      const r = await tryTelegramAuth();
      if (r.linked) { T.toast('Đã liên kết: ' + (r.employee.name || '')); bootTabs(); return; }
      T.$('linkBox').innerHTML = '<div class="tg-card"><h3>🔗 Liên kết Telegram (nhân viên)</h3>'
        + '<label class="tg-lab">Mã NV</label><input id="lkEmp" class="tg-inp" placeholder="CN261_..._NV...">'
        + '<label class="tg-lab">KEY</label><input id="lkKey" class="tg-inp" placeholder="KEY-...">'
        + '<button class="tg-btn" id="btnLink">Liên kết</button></div>';
      T.$('btnLink').onclick = async () => {
        let tid = '';
        try { const u = T.WA && T.WA.initDataUnsafe && T.WA.initDataUnsafe.user; if (u && u.id) tid = String(u.id); } catch (e) {}
        if (!tid) tid = 'web-' + Date.now();
        try {
          const j = await T.call('/api/telegram/link', { method: 'POST', body: { telegramId: tid, employeeId: T.$('lkEmp').value.trim(), key: T.$('lkKey').value.trim() } });
          T.store.set('emp_token', j.token); T.store.set('emp_user', j.employee);
          T.notifyOk(); T.toast('Liên kết thành công ✅'); bootTabs();
        } catch (err) { T.notifyErr(); T.toast(err.message); }
      };
    }
  };

  function empTabs() {
    T._tab = 0;
    T.setTabs([
      { icon: '📍', label: 'Điểm danh', page: 'emp-att' },
      { icon: '🎓', label: 'Khóa học', page: 'emp-learn' },
    ]);
    T.go('emp-att', {}, true);
  }
  function hrTabs() {
    T.setTabs([]);
    T.go('hr-direct', {}, true);
  }
  function finTabs() {
    T.setTabs([]);
    T.go('fin-direct', {}, true);
  }
  T.pages['hr-direct'] = async () => '<div class="tg-card" style="text-align:center;padding:30px 14px"><div style="font-size:48px">🛡️</div><h3>Bot Quản trị Ụm Bò Milk</h3><p style="font-size:13px;color:var(--tg-hint);margin:12px 0;line-height:1.5">Hệ thống Quản trị & HR hiện hoạt động 100% qua tương tác trực tiếp trên khung chat Telegram Bot (<b>@umbomilkhrbot</b>).<br><br>Vui lòng quay lại khung chat và gõ <code>/menu</code> để sử dụng.</p><button class="tg-btn" onclick="if(window.Telegram&&window.Telegram.WebApp&&typeof window.Telegram.WebApp.close===\'function\')window.Telegram.WebApp.close();">Quay lại khung chat Bot</button></div>';
  T.pages['fin-direct'] = async () => '<div class="tg-card" style="text-align:center;padding:30px 14px"><div style="font-size:48px">💰</div><h3>Bot Kế toán Ụm Bò Milk</h3><p style="font-size:13px;color:var(--tg-hint);margin:12px 0;line-height:1.5">Hệ thống Tài chính & Kế toán hiện hoạt động 100% qua tương tác trực tiếp trên khung chat Telegram Bot (<b>@umbomilkketoanbot</b>).<br><br>Vui lòng quay lại khung chat và gõ <code>/luong</code> để sử dụng.</p><button class="tg-btn" onclick="if(window.Telegram&&window.Telegram.WebApp&&typeof window.Telegram.WebApp.close===\'function\')window.Telegram.WebApp.close();">Quay lại khung chat Bot</button></div>';
  T.pages['hr-me'] = async () => {
    const u = T.store.get('hr_user', {});
    return '<div class="tg-card"><div class="tg-row"><div class="ic">🛡️</div><div class="bd"><div class="tt">' + T.esc(u.displayName || u.username || '') + '</div><div class="sm">' + T.esc(u.role || '') + ' • ' + T.esc((u.branchScope || []).join(',')) + '</div></div></div></div>'
      + '<button class="tg-btn ghost" data-go="hr-settings">⚙️ Cài đặt hệ thống</button>'
      + '<button class="tg-btn danger" id="hrOut">Đăng xuất HR</button>';
  };
  T.pages['hr-me:mount'] = async () => {
    document.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => T.go(b.dataset.go); });
    T.$('hrOut').onclick = () => { T.store.del('hr_token'); T.store.del('hr_user'); T.setTabs([]); T.go('hr-login', {}, true); };
  };
  T.pages['fin-more'] = async () => '<div class="tg-grid">'
    + '<button class="tg-menu" data-go="fin-ksk"><span class="mi">🏥</span>Khám SK</button>'
    + '<button class="tg-menu" data-go="fin-daily"><span class="mi">🔍</span>Chi tiết</button>'
    + '<button class="tg-menu" data-go="fin-cf"><span class="mi">💸</span>Dòng tiền</button>'
    + '<button class="tg-menu" data-act="out"><span class="mi">🚪</span>Thoát</button></div>';
  T.pages['fin-more:mount'] = async () => {
    document.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => T.go(b.dataset.go); });
    document.querySelectorAll('[data-act="out"]').forEach((b) => { b.onclick = () => { T.store.del('fin_token'); T.setTabs([]); T.go('fin-login', {}, true); }; });
  };

  // Màn liên kết NV độc lập — Bot NV chỉ thấy màn này, không thấy HR/KT
  T.pages['emp-link'] = async () => {
    let tgName = '';
    try { const u = T.WA && T.WA.initDataUnsafe && T.WA.initDataUnsafe.user; if (u) tgName = (u.first_name || '') + (u.username ? ' (@' + u.username + ')' : ''); } catch (e) {}
    return T.heroHTML((tgName ? tgName + ' • ' : '') + 'Mini App Nhân viên')
      + '<div class="tg-card"><h3>⚡ Đăng nhập & Kích hoạt tự động</h3>'
      + '<p class="tg-sub" style="font-size:13px;color:#64748b;margin-bottom:14px">Nhập Số điện thoại của bạn, hệ thống sẽ tự động tìm Key và đưa bạn vào làm việc ngay:</p>'
      + '<label class="tg-lab">Số điện thoại nhân viên</label>'
      + '<input id="lkEmp" type="tel" class="tg-inp" placeholder="Nhập SĐT (VD: 0905...)" style="font-size:16px;font-weight:600;letter-spacing:0.5px">'
      + '<div id="keyBox" style="margin-top:10px;display:none;background:#f0fdf4;border:1px solid #86efac;padding:10px 14px;border-radius:12px">'
      + '<div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase">🔑 Khóa kích hoạt của bạn:</div>'
      + '<div id="keyVal" style="font-size:16px;font-weight:800;color:#15803d;margin-top:2px;letter-spacing:1px">---</div>'
      + '</div>'
      + '<div id="lkStatus" style="font-size:13px;color:#ec4899;font-weight:600;margin-top:8px;min-height:18px"></div>'
      + '</div>';
  };
  T.pages['emp-link:mount'] = async () => {
    const r = await tryTelegramAuth();
    if (r.linked) { T.toast('Đã liên kết: ' + (r.employee.name || '')); bootTabs(); return; }

    let autoLoggingIn = false;
    async function doLookupAndLogin(phoneVal) {
      if (autoLoggingIn) return;
      const clean = (phoneVal || '').replace(/\D/g, '');
      if (clean.length < 9) return;
      autoLoggingIn = true;
      let tid = '';
      try { const u = T.WA && T.WA.initDataUnsafe && T.WA.initDataUnsafe.user; if (u && u.id) tid = String(u.id); } catch (e) {}
      if (!tid) tid = 'web-' + Date.now();
      const statusEl = T.$('lkStatus');
      const keyBox = T.$('keyBox');
      const keyVal = T.$('keyVal');
      if (statusEl) statusEl.innerHTML = '🔍 Đang kiểm tra hồ sơ nhân viên...';

      try {
        const j = await T.call('/api/telegram/lookup-phone', {
          method: 'POST',
          body: { phone: clean, telegramId: tid }
        });
        if (keyBox) keyBox.style.display = 'block';
        if (keyVal) keyVal.textContent = j.key || 'ĐÃ KÍCH HOẠT';
        if (statusEl) {
          statusEl.style.color = '#15803d';
          statusEl.innerHTML = `✅ Xin chào <b>${T.esc(j.name)}</b>! Đang mở bảng làm việc...`;
        }
        T.store.set('emp_token', j.token);
        T.store.set('emp_user', j.employee);
        T.haptic('success');
        setTimeout(() => {
          T.notifyOk();
          T.toast('Đăng nhập thành công ✅ Chào mừng ' + (j.name || ''));
          bootTabs();
        }, 700);
      } catch (err) {
        autoLoggingIn = false;
        if (statusEl) {
          statusEl.style.color = '#dc2626';
          statusEl.textContent = '⚠️ ' + err.message;
        }
        T.haptic('error');
      }
    }

    const inp = T.$('lkEmp');
    if (inp) {
      inp.focus();
      inp.addEventListener('input', (e) => {
        const c = e.target.value.replace(/\D/g, '');
        if (c.length >= 10) doLookupAndLogin(c);
      });
      inp.addEventListener('change', (e) => doLookupAndLogin(e.target.value));
    }
    if (T.$('btnLink')) T.$('btnLink').onclick = () => doLookupAndLogin(inp ? inp.value : '');
  };

  function enterRole(role) {
    T.haptic('medium');
    if (role === 'emp') {
      if (T.S.emp) empTabs();
      else T.toast('Liên kết Telegram ở khung bên dưới trước');
    }
    if (role === 'hr') {
      if (T.S.hr) hrTabs();
      else T.go('hr-login');
    }
    if (role === 'fin') {
      if (T.S.fin) finTabs();
      else T.go('fin-login');
    }
  }

  function pathRole() {
    try {
      const p = location.pathname;
      if (p.indexOf('/tg-employee') === 0) return 'emp';
      if (p.indexOf('/tg-finance') === 0) return 'fin';
      if (p.indexOf('/tg-hr') === 0) return 'hr';
      const q = new URLSearchParams(location.search).get('role');
      if (q === 'emp' || q === 'hr' || q === 'fin') return q;
    } catch (e) {}
    return null;
  }
  function bootTabs() {
    const pr = pathRole();
    if (pr === 'emp') {
      if (T.S.emp) { empTabs(); return; }
      T.setTabs([]); T.go('emp-link', {}, true); return;
    }
    if (pr === 'hr') {
      hrTabs(); return;
    }
    if (pr === 'fin') {
      finTabs(); return;
    }
    if (T.S.emp) empTabs();
    else { T.setTabs([]); T.go('emp-link', {}, true); }
  }

  // Realtime 1:1 Smart Polling với Google Sheet & Backend (không cần socket)
  let lastSeenVersion = null;
  async function checkVersionPoll() {
    try {
      const res = await fetch('/api/sync/version');
      if (!res.ok) return;
      const data = await res.json();
      if (lastSeenVersion !== null && data.version > lastSeenVersion) {
        // Có dữ liệu mới từ Google Sheet / Server -> làm mới ngầm, KHÔNG làm mới nếu đang nhập liệu
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          if (typeof T.refresh === 'function') T.refresh(true);
        }
      }
      lastSeenVersion = data.version;
    } catch (e) {}
  }

  window.TG_APP = { bootTabs, enterRole };
  document.addEventListener('DOMContentLoaded', () => {
    try { document.getElementById('tgUserLine'); } catch (e) {}
    bootTabs();
    setInterval(checkVersionPoll, 5000);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Khi quay lại màn hình: chỉ check version ngầm, TUYỆT ĐỐI không gọi T.refresh() gây chớp giật
      checkVersionPoll();
    }
  });
})();
