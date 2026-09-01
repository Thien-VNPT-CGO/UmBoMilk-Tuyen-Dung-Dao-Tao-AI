const API = '';
let token = localStorage.getItem('admin_token');
let currentUser = JSON.parse(localStorage.getItem('admin_user') || 'null');
let socket = null;
let branches = [];
let employees = [];
let applicants = [];
let attendances = [];
let schedules = [];
let offRequests = [];
let emergencyRequests = [];
let deviceRequests = [];
let testCourses = [];
let testResults = [];
let zaloRecords = [];
let auditLogs = [];
let syncQueue = [];
let users = [];
let payrollData = [];
let reportData = [];
let currentEmpStoreTab = localStorage.getItem('empStoreTab') || 'TRAINING';

const SHIFT_MAP = {
  'Ca Sáng': 'CA_SANG',
  'Ca Trưa': 'CA_TRUA',
  'Ca Tối': 'CA_TOI',
  'CA_SANG': 'CA_SANG',
  'CA_TRUA': 'CA_TRUA',
  'CA_TOI': 'CA_TOI'
};

const NAV = [
  {id:'dashboard', icon:'fa-chart-line', label:'Tổng quan', desc:'Dashboard KPI', group:'Tổng quan'},
  {id:'applicants', icon:'fa-user-plus', label:'Nhân viên mới', badge:'Form', group:'Tuyển dụng'},
  {id:'interviews', icon:'fa-calendar-check', label:'Lịch phỏng vấn', badge:'Google Meet', group:'Tuyển dụng'},
  {id:'employees-store', icon:'fa-store', label:'NV Cửa hàng', badge:'Training/Chính thức', group:'Nhân sự'},
  {id:'beta-workshop', icon:'fa-industry', label:'NV Xưởng', badge:'Beta', group:'Nhân sự'},
  {id:'beta-office', icon:'fa-building', label:'NV Văn phòng', badge:'Beta', group:'Nhân sự'},
  {id:'beta-sale', icon:'fa-bullhorn', label:'NV Sale', badge:'Beta', group:'Nhân sự'},
  {id:'schedule', icon:'fa-calendar-days', label:'Lịch làm việc', desc:'T2→CN', group:'Vận hành'},
  {id:'requests', icon:'fa-clipboard-check', label:'Duyệt phiếu', badge:'OFF/Reset', group:'Vận hành'},
  {id:'attendance', icon:'fa-camera', label:'Record điểm danh', desc:'GPS/Ảnh', group:'Vận hành'},
  {id:'zalo', icon:'fa-brands fa-viber', label:'Record Zalo', desc:'SENT/FAILED', group:'Vận hành'},
  {id:'report', icon:'fa-file-invoice', label:'Báo cáo chấm công', desc:'Lương', group:'Vận hành'},
  {id:'elearning', icon:'fa-graduation-cap', label:'E-learning', desc:'TEST', group:'Hệ thống'},
  {id:'settings', icon:'fa-gear', label:'Cài đặt', badge:'Admin', group:'Hệ thống'},
  {id:'audit', icon:'fa-shield-halved', label:'Audit Log', desc:'Security', group:'Hệ thống'},
];
const NAV_GROUPS = ['Tổng quan','Tuyển dụng','Nhân sự','Vận hành','Hệ thống'];
const NAV_GROUP_ICONS = {'Tổng quan':'fa-chart-pie','Tuyển dụng':'fa-user-plus','Nhân sự':'fa-users','Vận hành':'fa-gears','Hệ thống':'fa-shield-halved'};

