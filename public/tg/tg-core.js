/* TG core — Telegram SDK, theme, API client, auth, router. Không hard-code nghiệp vụ. */
(function () {
  const WA = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const $ = (id) => document.getElementById(id);
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('umb_tg_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('umb_tg_' + k, JSON.stringify(v)); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem('umb_tg_' + k); } catch (e) {} },
  };

  function applyTheme() {
    try {
      if (WA) {
        WA.ready(); WA.expand();
        try { WA.disableVerticalSwipes(); } catch (e) {}
        try { WA.setHeaderColor('bg_color'); WA.setBackgroundColor('bg_color'); } catch (e) {}
        const p = WA.themeParams || {};
        const root = document.documentElement.style;
        const map = { bg_color: '--tg-bg', text_color: '--tg-text', hint_color: '--tg-hint', link_color: '--tg-link', button_color: '--tg-btn', button_text_color: '--tg-btn-text', secondary_bg_color: '--tg-secondary', header_bg_color: '--tg-header' };
        Object.keys(map).forEach((k) => { if (p[k]) root.setProperty(map[k], p[k]); });
        if (WA.colorScheme === 'dark') {
          root.setProperty('--card', p.secondary_bg_color || '#1c1c1e');
          root.setProperty('--line', '#2c2c2e');
        }
      }
    } catch (e) {}
  }

  function haptic(kind) { try { WA && WA.HapticFeedback && WA.HapticFeedback.impactOccurred(kind || 'light'); } catch (e) {} }
  function notifyOk() { try { WA && WA.HapticFeedback && WA.HapticFeedback.notificationOccurred('success'); } catch (e) {} }
  function notifyErr() { try { WA && WA.HapticFeedback && WA.HapticFeedback.notificationOccurred('error'); } catch (e) {} }

  let toastTimer = null;
  function toast(msg, ms) {
    haptic('light');
    let t = document.querySelector('.tg-toast');
    if (!t) { t = document.createElement('div'); t.className = 'tg-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.remove('ok', 'err', 'show');
    const m = String(msg || '');
    if (/^(✅|Đã|Xong|Lưu|Liên kết|Gửi thành|Đăng nhập|Nạp|Backup)/.test(m)) { t.classList.add('ok'); notifyOk(); }
    else if (/^(⚠️|❌|Lỗi|Không|Thiếu|Sai)/.test(m)) { t.classList.add('err'); notifyErr(); }
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); }, ms || 2200);
  }
  // Ripple khi chạm nút + tab (hiệu ứng click hiện đại)
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target && ev.target.closest ? ev.target.closest('.tg-btn,.tg-menu,.tg-tab') : null;
    if (!el) return;
    try {
      const r = el.getBoundingClientRect();
      const s = document.createElement('span');
      s.className = 'ripple';
      const d = Math.max(r.width, r.height);
      s.style.width = s.style.height = d + 'px';
      s.style.left = (ev.clientX - r.left - d / 2) + 'px';
      s.style.top = (ev.clientY - r.top - d / 2) + 'px';
      el.appendChild(s);
      setTimeout(() => { try { s.remove(); } catch (e) {} }, 550);
    } catch (e) {}
  }, { passive: true });
  function confirmDlg(msg) {
    return new Promise((resolve) => {
      try {
        if (WA && WA.showConfirm) { WA.showConfirm(msg, resolve); return; }
      } catch (e) {}
      resolve(window.confirm(msg));
    });
  }
  function mainBtn(text, onTap, color) {
    try {
      if (!WA || !WA.MainButton) return;
      WA.MainButton.setText(text);
      if (color) { try { WA.MainButton.setParams({ color }); } catch (e) {} }
      WA.MainButton.onClick(onTap);
      WA.MainButton.show();
    } catch (e) {}
  }
  function hideMainBtn() { try { WA && WA.MainButton && WA.MainButton.hide(); } catch (e) {} }

  // ---- API client (giờ VN, token theo vai trò) ----
  async function call(path, opts) {
    opts = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    const r = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const ct = r.headers.get('content-type') || '';
    if (opts.blob) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }
    const j = ct.includes('json') ? await r.json().catch(() => ({})) : { raw: await r.text() };
    if (!r.ok) {
      const err = new Error((j && j.error) || ('HTTP ' + r.status));
      err.status = r.status; err.data = j;
      throw err;
    }
    return j;
  }
  const S = {
    get emp() { return store.get('emp_token', null); },
    get hr() { return store.get('hr_token', null); },
    get fin() { return store.get('fin_token', null); },
    get empUser() { return store.get('emp_user', null); },
    get hrUser() { return store.get('hr_user', null); },
  };
  const empApi = (p, o) => call(p, Object.assign({}, o, { token: S.emp }));
  const hrApi = (p, o) => call(p, Object.assign({}, o, { token: S.hr }));
  const finApi = (p, o) => call(p, Object.assign({}, o, { token: S.fin }));

  // ---- helpers giờ VN / định dạng ----
  function vnToday() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }
  function fmtDMY(d) {
    if (!d) return '—';
    const s = String(d).split('T')[0].split('-');
    return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : String(d);
  }
  function fmtMoney(n) { return (Number(n) || 0).toLocaleString('vi-VN') + 'đ'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function badge(text, cls) { return '<span class="tg-badge ' + (cls || 'b-mut') + '">' + esc(text) + '</span>'; }
  function statusBadge(st) {
    const s = String(st || '').toUpperCase();
    if (['APPROVED', 'DAT', 'ĐẠT', 'COMPLETED', 'CHECKED_OUT', 'SENT', 'DELIVERED', 'SYNCED', 'OFFICIAL', 'WORKING'].includes(s)) return badge(st, 'b-ok');
    if (['PENDING', 'CHỜ', 'WAITING', 'QUEUED', 'TRAINING', 'RETEST', 'THI LẠI'].includes(s)) return badge(st, 'b-warn');
    if (['REJECTED', 'FAILED', 'LOẠI', 'ARCHIVED', 'TERMINATED', 'RESIGNED', 'ABSENT'].includes(s)) return badge(st, 'b-bad');
    return badge(st, 'b-info');
  }
  function shiftVi(s) {
    return { CA_SANG: 'Sáng (7-12h)', CA_CHIEU: 'Chiều (12-18h)', CA_TRUA: 'Trưa (12-18h)', CA_TOI: 'Tối (18-23h)' }[s] || s || '—';
  }
  function loading(msg) { return '<div class="tg-load">⏳ ' + esc(msg || 'Đang tải...') + '</div>'; }
  function empty(msg) { return '<div class="tg-empty">' + esc(msg || 'Chưa có dữ liệu') + '</div>'; }

  // ---- router: tabs theo vai trò + stack trang con ----
  const pages = {};
  const stack = [];
  let tabs = [];
  function setTabs(list) {
    tabs = list;
    renderTabs();
  }
  function renderTabs() {
    const bar = $('tgTabs');
    if (!bar) return;
    bar.innerHTML = tabs.map((t, i) => '<button class="tg-tab' + (TG._tab === i ? ' on' : '') + '" data-i="' + i + '"><span class="ti">' + t.icon + '</span>' + esc(t.label) + (t.dot ? '<span class="tg-dot" style="position:absolute;margin:-14px 0 0 26px">' + t.dot + '</span>' : '') + '</button>').join('');
    bar.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { haptic('light'); TG._tab = Number(b.dataset.i); stack.length = 0; renderTabs(); go(tabs[TG._tab].page, tabs[TG._tab].params, true); };
    });
  }
  function renderBack() {
    try {
      if (!WA || !WA.BackButton) return;
      if (stack.length > 1) { WA.BackButton.show(); WA.BackButton.onClick(back); }
      else WA.BackButton.hide();
    } catch (e) {}
  }
  async function go(name, params, replace) {
    hideMainBtn();
    if (!replace) stack.push({ name, params: params || {} });
    else { stack.length = 0; stack.push({ name, params: params || {} }); }
    renderBack();
    const el = $('tgPage');
    el.innerHTML = loading();
    try {
      const fn = pages[name];
      if (!fn) { el.innerHTML = empty('Không tìm thấy trang'); return; }
      el.innerHTML = await fn(params || {});
      if (pages[name + ':mount']) { try { await pages[name + ':mount'](params || {}); } catch (e) { console.error(e); } }
    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="tg-card">⚠️ ' + esc(e.message || 'Lỗi tải trang') + '<button class="tg-btn ghost" onclick="TG.back()">Quay lại</button></div>';
    }
    try { el.classList.remove('page-enter'); void el.offsetWidth; el.classList.add('page-enter'); } catch (e) {}
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function back() {
    hideMainBtn();
    if (stack.length > 1) { stack.pop(); const cur = stack[stack.length - 1]; stack.pop(); go(cur.name, cur.params); }
  }
  function refresh() { const cur = stack[stack.length - 1]; if (cur) { stack.pop(); go(cur.name, cur.params); } }

  // ---- GPS ----
  function getGPS() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  window.TG = {
    WA, $, store, S, call, empApi, hrApi, finApi,
    toast, confirmDlg, mainBtn, hideMainBtn, haptic, notifyOk, notifyErr,
    vnToday, fmtDMY, fmtMoney, esc, badge, statusBadge, shiftVi, loading, empty,
    pages, go, back, refresh, setTabs, renderTabs, getGPS, applyTheme,
    _tab: 0,
  };
  document.addEventListener('DOMContentLoaded', applyTheme);
})();
