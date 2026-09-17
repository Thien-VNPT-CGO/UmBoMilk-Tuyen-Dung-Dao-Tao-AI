/* TG Finance — kế toán native: đủ 16 endpoint finance. */
(function () {
  const T = window.TG;
  const F = T.finApi;

  T.pages['fin-login'] = async () => '<div class="tg-card"><h3>💰 Đăng nhập Tài chính</h3>'
    + '<div class="tg-flex"><button class="tg-btn sm" data-m="payroll">Bảng lương</button><button class="tg-btn sm ghost" data-m="cashflow">Dòng tiền</button></div>'
    + '<div id="finCashEmail" style="display:none"><label class="tg-lab">Email (cashflow)</label><input id="finEmail" class="tg-inp" placeholder="email..."></div>'
    + '<label class="tg-lab">Khóa (FIN-KEY)</label><input id="finKey" class="tg-inp" placeholder="FIN-...">'
    + '<button class="tg-btn" id="btnFinLogin">Đăng nhập</button></div>';
  let finMode = 'payroll';
  T.pages['fin-login:mount'] = async () => {
    document.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => {
      finMode = b.dataset.m;
      T.$('finCashEmail').style.display = finMode === 'cashflow' ? 'block' : 'none';
      document.querySelectorAll('[data-m]').forEach((x) => x.classList.add('ghost'));
      b.classList.remove('ghost');
    }; });
    T.$('btnFinLogin').onclick = async () => {
      try {
        const body = finMode === 'cashflow'
          ? { email: T.$('finEmail').value.trim(), key: T.$('finKey').value.trim() }
          : { key: T.$('finKey').value.trim() };
        const j = await T.call(finMode === 'cashflow' ? '/api/auth/cashflow-login' : '/api/auth/finance-login', { method: 'POST', body });
        T.store.set('fin_token', j.token); T.store.set('fin_mode', finMode);
        T.notifyOk(); T.toast('Đăng nhập kế toán ✅');
        window.TG_APP.bootTabs();
      } catch (err) { T.notifyErr(); T.toast(err.message); }
    };
  };

  T.pages['fin-home'] = async () => {
    const m = T.vnToday().slice(0, 7);
    let mx = null;
    try { mx = await F('/api/finance/reports/matrix?month=' + m); } catch (ex) {}
    const rows = (mx && (mx.rows || mx.data)) || [];
    return '<div class="tg-sec">Ma trận công ' + m + ' (' + rows.length + ' NV)</div>'
      + '<div class="tg-card"><div class="tg-scroll"><table class="tg-table"><tr><th>NV</th><th>Công</th><th>Trễ</th><th>Lỗi</th></tr>'
      + (rows.slice(0, 50).map((r) => '<tr><td>' + T.esc(r.employeeId || r.name || '') + '</td><td>' + T.esc(r.workDays ?? r.total ?? '') + '</td><td>' + T.esc(r.late ?? '') + '</td><td>' + T.esc(r.errors ?? r.issues ?? '') + '</td></tr>').join('') || '<tr><td colspan="4">Trống</td></tr>') + '</table></div></div>'
      + '<div class="tg-sec">Chức năng</div><div class="tg-grid">'
      + '<button class="tg-menu" data-go="fin-pay"><span class="mi">💵</span>Lương</button>'
      + '<button class="tg-menu" data-go="fin-dp"><span class="mi">👕</span>Đồng phục</button>'
      + '<button class="tg-menu" data-go="fin-ksk"><span class="mi">🏥</span>Khám SK</button>'
      + '<button class="tg-menu" data-go="fin-daily"><span class="mi">🔍</span>Chi tiết</button></div>'
      + (T.store.get('fin_mode', 'payroll') === 'cashflow' ? '<div class="tg-sec">Dòng tiền</div><div class="tg-grid"><button class="tg-menu" data-go="fin-cf"><span class="mi">💸</span>Quỹ</button><button class="tg-menu" data-act="logout"><span class="mi">🚪</span>Thoát</button></div>' : '<button class="tg-btn ghost" data-act="logout">Đăng xuất kế toán</button>');
  };
  T.pages['fin-home:mount'] = async () => {
    document.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => T.go(b.dataset.go); });
    document.querySelectorAll('[data-act="logout"]').forEach((b) => { b.onclick = () => { T.store.del('fin_token'); location.reload(); }; });
  };

  T.pages['fin-pay'] = async () => {
    const m = T.vnToday().slice(0, 7);
    let j = null;
    try { j = await F('/api/finance/reports/payroll-summary?month=' + m); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    const rows = j.rows || j.data || [];
    return '<div class="tg-card"><h3>💵 Bảng lương ' + m + ' (' + rows.length + ')</h3><div class="tg-scroll"><table class="tg-table"><tr><th>NV</th><th>Ca</th><th>Phạt</th><th>Thực nhận</th></tr>'
      + (rows.map((r) => '<tr><td>' + T.esc(r.employeeId || r.name || '') + '</td><td>' + T.esc(r.shifts ?? '') + '</td><td>' + T.fmtMoney(r.penalty ?? 0) + '</td><td><b>' + T.fmtMoney(r.net ?? r.total ?? 0) + '</b></td></tr>').join('') || '<tr><td colspan="4">Trống</td></tr>') + '</table></div></div>';
  };

  function kvForm(fields, prefix) {
    return fields.map((f) => '<label class="tg-lab">' + f[1] + '</label><input id="' + prefix + f[0] + '" class="tg-inp" value="' + T.esc(f[2] || '') + '">').join('');
  }
  T.pages['fin-dp'] = async () => {
    let rows = [];
    try { const j = await F('/api/finance/reports/dong-phuc'); rows = j.rows || j.data || []; } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    return '<div class="tg-card"><h3>👕 Hoàn cọc đồng phục (' + rows.length + ')</h3>'
      + rows.slice(0, 30).map((r, i) => '<div class="tg-row"><div class="ic">👕</div><div class="bd"><div class="tt">' + T.esc(r.bhCode || r.employeeId || '') + ' • ' + T.esc(r.hoTen || r.name || '') + '</div><div class="sm">Hoàn: ' + T.fmtMoney(r.tienHoan ?? r.soTien ?? 0) + '</div></div><button class="tg-btn sm ghost" data-ed="' + i + '">Sửa</button></div>').join('')
      + '<div id="dpEdit"></div></div>';
  };
  T.pages['fin-dp:mount'] = async () => {
    let rows = [];
    try { const j = await F('/api/finance/reports/dong-phuc'); rows = j.rows || j.data || []; } catch (ex) { return; }
    document.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => {
      const r = rows[Number(b.dataset.ed)];
      T.$('dpEdit').innerHTML = '<div class="tg-sec">Sửa ' + T.esc(r.bhCode || '') + '</div>'
        + kvForm([['soTien', 'Số tiền'], ['tienHoan', 'Tiền hoàn'], ['kiHoan', 'Kì hoàn'], ['ghiChu', 'Ghi chú']], 'dp')
        + '<button class="tg-btn" id="dpSave">Lưu</button>';
      ['soTien', 'tienHoan', 'kiHoan', 'ghiChu'].forEach((k) => { if (T.$('dp' + k)) T.$('dp' + k).value = r[k] != null ? r[k] : ''; });
      T.$('dpSave').onclick = async () => {
        try {
          await F('/api/finance/reports/dong-phuc', { method: 'POST', body: { bhCode: r.bhCode, soTien: Number(T.$('dpsoTien').value) || 0, tienHoan: Number(T.$('dptienHoan').value) || 0, kiHoan: T.$('dpkiHoan').value, ghiChu: T.$('dpghiChu').value } });
          T.notifyOk(); T.toast('Đã lưu ✅'); T.refresh();
        } catch (err) { T.toast(err.message); }
      };
    }; });
  };

  T.pages['fin-ksk'] = async () => {
    let rows = [];
    try { const j = await F('/api/finance/reports/kham-suc-khoe'); rows = j.rows || j.data || []; } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    return '<div class="tg-card"><h3>🏥 Hoàn tiền khám SK (' + rows.length + ')</h3>'
      + rows.slice(0, 30).map((r, i) => '<div class="tg-row"><div class="ic">🏥</div><div class="bd"><div class="tt">' + T.esc(r.bhCode || '') + ' • ' + T.esc(r.hoTen || '') + '</div><div class="sm">' + T.fmtMoney(r.tienKham ?? 0) + ' • ' + T.esc(r.tinhTrangHoan || '') + '</div></div><button class="tg-btn sm ghost" data-ed="' + i + '">Sửa</button></div>').join('')
      + '<div id="kskEdit"></div></div>';
  };
  T.pages['fin-ksk:mount'] = async () => {
    let rows = [];
    try { const j = await F('/api/finance/reports/kham-suc-khoe'); rows = j.rows || j.data || []; } catch (ex) { return; }
    document.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => {
      const r = rows[Number(b.dataset.ed)];
      T.$('kskEdit').innerHTML = '<div class="tg-sec">Sửa ' + T.esc(r.bhCode || '') + '</div>'
        + kvForm([['tienKham', 'Tiền khám'], ['mucDuyet', 'Mức duyệt'], ['tinhTrangHoan', 'Tình trạng hoàn'], ['ghiChu', 'Ghi chú']], 'kk')
        + '<button class="tg-btn" id="kkSave">Lưu</button>';
      ['tienKham', 'mucDuyet', 'tinhTrangHoan', 'ghiChu'].forEach((k) => { if (T.$('kk' + k)) T.$('kk' + k).value = r[k] != null ? r[k] : ''; });
      T.$('kkSave').onclick = async () => {
        try {
          await F('/api/finance/reports/kham-suc-khoe', { method: 'POST', body: { bhCode: r.bhCode, tienKham: Number(T.$('kktienKham').value) || 0, mucDuyet: T.$('kkmucDuyet').value, tinhTrangHoan: T.$('kktinhTrangHoan').value, ghiChu: T.$('kkghiChu').value } });
          T.notifyOk(); T.toast('Đã lưu ✅'); T.refresh();
        } catch (err) { T.toast(err.message); }
      };
    }; });
  };

  T.pages['fin-daily'] = async () => {
    const m = T.vnToday().slice(0, 7);
    let emps = [];
    try { const j = await F('/api/finance/reports/monthly?month=' + m); emps = j.employees || j.rows || j.data || []; } catch (ex) {}
    return '<div class="tg-card"><h3>🔍 Chi tiết ngày công</h3><label class="tg-lab">Mã NV</label><input id="dEmp" class="tg-inp" list="dEmpList" placeholder="Nhập mã NV...">'
      + '<datalist id="dEmpList">' + emps.slice(0, 200).map((e) => '<option value="' + T.esc(typeof e === 'string' ? e : (e.employeeId || e.bhCode)) + '">').join('') + '</datalist>'
      + '<button class="tg-btn" id="dGo">Xem</button><div id="dOut"></div></div>';
  };
  T.pages['fin-daily:mount'] = async () => {
    const m = T.vnToday().slice(0, 7);
    T.$('dGo').onclick = async () => {
      const id = T.$('dEmp').value.trim();
      if (!id) return;
      try {
        const j = await F('/api/finance/reports/daily?employeeId=' + encodeURIComponent(id) + '&month=' + m);
        const rows = j.rows || j.days || j.data || [];
        T.$('dOut').innerHTML = '<div class="tg-scroll"><table class="tg-table" style="margin-top:8px"><tr><th>Ngày</th><th>Ca</th><th>Vào</th><th>Ra</th></tr>'
          + (rows.map((r) => '<tr><td>' + T.fmtDMY(r.date) + '</td><td>' + T.esc(r.shift || '') + '</td><td>' + T.esc(String(r.checkIn || '').slice(11, 16)) + '</td><td>' + T.esc(String(r.checkOut || '').slice(11, 16)) + '</td></tr>').join('') || '<tr><td colspan="4">Trống</td></tr>') + '</table></div>';
      } catch (err) { T.toast(err.message); }
    };
  };

  // ---------- Cashflow ----------
  T.pages['fin-cf'] = async () => {
    let d = {};
    try { d = await F('/api/cashflow/dashboard'); } catch (ex) { return '<div class="tg-card">⚠️ ' + T.esc(ex.message) + '</div>'; }
    const accs = d.accounts || [];
    const exps = d.expenses || [];
    const bills = d.bills || [];
    return '<div class="tg-card"><h3>💸 Quỹ (tổng: ' + T.fmtMoney(d.masterBalance ?? d.total ?? 0) + ')</h3>'
      + accs.map((a, i) => '<div class="tg-row"><div class="ic">🏦</div><div class="bd"><div class="tt">' + T.esc(a.name || a.id) + '</div><div class="sm">' + T.fmtMoney(a.balance ?? 0) + '</div></div><button class="tg-btn sm ghost" data-col="' + i + '">Gom</button></div>').join('')
      + '<label class="tg-lab">Tạo phiếu chi: số tiền / người nhận / nội dung / ngày</label>'
      + '<div class="tg-flex"><input id="cfAmt" class="tg-inp" placeholder="Số tiền"><input id="cfDate" type="date" class="tg-inp" value="' + T.vnToday() + '"></div>'
      + '<input id="cfRec" class="tg-inp" placeholder="Người nhận"><input id="cfTxt" class="tg-inp" placeholder="Nội dung chi">'
      + '<button class="tg-btn" data-act="mkexp">+ Tạo phiếu chi</button>'
      + '<label class="tg-lab">Bill định kỳ: tên / số tiền / hạn</label>'
      + '<div class="tg-flex"><input id="cfBill" class="tg-inp" placeholder="Tên bill"><input id="cfBillAmt" class="tg-inp" placeholder="Số tiền"><input id="cfDue" type="date" class="tg-inp"></div>'
      + '<button class="tg-btn ghost" data-act="mkbill">+ Tạo bill</button></div>'
      + '<div class="tg-sec">Phiếu chi chờ duyệt (' + exps.length + ')</div><div class="tg-card">'
      + (exps.map((x) => '<div class="tg-row"><div class="ic">🧾</div><div class="bd"><div class="tt">' + T.fmtMoney(x.amount ?? 0) + ' • ' + T.esc(x.recipient || '') + '</div><div class="sm">' + T.esc(x.content || '') + '</div></div>' + T.statusBadge(x.status) + (String(x.status).toUpperCase() === 'PENDING' && x.id ? ' <button class="tg-btn sm ok" data-ap="' + x.id + '">Duyệt</button>' : '') + '</div>').join('') || T.empty('Không có')) + '</div>'
      + '<div class="tg-sec">Bill định kỳ</div><div class="tg-card">'
      + (bills.map((x) => '<div class="tg-row"><div class="ic">📅</div><div class="bd"><div class="tt">' + T.esc(x.name || '') + ' • ' + T.fmtMoney(x.amount ?? 0) + '</div><div class="sm">Hạn: ' + T.fmtDMY(x.nextDue) + '</div></div></div>').join('') || T.empty('Không có')) + '</div>';
  };
  T.pages['fin-cf:mount'] = async () => {
    let accs = [];
    try { const d = await F('/api/cashflow/dashboard'); accs = d.accounts || []; } catch (ex) {}
    document.querySelectorAll('[data-col]').forEach((b) => { b.onclick = async () => {
      const a = accs[Number(b.dataset.col)];
      const amt = prompt('Gom bao nhiêu về tổng?', a.balance || '');
      if (!amt) return;
      try { await F('/api/cashflow/collect', { method: 'POST', body: { accountId: a.id, amount: Number(amt) } }); T.notifyOk(); T.toast('Đã gom ✅'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-ap]').forEach((b) => { b.onclick = async () => {
      try { await F('/api/cashflow/expenses/' + b.dataset.ap + '/approve', { method: 'POST' }); T.notifyOk(); T.toast('Đã duyệt ✅'); T.refresh(); } catch (err) { T.toast(err.message); }
    }; });
    document.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
      try {
        if (b.dataset.act === 'mkexp') await F('/api/cashflow/expenses', { method: 'POST', body: { amount: Number(T.$('cfAmt').value) || 0, recipient: T.$('cfRec').value, content: T.$('cfTxt').value, date: T.$('cfDate').value } });
        if (b.dataset.act === 'mkbill') await F('/api/cashflow/bills', { method: 'POST', body: { name: T.$('cfBill').value, amount: Number(T.$('cfBillAmt').value) || 0, nextDue: T.$('cfDue').value } });
        T.notifyOk(); T.toast('Đã tạo ✅'); T.refresh();
      } catch (err) { T.toast(err.message); }
    }; });
  };
})();