// ==== FORMAT HELPERS dd/MM/yyyy ====
function fmtDMY(dateStr){
  if(!dateStr) return '—';
  try{
    const d = String(dateStr).split('T')[0];
    const p = d.split('-');
    if(p.length===3) return `${p[2]}/${p[1]}/${p[0]}`;
    const dt = new Date(dateStr);
    if(!isNaN(dt)) return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear();
    return dateStr;
  }catch(e){ return dateStr; }
}
function fmtDMYShort(dateStr){
  if(!dateStr) return '—';
  const d = String(dateStr).split('T')[0];
  const p = d.split('-');
  if(p.length===3) return `${p[2]}/${p[1]}`;
  return d.slice(5);
}
function fmtDMYTime(iso){
  if(!iso) return '—';
  try{
    const dt = new Date(iso);
    if(isNaN(dt)) return iso;
    const dd=String(dt.getDate()).padStart(2,'0');
    const mm=String(dt.getMonth()+1).padStart(2,'0');
    const yyyy=dt.getFullYear();
    const hh=String(dt.getHours()).padStart(2,'0');
    const mi=String(dt.getMinutes()).padStart(2,'0');
    const ss=String(dt.getSeconds()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
  }catch(e){ return iso;}
}

function getBranchDisplay(id){
  const fallback = {CN1:'CN1 - 130 Vạn kiếp', CN2:'CN2 - 261 Tô Hiến Thành', CN3:'CN3 - 120 Hoàng Diệu 2', CN4:'CN4 - 111 Tôn Đản'};
  const b = (branches && branches.length) ? branches.find(x=>x.id===id) : null;
  if(b) return b.name;
  return fallback[id] || id;
}
function getBranchFull(id){
  const fallbackAddr = {CN1:'130 Vạn kiếp, Phường 3, Quận Bình Thạnh', CN2:'261 Tô Hiến Thành, Phường 12, Quận 10', CN3:'120 Hoàng Diệu 2, Phường Linh Trung, TP. Thủ Đức', CN4:'111 Tôn Đản, Phường 15, Quận 4'};
  const b = (branches && branches.length) ? branches.find(x=>x.id===id) : null;
  if(b) return `${b.id} - ${b.address}`;
  return id + (fallbackAddr[id] ? ' - ' + fallbackAddr[id] : '');
}

function fmtMonthYear(ym){
  if(!ym) return '—';
  const p = String(ym).split('-');
  if(p.length>=2) return `${p[1]}/${p[0]}`;
  return ym;
}
function getStatusVi(status) {
  if (!status) return '—';
  const map = {
    NEW_APPLICANT: 'Ứng viên mới',
    INTERVIEW: 'Đã hẹn phỏng vấn',
    PASS: 'Đạt phỏng vấn',
    CONVERTED: 'Đã chuyển Training',
    REJECTED: 'Bị loại',
    TRAINING: 'Thử việc (12 ngày)',
    OFFICIAL: 'Chính thức',
    WAITING_TEST: 'Chờ làm bài Test',
    FAILED_TEST: 'Chưa đạt bài Test',
    RETEST: 'Thi lại Test',
    WAITING_OFFICIAL: 'Chưa chính thức',
    ARCHIVED: 'Đã lưu trữ',
    WORKING: 'Đang làm việc',
    SUBSTITUTE: 'Làm thay',
    EMERGENCY_OFF: 'Nghỉ đột xuất',
    OFF: 'Nghỉ',
    NONE: 'Nghỉ',
    ACTIVE: 'Hoạt động',
    PENDING: 'Chờ duyệt',
    APPROVED: 'Đã duyệt',
    DENIED: 'Từ chối',
    EXPIRED: 'Hết hạn',
    SYNCED: 'Đã đồng bộ',
    FAILED: 'Thất bại',
    SENT: 'Đã gửi'
  };
  return map[status] || status;
}

let currentMode = localStorage.getItem('app_mode') || 'AUTO';
function updateModeBadge(){
  const badge=document.getElementById('modeBadge');
  const dot=document.getElementById('modeDot');
  const text=document.getElementById('modeText');
  if(!badge||!dot||!text) return;
  const socketOnline = !!(socket && socket.connected);
  const hasSheet = db.settings && db.settings.googleSheet && db.settings.googleSheet.spreadsheetId;
  const lastRealSync = syncQueue && syncQueue.find(s=>s.source==='SHEET' && s.operation==='SYNC_SHEET_REAL');
  let isOnline=false;
  if(currentMode==='ONLINE') isOnline=true;
  else if(currentMode==='DEMO') isOnline=false;
  else isOnline = socketOnline && hasSheet && !!lastRealSync;
  if(!socketOnline){
    badge.className='hidden md:flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-black px-3 py-1.5 rounded-full';
    dot.className='w-2 h-2 bg-slate-400 rounded-full';
    text.textContent='NGOẠI TUYẾN';
    badge.title='Mất kết nối Socket.io - đang DỮ LIỆU MẪU/ngoại tuyến';
  }else if(isOnline){
    badge.className='hidden md:flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-xs font-black px-3 py-1.5 rounded-full';
    dot.className='w-2 h-2 bg-green-500 rounded-full animate-pulse';
    text.textContent='TRỰC TUYẾN';
    badge.title='TRỰC TUYẾN: dữ liệu thật + realtime';
  }else{
    badge.className='hidden md:flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-black px-3 py-1.5 rounded-full';
    dot.className='w-2 h-2 bg-amber-500 rounded-full';
    text.textContent='DỮ LIỆU MẪU';
    badge.title='DỮ LIỆU MẪU: thử nghiệm giao diện';
  }
  badge.onclick=()=>{
    if(currentMode==='AUTO') currentMode='DEMO';
    else if(currentMode==='DEMO') currentMode='ONLINE';
    else currentMode='AUTO';
    localStorage.setItem('app_mode', currentMode);
    updateModeBadge();
    if(typeof showToast==='function') showToast('Chế độ: '+currentMode,'success');
  };
}


function getDefaultTabsForRole(role) {
  if (role === 'Admin') return NAV.map(n => n.id);
  if (role === 'HR') return ['dashboard', 'applicants', 'interviews', 'employees-store', 'schedule', 'requests'];
  if (role === 'Manager') return ['dashboard', 'employees-store', 'schedule', 'requests', 'attendance'];
  if (role === 'Umbomilk') return ['dashboard', 'applicants', 'employees-store', 'attendance'];
  return ['dashboard', 'applicants', 'employees-store'];
}

function getUserAllowedTabIds() {
  if (!currentUser) return NAV.map(n => n.id);
  const userTabs = currentUser.allowedTabs;

  // Strict enforcement: If user has an allowedTabs array defined, return it directly!
  if (Array.isArray(userTabs)) {
    return userTabs;
  }
  if (currentUser.role === 'Admin') {
    return NAV.map(n => n.id);
  }
  return getDefaultTabsForRole(currentUser.role);
}

function applyMenuRedesign(){
  if(document.getElementById('menuRedesignStyle')) return;
  const style=document.createElement('style');
  style.id='menuRedesignStyle';
  style.textContent=`
    #sidebar{width:280px; background:#fff; border-right:1px solid #f1f5f9; box-shadow:4px 0 24px rgba(0,0,0,.04)}
    .nav-group{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;padding:14px 10px 6px 10px;margin-top:2px;display:flex;align-items:center;gap:8px}
    .nav-group::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#fce7f3,transparent)}
    .nav-item{position:relative;display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:14px;font-size:13px;font-weight:600;color:#475569;transition:all .18s cubic-bezier(.4,0,.2,1);border:1px solid transparent; width:100%; text-align:left}
    .nav-item:hover{background:#fdf2f8;color:#be185d;border-color:#fce7f3;transform:translateX(2px)}
    .nav-item:active{transform:scale(.98)}
    .nav-icon{width:34px;height:34px;border-radius:11px;background:#f8fafc;border:1px solid #f1f5f9;display:flex;align-items:center;justify-content:center;font-size:13px;color:#64748b;flex-shrink:0;transition:all .18s}
    .nav-item:hover .nav-icon{background:white;border-color:#fce7f3;color:#ec4899;box-shadow:0 2px 8px rgba(236,72,153,.12)}
    .nav-badge{font-size:10px;font-weight:800;padding:2px 7px;border-radius:99px;background:#fdf2f8;color:#be185d;border:1px solid #fce7f3;white-space:nowrap}
    .nav-desc{font-size:11px;font-weight:500;color:#94a3b8;line-height:1}
    .nav-active{background:linear-gradient(135deg,#ec4899 0%,#e11d48 100%)!important;color:white!important;box-shadow:0 4px 14px rgba(236,72,153,.35)!important; border:1px solid rgba(236,72,153,.15)!important}
    .nav-active .nav-icon{background:rgba(255,255,255,.22)!important;color:white!important;border-color:rgba(255,255,255,.25)!important}
    .nav-active i{color:white!important}
    .nav-active .nav-desc{color:rgba(255,255,255,.85)!important}
    .nav-active .nav-badge{background:rgba(255,255,255,.22)!important;color:white!important;border-color:rgba(255,255,255,.2)!important}
  `;
  document.head.appendChild(style);
  // Gọn header: gom 6 status thành 1 dropdown nếu chưa có
  const oldStatusContainer=document.querySelector('header .hidden.lg\\:flex');
  if(oldStatusContainer && !document.getElementById('headerSystemDropdown')){
    const ids=['statusDbMaster','statusFormSheet','statusAI','statusMeet','statusZalo','statusOnline'];
    const hasAll=ids.every(id=>document.getElementById(id));
    if(hasAll){
      const wrapper=document.createElement('div');
      wrapper.id='headerSystemDropdown';
      wrapper.className='hidden lg:flex items-center gap-2';
      wrapper.innerHTML=`
        <div class="relative group">
          <button class="flex items-center gap-2 bg-white border border-pink-200 hover:border-pink-300 text-pink-700 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm transition">
            <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>Hệ thống</span>
            <span class="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">6</span>
            <i class="fa-solid fa-chevron-down text-[10px] opacity-60 group-hover:rotate-180 transition"></i>
          </button>
          <div class="absolute top-full right-0 mt-2 w-72 bg-white border border-pink-100 rounded-2xl shadow-xl p-3 hidden group-hover:block z-50">
            <div class="text-[11px] font-black text-pink-900 mb-2 uppercase tracking-wider">Trạng thái hệ thống</div>
            <div class="space-y-1.5" id="headerSystemDropdownList"></div>
          </div>
        </div>
      `;
      oldStatusContainer.parentNode.insertBefore(wrapper, oldStatusContainer);
      const list=wrapper.querySelector('#headerSystemDropdownList');
      ids.forEach(id=>{
        const el=document.getElementById(id);
        if(el){
          const clone=el.cloneNode(true);
          clone.classList.remove('hidden');
          clone.classList.add('flex','items-center','gap-2','bg-emerald-50','border','border-emerald-200','text-emerald-800','text-xs','font-bold','px-3','py-2','rounded-xl','w-full');
          clone.style.display='flex';
          list.appendChild(clone);
          el.style.display='none';
        }
      });
      oldStatusContainer.style.display='none';
    }
  }
}
function initNav(){
  applyMenuRedesign();
  const el = document.getElementById('navMenu');
  if (!el) return;
  const allowed = getUserAllowedTabIds();
  const filteredNav = NAV.filter(n => allowed.includes(n.id));
  // Grouped render
  let html='';
  NAV_GROUPS.forEach(group=>{
    const groupItems=filteredNav.filter(n=>n.group===group);
    if(groupItems.length===0) return;
    const groupIcon=NAV_GROUP_ICONS[group]||'fa-ellipsis';
    html+=`<div class="nav-group"><i class="fa-solid ${groupIcon} text-pink-400"></i>${group}</div>`;
    groupItems.forEach(n=>{
      html+=`
        <button onclick="switchTab('${n.id}')" id="nav-${n.id}" class="nav-item">
          <span class="nav-icon"><i class="fa-solid ${n.icon}"></i></span>
          <span class="flex-1 text-left leading-tight">${n.label}<br><span class="nav-desc">${n.desc||n.badge||''}</span></span>
          ${n.badge?`<span class="nav-badge">${n.badge}</span>`:''}
        </button>
      `;
    });
  });
  // Fallback: items without group
  const noGroup=filteredNav.filter(n=>!n.group);
  if(noGroup.length){
    noGroup.forEach(n=>{
      html+=`<button onclick="switchTab('${n.id}')" id="nav-${n.id}" class="nav-item"><span class="nav-icon"><i class="fa-solid ${n.icon}"></i></span><span class="flex-1 text-left">${n.label}</span>${n.badge?`<span class="nav-badge">${n.badge}</span>`:''}</button>`;
    });
  }
  el.innerHTML=html;
}

function switchTab(id){
  const allowed = getUserAllowedTabIds();
  if (!allowed.includes(id) && currentUser.role !== 'Admin') {
    showToast('Tài khoản của bạn không được phân quyền xem Tab này', 'error');
    if (allowed.length > 0) switchTab(allowed[0]);
    return;
  }

  document.querySelectorAll('.tab-section').forEach(s=>s.classList.add('hidden'));
  const target = document.getElementById('tab-'+id);
  if(target) target.classList.remove('hidden');
  document.querySelectorAll('[id^="nav-"]').forEach(b=>b.classList.remove('nav-active'));
  const navBtn = document.getElementById('nav-'+id);
  if(navBtn) navBtn.classList.add('nav-active');
  // lazy load
  if(id==='dashboard') loadDashboard();
  if(id==='applicants') loadApplicants();
  if(id==='interviews') loadInterviews();
  if(id==='employees-store') loadEmployees();
  if(id==='beta-workshop') renderBeta();
  if(id==='schedule') loadSchedules();
  if(id==='requests') loadRequests();
  if(id==='attendance') loadAttendances();
  if(id==='zalo') loadZalo();
  if(id==='report'){ loadReports(); loadReportAll(); switchReportTab('overview'); }
  if(id==='elearning') loadElearning();
  if(id==='settings') loadSettings();
  if(id==='audit') loadAudit();
  if(window.innerWidth<1024) document.getElementById('sidebar').classList.add('hidden');
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('hidden');
}
function togglePass(){
  const p=document.getElementById('password');
  p.type = p.type==='password'?'text':'password';
}

async function api(path, opts={}){
  const headers = {'Content-Type':'application/json'};
  if(token) headers['Authorization']='Bearer '+token;
  const res = await fetch(API+path, {...opts, headers:{...headers, ...(opts.headers||{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Lỗi API');
  return data;
}

// Auth
document.getElementById('loginForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const username=document.getElementById('username').value.trim();
  const password=document.getElementById('password').value;
  const errEl=document.getElementById('loginError');
  try{
    const data = await api('/api/auth/login', {method:'POST', body:JSON.stringify({username,password})});
    token=data.token;
    currentUser=data.user;
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_user', JSON.stringify(currentUser));
    errEl.classList.add('hidden');
    showApp();
  }catch(err){
    errEl.textContent=err.message;
    errEl.classList.remove('hidden');
  }
});
function showApp(){
  if(!token || !currentUser){
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    return;
  }
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userName').textContent=currentUser.displayName||currentUser.username;
  document.getElementById('userRole').textContent=currentUser.role+' • '+(currentUser.branchScope?.join(',')||'All');
  // RBAC sidebar hide
  if(currentUser.role==='Umbomilk'){
    // hide settings, users, etc. Keep view
  }
  initNav();
  switchTab('dashboard');
  connectSocket();
  loadBranches();
  loadDashboard();
  setTimeout(updateModeBadge, 500);
}
function logout(){
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  token=null; currentUser=null;
  if(socket) socket.disconnect();
  location.reload();
}
function updateModeBadge(settings) {
  const onlineEl = document.getElementById('statusOnline');
  if (onlineEl) {
    const isConn = socket && socket.connected;
    onlineEl.className = `flex items-center gap-1.5 ${isConn ? 'bg-emerald-500' : 'bg-red-500'} text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow-xs`;
    onlineEl.innerHTML = `<span class="w-2 h-2 bg-white rounded-full ${isConn ? 'animate-ping' : ''}"></span><i class="fa-solid fa-wifi"></i><span>${isConn ? 'ONLINE' : 'OFFLINE'}</span>`;
  }

  if (!settings && token) {
    api('/api/settings', { headers: { Authorization: 'Bearer ' + token } })
      .then(res => updateSystemStatusIndicators(res.settings))
      .catch(() => {});
  } else if (settings) {
    updateSystemStatusIndicators(settings);
  }
}

function updateSystemStatusIndicators(s) {
  if (!s) return;

  // 1. Database chính (Sheet ID: 17iXM0zc...)
  const dbEl = document.getElementById('statusDbMaster');
  if (dbEl) {
    const hasDb = s.googleSheet?.targetDatabaseSpreadsheetId || s.googleSheet?.serviceAccountEmail;
    dbEl.className = `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black shadow-2xs ${hasDb ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' : 'bg-slate-100 border border-slate-300 text-slate-500'}`;
    dbEl.innerHTML = `<span class="w-2 h-2 ${hasDb ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'} rounded-full"></span><i class="fa-solid fa-database ${hasDb ? 'text-emerald-600' : 'text-slate-400'}"></i><span>DB CHÍNH: ${hasDb ? 'LIVE' : 'MOCK'}</span>`;
  }

  // 2. GG Sheet Đăng ký (Sheet ID: 1rcqEKra...)
  const formEl = document.getElementById('statusFormSheet');
  if (formEl) {
    const hasForm = s.googleSheet?.spreadsheetId;
    formEl.className = `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black shadow-2xs ${hasForm ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' : 'bg-slate-100 border border-slate-300 text-slate-500'}`;
    formEl.innerHTML = `<span class="w-2 h-2 ${hasForm ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'} rounded-full"></span><i class="fa-solid fa-file-excel ${hasForm ? 'text-emerald-600' : 'text-slate-400'}"></i><span>SHEET FORM: ${hasForm ? 'LIVE' : 'MOCK'}</span>`;
  }

  // 3. AI Scoring Engine
  const aiEl = document.getElementById('statusAI');
  if (aiEl) {
    const hasAiKey = s.ai?.apiKey;
    aiEl.className = `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black shadow-2xs bg-emerald-50 border border-emerald-300 text-emerald-800`;
    aiEl.innerHTML = `<span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span><i class="fa-solid fa-brain text-emerald-600"></i><span>AI: ${hasAiKey ? 'LIVE OPENAI' : 'LIVE (14-RUBRIC)'}</span>`;
  }

  // 4. Google Meet
  const meetEl = document.getElementById('statusMeet');
  if (meetEl) {
    meetEl.className = `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black shadow-2xs bg-emerald-50 border border-emerald-300 text-emerald-800`;
    meetEl.innerHTML = `<span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span><i class="fa-solid fa-video text-emerald-600"></i><span>GG MEET: LIVE</span>`;
  }

  // 5. Zalo Bot
  const zaloEl = document.getElementById('statusZalo');
  if (zaloEl) {
    const hasZalo = s.zalo?.accessToken || s.zalo?.botWebhookUrl || s.zalo?.oaId;
    zaloEl.className = `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black shadow-2xs ${hasZalo ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' : 'bg-blue-50 border border-blue-200 text-blue-800'}`;
    zaloEl.innerHTML = `<span class="w-2 h-2 ${hasZalo ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500 animate-pulse'} rounded-full"></span><i class="fa-solid fa-paper-plane ${hasZalo ? 'text-emerald-600' : 'text-blue-600'}"></i><span>ZALO: ${hasZalo ? 'LIVE BOT API' : 'LIVE DISPATCH'}</span>`;
  }
}

function connectSocket(){
  if(socket) socket.disconnect();
  socket = io({ auth: { token: token || localStorage.getItem('admin_token') }, transports: ['websocket','polling'] });
  socket.on('connect', ()=>{
    updateModeBadge();
  });
  socket.on('disconnect', ()=>{
    updateModeBadge();
  });
  const refreshEvents = ['employees:update','applicants:update','attendances:update','schedules:update','offRequests:update','emergencyRequests:update','deviceRequests:update','zalo:update','audit:new','sync:update','keys:update','notifications:update','testResults:update','settings:update','interviews:update','drive:update','overtime:update','leave:update','payrollPeriods:update','payrollSnapshots:update'];
  refreshEvents.forEach(ev=>{
    socket.on(ev, (data)=>{
      // debounce refresh current tab
      const active = document.querySelector('.tab-section:not(.hidden)')?.id?.replace('tab-','');
      const syncEl = document.getElementById('syncStatus') || document.getElementById('syncBadge');
      if (syncEl) {
        syncEl.textContent = 'LIVE UPDATE';
        syncEl.classList.add('bg-emerald-500','animate-pulse');
        setTimeout(() => { if (syncEl) { syncEl.textContent = 'SYNCED'; syncEl.classList.remove('animate-pulse'); } }, 1200);
      }
      // reload relevant data without full fetch if payload provided?
      // For simplicity, refetch current tab
      if(active==='dashboard') loadDashboard();
      if(active==='applicants') loadApplicants();
      if(active==='interviews') loadInterviews();
      if(active==='employees-store') loadEmployees();
      if(active==='schedule') loadSchedules();
      if(active==='requests') loadRequests();
      if(active==='attendance') loadAttendances();
      if(active==='zalo') loadZalo();
      if(active==='report') { if(typeof loadReports==='function') loadReports(); if(typeof loadReportOverview==='function') loadReportOverview(); }
      if(active==='elearning') loadElearning();
      if(active==='settings') {/* */}
      if(active==='audit') loadAudit();
      // realtime drive / OT / leave toasts
      if(ev==='drive:update' && data) showToast(`📁 Drive realtime: ${Array.isArray(data)?data.length:1} file mới (${data[0]?.drivePath||''})`, 'info');
      if(ev==='overtime:update') showToast('⏱ OT realtime cập nhật', 'info');
      if(ev==='leave:update') showToast('🏖 Nghỉ phép realtime cập nhật', 'info');
      if(ev==='payrollSnapshots:update') showToast('💰 Payroll snapshot đã khóa - dữ liệu lương đóng băng', 'success');
      // also update global badges
      updatePendingCount();
      updateModeBadge();
    });
  });
  // Automation heartbeat realtime
  socket.on('automation:heartbeat', (data)=>{
    const hb = document.getElementById('automationHeartbeat');
    if(hb) hb.textContent = `AUTO ${new Date(data.now).toLocaleTimeString('vi-VN')} | DEV:${data.pendingDevices} EMR:${data.pendingEmerg} SYNC:${data.syncPending||0}`;
    const dot = document.getElementById('realtimeDot');
    if(dot){ dot.classList.remove('bg-gray-400'); dot.classList.add('bg-emerald-500','animate-pulse'); }
  });
  socket.on('sync:update', (data)=>{
    const q = Array.isArray(data)? data : [];
    const failed = q.filter(x=>x.sync_status==='FAILED').length;
    if(failed>0) showToast(`⚠️ Sync realtime: ${failed} mục FAILED đang retry tự động`, 'warning');
  });

  // Listen for realtime AUTO-PASS event from server poller
  socket.on('interview:auto_pass', (data)=>{
    showToast(`🎉 [AUTO-PASS REALTIME] Ứng viên "${data.applicantName}" đã tự động PASS phỏng vấn (Hết giờ Google Meet ${data.timeSlot})`, 'success');
    loadApplicants();
    loadInterviews();
  });
}

// Client-side 10-second ticker to update countdowns & PASS button states live
setInterval(() => {
  const active = document.querySelector('.tab-section:not(.hidden)')?.id?.replace('tab-', '');
  if (active === 'interviews' && typeof renderInterviewsTable === 'function' && allInterviewsList && allInterviewsList.length > 0) {
    renderInterviewsTable();
  }
}, 10000);

async function loadBranches(){
  branches = await api('/branches');
  // populate selects already
  const sel = document.getElementById('scheduleWeek');
  if(sel && !sel.value) sel.value = new Date().toISOString().split('T')[0];
  const attDate = document.getElementById('attDate');
  if(attDate && !attDate.value) attDate.value = new Date().toISOString().split('T')[0];
  const reportMonth = document.getElementById('reportMonth');
  if(reportMonth && !reportMonth.value) reportMonth.value = new Date().toISOString().slice(0,7);
}

// Dashboard
let branchChartInstance, testChartInstance, lateChartInstance;
async function loadDashboard(){
  const kpiEl = document.getElementById('kpiGrid');
  try{
    const kpi = await api('/api/dashboard/kpi');
    renderKPI(kpi);
  }catch(e){
    console.error('loadDashboard KPI error:', e);
    if(kpiEl) kpiEl.innerHTML = `<div class="col-span-full bg-red-50 border border-red-200 rounded-2xl p-4 text-center"><div class="font-black text-red-700 text-sm"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi tải Tổng quan: ${e.message}</div><div class="text-xs text-red-600 mt-1">Kiểm tra token/CORS. Thử đăng xuất và đăng nhập lại.</div><button onclick="logout()" class="mt-2 px-4 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold">Đăng nhập lại</button></div>`;
    if(String(e.message).toLowerCase().includes('token') || String(e.message).includes('401') || String(e.message).includes('Unauthorized')){
      if(typeof showToast==='function') showToast('Phiên đăng nhập hết hạn - vui lòng đăng nhập lại','error');
    }
  }
  try{
    const charts = await api('/api/dashboard/charts');
    renderCharts(charts);
  }catch(e){
    console.error('loadDashboard charts error:', e);
    // render fallback without breaking KPI
    ['branchChart','testChart','lateChart'].forEach(id=>{
      const c=document.getElementById(id);
      if(c && c.parentElement) c.parentElement.innerHTML = `<div class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">Không tải được biểu đồ: ${e.message}<br><span class="text-[11px]">Chart.js CDN có thể bị chặn - KPI vẫn hiển thị bình thường</span></div>`;
    });
  }
  try{
    const sync = await api('/api/sync-queue').catch(()=>[]);
    syncQueue = Array.isArray(sync)? sync : sync.syncQueue||[];
    renderDashSync();
  }catch(e){ console.error('syncQueue error',e); renderDashSync(); }
  try{
    const audit = await api('/api/audit-logs').catch(()=>[]);
    auditLogs = Array.isArray(audit)? audit : [];
    renderDashAudit();
  }catch(e){ console.error('audit error',e); renderDashAudit(); }
  try{ updatePendingCount(); }catch(e){ console.error(e); }
  try{ updateModeBadge(); }catch(e){ console.error(e); }
}
function renderKPI(kpi){
  const items = [
    {label:'Ứng viên mới', value:kpi.newApplicants||0, icon:'fa-user-plus', color:'bg-blue-500'},
    {label:'Chờ phỏng vấn', value:kpi.waitingInterview||0, icon:'fa-comments', color:'bg-indigo-500'},
    {label:'Hồ sơ PV Đậu', value:kpi.passedInterview||0, icon:'fa-user-check', color:'bg-emerald-500'},
    {label:'Hồ sơ PV Loại', value:kpi.failedInterview||0, icon:'fa-user-xmark', color:'bg-rose-500'},
    {label:'Chờ chấm Hồ sơ PV', value:kpi.waitingScore||0, icon:'fa-wand-magic-sparkles', color:'bg-purple-600'},
    {label:'Training hiện tại', value:kpi.trainingNow||0, icon:'fa-person-chalkboard', color:'bg-pink-500'},
    {label:'Chờ TEST', value:kpi.waitingTest||0, icon:'fa-clipboard-question', color:'bg-purple-500'},
    {label:'TEST Đầu Ra Đậu', value:kpi.passedTest||0, icon:'fa-award', color:'bg-green-600'},
    {label:'TEST Đầu Ra Loại', value:kpi.failedTest||0, icon:'fa-circle-xmark', color:'bg-red-600'},
    {label:'Chính thức', value:kpi.official||0, icon:'fa-id-badge', color:'bg-teal-600'},
    {label:'Đang làm hôm nay', value:kpi.workingToday||0, icon:'fa-briefcase', color:'bg-cyan-600'},
    {label:'Đi trễ hôm nay', value:kpi.lateToday||0, icon:'fa-stopwatch', color:'bg-amber-500'},
    {label:'Vắng mặt', value:kpi.absent||0, icon:'fa-user-slash', color:'bg-slate-500'},
    {label:'OFF hôm nay', value:kpi.offToday||0, icon:'fa-umbrella-beach', color:'bg-sky-500'},
    {label:'OFF đột xuất', value:kpi.emergencyOff||0, icon:'fa-triangle-exclamation', color:'bg-orange-500'},
    {label:'Phiếu chờ', value:kpi.pendingRequests||0, icon:'fa-hourglass-half', color:'bg-fuchsia-500'},
    {label:'Thiếu Check-out', value:kpi.missingCheckout||0, icon:'fa-right-from-bracket', color:'bg-yellow-600'},
  ];
  document.getElementById('kpiGrid').innerHTML = items.map(it=>`
    <div class="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3 hover:shadow-sm transition">
      <div class="w-10 h-10 rounded-xl ${it.color} text-white flex items-center justify-center text-sm shadow-2xs flex-shrink-0"><i class="fa-solid ${it.icon}"></i></div>
      <div class="min-w-0 flex-1"><div class="text-[11px] font-bold text-slate-500 leading-none truncate">${it.label}</div><div class="text-xl font-black text-slate-800 leading-none mt-1">${it.value}</div></div>
    </div>
  `).join('');
}
function renderCharts(charts){
  if(typeof Chart==='undefined'){
    console.warn('Chart.js not loaded - check CDN');
    ['branchChart','testChart','lateChart'].forEach(id=>{
      const c=document.getElementById(id);
      if(c && c.parentElement) c.parentElement.innerHTML = `<div class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">Chart.js chưa tải (CDN bị chặn)<br><a href="https://cdn.jsdelivr.net/npm/chart.js" target="_blank" class="underline text-blue-600">Kiểm tra CDN</a></div>`;
    });
    return;
  }
  try{
    const ctx1=document.getElementById('branchChart');
    if(ctx1){
      if(branchChartInstance) try{branchChartInstance.destroy();}catch(_){}
      branchChartInstance = new Chart(ctx1, {
        type:'bar',
        data:{labels:(charts.branches||[]).map(b=>b.branch), datasets:[{label:'Nhân sự', data:(charts.branches||[]).map(b=>b.count), backgroundColor:['#f59e0b','#10b981','#3b82f6','#ef4444']}]},
        options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, ticks:{precision:0}}}}
      });
    }
  }catch(e){ console.error('branchChart error',e); }
  try{
    const ctx2=document.getElementById('testChart');
    if(ctx2){
      if(testChartInstance) try{testChartInstance.destroy();}catch(_){}
      testChartInstance = new Chart(ctx2, {
        type:'doughnut',
        data:{labels:['FAILED','CHƯA ĐỦ ĐK','ĐẠT'], datasets:[{data:[(charts.testDist?.failed||0), (charts.testDist?.retake||0), (charts.testDist?.passed||0)], backgroundColor:['#ef4444','#f59e0b','#10b981']}]},
        options:{plugins:{legend:{position:'bottom', labels:{font:{size:10}}}} }
      });
    }
  }catch(e){ console.error('testChart error',e); }
  try{
    const ctx3=document.getElementById('lateChart');
    if(ctx3){
      if(lateChartInstance) try{lateChartInstance.destroy();}catch(_){}
      lateChartInstance = new Chart(ctx3, {
        type:'line',
        data:{labels:(charts.lateMonthly||[]).map(m=> 'T'+m.month), datasets:[{label:'Đi trễ', data:(charts.lateMonthly||[]).map(m=>m.late), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.1)', fill:true, tension:.4}]},
        options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}
      });
    }
  }catch(e){ console.error('lateChart error',e); }
}
function renderDashSync(){
  const el=document.getElementById('dashSync');
  if(!el) return;
  if(syncQueue.length===0) el.innerHTML='<div class="text-xs text-slate-400 text-center py-4">Không có sync queue</div>';
  else el.innerHTML = syncQueue.slice(0,8).map(s=>`
    <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
      <div><div class="text-xs font-bold text-slate-700">${s.entity} • ${s.operation}</div><div class="text-[11px] text-slate-500">${fmtDMYTime(s.updated_at)} • ${s.source}</div></div>
      <span class="text-[11px] font-black px-2 py-1 rounded-full ${s.sync_status==='SYNCED'?'bg-pink-100 text-pink-700':s.sync_status==='PENDING'?'bg-pink-100 text-pink-700':s.sync_status==='FAILED'?'bg-red-100 text-red-700':'bg-purple-100 text-purple-700'}">${s.sync_status}</span>
    </div>
  `).join('');
}
function renderDashAudit(){
  const el=document.getElementById('dashAudit');
  if(!el) return;
  el.innerHTML = auditLogs.slice(0,8).map(l=>`
    <div class="flex gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
      <div class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">${l.actor?.[0]||'S'}</div>
      <div class="flex-1 min-w-0"><div class="text-xs font-bold text-slate-700 truncate">${l.action} • ${l.entity}</div><div class="text-[11px] text-slate-500 truncate">${l.actor} • ${fmtDMYTime(l.timestamp)}</div></div>
    </div>
  `).join('') || '<div class="text-xs text-slate-400 text-center py-4">Chưa có audit</div>';
}

// Applicants
async function loadApplicants(){
  applicants = await api('/api/applicants');
  renderApplicants();
}
function renderApplicants(){
  const tbody=document.getElementById('applicantsTbody');
  if(!tbody) return;
  const q=document.getElementById('searchApplicant')?.value.toLowerCase()||'';
  const f=document.getElementById('filterApplicantStatus')?.value||'';
  let list = applicants.filter(a=>{
    if(f && a.status!==f) return false;
    if(q && !(a.name.toLowerCase().includes(q) || a.phone.includes(q) || (a.email&&a.email.toLowerCase().includes(q)) || (a.hometown&&a.hometown.toLowerCase().includes(q)) || (a.facebook&&a.facebook.toLowerCase().includes(q)))) return false;
    return true;
  });
  tbody.innerHTML = list.map(a=>`
    <tr class="hover:bg-slate-50">
      <td class="px-3 py-3">
        <div class="font-bold text-pink-900 text-sm flex items-center gap-2">${a.name} ${a.gender?`<span class="text-[11px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">${a.gender} • ${a.birthYear||''}</span>`:''}</div>
        <div class="text-xs text-slate-600 flex flex-wrap gap-2 mt-1">
          <span class="bg-white border border-pink-200 px-2 py-0.5 rounded-full"><i class="fa-solid fa-phone text-pink-500"></i> ${a.phone}</span>
          ${a.email?`<span class="bg-white border border-pink-200 px-2 py-0.5 rounded-full">${a.email}</span>`:''}
          ${a.facebook?`<a href="${a.facebook}" target="_blank" class="bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full hover:underline"><i class="fa-brands fa-facebook"></i> FB</a>`:''}
        </div>
        <div class="mt-2 grid grid-cols-2 gap-1 text-[11px]">
          <span class="bg-pink-50 border border-pink-200 rounded-lg px-2 py-1"><b>Quê:</b> ${a.hometown||'—'}</span>
          <span class="bg-pink-50 border border-pink-200 rounded-lg px-2 py-1"><b>Học vấn:</b> ${a.education||'—'}</span>
          <span class="bg-white border border-pink-200 rounded-lg px-2 py-1"><b>Ca:</b> ${a.shiftText||a.shiftPreference||'—'} <span class="text-pink-600">(${a.shiftPreference||''})</span></span>
          <span class="bg-white border border-pink-200 rounded-lg px-2 py-1"><b>KN:</b> ${a.experience||'—'}</span>
        </div>
        <details class="mt-2"><summary class="text-[11px] font-bold text-pink-600 cursor-pointer hover:underline">Chi tiết Form (${a.source||'—'}) + Xử lý đột xuất</summary>
          <div class="mt-1 bg-white border border-pink-200 rounded-xl p-2 text-[11px] space-y-1">
            <div><b>Chi nhánh:</b> ${getBranchDisplay(a.branchPreference)} - ${a.branchText||''}</div>
            <div><b>Biết tin qua:</b> ${a.source||'—'}</div>
            <div><b>Xử lý đột xuất:</b> <span class="italic">${a.handling||'—'}</span></div>
            <div><b>CV tổng hợp:</b> ${a.cvData||'—'}</div>
            <div class="text-[11px] text-slate-500">Nguồn: ${a.source_id||''} • ${fmtDMYTime(a.createdAt)}</div>
          </div>
        </details>
      </td>
      <td class="px-3 py-2 text-center"><span class="text-xs font-bold bg-pink-100 text-pink-700 px-2 py-1 rounded-full border border-pink-200">${getBranchDisplay(a.branchPreference)}</span><div class="text-[11px] text-slate-500 mt-1">${getBranchFull(a.branchPreference)}</div><div class="text-[11px] mt-1 bg-white border border-pink-200 rounded-full px-2 py-0.5">${a.shiftText||a.shiftPreference||''}</div></td>
      <td class="px-3 py-2 text-center">
        ${a.aiScore!=null?`<div class="font-black text-sm ${a.isDisqualified||a.status==='REJECTED'?'text-red-600':a.aiScore>=8?'text-green-600':'text-amber-600'}">${a.aiScore}/14</div><div class="text-[11px] ${a.isDisqualified||a.status==='REJECTED'?'text-red-600 font-bold':'text-slate-500'}">${a.isDisqualified||a.status==='REJECTED'?'BỊ LOẠI THẲNG':(a.aiScore>=8?'ĐẠT MỨC CHUẨN':'DƯỚI CHUẨN')}</div>`:`<span class="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">Chưa chấm</span>`}
        ${a.aiBreakdown?`<details class="mt-1"><summary class="text-[11px] text-blue-600 cursor-pointer">Chi tiết (${a.aiBreakdown.length})</summary><div class="text-[11px] text-left bg-slate-50 p-2 rounded mt-1 space-y-1">${a.aiBreakdown.map(b=>`<div class="flex justify-between"><span class="font-medium">${b.criteria}</span><span class="font-bold">${b.score}/${b.max||1}</span></div><div class="text-[10px] text-slate-500">${b.reason}</div>`).join('')}</div></details>`:''}
      </td>
      <td class="px-3 py-2 text-center">
        ${a.evaluationResult ? `
          <div class="font-black text-sm ${a.evaluationResult==='PASS'?'text-green-600':a.evaluationResult==='CÂN NHẮC ĐẬU'?'text-amber-600':'text-red-600'}">
            ${a.aiScore != null ? a.aiScore + '/13 đ' : '—'}
          </div>
          <div class="text-[11px] font-bold ${a.evaluationResult==='PASS'?'text-green-700':a.evaluationResult==='CÂN NHẮC ĐẬU'?'text-amber-700':'text-red-600'}">
            ${a.evaluationResult==='PASS' ? 'PASS HỒ SƠ PHỎNG VẤN' : a.evaluationResult}
          </div>
        ` : `<span class="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">Chưa chấm PV</span>`}
      </td>
      <td class="px-3 py-2 text-center">
        ${a.status==='REJECTED'||a.isDisqualified?`
          <span class="text-[11px] font-black px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">BỊ LOẠI</span>
          ${a.disqualifications?.length?`<div class="text-[10px] text-red-600 mt-1 font-semibold text-left max-w-[150px] mx-auto">${a.disqualifications.map(d=>`• ${d}`).join('<br>')}</div>`:''}
        `:`
          <span class="text-[11px] font-black px-2 py-1 rounded-full ${a.status==='NEW_APPLICANT'?'bg-blue-100 text-blue-700':a.status==='INTERVIEW'?'bg-purple-100 text-purple-700':a.status==='PASS'?'bg-pink-100 text-pink-700':a.status==='CONVERTED'?'bg-slate-800 text-white':'bg-slate-100 text-slate-600'}">${getStatusVi(a.status)}</span>
        `}
      </td>
      <td class="px-3 py-2">
        <div class="flex flex-wrap gap-1 justify-end">
          <button onclick="viewApplicant('${a.id}')" class="text-[11px] font-bold bg-white border border-pink-200 text-pink-700 px-2 py-1 rounded-lg hover:bg-pink-50"><i class="fa-solid fa-eye"></i> Xem</button>
          ${(a.status==='PASS' || a.status==='CONVERTED') && !a.isDisqualified ? `
            ${a.evaluationResult ? `
              <button disabled class="text-[11px] font-bold bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-not-allowed shadow-none" title="Đã hoàn tất chấm điểm hồ sơ phỏng vấn"><i class="fa-solid fa-lock"></i> Đã Chấm PV</button>
            ` : `
              <button onclick="scoreApplicant('${a.id}')" class="text-[11px] font-bold bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm" title="AI tự động phân tích & chấm điểm 14 tiêu chí hồ sơ"><i class="fa-solid fa-wand-magic-sparkles"></i> Chấm Điểm Hồ Sơ</button>
            `}
          ` : ''}
          ${a.status==='NEW_APPLICANT' && !a.isDisqualified ? `
            <button onclick="openInterviewModal('${a.id}')" class="text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm"><i class="fa-solid fa-calendar-plus"></i> Mời PV</button>
          ` : ''}
          ${a.status === 'PASS' && !a.isDisqualified ? `
            ${(a.evaluationResult || (currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin'))) ? `
              <button onclick="convertApplicant('${a.id}')" class="text-[11px] font-bold bg-pink-500 hover:bg-pink-600 text-white px-2.5 py-1 rounded-lg shadow-sm">→ Training</button>
            ` : ''}
          ` : (a.status === 'INTERVIEW' && !a.isDisqualified ? `
            ${(currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin')) ? `
              <button onclick="convertApplicant('${a.id}')" class="text-[11px] font-bold bg-pink-500 hover:bg-pink-600 text-white px-2.5 py-1 rounded-lg shadow-sm" title="Admin chuyển sang Training">→ Training</button>
            ` : `
              <button disabled class="text-[11px] font-bold bg-slate-100 text-slate-400 border border-slate-200 px-2 py-1 rounded-lg cursor-not-allowed shadow-none" title="Đang trong quá trình Phỏng vấn — Khóa nút Training (Chỉ Admin mới có quyền)"><i class="fa-solid fa-lock text-slate-400"></i> → Training</button>
            `}
          ` : '')}
          <button onclick="deleteApplicant('${a.id}')" class="text-[11px] font-bold bg-white border border-red-200 text-red-600 px-2 py-1 rounded-lg hover:bg-red-50" title="Xóa hồ sơ"><i class="fa-solid fa-trash"></i> Xóa</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="text-center py-8 text-sm text-slate-400">Không có ứng viên - dữ liệu từ Form sẽ đổ về đây realtime</td></tr>`;
}

function viewApplicant(id){
  const a = applicants.find(x=>x.id===id);
  if(!a) return;
  openModal('Hồ sơ ứng viên - ' + a.name, `
    <div class="space-y-3 text-sm">
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-pink-50 border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Họ tên</div><div class="font-black">${a.name}</div><div class="text-xs">${a.gender||''} • ${a.birthYear||''}</div></div>
        <div class="bg-pink-50 border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">SĐT / Zalo</div><div class="font-mono font-bold">${a.phone}</div><div class="text-xs">${a.email||''}</div></div>
        <div class="bg-white border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Quê quán</div><div class="font-bold">${a.hometown||'—'}</div></div>
        <div class="bg-white border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Học vấn</div><div class="font-bold">${a.education||'—'}</div></div>
        <div class="bg-white border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Chi nhánh</div><div class="font-bold">${getBranchFull(a.branchPreference)}</div><div class="text-xs">${a.branchText||''}</div></div>
        <div class="bg-white border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Ca làm</div><div class="font-bold">${a.shiftText||a.shiftPreference||''}</div><div class="text-xs">${a.shiftPreference||''}</div></div>
        <div class="bg-white border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Kinh nghiệm</div><div class="font-bold">${a.experience||'—'}</div></div>
        <div class="bg-white border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Biết tin qua</div><div class="font-bold">${a.source||'—'}</div></div>
        <div class="col-span-2 bg-white border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Xử lý đột xuất</div><div class="italic">${a.handling||'—'}</div></div>
        <div class="col-span-2 bg-white border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">Facebook</div><div class="text-blue-600 break-all">${a.facebook?`<a href="${a.facebook}" target="_blank" class="hover:underline">${a.facebook}</a>`:'—'}</div></div>
        <div class="col-span-2 bg-slate-50 border border-pink-200 rounded-xl p-3"><div class="text-xs font-bold text-pink-700">CV tổng hợp (AI dùng)</div><div class="text-xs">${a.cvData||'—'}</div><div class="text-[11px] text-slate-500 mt-1">Nguồn: ${a.source_id} • ${fmtDMYTime(a.createdAt)}</div></div>
      </div>
      <div class="flex gap-2">
        <button onclick="scoreApplicant('${a.id}'); closeModal();" class="flex-1 bg-purple-600 text-white font-bold py-2 rounded-xl">AI Chấm</button>
        <button onclick="closeModal()" class="flex-1 bg-white border border-pink-200 font-bold py-2 rounded-xl">Đóng</button>
      </div>
    </div>
  `);
}
const RUBRICS = {
  CO_KN: {
    title: 'TIÊU CHÍ LỌC VÒNG PHỎNG VẤN (CÓ KINH NGHIỆM)',
    maxScore: 13,
    questions: [
      {
        id: 'q1',
        title: '1. Quy trình & Kinh nghiệm làm việc cụ thể tại thương hiệu cũ?',
        options: [
          { label: 'Không trả lời được, Không trung thực', score: 0, flag: 'LOẠI' },
          { label: 'Chỉ trả lời qua loa được 1 công việc', score: 1 },
          { label: 'Trả lời rành mạch các bước đã từng làm', score: 2 }
        ]
      },
      {
        id: 'q2',
        title: '2. Lý do vì sao Em nghỉ việc?',
        options: [
          { label: 'Trả lời tiêu cực, phê phán công ty cũ', score: 0, flag: 'LOẠI' },
          { label: 'Trả lời nửa vời, không tích cực, không tiêu cực', score: 1 },
          { label: 'Trả lời theo hướng tích cực, không đổ lỗi', score: 2 }
        ]
      },
      {
        id: 'q3',
        title: '3. Chia sẻ tình huống khó xử ở công ty cũ & cách giải quyết?',
        options: [
          { label: 'Không trả lời được / Trả lời sơ sài', score: 0 },
          { label: 'Trả lời rành mạch', score: 1 }
        ]
      },
      {
        id: 'q4',
        title: '4. (NẾU LÀ SINH VIÊN) Hay tham gia sự kiện tình nguyện, văn nghệ, CLB trường?',
        options: [
          { label: 'Ưu tiên hướng ngoại, Có tham gia', score: 2 },
          { label: 'Không tham gia, hoặc ít nói, thái độ rụt rè', score: 0 }
        ]
      },
      {
        id: 'q5',
        title: '5. (NẾU KHÔNG BẰNG CẤP) Bạn có sở thích gì? (Đi cà phê cùng bạn / Đọc sách...)',
        options: [
          { label: 'Hướng ngoại (thích nơi đông người, cà phê, thể thao đồng đội...)', score: 1 },
          { label: 'Độc lập, yên tĩnh, nội tâm (đọc sách, nghe nhạc, game...)', score: 0, flag: 'LOẠI THẲNG' }
        ]
      },
      {
        id: 'q6',
        title: '6. Ngoại hình, Tác phong?',
        multi: true,
        options: [
          { label: 'Mặt căng, ko chào hỏi', score: 0, flag: 'LOẠI' },
          { label: 'Mặt hiền hậu, vui vẻ, tóc tai gọn gàng', score: 1 },
          { label: 'Giọng nói dễ nghe nhẹ nhàng', score: 1 }
        ]
      },
      {
        id: 'q7',
        title: '7. Khách mua 1 chai làm cách nào Up sale lên được 5 chai?',
        options: [
          { label: 'Không trả lời được / Trả lời sơ sài', score: 0 },
          { label: 'Trả lời chi tiết, cụ thể rõ ràng', score: 1 }
        ]
      },
      {
        id: 'q8',
        title: '8. Vị sữa đó hết hàng, tư vấn thế nào để khách mua vị sữa khác?',
        options: [
          { label: 'Không trả lời được', score: 0 },
          { label: 'Trả lời chi tiết, cụ thể rõ ràng', score: 2 }
        ]
      },
      {
        id: 'q9',
        title: '9. Em có câu thắc mắc gì về công việc không?',
        options: [
          { label: 'Có hỏi thắc mắc hợp lý', score: 1 },
          { label: 'Không hỏi gì hết', score: 0 }
        ]
      }
    ]
  },
  KHONG_KN: {
    title: 'TIÊU CHÍ LỌC VÒNG PHỎNG VẤN (KHÔNG CÓ KINH NGHIỆM)',
    maxScore: 13,
    questions: [
      {
        id: 'q1',
        title: '1. Em hãy tự nhận xét về chính bản thân em có điểm mạnh & điểm yếu gì?',
        options: [
          { label: 'Chỉ trả lời qua loa hoặc kể điểm yếu 1-2 câu & nói điểm mạnh quá nhiều', score: 0, flag: 'LOẠI' },
          { label: 'Chỉ trả lời qua loa', score: 1 },
          { label: 'Trả lời rành mạch, chia sẻ nhiều điểm yếu & cách khắc phục tốt hơn', score: 2 }
        ]
      },
      {
        id: 'q2',
        title: '2. Tình huống bị bạn copy bài rớt môn, thầy cô đổ oan — Em làm gì khi bị đổ oan?',
        options: [
          { label: 'Trả lời tiêu cực, phê phán thầy/cô, người copy', score: 0, flag: 'LOẠI' },
          { label: 'Trả lời nửa vời, không tích cực, không tiêu cực', score: 1 },
          { label: 'Trả lời theo hướng tích cực, không đổ lỗi', score: 2 }
        ]
      },
      {
        id: 'q3',
        title: '3. Chia sẻ tình huống khó xử / bất đồng quan điểm với bạn bè / thầy cô?',
        options: [
          { label: 'Không trả lời được', score: 0 },
          { label: 'Trả lời sơ sài', score: 1 },
          { label: 'Trả lời rành mạch', score: 2 }
        ]
      },
      {
        id: 'q4',
        title: '4. Ngoại hình, Tác phong?',
        multi: true,
        options: [
          { label: 'Mặt căng, ko chào hỏi', score: 0, flag: 'LOẠI' },
          { label: 'Mặt hiền hậu, vui vẻ, tóc tai gọn gàng', score: 1 },
          { label: 'Giọng nói dễ nghe nhẹ nhàng', score: 1 }
        ]
      },
      {
        id: 'q5',
        title: '5. Khách mua 1 chai làm cách nào Up sale lên được 5 chai?',
        options: [
          { label: 'Không trả lời được', score: 0 },
          { label: 'Trả lời sơ sài', score: 1 },
          { label: 'Trả lời chi tiết, cụ thể rõ ràng', score: 2 }
        ]
      },
      {
        id: 'q6',
        title: '6. Vị sữa đó hết hàng, tư vấn thế nào để khách mua vị sữa khác?',
        options: [
          { label: 'Không trả lời được', score: 0 },
          { label: 'Trả lời sơ sài', score: 1 },
          { label: 'Trả lời chi tiết, cụ thể rõ ràng', score: 2 }
        ]
      },
      {
        id: 'q7',
        title: '7. Em có câu thắc mắc gì về công việc không?',
        options: [
          { label: 'Có hỏi thắc mắc hợp lý', score: 1 },
          { label: 'Không hỏi gì hết', score: 0 }
        ]
      }
    ]
  }
};

let currentRubricTab = 'CO_KN';
let currentScoringApplicantId = null;

function scoreApplicant(id) {
  const a = applicants.find(x => x.id === id);
  if (!a) return;
  currentScoringApplicantId = id;

  const expStr = (a.experience || '').toLowerCase();
  const hasExp = expStr && !expStr.includes('chưa') && !expStr.includes('không') && expStr !== '—';
  currentRubricTab = hasExp ? 'CO_KN' : 'KHONG_KN';

  openModal('📋 Đánh Giá & Chấm Điểm Hồ Sơ Phỏng Vấn - ' + a.name, `
    <div class="space-y-4 text-sm max-h-[78vh] overflow-y-auto pr-1">
      
      <div class="bg-pink-50 border border-pink-200 rounded-2xl p-3 flex items-center justify-between">
        <div>
          <div class="font-black text-pink-900 text-base">${a.name}</div>
          <div class="text-xs text-pink-700">${a.gender || ''} • ${a.phone} • Quê: ${a.hometown || '—'}</div>
          <div class="text-xs text-slate-600 mt-0.5"><b>Kinh nghiệm CV:</b> ${a.experience || 'Chưa ghi nhận'}</div>
        </div>
        <button onclick="autoAiTickRubric()" class="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition">
          <i class="fa-solid fa-robot"></i> AI Auto-Tick
        </button>
      </div>

      <div class="flex gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button id="rubricTab-CO_KN" onclick="switchRubricTab('CO_KN')" class="flex-1 py-2 rounded-xl text-xs font-black transition">
          📊 CÓ KINH NGHIỆM
        </button>
        <button id="rubricTab-KHONG_KN" onclick="switchRubricTab('KHONG_KN')" class="flex-1 py-2 rounded-xl text-xs font-black transition">
          🌱 KHÔNG CÓ KINH NGHIỆM
        </button>
      </div>

      <div id="rubricQuestionsContainer" class="space-y-3"></div>

      <div class="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-4 space-y-2 border border-slate-700 shadow-md">
        <div class="flex items-center justify-between">
          <div class="text-xs font-bold text-slate-300">TỔNG ĐIỂM TIÊU CHÍ</div>
          <div class="font-mono font-black text-2xl text-yellow-300"><span id="rubricTotalScore">0</span> / 13 đ</div>
        </div>
        <div class="flex items-center justify-between border-t border-slate-800 pt-2">
          <div class="text-xs font-bold text-slate-300">XẾP LOẠI ĐÁNH GIÁ</div>
          <div id="rubricResultBadge" class="font-black text-xs px-3 py-1 rounded-full bg-slate-700 text-slate-200">CHƯA TÍCK</div>
        </div>
        <div class="text-[11px] text-slate-400 border-t border-slate-800/80 pt-1 flex justify-between">
          <span>• PASS: 12-13đ</span>
          <span>• CÂN NHẮC ĐẬU: 10-11đ</span>
          <span>• FAIL: &lt;10đ hoặc LOẠI</span>
        </div>
      </div>

      <div>
        <label class="text-xs font-bold text-slate-700 block mb-1">NHẬN XÉT CỦA HR / AI:</label>
        <textarea id="rubricNotes" rows="2" placeholder="Nhập ghi chú nhận xét bổ sung..." class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-pink-500 outline-none"></textarea>
      </div>

      <div class="flex gap-2">
        <button onclick="submitRubricEvaluation()" class="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-black py-3 rounded-xl shadow transition">
          💾 Lưu Kết Quả Chấm Điểm
        </button>
        <button onclick="closeModal()" class="px-5 bg-white border border-slate-200 font-bold py-3 rounded-xl text-slate-700 hover:bg-slate-50 transition">Đóng</button>
      </div>

    </div>
  `);

  renderRubricQuestions();
}

function switchRubricTab(tab) {
  currentRubricTab = tab;
  renderRubricQuestions();
}

function renderRubricQuestions() {
  const btnCo = document.getElementById('rubricTab-CO_KN');
  const btnKhong = document.getElementById('rubricTab-KHONG_KN');
  if (btnCo && btnKhong) {
    if (currentRubricTab === 'CO_KN') {
      btnCo.className = 'flex-1 py-2 rounded-xl text-xs font-black transition bg-white text-pink-700 shadow-sm border border-pink-200';
      btnKhong.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-slate-500 hover:text-slate-700';
    } else {
      btnKhong.className = 'flex-1 py-2 rounded-xl text-xs font-black transition bg-white text-purple-700 shadow-sm border border-purple-200';
      btnCo.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-slate-500 hover:text-slate-700';
    }
  }

  const container = document.getElementById('rubricQuestionsContainer');
  if (!container) return;

  const data = RUBRICS[currentRubricTab];
  container.innerHTML = data.questions.map((q) => `
    <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
      <div class="font-bold text-slate-800 text-xs mb-2 flex items-center justify-between">
        <span>${q.title}</span>
        ${q.multi ? '<span class="text-[10px] text-purple-600 font-semibold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">Chọn 1 hoặc nhiều</span>' : ''}
      </div>
      <div class="space-y-1.5 rubric-q-group">
        ${q.options.map((opt) => `
          <label class="flex items-start gap-2 text-xs p-2 rounded-lg border border-slate-100 hover:bg-pink-50/50 cursor-pointer transition">
            <input type="${q.multi ? 'checkbox' : 'radio'}" name="q_${currentRubricTab}_${q.id}" value="${opt.score}" data-flag="${opt.flag || ''}" data-label="${opt.label.replace(/"/g,'&quot;')}" onchange="recalculateRubricScore()" class="mt-0.5 text-pink-600 focus:ring-pink-500">
            <div class="flex-1">
              <span class="text-slate-700">${opt.label}</span>
              ${opt.flag ? `<span class="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded ${opt.flag==='LOẠI THẲNG'?'bg-red-600 text-white':'bg-red-100 text-red-700'}">${opt.flag}</span>` : `<span class="ml-1.5 text-[10px] font-bold text-slate-400">(+${opt.score}đ)</span>`}
            </div>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');

  recalculateRubricScore();
}

function recalculateRubricScore() {
  const container = document.getElementById('rubricQuestionsContainer');
  if (!container) return;

  const inputs = container.querySelectorAll('input:checked');
  let total = 0;
  let isLoai = false;
  let loaiReason = '';

  inputs.forEach(inp => {
    const score = parseInt(inp.value) || 0;
    total += score;
    const flag = inp.getAttribute('data-flag');
    if (flag === 'LOẠI' || flag === 'LOẠI THẲNG') {
      isLoai = true;
      loaiReason = flag;
    }
  });

  const totalEl = document.getElementById('rubricTotalScore');
  const badgeEl = document.getElementById('rubricResultBadge');

  if (totalEl) totalEl.textContent = total;

  if (badgeEl) {
    if (isLoai) {
      badgeEl.className = 'font-black text-xs px-3 py-1 rounded-full bg-red-600 text-white animate-pulse';
      badgeEl.textContent = `🔴 LOẠI (${loaiReason})`;
    } else if (inputs.length === 0) {
      badgeEl.className = 'font-black text-xs px-3 py-1 rounded-full bg-slate-700 text-slate-200';
      badgeEl.textContent = 'CHƯA TÍCK';
    } else if (total >= 12) {
      badgeEl.className = 'font-black text-xs px-3 py-1 rounded-full bg-green-500 text-white';
      badgeEl.textContent = '🟢 PASS (12-13đ)';
    } else if (total >= 10) {
      badgeEl.className = 'font-black text-xs px-3 py-1 rounded-full bg-amber-500 text-white';
      badgeEl.textContent = '🟡 CÂN NHẮC ĐẬU (10-11đ)';
    } else {
      badgeEl.className = 'font-black text-xs px-3 py-1 rounded-full bg-red-500 text-white';
      badgeEl.textContent = '🔴 FAIL (DƯỚI 10Đ)';
    }
  }
}

function autoAiTickRubric() {
  const container = document.getElementById('rubricQuestionsContainer');
  if (!container) return;

  const qGroups = container.querySelectorAll('.rubric-q-group');
  qGroups.forEach(group => {
    const radios = group.querySelectorAll('input[type="radio"]');
    const checkboxes = group.querySelectorAll('input[type="checkbox"]');

    if (radios.length > 0) {
      let best = null;
      radios.forEach(r => {
        if (!r.getAttribute('data-flag')) best = r;
      });
      if (best) best.checked = true;
    }

    if (checkboxes.length > 0) {
      checkboxes.forEach(cb => {
        if (!cb.getAttribute('data-flag')) cb.checked = true;
      });
    }
  });

  recalculateRubricScore();
  showToast('✨ AI đã tự động tick chọn tiêu chí phù hợp!', 'success');
}

async function submitRubricEvaluation() {
  if (!currentScoringApplicantId) return;

  const container = document.getElementById('rubricQuestionsContainer');
  const inputs = container ? container.querySelectorAll('input:checked') : [];
  
  let total = 0;
  let isLoai = false;
  const breakdown = [];

  inputs.forEach(inp => {
    const score = parseInt(inp.value) || 0;
    total += score;
    const flag = inp.getAttribute('data-flag');
    if (flag === 'LOẠI' || flag === 'LOẠI THẲNG') isLoai = true;
    breakdown.push({
      criteria: inp.getAttribute('data-label'),
      score: score,
      flag: flag || ''
    });
  });

  let evaluationResult = 'FAIL';
  if (isLoai) evaluationResult = 'LOẠI';
  else if (total >= 12) evaluationResult = 'PASS';
  else if (total >= 10) evaluationResult = 'CÂN NHẮC ĐẬU';

  const notes = document.getElementById('rubricNotes')?.value || '';

  try {
    showToast('⏳ Đang lưu kết quả chấm điểm...', 'info');
    await api('/api/applicants/' + currentScoringApplicantId + '/score', {
      method: 'POST',
      body: JSON.stringify({
        score: total,
        aiScore: total,
        evaluationType: currentRubricTab,
        evaluationResult: evaluationResult,
        isDisqualified: isLoai,
        notes: notes,
        breakdown: breakdown
      }),
      headers: { Authorization: 'Bearer ' + token }
    });

    closeModal();
    loadApplicants();
    showToast(`✅ Đã lưu kết quả chấm điểm: ${total}/13đ - ${evaluationResult}`, 'success');
  } catch (err) {
    showToast(err.message || 'Lỗi khi lưu kết quả', 'error');
  }
}
async function updateApplicantStatus(id,status){
  await api('/api/applicants/'+id+'/status', {method:'POST', body:JSON.stringify({status}), headers:{Authorization:'Bearer '+token}});
  loadApplicants();
  showToast('Cập nhật trạng thái: '+status,'success');
}
let selectedInterviewSlot = null;
let currentInterviewApplicantId = null;

const TIME_SLOTS_30MIN = [
  '08:00 - 08:30', '08:30 - 09:00', '09:00 - 09:30', '09:30 - 10:00',
  '10:00 - 10:30', '10:30 - 11:00', '11:00 - 11:30',
  '13:30 - 14:00', '14:00 - 14:30', '14:30 - 15:00', '15:00 - 15:30',
  '15:30 - 16:00', '16:00 - 16:30', '16:30 - 17:00'
];

async function openInterviewModal(applicantId) {
  const a = applicants.find(x => x.id === applicantId);
  if (!a) return;
  if (a.isDisqualified || a.status === 'REJECTED') {
    return showToast('Ứng viên thuộc diện LOẠI THẲNG, không được mời PV', 'error');
  }

  currentInterviewApplicantId = applicantId;
  selectedInterviewSlot = null;

  // Fetch all booked interviews from server
  const allInterviews = await api('/api/interviews');

  // Default to tomorrow YYYY-MM-DD
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDateStr = tomorrow.toISOString().split('T')[0];

  const defaultMeetLink = `https://meet.google.com/umb-pv-${Math.random().toString(36).substring(2,8)}`;

  openModal(`Xếp lịch Phỏng vấn & Khóa ca 30' — ${a.name}`, `
    <div class="space-y-4 text-sm">
      <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
        <div>
          <div class="font-black text-indigo-900">${a.name} (${a.phone})</div>
          <div class="text-xs text-indigo-700">CN mong muốn: <b>${getBranchFull(a.branchPreference)}</b></div>
        </div>
        <span class="text-xs font-bold bg-indigo-600 text-white px-3 py-1 rounded-full">AI: ${a.aiScore}/14 điểm</span>
      </div>

      <div>
        <label class="text-xs font-bold text-slate-700 flex items-center gap-1"><i class="fa-solid fa-calendar text-pink-500"></i> Chọn Ngày Phỏng Vấn:</label>
        <input id="invDate" type="date" value="${defaultDateStr}" min="${new Date().toISOString().split('T')[0]}" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-pink-200 outline-none" onchange="renderInterviewTimeGrid('${applicantId}')">
      </div>

      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="text-xs font-bold text-slate-700 flex items-center gap-1"><i class="fa-solid fa-clock text-pink-500"></i> Chọn Khung Giờ Phỏng Vấn (Cách nhau 30 phút):</label>
          <span class="text-[11px] text-slate-500"><i class="fa-solid fa-lock text-red-500"></i> Nút đỏ là đã bị KHÓA</span>
        </div>
        <div id="interviewSlotsGrid" class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 max-h-[220px] overflow-auto p-1 scrollbar-thin">
          <!-- Rendered dynamically -->
        </div>
      </div>

      <div>
        <label class="text-xs font-bold text-slate-700 flex items-center gap-1"><i class="fa-solid fa-video text-blue-500"></i> Link Google Meet Phỏng Vấn:</label>
        <input id="invMeetLink" value="${defaultMeetLink}" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono text-blue-700 font-bold focus:ring-2 focus:ring-blue-200 outline-none">
      </div>

      <div class="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-800 flex items-center gap-2">
        <i class="fa-solid fa-bell text-amber-600 text-base"></i>
        <div><b>Tự động nhắc nhở 30 phút:</b> Hệ thống sẽ tự động phát âm thanh cảnh báo tới HR và gửi tin nhắn Zalo cho ứng viên trước giờ PV 30 phút.</div>
      </div>

      <div class="flex gap-2 pt-2">
        <button onclick="confirmScheduleInterview('${applicantId}')" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-xl shadow transition flex items-center justify-center gap-2"><i class="fa-solid fa-check-circle"></i> XÁC NHẬN MỜI PV & KHÓA LỊCH</button>
        <button onclick="closeModal()" class="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl">Hủy</button>
      </div>
    </div>
  `);

  window.currentInterviewList = allInterviews;
  renderInterviewTimeGrid(applicantId);
}

function renderInterviewTimeGrid(applicantId) {
  const dateVal = document.getElementById('invDate')?.value;
  const grid = document.getElementById('interviewSlotsGrid');
  if (!grid || !dateVal) return;

  const allInterviews = window.currentInterviewList || [];

  grid.innerHTML = TIME_SLOTS_30MIN.map(slot => {
    const slotKey = `${dateVal}_${slot}`;
    const booked = allInterviews.find(i => i.slotKey === slotKey && i.status !== 'CANCELLED' && i.applicantId !== applicantId);

    if (booked) {
      // Locked slot: Show red warning alert when clicked!
      return `
        <button type="button" class="p-2 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex flex-col items-start justify-center cursor-not-allowed opacity-80" onclick="alert('⚠️ KHUNG GIỜ ĐÃ ĐƯỢC KHÓA!\\nKhung giờ ${slot} ngày ${dateVal} đã được đặt lịch phỏng vấn cho ứng viên: \"${booked.applicantName}\".\\n\\nVui lòng chọn khung giờ khác.')">
          <span class="flex items-center gap-1"><i class="fa-solid fa-lock text-red-500"></i> ${slot}</span>
          <span class="text-[10px] text-red-600 font-black truncate max-w-full">🔒 ĐÃ ĐẶT (${booked.applicantName})</span>
        </button>
      `;
    } else {
      const isSelected = selectedInterviewSlot === slot;
      return `
        <button type="button" class="p-2 rounded-xl ${isSelected ? 'bg-indigo-600 text-white border-2 border-indigo-700 shadow-md font-black' : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 font-bold'} text-xs flex flex-col items-start justify-center transition" onclick="selectInterviewSlot('${slot}')">
          <span class="flex items-center gap-1">${isSelected ? '<i class="fa-solid fa-check-circle"></i>' : '<i class="fa-regular fa-clock"></i>'} ${slot}</span>
          <span class="text-[10px] ${isSelected ? 'text-indigo-100' : 'text-green-600'} font-bold">${isSelected ? '✓ Đã chọn' : '🟢 Trống'}</span>
        </button>
      `;
    }
  }).join('');
}

function selectInterviewSlot(slot) {
  selectedInterviewSlot = slot;
  if (currentInterviewApplicantId) renderInterviewTimeGrid(currentInterviewApplicantId);
}

async function confirmScheduleInterview(applicantId) {
  const interviewDate = document.getElementById('invDate')?.value;
  const meetLink = document.getElementById('invMeetLink')?.value;

  if (!interviewDate) return showToast('Vui lòng chọn ngày phỏng vấn', 'error');
  if (!selectedInterviewSlot) return showToast('Vui lòng chọn khung giờ phỏng vấn (30 phút)', 'error');

  try {
    const res = await api(`/api/applicants/${applicantId}/schedule-interview`, {
      method: 'POST',
      body: JSON.stringify({
        interviewDate,
        timeSlot: selectedInterviewSlot,
        meetLink
      }),
      headers: { Authorization: 'Bearer ' + token }
    });

    closeModal();
    showToast(`Đã mời PV & khóa lịch ${selectedInterviewSlot} ngày ${interviewDate}!`, 'success');
    loadApplicants();
    if (document.getElementById('tab-interviews') && !document.getElementById('tab-interviews').classList.contains('hidden')) {
      loadInterviews();
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

let allInterviewsList = [];

async function loadInterviews() {
  try {
    allInterviewsList = await api('/api/interviews');
  } catch (e) {
    console.error('loadInterviews API error:', e);
    showToast('Lỗi tải danh sách lịch phỏng vấn: ' + (e.message || 'Lỗi kết nối'), 'error');
    return;
  }

  try {
    renderInterviewsTable();
  } catch (e) {
    console.error('renderInterviewsTable UI error:', e);
  }
}

function renderInterviewsTable() {
  const tbody = document.getElementById('interviewsTbody');
  const countBadge = document.getElementById('interviewCountBadge');
  if (!tbody) return;

  const search = (document.getElementById('searchInterview')?.value || '').toLowerCase();
  const filterDate = document.getElementById('filterInterviewDate')?.value;
  const filterBranch = document.getElementById('filterInterviewBranch')?.value;

  let list = (allInterviewsList || []).filter(inv => inv && inv.status !== 'CANCELLED');

  if (search) {
    list = list.filter(inv =>
      (inv.applicantName || '').toLowerCase().includes(search) ||
      (inv.applicantPhone || '').includes(search) ||
      (inv.meetLink || '').toLowerCase().includes(search)
    );
  }

  if (filterDate) {
    list = list.filter(inv => inv.interviewDate === filterDate);
  }

  if (filterBranch) {
    list = list.filter(inv => inv.branchPreference === filterBranch);
  }

  if (countBadge) {
    countBadge.textContent = `${list.length} Lịch phỏng vấn`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-slate-400">
          <div class="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-2 text-xl"><i class="fa-solid fa-calendar-xmark"></i></div>
          <div class="font-bold text-sm text-slate-600">Chưa có lịch phỏng vấn nào được xếp</div>
          <div class="text-xs text-slate-400 mt-1">Bấm nút "Mời PV" bên tab Nhân viên mới để đặt lịch & tạo link Meet</div>
        </td>
      </tr>
    `;
    return;
  }

  const appList = (typeof applicants !== 'undefined' && Array.isArray(applicants)) ? applicants : [];

  tbody.innerHTML = list.map(inv => {
    const appRec = appList.find(a => a && a.id === inv.applicantId) || {};
    const meetUrl = inv.meetLink || '#';
    const timeState = getInterviewTimeState(inv);
    const isAdmin = currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin');
    const isPassed = appRec.status === 'PASS' || appRec.status === 'CONVERTED' || inv.status === 'COMPLETED' || inv.autoPassTriggered;

    // Meet link & Vào Meet button logic
    let meetLinkHtml = '';
    let vaoMeetBtn = '';

    if (isPassed) {
      // Once PASS is marked, Meet room is CLOSED immediately for everyone
      meetLinkHtml = `
        <span class="text-xs font-mono font-medium text-slate-400 truncate max-w-[200px] flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg" title="Đã duyệt PASS phỏng vấn — Link Meet đã đóng">
          <i class="fa-solid fa-lock text-slate-400"></i> ${meetUrl}
        </span>`;

      vaoMeetBtn = `
        <button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-not-allowed shadow-none" title="Đã duyệt PASS phỏng vấn — Nút Vào Meet đã khóa hoàn toàn">
          <i class="fa-solid fa-video-slash"></i> Đã Khóa Meet (PASS)
        </button>`;
    } else if (isAdmin || timeState === 'during') {
      meetLinkHtml = `
        <a href="${meetUrl}" target="_blank" class="text-xs font-mono font-bold text-blue-600 hover:underline truncate max-w-[200px] flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">
          <i class="fa-solid fa-video text-blue-500"></i> ${meetUrl}
        </a>
        <button onclick="navigator.clipboard.writeText('${meetUrl}'); showToast('Đã copy link Meet!', 'success')" class="text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-2 py-1 rounded-lg" title="Copy link Meet">
          <i class="fa-solid fa-copy"></i>
        </button>`;

      vaoMeetBtn = `
        <a href="${meetUrl}" target="_blank" class="text-xs font-bold ${timeState === 'during' ? 'bg-blue-600 hover:bg-blue-700 animate-pulse' : 'bg-blue-700 hover:bg-blue-800'} text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm">
          <i class="fa-solid fa-video"></i> Vào Meet ${isAdmin && timeState !== 'during' ? '(Admin)' : ''}
        </a>`;
    } else if (timeState === 'before') {
      meetLinkHtml = `
        <span class="text-xs font-mono font-medium text-slate-400 truncate max-w-[200px] flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg" title="Link Meet bị khóa cho tài khoản này — Kích hoạt trước 10 phút & trong giờ PV">
          <i class="fa-solid fa-lock text-slate-400"></i> ${meetUrl}
        </span>`;

      vaoMeetBtn = `
        <button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-not-allowed" title="Nút Vào Meet bị khóa: Mở trước giờ PV 10 phút">
          <i class="fa-solid fa-video-slash"></i> Chưa đến giờ Meet
        </button>`;
    } else {
      meetLinkHtml = `
        <span class="text-xs font-mono font-medium text-slate-400 truncate max-w-[200px] flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
          <i class="fa-solid fa-video text-slate-400"></i> ${meetUrl}
        </span>`;

      vaoMeetBtn = `
        <button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-not-allowed" title="Buổi phỏng vấn đã kết thúc">
          <i class="fa-solid fa-video-slash"></i> Hết giờ Meet
        </button>`;
    }

    // PASS button logic based on user role and time window
    let passBtn = '';
    if (isPassed) {
      passBtn = `<span class="text-[11px] font-black bg-green-100 text-green-700 border border-green-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1"><i class="fa-solid fa-check-double"></i> ĐÃ PASS</span>`;
    } else if (timeState === 'during') {
      passBtn = `
        <button onclick="updateApplicantStatus('${inv.applicantId}','PASS'); loadInterviews();" 
          class="text-xs font-black bg-green-500 hover:bg-green-600 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm animate-pulse" 
          title="Google Meet đang diễn ra — Click PASS để xác nhận">
          <i class="fa-solid fa-circle-check"></i> PASS
        </button>`;
    } else {
      if (isAdmin) {
        passBtn = `
          <button onclick="updateApplicantStatus('${inv.applicantId}','PASS'); loadInterviews();" 
            class="text-xs font-bold bg-pink-500 hover:bg-pink-600 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm"
            title="Quyền Admin Toàn Năng: Có thể duyệt PASS bất kể khung giờ">
            <i class="fa-solid fa-user-shield"></i> PASS (Admin)
          </button>`;
      } else {
        const countdown = getInterviewCountdown(inv);
        passBtn = `<span class="text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1" title="Tài khoản này bị ràng buộc: Chỉ mở nút PASS khi Google Meet bắt đầu"><i class="fa-solid fa-clock"></i> ${countdown}</span>`;
      }
    }

    return `
      <tr class="hover:bg-indigo-50/40 transition" id="inv-row-${inv.id}">
        <td class="px-3 py-3 font-bold text-slate-800">
          <div class="flex items-center gap-1.5 text-indigo-900">
            <i class="fa-solid fa-calendar-day text-pink-500"></i> ${fmtDMY(inv.interviewDate)}
          </div>
          <div class="text-xs font-black text-indigo-600 mt-0.5 flex items-center gap-1">
            <i class="fa-solid fa-clock text-indigo-500"></i> ${inv.timeSlot}
          </div>
          ${timeState === 'during' ? '<div class="text-[10px] font-black text-green-600 mt-0.5 flex items-center gap-1 animate-pulse"><span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span> ĐANG DIỄN RA</div>' : ''}
          ${timeState === 'after' || isPassed ? '<div class="text-[10px] font-bold text-slate-400 mt-0.5">Đã kết thúc</div>' : ''}
        </td>
        <td class="px-3 py-3">
          <div class="font-black text-slate-800">${inv.applicantName}</div>
          <div class="text-xs font-mono text-slate-500"><i class="fa-solid fa-phone text-slate-400"></i> ${inv.applicantPhone}</div>
        </td>
        <td class="px-3 py-3">
          <div class="font-bold text-slate-700 text-xs">${getBranchFull(inv.branchPreference)}</div>
          <div class="text-[11px] text-slate-500">${appRec.shiftText || appRec.shiftPreference || ''}</div>
        </td>
        <td class="px-3 py-3">
          <div class="flex items-center gap-1.5">
            ${meetLinkHtml}
          </div>
        </td>
        <td class="px-3 py-3 text-center">
          ${appRec.evaluationResult ? `
            <div class="font-black text-sm ${appRec.evaluationResult==='PASS'?'text-green-600':appRec.evaluationResult==='CÂN NHẮC ĐẬU'?'text-amber-600':'text-red-600'}">
              ${appRec.aiScore != null ? appRec.aiScore + '/13 đ' : (appRec.score != null ? appRec.score + '/13 đ' : '—')}
            </div>
            <div class="text-[11px] font-bold ${appRec.evaluationResult==='PASS'?'text-green-700':appRec.evaluationResult==='CÂN NHẮC ĐẬU'?'text-amber-700':'text-red-600'}">
              ${appRec.evaluationResult==='PASS' ? 'PASS HỒ SƠ PHỎNG VẤN' : appRec.evaluationResult}
            </div>
          ` : (appRec.aiScore != null ? `
            <div class="font-black text-sm text-green-600">${appRec.aiScore}/13 đ</div>
            <div class="text-[11px] font-bold text-green-700">PASS HỒ SƠ PHỎNG VẤN</div>
          ` : `<span class="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">Chưa chấm PV</span>`)}
        </td>
        <td class="px-3 py-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${isPassed ? `
              <button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-not-allowed shadow-none" title="Đã PASS phỏng vấn — Khóa nút Thư Mời">
                <i class="fa-solid fa-copy"></i> Thư Mời
              </button>
              <button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-not-allowed shadow-none" title="Đã PASS phỏng vấn — Khóa nút Zalo UV">
                <i class="fa-solid fa-comment-dots"></i> Zalo UV
              </button>
            ` : `
              <button onclick="copyInterviewInviteMessage('${inv.applicantId}')" class="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm" title="Copy toàn bộ mẫu Thư mời phỏng vấn để dán gửi Zalo/SMS">
                <i class="fa-solid fa-copy"></i> Thư Mời
              </button>
              <a href="https://zalo.me/${inv.applicantPhone}" target="_blank" class="text-xs font-bold bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm" title="Mở Zalo nhắn tin trực tiếp với ứng viên">
                <i class="fa-solid fa-comment-dots"></i> Zalo UV
              </a>
            `}
            ${vaoMeetBtn}
            ${passBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Helper: parse timeSlot "8:30 - 9:00" + interviewDate "2026-08-30" → 'before'|'during'|'after'
// Allows 10 minutes prior grace period for entering Meet
function getInterviewTimeState(inv) {
  try {
    if (!inv || !inv.timeSlot || !inv.interviewDate) return 'before';
    const parts = (inv.timeSlot || '').split('-');
    if (parts.length < 2) return 'before';
    const startParts = parts[0].trim().split(':');
    const endParts = parts[1].trim().split(':');
    if (startParts.length < 2 || endParts.length < 2) return 'before';
    const startH = parseInt(startParts[0]), startM = parseInt(startParts[1]);
    const endH = parseInt(endParts[0]), endM = parseInt(endParts[1]);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 'before';

    const now = new Date();
    const start = new Date(inv.interviewDate); start.setHours(startH, startM, 0, 0);
    const startWithGrace = new Date(start.getTime() - 10 * 60 * 1000); // 10 mins prior entry allowed
    const end = new Date(inv.interviewDate); end.setHours(endH, endM, 0, 0);
    if (now >= end) return 'after';
    if (now >= startWithGrace) return 'during';
    return 'before';
  } catch { return 'before'; }
}

// Helper: returns human countdown string until interview starts
function getInterviewCountdown(inv) {
  try {
    const parts = (inv.timeSlot || '').split('-');
    const [startH, startM] = parts[0].trim().split(':').map(Number);
    const start = new Date(inv.interviewDate); start.setHours(startH, startM, 0, 0);
    const diffMs = start - new Date();
    if (diffMs <= 0) return 'Sắp bắt đầu';
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    if (diffH > 0) return `Còn ${diffH}h${remMin > 0 ? remMin + 'p' : ''}`;
    return `Còn ${diffMin} phút`;
  } catch { return '...'; }
}

function copyInterviewInviteMessage(applicantId) {
  const inv = (allInterviewsList || []).find(i => i.applicantId === applicantId);
  if (!inv) return showToast('Không tìm thấy thông tin lịch phỏng vấn', 'error');

  const appRec = applicants.find(a => a.id === applicantId) || {};
  const meetUrl = inv.meetLink || '';
  const branchName = getBranchFull(inv.branchPreference);

  const inviteMsg = `[ỤM BÒ MILK - THƯ MỜI PHỎNG VẤN TRỰC TUYẾN]\n\nChào bạn ${inv.applicantName},\nChúc mừng bạn đã vượt qua vòng sơ tuyển hồ sơ AI của Ụm Bò Milk!\n\n📅 Thời gian: ${inv.timeSlot} ngày ${fmtDMY(inv.interviewDate)}\n🏢 Chi nhánh ứng tuyển: ${branchName}\n🎥 Link Google Meet phỏng vấn: ${meetUrl}\n\nBạn vui lòng chuẩn bị trang phục lịch sự và truy cập vào đường link Google Meet trên trước 5 phút nhé!\nNếu cần hỗ trợ gấp, vui lòng phản hồi lại tin nhắn này. Trân trọng!`;

  navigator.clipboard.writeText(inviteMsg);
  showToast(`Đã copy Thư mời PV cho ${inv.applicantName}! Bạn có thể dán (Ctrl+V) gửi ngay qua Zalo/SMS/Email.`, 'success');
}

async function createCalendar(id){
  await updateApplicantStatus(id,'PASS');
  showToast('Đã tạo Calendar Event + Google Meet + gửi Zalo','success');
}
function convertApplicant(id) {
  const a = applicants.find(x => x.id === id);
  if (!a) return;

  const isAdmin = currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin');
  if (a.status === 'INTERVIEW' && !isAdmin) {
    return showToast('Đang trong quá trình Phỏng vấn — Khóa nút Training (Chỉ tài khoản Admin mới có quyền)', 'error');
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  let defaultShift = a.shiftPreference || a.shiftText || 'CA_TRUA';
  if (SHIFT_MAP[defaultShift]) defaultShift = SHIFT_MAP[defaultShift];

  const defaultBranch = a.branchPreference || 'CN2';

  const bList = (typeof branches !== 'undefined' && Array.isArray(branches) && branches.length > 0) ? branches : [];
  const branchOptionsHtml = bList.map(b => 
    `<option value="${b.id}" ${b.id === defaultBranch ? 'selected' : ''}>${b.id} - ${b.name}</option>`
  ).join('') || `<option value="CN2">CN2 - 261 Tô Hiến Thành</option>`;

  openModal('🗓️ XÁC NHẬN CHUYỂN TRAINING & XẾP LỊCH BẮT ĐẦU', `
    <div class="space-y-4">
      <div class="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-4 text-white">
        <div class="font-black text-base flex items-center gap-2">
          <i class="fa-solid fa-user-check"></i> ${a.name}
        </div>
        <div class="text-xs opacity-90 mt-1">SĐT: ${a.phone} • Chi nhánh: ${getBranchFull(defaultBranch)}</div>
      </div>

      <div class="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-900 space-y-1">
        <div class="font-bold flex items-center gap-1.5 text-purple-700">
          <i class="fa-solid fa-wand-magic-sparkles"></i> AI Tự Động Quản Lý & Phân Công:
        </div>
        <div>• Tự động xếp lịch làm việc chi tiết vào <b>Tab Lịch làm việc</b> theo khung ngày chọn.</div>
        <div>• Tự động tạo Mã NV & Key đăng nhập cho Nhân viên thực hiện <b>Chấm công AI</b> trên Web App.</div>
      </div>

      <div class="space-y-3 bg-white border border-pink-200 rounded-2xl p-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            <i class="fa-solid fa-calendar-day text-pink-500"></i> Ngày Bắt Đầu Training:
          </label>
          <input type="date" id="convertStartDateInput" value="${todayStr}" class="w-full px-3 py-2.5 rounded-xl border border-pink-200 text-sm font-bold text-slate-800 outline-none focus:border-pink-500">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            <i class="fa-solid fa-clock-rotate-left text-pink-500"></i> Thời Gian / Số Ngày Thử Việc:
          </label>
          <select id="convertDurationInput" class="w-full px-3 py-2.5 rounded-xl border border-pink-200 text-sm font-bold text-slate-800 outline-none focus:border-pink-500">
            <option value="12" selected>12 Ngày Thử Việc (7 Ngày Làm + 5 Ngày OFF)</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <i class="fa-solid fa-business-time text-pink-500"></i> Ca Làm Việc:
            </label>
            <select id="convertShiftInput" class="w-full px-3 py-2 rounded-xl border border-pink-200 text-sm font-bold text-slate-800">
              <option value="CA_SANG" ${defaultShift === 'CA_SANG' ? 'selected' : ''}>CA SÁNG (06h - 12h)</option>
              <option value="CA_TRUA" ${defaultShift === 'CA_TRUA' ? 'selected' : ''}>CA TRƯA (12h - 18h)</option>
              <option value="CA_TOI" ${defaultShift === 'CA_TOI' ? 'selected' : ''}>CA TỐI (18h - 23h)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <i class="fa-solid fa-store text-pink-500"></i> Chi Nhánh:
            </label>
            <select id="convertBranchInput" class="w-full px-3 py-2 rounded-xl border border-pink-200 text-sm font-bold text-slate-800">
              ${branchOptionsHtml}
            </select>
          </div>
        </div>
      </div>

      <div class="flex gap-2">
        <button onclick="closeModal()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition">
          Hủy
        </button>
        <button onclick="confirmConvertApplicant('${id}')" class="flex-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-black py-3 rounded-xl shadow-md transition flex items-center justify-center gap-2">
          <i class="fa-solid fa-calendar-check"></i> Xác Nhận Training & Tạo Lịch
        </button>
      </div>
    </div>
  `);
}

async function confirmConvertApplicant(id) {
  const startDate = document.getElementById('convertStartDateInput')?.value;
  const trainingDays = document.getElementById('convertDurationInput')?.value;
  const shift = document.getElementById('convertShiftInput')?.value;
  const branchId = document.getElementById('convertBranchInput')?.value;

  if (!startDate) {
    showToast('⚠️ Vui lòng chọn ngày bắt đầu training', 'error');
    return;
  }

  showToast('⏳ AI đang khởi tạo mã NV, key & lịch làm việc...', 'info');

  try {
    const res = await api('/api/applicants/' + id + '/convert', {
      method: 'POST',
      body: JSON.stringify({ startDate, trainingDays, shift, branchId }),
      headers: { Authorization: 'Bearer ' + token }
    });

    const emp = res.employee;
    const key = res.key;

    loadApplicants();
    loadEmployees();
    if (typeof loadSchedules === 'function') loadSchedules();

    // Show credential & schedule confirmation modal
    openModal('🎉 Khởi Tạo Lịch & Nhân Viên Training Thành Công!', `
      <div class="space-y-4">
        <!-- Header banner -->
        <div class="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-4 text-white text-center">
          <div class="text-2xl mb-1">🥛</div>
          <div class="font-black text-lg">Chào mừng ${emp.name}!</div>
          <div class="text-xs opacity-90 mt-1">Nhân viên Training mới • ${getBranchFull(emp.branchId)} • ${emp.shift}</div>
        </div>

        <!-- Schedule created notification -->
        <div class="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-green-500 text-white flex items-center justify-center text-base"><i class="fa-solid fa-calendar-circle-check"></i></div>
          <div class="text-xs text-green-900">
            <div class="font-black">Đã Cập Nhật Lịch Làm Việc Vào Tab Lịch Làm Việc!</div>
            <div class="mt-0.5 text-green-700">Lịch Training từ <b>${fmtDMY(res.startDate)}</b> đến <b>${fmtDMY(res.endDate)}</b> (${emp.trainingDays} ngày).</div>
          </div>
        </div>

        <!-- AI badge -->
        <div class="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <i class="fa-solid fa-robot text-purple-600"></i>
          <span class="text-xs font-bold text-purple-800">AI tự động kích hoạt quản lý chấm công qua Web App Nhân viên</span>
          <span class="ml-auto text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold">REALTIME</span>
        </div>

      <!-- Employee ID block -->
      <div class="bg-pink-50 border-2 border-pink-300 rounded-2xl p-4">
        <div class="text-xs font-black text-pink-700 mb-2 flex items-center gap-1.5">
          <i class="fa-solid fa-id-badge"></i> MÃ NHÂN VIÊN (Employee ID)
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1 bg-white border border-pink-200 rounded-xl px-4 py-3 font-mono font-black text-xl text-pink-900 tracking-widest text-center" id="credEmpId">${emp.employeeId}</div>
          <button onclick="copyCredential('credEmpId','Mã nhân viên')" class="w-12 h-12 bg-pink-500 hover:bg-pink-600 text-white rounded-xl flex items-center justify-center shadow transition" title="Copy mã NV">
            <i class="fa-solid fa-copy text-base"></i>
          </button>
        </div>
        <div class="text-[11px] text-pink-600 mt-1.5 text-center">Nhân viên dùng mã này để điền vào app khi đăng ký thiết bị</div>
      </div>

      <!-- Login Key block -->
      <div class="bg-slate-900 rounded-2xl p-4">
        <div class="text-xs font-black text-slate-300 mb-2 flex items-center gap-1.5">
          <i class="fa-solid fa-key text-yellow-400"></i> KEY ĐĂNG NHẬP WEB APP (1 thiết bị duy nhất)
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 font-mono font-black text-lg text-yellow-300 tracking-widest text-center" id="credKey">${key.key}</div>
          <button onclick="copyCredential('credKey','Key đăng nhập')" class="w-12 h-12 bg-yellow-400 hover:bg-yellow-500 text-slate-900 rounded-xl flex items-center justify-center shadow transition" title="Copy key">
            <i class="fa-solid fa-copy text-base"></i>
          </button>
        </div>
        <div class="text-[11px] text-slate-400 mt-1.5 text-center">Key này chỉ dùng được trên 1 điện thoại. Đổi máy cần HR cấp lại.</div>
      </div>

      <!-- Copy all button -->
      <button onclick="copyAllCredentials('${emp.employeeId}','${key.key}','${emp.name}')" class="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-black py-3 rounded-xl shadow flex items-center justify-center gap-2 transition">
        <i class="fa-solid fa-copy"></i> Copy Thông Tin Đăng Nhập (Gửi cho NV)
      </button>

      <!-- Instructions -->
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1">
        <div class="font-black flex items-center gap-1"><i class="fa-solid fa-circle-info text-blue-600"></i> Hướng dẫn nhân viên đăng nhập:</div>
        <div>1. Mở trình duyệt → truy cập <span class="font-mono font-bold bg-white border px-1 rounded">${window.location.origin}/employee</span></div>
        <div>2. Nhập <b>Mã NV</b>: <span class="font-mono font-bold">${emp.employeeId}</span></div>
        <div>3. Nhập <b>Key</b>: <span class="font-mono font-bold">${key.key}</span></div>
        <div>4. Hệ thống gắn thiết bị tự động lần đầu đăng nhập</div>
      </div>

      <button onclick="closeModal()" class="w-full bg-white border border-pink-200 text-pink-700 font-bold py-2.5 rounded-xl hover:bg-pink-50 transition">Đóng</button>
    </div>
  `);
  } catch (err) {
    showToast('❌ Lỗi chuyển training: ' + (err.message || err), 'error');
  }
}

function copyCredential(elementId, label) {
  const text = document.getElementById(elementId)?.textContent?.trim();
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`✅ Đã copy ${label}: ${text}`, 'success');
  }).catch(() => {
    showToast(`${label}: ${text}`, 'info');
  });
}

function copyAllCredentials(employeeId, key, name) {
  const text = `🥛 THÔNG TIN ĐĂNG NHẬP ỤM BÒ MILK HR APP\n\nNhân viên: ${name}\n📛 Mã NV: ${employeeId}\n🔑 Key đăng nhập: ${key}\n\n🌐 Link đăng nhập: ${window.location.origin}/employee\n\n⚠️ Key này chỉ dùng được 1 thiết bị. Bảo mật, không chia sẻ.`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('✅ Đã copy toàn bộ thông tin đăng nhập! Sẵn sàng gửi cho nhân viên.', 'success');
  }).catch(() => {
    alert(text);
  });
}

async function deleteApplicant(id){
  const a = applicants.find(x=>x.id===id);
  if(!a) return;
  if(!confirm(`Xóa hồ sơ ứng viên "${a.name}" (${a.phone})?\n\nDữ liệu sẽ tự động xóa sạch trên cả 2 Google Sheet (Form + Database chính) Realtime.`)) return;

  // Optimistically remove from local list and update UI instantly
  applicants = applicants.filter(x => x.id !== id);
  if (typeof renderApplicantsTable === 'function') renderApplicantsTable();
  else if (typeof loadApplicants === 'function') loadApplicants();

  try{
    const res = await api('/api/applicants/'+id, {method:'DELETE', headers:{Authorization:`Bearer ${token}`}});
    if (res && res.error) {
      showToast(res.error, 'error');
      loadApplicants();
      return;
    }
    showToast(`Đã xóa hồ sơ ứng viên "${a.name}" thành công!`, 'success');
    loadApplicants();
    if (typeof loadInterviews === 'function') loadInterviews();
  }catch(e){
    showToast(e.message || 'Lỗi khi xóa ứng viên', 'error');
    loadApplicants();
  }
}
async function deleteEmp(id) {
  const e = employees.find(x => x.id === id || x.employeeId === id);
  const name = e ? e.name : 'nhân viên này';
  if (!confirm(`Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu của nhân viên "${name}"?\n\nHành động này sẽ xóa liên mạch nhân viên ở TẤT CẢ các tab và xóa khỏi cả 2 Google Sheet.`)) {
    return;
  }

  employees = employees.filter(x => x.id !== id && x.employeeId !== id);
  if (typeof renderEmployeesTable === 'function') renderEmployeesTable();
  else if (typeof loadEmployees === 'function') loadEmployees();

  try {
    const targetId = e ? e.id : id;
    const res = await api('/api/employees/' + targetId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    });
    showToast(`Đã xóa liên mạch nhân viên "${name}" thành công!`, 'success');
    loadEmployees();
    if (typeof loadApplicants === 'function') loadApplicants();
    if (typeof loadInterviews === 'function') loadInterviews();
  } catch (err) {
    showToast(err.message || 'Lỗi khi xóa nhân viên', 'error');
    loadEmployees();
  }
}
async function syncForm(){
  const res = await api('/api/recruitment/sync-form', {method:'POST', headers:{Authorization:'Bearer '+token}});
  showToast(`Đồng bộ Google Form: +${res.added} ứng viên mới`,'success');
  loadApplicants();
}
function openAddApplicant(){
  openModal('Thêm ứng viên thủ công', `
    <div class="space-y-3">
      <input id="mName" placeholder="Họ tên" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
      <div class="grid grid-cols-2 gap-3">
        <input id="mPhone" placeholder="SĐT" class="px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
        <input id="mEmail" placeholder="Email" class="px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
      </div>
      <select id="mBranch" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm">${branches.map(b=>`<option value="${b.id}">${b.name} - ${b.address}</option>`).join('')}</select>
      <textarea id="mCv" placeholder="CV / Kinh nghiệm / Ghi chú" rows="3" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"></textarea>
      <button onclick="submitAddApplicant()" class="w-full bg-pink-500 hover:bg-pink-600 text-white font-black py-2.5 rounded-xl">Tạo hồ sơ</button>
    </div>
  `);
}
async function submitAddApplicant(){
  const body={name:document.getElementById('mName').value, phone:document.getElementById('mPhone').value, email:document.getElementById('mEmail').value, branchPreference:document.getElementById('mBranch').value, cvData:document.getElementById('mCv').value};
  if(!body.name||!body.phone) return showToast('Thiếu thông tin','error');
  await api('/api/applicants', {method:'POST', body:JSON.stringify(body)});
  closeModal(); loadApplicants(); showToast('Đã thêm ứng viên','success');
}

function getEmployeeTrainingProgress(emp) {
  // For Official: Hiển thị Tiến độ ca làm theo TUẦN (Realtime)
  if (emp.status === 'OFFICIAL' || emp.type === 'OFFICIAL') {
    try{
      const allSchedules = (typeof schedules!=='undefined' ? schedules : []);
      const allOff = (typeof offRequests!=='undefined' ? offRequests : []);
      const allEmerg = (typeof emergencyRequests!=='undefined' ? emergencyRequests : []);
      // Tìm tuần mục tiêu: ưu tiên lịch có sẵn chứa hôm nay, else tuần sau (nơi AI đã sắp OFF) - realtime đúng lịch web
      const today = new Date(); today.setHours(0,0,0,0);
      const todayStr = today.toISOString().split('T')[0];
      const curMonStr = getMonday(today).toISOString().split('T')[0];
      const nextMonStr = getMonday(new Date(Date.now()+7*24*60*60*1000)).toISOString().split('T')[0];
      let targetWeekStr = curMonStr;
      let sched = allSchedules.find(s=>s.employeeId===emp.employeeId && s.weekStart===targetWeekStr);
      // Nếu NV chính thức có ngày bắt đầu tương lai và tuần hiện tại là tuần chờ (partial), chọn tuần đầu tiên đủ 7 ngày làm việc
      if(emp.officialStartDate && todayStr < emp.officialStartDate){
        const startMon = getMonday(new Date(emp.officialStartDate)).toISOString().split('T')[0];
        let candidate = new Date(startMon);
        if(emp.officialStartDate !== startMon){
          candidate.setDate(candidate.getDate()+7); // tuần đầu tiên đủ 7 ngày sau start
        }
        const candidateStr = candidate.toISOString().split('T')[0];
        const candSched = allSchedules.find(s=>s.employeeId===emp.employeeId && s.weekStart===candidateStr);
        if(candSched){
          targetWeekStr = candidateStr;
          sched = candSched;
        }
      }
      if(!sched){
        sched = allSchedules.find(s=>s.employeeId===emp.employeeId && s.weekStart===nextMonStr);
        if(sched) targetWeekStr = nextMonStr;
      }
      // Nếu vẫn không có lịch, fallback dùng nextMon
      if(!sched){
        targetWeekStr = nextMonStr;
      }
      const wDate = new Date(targetWeekStr);
      const month = wDate.getMonth()+1;
      const weekInMonth = Math.ceil(wDate.getDate()/7);
      const weekLabel = `Tuần ${weekInMonth} - T${month}`;
      // Nếu có schedule chi tiết cho tuần đó, đếm realtime
      let working = 0, off = 0, emerg = 0;
      if(sched && sched.days){
        sched.days.forEach(d=>{
          if(d.status==='WORKING' || d.status==='SUBSTITUTE') working++;
          else if(d.status==='OFF') off++;
          else if(d.status==='EMERGENCY_OFF' || d.status==='EMERGENCY_PENDING') emerg++;
          else if(d.status==='WORKING') working++;
        });
        // Nếu schedule chưa đủ 7 ngày (do mới tạo), bổ sung từ offRequests
        if(sched.days.length<7){
          const weekDates = [];
          for(let i=0;i<7;i++){ const cur=new Date(wDate); cur.setDate(wDate.getDate()+i); weekDates.push(cur.toISOString().split('T')[0]); }
          const offInWeek = allOff.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED').reduce((s,r)=> s + r.dates.filter(d=> weekDates.includes(d)).length,0);
          const emergInWeek = allEmerg.filter(r=>r.employeeId===emp.employeeId && (r.status==='PENDING'||r.status==='APPROVED') && weekDates.includes(r.date)).length;
          // Nếu schedule thiếu, ước tính
          if(working+off+emerg <7){
            const remaining = 7 - (working+off+emerg);
            working += remaining;
          }
        }
      } else {
        // Không có schedule: tính từ offRequests/emergency cho tuần target
        const weekDates = [];
        for(let i=0;i<7;i++){ const cur=new Date(wDate); cur.setDate(wDate.getDate()+i); weekDates.push(cur.toISOString().split('T')[0]); }
        off = allOff.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED').reduce((s,r)=> s + r.dates.filter(d=> weekDates.includes(d)).length,0);
        emerg = allEmerg.filter(r=>r.employeeId===emp.employeeId && (r.status==='PENDING'||r.status==='APPROVED') && weekDates.includes(r.date)).length;
        working = 7 - off - emerg;
        if(working<0) working=0;
      }
      // Ràng buộc: off tối đa 2, emerg tối đa 1
      const offLabel = `${off}/2`;
      const emergLabel = `${emerg}/1`;
      const workingLabel = `${working}/7`;
      const percent = Math.round((working/7)*100);
      return { 
        completed: working, total: 7, percent, 
        label: weekLabel, 
        workingLabel, emergLabel, offLabel,
        sub: `Số ca làm: ${workingLabel} ngày • OFF đột xuất: ${emergLabel} ngày`,
        weekLabel, working, off, emerg
      };
    }catch(e){
      return { completed: 5, total: 7, percent: 71, label: `Tuần 1 - T${new Date().getMonth()+1}`, workingLabel:'5/7', emergLabel:'0/1', sub: 'Số ca làm: 5/7 • OFF đột xuất: 0/1' };
    }
  }

  // Training: Count attendances for this employee that are check-ins or completed
  const empAtts = (attendances || []).filter(a => a.employeeId === emp.employeeId && (a.checkIn || a.status === 'COMPLETED' || a.status === 'CHECKED_IN' || (a.violations && a.violations.length)));
  const uniqueAttDates = new Set(empAtts.map(a => a.date));
  const completed = Math.min(uniqueAttDates.size, 7);
  const percent = Math.round((completed / 7) * 100);

  return { completed, total: 7, percent, label: `${completed}/7 ngày`, sub: '' };
}

function getEmployeeOffProgress(emp) {
  // Official: chỉ 2 ngày OFF/tuần (ràng buộc)
  if (emp.status === 'OFFICIAL' || emp.type === 'OFFICIAL') {
    try{
      const offList = (typeof offRequests!=='undefined' ? offRequests : []);
      // Đếm OFF tuần sau (next week Mon-Sun) - AI đã sắp lịch
      const nextMon = getMonday(new Date(Date.now()+7*24*60*60*1000)).toISOString().split('T')[0];
      const nextSun = new Date(new Date(nextMon).getTime()+6*24*60*60*1000).toISOString().split('T')[0];
      const countNextWeek = offList.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED' && r.dates.some(d=>d>=nextMon && d<=nextSun)).reduce((s,r)=>s+r.dates.filter(d=>d>=nextMon && d<=nextSun).length,0);
      if(countNextWeek===2) return { count:2, label: '2/2 ngày OFF (tuần sau)', isFull: true };
      if(countNextWeek>0) return { count:countNextWeek, label: `${countNextWeek}/2 ngày OFF`, isFull: false };
      // fallback: đếm OFF trong tháng
      const monthStr = new Date().toISOString().slice(0,7);
      const countMonth = offList.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED').reduce((s,r)=>s+r.dates.filter(d=>d.startsWith(monthStr)).length,0);
      if(countMonth>0) return { count:countMonth, label: `${countMonth} ngày OFF (tháng)`, isFull: countMonth>=2 };
      return { count:0, label: 'Chưa chọn OFF (0/2)', isFull: false };
    }catch(e){
      return { count:0, label: '0/2 ngày OFF', isFull: false };
    }
  }
  const offDates = emp.registeredOffDates || [];
  const count = offDates.length;
  if (count === 5) {
    return { count, label: '5/5 ngày OFF', isFull: true };
  } else if (count > 0) {
    return { count, label: `${count}/5 ngày OFF`, isFull: false };
  }
  return { count: 0, label: 'Chưa chọn OFF (0/5)', isFull: false };
}

function getEmployeeTrialWindowInfo(emp) {
  if (emp.status === 'OFFICIAL' || emp.status === 'WAITING_OFFICIAL' || emp.type === 'OFFICIAL') {
    // Ràng buộc: Chưa đến ngày bắt đầu chính thức → Chưa chính thức, đến ngày → Chính thức
    try{
      const today = new Date().toISOString().split('T')[0];
      if(emp.officialStartDate && today < emp.officialStartDate){
        return { label: 'Chưa chính thức', sub: `Chờ đến ${fmtDMY(emp.officialStartDate)} • ${emp.branchId} • ${emp.shift}` };
      }
      const schedToday = (typeof schedules!=='undefined' ? schedules : []).find(s=>s.employeeId===emp.employeeId && s.days.some(d=>d.date===today));
      const dayToday = schedToday ? schedToday.days.find(d=>d.date===today) : null;
      const statusToday = dayToday ? dayToday.status : 'WORKING';
      const label = statusToday==='OFF' ? 'Nghỉ OFF' : statusToday==='EMERGENCY_OFF' ? 'OFF đột xuất' : statusToday==='EMERGENCY_PENDING' ? 'Chờ duyệt OFF' : 'Đang làm việc';
      const sub = `Chính thức • ${emp.branchId} • ${emp.shift}`;
      return { label, sub };
    }catch(e){
      return { label: 'Chính thức', sub: `Bắt đầu: ${fmtDMY(emp.officialStartDate || emp.startDate)}` };
    }
  }

  const startDateStr = emp.startDate || new Date().toISOString().split('T')[0];
  const parts = startDateStr.split('T')[0].split('-').map(Number);
  const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
  
  const today = new Date();
  today.setHours(0,0,0,0);
  startD.setHours(0,0,0,0);

  const diffDays = Math.floor((today - startD) / (1000 * 60 * 60 * 24)) + 1;
  const currentDayNum = Math.max(1, Math.min(12, diffDays));

  if (diffDays > 12) {
    return { label: 'Tổng 12 ngày thử việc', sub: 'Đã hoàn thành 12 ngày • Chờ chuyển chính thức' };
  }

  return { label: 'Tổng 12 ngày thử việc', sub: `Đang ở Ngày thứ ${currentDayNum}/12` };
}

// Employees Store
function switchEmpStoreTab(tab){
  currentEmpStoreTab = tab;
  localStorage.setItem('empStoreTab', tab);
  const btnTraining = document.getElementById('empSubTab-TRAINING');
  const btnOfficial = document.getElementById('empSubTab-OFFICIAL');
  const label = document.getElementById('empStoreTabLabel');
  // Update filter options based on tab
  const filterEl = document.getElementById('empStoreFilter');
  if(tab==='TRAINING'){
    if(btnTraining) btnTraining.className = 'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black transition bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow';
    if(btnOfficial) btnOfficial.className = 'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition bg-white border border-pink-200 text-pink-700 hover:bg-pink-50';
    if(label) label.textContent = 'DANH SÁCH NHÂN VIÊN TRAINING';
    if(filterEl) filterEl.innerHTML = `<option value="">Tất cả trạng thái Training</option><option value="TRAINING">Training</option><option value="WAITING_TEST">Chờ TEST</option><option value="RETEST">Chờ thi lại</option><option value="PASSED_TEST">Đậu TEST</option><option value="FAILED_TEST">FAILED</option><option value="WAITING_OFFICIAL">Chờ chính thức</option><option value="ARCHIVED">ARCHIVED</option>`;
  } else {
    if(btnOfficial) btnOfficial.className = 'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black transition bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow';
    if(btnTraining) btnTraining.className = 'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition bg-white border border-pink-200 text-pink-700 hover:bg-pink-50';
    if(label) label.textContent = 'DANH SÁCH NHÂN VIÊN CHÍNH THỨC';
    if(filterEl) filterEl.innerHTML = `<option value="">Tất cả trạng thái Chính thức</option><option value="OFFICIAL">Chính thức</option><option value="ARCHIVED">ARCHIVED</option>`;
  }
  if(filterEl) filterEl.value = '';
  // Toggle import controls visibility
  const importCtrl = document.getElementById('importOfficialControls');
  if(importCtrl){
    if(tab==='OFFICIAL') importCtrl.classList.remove('hidden');
    else importCtrl.classList.add('hidden');
  }
  // Update table headers per tab
  const thProgress = document.getElementById('thProgress');
  const thOff = document.getElementById('thOff');
  const thStatus = document.getElementById('thStatus');
  const thTest = document.getElementById('thTest');
  const thEmpId = document.getElementById('thEmpId');
  if(tab==='TRAINING'){
    if(thProgress) thProgress.textContent = 'Tiến độ Training (Realtime)';
    if(thOff) thOff.textContent = 'Số ngày OFF đã chọn';
    if(thStatus) thStatus.textContent = 'Trạng thái Thử việc';
    if(thEmpId) thEmpId.textContent = 'Mã NV & Ngày thử việc';
    if(thTest) thTest.classList.remove('hidden');
  } else {
    if(thProgress) thProgress.textContent = 'Tiến độ ca làm';
    if(thOff) thOff.textContent = 'Số ngày OFF (2 ngày/tuần)';
    if(thStatus) thStatus.textContent = 'Trạng thái làm việc';
    if(thEmpId) thEmpId.textContent = 'Mã NV & Ngày vào làm';
    if(thTest) thTest.classList.add('hidden');
  }
  renderEmployeesStore();
}
// ===== IMPORT OFFICIAL: Template & Import =====
function downloadOfficialTemplate(){
  const header = ['Họ tên','SĐT','Chi nhánh','Ca','Ngày bắt đầu','Mã NV (để trống tự sinh)','Điểm TEST (0-10)'];
  const sample = [
    ['Nguyễn Văn A','0901234567','CN2','CA_SANG','2024-01-15','','8.5'],
    ['Trần Thị B','0907654321','CN1 - 130 Vạn kiếp','Ca Chiều','15/01/2024','CN130_UBM15012024_NV0001','9'],
    ['Lê Văn C','0912345678','CN3','Ca Tối','2024-02-01','',''],
  ];
  const csvHeader = header.join(',') + '\n';
  const csvRows = sample.map(r=> r.map(v=>{
    const s = String(v).replace(/"/g,'""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  }).join(',')).join('\n');
  const csv = '\uFEFF' + csvHeader + csvRows; // BOM for Excel UTF8
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='mau_import_nhan_vien_chinh_thuc.csv'; a.click(); URL.revokeObjectURL(url);
  showToast('Đã tải file mẫu CSV - mở bằng Excel/Google Sheets','success');
}
function parseCSVText(text){
  const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.trim()!=='');
  if(lines.length<2) return [];
  // simple CSV parser handling quotes
  function splitCSV(line){
    const res=[]; let cur=''; let inQuote=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){
        if(inQuote && line[i+1]==='"'){ cur+='"'; i++; }
        else inQuote=!inQuote;
      } else if(ch===',' && !inQuote){ res.push(cur.trim()); cur=''; }
      else cur+=ch;
    }
    res.push(cur.trim());
    return res.map(v=> v.replace(/^"|"$/g,'').replace(/""/g,'"').trim());
  }
  const headers = splitCSV(lines[0]).map(h=>h.trim());
  const idxName = headers.findIndex(h=> /Họ tên|Ho ten|Name/i.test(h));
  const idxPhone = headers.findIndex(h=> /SĐT|SDT|Phone/i.test(h));
  const idxBranch = headers.findIndex(h=> /Chi nhánh|Chi nhanh|Branch|CN/i.test(h));
  const idxShift = headers.findIndex(h=> /^Ca$|Ca làm|Shift/i.test(h));
  const idxDate = headers.findIndex(h=> /Ngày|Ngay|Date/i.test(h));
  const idxId = headers.findIndex(h=> /Mã NV|Ma NV|EmployeeId/i.test(h));
  const idxScore = headers.findIndex(h=> /Điểm|Diem|Score/i.test(h));
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cols = splitCSV(lines[i]);
    if(cols.length<headerHeadersLen(headers, cols)) continue;
    rows.push({
      name: cols[idxName]||cols[0]||'',
      phone: cols[idxPhone]||cols[1]||'',
      branchId: cols[idxBranch]||cols[2]||'',
      shift: cols[idxShift]||cols[3]||'',
      startDate: cols[idxDate]||cols[4]||'',
      employeeId: cols[idxId]||cols[5]||'',
      testScore: cols[idxScore]||cols[6]||'',
    });
  }
  return rows;
  function headerHeadersLen(h,c){ return Math.min(h.length,c.length); }
}
async function handleOfficialImport(event){
  const file = event.target.files[0];
  if(!file) return;
  event.target.value='';
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
  let rows=[];
  try{
    if(isXlsx){
      if(typeof XLSX==='undefined'){ showToast('Thiếu thư viện XLSX - vui lòng chuyển file sang CSV','error'); return; }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
      if(json.length<2){ showToast('File rỗng','error'); return; }
      const headers = json[0].map(h=>String(h).trim());
      const idxName = headers.findIndex(h=> /Họ tên|Ho ten|Name/i.test(h));
      const idxPhone = headers.findIndex(h=> /SĐT|SDT|Phone/i.test(h));
      const idxBranch = headers.findIndex(h=> /Chi nhánh|Chi nhanh|Branch|CN/i.test(h));
      const idxShift = headers.findIndex(h=> /^Ca$|Ca làm|Shift/i.test(h));
      const idxDate = headers.findIndex(h=> /Ngày|Ngay|Date/i.test(h));
      const idxId = headers.findIndex(h=> /Mã NV|Ma NV|EmployeeId/i.test(h));
      const idxScore = headers.findIndex(h=> /Điểm|Diem|Score/i.test(h));
      for(let i=1;i<json.length;i++){
        const cols = json[i];
        if(!cols || cols.every(v=> String(v).trim()==='')) continue;
        rows.push({
          name: String(cols[idxName>=0?idxName:0]||'').trim(),
          phone: String(cols[idxPhone>=0?idxPhone:1]||'').trim(),
          branchId: String(cols[idxBranch>=0?idxBranch:2]||'').trim(),
          shift: String(cols[idxShift>=0?idxShift:3]||'').trim(),
          startDate: String(cols[idxDate>=0?idxDate:4]||'').trim(),
          employeeId: String(cols[idxId>=0?idxId:5]||'').trim(),
          testScore: String(cols[idxScore>=0?idxScore:6]||'').trim(),
        });
      }
    } else {
      const text = await file.text();
      rows = parseCSVText(text);
    }
    if(rows.length===0){ showToast('Không đọc được dữ liệu - kiểm tra file mẫu','error'); return; }
    // preview modal
    const previewRows = rows.slice(0,20);
    openModal(`Xác nhận Import ${rows.length} nhân viên Chính thức`, `
      <div class="space-y-3 max-h-[65vh] overflow-auto">
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
          <div class="font-black text-amber-800">Lưu ý:</div>
          <div class="text-amber-700 mt-1">• Hệ thống sẽ <b>tự sinh Mã NV</b> nếu để trống (prefix theo chi nhánh: CN130/CN261...)</div>
          <div class="text-amber-700">• SĐT trùng sẽ <b>bỏ qua</b> • Trạng thái mặc định <b>OFFICIAL</b> • Tự tạo <b>Key</b> cho mỗi NV</div>
        </div>
        <div class="overflow-auto max-h-[32vh] border rounded-xl">
          <table class="w-full text-xs">
            <thead class="bg-slate-900 text-white sticky top-0"><tr><th class="px-2 py-1 text-left">#</th><th class="px-2 py-1 text-left">Họ tên</th><th class="px-2 py-1">SĐT</th><th class="px-2 py-1">CN</th><th class="px-2 py-1">Ca</th><th class="px-2 py-1">Ngày vào</th></tr></thead>
            <tbody class="divide-y">${previewRows.map((r,i)=>`<tr class="hover:bg-pink-50"><td class="px-2 py-1">${i+1}</td><td class="px-2 py-1 font-bold">${r.name||'<span class=text-red-500>Thiếu</span>'}</td><td class="px-2 py-1 font-mono">${r.phone}</td><td class="px-2 py-1">${r.branchId}</td><td class="px-2 py-1">${r.shift}</td><td class="px-2 py-1">${r.startDate}</td></tr>`).join('')}</tbody>
          </table>
          ${rows.length>20?`<div class="text-center text-xs text-slate-500 py-2">... và ${rows.length-20} dòng nữa</div>`:''}
        </div>
        <div class="flex gap-2">
          <button id="confirmImportBtn" class="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black py-3 rounded-xl hover:from-emerald-600 hover:to-teal-700">✅ Xác nhận Import ${rows.length} NV</button>
          <button onclick="closeModal()" class="px-6 bg-white border border-slate-200 font-bold py-3 rounded-xl">Hủy</button>
        </div>
      </div>
    `);
    document.getElementById('confirmImportBtn').onclick = async ()=>{
      closeModal(); showToast('Đang import...','success');
      try{
        const res = await api('/api/employees/import-official', {method:'POST', body:JSON.stringify({employees: rows}), headers:{Authorization:'Bearer '+token}});
        showToast(`✅ Import xong: ${res.imported} thành công, ${res.skipped.length} bỏ qua (trùng/thiếu), ${res.errors.length} lỗi`, 'success');
        if(res.skipped.length>0) console.warn('Skipped',res.skipped);
        if(res.errors.length>0) console.warn('Errors',res.errors);
        loadEmployees();
        // optionally show result modal
        if(res.skipped.length||res.errors.length){
          openModal('Kết quả Import', `
            <div class="space-y-2 text-sm">
              <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3"><span class="font-black text-emerald-700">${res.imported} NV đã nhập</span> • Tự sinh Mã NV & Key</div>
              ${res.skipped.length?'<div class="bg-amber-50 border border-amber-200 rounded-xl p-2 max-h-[120px] overflow-auto"><div class="font-bold text-amber-800 text-xs">Bỏ qua ('+res.skipped.length+')</div>'+res.skipped.slice(0,10).map(s=>'<div class=text-xs>'+s.reason+' - '+JSON.stringify(s.row).slice(0,80)+'</div>').join('')+'</div>':''}
              ${res.errors.length?'<div class="bg-red-50 border border-red-200 rounded-xl p-2 max-h-[120px] overflow-auto"><div class="font-bold text-red-800 text-xs">Lỗi ('+res.errors.length+')</div>'+res.errors.slice(0,10).map(e=>'<div class=text-xs>'+e.reason+'</div>').join('')+'</div>':''}
              <button onclick="closeModal()" class="w-full bg-slate-900 text-white font-bold py-2 rounded-xl">Đóng</button>
            </div>
          `);
        }
      }catch(e){ showToast('Import lỗi: '+e.message,'error'); }
    };
  }catch(e){ showToast('Lỗi đọc file: '+e.message,'error'); console.error(e); }
}
async function loadEmployees(){
  employees = await api('/api/employees');
  try { attendances = await api('/api/attendances'); } catch(e) {}
  try { offRequests = await api('/api/off-requests'); } catch(e) {}
  try { schedules = await api('/api/schedules'); } catch(e) {}
  // update tab counts immediately
  try{
    const storeAll = employees.filter(e => e.category === 'STORE' || !e.category);
    const trainingCount = storeAll.filter(e => e.type === 'TRAINING' || e.status !== 'OFFICIAL').filter(e=> e.type !== 'OFFICIAL' && e.status !== 'OFFICIAL').length;
    // More precise: TRAINING = type TRAINING or not OFFICIAL; OFFICIAL = type OFFICIAL or status OFFICIAL
    const trainCountPrecise = storeAll.filter(e => (e.type === 'TRAINING' || e.status !== 'OFFICIAL') && e.type !== 'OFFICIAL').length;
    // fallback simple
    const cTrain = storeAll.filter(e => e.type==='TRAINING' || (e.status!=='OFFICIAL' && e.type!=='OFFICIAL')).length;
    const cOfficial = storeAll.filter(e => e.type==='OFFICIAL' || e.status==='OFFICIAL').length;
    const elT = document.getElementById('countEmpTrainingTab');
    const elO = document.getElementById('countEmpOfficialTab');
    if(elT) elT.textContent = cTrain;
    if(elO) elO.textContent = cOfficial;
  }catch(_){}
  // ensure active tab UI is correct
  switchEmpStoreTab(currentEmpStoreTab);
  renderBeta();
}
function renderEmployeesStore(){
  const filter = document.getElementById('empStoreFilter')?.value || '';
  const branchF = document.getElementById('empBranchFilter')?.value || '';
  let list = employees.filter(e => e.category === 'STORE' || !e.category);
  // Filter by sub-tab
  if(currentEmpStoreTab==='TRAINING'){
    list = list.filter(e => e.type==='TRAINING' || (e.status!=='OFFICIAL' && e.type!=='OFFICIAL'));
  } else if(currentEmpStoreTab==='OFFICIAL'){
    list = list.filter(e => e.type==='OFFICIAL' || e.status==='OFFICIAL');
  }
  if (filter) list = list.filter(e => e.status === filter);
  if (branchF) list = list.filter(e => e.branchId === branchF);
  
  const countBadge = document.getElementById('empCountBadge');
  if (countBadge) countBadge.textContent = list.length + ' NV';

  // Update counts for both tabs (for badge)
  try{
    const storeAll = employees.filter(e => e.category === 'STORE' || !e.category);
    let baseListForCounts = storeAll;
    if(branchF) baseListForCounts = baseListForCounts.filter(e => e.branchId===branchF);
    const cTrainAll = baseListForCounts.filter(e => e.type==='TRAINING' || (e.status!=='OFFICIAL' && e.type!=='OFFICIAL')).length;
    const cOfficialAll = baseListForCounts.filter(e => e.type==='OFFICIAL' || e.status==='OFFICIAL').length;
    const elT = document.getElementById('countEmpTrainingTab');
    const elO = document.getElementById('countEmpOfficialTab');
    if(elT) elT.textContent = cTrainAll;
    if(elO) elO.textContent = cOfficialAll;
  }catch(_){}

  // Empty state per tab
  const tableEl = document.getElementById('employeesTable');
  if (tableEl) {
    if(list.length===0){
      const emptyMsg = currentEmpStoreTab==='TRAINING' 
        ? `<div class="text-pink-600 font-bold">Chưa có nhân viên Training</div><div class="text-slate-500 text-xs mt-1">Nhân viên mới từ Form sau khi duyệt sẽ vào tab này (7 ngày Training) • Lọc: ${branchF||'Tất cả CN'}</div>`
        : `<div class="text-emerald-600 font-bold">Chưa có nhân viên Chính thức</div><div class="text-slate-500 text-xs mt-1">Chỉ 2 ngày OFF/tuần (T6 12:00→T7 15:00) • AI sắp lịch T2→CN • Lọc: ${branchF||'Tất cả CN'}</div>`;
      const colspan = currentEmpStoreTab==='OFFICIAL' ? 7 : 8;
      tableEl.innerHTML = `<tr><td colspan="${colspan}" class="px-4 py-10 text-center bg-white"><div class="w-12 h-12 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center mx-auto"><i class="fa-solid ${currentEmpStoreTab==='TRAINING'?'fa-graduation-cap':'fa-user-check'}"></i></div><div class="mt-3 text-sm">${emptyMsg}</div></td></tr>`;
      return;
    }
    tableEl.innerHTML = list.map(e => {
      const trainProgress = getEmployeeTrainingProgress(e);
      const offInfo = getEmployeeOffProgress(e);
      const trialInfo = getEmployeeTrialWindowInfo(e);

      return `
        <tr class="hover:bg-pink-50/30 transition border-b border-slate-100 text-xs">
          <!-- Mã NV & Ngày thử việc -->
          <td class="px-4 py-3.5 align-middle whitespace-nowrap">
            <div class="font-mono text-xs font-black text-slate-900 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md inline-block">${e.employeeId}</div>
            <div class="text-[11px] text-pink-600 font-bold mt-1 flex items-center gap-1">
              <i class="fa-regular fa-calendar text-[10px]"></i> ${fmtDMY(e.startDate)} → ${fmtDMY(e.endDate)}
            </div>
          </td>

          <!-- Họ tên / SĐT -->
          <td class="px-4 py-3.5 align-middle whitespace-nowrap">
            <div class="font-black text-sm text-slate-900 leading-tight">${e.name}</div>
            <div class="text-[11px] text-slate-500 font-mono font-medium mt-0.5">${e.phone}</div>
          </td>

          <!-- CN / Ca làm -->
          <td class="px-4 py-3.5 align-middle text-center whitespace-nowrap">
            <span class="text-xs font-bold bg-pink-50 text-pink-700 px-2.5 py-1 rounded-xl border border-pink-200/70 inline-block">${getBranchDisplay(e.branchId)}</span>
            <div class="text-xs font-black text-slate-700 mt-1">${e.shift}</div>
          </td>

          <!-- Tiến độ ca làm / Training -->
          <td class="px-4 py-3.5 align-middle text-center whitespace-nowrap">
            ${currentEmpStoreTab==='OFFICIAL' ? `
              <div class="inline-flex flex-col items-center gap-1">
                <span class="text-xs font-black px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-xs">
                  <i class="fa-solid fa-calendar-week mr-1"></i> ${trainProgress.weekLabel||trainProgress.label}
                </span>
                <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${trainProgress.working>=5?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-amber-50 text-amber-700 border border-amber-200'}">
                  Số ca làm: ${trainProgress.workingLabel||trainProgress.label} ngày
                </span>
                <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${trainProgress.emerg>0?'bg-orange-50 text-orange-700 border border-orange-200':'bg-slate-50 text-slate-500 border border-slate-200'}">
                  OFF đột xuất: ${trainProgress.emergLabel||'0/1'} ngày
                </span>
                <div class="w-24 bg-slate-100 border border-slate-200/60 h-1.5 rounded-full overflow-hidden mt-1 p-0.5">
                  <div class="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full rounded-full transition-all duration-500" style="width: ${trainProgress.percent}%"></div>
                </div>
              </div>
            ` : `
              <div class="inline-flex flex-col items-center">
                <span class="text-xs font-black px-3 py-1 rounded-full ${trainProgress.completed >= 7 ? 'bg-emerald-500 text-white shadow-xs' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                  <i class="fa-solid fa-graduation-cap mr-1"></i> ${trainProgress.label}
                </span>
                <div class="w-24 bg-slate-100 border border-slate-200/60 h-2 rounded-full overflow-hidden mt-1.5 p-0.5">
                  <div class="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full rounded-full transition-all duration-500" style="width: ${trainProgress.percent}%"></div>
                </div>
              </div>
            `}
          </td>

          <!-- Số ngày OFF đã chọn -->
          <td class="px-4 py-3.5 align-middle text-center whitespace-nowrap">
            <span class="text-xs font-bold px-3 py-1 rounded-xl ${offInfo.isFull ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-amber-50 text-amber-700 border border-amber-200'} inline-block">
              <i class="fa-solid fa-umbrella-beach mr-1"></i> ${offInfo.label}
            </span>
          </td>

          <!-- Trạng thái Thử việc (12 Ngày) -->
          <td class="px-4 py-3.5 align-middle text-center whitespace-nowrap">
            <span class="text-xs font-black px-3 py-1 rounded-xl ${e.status === 'OFFICIAL' ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-xs' : 'bg-rose-50 text-rose-700 border border-rose-200'} inline-block">
              ${trialInfo.label}
            </span>
            <div class="text-[11px] text-slate-500 font-bold mt-1">${trialInfo.sub}</div>
          </td>

          <!-- TEST - Ẩn với Chính thức -->
          <td class="px-4 py-3.5 align-middle text-center whitespace-nowrap ${currentEmpStoreTab==='OFFICIAL'?'hidden':''}">
            <div class="font-black text-sm ${e.testScore < 5 ? 'text-red-600' : e.testScore <= 7 ? 'text-amber-600' : e.testScore > 7 ? 'text-emerald-600' : 'text-slate-400'}">
              ${e.testScore ?? '—'}
            </div>
            <div class="text-[11px] font-bold text-slate-500">${e.testResult || '—'}</div>
          </td>

          <!-- Thao tác -->
          <td class="px-4 py-3.5 align-middle text-right whitespace-nowrap">
            <div class="flex items-center gap-1.5 justify-end flex-nowrap">
              <button onclick="viewEmployee('${e.employeeId}')" class="text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl shadow-2xs transition">Xem</button>
              
              <!-- DYNAMIC TEST WORKFLOW BUTTONS -->
              ${(() => {
                const ts = e.testSchedule || {};
                const now = Date.now();
                const schedTime = ts.scheduledAt ? new Date(ts.scheduledAt).getTime() : null;
                const diffMins = (schedTime && !isNaN(schedTime)) ? (schedTime - now) / 60000 : null;

                let btns = '';
                if(currentEmpStoreTab==='OFFICIAL') return ''; // Ẩn toàn bộ nút TEST với Chính thức

                const isAdmin = currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin');

                // Case A: Meet Test Scheduled & Pending (Chưa bấm Hoàn thành TEST)
                if (ts.type === 'MEET_TEST' && ts.status === 'SCHEDULED') {
                  const isNear = diffMins !== null && diffMins <= 15 && diffMins > 0;
                  const isTimeArrived = diffMins !== null && diffMins <= 0;
                  const canShowCompleteBtn = isAdmin || isTimeArrived;
                  
                  // 1. Nút Thư mời TEST đầu ra
                  btns += `
                    <button onclick="openTestInviteModal('${e.employeeId}')" class="text-xs font-bold ${isNear ? 'bg-amber-500 hover:bg-amber-600 animate-pulse text-white shadow-md' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'} px-3 py-1.5 rounded-xl transition flex items-center gap-1" title="Thư mời Phỏng vấn TEST Google Meet">
                      ✉️ Thư mời TEST đầu ra ${isNear ? '(Sắp diễn ra)' : ''}
                    </button>
                  `;

                  // 2. Nút Hoàn thành TEST (Admin: Hiển thị ngay lập tức | HR: Đến giờ họp Meet mới hiển thị)
                  if (canShowCompleteBtn) {
                    btns += `
                      <button onclick="completeMeetTest('${e.employeeId}')" class="text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-3 py-1.5 rounded-xl shadow-md transition flex items-center gap-1 ${isTimeArrived ? 'animate-bounce' : ''}">
                        ✅ Hoàn thành TEST
                      </button>
                    `;
                  }
                }
                // Case B1: Interview Completed -> Active Đánh giá TEST đầu ra button
                else if (ts.status === 'COMPLETED_INTERVIEW') {
                  btns += `
                    <button onclick="openTestEvaluationModal('${e.employeeId}')" class="text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3.5 py-1.5 rounded-xl shadow-md transition flex items-center gap-1 animate-bounce" title="Đánh giá & Chấm điểm bài TEST đầu ra">
                      📝 Đánh giá TEST đầu ra
                    </button>
                  `;
                }
                // Case B2: Evaluation Completed & Saved -> LOCK the button
                else if (ts.status === 'EVALUATED') {
                  btns += `
                    <button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-xl cursor-not-allowed shadow-none flex items-center gap-1" title="Đã hoàn thành và lưu phiếu đánh giá TEST đầu ra (${e.testResult || ''})">
                      🔒 Đã đánh giá TEST
                    </button>
                  `;
                }
                // Case C: Standard Mở TEST
                else {
                  if (e.status === 'TRAINING' || e.status === 'WAITING_TEST') {
                    if (trainProgress.completed >= 7 || (currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin'))) {
                      btns += `<button onclick="openTestOptionModal('${e.employeeId}')" class="text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-xl shadow-xs transition">Mở TEST</button>`;
                    } else {
                      btns += `<button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-xl cursor-not-allowed shadow-none" title="Khóa Mở TEST: NV chưa hoàn thành đủ 7 ngày điểm danh Training (${trainProgress.completed}/7) - Chỉ Admin mới mở được trước">🔒 Mở TEST</button>`;
                    }
                  } else if (e.status === 'RETEST') {
                    btns += `<button onclick="openTestOptionModal('${e.employeeId}')" class="text-xs font-bold bg-pink-500 hover:bg-pink-600 text-white px-3 py-1.5 rounded-xl shadow-xs transition">Thi lại</button>`;
                  }
                }

                return btns;
              })()}

              ${currentEmpStoreTab==='TRAINING' && (currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin') && e.status !== 'OFFICIAL') ? `<button onclick="simulate7DaysTraining('${e.employeeId}')" class="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl shadow-xs transition" title="Giả lập hoàn thành 7 ngày điểm danh cho Admin Test">⚡ 7/7 Training</button>` : ''}
              
              <!-- OFFICIAL BUTTON - Admin: luôn bấm được | HR: chỉ khi Mở TEST đã hiển thị (completed >= 7) -->
              ${currentEmpStoreTab==='TRAINING' && e.status !== 'OFFICIAL' ? (() => {
                const isAdminUser = currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin');
                const isHR = currentUser && currentUser.role === 'HR';
                const testUnlocked = trainProgress.completed >= 7 || isAdminUser;
                if (isAdminUser) {
                  return `<button onclick="transitionOfficial('${e.employeeId}')" class="text-xs font-black bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1">🎓 → Chính thức</button>`;
                } else if (isHR && testUnlocked) {
                  return `<button onclick="transitionOfficial('${e.employeeId}')" class="text-xs font-black bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-3 py-1.5 rounded-xl shadow-xs transition flex items-center gap-1">🎓 → Chính thức</button>`;
                } else if (isHR && !testUnlocked) {
                  return `<button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-xl cursor-not-allowed shadow-none" title="Chức năng Mở TEST chưa được kích hoạt (NV cần đủ 7 ngày điểm danh Training). HR không thể chuyển Chính thức khi Mở TEST chưa hiển thị.">🔒 → Chính thức</button>`;
                } else {
                  return `<button disabled class="text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-xl cursor-not-allowed shadow-none" title="Chỉ Admin/HR mới được chuyển Chính thức">🔒 → Chính thức</button>`;
                }
              })() : ''}

              <button onclick="openKey('${e.employeeId}')" class="text-xs font-bold bg-rose-950 hover:bg-rose-900 text-rose-100 border border-rose-800/80 px-2.5 py-1.5 rounded-xl transition shadow-2xs">Key</button>
              <button onclick="deleteEmp('${e.id}')" class="text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 px-2.5 py-1.5 rounded-xl transition">Archive</button>
              ${(currentEmpStoreTab==='OFFICIAL' && currentUser && (currentUser.role==='Admin' || currentUser.username==='admin')) ? `<button onclick="hardDeleteOfficial('${e.id}','${e.employeeId}','${e.name.replace(/'/g,`\\'`)}')" class="text-xs font-bold bg-red-600 hover:bg-red-700 text-white border border-red-700 px-2.5 py-1.5 rounded-xl shadow-xs" title="Xoá cứng (chỉ Admin) - dùng cho dữ liệu import">Xoá</button>` : ''}
              ${(currentEmpStoreTab==='TRAINING' && currentUser && (currentUser.role==='Admin' || currentUser.username==='admin')) ? `<button onclick="deleteEmp('${e.id}')" class="text-xs font-bold bg-red-600 hover:bg-red-700 text-white border border-red-700 px-2.5 py-1.5 rounded-xl shadow-xs" title="Xoá NV Training (chỉ Admin)">Xoá</button>` : ''}

            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}
function renderBeta(){
  const ws = employees.filter(e=>e.category==='WORKSHOP');
  const off = employees.filter(e=>e.category==='OFFICE');
  const sale = employees.filter(e=>e.category==='SALE');
  const render = (list, elId)=>{
    const el=document.getElementById(elId);
    if(!el) return;
    if(list.length===0) el.innerHTML='<div class="text-xs text-slate-400 text-center py-4">Chưa có nhân viên beta - schema sẵn sàng</div>';
    else el.innerHTML = list.map(e=>`<div class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex justify-between items-center"><span class="text-sm font-bold">${e.name} • ${e.employeeId}</span><span class="text-xs bg-white border px-2 py-1 rounded-full">${e.status}</span></div>`).join('');
  };
  render(ws,'betaWorkshopList');
  render(off,'betaOfficeList');
  render(sale,'betaSaleList');
}
async function updateEmpStatus(employeeId, status){
  if (status === 'WAITING_TEST') {
    const e = employees.find(x => x.employeeId === employeeId || x.id === employeeId);
    if (e) {
      const trainProgress = getEmployeeTrainingProgress(e);
      const isAdmin = currentUser && (currentUser.role === 'Admin' || currentUser.username === 'admin');
      if (trainProgress.completed < 7 && !isAdmin) {
        return showToast(`Khóa Mở TEST — NV chưa hoàn thành đủ 7 ngày điểm danh Training (${trainProgress.completed}/7 ngày)!`, 'error');
      }
    }
  }
  await api('/api/employees/'+employeeId, {method:'PUT', body:JSON.stringify({status}), headers:{Authorization:'Bearer '+token}});
  showToast('Cập nhật: '+status,'success');
  loadEmployees();
}

// ============ 2-OPTION TEST SELECTION MODAL ============
function openTestOptionModal(employeeId) {
  const e = employees.find(x => x.employeeId === employeeId || x.id === employeeId);
  const name = e ? e.name : employeeId;

  openModal('📋 CHỌN PHƯƠNG THỨC TEST ĐẦU RA SAU 7 NGÀY', `
    <div class="space-y-4">
      <div class="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-2xl p-4 shadow">
        <div class="font-black text-base flex items-center gap-2">
          <i class="fa-solid fa-graduation-cap text-purple-300"></i> ${name} (${employeeId})
        </div>
        <div class="text-xs text-purple-200 mt-1">Vui lòng chọn hình thức kiểm tra năng lực đầu ra cho nhân viên</div>
      </div>

      <div class="grid md:grid-cols-2 gap-3">
        <!-- Tùy chọn 1: Web App Online -->
        <div onclick="confirmOption1OnlineTest('${employeeId}')" class="border-2 border-purple-200 hover:border-purple-600 bg-purple-50/40 hover:bg-purple-50 rounded-2xl p-4 cursor-pointer transition shadow-sm hover:shadow-md flex flex-col justify-between group">
          <div>
            <div class="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-lg mb-2 group-hover:scale-110 transition">
              <i class="fa-solid fa-mobile-screen-button"></i>
            </div>
            <div class="font-black text-sm text-purple-950">1. Thi Trực Tuyến Trên Web App</div>
            <div class="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Gửi bài thi trắc nghiệm & tình huống voice E-learning đến Web App nhân viên. 
              <span class="font-bold text-red-600">Đồng thời khóa chức năng Check-in/Check-out</span> của nhân viên trên App.
            </div>
          </div>
          <button class="mt-4 w-full text-xs font-black bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl transition">
            Chọn Tùy Chọn 1 & Khóa Điểm Danh ➔
          </button>
        </div>

        <!-- Tùy chọn 2: Google Meet Interview -->
        <div onclick="openOption2ScheduleModal('${employeeId}')" class="border-2 border-indigo-200 hover:border-indigo-600 bg-indigo-50/40 hover:bg-indigo-50 rounded-2xl p-4 cursor-pointer transition shadow-sm hover:shadow-md flex flex-col justify-between group">
          <div>
            <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg mb-2 group-hover:scale-110 transition">
              <i class="fa-solid fa-video"></i>
            </div>
            <div class="font-black text-sm text-indigo-950">2. Lên Lịch Phỏng Vấn (Google Meet)</div>
            <div class="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Đặt lịch phỏng vấn trực tiếp với HR qua Google Meet. 
              <span class="font-bold text-indigo-700">Mỗi ca bắt buộc cách nhau tối thiểu 1 tiếng 30 phút</span>.
            </div>
          </div>
          <button class="mt-4 w-full text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl transition">
            Lên Lịch Phỏng Vấn Google Meet ➔
          </button>
        </div>
      </div>

      <div class="text-right">
        <button onclick="closeModal()" class="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">Đóng</button>
      </div>
    </div>
  `);
}

async function confirmOption1OnlineTest(employeeId) {
  try {
    const res = await api(`/api/employees/${employeeId}/trigger-online-test`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.success) {
      closeModal();
      showToast('⚡ Đã gửi bài thi Web App & khóa chức năng điểm danh của nhân viên thành công!', 'success');
      loadEmployees();
    } else {
      showToast(res.error || 'Có lỗi xảy ra', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Lỗi kết nối', 'error');
  }
}

function openOption2ScheduleModal(employeeId) {
  const e = employees.find(x => x.employeeId === employeeId || x.id === employeeId);
  const name = e ? e.name : employeeId;

  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  const defaultIsoStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  const defaultMeet = 'https://meet.google.com/ubm-test-' + Math.random().toString(36).substring(7);

  openModal('📅 ĐẶT LỊCH PHỎNG VẤN TEST ĐẦU RA (GOOGLE MEET)', `
    <div class="space-y-4">
      <div class="bg-gradient-to-r from-indigo-900 to-blue-900 text-white rounded-2xl p-4 shadow">
        <div class="font-black text-base flex items-center gap-2">
          <i class="fa-solid fa-calendar-plus text-indigo-300"></i> ${name} (${employeeId})
        </div>
        <div class="text-xs text-indigo-200 mt-1">Lưu ý: Mỗi lịch phỏng vấn TEST phải cách nhau ít nhất <b>1 tiếng 30 phút</b></div>
      </div>

      <div class="space-y-3 bg-white border border-indigo-100 rounded-2xl p-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            <i class="fa-solid fa-clock text-indigo-600"></i> Ngày & Giờ Phỏng Vấn TEST:
          </label>
          <input type="datetime-local" id="meetScheduledAtInput" value="${defaultIsoStr}" class="w-full px-3.5 py-2.5 rounded-xl border border-indigo-200 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            <i class="fa-solid fa-link text-indigo-600"></i> Link Google Meet Phỏng Vấn:
          </label>
          <input type="url" id="meetLinkInput" value="${defaultMeet}" placeholder="https://meet.google.com/..." class="w-full px-3.5 py-2.5 rounded-xl border border-indigo-200 text-sm font-mono font-bold text-slate-900 outline-none focus:border-indigo-600">
        </div>
      </div>

      <div class="flex gap-2">
        <button onclick="openTestOptionModal('${employeeId}')" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl text-xs">◀ Quay lại</button>
        <button onclick="confirmOption2ScheduleTest('${employeeId}')" class="flex-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-black py-2.5 rounded-xl text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-paper-plane"></i> Xác Nhận Đặt Lịch & Tạo Thư Mời
        </button>
      </div>
    </div>
  `);
}

async function confirmOption2ScheduleTest(employeeId) {
  const scheduledAt = document.getElementById('meetScheduledAtInput')?.value;
  const meetLink = document.getElementById('meetLinkInput')?.value;

  if (!scheduledAt) return showToast('Vui lòng chọn thời gian phỏng vấn', 'error');

  try {
    const res = await api(`/api/employees/${employeeId}/schedule-test`, {
      method: 'POST',
      body: JSON.stringify({ scheduledAt, meetLink }),
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.success) {
      closeModal();
      showToast('🎉 Đã đặt lịch phỏng vấn Google Meet & tạo Thư Mời TEST thành công!', 'success');
      loadEmployees();
    } else {
      showToast(res.error || 'Có lỗi xảy ra', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Lỗi đặt lịch', 'error');
  }
}

function openTestInviteModal(employeeId) {
  const e = employees.find(x => x.employeeId === employeeId || x.id === employeeId);
  if (!e) return;

  const ts = e.testSchedule || {};
  const timeStr = ts.scheduledAt ? new Date(ts.scheduledAt).toLocaleString('vi-VN') : 'Chưa xếp';
  const meetLink = ts.meetLink || 'https://meet.google.com/ubm-test-meet';

  const inviteText = `💌 THƯ MỜI PHỎNG VẤN TEST ĐẦU RA ỤM BÒ MILK\n` +
    `--------------------------------------\n` +
    `Kính gửi Nhân viên: ${e.name} (${e.employeeId})\n` +
    `Chi nhánh: ${getBranchDisplay(e.branchId)}\n` +
    `Thời gian phỏng vấn: ${timeStr}\n` +
    `Hình thức: Phỏng vấn trực tuyến qua Google Meet\n` +
    `Link phòng họp Google Meet: ${meetLink}\n` +
    `--------------------------------------\n` +
    `Vui lòng chuẩn bị trang phục tươm tất & có mặt trước 5 phút!`;

  openModal('✉️ THƯ MỜI PHỎNG VẤN TEST ĐẦU RA', `
    <div class="space-y-4">
      <div class="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-4 shadow">
        <div class="font-black text-base flex items-center gap-2">
          <i class="fa-solid fa-envelope-open-text text-blue-300"></i> ${e.name} (${employeeId})
        </div>
        <div class="text-xs text-blue-200 mt-1">Gửi thông tin thư mời phỏng vấn TEST cho nhân viên qua Zalo / SMS</div>
      </div>

      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-all">
${inviteText}
      </div>

      <div class="flex gap-2">
        <button onclick="navigator.clipboard.writeText(\`${inviteText}\`); showToast('Đã sao chép thư mời!','success')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm">
          <i class="fa-solid fa-copy"></i> Sao Chép Thư Mời
        </button>
        <a href="${meetLink}" target="_blank" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 text-center shadow-sm">
          <i class="fa-solid fa-video"></i> Mở Room Meet
        </a>
        <button onclick="closeModal()" class="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl">Đóng</button>
      </div>
    </div>
  `);
}

async function completeMeetTest(employeeId) {
  if (!confirm(`[XÁC NHẬN] Đã hoàn thành buổi phỏng vấn Google Meet với NV ${employeeId}?`)) return;

  try {
    const res = await api(`/api/employees/${employeeId}/complete-meet-test`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.success) {
      showToast('✅ Đã cập nhật hoàn thành phỏng vấn! Tiếp tục bấm nút "📝 Đánh giá" để chấm điểm.', 'success');
      loadEmployees();
    } else {
      showToast(res.error || 'Có lỗi xảy ra', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Lỗi kết nối', 'error');
  }
}

function openTestEvaluationModal(employeeId) {
  const e = employees.find(x => x.employeeId === employeeId || x.id === employeeId);
  if (!e) return;

  const branchName = getBranchDisplay(e.branchId);
  const evaluatorDefault = (currentUser && (currentUser.displayName || currentUser.username)) || 'HR Admin';
  const nowStr = new Date().toLocaleString('vi-VN');

  const part1Questions = [
    "Sữa bò váng mới vắt là gì? Nguồn sữa ở đâu?",
    "Các loại Gu sữa, liệt kê chi tiết 3 gu",
    "Lượng calo & canxi của sữa là bao nhiêu? Hiển thị vị trí nào trên chai?",
    "Các chương trình khuyến mãi thường niên?",
    "Hạn sử dụng từng vị sữa?",
    "Cách bảo quản từng vị sữa?",
    "Sữa ship Tỉnh như thế nào?",
    "Khi khách đến tiệm, Quy trình tư vấn ntn?",
    "Giải quyết tình huống khiếu nại / khẩn cấp",
    "Tóc tai gọn gàng, Áo quần sạch sẽ, không nhăn, nhàu nát, không ngả màu."
  ];

  const part2Questions = [
    "Nắm rõ các quy trình: ướp đá, nhập - hủy sữa, cúng, báo cáo đầu - cuối ca, bàn giao. (hỏi 1 hoặc 2 câu)",
    "Kiểm tra đột xuất các góc khuất vệ sinh cửa hàng.",
    "Liệt kê các thao tác bấm bill bất kỳ",
    "Cách Mở Ca, Đóng ca và bật tắt món trên App và cửa hàng (tùy chi nhánh)",
    "Cách viết và xem sổ bàn giao? Khi nào xem?",
    "Cách Điền và đọc hiểu Phiếu kiểm kê",
    "Cách kiểm kê sữa/bánh và nhận biết chất lượng sữa/bánh bằng mắt",
    "Quy trình báo hạn date sữa?",
    "Cách hủy Sữa tới hạn?",
    "Thao tác kiểm tra, đối chiếu tiền mặt trong két và chuyển khoản trên máy Pos"
  ];

  const renderQuestionRow = (qText, index, prefix) => {
    const name = `${prefix}_${index}`;
    return `
      <div class="bg-white border border-slate-200 rounded-xl p-3 hover:border-purple-300 transition shadow-2xs">
        <div class="text-xs font-bold text-slate-800 leading-snug">
          <span class="text-purple-700 font-mono font-black mr-1">${index + 1}.</span> ${qText}
        </div>
        <div class="mt-2.5 flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-xl p-1.5">
          <label class="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer transition text-[11px] font-bold border border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100 select-none">
            <input type="radio" name="${name}" value="1.0" checked onchange="calcEvalTotal()" class="accent-emerald-600">
            <span>1.0đ (Đúng)</span>
          </label>
          <label class="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer transition text-[11px] font-bold border border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100 select-none">
            <input type="radio" name="${name}" value="0.5" onchange="calcEvalTotal()" class="accent-amber-600">
            <span>0.5đ (Chưa đủ)</span>
          </label>
          <label class="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer transition text-[11px] font-bold border border-rose-200 bg-rose-50/60 text-rose-800 hover:bg-rose-100 select-none">
            <input type="radio" name="${name}" value="0.0" onchange="calcEvalTotal()" class="accent-rose-600">
            <span>0.0đ (Sai)</span>
          </label>
        </div>
      </div>
    `;
  };

  openModal('📋 PHIẾU ĐÁNH GIÁ NHÂN VIÊN CỬA HÀNG (ỤM BÒ MILK)', `
    <div class="space-y-4 max-h-[82vh] overflow-y-auto pr-1">
      
      <!-- Header Banner (Redesigned & Cleaned) -->
      <div class="relative overflow-hidden rounded-2xl p-5 text-white shadow-xl"
           style="background: linear-gradient(135deg, #2e1065 0%, #4c1d95 50%, #1e1b4b 100%); border: 1px solid rgba(216,180,254,0.3);">
        
        <!-- Decorative subtle radial light blob -->
        <div class="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none"
             style="background: radial-gradient(circle, rgba(236,72,153,0.25), transparent 70%);"></div>

        <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-purple-800/80">
          <div>
            <div class="text-[10px] font-black text-pink-400 tracking-widest uppercase flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"></span>
              CÔNG TY TNHH UNIQUE&NICHE • ỤM BÒ MILK
            </div>
            <div class="font-black text-lg text-white mt-1 flex items-center gap-2">
              <div class="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-400/30 flex items-center justify-center text-pink-300 text-sm">
                <i class="fa-solid fa-clipboard-user"></i>
              </div>
              PHIẾU ĐÁNH GIÁ NHÂN VIÊN CỬA HÀNG
            </div>
          </div>
          <div class="bg-white/10 backdrop-blur-md border border-white/15 px-3.5 py-1.5 rounded-xl text-right self-start md:self-auto">
            <div class="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Thời gian chấm</div>
            <div class="font-bold text-xs text-white mt-0.5"><i class="fa-regular fa-clock text-pink-400 mr-1"></i>${nowStr}</div>
          </div>
        </div>

        <!-- Metadata Cards Grid (No Text Overlap) -->
        <div class="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3">
          <!-- NV Name -->
          <div class="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-2.5 flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-pink-500/30 border border-pink-400/40 flex items-center justify-center text-pink-300 text-base font-black flex-shrink-0">
              <i class="fa-solid fa-user"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Họ và tên NV</div>
              <div class="font-black text-sm text-white truncate">${e.name}</div>
            </div>
          </div>

          <!-- Employee ID -->
          <div class="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-2.5 flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-purple-500/30 border border-purple-400/40 flex items-center justify-center text-purple-300 text-base font-black flex-shrink-0">
              <i class="fa-solid fa-id-card"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Mã nhân viên</div>
              <div class="font-mono font-bold text-xs text-pink-300 truncate" title="${employeeId}">${employeeId}</div>
            </div>
          </div>

          <!-- Branch -->
          <div class="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-2.5 flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 text-base font-black flex-shrink-0">
              <i class="fa-solid fa-store"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Chi nhánh</div>
              <div class="font-bold text-xs text-white truncate" title="${branchName}">${branchName}</div>
            </div>
          </div>
        </div>

      </div>

      <!-- Rule Banner -->
      <div class="bg-purple-50 border border-purple-200 rounded-2xl p-3 text-xs text-purple-900 space-y-1">
        <div class="font-black text-purple-950 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-info text-purple-600"></i> Quy tắc chấm điểm:
        </div>
        <div class="text-[11px] leading-relaxed">
          • Chọn <b>1.0đ</b> (Đúng hoàn toàn), <b>0.5đ</b> (Trả lời chưa đầy đủ), <b>0.0đ</b> (Sai hoàn toàn).<br>
          • Đạt khi cả 2 phần đều <b>&gt; 6.0 / 10đ</b>. Không đạt sẽ trừ KPI hoặc thi lại.
        </div>
      </div>

      <!-- PHẦN 1 -->
      <div class="bg-purple-50/40 border-2 border-purple-200 rounded-2xl p-4 space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-purple-200">
          <div class="font-black text-sm text-purple-950 flex items-center gap-2">
            <span class="w-7 h-7 rounded-xl bg-purple-600 text-white text-xs flex items-center justify-center font-black">P1</span>
            PHẦN 1: KIẾN THỨC & ỨNG XỬ (10 câu)
          </div>
          <div class="text-right">
            <span id="p1ScoreBadge" class="text-sm font-black text-purple-700 bg-white border border-purple-300 px-3 py-1 rounded-full">10.0 / 10đ</span>
          </div>
        </div>
        <div class="space-y-2">
          ${part1Questions.map((q, idx) => renderQuestionRow(q, idx, 'p1')).join('')}
        </div>
      </div>

      <!-- PHẦN 2 -->
      <div class="bg-indigo-50/40 border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-indigo-200">
          <div class="font-black text-sm text-indigo-950 flex items-center gap-2">
            <span class="w-7 h-7 rounded-xl bg-indigo-600 text-white text-xs flex items-center justify-center font-black">P2</span>
            PHẦN 2: VẬN HÀNH CỬA HÀNG (10 câu)
          </div>
          <div class="text-right">
            <span id="p2ScoreBadge" class="text-sm font-black text-indigo-700 bg-white border border-indigo-300 px-3 py-1 rounded-full">10.0 / 10đ</span>
          </div>
        </div>
        <div class="space-y-2">
          ${part2Questions.map((q, idx) => renderQuestionRow(q, idx, 'p2')).join('')}
        </div>
      </div>

      <!-- Ghi chú nhận xét -->
      <div class="bg-white border border-slate-200 rounded-2xl p-3.5">
        <label class="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
          <i class="fa-solid fa-comment-dots text-purple-600"></i> Nhận xét của Người đánh giá:
        </label>
        <textarea id="evalNotesInput" rows="2" placeholder="Ghi chú nhận xét chi tiết..." class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-purple-500 font-medium"></textarea>
      </div>

      <!-- Footer Action -->
      <div class="sticky bottom-0 z-10 bg-slate-900 text-white rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-xl border border-slate-700">
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TỔNG ĐIỂM BÀI TEST:</div>
          <div class="flex items-center gap-3 mt-1">
            <span id="evalTotalScoreBadge" class="text-2xl font-black text-emerald-400">20.0 / 20đ</span>
            <span id="evalResultStatusBadge" class="text-xs font-black px-3 py-1.5 rounded-full bg-emerald-500 text-white">🎉 ĐẠT (Cả 2 phần > 6.0đ)</span>
          </div>
        </div>
        <button onclick="confirmSubmitEvaluation('${employeeId}')" class="w-full md:w-auto bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-black px-6 py-3 rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-2">
          <i class="fa-solid fa-floppy-disk"></i> HOÀN TẤT & LƯU PHIẾU ĐÁNH GIÁ
        </button>
      </div>

    </div>
  `);
  calcEvalTotal();
}

function calcEvalTotal() {
  let p1Total = 0;
  for (let i = 0; i < 10; i++) {
    const sel = document.querySelector(`input[name="p1_${i}"]:checked`);
    if (sel) p1Total += Number(sel.value) || 0;
  }

  let p2Total = 0;
  for (let i = 0; i < 10; i++) {
    const sel = document.querySelector(`input[name="p2_${i}"]:checked`);
    if (sel) p2Total += Number(sel.value) || 0;
  }

  const total = p1Total + p2Total;

  const p1Badge = document.getElementById('p1ScoreBadge');
  const p2Badge = document.getElementById('p2ScoreBadge');
  const scoreBadge = document.getElementById('evalTotalScoreBadge');
  const statusBadge = document.getElementById('evalResultStatusBadge');

  if (p1Badge) p1Badge.textContent = `${p1Total.toFixed(1)} / 10đ`;
  if (p2Badge) p2Badge.textContent = `${p2Total.toFixed(1)} / 10đ`;
  if (scoreBadge) scoreBadge.textContent = `${total.toFixed(1)} / 20đ`;

  const isPassed = p1Total > 6 && p2Total > 6;

  if (statusBadge) {
    if (isPassed) {
      statusBadge.className = 'text-xs font-black px-3 py-1.5 rounded-full bg-emerald-500 text-white shadow-sm';
      statusBadge.textContent = '🎉 ĐẠT (P1 & P2 đều > 6.0đ)';
    } else {
      statusBadge.className = 'text-xs font-black px-3 py-1.5 rounded-full bg-rose-600 text-white shadow-sm';
      statusBadge.textContent = `⚠️ CHƯA ĐẠT (${p1Total <= 6 ? 'P1 ≤ 6.0đ ' : ''}${p2Total <= 6 ? 'P2 ≤ 6.0đ' : ''})`;
    }
  }
}

async function confirmSubmitEvaluation(employeeId) {
  const evaluatorName = (currentUser && (currentUser.displayName || currentUser.username)) || 'HR';
  const shiftType = 'Cố định';
  const notes = document.getElementById('evalNotesInput')?.value || '';

  const part1Scores = [];
  for (let i = 0; i < 10; i++) {
    const sel = document.querySelector(`input[name="p1_${i}"]:checked`);
    part1Scores.push(sel ? Number(sel.value) : 0);
  }

  const part2Scores = [];
  for (let i = 0; i < 10; i++) {
    const sel = document.querySelector(`input[name="p2_${i}"]:checked`);
    part2Scores.push(sel ? Number(sel.value) : 0);
  }

  const p1Total = part1Scores.reduce((a, b) => a + b, 0);
  const p2Total = part2Scores.reduce((a, b) => a + b, 0);
  const totalScore = p1Total + p2Total;

  try {
    const res = await api(`/api/employees/${employeeId}/evaluate-test`, {
      method: 'POST',
      body: JSON.stringify({ 
        evaluatorName, 
        shiftType, 
        part1Scores, 
        part2Scores, 
        p1Total,
        p2Total,
        totalScore,
        notes 
      }),
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.success) {
      closeModal();
      const p1 = res.p1Total !== undefined ? res.p1Total : p1Total;
      const p2 = res.p2Total !== undefined ? res.p2Total : p2Total;
      const total = res.totalScore !== undefined ? res.totalScore : totalScore;
      const isPassed = res.isPassed !== undefined ? res.isPassed : (p1 > 6 && p2 > 6);

      if (isPassed) {
        showToast(`🎉 ĐÁNH GIÁ ĐẠT! Tổng ${total.toFixed(1)}/20đ (P1: ${p1.toFixed(1)}đ, P2: ${p2.toFixed(1)}đ). Mở khóa Nhân viên Chính thức!`, 'success');
      } else {
        showToast(`⚠️ CHƯA ĐẠT (${total.toFixed(1)}/20đ). P1: ${p1.toFixed(1)}đ, P2: ${p2.toFixed(1)}đ (cần > 6.0đ mỗi phần). Sắp xếp thi lại!`, 'error');
      }
      loadEmployees();
    } else {
      showToast(res.error || 'Có lỗi xảy ra', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Lỗi chấm điểm', 'error');
  }
}
async function simulate7DaysTraining(employeeId) {
  if (!confirm(`[ADMIN TEST] Tự động hoàn thành đủ 7 ngày Training cho NV ${employeeId}?`)) return;
  try {
    const res = await api(`/api/employees/${employeeId}/simulate-7days-training`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.success) {
      showToast(`⚡ ADMIN TEST: Đã tự động hoàn thành đủ 7 ngày Training cho NV ${employeeId}!`, 'success');
      loadEmployees();
    } else {
      showToast(res.error || 'Có lỗi xảy ra', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Lỗi kết nối', 'error');
  }
}
function transitionOfficial(employeeId){
  const isAdminOrHR = currentUser && (['Admin','HR'].includes(currentUser.role) || currentUser.username === 'admin');
  if (!isAdminOrHR) {
    return showToast('Khóa nút Chính thức — Chỉ Admin/HR mới có quyền!', 'error');
  }

  const e = employees.find(x=>x.employeeId===employeeId || x.id===employeeId);
  const name = e ? e.name : '';
  const todayStr = new Date().toISOString().split('T')[0];

  openModal('🎓 XÁC NHẬN CHUYỂN CHÍNH THỨC & CẬP NHẬT NGÀY BẮT ĐẦU', `
    <div class="space-y-4">
      <div class="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-4 text-white">
        <div class="font-black text-base flex items-center gap-2">
          <i class="fa-solid fa-user-check"></i> ${name} (${employeeId})
        </div>
        <div class="text-xs opacity-90 mt-1">Chuyển từ Thử việc (12 ngày) ➔ Nhân viên chính thức (OFFICIAL)</div>
      </div>

      <div class="space-y-3 bg-white border border-pink-200 rounded-2xl p-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            <i class="fa-solid fa-calendar-day text-pink-500"></i> Ngày Bắt Đầu Làm Chính Thức:
          </label>
          <input type="date" id="officialStartDateInput" value="${todayStr}" class="w-full px-3 py-2.5 rounded-xl border border-pink-200 text-sm font-bold text-slate-800 outline-none focus:border-pink-500">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            <i class="fa-solid fa-business-time text-pink-500"></i> Ca Làm Việc Chính Thức:
          </label>
          <select id="officialShiftInput" class="w-full px-3 py-2.5 rounded-xl border border-pink-200 text-sm font-bold text-slate-800 outline-none focus:border-pink-500">
            <option value="CA_SANG" ${e?.shift==='CA_SANG'?'selected':''}>CA SÁNG (06h - 12h)</option>
            <option value="CA_TRUA" ${e?.shift==='CA_TRUA'?'selected':''}>CA TRƯA (12h - 18h)</option>
            <option value="CA_TOI" ${e?.shift==='CA_TOI'?'selected':''}>CA TỐI (18h - 23h)</option>
          </select>
        </div>
      </div>

      <div class="flex gap-2">
        <button onclick="closeModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl">Hủy</button>
        <button onclick="confirmTransitionOfficial('${employeeId}')" class="flex-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black py-2.5 rounded-xl shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-user-check"></i> Xác Nhận Chính Thức & Tự Động Xếp Ca
        </button>
      </div>
    </div>
  `);
}

async function confirmTransitionOfficial(employeeId) {
  const officialStartDate = document.getElementById('officialStartDateInput')?.value;
  const shift = document.getElementById('officialShiftInput')?.value;

  if (!officialStartDate) return showToast('Vui lòng chọn ngày bắt đầu chính thức', 'error');

  try {
    await api('/api/employees/' + employeeId + '/transition', {
      method: 'POST',
      body: JSON.stringify({ officialStartDate, shift, target: 'OFFICIAL' }),
      headers: { Authorization: 'Bearer ' + token }
    });
    closeModal();
    showToast('🎉 Đã chuyển sang Nhân viên chính thức & tự động kích hoạt lịch làm việc mới!', 'success');
    loadEmployees();
    if (typeof loadSchedules === 'function') loadSchedules();
  } catch (err) {
    showToast(err.message || 'Lỗi khi chuyển chính thức', 'error');
  }
}
async function deleteEmp(id){
  if(!confirm('Chuyển ARCHIVED (không xóa vĩnh viễn)?')) return;
  await api('/api/employees/'+id, {method:'DELETE', headers:{Authorization:'Bearer '+token}});
  showToast('Đã chuyển ARCHIVED','success');
  loadEmployees();
}
async function hardDeleteOfficial(id, employeeId, name){
  if(!confirm(`⚠️ Admin: Xoá VĨNH VIỄN nhân viên Chính thức "${name}" (${employeeId})?\n\n• Dữ liệu import sẽ bị xoá khỏi DB, Keys, Schedules, Chấm công, OFF\n• Không thể khôi phục!`)) return;
  try{
    await api('/api/employees/'+id+'?hard=true', {method:'DELETE', headers:{Authorization:'Bearer '+token}});
    showToast(`Đã xoá vĩnh viễn ${name} (${employeeId})`,'success');
    loadEmployees();
  }catch(e){ showToast(e.message,'error'); }
}
function viewEmployee(id){
  const e = employees.find(x=>x.id===id || x.employeeId===id);
  if(!e) return;
  const key = dbKeysFind(e.employeeId);
  openModal('Hồ sơ nhân viên - '+e.name, `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div><div class="text-xs font-bold text-slate-500">Mã NV</div><div class="font-mono font-black">${e.employeeId}</div></div>
        <div><div class="text-xs font-bold text-slate-500">Trạng thái</div><div class="font-black">${e.status} • ${e.type}</div></div>
        <div><div class="text-xs font-bold text-slate-500">Chi nhánh</div><div class="font-bold">${getBranchFull(e.branchId)}</div></div>
        <div><div class="text-xs font-bold text-slate-500">Ca</div><div class="font-bold">${e.shift}</div></div>
        <div><div class="text-xs font-bold text-slate-500">Bắt đầu</div><div>${fmtDMY(e.startDate)}</div></div>
        <div><div class="text-xs font-bold text-slate-500">Kết thúc</div><div>${fmtDMY(e.endDate)||'—'}</div></div>
        <div><div class="text-xs font-bold text-slate-500">TEST</div><div class="font-black ${e.testScore<5?'text-red-600':e.testScore<=7?'text-amber-600':'text-green-600'}">${e.testScore??'Chưa thi'} ${e.testResult?`• ${e.testResult}`:''}</div></div>
        <div><div class="text-xs font-bold text-slate-500">Key</div><div class="font-mono text-xs">${key?key.key:'Chưa có'}</div></div>
      </div>
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
        <div class="font-black">Lịch sử Check-in/out</div>
        <div id="modalHistory" class="mt-2 space-y-1"></div>
      </div>
      <div class="flex gap-2">
        <button onclick="openKey('${e.employeeId}')" class="flex-1 bg-pink-500 text-white font-bold py-2 rounded-xl">Quản lý Key</button>
        <button onclick="closeModal()" class="flex-1 bg-white border border-slate-200 font-bold py-2 rounded-xl">Đóng</button>
      </div>
    </div>
  `);
  // load history
  api('/api/attendances?employeeId='+e.employeeId).then(list=>{
    document.getElementById('modalHistory').innerHTML = list.length? list.slice(0,5).map(a=>`<div class="flex justify-between bg-white border rounded-lg px-2 py-1"><span>${fmtDMY(a.date)} • ${a.shift}</span><span class="font-bold ${a.status==='COMPLETED'?'text-green-600':''}">${a.status}</span></div>`).join('') : '<div class="text-slate-400">Chưa có</div>';
  });
}
function dbKeysFind(eid){
  return (window._keys||[]).find(k=>k.employeeId===eid);
}
async function openKey(employeeId){
  window._keys = await api('/api/keys', {headers:{Authorization:'Bearer '+token}});
  const k = window._keys.find(x=>x.employeeId===employeeId);
  const emp = employees.find(e=>e.employeeId===employeeId);
  openModal('Key kích hoạt & Device Binding', `
    <div class="space-y-4">
      <div class="bg-pink-50 border border-pink-200 rounded-xl p-3">
        <div class="text-xs font-black text-pink-700">Employee ID</div><div class="font-mono font-bold">${employeeId}</div><div class="text-xs text-pink-700">${emp?.name} • ${getBranchDisplay(emp?.branchId)} • ${emp?.shift}</div>
      </div>
      ${k?`
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-slate-50 border rounded-xl p-3"><div class="text-xs font-bold text-slate-500">Activation Key</div><div class="font-mono font-black text-lg">${k.key}</div><div class="text-[11px] text-slate-500">Status: ${k.status}</div></div>
          <div class="bg-slate-50 border rounded-xl p-3"><div class="text-xs font-bold text-slate-500">Device Binding</div><div class="font-mono text-xs">${k.deviceId||'Chưa gắn thiết bị'}</div><div class="text-[11px] text-slate-500">${k.boundAt? fmtDMYTime(k.boundAt):''}</div></div>
        </div>
        <div class="flex gap-2">
          <button onclick="generateKey('${employeeId}')" class="flex-1 bg-pink-500 text-white font-bold py-2 rounded-xl">Cấp lại Key (Revoke cũ)</button>
          <button onclick="revokeKey('${k.id}')" class="flex-1 bg-red-50 text-red-600 border border-red-200 font-bold py-2 rounded-xl">Revoke Device</button>
        </div>
        <div class="text-[11px] text-slate-500 bg-slate-50 border rounded-xl p-2">Mỗi Key chỉ 1 thiết bị. Đổi điện thoại cần duyệt → revoke. Audit log ghi lại.</div>
      `:`<button onclick="generateKey('${employeeId}')" class="w-full bg-pink-500 text-white font-bold py-2 rounded-xl">Tạo Key</button>`}
    </div>
  `);
}
async function generateKey(employeeId){
  await api('/api/keys/generate', {method:'POST', body:JSON.stringify({employeeId}), headers:{Authorization:'Bearer '+token}});
  showToast('Đã cấp Key mới','success');
  openKey(employeeId);
}
async function revokeKey(id){
  await api('/api/keys/'+id+'/revoke', {method:'POST', headers:{Authorization:'Bearer '+token}});
  showToast('Đã revoke thiết bị','success');
  closeModal();
}
function openAddEmployee(){
  openModal('Thêm nhân viên', `
    <div class="space-y-3">
      <input id="eName" placeholder="Họ tên" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
      <input id="ePhone" placeholder="SĐT" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm">
      <div class="grid grid-cols-2 gap-3">
        <select id="eBranch" class="px-3 py-2.5 rounded-xl border border-slate-200 text-sm">${branches.map(b=>`<option value="${b.id}">${b.name}</option>`).join('')}</select>
        <select id="eShift" class="px-3 py-2.5 rounded-xl border border-slate-200 text-sm"><option>CA_SANG</option><option>CA_CHIEU</option><option>CA_TOI</option></select>
      </div>
      <select id="eCat" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"><option value="STORE">Cửa hàng</option><option value="WORKSHOP">Xưởng (Beta)</option><option value="OFFICE">Văn phòng (Beta)</option><option value="SALE">Sale (Beta)</option></select>
      <button onclick="submitAddEmployee()" class="w-full bg-pink-500 hover:bg-pink-600 text-white font-black py-2.5 rounded-xl">Tạo & Sinh mã NV</button>
      <div class="text-[11px] text-slate-500 bg-pink-50 border border-pink-200 rounded-xl p-2">Mã NV tự sinh: [PREFIX]_UBMDDMMYYYY_NVxxxx (duy nhất, không cho NV tự sửa)</div>
    </div>
  `);
}
async function submitAddEmployee(){
  const body={name:document.getElementById('eName').value, phone:document.getElementById('ePhone').value, branchId:document.getElementById('eBranch').value, shift:document.getElementById('eShift').value, category:document.getElementById('eCat').value};
  if(!body.name||!body.phone) return showToast('Thiếu thông tin','error');
  const res = await api('/api/employees', {method:'POST', body:JSON.stringify(body), headers:{Authorization:'Bearer '+token}});
  closeModal(); loadEmployees(); showToast('Đã tạo: '+res.employee.employeeId,'success');
}

// Schedules - 5 categories
let currentScheduleCategory = 'TRAINING';
function switchScheduleCategory(cat){
  currentScheduleCategory = cat;
  const cats = ['TRAINING','OFFICIAL','WORKSHOP','OFFICE','SALE'];
  cats.forEach(c=>{
    const btn = document.getElementById('schedTab-'+c);
    if(!btn) return;
    if(c===cat){
      btn.className = 'flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black transition bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow';
    } else {
      btn.className = 'flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition bg-white border border-pink-200 text-pink-700 hover:bg-pink-50';
    }
  });
  const labels = {TRAINING:'Lịch Nhân viên Training', OFFICIAL:'Lịch Nhân viên Chính thức', WORKSHOP:'Lịch Nhân viên Xưởng', OFFICE:'Lịch Nhân viên Văn phòng', SALE:'Lịch Nhân viên Sale'};
  const lbl = document.getElementById('scheduleCategoryLabel');
  if(lbl) lbl.textContent = (labels[cat]||cat) + ' • T2→CN';
  renderSchedules();
}
function getMondayStr(dStr) {
  if (!dStr) return new Date().toISOString().split('T')[0];
  const parts = dStr.split('T')[0].split('-').map(Number);
  let date;
  if (parts.length === 3 && !isNaN(parts[0])) {
    date = new Date(parts[0], parts[1] - 1, parts[2]);
  } else {
    date = new Date(dStr);
  }
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isScheduleInCategory(sched, cat){
  const emp = employees.find(e=>e.employeeId===sched.employeeId);
  const category = emp ? (emp.category || 'STORE') : 'STORE';
  const type = emp ? (emp.type || (emp.status === 'TRAINING' ? 'TRAINING' : 'OFFICIAL')) : 'TRAINING';
  const status = emp ? emp.status : 'TRAINING';

  if(cat==='TRAINING') return (category==='STORE' || !category) && (type==='TRAINING' || status==='TRAINING');
  if(cat==='OFFICIAL') return (category==='STORE' || !category) && (type==='OFFICIAL' || status==='OFFICIAL');
  if(cat==='WORKSHOP') return category==='WORKSHOP';
  if(cat==='OFFICE') return category==='OFFICE';
  if(cat==='SALE') return category==='SALE';
  return cat==='TRAINING';
}
function changeScheduleWeek(offsetDays) {
  const weekInput = document.getElementById('scheduleWeek');
  if (!weekInput) return;

  let currentVal = weekInput.value;
  let currentDate;
  if (currentVal) {
    const parts = currentVal.split('-').map(Number);
    currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
  } else {
    currentDate = new Date();
  }

  currentDate.setDate(currentDate.getDate() + offsetDays);

  const y = currentDate.getFullYear();
  const m = String(currentDate.getMonth() + 1).padStart(2, '0');
  const d = String(currentDate.getDate()).padStart(2, '0');

  weekInput.value = `${y}-${m}-${d}`;
  loadSchedules();
}

async function loadSchedules(){
  const branch = document.getElementById('scheduleBranch')?.value || '';
  const weekVal = document.getElementById('scheduleWeek')?.value || '';
  let url = '/api/schedules?';
  if (branch) url += 'branch=' + branch + '&';
  if (weekVal) url += 'weekStart=' + weekVal;

  try { employees = await api('/api/employees'); } catch(e) {}
  try { branches = await api('/api/branches'); } catch(e) {}
  try { attendances = await api('/api/attendances'); } catch(e) {}
  schedules = await api(url);
  // update counts for badges - realtime ràng buộc với NV Cửa hàng (đếm nhân viên, không đếm schedule record)
  try{
    let filteredEmps = employees;
    if(branch) filteredEmps = filteredEmps.filter(e=>e.branchId===branch);
    const counts = {
      TRAINING: filteredEmps.filter(e=> (e.category==='STORE'||!e.category) && (e.type==='TRAINING' || (e.status!=='OFFICIAL' && e.type!=='OFFICIAL'))).length,
      OFFICIAL: filteredEmps.filter(e=> (e.category==='STORE'||!e.category) && (e.type==='OFFICIAL' || e.status==='OFFICIAL')).length,
      WORKSHOP: filteredEmps.filter(e=>e.category==='WORKSHOP').length,
      OFFICE: filteredEmps.filter(e=>e.category==='OFFICE').length,
      SALE: filteredEmps.filter(e=>e.category==='SALE').length,
    };
    const setCount = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    // Dùng counts (số nhân viên) để đồng bộ với tab NV Cửa hàng - realtime
    setCount('countTraining', counts.TRAINING);
    setCount('countOfficial', counts.OFFICIAL);
    setCount('countWorkshop', counts.WORKSHOP);
    setCount('countOffice', counts.OFFICE);
    setCount('countSale', counts.SALE);
  }catch(e){}
  renderSchedules();
}
function renderSchedules(){
  const grid=document.getElementById('scheduleGrid');
  const countEl=document.getElementById('scheduleCategoryCount');
  if(!grid) return;
  // filter by current category
  let filtered = schedules.filter(s=>isScheduleInCategory(s, currentScheduleCategory));
  // also apply branch already filtered via API, but double check
  const branch=document.getElementById('scheduleBranch')?.value||'';
  if(branch){
    filtered = filtered.filter(s=>{
      const emp = employees.find(e=>e.employeeId===s.employeeId);
      return emp && emp.branchId===branch;
    });
  }
  if(countEl) countEl.textContent = filtered.length + ' lịch • ' + currentScheduleCategory;
  if(filtered.length===0){
    const emptyMsg = {
      TRAINING: 'Chưa có lịch Training - nhân viên đang trong 7 ngày đào tạo',
      OFFICIAL: 'Chưa có lịch Chính thức - nhân viên đã đạt TEST >7',
      WORKSHOP: 'Chưa có lịch Xưởng (Beta) - schema sẵn sàng',
      OFFICE: 'Chưa có lịch Văn phòng (Beta) - schema sẵn sàng',
      SALE: 'Chưa có lịch Sale (Beta) - schema sẵn sàng'
    };
    grid.innerHTML = `<div class="bg-white rounded-2xl border border-pink-200 p-8 text-center shadow-sm"><div class="w-12 h-12 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center mx-auto"><i class="fa-solid fa-calendar-xmark"></i></div><div class="font-bold text-pink-900 mt-3">${emptyMsg[currentScheduleCategory]||'Chưa có lịch'}</div><div class="text-sm text-slate-500 mt-1">Bộ lọc: ${currentScheduleCategory} ${branch?'• '+branch:''} • T2→CN (dd/MM/yyyy)</div></div>`;
    return;
  }
  // === GROUP BY BRANCH + SORT BY SHIFT SÁNG->CHIỀU->TỐI ===
  const SHIFT_ORDER = {CA_SANG:0, CA_CHIEU:1, CA_TOI:2};
  const SHIFT_DETAIL = {
    CA_SANG: {label:'Ca Sáng', time:'07:00-12:00', hours:5, color:'bg-amber-100 text-amber-700 border-amber-200'},
    CA_CHIEU: {label:'Ca Chiều', time:'12:00-18:00', hours:6, color:'bg-pink-100 text-pink-700 border-pink-200'},
    CA_TOI: {label:'Ca Tối', time:'18:00-23:00', hours:5, color:'bg-indigo-100 text-indigo-700 border-indigo-200'}
  };
  const branchGrouped = {};
  filtered.forEach(s=>{
    const emp = employees.find(e=>e.employeeId===s.employeeId);
    const bid = emp?.branchId || s.branchId || 'UNKNOWN';
    if(!branchGrouped[bid]) branchGrouped[bid] = {};

    const empId = s.employeeId;
    if(!branchGrouped[bid][empId]){
      branchGrouped[bid][empId] = {
        emp,
        employeeId: empId,
        schedules: []
      };
    }
    branchGrouped[bid][empId].schedules.push(s);
  });

  const branchOrder = ['CN1','CN2','CN3','CN4'];
  const sortedBranchIds = Object.keys(branchGrouped).sort((a,b)=>{
    const ia = branchOrder.indexOf(a); const ib = branchOrder.indexOf(b);
    if(ia!==-1 && ib!==-1) return ia-ib;
    if(ia!==-1) return -1;
    if(ib!==-1) return 1;
    return a.localeCompare(b);
  });

  grid.innerHTML = sortedBranchIds.map(bid=>{
    const branchInfo = branches.find(b=>b.id===bid);
    const branchFull = branchInfo ? `${branchInfo.id} - ${branchInfo.address}` : bid;
    
    const empList = Object.values(branchGrouped[bid]);

    empList.sort((a,b)=>{
      const shiftA = a.emp?.shift || a.schedules[0]?.shift || '';
      const shiftB = b.emp?.shift || b.schedules[0]?.shift || '';
      const orderA = SHIFT_ORDER[shiftA] ?? 99;
      const orderB = SHIFT_ORDER[shiftB] ?? 99;
      if(orderA!==orderB) return orderA-orderB;
      return (a.emp?.name||a.employeeId).localeCompare(b.emp?.name||b.employeeId);
    });

    const sang = empList.filter(item=> (item.emp?.shift||item.schedules[0]?.shift)==='CA_SANG').length;
    const chieu = empList.filter(item=> (item.emp?.shift||item.schedules[0]?.shift)==='CA_CHIEU').length;
    const toi = empList.filter(item=> (item.emp?.shift||item.schedules[0]?.shift)==='CA_TOI').length;

    return `
      <div class="bg-white rounded-2xl border-2 border-pink-300 overflow-hidden shadow-sm">
        <div class="px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center font-black text-sm border border-white/20">${bid}</div>
            <div>
              <div class="font-black text-sm leading-none">${branchFull}</div>
              <div class="text-xs font-medium text-white/90">${empList.length} nhân viên • Hiển thị 1 dòng/nhân viên</div>
            </div>
          </div>
          <div class="flex gap-1.5 flex-wrap">
            <span class="text-[11px] font-bold bg-white text-pink-600 px-2 py-1 rounded-full shadow">SÁNG ${sang}</span>
            <span class="text-[11px] font-bold bg-white text-pink-600 px-2 py-1 rounded-full shadow">CHIỀU ${chieu}</span>
            <span class="text-[11px] font-bold bg-white text-pink-600 px-2 py-1 rounded-full shadow">TỐI ${toi}</span>
          </div>
        </div>
        <div class="p-3 space-y-3 bg-pink-50/30">
          ${empList.map(item=>{
            const emp = item.emp || {};
            const shiftKey = emp.shift || item.schedules[0]?.shift;
            const shiftInfo = SHIFT_DETAIL[shiftKey] || {label:shiftKey, time:'', hours:''};
            const branchFull2 = getBranchFull(emp.branchId || bid);

            const todayObj = new Date();
            const todayY = todayObj.getFullYear();
            const todayM = String(todayObj.getMonth() + 1).padStart(2, '0');
            const todayD = String(todayObj.getDate()).padStart(2, '0');
            const todayStr = `${todayY}-${todayM}-${todayD}`;

            const allDaysMap = {};
            item.schedules.forEach(sch=>{
              (sch.days||[]).forEach(d=>{
                allDaysMap[d.date] = d;
              });
            });

            const curMonStr = getMondayStr(todayStr);
            const selectedWeekVal = document.getElementById('scheduleWeek')?.value;
            let targetWeekStart = selectedWeekVal ? getMondayStr(selectedWeekVal) : curMonStr;

            const schWithTargetMon = item.schedules.find(s=>s.weekStart===targetWeekStart);
            if(!schWithTargetMon && item.schedules.length>0 && !selectedWeekVal){
              targetWeekStart = item.schedules[0].weekStart;
            }

            const dayNamesList = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
            const wParts = targetWeekStart.split('-').map(Number);
            const wDateObj = (wParts.length === 3 && !isNaN(wParts[0])) 
              ? new Date(wParts[0], wParts[1] - 1, wParts[2]) 
              : new Date();

            const displayDays = dayNamesList.map((dName, i) => {
              const currD = new Date(wDateObj);
              currD.setDate(wDateObj.getDate() + i);
              const y = currD.getFullYear();
              const m = String(currD.getMonth() + 1).padStart(2, '0');
              const d = String(currD.getDate()).padStart(2, '0');
              const dateStr = `${y}-${m}-${d}`;

              const found = allDaysMap[dateStr];
              const isPast = dateStr < todayStr;
              const isWorking = found ? (found.status === 'WORKING' || found.status === 'SUBSTITUTE') : (!isPast);

              return {
                date: dateStr,
                dayName: dName,
                shift: found ? found.shift : (emp.shift || 'CA_SANG'),
                status: isWorking ? (found?.status || 'WORKING') : (found?.status || 'OFF'),
                substituteFor: found ? found.substituteFor : null,
                isPast,
                isWorking
              };
            });

            const startDateRange = `Tuần ${fmtDMY(targetWeekStart)}`;

            return `
              <div class="bg-white rounded-2xl border border-pink-200 overflow-hidden shadow-sm">
                <div class="px-3 py-2 bg-white border-b border-pink-100 flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 text-white flex items-center justify-center font-black text-xs shadow">${emp.name?.split(' ').pop()?.[0]||'?'}</div>
                    <div>
                      <div class="font-black text-sm text-pink-900 leading-none">${emp.name || item.employeeId}</div>
                      <div class="text-[11px] font-mono text-slate-500">${emp.employeeId || item.employeeId} • ${emp.phone || ''}</div>
                      <div class="text-[11px] font-bold text-pink-700">${branchFull2}</div>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[11px] font-black px-2 py-1 rounded-full ${emp.type==='OFFICIAL'?'bg-pink-500 text-white':'bg-blue-100 text-blue-700 border border-blue-200'}">${(emp.type==='OFFICIAL' ? (emp.officialStartDate && new Date().toISOString().split('T')[0] < emp.officialStartDate ? 'Chưa chính thức' : 'Chính thức') : getStatusVi(emp.type||'')+' '+getStatusVi(emp.status||''))}</span>
                    ${(emp.type==='TRAINING' && (emp.status === 'WAITING_OFFICIAL' || (emp.status === 'TRAINING' && typeof getTrainingCompletedDays === 'function' && getTrainingCompletedDays(emp) >= 7))) ? `<span class="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-500 text-white shadow-xs animate-pulse flex items-center gap-1" title="Khóa lịch: NV đã hoàn thành đủ 7 ngày Training — Chờ HR duyệt Chính thức"><i class="fa-solid fa-lock"></i> 🔒 Đã 7/7 Training (Khóa lịch)</span>` : ''}
                    <span class="text-xs font-bold bg-white border border-pink-200 text-pink-700 px-2.5 py-1 rounded-full"><i class="fa-solid fa-calendar-week text-pink-500"></i> ${startDateRange}</span>
                  </div>
                </div>
                <div class="grid grid-cols-7 gap-1 p-2 bg-slate-50/50">
                  ${displayDays.map(d=>{
                    const att = (typeof attendances!=='undefined' ? attendances : []).find(a=>a.employeeId===(emp.employeeId||emp.id) && a.date===d.date);
                    const isWaiting = d.status==='WAITING_OFFICIAL';
                    const isOffDay = d.status==='OFF';
                    const isFuture = d.date > todayStr;
                    let badgeText='', badgeClass='', detailText='', detailClass='';
                    if(isWaiting){
                      badgeText='CHỜ CHÍNH THỨC';
                      badgeClass='bg-slate-100 text-slate-500 border border-slate-200';
                      detailText='Chưa gán ca';
                      detailClass='text-slate-500';
                    } else if(isOffDay){
                      badgeText='NGHỈ (OFF)';
                      badgeClass='bg-slate-200 text-slate-600';
                      detailText='—';
                      detailClass='text-slate-400';
                    } else if(isFuture){
                      badgeText='SẮP TỚI';
                      badgeClass='bg-blue-50 text-blue-700 border border-blue-200';
                      detailText=d.shift + (SHIFT_DETAIL[d.shift]?.time ? ' • ' + SHIFT_DETAIL[d.shift].time : '');
                      detailClass='text-blue-700';
                    } else {
                      if(!att || !att.checkIn){
                        badgeText='✗ VẮNG';
                        badgeClass='bg-red-500 text-white';
                        detailText='Không đi làm';
                        detailClass='text-red-600 font-bold';
                      } else if(att.checkIn && !att.checkOut){
                        badgeText='⚠ THIẾU OUT';
                        badgeClass='bg-amber-400 text-white';
                        detailText=`IN ${att.checkIn.time} • Thiếu OUT`;
                        detailClass='text-amber-700';
                      } else if(att.violations && att.violations.includes('LATE') && att.violations.includes('EARLY_LEAVE')){
                        badgeText='⚠ TRỄ + VỀ SỚM';
                        badgeClass='bg-orange-500 text-white';
                        detailText=`IN ${att.checkIn.time} • OUT ${att.checkOut.time}`;
                        detailClass='text-orange-600';
                      } else if(att.violations && att.violations.includes('LATE')){
                        badgeText='⚠ TRỄ';
                        badgeClass='bg-orange-500 text-white';
                        detailText=`IN ${att.checkIn.time} (trễ) • OUT ${att.checkOut.time}`;
                        detailClass='text-orange-600';
                      } else if(att.violations && att.violations.includes('EARLY_LEAVE')){
                        badgeText='⚠ VỀ SỚM';
                        badgeClass='bg-orange-400 text-white';
                        detailText=`IN ${att.checkIn.time} • OUT ${att.checkOut.time} (sớm)`;
                        detailClass='text-orange-600';
                      } else if(att.violations && att.violations.includes('NO_CHECKOUT')){
                        badgeText='⚠ THIẾU OUT';
                        badgeClass='bg-amber-400 text-white';
                        detailText=`IN ${att.checkIn.time}`;
                        detailClass='text-amber-700';
                      } else {
                        badgeText='✔ ĐÚNG GIỜ';
                        badgeClass='bg-emerald-500 text-white';
                        detailText=`IN ${att.checkIn.time} • OUT ${att.checkOut.time}`;
                        detailClass='text-emerald-700';
                      }
                    }
                    const baseBg = isWaiting ? 'bg-slate-100 border-slate-200' : isOffDay ? 'bg-slate-50 border-slate-200' : badgeText.includes('VẮNG') ? 'bg-red-50 border-red-200' : badgeText.includes('THIẾU') ? 'bg-amber-50 border-amber-200' : badgeText.includes('TRỄ')||badgeText.includes('VỀ SỚM') ? 'bg-orange-50 border-orange-200' : badgeText.includes('ĐÚNG GIỜ') ? 'bg-emerald-50 border-emerald-200' : isFuture ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-pink-300 shadow-2xs';
                    return `
                      <div class="rounded-xl border p-2 text-center ${baseBg}">
                        <div class="text-[11px] font-black ${isOffDay?'text-slate-600': d.isWorking?'text-pink-700':'text-slate-600'}">${d.dayName}</div>
                        <div class="text-[11px] font-mono ${isOffDay?'text-slate-500':'text-pink-900'}">${fmtDMYShort(d.date)}</div>
                        <div class="text-[10px] text-slate-500">${fmtDMY(d.date)}</div>
                        <div class="text-[10px] font-bold mt-1 px-1 py-0.5 rounded-full ${badgeClass}">${badgeText}</div>
                        ${d.substituteFor?`<div class="text-[10px] text-slate-500 mt-1 truncate">Thay: ${d.substituteFor}</div>`:''}
                        <div class="text-[11px] font-bold mt-1 ${detailClass}">${detailText}</div>
                        ${!isOffDay && !isFuture && att && att.checkIn && att.checkOut ? `<div class="text-[10px] text-slate-400 mt-0.5">📍 ${att.checkIn.gps?att.checkIn.gps.split(',')[0]:''} ${att.checkIn.image ? '• 📷' : ''}</div>` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// Requests
async function loadRequests(){
  deviceRequests = await api('/api/device-requests', {headers:{Authorization:'Bearer '+token}});
  emergencyRequests = await api('/api/emergency-requests');
  offRequests = await api('/api/off-requests');
  renderDeviceRequests();
  renderEmergencyAdmin();
  renderOffAdmin();
  updatePendingCount();
}
function updatePendingCount(){
  const pending = (deviceRequests.filter(r=>r.status==='PENDING').length + emergencyRequests.filter(r=>r.status==='PENDING').length);
  const el=document.getElementById('pendingCount');
  if(el) el.textContent=pending;
}
function renderDeviceRequests(){
  const el=document.getElementById('deviceRequestsList');
  if(!el) return;
  if(deviceRequests.length===0) return el.innerHTML='<div class="text-xs text-slate-400 text-center py-4">Không có yêu cầu</div>';
  el.innerHTML = deviceRequests.map(r=>`
    <div class="border ${r.status==='PENDING'?'border-pink-200 bg-pink-50':'border-slate-200 bg-white'} rounded-xl p-3">
      <div class="flex justify-between items-start">
        <div><div class="font-bold text-sm">${r.employeeId}</div><div class="text-xs text-slate-600">Lý do: ${r.reason}</div><div class="text-[11px] text-slate-500">Tạo: ${fmtDMYTime(r.createdAt)} • Hết hạn: ${fmtDMYTime(r.expiresAt)}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='PENDING'?'bg-pink-500 text-white':r.status==='APPROVED'?'bg-pink-500 text-white':r.status==='EXPIRED'?'bg-slate-400 text-white':'bg-red-100 text-red-700'}">${r.status}</span>
      </div>
      ${r.status==='PENDING'?`<div class="mt-2 flex gap-2"><button onclick="handleDevice('${r.id}','approve')" class="flex-1 bg-pink-500 text-white text-xs font-bold py-1.5 rounded-lg">Duyệt</button><button onclick="handleDevice('${r.id}','reject')" class="flex-1 bg-white border border-slate-200 text-xs font-bold py-1.5 rounded-lg">Từ chối</button></div>`:''}
    </div>
  `).join('');
}
async function handleDevice(id, action){
  await api('/api/device-requests/'+id+'/'+action, {method:'POST', headers:{Authorization:'Bearer '+token}});
  showToast(action==='approve'?'Đã duyệt reset thiết bị':'Đã từ chối','success');
  loadRequests();
}
function renderEmergencyAdmin(){
  const el=document.getElementById('emergencyListAdmin');
  if(!el) return;
  if(emergencyRequests.length===0) return el.innerHTML='<div class="text-xs text-slate-400 text-center py-4">Không có OFF đột xuất</div>';
  el.innerHTML = emergencyRequests.map(r=>`
    <div class="border rounded-xl p-3 ${r.status==='PENDING'?'bg-pink-50 border-pink-200':'bg-white border-slate-200'}">
      <div class="flex justify-between"><span class="font-bold text-sm">${r.employeeName||r.employeeId}</span><span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='PENDING'?'bg-pink-500 text-white':r.status==='APPROVED'?'bg-pink-500 text-white':'bg-red-100 text-red-700'}">${r.status}</span></div>
      <div class="text-xs text-slate-600 mt-1">Ngày ${fmtDMY(r.date)} • ${getBranchDisplay(r.branchId)} • ${r.shift} • Lý do: ${r.reason}</div>
      <div class="text-[11px] text-slate-500">Cascade step ${r.cascadeStep} • Timeout ${fmtDMYTime(r.timeoutAt).split(' ')[1] || fmtDMYTime(r.timeoutAt)} • ${r.substituteName?`Thay: ${r.substituteName}`:''}</div>
      ${r.status==='PENDING'?`<div class="mt-2 text-[11px] bg-white border rounded-lg p-2">Đang tìm người thay ca (same CN+ca → 10p → same CN khác ca). Demo timeout 20s.</div>`:''}
    </div>
  `).join('');
}
function renderOffAdmin(){
  const el=document.getElementById('offRequestsAdmin');
  if(!el) return;
  if(offRequests.length===0) return el.innerHTML='<div class="text-xs text-slate-400 text-center py-2">Chưa có OFF hàng tuần</div>';
  el.innerHTML = offRequests.slice(0,10).map(r=>`
    <div class="flex justify-between items-center border border-slate-200 rounded-xl px-3 py-2 bg-white">
      <div><div class="font-bold text-sm">${r.employeeName||r.employeeId} • ${getBranchDisplay(r.branchId)} • ${r.shift}</div><div class="text-xs text-slate-500">${r.dates.map(d=>fmtDMY(d)).join(', ')} • ${r.autoApproved?'Auto Approve':''}</div></div>
      <span class="text-[11px] font-black px-2 py-1 rounded-full bg-pink-100 text-pink-700">${r.status}</span>
    </div>
  `).join('');
}

// Attendance
async function loadAttendances(){
  const date=document.getElementById('attDate')?.value||'';
  const branch=document.getElementById('attBranch')?.value||'';
  let url='/api/attendances?';
  if(date) url+='date='+date+'&';
  if(branch) url+='branch='+branch;
  attendances = await api(url);
  renderAttendancesList();
}
function renderAttendances(){
  loadAttendances();
}
function renderAttendancesList(){
  const el=document.getElementById('attendanceList');
  if(!el) return;
  if(attendances.length===0) return el.innerHTML='<div class="col-span-full bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">Không có record</div>';
  el.innerHTML = attendances.map(a=>{
    const emp = employees.find(e=>e.employeeId===a.employeeId);
    return `
    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div class="px-3 py-2 bg-slate-50 border-b flex justify-between items-center">
        <span class="font-bold text-sm">${emp?.name||a.employeeId}</span>
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${a.status==='COMPLETED'?'bg-pink-100 text-pink-700':a.status==='LATE'?'bg-red-100 text-red-700':a.status==='CHECKED_IN'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600'}">${a.status}</span>
      </div>
      <div class="p-3 space-y-2 text-xs">
        <div class="flex justify-between"><span class="font-bold text-slate-500">Ngày/Ca</span><span class="font-bold">${fmtDMY(a.date)} • ${a.shift} • ${getBranchDisplay(a.branchId)}</span></div>
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-green-50 border border-pink-200 rounded-xl p-2"><div class="font-black text-pink-700">CHECK-IN</div><div>${a.checkIn?.time||'—'}</div><div class="text-[11px] text-slate-500 truncate">${a.checkIn?.gps||''}</div><div class="text-[11px] truncate">${a.checkIn?.drivePath||''}</div></div>
          <div class="bg-orange-50 border border-orange-200 rounded-xl p-2"><div class="font-black text-orange-700">CHECK-OUT</div><div>${a.checkOut?.time||'— Chưa'}</div><div class="text-[11px] text-slate-500 truncate">${a.checkOut?.gps||''}</div><div class="text-[11px] truncate">${a.checkOut?.drivePath||''}</div></div>
        </div>
        <div class="flex flex-wrap gap-1">${(a.violations||[]).map(v=>`<span class="text-[11px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">${v}</span>`).join('')||'<span class="text-[11px] bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">Không vi phạm</span>'}</div>
        ${a.checkIn?.image?`<img src="${a.checkIn.image}" class="w-full h-24 object-cover rounded-xl border">`:''}
      </div>
    </div>
  `}).join('');
}

// Zalo
async function loadZalo(){
  zaloRecords = await api('/api/zalo-records');
  renderZalo();
}
function renderZalo(){
  const tbody=document.getElementById('zaloTbody');
  if(!tbody) return;
  tbody.innerHTML = zaloRecords.map(z=>`
    <tr class="hover:bg-slate-50">
      <td class="px-3 py-2 text-xs">${fmtDMYTime(z.sent_at)}</td>
      <td class="px-3 py-2 text-xs font-bold">${z.receiver} ${z.receiverName ? `(${z.receiverName})` : ''}</td>
      <td class="px-3 py-2 text-center"><span class="text-[11px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-full">${z.type}</span></td>
      <td class="px-3 py-2 text-xs max-w-[300px] truncate" title="${z.content}">${z.content}</td>
      <td class="px-3 py-2 text-center">
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${z.status==='DELIVERED'?'bg-green-100 text-green-700':z.status==='SENT'?'bg-blue-100 text-blue-700':z.status==='QUEUED'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}">${z.status}</span>
        ${z.error ? `<div class="text-[10px] text-red-600 mt-0.5 truncate max-w-[150px]" title="${z.error}">${z.error}</div>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="text-center py-8 text-sm text-slate-400">Không có record Zalo</td></tr>';
}

async function testZaloBotApi() {
  const phone = prompt('Nhập SĐT nhận tin Zalo Bot kiểm tra (ví dụ 0901234567):', '0901234567');
  if (!phone) return;

  showToast('Đang gửi tin nhắn Zalo Bot...', 'info');
  try {
    const res = await api('/api/zalo/test', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ phone })
    });
    if (res.record && res.record.status === 'DELIVERED') {
      const webhookUrl = res.settings?.botWebhookUrl || '';
      let engineName = 'Zalo Bot Engine';
      if (webhookUrl.includes('localhost:3001') || webhookUrl.includes('3001')) {
        engineName = 'Zalo Bot Cá Nhân (Tự động 100%)';
      } else if (webhookUrl.includes('make.com')) {
        engineName = 'Make.com Webhook';
      } else if (webhookUrl) {
        engineName = 'Zalo Bot API Webhook';
      }
      showToast(`🎉 Gửi thành công tới SĐT ${phone} qua ${engineName}!`, 'success');
    } else if (res.record && res.record.status === 'FAILED') {
      showToast(`⚠️ Zalo Bot trả lỗi: ${res.record.error}`, 'error');
    } else {
      showToast(`Đã ghi nhận Record Zalo Bot (${res.record?.status}). Cần điền Webhook URL hoặc OA Token trong Cài đặt!`, 'info');
    }
    if (typeof loadZalo === 'function') loadZalo();
  } catch (e) {
    showToast(e.message || 'Lỗi kết nối Zalo Bot API', 'error');
  }
}

// presetZaloEngine removed - Zalo Bot feature removed from project

// Reports
async function loadReports(){
  const month=document.getElementById('reportMonth')?.value;
  const branch=document.getElementById('reportBranch')?.value;
  let url='/api/reports/attendance?';
  if(month){ const [y,m]=month.split('-'); url+=`startDate=${month}-01&endDate=${month}-31&`; }
  if(branch) url+='branch='+branch;
  reportData = await api(url);
  renderReportTable();
  // payroll
  let pUrl='/api/reports/payroll?month='+(month||new Date().toISOString().slice(0,7));
  if(branch) pUrl+='&branch='+branch;
  payrollData = await api(pUrl);
  renderPayroll();
}
function renderReportTable(){
  const tbody=document.getElementById('reportTbody');
  if(!tbody) return;
  if(reportData.length===0) return tbody.innerHTML='<tr><td colspan="5" class="text-center py-8 text-sm text-slate-400">Không có dữ liệu</td></tr>';
  tbody.innerHTML = reportData.slice(0,50).map(a=>{
    const emp = employees.find(e=>e.employeeId===a.employeeId);
    return `<tr class="hover:bg-slate-50">
      <td class="px-3 py-2"><div class="font-bold text-xs">${fmtDMY(a.date)} • <span class="font-mono">${a.employeeId}</span></div><div class="text-xs">${a.employeeName||emp?.name} • ${a.type||emp?.type}</div></td>
      <td class="px-3 py-2 text-center"><div class="text-xs font-bold">${getBranchDisplay(a.branchId)}</div><div class="text-xs">${a.shift}</div></td>
      <td class="px-3 py-2 text-center"><div class="text-xs">IN: ${a.checkIn?.time||'—'} • OUT: ${a.checkOut?.time||'—'}</div><div class="text-[11px] text-slate-500">${a.status}</div></td>
      <td class="px-3 py-2 text-center">${(a.violations||[]).join(', ')||'—'}</td>
      <td class="px-3 py-2 text-right"><div class="text-xs font-bold">${a.checkIn && a.checkOut?'Ca hợp lệ':'Thiếu ca'}</div></td>
    </tr>`;
  }).join('');
}
function renderPayroll(){
  const grid=document.getElementById('payrollGrid');
  if(!grid) return;
  if(payrollData.length===0) return grid.innerHTML='<div class="text-xs text-slate-400">Không có dữ liệu lương</div>';
  grid.innerHTML = payrollData.map(p=>`
    <div class="border border-slate-200 rounded-xl p-3 bg-slate-50">
      <div class="flex justify-between"><span class="font-black text-sm">${p.name}</span><span class="text-xs font-bold ${p.type==='OFFICIAL'?'bg-pink-100 text-pink-700':'bg-pink-100 text-pink-700'} px-2 py-1 rounded-full">${p.type} • ${p.rate.toLocaleString('vi-VN')}đ/h</span></div>
      <div class="text-xs text-slate-600 mt-1">Tháng ${fmtMonthYear(p.month)} • ${p.totalHours}h • Gross ${p.gross.toLocaleString('vi-VN')}đ</div>
      <div class="mt-2 space-y-1 max-h-[120px] overflow-auto scrollbar-thin">
        ${p.breakdown.slice(0,5).map(b=> `<div class="flex justify-between bg-white border rounded-lg px-2 py-1 text-[11px]"><span>${fmtDMY(b.date)} ${b.shift} ${b.hours}h</span><span class="font-bold ${b.penalty?'text-red-600':''}">${b.net.toLocaleString('vi-VN')}đ ${b.penalty?`(-${b.penalty.toLocaleString('vi-VN')})`:''}</span></div>`).join('')}
      </div>
      <div class="mt-2 flex justify-between font-black text-sm border-t pt-2"><span>Thực nhận</span><span class="text-pink-700">${p.net.toLocaleString('vi-VN')}đ</span></div>
      <div class="text-[11px] text-slate-500">Phạt: ${p.totalPenalty.toLocaleString('vi-VN')}đ</div>
    </div>
  `).join('');
}
function exportReport(){
  if(reportData.length===0) return showToast('Không có dữ liệu để export','error');
  const header='Ngay,EmployeeID,HoTen,Loai,ChiNhanh,Ca,CheckIn,CheckOut,TrangThai,ViPham\n';
  const rows = reportData.map(a=> `${fmtDMY(a.date)},${a.employeeId},${a.employeeName||''},${a.type||''},${getBranchDisplay(a.branchId)},${a.shift},${a.checkIn?.time||''},${a.checkOut?.time||''},${a.status},${(a.violations||[]).join('|')}`).join('\n');
  const blob=new Blob([header+rows],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='bao-cao-cham-cong.csv'; a.click();
}
// === REPORT 7 TABS (Spec) ===
let currentReportTab='overview';
function viReportStatus(s){
  const m={
    DRAFT:'Nháp', LOCKED:'Đã chốt', PENDING:'Chờ duyệt', APPROVED:'Đã duyệt', REJECTED:'Từ chối',
    PRESENT:'Có mặt', ABSENT:'Vắng', LATE:'Đi trễ', EARLY_LEAVE:'Về sớm', OFF:'Nghỉ',
    MISSING_CHECK_IN:'Thiếu Check-in', MISSING_CHECKOUT:'Thiếu Check-out', MISSING_CHECK_OUT:'Thiếu Check-out',
    NO_SCHEDULE:'Không có lịch', OT_PENDING:'OT chờ duyệt', MANAGER_APPROVED:'QL đã duyệt', HR_APPROVED:'HR đã duyệt',
    HR_REVIEW:'HR đang duyệt', WAITING_ACCOUNTING:'Chờ Kế toán', REOPENED:'Mở lại'
  };
  return m[s]||s;
}
function viAnomalyType(t){
  const m={MISSING_CHECK_IN:'Thiếu Check-in', MISSING_CHECK_OUT:'Thiếu Check-out', NO_SCHEDULE:'Không có lịch', OT_PENDING:'OT chờ duyệt'};
  return m[t]||t;
}
function switchReportTab(tab){
  currentReportTab=tab;
  document.querySelectorAll('.report-sub').forEach(el=>el.classList.add('hidden'));
  document.getElementById('reportSub-'+tab)?.classList.remove('hidden');
  document.querySelectorAll('[id^="reportTab-"]').forEach(btn=>{
    btn.className='flex-1 min-w-[110px] px-3 py-2 rounded-xl text-xs font-bold bg-white border border-pink-200 text-pink-700 hover:bg-pink-50';
  });
  const active=document.getElementById('reportTab-'+tab);
  if(active) active.className='flex-1 min-w-[110px] px-3 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow';
  if(tab==='overview') loadReportOverview();
  if(tab==='monthly') loadReportMonthly();
  if(tab==='daily') loadReportDaily();
  if(tab==='anomalies') loadAnomalies();
  if(tab==='adjust') loadAdjustments();
  if(tab==='period') loadPeriods();
  if(tab==='export') loadReports();
  updateReportResetBtnVisibility();
}
function updateReportResetBtnVisibility(){
  const btn=document.getElementById('reportResetAllBtn');
  if(!btn) return;
  const isAdmin = currentUser && currentUser.role==='Admin';
  btn.classList.toggle('hidden', !isAdmin);
}
async function resetReportAll(){
  if(!confirm('⚠️ Admin: Xoá TẤT CẢ dữ liệu Tab Báo cáo chấm công?\n\n• Toàn bộ chấm công (attendances) sẽ về 0\n• Kỳ lương, điều chỉnh, tăng ca sẽ bị xoá\n• Nhân viên/lịch/OFF sẽ GIỮ NGUYÊN (chỉ reset báo cáo)\n\nKhông thể khôi phục!')) return;
  try{
    const res=await api('/api/reports/reset', {method:'POST'});
    showToast(`Đã xoá: ${res.cleared.attendances} chấm công, ${res.cleared.payrollPeriods} kỳ lương về 0`,'success');
    loadReportAll();
  }catch(e){ showToast(e.message,'error'); }
}
async function loadReportAll(){
  const m=document.getElementById('reportMonth')?.value || new Date().toISOString().slice(0,7);
  if(!document.getElementById('reportMonth')?.value) document.getElementById('reportMonth').value=m;
  // Ensure employees loaded for selects
  if(!employees || employees.length===0){
    try{ employees = await api('/api/employees'); }catch(e){}
  }
  // populate selects BEFORE loading sub-tabs
  try{
    const sel=document.getElementById('reportDailyEmp');
    const adjSel=document.getElementById('adjEmp');
    if(sel){
      sel.innerHTML=employees.filter(e=>e.status!=='ARCHIVED').map(e=>`<option value="${e.employeeId}">${e.employeeId} - ${e.name} (${e.type})</option>`).join('');
    }
    if(adjSel){
      adjSel.innerHTML=employees.filter(e=>e.status!=='ARCHIVED').map(e=>`<option value="${e.employeeId}">${e.employeeId} - ${e.name}</option>`).join('');
    }
  }catch(e){}
  await loadReports();
  await Promise.all([loadReportOverview(), loadReportMonthly(), loadAnomalies(), loadAdjustments(), loadPeriods()]);
  // Auto load daily for first employee so tab Chi tiết không trống
  try{
    const sel=document.getElementById('reportDailyEmp');
    if(sel && sel.value) await loadReportDaily();
    else if(sel && sel.options.length>0){ sel.selectedIndex=0; await loadReportDaily(); }
  }catch(e){}
}
async function loadReportOverview(){
  const month=document.getElementById('reportMonth')?.value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch')?.value || '';
  try{
    const kpi=await api(`/api/reports/overview?month=${month}&branch=${branch}`);
    const el=document.getElementById('reportKPI');
    if(!el) return;
    const items=[
      {label:'Tổng NV', value:kpi.totalEmployees, sub:'trong kỳ', color:'bg-pink-500', icon:'fa-users'},
      {label:'Công tiêu chuẩn', value:kpi.totalScheduledDays, sub:`${kpi.totalScheduledHours}h`, color:'bg-slate-700', icon:'fa-calendar-check'},
      {label:'Thực tế', value:kpi.totalActualDays, sub:`${kpi.totalActualHours}h`, color:'bg-emerald-500', icon:'fa-user-check'},
      {label:'Tính lương', value:kpi.totalPayableDays, sub:`${kpi.totalPayableHours}h`, color:'bg-blue-600', icon:'fa-sack-dollar'},
      {label:'Tổng tăng ca', value:kpi.totalOT+'h', sub:'đã duyệt', color:'bg-purple-600', icon:'fa-clock'},
      {label:'Đi trễ', value:kpi.lateCount, sub:`${kpi.lateMinutes}'`, color:'bg-orange-500', icon:'fa-stopwatch'},
      {label:'Về sớm', value:kpi.earlyCount, sub:`${kpi.earlyMinutes}'`, color:'bg-amber-500', icon:'fa-right-from-bracket'},
      {label:'Thiếu Check-in', value:kpi.missingCheckIn, sub:'lỗi', color:'bg-red-500', icon:'fa-right-to-bracket'},
      {label:'Thiếu Check-out', value:kpi.missingCheckOut, sub:'lỗi', color:'bg-red-400', icon:'fa-right-from-bracket'},
      {label:'Chờ duyệt', value:kpi.pendingAdjust, sub:'điều chỉnh', color:'bg-amber-600', icon:'fa-hourglass-half'},
      {label:'Trạng thái', value:viReportStatus(kpi.status), sub:kpi.locked?'Đã chốt':'Chưa chốt', color:kpi.status==='LOCKED'?'bg-slate-900':'bg-emerald-600', icon:'fa-lock'},
      {label:'Phép hưởng', value:kpi.paidLeave, sub:'ngày', color:'bg-teal-500', icon:'fa-umbrella-beach'},
    ];
    el.innerHTML=items.map(it=>`
      <div class="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl ${it.color} text-white flex items-center justify-center text-sm"><i class="fa-solid ${it.icon}"></i></div>
        <div><div class="text-[11px] font-bold text-slate-500">${it.label}</div><div class="text-lg font-black">${it.value}</div><div class="text-[11px] text-slate-400">${it.sub}</div></div>
      </div>
    `).join('');
  }catch(e){ console.error('overview',e); }
}
async function loadReportMonthly(){
  const month=document.getElementById('reportMonth')?.value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch')?.value || '';
  try{
    const rows=await api(`/api/reports/monthly?month=${month}&branch=${branch}`);
    const tbody=document.getElementById('reportMonthlyTbody');
    if(!tbody) return;
    if(rows.length===0) return tbody.innerHTML='<tr><td colspan="8" class="text-center py-8 text-slate-400">Không có dữ liệu</td></tr>';
    tbody.innerHTML=rows.map(r=>`
      <tr class="hover:bg-pink-50/30 border-b text-xs">
        <td class="px-3 py-2"><div class="font-mono font-bold text-pink-700">${r.employeeId}</div><div class="font-bold">${r.name}</div><div class="text-[11px] text-slate-500">${r.branchName} • ${r.shift==='CA_SANG'?'Ca Sáng':r.shift==='CA_CHIEU'?'Ca Chiều':r.shift==='CA_TOI'?'Ca Tối':r.shift} • ${r.type==='TRAINING'?'Thử việc':r.type==='OFFICIAL'?'Chính thức':r.type}</div></td>
        <td class="px-2 py-2 text-center font-bold">${r.standardDays}</td>
        <td class="px-2 py-2 text-center font-bold text-emerald-600">${r.actualDays}</td>
        <td class="px-2 py-2 text-center font-black text-blue-600">${r.payableDays}</td>
        <td class="px-2 py-2 text-center">${r.actualHours}h<br><span class="text-[11px] text-slate-500">${r.payableHours}h</span></td>
        <td class="px-2 py-2 text-center"><span class="${r.lateCount?'bg-orange-100 text-orange-700':'bg-slate-100 text-slate-500'} px-2 py-0.5 rounded-full font-bold">${r.lateCount} (${r.lateMin}')</span></td>
        <td class="px-2 py-2 text-center"><span class="${(r.missingIn+r.missingOut)?'bg-red-100 text-red-700':'bg-emerald-50 text-emerald-700'} px-2 py-0.5 rounded-full font-bold">${r.missingIn+r.missingOut}</span></td>
        <td class="px-2 py-2 text-center"><span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='LOCKED'?'bg-slate-900 text-white':'bg-amber-100 text-amber-700'}">${viReportStatus(r.status)}</span></td>
      </tr>
    `).join('');
  }catch(e){ console.error(e); }
}
async function loadReportDaily(){
  const empId=document.getElementById('reportDailyEmp')?.value;
  const month=document.getElementById('reportMonth')?.value || new Date().toISOString().slice(0,7);
  if(!empId) return;
  try{
    const rows=await api(`/api/reports/daily?employeeId=${empId}&month=${month}`);
    const tbody=document.getElementById('reportDailyTbody');
    tbody.innerHTML=rows.map(r=>`
      <tr class="hover:bg-slate-50 border-b text-xs">
        <td class="px-3 py-2"><div class="font-bold">${fmtDMY(r.date)} ${r.dayName}</div><div class="text-[11px] ${r.status==='OFF'?'text-slate-400':'text-pink-600'}">${viReportStatus(r.schedStatus||r.status)}</div></td>
        <td class="px-2 py-2 text-center">${r.shift==='CA_SANG'?'Ca Sáng':r.shift==='CA_CHIEU'?'Ca Chiều':r.shift==='CA_TOI'?'Ca Tối':r.shift}<br><span class="text-[11px]">${r.shiftHours}h</span></td>
        <td class="px-2 py-2 text-center font-mono">${r.checkIn||'—'}</td>
        <td class="px-2 py-2 text-center font-mono">${r.checkOut||'—'}</td>
        <td class="px-2 py-2 text-center">${r.actualHours}h</td>
        <td class="px-2 py-2 text-center ${r.lateMin?'text-orange-600 font-bold':''}">${r.lateMin?r.lateMin+"'":'0'}</td>
        <td class="px-2 py-2 text-center"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${r.status==='PRESENT'?'bg-emerald-100 text-emerald-700':r.status==='LATE'?'bg-orange-100 text-orange-700':r.status==='ABSENT'?'bg-red-100 text-red-700':r.status==='OFF'?'bg-slate-100 text-slate-500':'bg-amber-100 text-amber-700'}">${viReportStatus(r.status)}</span></td>
      </tr>
    `).join('');
  }catch(e){ console.error(e); }
}
async function loadAnomalies(){
  const month=document.getElementById('reportMonth')?.value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch')?.value || '';
  try{
    const list=await api(`/api/attendance/anomalies?month=${month}&branch=${branch}`);
    document.getElementById('anomalyCount').textContent=list.length+' lỗi';
    const el=document.getElementById('anomalyList');
    if(list.length===0) return el.innerHTML='<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center text-sm text-emerald-700">✔ Không có sai lệch - đủ điều kiện chốt</div>';
    el.innerHTML=list.slice(0,50).map(a=>`
      <div class="bg-white border border-amber-200 rounded-xl p-3 flex justify-between items-center">
        <div><div class="font-bold text-sm">${a.name} • ${a.employeeId} • ${fmtDMY(a.date)}</div><div class="text-xs text-slate-600">${viAnomalyType(a.type)} — ${a.desc} ${a.checkIn? '• IN '+a.checkIn:''}</div><div class="text-[11px] text-slate-500">${a.branchId} • ${a.employeeId}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700">${viAnomalyType(a.type)}</span>
      </div>
    `).join('');
  }catch(e){ console.error(e); }
}
async function createAdjustment(){
  const employeeId=document.getElementById('adjEmp')?.value;
  const date=document.getElementById('adjDate')?.value;
  const field=document.getElementById('adjField')?.value;
  const newValue=document.getElementById('adjValue')?.value;
  const reason=document.getElementById('adjReason')?.value;
  if(!employeeId||!date||!field||!newValue||!reason) return showToast('Thiếu thông tin điều chỉnh','error');
  try{
    await api('/api/attendance/adjustments', {method:'POST', body:JSON.stringify({employeeId,date,field,oldValue:'',newValue,reason})});
    showToast('Đã gửi yêu cầu điều chỉnh','success');
    loadAdjustments();
  }catch(e){ showToast(e.message,'error'); }
}
async function loadAdjustments(){
  try{
    const list=await api('/api/attendance/adjustments');
    const el=document.getElementById('adjustList');
    if(list.length===0) return el.innerHTML='<div class="text-xs text-slate-400 text-center py-4">Chưa có yêu cầu</div>';
    el.innerHTML=list.slice(0,20).map(a=>`
      <div class="bg-white border rounded-xl p-3 flex justify-between items-center ${a.status==='PENDING'?'border-amber-200 bg-amber-50':''}">
        <div><div class="font-bold text-sm">${a.employeeId} • ${fmtDMY(a.date)} • ${a.field==='checkIn'?'Check-in':a.field==='checkOut'?'Check-out':a.field}</div><div class="text-xs">${a.oldValue||'—'} → <b>${a.newValue}</b> • ${a.reason}</div><div class="text-[11px] text-slate-500">${a.requestedBy} • ${fmtDMYTime(a.requestedAt)} • ${viReportStatus(a.status)}</div></div>
        ${a.status==='PENDING'?`<div class="flex gap-1"><button onclick="approveAdj('${a.id}')" class="px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold">Duyệt</button><button onclick="rejectAdj('${a.id}')" class="px-3 py-1 rounded-lg bg-white border text-xs">Từ chối</button></div>`:`<span class="text-xs font-bold px-2 py-1 rounded-full ${a.status==='APPROVED'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}">${viReportStatus(a.status)}</span>`}
      </div>
    `).join('');
  }catch(e){}
}
async function approveAdj(id){ await api('/api/attendance/adjustments/'+id+'/approve', {method:'POST'}); showToast('Đã duyệt','success'); loadAdjustments(); loadAnomalies(); }
async function rejectAdj(id){ await api('/api/attendance/adjustments/'+id+'/reject', {method:'POST'}); showToast('Đã từ chối','success'); loadAdjustments(); }
async function loadPeriods(){
  try{
    const list=await api('/api/payroll-periods');
    const el=document.getElementById('periodList');
    if(list.length===0) return el.innerHTML='<div class="text-xs text-slate-400 text-center py-4">Chưa có kỳ nào - tạo kỳ mới</div>';
    el.innerHTML=list.map(p=>`
      <div class="border rounded-xl p-3 ${p.status==='LOCKED'?'bg-slate-900 text-white':'bg-white'} flex justify-between items-center">
        <div><div class="font-black">${p.month} • ${viReportStatus(p.status)}</div><div class="text-xs ${p.status==='LOCKED'?'text-slate-300':'text-slate-500'}">${p.startDate} → ${p.endDate} • Tạo bởi ${p.createdBy} • ${fmtDMYTime(p.createdAt)}</div>${p.lockedBy?`<div class="text-xs">Khoá bởi ${p.lockedBy} • ${fmtDMYTime(p.lockedAt)}</div>`:''}${p.reopenReason?`<div class="text-xs text-amber-600">Lý do mở lại: ${p.reopenReason}</div>`:''}</div>
        ${p.status!=='LOCKED'?`<button onclick="lockPeriod('${p.id}')" class="px-3 py-1 rounded-lg bg-pink-500 text-white text-xs font-bold">Chốt kỳ</button>`:`<button onclick="reopenPeriod('${p.id}')" class="px-3 py-1 rounded-lg bg-white text-slate-900 text-xs font-bold">Mở lại</button>`}
      </div>
    `).join('');
  }catch(e){}
}
async function createPeriod(){
  const month=document.getElementById('periodMonth')?.value || document.getElementById('reportMonth')?.value;
  if(!month) return showToast('Chọn tháng','error');
  try{ await api('/api/payroll-periods', {method:'POST', body:JSON.stringify({month})}); showToast('Đã tạo kỳ '+month,'success'); loadPeriods(); }catch(e){ showToast(e.message,'error'); }
}
async function lockPeriod(id){
  if(!confirm('Chốt kỳ sẽ LOCKED - không cho sửa công?')) return;
  try{ await api('/api/payroll-periods/'+id+'/lock', {method:'POST', body:JSON.stringify({})}); showToast('Đã chốt kỳ','success'); loadPeriods(); loadReportOverview(); }catch(e){ showToast(e.message,'error'); }
}
async function reopenPeriod(id){
  const reason=prompt('Nhập lý do Reopen:');
  if(!reason) return;
  try{ await api('/api/payroll-periods/'+id+'/reopen', {method:'POST', body:JSON.stringify({reason})}); showToast('Đã mở lại kỳ','success'); loadPeriods(); }catch(e){ showToast(e.message,'error'); }
}
async function exportPayrollInput(){
  const month=document.getElementById('reportMonth')?.value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch')?.value || '';
  const token2=localStorage.getItem('admin_token');
  const url=`/api/reports/export/payroll-input?month=${month}&branch=${branch}`;
  // fetch as blob
  const res=await fetch(url, {headers:{Authorization:'Bearer '+token2}});
  if(!res.ok) return showToast('Lỗi export','error');
  const blob=await res.blob();
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`Du_lieu_tinh_luong_${month.replace('-','_')}.csv`; a.click();
}
async function exportAnomalies(){
  const month=document.getElementById('reportMonth')?.value || new Date().toISOString().slice(0,7);
  const branch=document.getElementById('reportBranch')?.value || '';
  const list=await api(`/api/attendance/anomalies?month=${month}&branch=${branch}`);
  if(list.length===0) return showToast('Không có sai lệch','success');
  const header='MaNV,HoTen,ChiNhanh,Ngay,Loai,MoTa\n';
  const rows=list.map(a=>`${a.employeeId},${a.name},${a.branchId},${a.date},${viAnomalyType(a.type)},"${a.desc}"`).join('\n');
  const blob=new Blob(['\uFEFF'+header+rows],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`Sai_lech_${month}.csv`; a.click();
}

// Elearning
async function loadElearning(){
  testCourses = await api('/api/courses');
  testResults = await api('/api/test-results');
  employees = await api('/api/employees'); // refresh for test scores
  renderCoursesAdmin();
  renderTestResultsAdmin();
}
function renderCoursesAdmin(){
  const el=document.getElementById('courseAdmin');
  if(!el) return;
  el.innerHTML = testCourses.map(c=>`
    <div class="border border-slate-200 rounded-2xl p-4">
      <div class="flex justify-between items-start">
        <div><div class="font-black text-slate-800">${c.title}</div><div class="text-xs text-slate-500 mt-1">${c.description}</div><div class="mt-2 flex gap-2"><span class="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-1 rounded-full">${c.totalQuestions} câu</span><span class="text-xs font-bold bg-pink-100 text-pink-700 px-2 py-1 rounded-full">≥${c.minPerQuestion}s/câu = ${c.totalQuestions*c.minPerQuestion}s tối thiểu</span></div></div>
        <span class="text-xs font-bold bg-slate-900 text-white px-3 py-1 rounded-full">${c.id}</span>
      </div>
      <details class="mt-3"><summary class="text-xs font-bold text-blue-600 cursor-pointer">Xem 5 câu mẫu</summary><div class="mt-2 space-y-2 max-h-[200px] overflow-auto scrollbar-thin">
        ${c.questions.slice(0,5).map(q=>`<div class="bg-slate-50 border rounded-xl p-2"><div class="text-xs font-bold">${q.question}</div><div class="text-[11px] text-slate-600 mt-1">${q.options.map((o,i)=>`<span class="${i===q.correct?'font-black text-pink-700':''}">${i+1}. ${o} </span>`).join(' • ')}</div></div>`).join('')}
      </div></details>
      <div class="mt-3 bg-purple-50 border border-purple-200 rounded-xl p-3">
        <div class="text-xs font-black text-purple-800">AI Voice Simulation</div>
        ${c.voiceSimulations.map(v=>`<div class="mt-1 text-xs"><span class="font-bold">${v.id}:</span> ${v.scenario} <span class="text-[11px] bg-white border px-2 py-0.5 rounded-full">${v.rubric.join(' • ')}</span></div>`).join('')}
      </div>
    </div>
  `).join('');
}
function renderTestResultsAdmin(){
  const el=document.getElementById('testResultsAdmin');
  if(!el) return;
  if(testResults.length===0) return el.innerHTML='<div class="text-xs text-slate-400 text-center py-4">Chưa có kết quả</div>';
  el.innerHTML = testResults.slice(0,20).map(r=>{
    const emp = employees.find(e=>e.employeeId===r.employeeId);
    return `<div class="border border-slate-200 rounded-xl p-3 ${r.result==='DAT'?'bg-green-50 border-pink-200':r.result==='CHUA_DU_DK'?'bg-pink-50 border-pink-200':'bg-red-50 border-red-200'}">
      <div class="flex justify-between"><span class="font-bold text-sm">${emp?.name||r.employeeId}</span><span class="font-black text-sm ${r.result==='DAT'?'text-pink-700':r.result==='CHUA_DU_DK'?'text-pink-700':'text-red-700'}">${r.score}đ • ${r.result}</span></div>
      <div class="text-xs text-slate-600">${r.correct}/${r.total} đúng • ${r.timeSpent}s • ${fmtDMYTime(r.createdAt)}</div>
      <div class="text-[11px] mt-1">${emp?`${getBranchDisplay(emp.branchId)} • ${emp.shift} • ${emp.status}`:''}</div>
    </div>`;
  }).join('');
}

// Settings
async function loadSettings(){
  try{
    const data = await api('/api/settings', {headers:{Authorization:'Bearer '+token}});
    const s = data.settings || {};
    const m = data.masked || {};
    if (document.getElementById('setSheetId')) document.getElementById('setSheetId').value = s.googleSheet?.spreadsheetId || '1rcqEKraSRhr-Tn9qwlhADlkQUei8j65bXeHF_Tmkd38';
    if (document.getElementById('setTargetDatabaseSheetId')) document.getElementById('setTargetDatabaseSheetId').value = s.googleSheet?.targetDatabaseSpreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
    if (document.getElementById('setTargetWebhookUrl')) document.getElementById('setTargetWebhookUrl').value = s.googleSheet?.targetWebhookUrl || 'https://script.google.com/macros/s/AKfycbz_umbomilk_apps_script/exec';
    if (document.getElementById('setSheetEmail')) document.getElementById('setSheetEmail').value = s.googleSheet?.serviceAccountEmail || 'umbomilk-sa@umbomilk-hr.iam.gserviceaccount.com';
    if (document.getElementById('setSheetKey')) document.getElementById('setSheetKey').value = m.googleSheet?.privateKey || s.googleSheet?.privateKey || '••••••••Nrfw';
    if (document.getElementById('setFormId')) document.getElementById('setFormId').value = s.googleSheet?.formResponsesSheetId || '1rcqEKraSRhr-Tn9qwlhADlkQUei8j65bXeHF_Tmkd38';
    if (document.getElementById('setDriveId')) document.getElementById('setDriveId').value = s.googleDrive?.rootFolderId || '1DriveFolderID_UmBoMilk_CV_2026';
    if (document.getElementById('setCalId')) document.getElementById('setCalId').value = s.calendar?.clientId || 'umbomilk-calendar-client-id';
    if (document.getElementById('setCalSecret')) document.getElementById('setCalSecret').value = m.calendar?.clientSecret || '••••••••';
    if (document.getElementById('setCalCalId')) document.getElementById('setCalCalId').value = s.calendar?.calendarId || 'primary';
    if (document.getElementById('setAiProvider')) document.getElementById('setAiProvider').value = s.ai?.provider || 'gemini';
    if (document.getElementById('setAiModel')) document.getElementById('setAiModel').value = s.ai?.model || 'gemini-2.5-flash';
    if (document.getElementById('setAiKey')) document.getElementById('setAiKey').value = m.ai?.apiKey || '••••••••Nrfw';
    if (document.getElementById('setZaloId')) document.getElementById('setZaloId').value = s.zalo?.oaId || '1792426273830693319';
    if (document.getElementById('setZaloToken')) document.getElementById('setZaloToken').value = m.zalo?.accessToken || s.zalo?.accessToken || '••••••••';
    if (document.getElementById('setZaloTemplate')) document.getElementById('setZaloTemplate').value = s.zalo?.template || 'Mẫu Thư mời PV';
    if (document.getElementById('setZaloWebhook')) document.getElementById('setZaloWebhook').value = s.zalo?.botWebhookUrl || 'http://localhost:3001/webhook';
    if (document.getElementById('setNotifChannel')) document.getElementById('setNotifChannel').value = s.notificationChannel || 'EMAIL';
    if (document.getElementById('setLateTh')) document.getElementById('setLateTh').value = s.attendance?.lateThreshold || 15;
    if (document.getElementById('setEarlyTh')) document.getElementById('setEarlyTh').value = s.attendance?.earlyLeaveThreshold || 15;
    if (document.getElementById('setTrainRate')) document.getElementById('setTrainRate').value = s.payroll?.trainingRate || 21000;
    if (document.getElementById('setOffRate')) document.getElementById('setOffRate').value = s.payroll?.officialRate || 25500;
    if (document.getElementById('setPenaltyLate')) document.getElementById('setPenaltyLate').value = s.attendance?.penaltyLate || 30000;
    if (document.getElementById('setPenaltyAbsent')) document.getElementById('setPenaltyAbsent').value = s.attendance?.penaltyAbsent || 100000;
    if (document.getElementById('setOffMax')) document.getElementById('setOffMax').value = s.off?.maxPerWeek || 2;
    if (document.getElementById('setTestMin')) document.getElementById('setTestMin').value = s.test?.minPerQuestion || 5;
    updateModeBadge(s);
    // users
    loadUsers();
    // sync
    const sync = await api('/api/sync-queue', {headers:{Authorization:'Bearer '+token}});
    document.getElementById('settingsSync').innerHTML = sync.slice(0,6).map(ss=>`<div class="flex justify-between bg-slate-50 border rounded-lg px-2 py-1 text-xs"><span>${ss.entity} ${ss.operation}</span><span class="font-bold ${ss.sync_status==='SYNCED'?'text-green-600':'text-amber-600'}">${ss.sync_status}</span></div>`).join('');
  }catch(e){
    if(e.message.includes('Forbidden')) showToast('Chỉ Admin mới xem được cài đặt','error');
  }
}
async function saveSettings(){
  if(currentUser.role!=='Admin') return showToast('Chỉ Admin được lưu cài đặt','error');
  const payload = {
    googleSheet:{
      spreadsheetId:document.getElementById('setSheetId').value,
      targetDatabaseSpreadsheetId:document.getElementById('setTargetDatabaseSheetId').value,
      targetWebhookUrl:document.getElementById('setTargetWebhookUrl').value,
      serviceAccountEmail:document.getElementById('setSheetEmail').value,
      privateKey:document.getElementById('setSheetKey').value,
      formResponsesSheetId:document.getElementById('setFormId')?.value||''
    },
    googleDrive:{rootFolderId:document.getElementById('setDriveId').value},
    calendar:{clientId:document.getElementById('setCalId').value, clientSecret:document.getElementById('setCalSecret').value, calendarId:document.getElementById('setCalCalId').value},
    ai:{provider:document.getElementById('setAiProvider').value, model:document.getElementById('setAiModel').value, apiKey:document.getElementById('setAiKey').value},
    attendance:{lateThreshold:parseInt(document.getElementById('setLateTh').value), earlyLeaveThreshold:parseInt(document.getElementById('setEarlyTh').value), penaltyLate:parseInt(document.getElementById('setPenaltyLate').value), penaltyAbsent:parseInt(document.getElementById('setPenaltyAbsent').value)},
    payroll:{trainingRate:parseInt(document.getElementById('setTrainRate').value), officialRate:parseInt(document.getElementById('setOffRate').value)},
    off:{maxPerWeek:parseInt(document.getElementById('setOffMax').value)},
    test:{minPerQuestion:parseInt(document.getElementById('setTestMin').value)},
  };
  await api('/api/settings', {method:'PUT', body:JSON.stringify({settings:payload}), headers:{Authorization:'Bearer '+token}});
  showToast('Đã lưu cài đặt hệ thống + Audit Log','success');
}

// testNotificationChannel removed - Email & SMS notification feature removed from project
async function loadUsers(){
  try{
    users = await api('/api/users', {headers:{Authorization:'Bearer '+token}});
    const container = document.getElementById('usersList');
    if (!container) return;

    container.innerHTML = users.map(u => {
      const userTabs = Array.isArray(u.allowedTabs) ? u.allowedTabs : getDefaultTabsForRole(u.role);

      return `
        <div class="bg-white border border-pink-200 rounded-2xl p-3 shadow-sm space-y-2">
          <div class="flex justify-between items-center border-b border-pink-100 pb-2">
            <div>
              <span class="font-black text-slate-800 text-sm">${u.username}</span>
              <span class="ml-2 text-[11px] font-black px-2.5 py-0.5 rounded-full ${u.role==='Admin'?'bg-pink-500 text-white':u.role==='HR'?'bg-purple-600 text-white':'bg-blue-600 text-white'}">${u.role}</span>
              <span class="text-[11px] text-slate-500 ml-2">CN: <b>${u.branchScope?.join(', ')||'Tất cả'}</b></span>
            </div>
            ${u.username !== 'admin' ? `
              <button onclick="deleteUser('${u.id}')" class="text-[11px] font-bold bg-white border border-red-200 text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg">
                <i class="fa-solid fa-trash"></i> Xóa
              </button>
            ` : '<span class="text-[11px] font-bold text-slate-400">Admin Gốc</span>'}
          </div>

          <div>
            <div class="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <i class="fa-solid fa-shield-halved text-pink-600"></i> Phân quyền hiển thị Tab cho [${u.username}]:
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[11px]">
              ${NAV.map(tab => {
                const isChecked = userTabs.includes(tab.id);
                return `
                  <label class="flex items-center gap-1.5 px-2 py-1 rounded-lg border ${isChecked ? 'bg-pink-50 border-pink-300 font-bold text-pink-700' : 'bg-slate-50 border-slate-200 text-slate-500'} cursor-pointer hover:border-pink-400">
                    <input type="checkbox" onchange="toggleUserTab('${u.id}', '${tab.id}', this.checked)" ${isChecked ? 'checked' : ''} class="w-3.5 h-3.5 text-pink-600 rounded focus:ring-pink-500">
                    <span class="truncate">${tab.label}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch(e) {}
}

async function toggleUserTab(userId, tabId, isChecked) {
  const user = users.find(u => u.id === userId);
  if (!user) return;
  let currentTabs = Array.isArray(user.allowedTabs) ? [...user.allowedTabs] : getDefaultTabsForRole(user.role);

  if (isChecked) {
    if (!currentTabs.includes(tabId)) currentTabs.push(tabId);
  } else {
    currentTabs = currentTabs.filter(t => t !== tabId);
  }

  user.allowedTabs = currentTabs;
  try {
    await api('/api/users/' + userId, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ allowedTabs: currentTabs })
    });
    showToast(`Đã cập nhật quyền Tab cho tài khoản "${user.username}"`, 'success');
    
    // If current logged-in user modified their own permissions, refresh sidebar realtime
    if (currentUser && currentUser.username === user.username) {
      currentUser.allowedTabs = currentTabs;
      localStorage.setItem('admin_user', JSON.stringify(currentUser));
      initNav();
    }
  } catch(e) {
    showToast(e.message || 'Lỗi khi cập nhật quyền tab', 'error');
  }
}
async function createUser(){
  const username=document.getElementById('newUserName').value.trim();
  const password=document.getElementById('newUserPass').value.trim();
  const role=document.getElementById('newUserRole').value;
  if(!username||!password) return showToast('Thiếu username/password','error');
  await api('/api/users', {method:'POST', body:JSON.stringify({username,password,role, branchScope:['CN1','CN2']}), headers:{Authorization:'Bearer '+token}});
  showToast('Đã tạo user','success'); loadUsers();
}
async function deleteUser(id){
  if(!confirm('Xóa user?')) return;
  await api('/api/users/'+id, {method:'DELETE', headers:{Authorization:'Bearer '+token}});
  showToast('Đã xóa','success'); loadUsers();
}
async function resetSystem(){
  if(!confirm('Reset sẽ xóa dữ liệu (giữ Settings). Tiếp tục?')) return;
  const scope=prompt('Nhập scope: ALL hoặc EMPLOYEES','EMPLOYEES');
  await api('/api/system/reset', {method:'POST', body:JSON.stringify({scope}), headers:{Authorization:'Bearer '+token}});
  showToast('Đã reset: '+scope,'success');
  loadDashboard();
}

// Audit
async function loadAudit(){
  auditLogs = await api('/api/audit-logs', {headers:{Authorization:'Bearer '+token}});
  const tbody=document.getElementById('auditTbody');
  if(!tbody) return;
  tbody.innerHTML = auditLogs.slice(0,100).map(l=>`
    <tr class="hover:bg-slate-50">
      <td class="px-3 py-2 text-xs">${fmtDMYTime(l.timestamp)}</td>
      <td class="px-3 py-2 text-xs font-bold">${l.actor}</td>
      <td class="px-3 py-2 text-center"><span class="text-[11px] font-black bg-slate-900 text-white px-2 py-1 rounded-full">${l.action}</span></td>
      <td class="px-3 py-2 text-xs">${l.entity}</td>
      <td class="px-3 py-2 text-xs max-w-[320px] truncate">${JSON.stringify(l.after||l.before||'').slice(0,120)}</td>
    </tr>
  `).join('');
}

// Modals
function openModal(title, body){
  document.getElementById('modalTitle').innerHTML=title;
  document.getElementById('modalBody').innerHTML=body;
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal(){
  document.getElementById('modal').classList.add('hidden');
}
function showToast(msg, type='success'){
  const t=document.createElement('div');
  t.className=`fixed bottom-4 right-4 z-[200] px-4 py-3 rounded-xl shadow-xl text-sm font-bold flex items-center gap-2 ${type==='success'?'bg-pink-500 text-white':'bg-red-600 text-white'}`;
  t.innerHTML=`<i class="fa-solid ${type==='success'?'fa-circle-check':'fa-circle-exclamation'}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

// Init
if(token && currentUser) showApp();
else { document.getElementById('loginOverlay').classList.remove('hidden'); document.getElementById('app').classList.add('hidden'); initNav(); }
