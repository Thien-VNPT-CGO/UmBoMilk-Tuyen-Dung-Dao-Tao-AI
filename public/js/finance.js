// === VIETNAM TIMEZONE REALTIME - Asia/Ho_Chi_Minh UTC+7 ===
function getVietnamTodayStr(){ return new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'}); }
function getVietnamNow(){ return new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Ho_Chi_Minh'})); }

let financeToken = localStorage.getItem('finance_token');
let financeKey = JSON.parse(localStorage.getItem('finance_key')||'null');
let financeExpires = localStorage.getItem('finance_expires');
let currentTab = 'matrix';

// Cache dữ liệu để tìm kiếm nhanh
let matrixCache = null;
let dongphucCache = [];
let khamskCache = [];
let payrollCache = [];

function fmtMoney(n){
  if(n==null || n==='') return '—';
  const num = Number(n);
  if(isNaN(num)) return n;
  return num.toLocaleString('vi-VN');
}

function fmtDMY(d){
  if(!d) return '—';
  const p = String(d).split('T')[0].split('-');
  if(p.length===3) return `${p[2]}/${p[1]}/${p[0]}`;
  return d;
}

function viType(t){
  const m = { WEEK:'Tuần', MONTH:'Tháng', YEAR:'Năm' };
  return m[t] || t || '—';
}

async function api(path, opts={}){
  const headers = { 'Content-Type': 'application/json' };
  if(financeToken) headers['Authorization'] = 'Bearer ' + financeToken;
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers||{}) } });
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    if(data.needLogin || data.expired || res.status===401){
      logout(true);
      throw new Error(data.error || 'Phiên làm việc hết hạn - vui lòng đăng nhập lại');
    }
    throw new Error(data.error || 'Đã xảy ra lỗi kết nối');
  }
  return data;
}

// Đăng nhập
document.getElementById('loginForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const key = document.getElementById('financeKey').value.trim();
  const err = document.getElementById('loginError');
  const info = document.getElementById('keyInfo');
  try{
    const res = await fetch('/api/auth/finance-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Khóa tài chính không hợp lệ');

    financeToken = data.token;
    financeKey = data.key;
    financeExpires = data.expiresAt;
    localStorage.setItem('finance_token', financeToken);
    localStorage.setItem('finance_key', JSON.stringify(financeKey));
    localStorage.setItem('finance_expires', financeExpires);

    err.classList.add('hidden');
    info.classList.remove('hidden');
    info.innerHTML = `<i class="fa-solid fa-circle-check mr-1.5"></i> Đăng nhập thành công • Hết hạn: ${new Date(financeExpires).toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}`;
    setTimeout(showApp, 400);
  }catch(err2){
    err.textContent = err2.message;
    err.classList.remove('hidden');
  }
});

function showApp(){
  if(!financeToken || !financeKey || !financeExpires){
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    return;
  }
  if(new Date(financeExpires).getTime() <= Date.now()){
    logout(true);
    return;
  }
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('keyLabel').textContent = `${financeKey.key} • ${viType(financeKey.type)}`;
  document.getElementById('keyExpiry').textContent = new Date(financeExpires).toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});
  
  if(!document.getElementById('reportMonth').value){
    document.getElementById('reportMonth').value = getVietnamTodayStr().slice(0,7);
  }
  startCountdown();
  switchTab('matrix');
  loadEmployeesForDaily();
}

function logout(isExpired){
  localStorage.removeItem('finance_token');
  localStorage.removeItem('finance_key');
  localStorage.removeItem('finance_expires');
  financeToken = null; financeKey = null; financeExpires = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginOverlay').classList.remove('hidden');
  if(isExpired){
    const err = document.getElementById('loginError');
    if(err){
      err.textContent = 'Khóa Tài chính đã hết hạn - vui lòng liên hệ Admin để cấp Key mới';
      err.classList.remove('hidden');
    }
  }
  if(window._countdown) clearInterval(window._countdown);
}

function startCountdown(){
  const el = document.getElementById('countdown');
  if(!el) return;
  el.classList.remove('hidden');
  function tick(){
    const diff = new Date(financeExpires).getTime() - Date.now();
    if(diff <= 0){
      el.textContent = 'ĐÃ HẾT HẠN';
      el.className = 'text-xs font-black bg-red-500 text-white px-3 py-1 rounded-full';
      logout(true);
      return;
    }
    const d = Math.floor(diff/86400000);
    const h = Math.floor((diff%86400000)/3600000);
    const m = Math.floor((diff%3600000)/60000);
    el.textContent = `Còn ${d>0?d+' ngày ':''}${h}h ${m}m`;
    if(diff < 86400000) el.className = 'text-xs font-black bg-amber-500 text-white px-3 py-1 rounded-full animate-pulse';
    else el.className = 'text-xs font-black bg-emerald-500 text-white px-3 py-1 rounded-full';
  }
  tick();
  if(window._countdown) clearInterval(window._countdown);
  window._countdown = setInterval(tick, 60000);
}

