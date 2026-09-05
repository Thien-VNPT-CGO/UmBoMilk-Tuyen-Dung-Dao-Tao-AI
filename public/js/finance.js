let financeToken = localStorage.getItem('finance_token');
let financeKey = JSON.parse(localStorage.getItem('finance_key')||'null');
let financeExpires = localStorage.getItem('finance_expires');

function fmtDMY(d){ if(!d) return '—'; const p=String(d).split('T')[0].split('-'); if(p.length===3) return `${p[2]}/${p[1]}/${p[0]}`; return d; }
function fmtMonth(m){ if(!m) return '—'; const p=String(m).split('-'); return `${p[1]}/${p[0]}`; }

async function api(path, opts={}){
  const headers={'Content-Type':'application/json'};
  if(financeToken) headers['Authorization']='Bearer '+financeToken;
  const res = await fetch(path, {...opts, headers:{...headers, ...(opts.headers||{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    if(data.needLogin || data.expired || res.status===401){
      logout(true);
      throw new Error(data.error||'Key hết hạn - vui lòng đăng nhập lại');
    }
    throw new Error(data.error||'Lỗi');
  }
  return data;
}

document.getElementById('loginForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const key=document.getElementById('financeKey').value.trim();
  const err=document.getElementById('loginError');
  const info=document.getElementById('keyInfo');
  try{
    const data = await fetch('/api/auth/finance-login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key})}).then(r=>r.json().then(d=>({ok:r.ok, d})));
    if(!data.ok) throw new Error(data.d.error||'Key không hợp lệ');
    financeToken=data.d.token;
    financeKey=data.d.key;
    financeExpires=data.d.expiresAt;
    localStorage.setItem('finance_token', financeToken);
    localStorage.setItem('finance_key', JSON.stringify(financeKey));
    localStorage.setItem('finance_expires', financeExpires);
    err.classList.add('hidden');
    info.classList.remove('hidden');
    info.innerHTML=`<div class="font-bold text-sky-700">Key ${financeKey.key} • ${financeKey.type} • Hết hạn: ${new Date(financeExpires).toLocaleString('vi-VN')}</div>`;
    setTimeout(showApp, 500);
  }catch(err2){
    err.textContent=err2.message;
    err.classList.remove('hidden');
  }
});

function showApp(){
  if(!financeToken || !financeKey || !financeExpires){
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    return;
  }
  // check expiry
  if(new Date(financeExpires).getTime() <= Date.now()){
    logout(true);
    return;
  }
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('keyLabel').textContent = financeKey.key + ' • ' + financeKey.type;
  document.getElementById('keyExpiry').textContent = new Date(financeExpires).toLocaleString('vi-VN');
  document.getElementById('reportMonth').value = new Date().toISOString().slice(0,7);
  startCountdown();
  loadAll();
  loadEmployeesForDaily();
}

function logout(isExpired){
  localStorage.removeItem('finance_token');
  localStorage.removeItem('finance_key');
  localStorage.removeItem('finance_expires');
  financeToken=null; financeKey=null; financeExpires=null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginOverlay').classList.remove('hidden');
  if(isExpired){
    const err=document.getElementById('loginError');
    if(err){ err.textContent='Key đã hết hạn - vui lòng xin key mới từ Admin'; err.classList.remove('hidden'); }
  }
  if(window._countdown) clearInterval(window._countdown);
}

function startCountdown(){
  const el=document.getElementById('countdown');
  if(!el) return;
  el.classList.remove('hidden');
  function tick(){
    const diff = new Date(financeExpires).getTime() - Date.now();
    if(diff<=0){ el.textContent='ĐÃ HẾT HẠN'; el.className='text-xs font-black bg-red-500 text-white px-3 py-1 rounded-full'; logout(true); return; }
    const d=Math.floor(diff/86400000), h=Math.floor(diff%86400000/3600000), m=Math.floor(diff%3600000/60000);
    el.textContent=`Còn ${d>0?d+'ngày ':''}${h}h ${m}p`;
    if(diff<86400000) el.className='text-xs font-black bg-amber-500 text-white px-3 py-1 rounded-full animate-pulse';
    else el.className='text-xs font-black bg-emerald-500 text-white px-3 py-1 rounded-full';
  }
  tick();
  if(window._countdown) clearInterval(window._countdown);
  window._countdown=setInterval(tick, 60000);
  // auto logout at exact expiry
  const ms = new Date(financeExpires).getTime() - Date.now();
  if(ms>0 && ms<2147483647){
    setTimeout(()=>{ logout(true); alert('Key Finance đã hết hạn - tự động đăng xuất'); }, ms+1000);
  }
}

function switchTab(id){
  document.querySelectorAll('.tab-section').forEach(s=>s.classList.add('hidden'));
  document.getElementById('tab-'+id)?.classList.remove('hidden');
  document.querySelectorAll('[id^="tabBtn-"]').forEach(b=>{ b.className='flex-1 min-w-[120px] px-3 py-2 rounded-xl text-sm font-bold bg-white border border-sky-100'; });
  const active=document.getElementById('tabBtn-'+id);
  if(active) active.className='flex-1 min-w-[120px] px-3 py-2 rounded-xl text-sm font-black bg-sky-500 text-white';
  if(id==='overview') loadOverview();
  if(id==='monthly') loadMonthly();
  if(id==='daily') loadDaily();
  if(id==='anomalies') loadAnomalies();
}

async function loadAll(){
  await Promise.all([loadOverview(), loadMonthly(), loadAnomalies()]);
}
async function loadOverview(){
  const month=document.getElementById('reportMonth').value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch').value || '';
  try{
    const kpi = await api(`/api/finance/reports/overview?month=${month}&branch=${branch}`);
    const items=[
      {label:'Tổng NV', value:kpi.totalEmployees, sub:'trong kỳ', color:'bg-sky-500'},
      {label:'Tiêu chuẩn', value:kpi.totalScheduledDays, sub:kpi.totalScheduledHours+'h', color:'bg-slate-700'},
      {label:'Thực tế', value:kpi.totalActualDays, sub:kpi.totalActualHours+'h', color:'bg-emerald-500'},
      {label:'Tính lương', value:kpi.totalPayableDays, sub:kpi.totalPayableHours+'h', color:'bg-blue-600'},
      {label:'Trễ', value:kpi.lateCount, sub:kpi.lateMinutes+"' ", color:'bg-orange-500'},
      {label:'Thiếu IN', value:kpi.missingCheckIn, sub:'lỗi', color:'bg-red-500'},
      {label:'Thiếu OUT', value:kpi.missingCheckOut, sub:'lỗi', color:'bg-red-400'},
    ];
    document.getElementById('kpiGrid').innerHTML=items.map(it=>`
      <div class="bg-white rounded-2xl border border-sky-100 p-3 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl ${it.color} text-white flex items-center justify-center text-sm"><i class="fa-solid fa-chart-simple"></i></div>
        <div><div class="text-[11px] font-bold text-slate-500">${it.label}</div><div class="text-lg font-black">${it.value}</div><div class="text-[11px] text-slate-400">${it.sub}</div></div>
      </div>
    `).join('');
  }catch(e){ console.error(e); }
}
async function loadMonthly(){
  const month=document.getElementById('reportMonth').value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch').value || '';
  try{
    const rows=await api(`/api/finance/reports/monthly?month=${month}&branch=${branch}`);
    const tbody=document.getElementById('monthlyTbody');
    if(!tbody) return;
    if(rows.length===0) return tbody.innerHTML='<tr><td colspan="6" class="text-center py-8 text-slate-400">Không có dữ liệu</td></tr>';
    tbody.innerHTML=rows.map(r=>`
      <tr class="border-b hover:bg-sky-50/30 text-xs">
        <td class="px-3 py-2"><div class="font-mono font-bold text-sky-700">${r.employeeId}</div><div class="font-bold">${r.name}</div><div class="text-[11px] text-slate-500">${r.branchName} • ${r.shift}</div></td>
        <td class="px-2 py-2 text-center font-bold">${r.scheduledDays}</td>
        <td class="px-2 py-2 text-center font-bold text-emerald-600">${r.actualDays}</td>
        <td class="px-2 py-2 text-center font-black text-blue-600">${r.payableDays}</td>
        <td class="px-2 py-2 text-center"><span class="${r.lateCount?'bg-orange-100 text-orange-700':'bg-slate-100 text-slate-500'} px-2 py-0.5 rounded-full font-bold">${r.lateCount}</span></td>
        <td class="px-2 py-2 text-center"><span class="${(r.missingIn+r.missingOut)?'bg-red-100 text-red-700':'bg-emerald-50 text-emerald-700'} px-2 py-0.5 rounded-full font-bold">${r.missingIn+r.missingOut}</span></td>
      </tr>
    `).join('');
  }catch(e){ console.error(e); }
}
async function loadEmployeesForDaily(){
  try{
    // Use finance to get employees via monthly rows (has names) or fetch via public?
    // Finance cannot call /api/employees directly, so get from monthly
    const month=document.getElementById('reportMonth').value || new Date().toISOString().slice(0,7);
    const rows=await api(`/api/finance/reports/monthly?month=${month}`);
    const sel=document.getElementById('dailyEmp');
    if(sel) sel.innerHTML=rows.map(r=>`<option value="${r.employeeId}">${r.employeeId} - ${r.name}</option>`).join('');
    if(sel && sel.options.length) loadDaily();
  }catch(e){}
}
async function loadDaily(){
  const empId=document.getElementById('dailyEmp')?.value;
  const month=document.getElementById('reportMonth').value || new Date().toISOString().slice(0,7);
  if(!empId) return;
  try{
    const rows=await api(`/api/finance/reports/daily?employeeId=${empId}&month=${month}`);
    const tbody=document.getElementById('dailyTbody');
    tbody.innerHTML=rows.map(r=>`
      <tr class="border-b hover:bg-sky-50/30 text-xs">
        <td class="px-2 py-2"><div class="font-bold">${fmtDMY(r.date)} ${r.dayName}</div><div class="text-[11px] text-slate-500">${r.schedStatus||r.status}</div></td>
        <td class="px-2 py-2 text-center">${r.shift}</td>
        <td class="px-2 py-2 text-center font-mono">${r.checkIn||'—'}</td>
        <td class="px-2 py-2 text-center font-mono">${r.checkOut||'—'}</td>
        <td class="px-2 py-2 text-center"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${r.status==='PRESENT'?'bg-emerald-100 text-emerald-700':r.status==='ABSENT'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}">${r.status}</span></td>
      </tr>
    `).join('');
  }catch(e){ console.error(e); }
}
async function loadAnomalies(){
  const month=document.getElementById('reportMonth').value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch').value || '';
  try{
    const list=await api(`/api/finance/reports/anomalies?month=${month}&branch=${branch}`);
    const el=document.getElementById('anomalyList');
    if(list.length===0) return el.innerHTML='<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center text-sm text-emerald-700">✔ Không có sai lệch</div>';
    el.innerHTML=list.slice(0,50).map(a=>`
      <div class="bg-white border border-amber-200 rounded-xl p-3 flex justify-between items-center">
        <div><div class="font-bold text-sm">${a.name} • ${a.employeeId} • ${fmtDMY(a.date)}</div><div class="text-xs text-slate-600">${a.type} — ${a.desc}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700">${a.type}</span>
      </div>
    `).join('');
  }catch(e){ console.error(e); }
}
async function exportFinance(){
  const month=document.getElementById('reportMonth').value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch').value || '';
  const res=await fetch(`/api/finance/export/payroll-input?month=${month}&branch=${branch}`, {headers:{Authorization:'Bearer '+financeToken}});
  if(!res.ok) return alert('Lỗi export');
  const blob=await res.blob();
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`Du_lieu_tinh_luong_${month.replace('-','_')}_FINANCE.csv`; a.click();
}

// init
(function(){
  // check token expiry every 30s
  setInterval(()=>{
    if(financeExpires && new Date(financeExpires).getTime() <= Date.now()){
      logout(true);
    }
  }, 30000);
  // socket for finance force logout
  try{
    const s=io({auth:{token: financeToken||''}});
    s.on('finance:forceLogout', (data)=>{
      if(financeKey && data.key===financeKey.key){
        alert(data.reason||'Key hết hạn');
        logout(true);
      }
    });
    s.on('financeKeys:update', ()=>{});
    s.on('connect_error', ()=>{});
  }catch(e){}
  if(financeToken && financeKey && financeExpires) showApp();
  else { document.getElementById('loginOverlay').classList.remove('hidden'); document.getElementById('app').classList.add('hidden'); }
  document.getElementById('reportMonth').value=new Date().toISOString().slice(0,7);
  document.getElementById('reportBranch')?.addEventListener('change', loadAll);
  document.getElementById('reportMonth')?.addEventListener('change', loadAll);
})();