function switchTab(id){
  currentTab = id;
  document.querySelectorAll('.tab-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('tab-' + id)?.classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    b.classList.remove('bg-slate-900', 'text-white');
  });
  const activeBtn = document.getElementById('tabBtn-' + id);
  if(activeBtn){
    activeBtn.classList.add('active');
  }

  if(id === 'matrix') loadMatrix();
  else if(id === 'dongphuc') loadDongPhuc();
  else if(id === 'khamsk') loadKhamSK();
  else if(id === 'payroll') loadPayrollSummary();
  else if(id === 'daily') loadDaily();
  else if(id === 'anomalies') loadAnomalies();
}

async function loadAll(){
  if(currentTab === 'matrix') await loadMatrix();
  else if(currentTab === 'dongphuc') await loadDongPhuc();
  else if(currentTab === 'khamsk') await loadKhamSK();
  else if(currentTab === 'payroll') await loadPayrollSummary();
  else if(currentTab === 'daily') await loadDaily();
  else if(currentTab === 'anomalies') await loadAnomalies();
}

// =========================================================================
// TAB 1: BẢNG CHẤM CÔNG THÁNG (MA TRẬN 1 - 31 NGÀY THEO ẢNH 1)
// =========================================================================
async function loadMatrix(){
  const month = document.getElementById('reportMonth').value || getVietnamTodayStr().slice(0,7);
  const branch = document.getElementById('reportBranch').value || '';
  try{
    const data = await api(`/api/finance/reports/matrix?month=${month}&branch=${branch}`);
    matrixCache = data;
    renderMatrix(data);
  }catch(e){
    console.error('loadMatrix error', e);
  }
}

function renderMatrix(data){
  if(!data) return;
  const { daysInMonth, title, rows, summary } = data;
  document.getElementById('matrixHeaderTitle').textContent = title;

  // Render thead
  const theadRow = document.getElementById('matrixTheadRow');
  let theadHtml = `
    <th class="p-2 text-center sticky-col-1 bg-amber-300 min-w-[110px]">Chi nhánh</th>
    <th class="p-2 text-center sticky-col-2 bg-amber-300 min-w-[65px]">Mã</th>
    <th class="p-2 text-center sticky-col-3 bg-amber-300 min-w-[55px]">CN</th>
    <th class="p-2 text-left sticky-col-4 bg-amber-300 min-w-[170px]">Tên nhân viên</th>
    <th class="p-2 text-center bg-amber-300 min-w-[70px]">Lương<br>học việc</th>
    <th class="p-2 text-center bg-amber-300 min-w-[70px]">Mức<br>lương</th>
  `;
  for(let d=1; d<=daysInMonth; d++){
    theadHtml += `<th class="p-1.5 text-center bg-amber-300 min-w-[32px]">${d}</th>`;
  }
  theadHtml += `
    <th class="p-2 text-center bg-amber-300 min-w-[60px]">Tổng<br>giờ</th>
    <th class="p-2 text-center bg-amber-300 min-w-[55px]">Ngày<br>công</th>
  `;
  theadRow.innerHTML = theadHtml;

  // Render tbody
  const tbody = document.getElementById('matrixTbody');
  if(rows.length === 0){
    tbody.innerHTML = `<tr><td colspan="${daysInMonth + 8}" class="text-center py-12 text-slate-400 font-bold bg-white">Không có dữ liệu nhân viên trong kỳ này</td></tr>`;
    document.getElementById('matrixTfootRow').innerHTML = '';
    return;
  }

  const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filteredRows = query ? rows.filter(r => r.code.toLowerCase().includes(query) || r.name.toLowerCase().includes(query) || r.branchName.toLowerCase().includes(query)) : rows;

  const daySums = new Array(daysInMonth).fill(0);

  tbody.innerHTML = filteredRows.map(r => {
    let daysHtml = '';
    r.days.forEach((dayObj, idx) => {
      const h = dayObj.hours;
      if(h){
        daySums[idx] += h;
        const cellClass = dayObj.isTraining ? 'cell-training' : '';
        daysHtml += `<td class="p-1 text-center font-bold ${cellClass}">${h}</td>`;
      } else {
        daysHtml += `<td class="p-1 text-center text-slate-300"></td>`;
      }
    });

    const isPinkRow = r.isSpecial || (r.code && (r.code.includes('139') || r.code.includes('094')));
    const nameColor = isPinkRow ? 'text-rose-600 font-extrabold' : 'text-slate-800 font-bold';
    const codeColor = isPinkRow ? 'text-rose-600 font-black' : 'font-mono text-slate-700 font-bold';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-2 text-left sticky-col-1 text-slate-700 font-medium">${r.branchName}</td>
        <td class="p-2 text-center sticky-col-2 ${codeColor}">${r.code}</td>
        <td class="p-2 text-center sticky-col-3 text-slate-500 font-mono">${r.cn}</td>
        <td class="p-2 text-left sticky-col-4 ${nameColor} truncate max-w-[190px]">${r.name}</td>
        <td class="p-2 text-right ${r.luongHocViec ? 'cell-training' : 'text-slate-400'}">${r.luongHocViec ? fmtMoney(r.luongHocViec) : ''}</td>
        <td class="p-2 text-right font-semibold">${fmtMoney(r.mucLuong)}</td>
        ${daysHtml}
        <td class="p-2 text-center font-black bg-amber-100 text-amber-900">${r.tongGio}</td>
        <td class="p-2 text-center font-black bg-yellow-100 text-yellow-900">${r.ngayCong}</td>
      </tr>
    `;
  }).join('');

  // Render tfoot (Hàng TỔNG đúng chuẩn ảnh 1)
  const grandHours = filteredRows.reduce((s, r) => s + (r.tongGio||0), 0);
  const grandDays = filteredRows.reduce((s, r) => s + (r.ngayCong||0), 0);

  let tfootHtml = `
    <td colspan="6" class="p-2.5 text-center text-sm font-black bg-amber-300 text-slate-900">TỔNG</td>
  `;
  for(let d=0; d<daysInMonth; d++){
    const sumD = Math.round(daySums[d] * 10) / 10;
    tfootHtml += `<td class="p-1 text-center bg-amber-300 font-bold text-slate-900">${sumD > 0 ? sumD : ''}</td>`;
  }
  tfootHtml += `
    <td class="p-2 text-center bg-amber-400 text-slate-950 font-black text-sm">${Math.round(grandHours*10)/10}</td>
    <td class="p-2 text-center bg-amber-400 text-slate-950 font-black text-sm">${grandDays}</td>
  `;
  document.getElementById('matrixTfootRow').innerHTML = tfootHtml;
}

// =========================================================================
// TAB 2: HOÀN TIỀN ĐỒNG PHỤC (THEO ẢNH 2)
// =========================================================================
async function loadDongPhuc(){
  try{
    const res = await api('/api/finance/reports/dong-phuc');
    dongphucCache = res.rows || [];
    renderDongPhuc(dongphucCache);
  }catch(e){
    console.error('loadDongPhuc error', e);
  }
}

function renderDongPhuc(rows){
  const tbody = document.getElementById('dongphucTbody');
  if(!tbody) return;

  const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filtered = query ? rows.filter(r => r.bhCode.toLowerCase().includes(query) || r.hoTen.toLowerCase().includes(query) || r.chiNhanh.toLowerCase().includes(query)) : rows;

  if(filtered.length === 0){
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-10 text-slate-400 font-bold bg-white">Chưa có dữ liệu đồng phục</td></tr>`;
    document.getElementById('dongphucTfootRow').innerHTML = '';
    return;
  }

  let totalCoc = 0;
  let totalHoan = 0;

  tbody.innerHTML = filtered.map(r => {
    totalCoc += Number(r.soTien)||0;
    totalHoan += Number(r.tienHoan)||0;

    const isHoanThanh = r.hoanDot1 === 'Hoàn thành';
    const badgeColor = isHoanThanh ? 'bg-cyan-100 text-cyan-800 border-cyan-300' : 'bg-amber-100 text-amber-800 border-amber-300';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-2 text-center font-mono font-bold text-slate-800">${r.bhCode}</td>
        <td class="p-2 text-center text-slate-600 font-medium">${fmtDMY(r.ngayLamViec)}</td>
        <td class="p-2 text-center text-slate-500">${r.ngayNghi ? fmtDMY(r.ngayNghi) : (r.trangThai==='Nghỉ việc'?'Đã nghỉ':'—')}</td>
        <td class="p-2 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.trangThai==='Đang làm'?'bg-emerald-100 text-emerald-700':'bg-slate-200 text-slate-600'}">${r.trangThai}</span></td>
        <td class="p-2 text-left font-bold text-slate-900">${r.hoTen}</td>
        <td class="p-2 text-left text-slate-700">${r.chiNhanh}</td>
        <td class="p-2 text-right font-black bg-yellow-50 text-slate-900">${fmtMoney(r.soTien)}</td>
        <td class="p-2 text-right font-black bg-cyan-50 text-cyan-900">${fmtMoney(r.tienHoan)}</td>
        <td class="p-2 text-center font-bold text-rose-600">${r.kiHoan ? fmtDMY(r.kiHoan) : '—'}</td>
        <td class="p-2 text-center">
          <span class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${badgeColor}">
            ${r.hoanDot1}
          </span>
        </td>
        <td class="p-2 text-center">
          <button onclick="openModalDongPhuc('${r.bhCode}')" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-pink-500 hover:text-pink-600 text-slate-700 text-xs font-bold transition-all">
            <i class="fa-solid fa-pen-to-square"></i> Sửa
          </button>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('dongphucTfootRow').innerHTML = `
    <td colspan="6" class="p-2 text-center font-black bg-slate-200">TỔNG CỘNG</td>
    <td class="p-2 text-right font-black bg-yellow-200 text-slate-950">${fmtMoney(totalCoc)}</td>
    <td class="p-2 text-right font-black bg-cyan-200 text-cyan-950">${fmtMoney(totalHoan)}</td>
    <td colspan="3" class="p-2 bg-slate-200"></td>
  `;
}

function openModalDongPhuc(bhCode){
  const r = dongphucCache.find(item => item.bhCode === bhCode);
  if(!r) return;
  document.getElementById('editDpBhCode').value = r.bhCode;
  document.getElementById('editDpCodeName').value = `${r.bhCode} - ${r.hoTen} (${r.chiNhanh})`;
  document.getElementById('editDpSoTien').value = r.soTien || 300000;
  document.getElementById('editDpTienHoan').value = r.tienHoan !== undefined ? r.tienHoan : 300000;
  document.getElementById('editDpKiHoan').value = r.kiHoan || '';
  document.getElementById('editDpHoanDot1').value = r.hoanDot1 || 'Hoàn thành';
  document.getElementById('editDpGhiChu').value = r.ghiChu || '';
  document.getElementById('modalDongPhuc').classList.remove('hidden');
}

async function submitDongPhuc(e){
  e.preventDefault();
  const bhCode = document.getElementById('editDpBhCode').value;
  const soTien = document.getElementById('editDpSoTien').value;
  const tienHoan = document.getElementById('editDpTienHoan').value;
  const kiHoan = document.getElementById('editDpKiHoan').value;
  const hoanDot1 = document.getElementById('editDpHoanDot1').value;
  const ghiChu = document.getElementById('editDpGhiChu').value;
  try{
    await api('/api/finance/reports/dong-phuc', {
      method: 'POST',
      body: JSON.stringify({ bhCode, soTien, tienHoan, kiHoan, hoanDot1, ghiChu })
    });
    closeModal('modalDongPhuc');
    loadDongPhuc();
  }catch(err){
    alert(err.message);
  }
}

// =========================================================================
// TAB 3: HOÀN TIỀN KHÁM SỨC KHỎE (THEO ẢNH 3)
// =========================================================================
async function loadKhamSK(){
  try{
    const res = await api('/api/finance/reports/kham-suc-khoe');
    khamskCache = res.rows || [];
    renderKhamSK(khamskCache);
  }catch(e){
    console.error('loadKhamSK error', e);
  }
}

function renderKhamSK(rows){
  const tbody = document.getElementById('khamskTbody');
  if(!tbody) return;

  const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filtered = query ? rows.filter(r => r.bhCode.toLowerCase().includes(query) || r.hoTen.toLowerCase().includes(query) || r.chiNhanh.toLowerCase().includes(query)) : rows;

  if(filtered.length === 0){
    tbody.innerHTML = `<tr><td colspan="12" class="text-center py-10 text-slate-400 font-bold bg-white">Chưa có dữ liệu khám sức khỏe</td></tr>`;
    document.getElementById('khamskTfootRow').innerHTML = '';
    return;
  }

  let totalTienKham = 0;
  let totalMucDuyet = 0;

  tbody.innerHTML = filtered.map((r, idx) => {
    totalTienKham += Number(r.tienKham)||0;
    totalMucDuyet += Number(r.mucDuyet)||0;

    // Chi nhánh badge theo đúng màu ảnh 3
    let bClass = 'bg-slate-100 text-slate-700';
    if(r.chiNhanh.includes('Tô Hiến Thành')) bClass = 'bg-purple-100 text-purple-800 border border-purple-200';
    else if(r.chiNhanh.includes('Vạn Kiếp')) bClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    else if(r.chiNhanh.includes('Hoàng Diệu')) bClass = 'bg-sky-100 text-sky-800 border border-sky-200';
    else if(r.chiNhanh.includes('Tôn Đản')) bClass = 'bg-blue-900 text-white font-bold';

    const isRed = (r.mucDuyet === 0 || r.tinhTrangHoan?.includes('KO CÓ') || r.code === 'BH.126');
    const rowColor = isRed ? 'text-rose-600 font-bold' : '';

    return `
      <tr class="hover:bg-slate-50 transition-colors ${rowColor}">
        <td class="p-2 text-center font-bold text-slate-500">${idx + 1}</td>
        <td class="p-2 text-center font-mono font-bold">${r.bhCode}</td>
        <td class="p-2 text-left font-bold">${r.hoTen}</td>
        <td class="p-2 text-center"><span class="px-2.5 py-1 rounded-lg text-xs font-bold inline-block ${bClass}">${r.chiNhanh}</span></td>
        <td class="p-2 text-center font-medium">${fmtDMY(r.ngayKiHD)}</td>
        <td class="p-2 text-center font-bold text-emerald-700">${fmtDMY(r.ngayHoan)}</td>
        <td class="p-2 text-center font-medium text-slate-600">${fmtDMY(r.ngayKham)}</td>
        <td class="p-2 text-right font-bold">${fmtMoney(r.tienKham)}</td>
        <td class="p-2 text-right font-black text-emerald-600">${fmtMoney(r.mucDuyet)}</td>
        <td class="p-2 text-center text-xs font-bold text-slate-700">${r.tinhTrangHoan}</td>
        <td class="p-2 text-left text-xs font-medium text-slate-600">${r.ghiChu || ''}</td>
        <td class="p-2 text-center">
          <button onclick="openModalKhamSK('${r.bhCode}')" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-600 text-slate-700 text-xs font-bold transition-all">
            <i class="fa-solid fa-pen-to-square"></i> Sửa
          </button>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('khamskTfootRow').innerHTML = `
    <td colspan="7" class="p-2 text-center font-black bg-slate-200">TỔNG CỘNG</td>
    <td class="p-2 text-right font-black bg-amber-200 text-slate-950">${fmtMoney(totalTienKham)}</td>
    <td class="p-2 text-right font-black bg-emerald-200 text-emerald-950">${fmtMoney(totalMucDuyet)}</td>
    <td colspan="3" class="p-2 bg-slate-200"></td>
  `;
}

function openModalKhamSK(bhCode){
  const r = khamskCache.find(item => item.bhCode === bhCode);
  if(!r) return;
  document.getElementById('editKskBhCode').value = r.bhCode;
  document.getElementById('editKskCodeName').value = `${r.bhCode} - ${r.hoTen} (${r.chiNhanh})`;
  document.getElementById('editKskNgayKiHD').value = r.ngayKiHD ? r.ngayKiHD.split('T')[0] : '';
  document.getElementById('editKskNgayHoan').value = r.ngayHoan ? r.ngayHoan.split('T')[0] : '';
  document.getElementById('editKskNgayKham').value = r.ngayKham ? r.ngayKham.split('T')[0] : '';
  document.getElementById('editKskTienKham').value = r.tienKham || 160000;
  document.getElementById('editKskMucDuyet').value = r.mucDuyet !== undefined ? r.mucDuyet : 160000;
  document.getElementById('editKskTinhTrangHoan').value = r.tinhTrangHoan || 'CHƯA HOÀN TRẢ GIẤY KHÁM';
  document.getElementById('editKskGhiChu').value = r.ghiChu || 'HOÀN 100% CHO NHÂN SỰ';
  document.getElementById('modalKhamSK').classList.remove('hidden');
}

function autoCalcNgayHoan(){
  const hd = document.getElementById('editKskNgayKiHD').value;
  if(!hd) return;
  try{
    const p = hd.split('-');
    if(p.length===3){
      const d = new Date(parseInt(p[0]), parseInt(p[1])-1 + 6, parseInt(p[2]));
      document.getElementById('editKskNgayHoan').value = d.toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'});
    }
  }catch(_){}
}

async function submitKhamSK(e){
  e.preventDefault();
  const bhCode = document.getElementById('editKskBhCode').value;
  const ngayKiHD = document.getElementById('editKskNgayKiHD').value;
  const ngayHoan = document.getElementById('editKskNgayHoan').value;
  const ngayKham = document.getElementById('editKskNgayKham').value;
  const tienKham = document.getElementById('editKskTienKham').value;
  const mucDuyet = document.getElementById('editKskMucDuyet').value;
  const tinhTrangHoan = document.getElementById('editKskTinhTrangHoan').value;
  const ghiChu = document.getElementById('editKskGhiChu').value;
  try{
    await api('/api/finance/reports/kham-suc-khoe', {
      method: 'POST',
      body: JSON.stringify({ bhCode, ngayKiHD, ngayHoan, ngayKham, tienKham, mucDuyet, tinhTrangHoan, ghiChu })
    });
    closeModal('modalKhamSK');
    loadKhamSK();
  }catch(err){
    alert(err.message);
  }
}

// =========================================================================
// TAB 4: BẢNG LƯƠNG TỔNG HỢP
// =========================================================================
async function loadPayrollSummary(){
  const month = document.getElementById('reportMonth').value || getVietnamTodayStr().slice(0,7);
  const branch = document.getElementById('reportBranch').value || '';
  try{
    const res = await api(`/api/finance/reports/payroll-summary?month=${month}&branch=${branch}`);
    payrollCache = res.rows || [];
    renderPayrollSummary(payrollCache);
  }catch(e){
    console.error('loadPayrollSummary error', e);
  }
}

function renderPayrollSummary(rows){
  const tbody = document.getElementById('payrollTbody');
  if(!tbody) return;

  const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filtered = query ? rows.filter(r => r.employeeId.toLowerCase().includes(query) || r.name.toLowerCase().includes(query) || r.branchName.toLowerCase().includes(query)) : rows;

  let totalLuongHV = 0;
  let totalLuongCT = 0;
  let totalHoanDP = 0;
  let totalHoanKSK = 0;
  let totalGiamTru = 0;
  let totalThucLinh = 0;
  let totalGio = 0;

  tbody.innerHTML = filtered.map(r => {
    totalLuongHV += r.luongHocViec || 0;
    totalLuongCT += r.luongChinhThuc || 0;
    totalHoanDP += r.hoanDongPhuc || 0;
    totalHoanKSK += r.hoanKhamSK || 0;
    totalGiamTru += r.giamTru || 0;
    totalThucLinh += r.thucLinh || 0;
    totalGio += r.totalHours || 0;

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-2.5 text-center font-mono font-bold text-slate-800">${r.employeeId}</td>
        <td class="p-2.5 text-left font-bold text-slate-900">${r.name}</td>
        <td class="p-2.5 text-left text-slate-600">${r.branchName}</td>
        <td class="p-2.5 text-center text-emerald-700 font-bold">${r.trainingHours || '—'}</td>
        <td class="p-2.5 text-center font-bold text-slate-800">${r.officialHours || '—'}</td>
        <td class="p-2.5 text-center font-black bg-amber-50 text-amber-900">${r.totalHours}</td>
        <td class="p-2.5 text-right font-medium text-emerald-800">${fmtMoney(r.luongHocViec)}</td>
        <td class="p-2.5 text-right font-medium text-slate-800">${fmtMoney(r.luongChinhThuc)}</td>
        <td class="p-2.5 text-right font-bold text-orange-600">${r.hoanDongPhuc ? `+${fmtMoney(r.hoanDongPhuc)}` : '—'}</td>
        <td class="p-2.5 text-right font-bold text-emerald-600">${r.hoanKhamSK ? `+${fmtMoney(r.hoanKhamSK)}` : '—'}</td>
        <td class="p-2.5 text-right font-bold text-rose-600">${r.giamTru ? `-${fmtMoney(r.giamTru)}` : '0'}</td>
        <td class="p-2.5 text-right font-black text-pink-700 bg-pink-50 text-sm">${fmtMoney(r.thucLinh)}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('payrollTfootRow').innerHTML = `
    <td colspan="5" class="p-2.5 text-center font-black bg-slate-200">TỔNG CỘNG (${filtered.length} NHÂN SỰ)</td>
    <td class="p-2.5 text-center font-black bg-amber-200">${Math.round(totalGio*10)/10}</td>
    <td class="p-2.5 text-right font-black bg-slate-200">${fmtMoney(totalLuongHV)}</td>
    <td class="p-2.5 text-right font-black bg-slate-200">${fmtMoney(totalLuongCT)}</td>
    <td class="p-2.5 text-right font-black text-orange-700 bg-slate-200">+${fmtMoney(totalHoanDP)}</td>
    <td class="p-2.5 text-right font-black text-emerald-700 bg-slate-200">+${fmtMoney(totalHoanKSK)}</td>
    <td class="p-2.5 text-right font-black text-rose-700 bg-slate-200">-${fmtMoney(totalGiamTru)}</td>
    <td class="p-2.5 text-right font-black bg-pink-600 text-white text-base">${fmtMoney(totalThucLinh)}</td>
  `;

  // Render KPI grid
  const kpiEl = document.getElementById('payrollKpiGrid');
  if(kpiEl){
    kpiEl.innerHTML = `
      <div class="card p-4 flex items-center gap-3 bg-gradient-to-br from-pink-500 to-rose-600 text-white">
        <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl"><i class="fa-solid fa-coins"></i></div>
        <div><div class="text-xs font-bold text-pink-100 uppercase">Tổng Thực Lĩnh</div><div class="text-xl font-black">${fmtMoney(totalThucLinh)}đ</div></div>
      </div>
      <div class="card p-4 flex items-center gap-3 bg-slate-900 text-white">
        <div class="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-xl"><i class="fa-solid fa-clock"></i></div>
        <div><div class="text-xs font-bold text-slate-400 uppercase">Tổng Giờ Làm</div><div class="text-xl font-black">${Math.round(totalGio*10)/10} giờ</div></div>
      </div>
      <div class="card p-4 flex items-center gap-3 bg-amber-500 text-white">
        <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl"><i class="fa-solid fa-shirt"></i></div>
        <div><div class="text-xs font-bold text-amber-100 uppercase">Hoàn Đồng Phục</div><div class="text-xl font-black">${fmtMoney(totalHoanDP)}đ</div></div>
      </div>
      <div class="card p-4 flex items-center gap-3 bg-emerald-600 text-white">
        <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl"><i class="fa-solid fa-heart-pulse"></i></div>
        <div><div class="text-xs font-bold text-emerald-100 uppercase">Hoàn Khám Sức Khỏe</div><div class="text-xl font-black">${fmtMoney(totalHoanKSK)}đ</div></div>
      </div>
    `;
  }
}

// =========================================================================
// TAB 5 & 6: CHI TIẾT NGÀY & SAI LỆCH
// =========================================================================
async function loadEmployeesForDaily(){
  try{
    const month = document.getElementById('reportMonth').value || getVietnamTodayStr().slice(0,7);
    const rows = await api(`/api/finance/reports/monthly?month=${month}`);
    const sel = document.getElementById('dailyEmp');
    if(sel){
      sel.innerHTML = rows.map(r => `<option value="${r.employeeId}">${r.employeeId} - ${r.name} (${r.branchName})</option>`).join('');
      if(sel.options.length) loadDaily();
    }
  }catch(_){}
}

async function loadDaily(){
  const empId = document.getElementById('dailyEmp')?.value;
  const month = document.getElementById('reportMonth').value || getVietnamTodayStr().slice(0,7);
  if(!empId) return;
  try{
    const rows = await api(`/api/finance/reports/daily?employeeId=${empId}&month=${month}`);
    const tbody = document.getElementById('dailyTbody');
    if(!tbody) return;
    tbody.innerHTML = rows.map(r => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-3 py-2 font-bold">${fmtDMY(r.date)} (${r.dayName})</td>
        <td class="px-3 py-2 text-center">${r.shift}</td>
        <td class="px-3 py-2 text-center font-mono">${r.checkIn || '—'}</td>
        <td class="px-3 py-2 text-center font-mono">${r.checkOut || '—'}</td>
        <td class="px-3 py-2 text-center font-black">${r.actualHours || '—'}</td>
        <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${r.status==='PRESENT'?'bg-emerald-100 text-emerald-700':r.status==='ABSENT'?'bg-rose-100 text-rose-700':'bg-amber-100 text-amber-700'}">${r.status}</span></td>
      </tr>
    `).join('');
  }catch(e){
    console.error('loadDaily error', e);
  }
}

async function loadAnomalies(){
  const month = document.getElementById('reportMonth').value || getVietnamTodayStr().slice(0,7);
  const branch = document.getElementById('reportBranch').value || '';
  try{
    const list = await api(`/api/finance/reports/anomalies?month=${month}&branch=${branch}`);
    const el = document.getElementById('anomalyList');
    if(!el) return;
    if(list.length === 0){
      el.innerHTML = '<div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center text-sm font-bold text-emerald-700"><i class="fa-solid fa-circle-check text-xl mr-2"></i> Không có sai lệch chấm công trong kỳ này!</div>';
      return;
    }
    el.innerHTML = list.map(a => `
      <div class="bg-white border border-amber-200 rounded-2xl p-4 flex justify-between items-center shadow-xs">
        <div>
          <div class="font-extrabold text-sm text-slate-900">${a.name} • ${a.employeeId} • ${fmtDMY(a.date)}</div>
          <div class="text-xs text-slate-600 mt-0.5">${a.desc}</div>
        </div>
        <span class="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800">${a.type}</span>
      </div>
    `).join('');
  }catch(e){
    console.error('loadAnomalies error', e);
  }
}

// =========================================================================
// XUẤT EXCEL CHUẨN MẪU TỪNG SHEET
// =========================================================================
function exportCurrentTabExcel(){
  const month = (document.getElementById('reportMonth').value || getVietnamTodayStr().slice(0,7)).replace('-','_');
  if(currentTab === 'matrix'){
    const wb = XLSX.utils.table_to_book(document.getElementById('matrixTable'), { sheet: `CHAM_CONG_${month}` });
    XLSX.writeFile(wb, `BANG_CHAM_CONG_THANG_${month}_UM_BO_MILK.xlsx`);
  } else if(currentTab === 'dongphuc'){
    const dataToExport = dongphucCache.map(r => ({
      'MÃ NV': r.bhCode,
      'NGÀY LÀM VIỆC': fmtDMY(r.ngayLamViec),
      'NGÀY NGHỈ': fmtDMY(r.ngayNghi),
      'TRẠNG THÁI': r.trangThai,
      'TÊN NHÂN VIÊN': r.hoTen,
      'CHI NHÁNH': r.chiNhanh,
      'SỐ TIỀN': r.soTien,
      'TIỀN HOÀN': r.tienHoan,
      'KÌ HOÀN': fmtDMY(r.kiHoan),
      'Hoàn đợt 1': r.hoanDot1,
      'GHI CHÚ': r.ghiChu || ''
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'HOAN_TIEN_DONG_PHUC');
    XLSX.writeFile(wb, `HOAN_TIEN_DONG_PHUC_${month}_UM_BO_MILK.xlsx`);
  } else if(currentTab === 'khamsk'){
    const dataToExport = khamskCache.map((r, i) => ({
      'STT': i + 1,
      'MÃ NV': r.bhCode,
      'NHÂN VIÊN': r.hoTen,
      'CHI NHÁNH': r.chiNhanh,
      'NGÀY KÍ HỢP ĐỒNG': fmtDMY(r.ngayKiHD),
      'NGÀY HOÀN (+6 THÁNG)': fmtDMY(r.ngayHoan),
      'NGÀY NV ĐI KHÁM': fmtDMY(r.ngayKham),
      'TIỀN KHÁM SỨC KHỎE NV': r.tienKham,
      'MỨC DUYỆT HOÀN TRẢ': r.mucDuyet,
      'TÌNH TRẠNG HOÀN': r.tinhTrangHoan,
      'GHI CHÚ': r.ghiChu || ''
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KHAM_SUC_KHOE');
    XLSX.writeFile(wb, `HOAN_TIEN_KHAM_SK_${month}_UM_BO_MILK.xlsx`);
  } else if(currentTab === 'payroll'){
    exportPayrollSummaryExcel();
  }
}

function exportPayrollSummaryExcel(){
  const month = (document.getElementById('reportMonth').value || getVietnamTodayStr().slice(0,7)).replace('-','_');
  const dataToExport = payrollCache.map(r => ({
    'MÃ NV': r.employeeId,
    'HỌ VÀ TÊN': r.name,
    'CHI NHÁNH': r.branchName,
    'GIỜ HỌC VIỆC (21K)': r.trainingHours,
    'LƯƠNG HỌC VIỆC': r.luongHocViec,
    'GIỜ CHÍNH THỨC (25.5K)': r.officialHours,
    'LƯƠNG CHÍNH THỨC': r.luongChinhThuc,
    'TỔNG GIỜ': r.totalHours,
    'CỘNG HOÀN ĐỒNG PHỤC': r.hoanDongPhuc,
    'CỘNG HOÀN KHÁM SK': r.hoanKhamSK,
    'TRỪ GIẢM TRỪ/PHẠT': r.giamTru,
    'THỰC LĨNH': r.thucLinh
  }));
  const ws = XLSX.utils.json_to_sheet(dataToExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BANG_LUONG');
  XLSX.writeFile(wb, `BANG_LUONG_TONG_HOP_${month}_UM_BO_MILK.xlsx`);
}

function filterCurrentTable(){
  if(currentTab === 'matrix') renderMatrix(matrixCache);
  else if(currentTab === 'dongphuc') renderDongPhuc(dongphucCache);
  else if(currentTab === 'khamsk') renderKhamSK(khamskCache);
  else if(currentTab === 'payroll') renderPayrollSummary(payrollCache);
}

function closeModal(id){
  document.getElementById(id)?.classList.add('hidden');
}

// Khởi tạo hệ thống & Socket realtime
(function init(){
  // Socket.io
  try{
    const isVercel = location.hostname.includes('vercel.app');
    const socketUrl = isVercel ? 'https://umbomilk-hr.onrender.com' : undefined;
    const s = io(socketUrl, {
      auth: { token: financeToken || '' },
      transports: ['websocket','polling'],
      timeout: 20000,
      reconnection: true
    });
    
    s.on('connect', () => {
      const b = document.getElementById('socketBadge');
      if(b) b.innerHTML = '<span class="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span> REALTIME 1:1';
    });

    s.on('disconnect', () => {
      const b = document.getElementById('socketBadge');
      if(b) b.innerHTML = '<span class="w-2 h-2 bg-rose-500 rounded-full"></span> NGOẠI TUYẾN';
    });

    s.on('finance:forceLogout', (data) => {
      if(financeKey && data.key === financeKey.key){
        alert(data.reason || 'Khóa Tài chính đã hết hạn');
        logout(true);
      }
    });

    const realTimeEvents = [
      'attendances:update',
      'employees:update',
      'schedules:update',
      'finance:dongPhuc:update',
      'finance:khamSK:update',
      'system:reset'
    ];

    realTimeEvents.forEach(ev => {
      s.on(ev, () => {
        // Realtime reload tab hiện tại
        loadAll();
      });
    });

    window._financeSocket = s;
  }catch(e){
    console.error('Socket init error', e);
  }

  // Khởi động
  if(financeToken && financeKey && financeExpires){
    showApp();
  } else {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }

  document.getElementById('reportBranch')?.addEventListener('change', loadAll);
  document.getElementById('reportMonth')?.addEventListener('change', () => {
    loadAll();
    loadEmployeesForDaily();
  });
})();
