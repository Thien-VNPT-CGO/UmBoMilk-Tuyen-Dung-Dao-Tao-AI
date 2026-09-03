let token = localStorage.getItem('emp_token');
let employee = JSON.parse(localStorage.getItem('emp_data')||'null');
let empKey = localStorage.getItem('emp_key')||'';
let deviceId = localStorage.getItem('device_id') || ('dev_'+Math.random().toString(36).substring(2,10));
localStorage.setItem('device_id', deviceId);
let socket=null;
const API_BASE = location.hostname.includes('vercel.app') ? 'https://umbomilk-hr.onrender.com' : '';
let branches=[];
let testCourses=[];
let currentTest=null;
let testAnswers=[];
let testIndex=0;
let testStartTime=null;
let testTimerInterval=null;
let myAttendances=[];
let mySchedules=[];
let myOffs=[];
let myEmergencies=[];
let myNotifs=[];

const NAV = [
  {id:'home', icon:'fa-house', label:'Trang chủ'},
  {id:'attendance', icon:'fa-camera', label:'Điểm danh'},
  {id:'schedule', icon:'fa-calendar-days', label:'Lịch'},
  {id:'salary', icon:'fa-sack-dollar', label:'Lương AI'},
  {id:'off', icon:'fa-umbrella-beach', label:'Nghỉ OFF'},
  {id:'emergency', icon:'fa-triangle-exclamation', label:'OFF đột xuất'},
  {id:'elearning', icon:'fa-graduation-cap', label:'E-learning'},
  {id:'notifs', icon:'fa-bell', label:'Thông báo'},
  {id:'account', icon:'fa-user', label:'Tài khoản'},
];

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
let currentMode = localStorage.getItem('app_mode') || 'AUTO';
function updateModeBadge(){
  const badge=document.getElementById('modeBadge');
  const dot=document.getElementById('modeDot');
  const text=document.getElementById('modeText');
  if(!badge||!dot||!text) return;
  const socketOnline = !!(socket && socket.connected);
  // For employee, check if has real data (has employeeId and key)
  const hasRealData = !!(employee && employee.employeeId);
  let isOnline=false;
  if(currentMode==='ONLINE') isOnline=true;
  else if(currentMode==='DEMO') isOnline=false;
  else isOnline = socketOnline && hasRealData;
  if(!socketOnline){
    badge.className='hidden md:inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-black px-2.5 py-1 rounded-full';
    dot.className='w-2 h-2 bg-slate-400 rounded-full';
    text.textContent='NGOẠI TUYẾN';
    badge.title='Mất kết nối';
  }else if(isOnline){
    badge.className='hidden md:inline-flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-[11px] font-black px-2.5 py-1 rounded-full';
    dot.className='w-2 h-2 bg-green-500 rounded-full animate-pulse';
    text.textContent='TRỰC TUYẾN';
    badge.title='TRỰC TUYẾN: dữ liệu thật + realtime';
  }else{
    badge.className='hidden md:inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-black px-2.5 py-1 rounded-full';
    dot.className='w-2 h-2 bg-amber-500 rounded-full';
    text.textContent='DỮ LIỆU MẪU';
    badge.title='DỮ LIỆU MẪU: giao diện thử nghiệm';
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


// Các tab bị ẩn mặc định với tài khoản TRAINING (off, emergency luôn ẩn)
const TRAINING_HIDDEN_TABS = ['off', 'emergency'];

// E-learning chỉ mở cho NV Training khi HR bấm chọn "Thi Trực Tuyến Trên Web App" (Option 1).
// Khi lên Nhân viên Chính thức (OFFICIAL) thì E-learning tạm thời ẩn đi.
function isElearningUnlocked(){
  if(!employee) return false;
  const isOfficial = employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL';
  
  // Khi lên Nhân viên Chính thức (OFFICIAL): E-learning tạm thời ẩn đi
  if(isOfficial) return false;

  // Khi còn là Nhân viên Training: Chỉ mở khi HR bấm Option 1 ("ONLINE_APP") hoặc WAITING_TEST / RETEST
  if(employee.testSchedule && employee.testSchedule.type === 'ONLINE_APP') return true;
  if(employee.status === 'WAITING_TEST' || employee.status === 'RETEST') return true;
  return false;
}

function getVisibleNav(){
  if(!employee) return NAV;
  const isOfficial = employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL';
  
  if(!isOfficial){
    // Khi là Nhân viên Training:
    // - Ẩn 2 chức năng: Nghỉ OFF & OFF đột xuất
    // - E-learning: Mặc định ẩn, chỉ hiển thị khi HR chọn Thi trực tuyến trên Web App
    return NAV.filter(n => {
      if(TRAINING_HIDDEN_TABS.includes(n.id)) return false;
      if(n.id === 'elearning') return isElearningUnlocked();
      return true;
    });
  } else {
    // Khi là Nhân viên Chính thức:
    // - Hiển thị Nghỉ OFF & OFF đột xuất
    // - Tạm thời ẩn chức năng E-learning
    return NAV.filter(n => n.id !== 'elearning');
  }
}

// Cập nhật nav + section visibility sau khi employee data thay đổi
function refreshNavVisibility(){
  if(!employee) return;
  const isOfficial = employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL';
  const unlocked = isElearningUnlocked();

  // Render lại nav buttons
  initNav();

  // Ẩn/hiện section 'off' và 'emergency' (Ẩn với Training, Hiện khi lên Chính thức)
  TRAINING_HIDDEN_TABS.forEach(tabId => {
    const sec = document.getElementById('tab-' + tabId);
    if(sec){
      if(!isOfficial) sec.classList.add('hidden', 'training-locked');
      else sec.classList.remove('hidden', 'training-locked');
    }
  });

  // E-learning section: Toggle dựa theo isElearningUnlocked()
  const elSec = document.getElementById('tab-elearning');
  if(elSec){
    if(!unlocked){
      elSec.classList.add('hidden', 'training-locked');
      const active = document.querySelector('.tab-section:not(.hidden)')?.id;
      if(active === 'tab-elearning') switchTab('home');
    } else {
      elSec.classList.remove('hidden', 'training-locked');
      if(!elSec.classList.contains('hidden')) loadElearning();
    }
  }
}

function initNav(){
  const el=document.getElementById('navMenu');
  const mobile=document.getElementById('mobileNav');
  const visibleNav = getVisibleNav();
  const isLocked7Days = isTraining7DaysCompleted();
  const isOfficial = employee && (employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL');
  
  // Ràng buộc OFF: T6 nhưng chưa đến giờ thì hiển thị nhưng khóa
  const now = new Date();
  const isFriday = now.getDay() === 5;
  
  const html = visibleNav.map(n=>{
    let isLocked = false;
    let lockMsg = '';
    
    if(!isOfficial && isLocked7Days && (n.id === 'attendance' || n.id === 'schedule')){
      isLocked = true;
      lockMsg = '🔒 Đã hoàn thành 7 ngày Training';
    }
    
    // Ràng buộc OFF cho Chính thức: Nếu là T6 nhưng chưa mở window
    if(isOfficial && n.id === 'off' && isFriday){
      // Tạm thời check local giờ T6 < 12:00
      if(now.getHours() < 12){
        isLocked = true;
        lockMsg = '🔒 Sẽ mở lúc 12:00 hôm nay';
      }
    }

    if(isLocked){
      return `
        <button onclick="handleLockedTab('${n.id}', '${lockMsg}')" id="nav-${n.id}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-slate-100/80 cursor-not-allowed text-left opacity-75" title="${lockMsg}">
          <span class="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-xs text-slate-500"><i class="fa-solid fa-lock"></i></span>
          <span class="flex-1">${n.label}</span>
          <span class="text-[10px] font-black bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-md">KHÓA</span>
        </button>
      `;
    }
    return `
      <button onclick="switchTab('${n.id}')" id="nav-${n.id}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-green-50 hover:text-pink-700 text-left">
        <span class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs"><i class="fa-solid ${n.icon}"></i></span>
        <span>${n.label}</span>
      </button>
    `;
  }).join('');

  if(el) el.innerHTML=html;

  if(mobile) mobile.innerHTML = visibleNav.map(n=>{
    let isLocked = false;
    if(!isOfficial && isLocked7Days && (n.id === 'attendance' || n.id === 'schedule')) isLocked = true;
    if(isOfficial && n.id === 'off' && isFriday && now.getHours() < 12) isLocked = true;

    if(isLocked){
      return `
        <button onclick="handleLockedTab('${n.id}')" id="mnav-${n.id}" class="flex-1 flex flex-col items-center gap-1 py-2 px-2 text-[11px] font-bold text-slate-400 opacity-60 cursor-not-allowed" title="Khóa">
          <i class="fa-solid fa-lock text-sm"></i><span>${n.label}</span>
        </button>
      `;
    }
    return `
      <button onclick="switchTab('${n.id}')" id="mnav-${n.id}" class="flex-1 flex flex-col items-center gap-1 py-2 px-2 text-[11px] font-bold text-slate-500">
        <i class="fa-solid ${n.icon} text-sm"></i><span>${n.label}</span>
      </button>
    `;
  }).join('');
}

function handleLockedTab(id, msg){
  if(msg) showToast(msg, 'info');
  else showToast('Chức năng đang tạm khóa', 'info');
}

function isTraining7DaysCompleted() {
  if (!employee) return false;
  // Chỉ khóa khi còn là Training thực sự, không khóa khi đã sang Chính thức/Chờ chính thức
  if (employee.type === 'OFFICIAL' || employee.status === 'OFFICIAL' || employee.status === 'WAITING_OFFICIAL') return false;
  const isTraining = employee.type === 'TRAINING' || employee.status === 'TRAINING' || employee.status === 'WAITING_TEST';
  if (!isTraining) return false;
  if (employee.status === 'PASSED_TEST') return true;
  const completed = (typeof trainProgress !== 'undefined' && trainProgress) ? trainProgress.completed : 0;
  return completed >= 7;
}

function switchTab(id){
  const isOfficial = employee && (employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL');

  // Ngăn TRAINING truy cập Nghỉ OFF / OFF đột xuất
  if(TRAINING_HIDDEN_TABS.includes(id) && !isOfficial){
    showToast('Chức năng này chỉ mở khi HR duyệt bạn lên Nhân viên Chính thức 🔒','error');
    return;
  }
  // Ràng buộc OFF: T6 < 12:00
  if(isOfficial && id === 'off' && new Date().getDay() === 5 && new Date().getHours() < 12){
    showToast('🔒 Chức năng Nghỉ OFF sẽ mở vào lúc 12:00 trưa nay (Thứ 6).', 'info');
    return;
  }

  // Ngăn truy cập E-learning khi chưa unlocked
  if(id === 'elearning' && !isElearningUnlocked()){
    if(isOfficial){
      showToast('Chức năng E-learning tạm thời ẩn đối với Nhân viên Chính thức 🔒','info');
    } else {
      showToast('E-learning chưa được mở. Vui lòng chờ HR kích hoạt bài thi Web App 🔒','error');
    }
    return;
  }
  // KHÓA CỨNG: Không cho click mở tab Điểm danh & Lịch làm việc khi đã đủ 7 ngày Training!
  if(!isOfficial && (id === 'attendance' || id === 'schedule') && isTraining7DaysCompleted()){
    showToast(`🔒 Bạn đã hoàn thành 7/7 ngày Training! Chức năng ${id==='attendance'?'Điểm danh':'Lịch làm việc'} đã khóa, không thể truy cập. Đang chờ HR duyệt Chính thức.`, 'error');
    return;
  }

  // Ràng buộc Điểm danh cho Chính thức: Phải đúng ngày officialStartDate
  if(isOfficial && id === 'attendance' && employee.officialStartDate){
    const todayStr = new Date().toISOString().split('T')[0];
    if(todayStr < employee.officialStartDate){
      showToast(`🔒 Chưa đến ngày bắt đầu chính thức (${employee.officialStartDate.split('-').reverse().join('/')}). Điểm danh sẽ tự động mở vào ngày này.`, 'info');
      return;
    }
  }

  document.querySelectorAll('.tab-section').forEach(s=>s.classList.add('hidden'));
  document.getElementById('tab-'+id)?.classList.remove('hidden');
  document.querySelectorAll('[id^="nav-"]').forEach(b=>b.classList.remove('tab-active'));
  document.querySelectorAll('[id^="mnav-"]').forEach(b=>b.classList.remove('text-green-600'));
  document.getElementById('nav-'+id)?.classList.add('tab-active');
  document.getElementById('mnav-'+id)?.classList.add('text-green-600');
  if(id==='home') loadHome();
  if(id==='attendance') loadAttendanceTab();
  if(id==='schedule') loadSchedule();
  if(id==='salary') loadSalaryTab();
  if(id==='off') loadOff();
  if(id==='emergency') loadEmergency();
  if(id==='elearning') loadElearning();
  if(id==='notifs') loadNotifications();
  if(id==='account') loadAccount();
}

function triggerForceLogoutUI(reason){
  try{ showToast(reason || 'Tài khoản không tồn tại - đang thoát', 'error'); }catch(e){}
  localStorage.removeItem('emp_token'); localStorage.removeItem('emp_data'); localStorage.removeItem('employee_token');
  token=null; employee=null;
  if(typeof socket!=='undefined' && socket) try{ socket.disconnect(); }catch(e){}
  const appEl=document.getElementById('app'); if(appEl) appEl.classList.add('hidden');
  const loginOverlay=document.getElementById('loginOverlay'); if(loginOverlay) loginOverlay.classList.remove('hidden');
  const loginError=document.getElementById('loginError'); if(loginError){ loginError.textContent= reason || 'Tài khoản không tồn tại - vui lòng liên hệ HR'; loginError.classList.remove('hidden'); }
  setTimeout(()=> location.reload(), 900);
}
async function api(path, opts={}){
  const headers={'Content-Type':'application/json'};
  if(token) headers['Authorization']='Bearer '+token;
  const url = path.startsWith('http') ? path : API_BASE + path;
  const res = await fetch(url, {...opts, headers:{...headers, ...(opts.headers||{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    // Ràng buộc realtime: mọi 401 forceLogout đều thoát ngay, không chờ poll/socket
    if(res.status===401 && data.forceLogout){
      setTimeout(()=> triggerForceLogoutUI(data.reason || data.error), 300);
      throw new Error(data.reason || data.error || 'Tài khoản không tồn tại');
    }
    throw new Error(data.error||'Lỗi');
  }
  return data;
}

// Login
document.getElementById('loginForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const employeeId=document.getElementById('employeeId').value.trim();
  const key=document.getElementById('key').value.trim();
  const errEl=document.getElementById('loginError');
  const box=document.getElementById('deviceResetBox');
  try{
    const data = await api('/api/auth/employee-login', {method:'POST', body:JSON.stringify({employeeId, key, deviceId})});
    token=data.token; employee=data.employee; empKey=data.key.key;
    localStorage.setItem('emp_token', token);
    localStorage.setItem('emp_data', JSON.stringify(employee));
    localStorage.setItem('emp_key', empKey);
    errEl.classList.add('hidden'); box.classList.add('hidden');
    showApp();
  }catch(err){
    errEl.textContent=err.message;
    errEl.classList.remove('hidden');
    if(err.message.includes('thiết bị khác')){
      box.classList.remove('hidden');
    }
  }
});
async function requestDeviceReset(){
  const reason=document.getElementById('resetReason').value.trim();
  if(!reason) return alert('Lý do bắt buộc');
  const employeeId=document.getElementById('employeeId').value.trim();
  try{
    await api('/api/auth/device-request', {method:'POST', body:JSON.stringify({employeeId, reason, deviceId})});
    alert('Đã gửi yêu cầu đổi thiết bị. Vui lòng chờ Admin duyệt (30 phút hết hạn).');
    document.getElementById('deviceResetBox').classList.add('hidden');
  }catch(e){ alert(e.message); }
}
async function loadDemoAccounts(){
  try{
    const emps = await fetch('/api/employees').then(r=>r.json());
    if(!Array.isArray(emps)) return;
    const demo = emps.slice(0,4).map(e=>`<div class="flex justify-between bg-white border rounded-lg px-2 py-1"><span class="font-mono text-[11px]">${e.employeeId}</span><span class="text-[11px] font-bold">${e.name} • ${e.status}</span></div>`).join('');
    const box = document.getElementById('demoAccounts');
    if(box) box.innerHTML = `<div class="font-bold text-slate-700 text-xs mb-1">Mã NV demo (vào Admin → NV Cửa hàng → Key để xem KEY kích hoạt):</div>${demo}`;
  }catch(e){}
}
loadDemoAccounts();

function showApp(){
  if(!token || !employee){
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    return;
  }
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userName').textContent=employee.name;
  document.getElementById('userMeta').textContent=employee.employeeId+' • '+employee.status;
  document.getElementById('headerBranch').textContent=getBranchDisplay(employee.branchId);
  document.getElementById('avatarFallback').textContent=employee.name.split(' ').pop()[0];
  document.getElementById('homeAvatar').textContent=employee.name.split(' ').pop()[0];
  initNav();
  // Ẩn/hiện các tab theo quyền TRAINING (bao gồm e-learning)
  refreshNavVisibility();
  switchTab('home');
  connectSocket();
  loadBranches();
  setInterval(updateClock,1000);
  // initial GPS
  getGPS('checkin'); getGPS('checkout');
  setTimeout(updateModeBadge, 500);
}
function logout(){
  localStorage.removeItem('emp_token'); localStorage.removeItem('emp_data');
  token=null; employee=null;
  if(socket) socket.disconnect();
  location.reload();
}
function connectSocket(){
  if(socket) socket.disconnect();
  const empToken = localStorage.getItem('employee_token') || localStorage.getItem('emp_token');
  const isVercel = location.hostname.includes('vercel.app');
  const socketUrl = isVercel ? 'https://umbomilk-hr.onrender.com' : undefined;
  socket=io(socketUrl, { auth: { token: empToken || '' }, transports: ['websocket','polling'], timeout: 20000, reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000 });
  socket.on('connect', ()=>{
    document.getElementById('syncBadge').textContent='SYNCED • Socket Connected';
    document.getElementById('syncBadge').className='hidden md:inline-flex text-[11px] font-bold bg-pink-100 text-pink-700 border border-pink-200 px-2.5 py-1 rounded-full';
    updateModeBadge();
  });
  socket.on('disconnect', ()=>{
    updateModeBadge();
  });
  const evs=['employees:update','attendances:update','schedules:update','offRequests:update','emergencyRequests:update','notifications:update','testResults:update','zalo:update','drive:update','overtime:update','leave:update','automation:heartbeat','sync:update'];
  evs.forEach(ev=> socket.on(ev, async (data)=>{
    if(ev==='automation:heartbeat' && data){
      const hb=document.getElementById('heartbeatInfo');
      if(hb) hb.textContent = `AUTO ${new Date(data.now).toLocaleTimeString('vi-VN')}`;
    }
    if(ev==='drive:update'){
      // toast drive realtime for employee
      if(data && Array.isArray(data) && data[0]) console.log('Drive realtime', data[0].drivePath);
    }
    document.getElementById('syncBadge').textContent='LIVE UPDATE';
    setTimeout(()=>document.getElementById('syncBadge').textContent='SYNCED',1200);
    updateModeBadge();
    // Khi có cập nhật employees, refresh data của nhân viên hiện tại + cập nhật nav (dùng /api/employee/me để tránh branchScope filter)
    if(ev === 'employees:update' && employee){
      try{
        const me = await api('/api/employee/me');
        if(me && me.employee){
          const fresh = me.employee;
          const wasUnlocked = isElearningUnlocked();
          employee = fresh;
          localStorage.setItem('emp_data', JSON.stringify(employee));
          const metaEl = document.getElementById('userMeta'); if(metaEl) metaEl.textContent=employee.employeeId+' • '+employee.status;
          const nowUnlocked = isElearningUnlocked();
          refreshNavVisibility();
          if(!wasUnlocked && nowUnlocked){
            showToast('🎉 HR đã mở bài thi! Vào E-learning để thi ngay.', 'success');
          }
          // Nếu status bị chuyển sang ARCHIVED/TERMINATED dù vẫn tồn tại -> api/me vẫn trả valid nhưng status đã đổi -> kiểm tra thêm
          if(['ARCHIVED','TERMINATED','RESIGNED'].includes(fresh.status)){
            triggerForceLogoutUI(`Tài khoản đã bị ${fresh.status} - liên hệ HR`);
          }
        }
      }catch(e){
        // Nếu api/me ném lỗi forceLogout thì api() đã trigger reload; nếu lỗi khác thì poll sẽ bắt
        if(e.message && (e.message.includes('không tồn tại') || e.message.includes('ARCHIVED') || e.message.includes('TERMINATED'))){
          // đã handle trong api()
        }
      }
    }
    const active=document.querySelector('.tab-section:not(.hidden)')?.id;
    if(active==='tab-home') loadHome();
    if(active==='tab-attendance') loadAttendanceTab();
    if(active==='tab-schedule') loadSchedule();
    if(active==='tab-off') loadOff();
    if(active==='tab-emergency') loadEmergency();
    if(active==='tab-notifs') loadNotifications();
  }));
  // Ràng buộc: Nếu tài khoản không tồn tại thì force logout về đăng nhập
  socket.on('employee:forceLogout', (data)=>{
    if(!employee) return;
    if(data.employeeId && data.employeeId !== employee.employeeId) return;
    showToast(data.reason || 'Tài khoản của bạn đã bị xóa khỏi hệ thống. Đang thoát...', 'error');
    setTimeout(()=>{
      localStorage.removeItem('emp_token'); localStorage.removeItem('emp_data'); localStorage.removeItem('employee_token');
      token=null; employee=null;
      if(socket) socket.disconnect();
      const appEl=document.getElementById('app'); if(appEl) appEl.classList.add('hidden');
      const loginOverlay=document.getElementById('loginOverlay'); if(loginOverlay) loginOverlay.classList.remove('hidden');
      const loginError=document.getElementById('loginError'); if(loginError){ loginError.textContent=data.reason || 'Tài khoản không tồn tại - vui lòng liên hệ HR'; loginError.classList.remove('hidden'); }
      // Fallback reload để đảm bảo về màn hình đăng nhập
      setTimeout(()=> location.reload(), 800);
    }, 1200);
  });
  // Poll kiểm tra tài khoản còn tồn tại không (10s) - realtime backup nếu socket mất, nếu 401 forceLogout thì thoát ngay
  if(window._empCheckInterval) clearInterval(window._empCheckInterval);
  window._empCheckInterval = setInterval(async ()=>{
    if(!employee || !token) return;
    const empToken = localStorage.getItem('employee_token') || localStorage.getItem('emp_token') || token;
    if(!empToken) return;
    try{
      const res = await fetch((API_BASE||'') + '/api/employee/me', { headers:{ Authorization: 'Bearer ' + empToken }});
      if(res.status===401){
        const data = await res.json().catch(()=>({}));
        if(data.forceLogout){
          triggerForceLogoutUI(data.reason || data.error || 'Tài khoản không tồn tại');
        }
      } else if(res.ok){
        const data = await res.json().catch(()=>({}));
        // Kiểm tra status ngay cả khi 200 nhưng đã bị ARCHIVED (fallback poll)
        if(data.employee && ['ARCHIVED','TERMINATED','RESIGNED'].includes(data.employee.status)){
          triggerForceLogoutUI(`Tài khoản đã bị ${data.employee.status} - liên hệ HR`);
        }
      }
    }catch(e){}
  }, 10000);
}
async function loadBranches(){
  branches = await api('/api/branches');
}

// Home
async function loadHome(){
  if(!employee) return;
  // refresh employee - dùng /api/employee/me để realtime và tránh branchScope empty
  try{
    const me = await api('/api/employee/me');
    if(me && me.employee){ 
      const fresh = me.employee;
      // Nếu status đã bị vô hiệu nhưng token vẫn còn hạn -> force logout ngay
      if(['ARCHIVED','TERMINATED','RESIGNED'].includes(fresh.status)){
        triggerForceLogoutUI(`Tài khoản đã bị ${fresh.status} - liên hệ HR`);
        return;
      }
      employee=fresh; localStorage.setItem('emp_data', JSON.stringify(employee)); 
      const metaEl=document.getElementById('userMeta'); if(metaEl) metaEl.textContent=employee.employeeId+' • '+employee.status; 
    }
  }catch(e){
    // api() đã tự triggerForceLogoutUI nếu 401, không cần thêm
  }
  document.getElementById('homeName').textContent=employee.name;
  document.getElementById('homeId').textContent=employee.employeeId+' • '+employee.phone;
  document.getElementById('homeType').textContent=employee.type==='OFFICIAL' ? 'CHÍNH THỨC' : 'TRAINING';
  document.getElementById('homeType').className='text-xs font-black px-3 py-1 rounded-full shadow '+(employee.type==='OFFICIAL'?'official-badge':'training-badge');
  document.getElementById('homeBranch').textContent=getBranchFull(employee.branchId);
  document.getElementById('homeShift').textContent=employee.shift;
  document.getElementById('homeStatus').textContent=employee.status;
  document.getElementById('homeStatus').className='mt-2 inline-flex text-xs font-black px-3 py-1 rounded-full '+(employee.status==='OFFICIAL'?'bg-pink-100 text-pink-700':employee.status==='TRAINING'?'bg-blue-100 text-blue-700':employee.status==='FAILED_TEST'?'bg-red-100 text-red-700':'bg-pink-100 text-pink-700');
  document.getElementById('homeDate').textContent=new Date().toLocaleDateString('vi-VN',{weekday:'long'}) + ' ' + fmtDMY(new Date());
  // schedule today
  try{
    const scheds = await api('/api/schedules?employeeId='+employee.employeeId);
    const today = new Date().toISOString().split('T')[0];
    let todaySched = null;
    scheds.forEach(s=>{ const d=s.days.find(x=>x.date===today); if(d) todaySched=d; });
    document.getElementById('homeSchedule').textContent= todaySched? `${todaySched.status} • ${todaySched.shift}` : '—';
    document.getElementById('homeSchedule').className='font-black text-sm mt-1 '+(todaySched?.status==='OFF'?'text-red-600':todaySched?.status==='WORKING'?'text-green-600':'');
  }catch(e){ document.getElementById('homeSchedule').textContent='—'; }
  // attendance today
  try{
    const atts = await api('/api/attendances?employeeId='+employee.employeeId+'&date='+new Date().toISOString().split('T')[0]);
    const a=atts[0];
    document.getElementById('homeCheckin').textContent= a?.checkIn? a.checkIn.time + (a.status==='LATE'?' (TRỄ)':'') : 'Chưa';
    document.getElementById('homeCheckout').textContent= a?.checkOut? a.checkOut.time : (a?.checkIn?'Chưa':'—');
    document.getElementById('todayStatus').textContent= a? `${a.status} • IN ${a.checkIn?.time||'—'} • OUT ${a.checkOut?.time||'—'}` : 'Chưa điểm danh';
  }catch(e){}
  // notifs
  try{
    const notifs = await api('/api/notifications?employeeId='+employee.employeeId);
    myNotifs=notifs;
    document.getElementById('homeNotifs').innerHTML = notifs.slice(0,4).map(n=>`
      <div class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 ${n.read?'opacity-60':''}">
        <div class="text-xs font-bold text-slate-800">${n.title}</div>
        <div class="text-[11px] text-slate-600">${n.content}</div>
        <div class="text-[11px] text-slate-400">${fmtDMYTime(n.createdAt)}</div>
      </div>
    `).join('') || '<div class="text-xs text-slate-400 text-center py-2">Không có thông báo</div>';
    document.getElementById('notifCount').textContent=notifs.filter(n=>!n.read).length;
    document.getElementById('notifCount').classList.toggle('hidden', notifs.filter(n=>!n.read).length===0);
  }catch(e){}

  renderTrainingOffPicker();
}

function renderTrainingOffPicker() {
  const box = document.getElementById('trainingOffBox');
  if (!box || !employee) return;

  const isTraining = employee.type === 'TRAINING' || employee.status === 'TRAINING';
  if (!isTraining) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');

  const startDateStr = employee.startDate || new Date().toISOString().split('T')[0];
  const parts = startDateStr.split('T')[0].split('-').map(Number);
  const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();

  const trialDates = [];
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  for (let i = 0; i < 12; i++) {
    const curr = new Date(startD);
    curr.setDate(startD.getDate() + i);
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const dayName = dayNames[curr.getDay()];
    trialDates.push({ date: dateStr, dayName });
  }

  const existingOff = employee.registeredOffDates || [];
  const isAlreadyRegistered = existingOff.length === 5;

  if (isAlreadyRegistered) {
    box.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div class="font-black text-sm text-pink-900 flex items-center gap-2">
          <i class="fa-solid fa-calendar-check text-pink-600"></i> ĐÃ ĐĂNG KÝ 5 NGÀY NGHỈ (OFF) THỬ VIỆC
        </div>
        <span class="text-xs font-bold bg-pink-500 text-white px-2.5 py-0.5 rounded-full">12 NGÀY THỬ VIỆC</span>
      </div>
      <div class="text-xs text-pink-700 font-medium mb-3">
        Phạm vi 12 ngày: <b>${fmtDMY(trialDates[0].date)} → ${fmtDMY(trialDates[11].date)}</b> (7 ngày làm việc + 5 ngày OFF).
      </div>
      <div class="flex flex-wrap gap-2">
        ${existingOff.map(d => `<span class="text-xs font-bold bg-pink-100 text-pink-700 border border-pink-200 px-3 py-1 rounded-full"><i class="fa-solid fa-bed text-pink-500"></i> OFF: ${fmtDMY(d)}</span>`).join('')}
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div class="font-black text-sm text-pink-900 flex items-center gap-2">
        <i class="fa-solid fa-calendar-plus text-pink-600"></i> ĐĂNG KÝ 5 NGÀY NGHỈ (OFF) THỬ VIỆC
      </div>
      <span class="text-xs font-bold bg-pink-100 text-pink-700 border border-pink-200 px-2.5 py-0.5 rounded-full">
        Phạm vi: ${fmtDMY(trialDates[0].date)} → ${fmtDMY(trialDates[11].date)}
      </span>
    </div>
    <div class="text-xs text-pink-700 font-medium mb-3">
      Vui lòng chọn đúng <b>5 ngày OFF</b> trong 12 ngày thử việc bên dưới (7 ngày còn lại hệ thống tự xếp ca <b>WORKING</b>):
    </div>
    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2" id="trainingOffCheckboxes">
      ${trialDates.map(t => `
        <label class="flex flex-col items-center justify-center p-2 bg-white border border-pink-200 rounded-xl cursor-pointer hover:bg-pink-50 text-center transition">
          <input type="checkbox" value="${t.date}" onchange="updateTrainingOffSelection()" class="w-4 h-4 text-pink-600 rounded focus:ring-pink-500">
          <span class="text-[11px] font-black text-pink-900 mt-1">${t.dayName}</span>
          <span class="text-[10px] font-mono text-slate-500">${fmtDMYShort(t.date)}</span>
        </label>
      `).join('')}
    </div>
    <div class="mt-3 flex items-center justify-between">
      <span id="trainingOffCountText" class="text-xs font-bold text-pink-800">Đã chọn: 0 / 5 ngày</span>
      <button id="btnSubmitTrainingOff" onclick="submitTrainingOffRegistration()" disabled class="text-xs font-black bg-slate-300 text-slate-500 px-4 py-2 rounded-xl transition cursor-not-allowed">
        Xác nhận & Gửi 5 ngày OFF
      </button>
    </div>
  `;
}

function updateTrainingOffSelection() {
  const checked = Array.from(document.querySelectorAll('#trainingOffCheckboxes input:checked')).map(c => c.value);
  const countText = document.getElementById('trainingOffCountText');
  const btn = document.getElementById('btnSubmitTrainingOff');
  if (countText) countText.textContent = `Đã chọn: ${checked.length} / 5 ngày`;

  if (checked.length === 5) {
    if (btn) {
      btn.disabled = false;
      btn.className = 'text-xs font-black bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-4 py-2 rounded-xl shadow cursor-pointer';
    }
  } else {
    if (btn) {
      btn.disabled = true;
      btn.className = 'text-xs font-black bg-slate-300 text-slate-500 px-4 py-2 rounded-xl transition cursor-not-allowed';
    }
  }
}

async function submitTrainingOffRegistration() {
  const checked = Array.from(document.querySelectorAll('#trainingOffCheckboxes input:checked')).map(c => c.value);
  if (checked.length !== 5) return showToast('Vui lòng chọn đúng 5 ngày OFF', 'error');

  try {
    const res = await api('/api/employee/register-off', {
      method: 'POST',
      body: JSON.stringify({ employeeId: employee.employeeId, offDates: checked })
    });
    employee.registeredOffDates = res.registeredOffDates || checked;
    localStorage.setItem('emp_data', JSON.stringify(employee));
    showToast('Đã đăng ký 5 ngày OFF thử việc thành công!', 'success');
    renderTrainingOffPicker();
    await loadSchedule();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function applyTrainingOffState(offDates) {
  if (!Array.isArray(offDates) || offDates.length !== 5) return;
  employee.registeredOffDates = offDates;
  localStorage.setItem('emp_data', JSON.stringify(employee));
}

function updateClock(){
  const el=document.getElementById('homeClock');
  if(el) el.textContent=new Date().toLocaleTimeString('vi-VN');
  const t1=document.getElementById('timeCheckin');
  if(t1) t1.textContent=fmtDMYTime(new Date());
  const t2=document.getElementById('timeCheckout');
  if(t2) t2.textContent=fmtDMYTime(new Date());
  // update off window badge
  const badge=document.getElementById('offWindowBadge');
  if(badge){
    const isOpen = isOffWindowOpen();
    badge.textContent=isOpen?'ĐANG MỞ (T6 12:00→T7 15:00)':'ĐÃ ĐÓNG';
    badge.className='text-xs font-black px-3 py-1 rounded-full '+(isOpen?'bg-pink-500 text-white':'bg-slate-200 text-slate-600');
  }
}
function isOffWindowOpen(){
  const now=new Date(); const day=now.getDay(); const hour=now.getHours()+now.getMinutes()/60;
  if(day===5 && hour>=12) return true;
  if(day===6 && hour<15) return true;
  return false;
}

// Attendance
let streamCheckin=null, streamCheckout=null;
let capturedCheckin=null, capturedCheckout=null;
async function startCamera(type){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false});
    if(type==='checkin'){ streamCheckin=stream; const v=document.getElementById('videoCheckin'); v.srcObject=stream; v.classList.remove('hidden'); document.getElementById('videoPlaceholder').classList.add('hidden'); document.getElementById('previewCheckin').classList.add('hidden'); }
    else { streamCheckout=stream; const v=document.getElementById('videoCheckout'); v.srcObject=stream; v.classList.remove('hidden'); document.getElementById('videoPlaceholder2').classList.add('hidden'); document.getElementById('previewCheckout').classList.add('hidden'); }
  }catch(e){ alert('Không thể mở camera: '+e.message); }
}
function capture(type){
  const video = document.getElementById(type==='checkin'?'videoCheckin':'videoCheckout');
  const canvas = document.getElementById(type==='checkin'?'canvasCheckin':'canvasCheckout');
  const preview = document.getElementById(type==='checkin'?'previewCheckin':'previewCheckout');
  if(!video.srcObject) return alert('Chưa bật camera');
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  const data = canvas.toDataURL('image/jpeg',0.7);
  if(type==='checkin') capturedCheckin=data; else capturedCheckout=data;
  preview.src=data; preview.classList.remove('hidden'); video.classList.add('hidden');
  // stop stream
  const stream = type==='checkin'?streamCheckin:streamCheckout;
  if(stream) stream.getTracks().forEach(t=>t.stop());
}
function getGPS(type){
  const gpsEl=document.getElementById(type==='checkin'?'gpsCheckin':'gpsCheckout');
  const addrEl=document.getElementById(type==='checkin'?'addrCheckin':'addrCheckout');
  gpsEl.textContent='Đang lấy...';
  if(!navigator.geolocation){ gpsEl.textContent='Trình duyệt không hỗ trợ GPS'; addrEl.textContent=branches.find(b=>b.id===employee.branchId)?.address||''; return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude}=pos.coords;
    gpsEl.textContent=latitude.toFixed(6)+', '+longitude.toFixed(6);
    addrEl.textContent=branches.find(b=>b.id===employee.branchId)?.address|| `${latitude},${longitude}`;
  }, err=>{
    gpsEl.textContent='10.762622, 106.660172 (mock)';
    addrEl.textContent=branches.find(b=>b.id===employee.branchId)?.address||'Mock location';
  }, {enableHighAccuracy:true, timeout:5000});
}
async function submitCheckin(){
  if(!capturedCheckin) return showToast('Chưa chụp ảnh Check-in','error');
  const gps=document.getElementById('gpsCheckin').textContent;
  const addr=document.getElementById('addrCheckin').textContent;
  try{
    const res = await api('/api/attendance/checkin', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, gps, address:addr, image:capturedCheckin, shift:employee.shift, isCameraCapture:true})});
    document.getElementById('checkinResult').className='mt-2 text-xs font-bold rounded-xl px-3 py-2 bg-pink-100 text-pink-700 border border-pink-200';
    document.getElementById('checkinResult').textContent='Check-in thành công lúc '+res.checkIn.time+' • '+(res.status!=='CHECKED_IN'?'VI PHẠM: '+res.status:'ĐÚNG GIỜ');
    document.getElementById('checkinResult').classList.remove('hidden');
    showToast('Check-in thành công','success');
    loadAttendanceTab(); loadHome();
  }catch(e){
    document.getElementById('checkinResult').className='mt-2 text-xs font-bold rounded-xl px-3 py-2 bg-red-100 text-red-700 border border-red-200';
    document.getElementById('checkinResult').textContent=e.message;
    document.getElementById('checkinResult').classList.remove('hidden');
    showToast(e.message,'error');
  }
}
async function submitCheckout(){
  if(!capturedCheckout) return showToast('Chưa chụp ảnh Check-out','error');
  const gps=document.getElementById('gpsCheckout').textContent;
  const addr=document.getElementById('addrCheckout').textContent;
  try{
    const res = await api('/api/attendance/checkout', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, gps, address:addr, image:capturedCheckout, isCameraCapture:true})});
    document.getElementById('checkoutResult').className='mt-2 text-xs font-bold rounded-xl px-3 py-2 bg-pink-100 text-pink-700 border border-pink-200';
    document.getElementById('checkoutResult').textContent='Check-out thành công lúc '+res.checkOut.time+' • Ca hoàn thành';
    document.getElementById('checkoutResult').classList.remove('hidden');
    showToast('Check-out thành công - Ca hoàn thành','success');
    loadAttendanceTab(); loadHome();
  }catch(e){
    document.getElementById('checkoutResult').className='mt-2 text-xs font-bold rounded-xl px-3 py-2 bg-red-100 text-red-700 border border-red-200';
    document.getElementById('checkoutResult').textContent=e.message;
    document.getElementById('checkoutResult').classList.remove('hidden');
    showToast(e.message,'error');
  }
}
async function loadAttendanceTab(){
  try{
    const shiftInfo = {CA_SANG:{start:'07:00'}, CA_CHIEU:{start:'12:00'}, CA_TOI:{start:'18:00'}}[employee.shift]||{start:'07:00'};
    document.getElementById('checkinWindow').textContent=`Mở ${shiftInfo.start} -30p`;
  }catch(e){}

  // Sequential Check-in / Check-out UI visibility
  try{
    const today = new Date().toISOString().split('T')[0];
    const atts = await api('/api/attendances?employeeId='+employee.employeeId+'&date='+today);
    const todayAtt = atts[0];

    const cardCheckin = document.getElementById('cardCheckin');
    const cardCheckout = document.getElementById('cardCheckout');
    
    // Ràng buộc ca làm việc: Chỉ hiển thị card nếu đúng ca hoặc admin bypass
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTime = currentHour + currentMin/60;
    
    let isShiftTime = false;
    const shift = employee.shift;
    if(shift === 'CA_SANG') isShiftTime = currentTime >= 6.5 && currentTime <= 12.5;
    else if(shift === 'CA_CHIEU') isShiftTime = currentTime >= 11.5 && currentTime <= 18.5;
    else if(shift === 'CA_TOI') isShiftTime = currentTime >= 17.5 && currentTime <= 23.5;
    
    // Nếu không phải giờ ca, ẩn cả 2 card và hiện thông báo
    if(!isShiftTime){
       if (cardCheckin) cardCheckin.classList.add('hidden');
       if (cardCheckout) cardCheckout.classList.add('hidden');
       let msgEl = document.getElementById('attendanceShiftMsg');
       if(!msgEl){
         msgEl = document.createElement('div');
         msgEl.id = 'attendanceShiftMsg';
         msgEl.className = 'card bg-amber-50 border-amber-200 text-amber-800 text-sm font-bold text-center p-8';
         cardCheckin.parentElement.insertBefore(msgEl, cardCheckin);
       }
       msgEl.innerHTML = `<i class="fa-solid fa-clock text-2xl mb-2 block"></i> Ngoài giờ ca làm việc (${employee.shift})<br><span class="text-xs font-normal opacity-75">Điểm danh chỉ mở trước ca 30 phút và đóng sau ca 30 phút.</span>`;
       msgEl.classList.remove('hidden');
    } else {
       document.getElementById('attendanceShiftMsg')?.classList.add('hidden');
       if (!todayAtt || !todayAtt.checkIn) {
         if (cardCheckin) cardCheckin.classList.remove('hidden');
         if (cardCheckout) cardCheckout.classList.add('hidden');
       } else if (todayAtt.checkIn && !todayAtt.checkOut) {
         if (cardCheckin) cardCheckin.classList.add('hidden');
         if (cardCheckout) cardCheckout.classList.remove('hidden');
       } else {
         if (cardCheckin) cardCheckin.classList.add('hidden');
         if (cardCheckout) cardCheckout.classList.remove('hidden');
       }
    }
  }catch(e){}

  // history
  try{
    myAttendances = await api('/api/attendances?employeeId='+employee.employeeId);
    document.getElementById('attendanceHistory').innerHTML = myAttendances.map(a=>`
      <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
        <div><div class="font-bold text-sm">${fmtDMY(a.date)} • ${a.shift} • ${a.status}</div><div class="text-xs text-slate-500">IN ${a.checkIn?.time||'—'} • OUT ${a.checkOut?.time||'—'}</div><div class="text-[11px] font-semibold text-pink-700">${(a.violations||[]).join(', ')||'Không vi phạm'}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${a.status==='COMPLETED'?'bg-pink-500 text-white':a.status==='LATE'||(a.violations&&a.violations.length)?'bg-red-100 text-red-700':'bg-slate-200 text-slate-600'}">${a.status}</span>
      </div>
    `).join('') || '<div class="text-xs text-slate-400 text-center py-4">Chưa có lịch sử</div>';
  }catch(e){}
  // OFFICIAL monthly attendance T1→Cuối tháng
  try{
    const isOfficial = employee.type==='OFFICIAL' || employee.status==='OFFICIAL';
    let monthlyEl = document.getElementById('officialMonthlyStats');
    if(!monthlyEl){
      const hist = document.getElementById('attendanceHistory');
      if(hist && hist.parentElement){
        monthlyEl = document.createElement('div');
        monthlyEl.id='officialMonthlyStats';
        monthlyEl.className='mt-3';
        hist.parentElement.appendChild(monthlyEl);
      }
    }
    if(isOfficial && monthlyEl){
      const month = new Date().toISOString().slice(0,7);
      const stats = await api('/api/attendance/official-monthly?employeeId='+employee.employeeId+'&month='+month);
      monthlyEl.innerHTML = `
        <div class="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-3">
          <div class="font-black text-sm text-emerald-900 flex items-center gap-2"><i class="fa-solid fa-calendar-check text-emerald-600"></i> Chấm công Chính thức - Tháng ${fmtMonthYear(month)} (T1→Cuối tháng)</div>
          <div class="grid grid-cols-3 gap-2 mt-2 text-xs">
            <div class="bg-white border border-emerald-100 rounded-xl p-2 text-center"><div class="font-bold text-slate-500">Tổng ngày</div><div class="font-black text-lg text-slate-800">${stats.daysInMonth}</div></div>
            <div class="bg-white border border-emerald-100 rounded-xl p-2 text-center"><div class="font-bold text-slate-500">OFF (tuần+đột xuất)</div><div class="font-black text-lg text-amber-600">${stats.totalOff}</div><div class="text-[11px]">Tuần:${stats.offWeekly} ĐX:${stats.offEmergency}</div></div>
            <div class="bg-white border border-emerald-100 rounded-xl p-2 text-center"><div class="font-bold text-slate-500">Làm việc</div><div class="font-black text-lg text-emerald-600">${stats.workingScheduled}</div><div class="text-[11px] ${stats.min12Compliant?'text-emerald-600':'text-red-600 font-bold'}">${stats.min12Compliant?'✓ ≥12 ngày':'✗ &lt;12 ngày'}</div></div>
          </div>
          <div class="mt-2 text-xs flex justify-between"><span>Lịch WORKING trong tháng: <b>${stats.scheduledWorking}</b> ngày</span><span>Đã điểm danh: <b>${stats.completedAttendances}</b></span></div>
          <div class="text-[11px] text-emerald-700 mt-1">Khác Training 7 ngày - Official tính trọn tháng, AI đảm bảo ≥12 ngày làm (TH1/TH2)</div>
        </div>`;
    } else if(monthlyEl){
      monthlyEl.innerHTML='';
    }
  }catch(e){ console.error('official monthly stats error',e); }
}

// Schedule
async function loadSchedule(){
  try{
    mySchedules = await api('/api/schedules?employeeId='+employee.employeeId);
    const el=document.getElementById('scheduleList');
    if(mySchedules.length===0) return el.innerHTML='<div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">Chưa có lịch - liên hệ HR</div>';
    
    const today = new Date().toISOString().split('T')[0];
    
    el.innerHTML = mySchedules.map(s=>{
      const isCurrentWeek = isDateInCurrentWeek(new Date(s.weekStart));
      const workingDays = s.days.filter(d => d.status === 'WORKING' || d.status === 'SUBSTITUTE').length;
      
      return `
      <div class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="px-5 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 border-b flex justify-between items-center">
          <div>
            <span class="font-black text-sm text-indigo-900">Tuần ${fmtDMY(s.weekStart)}</span>
            ${isCurrentWeek ? '<span class="ml-2 text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full">TUẦN NÀY</span>' : '<span class="ml-2 text-[10px] font-black bg-slate-400 text-white px-2 py-0.5 rounded-full">TUẦN TỚI</span>'}
          </div>
          <span class="text-[11px] font-bold text-indigo-700 bg-white border border-indigo-100 px-3 py-1 rounded-full">${workingDays} ngày làm việc</span>
        </div>
        <div class="grid grid-cols-7 gap-1 p-2 bg-slate-50/50">
          ${s.days.map(d=>{
            const isToday = d.date === today;
            let bgColor = 'bg-white';
            let borderColor = 'border-slate-100';
            let statusClass = 'bg-slate-100 text-slate-500';
            let statusText = d.status;
            
            if(d.status === 'OFF') {
              bgColor = 'bg-red-50/30';
              borderColor = 'border-red-100';
              statusClass = 'bg-red-500 text-white';
              statusText = 'NGHỈ';
            } else if(d.status === 'EMERGENCY_OFF') {
              bgColor = 'bg-orange-50/30';
              borderColor = 'border-orange-100';
              statusClass = 'bg-orange-500 text-white';
              statusText = 'ĐỘT XUẤT';
            } else if(d.status === 'WORKING') {
              bgColor = 'bg-white';
              borderColor = isToday ? 'border-pink-400' : 'border-slate-100';
              statusClass = 'bg-pink-100 text-pink-700';
            } else if(d.status === 'SUBSTITUTE') {
              bgColor = 'bg-indigo-50/30';
              borderColor = 'border-indigo-200';
              statusClass = 'bg-indigo-600 text-white';
              statusText = 'THAY CA';
            }

            return `
            <div class="rounded-2xl border-2 ${borderColor} p-2 text-center transition-all ${bgColor} ${isToday ? 'ring-2 ring-pink-100 scale-[1.02] z-10 shadow-md' : ''}">
              <div class="text-[10px] font-black ${isToday?'text-pink-600':'text-slate-400'} uppercase">${d.dayName}</div>
              <div class="text-[11px] font-bold ${isToday?'text-pink-900':'text-slate-700'}">${fmtDMYShort(d.date)}</div>
              <div class="mt-2 flex flex-col items-center gap-1">
                <span class="text-[9px] font-black px-2 py-0.5 rounded-full ${statusClass}">${statusText}</span>
                <div class="text-[10px] font-bold text-slate-600 leading-tight h-8 flex items-center justify-center">
                  ${(d.status === 'WORKING' || d.status === 'SUBSTITUTE') ? d.shift.replace('CA_', '') : ''}
                </div>
              </div>
              ${isToday ? '<div class="text-[8px] font-black text-pink-500 mt-1 uppercase">Hôm nay</div>' : ''}
            </div>
            `;
          }).join('')}
        </div>
        <div class="px-5 py-2 bg-slate-50 border-t flex justify-between items-center text-[10px] text-slate-400">
           <span><i class="fa-solid fa-building-user mr-1"></i> ${getBranchDisplay(employee.branchId)}</span>
           <span class="italic">Cập nhật bởi AI lúc ${new Date().toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
      </div>
      `;
    }).join('');
  }catch(e){ console.error('loadSchedule error', e); }
}

function isDateInCurrentWeek(date) {
  const now = new Date();
  const startOfWeek = getMonday(now);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return date >= startOfWeek && date <= endOfWeek;
}

// OFF weekly - Chính thức: AI T6 12:00→T7 15:00 + TH1/TH2
async function loadOff(){
  // generate dates for next week Mon-Sun
  const nextMon = getMonday(new Date(Date.now()+7*24*60*60*1000));
  const nextWeekStr = nextMon.toISOString().split('T')[0];
  const dates=[];
  for(let i=0;i<7;i++){ const d=new Date(nextMon); d.setDate(nextMon.getDate()+i); dates.push(d.toISOString().split('T')[0]); }

  try{
    const win = await api('/api/off-window');
    const statusEl=document.getElementById('offWindowStatus');
    const aiEl=document.getElementById('offAiStatus');
    
    // my offs
    myOffs = await api('/api/off-requests?employeeId='+employee.employeeId);
    
    // Check if already registered for NEXT week
    const alreadyRegistered = myOffs.find(r => {
       // A request is for next week if any of its dates match next week's dates
       return r.dates.some(d => dates.includes(d));
    });

    const bypass=document.getElementById('bypassWindow')?.checked;
    const isOpen = win.isOpen || bypass;
    statusEl.textContent = isOpen? '🟢 AI đang MỞ đăng ký OFF (T6 12:00 → T7 15:00) - Auto Approve FCFS' : '🔴 AI đã ĐÓNG đăng ký OFF - ngoài khung giờ (sẽ bị từ chối)';
    statusEl.className='mt-3 text-xs font-bold rounded-xl px-3 py-2 '+(isOpen?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-100 text-red-700 border border-red-200');
    if(aiEl){
      aiEl.classList.remove('hidden');
      aiEl.innerHTML = `<div class="font-bold text-blue-800 flex items-center gap-1"><i class="fa-solid fa-robot"></i> ${win.aiStatus||'AI Auto'}</div><div class="text-[11px] text-blue-700 mt-1">Next: ${win.nextOpen?fmtDMY(win.nextOpen):'—'} 12:00 → ${win.nextClose?fmtDMY(win.nextClose):'—'} 15:00 • Official: ${win.officialCount} NV • TH1: không trùng ca cùng CN • TH2: ≥12 ngày/tháng → AI tự cập nhật lịch T2→CN tuần sau</div>`;
    }

    const registrationBox = document.getElementById('offRegistrationContainer');
    if (!isOpen) {
      registrationBox.innerHTML = `
        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center">
          <i class="fa-solid fa-clock text-slate-400 text-3xl mb-3 block"></i>
          <div class="font-black text-slate-700">CHƯA ĐẾN THỜI GIAN ĐĂNG KÝ</div>
          <div class="text-xs text-slate-500 mt-2">Vui lòng quay lại vào khung giờ mở cửa (Thứ 6 12:00 - Thứ 7 15:00).</div>
          <label class="mt-4 flex justify-center items-center gap-2 text-xs text-pink-600 cursor-pointer"><input type="checkbox" id="bypassWindow" class="rounded accent-pink-500" onchange="loadOff()"> Bypass khung giờ (demo)</label>
        </div>
      `;
    } else if(alreadyRegistered){
      registrationBox.innerHTML = `
        <div class="bg-pink-50 border border-pink-200 rounded-2xl p-5 text-center">
          <i class="fa-solid fa-calendar-check text-pink-500 text-3xl mb-3 block"></i>
          <div class="font-black text-pink-900">BẠN ĐÃ ĐĂNG KÝ OFF TUẦN SAU</div>
          <div class="text-xs text-pink-700 mt-2">Các ngày đã chọn:</div>
          <div class="flex flex-wrap justify-center gap-2 mt-3">
            ${alreadyRegistered.dates.map(d => `<span class="bg-white border border-pink-200 text-pink-700 font-bold px-3 py-1.5 rounded-full text-xs">${fmtDMY(d)}</span>`).join('')}
          </div>
          <div class="text-[11px] text-slate-500 mt-4 italic">Hệ thống đã ghi nhận và tự động sắp lịch WORKING cho các ngày còn lại.</div>
        </div>
      `;
    } else {
      // restore registration UI if not registered
      registrationBox.innerHTML = `
        <div class="font-black text-sm text-pink-900 mb-2 flex items-center justify-between">Chọn ngày OFF tuần sau <span class="text-[11px] font-bold bg-white border border-pink-200 px-2 py-1 rounded-full text-pink-600">AI sắp lịch T2→CN</span></div>
        <div id="offDates" class="grid grid-cols-2 md:grid-cols-4 gap-2"></div>
        <div class="mt-3 flex gap-2">
          <button onclick="submitOff()" class="flex-1 text-white font-black py-3 rounded-xl shadow text-sm" style="background:linear-gradient(135deg,#ec4899,#f43f5e)">Gửi đăng ký (AI Auto Approve)</button>
          <button onclick="loadOff()" class="bg-white border border-pink-200 text-pink-700 font-bold px-4 py-3 rounded-xl text-sm">↻</button>
        </div>
        <label class="mt-2 flex items-center gap-2 text-xs text-pink-600"><input type="checkbox" id="bypassWindow" class="rounded accent-pink-500"> Bypass khung giờ (demo)</label>
      `;
      const offDatesEl=document.getElementById('offDates');
      offDatesEl.innerHTML = dates.map(d=>{
        const dayName=['T2','T3','T4','T5','T6','T7','CN'][new Date(d).getDay()===0?6:new Date(d).getDay()-1];
        return `<label class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-sky-50"><input type="checkbox" value="${d}" class="offCheck rounded"> <span class="text-xs font-bold">${dayName} ${fmtDMY(d)}</span></label>`;
      }).join('');
    }

    // also listen for socket offWindow:update
    if(!window._offWindowSocketBound && typeof socket!=='undefined' && socket){
      window._offWindowSocketBound=true;
      socket.on('offWindow:update', (data)=>{
        const open = data.isOpen || document.getElementById('bypassWindow')?.checked;
        statusEl.textContent = open? '🟢 AI đang MỞ đăng ký OFF - Live Update' : '🔴 AI đã ĐÓNG - Live Update';
        statusEl.className='mt-3 text-xs font-bold rounded-xl px-3 py-2 '+(open?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-100 text-red-700 border border-red-200');
      });
    }
  }catch(e){}
  
  // my offs history list
  try{
    document.getElementById('myOffList').innerHTML = myOffs.map(r=>`
      <div class="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
        <div><div class="font-bold text-sm">${r.dates.map(d=>fmtDMY(d)).join(', ')}</div><div class="text-xs text-slate-500">${fmtDMYTime(r.createdAt)} • ${r.autoApproved?'Auto Approve':''}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='APPROVED'?'bg-pink-500 text-white':r.status==='PENDING'?'bg-pink-100 text-pink-700':'bg-red-100 text-red-700'}">${r.status}</span>
      </div>
    `).join('') || '<div class="text-xs text-slate-400 text-center py-2">Chưa có OFF</div>';
  }catch(e){}
}
async function submitOff(){
  const checks=[...document.querySelectorAll('.offCheck:checked')].map(c=>c.value);
  if(checks.length===0) return showToast('Chưa chọn ngày','error');
  const bypass=document.getElementById('bypassWindow').checked;
  try{
    const res = await api('/api/off-requests', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, dates:checks, bypassWindow:bypass})});
    showToast('OFF đã Auto Approve: '+res.dates.join(', '),'success');
    loadOff(); loadSchedule();
  }catch(e){ showToast(e.message,'error'); }
}
function getMonday(d){
  const date=new Date(d); const day=date.getDay(); const diff=date.getDate()-day+(day===0?-6:1); date.setDate(diff); date.setHours(0,0,0,0); return date;
}

// Emergency
async function loadEmergency(){
  try{
    // Check if next week's schedule is displayed
    mySchedules = await api('/api/schedules?employeeId='+employee.employeeId);
    const nextMon = getMonday(new Date(Date.now()+7*24*60*60*1000));
    const nextWeekStr = nextMon.toISOString().split('T')[0];
    const hasNextWeekSchedule = mySchedules.some(s => s.weekStart === nextWeekStr);

    // Find the form card (first .card in tab-emergency)
    const emergencyTab = document.getElementById('tab-emergency');
    const formCard = emergencyTab.querySelector('.card');

    if(!hasNextWeekSchedule){
      // Hide form, show lock message
      if(formCard) formCard.style.display = 'none';
      const lockId = 'emergencyLockedNotice';
      let lock = document.getElementById(lockId);
      if(!lock){
        lock = document.createElement('div');
        lock.id = lockId;
        lock.className = 'card mt-3 bg-slate-50 border border-slate-200';
        emergencyTab.insertBefore(lock, emergencyTab.querySelector('.grid'));
      }
      lock.innerHTML = `
        <div class="text-center py-4">
          <i class="fa-solid fa-lock text-slate-400 text-3xl mb-3 block"></i>
          <div class="font-black text-slate-700 text-sm">CHƯA MỞ CHỨC NĂNG OFF ĐỘT XUẤT</div>
          <div class="text-xs text-slate-500 mt-2">Vui lòng chờ lịch tuần sau được hiển thị (sau khi AI duyệt OFF tuần - khung T6 12:00 → T7 15:00).</div>
        </div>
      `;
    } else {
      // Show form, remove lock if exists
      if(formCard) formCard.style.display = '';
      const lock = document.getElementById('emergencyLockedNotice');
      if(lock) lock.remove();
    }

    myEmergencies = await api('/api/emergency-requests');
    const mine = myEmergencies.filter(r=>r.employeeId===employee.employeeId);
    document.getElementById('myEmergencyList').innerHTML = mine.map(r=>{
      const stepText = r.cascadeStep===1 ? 'B1: Ưu tiên cùng CN cùng ca (2 phút)' : 'B2: Cùng CN khác ca (30 phút)';
      const isPending = r.status==='PENDING';
      return `
      <div class="border rounded-xl p-3 ${isPending?'bg-amber-50 border-amber-200':'bg-white'}">
        <div class="flex justify-between items-start"><span class="font-bold text-sm">${fmtDMY(r.date)} • ${r.shift} • ${getBranchDisplay(r.branchId)}</span><span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='PENDING'?'bg-amber-500 text-white':r.status==='APPROVED'?'bg-emerald-500 text-white':'bg-red-100 text-red-700'}">${r.status}</span></div>
        <div class="text-xs text-slate-600 mt-1">Lý do: ${r.reason}</div>
        <div class="text-[11px] mt-1 flex flex-wrap gap-1.5">
          <span class="bg-white border px-2 py-0.5 rounded-full">${stepText}</span>
          <span class="bg-white border px-2 py-0.5 rounded-full">Thay: ${r.substituteName||'Đang tìm...'}</span>
          <span class="bg-slate-900 text-white px-2 py-0.5 rounded-full">Timeout: ${fmtDMYTime(r.timeoutAt).split(' ')[1] || fmtDMYTime(r.timeoutAt)}</span>
        </div>
        ${isPending?'<div class="text-[11px] text-amber-700 mt-1">AI đã tạm đăng ký OFF ngày này, đang gửi thông báo tìm người thay (TH3). Nếu sau 2p+30p không có ai nhận, phiếu sẽ tự hủy.</div>':''}
        ${r.reasonReject?'<div class="text-[11px] text-red-600 mt-1">Lý do hủy: '+r.reasonReject+'</div>':''}
      </div>`;
    }).join('') || '<div class="text-xs text-slate-400 text-center py-2">Chưa có yêu cầu</div>';

    // invites: where employee is candidate and request is pending
    const invites = myEmergencies.filter(r=> r.status==='PENDING' && r.employeeId!==employee.employeeId && r.branchId===employee.branchId);
    // Show invites via notifications also
    const notifs = await api('/api/notifications?employeeId='+employee.employeeId);
    const inviteNotifs = notifs.filter(n=> n.type==='SUBSTITUTE_INVITE' && !n.read);
    const stepInviteText = (r)=>{
      if(r.cascadeStep===1) return 'B1: Cùng CN cùng ca - phản hồi trong 2 phút';
      return 'B2: Cùng CN khác ca - phản hồi trong 30 phút';
    };
    document.getElementById('inviteList').innerHTML = invites.slice(0,5).map(r=>`
      <div class="border border-blue-200 bg-blue-50 rounded-xl p-3">
        <div class="font-bold text-sm">${r.employeeName} cần thay ca <span class="text-[11px] bg-blue-600 text-white px-2 py-0.5 rounded-full">${stepInviteText(r)}</span></div>
        <div class="text-xs text-slate-600">Ngày ${fmtDMY(r.date)} • ${r.shift} • ${getBranchDisplay(r.branchId)} • Lý do: ${r.reason}</div>
        <div class="text-[11px] text-blue-700 mt-1">AI đã tạm đăng ký OFF cho người gửi, cần bạn thay ca (TH3)</div>
        <div class="mt-2 flex gap-2"><button onclick="respondEmergency('${r.id}','APPROVE')" class="flex-1 bg-emerald-600 text-white text-xs font-bold py-1.5 rounded-lg">✅ Đồng ý thay ca</button><button onclick="respondEmergency('${r.id}','REJECT')" class="flex-1 bg-white border text-xs font-bold py-1.5 rounded-lg">Từ chối</button></div>
      </div>
    `).join('') || (inviteNotifs.length? inviteNotifs.map(n=>`<div class="border border-blue-200 bg-blue-50 rounded-xl p-3"><div class="font-bold text-sm">${n.title}</div><div class="text-xs">${n.content}</div><div class="text-[11px] text-blue-600">${n.step===1?'2 phút cùng ca':'30 phút khác ca'}</div><button onclick="respondEmergency('${n.requestId}','APPROVE')" class="mt-2 w-full bg-emerald-600 text-white text-xs font-bold py-1.5 rounded-lg">✅ Đồng ý thay ca</button></div>`).join('') : '<div class="text-xs text-slate-400 text-center py-2">Không có lời mời thay ca</div>');
  }catch(e){}
}
async function submitEmergency(){
  const date=document.getElementById('emDate').value;
  const reason=document.getElementById('emReason').value.trim();
  if(!date||!reason) return showToast('Thiếu ngày hoặc lý do','error');
  try{
    const res = await api('/api/emergency-requests', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, date, reason})});
    showToast('Đã gửi OFF đột xuất - đang tìm người thay ca','success');
    loadEmergency();
  }catch(e){ showToast(e.message,'error'); }
}
async function respondEmergency(requestId, action){
  try{
    const substituteId=employee.employeeId;
    await api('/api/emergency-requests/'+requestId+'/respond', {method:'POST', body:JSON.stringify({substituteId, action})});
    showToast(action==='APPROVE'?'Đã nhận thay ca':'Đã từ chối','success');
    loadEmergency();
  }catch(e){ showToast(e.message,'error'); }
}

// Device
async function loadDevice(){
  // key info
  try{
    // we stored empKey, but refresh via login? Instead show deviceId and empKey
    document.getElementById('deviceKeyInfo').innerHTML = `<div>Key: <span class="font-black">${empKey}</span></div><div>Device ID: <span class="font-bold">${deviceId}</span></div><div class="text-[11px] text-slate-500">Employee: ${employee.employeeId} • ${employee.name}</div>`;
    const history = await api('/api/device-requests', {headers:{Authorization:'Bearer '+token}}).catch(()=>[]);
    // Filter mine if possible? device-requests returns all if token not admin? Actually our endpoint doesn't filter by auth, returns all. So filter
    const mine = Array.isArray(history)? history.filter(r=>r.employeeId===employee.employeeId) : [];
    document.getElementById('deviceHistory').innerHTML = mine.map(r=>`
      <div class="flex justify-between items-center bg-slate-50 border rounded-xl px-3 py-2">
        <div><div class="text-xs font-bold">${r.reason}</div><div class="text-[11px] text-slate-500">${fmtDMYTime(r.createdAt)}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='PENDING'?'bg-pink-100 text-pink-700':r.status==='APPROVED'?'bg-pink-500 text-white':r.status==='EXPIRED'?'bg-slate-400 text-white':'bg-red-100 text-red-700'}">${r.status}</span>
      </div>
    `).join('') || '<div class="text-xs text-slate-400 text-center py-2">Chưa có yêu cầu</div>';
  }catch(e){}
}
async function submitDeviceRequest(){
  const reason=document.getElementById('deviceReason').value.trim();
  if(!reason) return showToast('Lý do bắt buộc','error');
  try{
    await api('/api/auth/device-request', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, reason, deviceId: deviceId+'_new_'+Date.now()})});
    showToast('Đã gửi yêu cầu đổi thiết bị','success');
    loadDevice();
  }catch(e){ showToast(e.message,'error'); }
}

// Elearning
async function loadElearning(){
  try{
    testCourses = await api('/api/courses');
    const results = await api('/api/test-results?employeeId='+employee.employeeId);
    const isEligible = employee.status==='TRAINING' || employee.status==='WAITING_TEST' || employee.status==='RETEST' || employee.type==='TRAINING';
    const canTake = isEligible || employee.status==='OFFICIAL'; // allow all for demo
    const lastResult = results[0];
    const el=document.getElementById('elearningContent');
    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-purple-200 p-4">
        <div class="flex justify-between items-start">
          <div><div class="font-black text-purple-900">Khóa học E-learning</div><div class="text-xs text-slate-600">Dành cho nhân viên Training đủ điều kiện (7 ngày Training mặc định)</div></div>
          <span class="text-xs font-bold ${isEligible?'bg-pink-100 text-pink-700':'bg-slate-100 text-slate-500'} px-3 py-1 rounded-full">${isEligible?'Đủ điều kiện':'Chưa đủ ĐK (demo vẫn cho thi)'}</span>
        </div>
        <div class="mt-4 space-y-3">
          ${testCourses.map(c=>`
            <div class="border border-slate-200 rounded-2xl p-4">
              <div class="font-black text-slate-800">${c.title}</div>
              <div class="text-xs text-slate-500 mt-1">${c.description}</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <span class="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-1 rounded-full">${c.totalQuestions} câu trắc nghiệm</span>
                <span class="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Voice Simulation: ${c.voiceSimulations.length} tình huống</span>
                <span class="text-xs font-bold bg-pink-100 text-pink-700 px-2 py-1 rounded-full">≥${c.minPerQuestion}s/câu = ${c.totalQuestions*c.minPerQuestion}s tối thiểu</span>
              </div>
              <div class="mt-3 grid md:grid-cols-2 gap-2">
                ${c.voiceSimulations.map(v=>`<div class="bg-purple-50 border border-purple-200 rounded-xl p-2"><div class="text-xs font-bold text-purple-800">${v.scenario}</div><div class="text-[11px] text-purple-700 mt-1">Rubric: ${v.rubric.join(' • ')}</div><textarea placeholder="Câu trả lời voice (demo text)" class="w-full mt-2 px-2 py-1 rounded-lg border border-purple-200 text-xs" rows="2"></textarea></div>`).join('')}
              </div>
              <button onclick="startTest('${c.id}')" class="w-full mt-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-2.5 rounded-xl">Bắt đầu làm TEST (${c.totalQuestions} câu)</button>
              ${lastResult?`<div class="mt-3 bg-slate-50 border rounded-xl p-2 text-xs"><div class="font-bold">Kết quả gần nhất: ${lastResult.score}đ • ${lastResult.result} • ${fmtDMYTime(lastResult.createdAt)}</div><div class="text-[11px] text-slate-500">${lastResult.correct}/${lastResult.total} đúng • ${lastResult.timeSpent}s</div></div>`:''}
            </div>
          `).join('')}
        </div>
        <div class="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
          <div class="font-black">Quy tắc kết quả:</div>
          <div class="mt-1 space-y-1">
            <div class="flex justify-between"><span>Điểm &lt; 5</span><span class="font-bold text-red-600">LOẠI / FAILED → ARCHIVED (giữ lịch sử)</span></div>
            <div class="flex justify-between"><span>5 ≤ Điểm ≤ 7</span><span class="font-bold text-amber-600">CHƯA ĐỦ ĐIỀU KIỆN → Giữ Training, chờ thi lại</span></div>
            <div class="flex justify-between"><span>Điểm &gt; 7</span><span class="font-bold text-green-600">ĐẠT → Chuyển Training → Chính thức</span></div>
          </div>
        </div>
      </div>
    `;
  }catch(e){}
}
function startTest(courseId){
  currentTest = testCourses.find(c=>c.id===courseId);
  if(!currentTest) return;
  testAnswers = Array(currentTest.totalQuestions).fill(null);
  testIndex=0;
  testStartTime=Date.now();
  document.getElementById('testModal').classList.remove('hidden');
  document.getElementById('testMin').textContent=currentTest.totalQuestions*currentTest.minPerQuestion;
  renderTestQuestion();
  startTestTimer();
}
function startTestTimer(){
  if(testTimerInterval) clearInterval(testTimerInterval);
  testTimerInterval=setInterval(()=>{
    const elapsed = Math.floor((Date.now()-testStartTime)/1000);
    const m=String(Math.floor(elapsed/60)).padStart(2,'0');
    const s=String(elapsed%60).padStart(2,'0');
    document.getElementById('testTimer').textContent=`${m}:${s}`;
    // auto lock when time? For demo, not auto
  },1000);
}
function renderTestQuestion(){
  const q=currentTest.questions[testIndex];
  document.getElementById('testProgress').textContent=`${testIndex+1}/${currentTest.totalQuestions}`;
  document.getElementById('testBody').innerHTML=`
    <div class="font-bold text-sm text-slate-800">Câu ${testIndex+1}: ${q.question}</div>
    <div class="mt-4 space-y-2">
      ${q.options.map((opt,i)=>`
        <label class="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer ${testAnswers[testIndex]===i?'border-indigo-500 bg-indigo-50':'border-slate-200 hover:bg-slate-50'}">
          <input type="radio" name="q${testIndex}" value="${i}" ${testAnswers[testIndex]===i?'checked':''} onchange="selectAnswer(${i})" class="accent-indigo-600">
          <span class="text-sm font-medium">${String.fromCharCode(65+i)}. ${opt}</span>
        </label>
      `).join('')}
    </div>
    <div class="mt-4 text-[11px] text-slate-500">Thời gian tối thiểu ${currentTest.minPerQuestion}s/câu • Tổng tối thiểu ${currentTest.totalQuestions*currentTest.minPerQuestion}s = ${Math.floor(currentTest.totalQuestions*currentTest.minPerQuestion/60)}:${String(currentTest.totalQuestions*currentTest.minPerQuestion%60).padStart(2,'0')}</div>
  `;
}
function selectAnswer(i){ testAnswers[testIndex]=i; }
function prevQuestion(){ if(testIndex>0){ testIndex--; renderTestQuestion(); } }
function nextQuestion(){ if(testIndex < currentTest.totalQuestions-1){ testIndex++; renderTestQuestion(); } }
function closeTest(){ document.getElementById('testModal').classList.add('hidden'); if(testTimerInterval) clearInterval(testTimerInterval); }
async function submitTest(){
  const unanswered = testAnswers.filter(a=>a===null).length;
  if(unanswered>0 && !confirm(`Còn ${unanswered} câu chưa trả lời. Vẫn nộp?`)) return;
  const timeSpent = Math.floor((Date.now()-testStartTime)/1000);
  const minRequired = currentTest.totalQuestions * currentTest.minPerQuestion;
  if(timeSpent < minRequired && !confirm(`Thời gian làm bài ${timeSpent}s chưa đạt tối thiểu ${minRequired}s (≥5s/câu). Bạn có chắc muốn nộp? Hệ thống sẽ vẫn chấm.`)) return;
  // collect voice answers (from page)
  const voiceAnswers = [...document.querySelectorAll('#elearningContent textarea')].map(t=>t.value);
  try{
    const res = await api('/api/courses/'+currentTest.id+'/submit', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, answers:testAnswers, timeSpent, voiceAnswers})});
    closeTest();
    const msg = `Kết quả: ${res.testResult.score}đ • ${res.testResult.result} • Đúng ${res.testResult.correct}/${res.testResult.total}`;
    alert(msg + (res.employee.status==='OFFICIAL'?' \nĐã chuyển sang Chính thức!': res.employee.status==='FAILED_TEST'?' \nBạn không đạt - sẽ chuyển ARCHIVED sau 2h': ' \nChờ thi lại'));
    showToast(msg, res.testResult.result==='DAT'?'success':'error');
    // refresh employee
    employee = res.employee;
    localStorage.setItem('emp_data', JSON.stringify(employee));
    loadElearning(); loadHome();
  }catch(e){ alert(e.message); }
}

// Notifications
async function loadNotifications(){
  try{
    myNotifs = await api('/api/notifications?employeeId='+employee.employeeId);
    document.getElementById('notifList').innerHTML = myNotifs.map(n=>`
      <div class="bg-white border rounded-2xl p-4 flex justify-between gap-3 ${n.read?'opacity-60':''}">
        <div><div class="font-bold text-sm">${n.title}</div><div class="text-xs text-slate-600 mt-1">${n.content}</div><div class="text-[11px] text-slate-400 mt-1">${fmtDMYTime(n.createdAt)}</div></div>
        ${!n.read?`<button onclick="markRead('${n.id}')" class="text-xs font-bold bg-pink-500 text-white px-3 py-1 rounded-full h-fit">Đã đọc</button>`:''}
      </div>
    `).join('') || '<div class="bg-white rounded-2xl border p-8 text-center text-sm text-slate-400">Không có thông báo</div>';
    document.getElementById('notifCount').textContent=myNotifs.filter(n=>!n.read).length;
    document.getElementById('notifCount').classList.toggle('hidden', myNotifs.filter(n=>!n.read).length===0);
  }catch(e){}
}
async function markRead(id){
  await api('/api/notifications/'+id+'/read', {method:'POST'});
  loadNotifications(); loadHome();
}

// Account
async function loadAccount(){
  document.getElementById('accountInfo').innerHTML=`
    <div class="flex gap-4 items-center">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white flex items-center justify-center text-2xl font-black shadow-md">${employee.name.split(' ').pop()[0]}</div>
      <div class="flex-1">
        <div class="font-black text-lg text-pink-900 leading-tight">${employee.name}</div>
        <div class="font-mono text-xs text-slate-500 mt-0.5">${employee.employeeId}</div>
        <div class="text-sm text-slate-600 mt-0.5">${employee.phone} • ${getBranchDisplay(employee.branchId)} • ${employee.shift}</div>
        <div class="mt-1.5 inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm">
          <i class="fa-solid fa-circle-check text-[10px]"></i>${employee.type} • ${employee.status}
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm mt-4">
      <div class="bg-pink-50 border border-pink-100 rounded-xl p-3"><div class="text-[11px] font-bold text-pink-500 uppercase tracking-wide">Chi nhánh</div><div class="font-bold text-slate-800 mt-0.5 text-xs">${getBranchFull(employee.branchId)}</div></div>
      <div class="bg-pink-50 border border-pink-100 rounded-xl p-3"><div class="text-[11px] font-bold text-pink-500 uppercase tracking-wide">Ca làm</div><div class="font-bold text-slate-800 mt-0.5">${employee.shift}</div></div>
      <div class="bg-pink-50 border border-pink-100 rounded-xl p-3"><div class="text-[11px] font-bold text-pink-500 uppercase tracking-wide">Key kích hoạt</div><div class="font-mono font-bold text-slate-800 mt-0.5 text-xs break-all">${empKey}</div></div>
      <div class="bg-pink-50 border border-pink-100 rounded-xl p-3"><div class="text-[11px] font-bold text-pink-500 uppercase tracking-wide">Ngày bắt đầu</div><div class="font-bold text-slate-800 mt-0.5">${fmtDMY(employee.startDate)||'—'}</div></div>
      <div class="bg-pink-50 border border-pink-100 rounded-xl p-3 col-span-2"><div class="text-[11px] font-bold text-pink-500 uppercase tracking-wide">Kết quả TEST</div><div class="font-black mt-0.5 ${employee.testScore<5?'text-red-600':employee.testScore<=7?'text-amber-600':'text-green-600'}">${employee.testScore??'Chưa thi'} ${employee.testResult||''}</div></div>
    </div>

    <hr class="my-5 border-pink-100">

    <!-- Section: Đổi điện thoại -->
    <div class="flex items-center gap-2 mb-3">
      <span class="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white shadow-sm">
        <i class="fa-solid fa-mobile-screen text-sm"></i>
      </span>
      <div>
        <div class="font-black text-pink-900 text-sm">Đổi điện thoại</div>
        <div class="text-[11px] text-slate-500">Yêu cầu Reset thiết bị • Admin duyệt trong 30 phút</div>
      </div>
    </div>
    <div class="bg-pink-50 border border-pink-200 rounded-xl p-3 mb-3 font-mono text-xs text-slate-700">
      <div>Key: <span class="font-black text-pink-800">${empKey}</span></div>
      <div class="mt-1">Device ID: <span class="font-bold">${deviceId}</span></div>
      <div class="mt-1 text-slate-500">${employee.employeeId} • ${employee.name}</div>
    </div>
    <div class="text-[11px] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-700 mb-3">
      <i class="fa-solid fa-triangle-exclamation"></i> Thiết bị cũ bị đăng xuất ngay khi Admin duyệt. Bạn cần đăng nhập lại trên thiết bị mới.
    </div>
    <label class="text-xs font-bold text-pink-700">Lý do đổi thiết bị <span class="text-red-500">*</span></label>
    <textarea id="deviceReason" rows="2" placeholder="VD: Vỡ màn hình, thay điện thoại mới..." class="w-full mt-1 px-3 py-2.5 rounded-xl border border-pink-200 text-sm focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none"></textarea>
    <button onclick="submitDeviceRequest()" class="w-full mt-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-black py-2.5 rounded-xl shadow flex items-center justify-center gap-2">
      <i class="fa-solid fa-paper-plane"></i> Gửi yêu cầu Reset (30 phút hết hạn)
    </button>

    <div class="mt-4">
      <div class="font-bold text-sm text-pink-900 mb-2">Lịch sử yêu cầu đổi thiết bị</div>
      <div id="deviceHistory" class="space-y-2"><div class="text-xs text-slate-400 text-center py-2">Đang tải...</div></div>
    </div>
  `;
  // Load device history
  try{
    const history = await api('/api/device-requests').catch(()=>[]);
    const mine = Array.isArray(history) ? history.filter(r=>r.employeeId===employee.employeeId) : [];
    const el = document.getElementById('deviceHistory');
    if(el) el.innerHTML = mine.map(r=>`
      <div class="flex justify-between items-center bg-white border border-pink-100 rounded-xl px-3 py-2">
        <div>
          <div class="text-xs font-bold text-slate-700">${r.reason}</div>
          <div class="text-[11px] text-slate-400">${fmtDMYTime(r.createdAt)}</div>
        </div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='PENDING'?'bg-amber-100 text-amber-700':r.status==='APPROVED'?'bg-green-100 text-green-700':r.status==='EXPIRED'?'bg-slate-200 text-slate-500':'bg-red-100 text-red-700'}">${r.status}</span>
      </div>
    `).join('') || '<div class="text-xs text-slate-400 text-center py-3"><i class="fa-solid fa-inbox text-slate-300 text-xl block mb-1"></i>Chưa có yêu cầu nào</div>';
  }catch(e){}
}

async function loadSalaryTab() {
  const el = document.getElementById('salaryContent');
  if (!el) return;

  el.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold"><i class="fa-solid fa-circle-notch fa-spin text-emerald-500 text-2xl mb-2"></i><br>Đang tải dữ liệu Bảng lương AI...</div>`;

  try {
    const isOfficial = employee && (employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL');
    const hourlyRate = isOfficial ? 25500 : 21000;
    const empTypeLabel = isOfficial ? 'Nhân viên Chính thức (25.500đ/giờ)' : 'Nhân viên Thử việc / Training (21.000đ/giờ)';
    const rateBadgeColor = isOfficial ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white';

    const atts = await api('/api/attendances?employeeId=' + employee.employeeId).catch(() => []);

    let totalHours = 0;
    let totalShifts = 0;
    let totalSalary = 0;

    const shiftRows = (atts || []).map(a => {
      let hours = 5;
      let shiftLabel = 'Ca Sáng (07h - 12h)';
      if (a.shift === 'CA_TRUA' || a.shift === 'CA_CHIEU') {
        hours = 6;
        shiftLabel = 'Ca Trưa (12h - 18h)';
      } else if (a.shift === 'CA_TOI') {
        hours = 5;
        shiftLabel = 'Ca Tối (18h - 23h)';
      }

      const shiftSalary = hours * hourlyRate;
      totalHours += hours;
      totalShifts += 1;
      totalSalary += shiftSalary;

      return `
        <tr class="border-b border-slate-100 text-xs">
          <td class="py-3 px-3 font-bold text-slate-800">${fmtDMY(a.date)}</td>
          <td class="py-3 px-3"><span class="font-bold text-slate-700">${shiftLabel}</span></td>
          <td class="py-3 px-3 text-center font-bold text-slate-600">${hours}h</td>
          <td class="py-3 px-3 text-center font-semibold text-slate-500">${hourlyRate.toLocaleString('vi-VN')}đ/h</td>
          <td class="py-3 px-3 text-right font-black text-emerald-600">${shiftSalary.toLocaleString('vi-VN')}đ</td>
          <td class="py-3 px-3 text-center"><span class="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full">ĐÃ ĐIỂM DANH</span></td>
        </tr>
      `;
    }).join('');

    el.innerHTML = `
      <div class="space-y-4">
        <!-- AI Salary Header Banner -->
        <div class="rounded-3xl p-5 text-white shadow-lg relative overflow-hidden" style="background:linear-gradient(135deg,#059669,#10b981 60%,#14b8a6)">
          <div class="relative z-10">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div class="font-black text-lg flex items-center gap-2">
                <i class="fa-solid fa-robot text-emerald-200"></i> HỆ THỐNG PHÂN TÍCH LƯƠNG AI
              </div>
              <span class="text-xs font-black px-3 py-1 rounded-full shadow-xs ${rateBadgeColor}">
                ${empTypeLabel}
              </span>
            </div>
            <p class="text-xs opacity-90 leading-relaxed">
              Hệ thống tự động chấm công & tính lương chính xác theo quy chuẩn hợp đồng làm việc tại Ụm Bò Milk.
            </p>
          </div>
        </div>

        <!-- Summary Stat Cards -->
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-white border border-emerald-100 rounded-2xl p-3.5 shadow-sm text-center">
            <div class="text-[10px] font-black text-emerald-500 uppercase tracking-wide">Tổng thu nhập</div>
            <div class="font-black text-base text-emerald-700 mt-1">${totalSalary.toLocaleString('vi-VN')}đ</div>
          </div>
          <div class="bg-white border border-blue-100 rounded-2xl p-3.5 shadow-sm text-center">
            <div class="text-[10px] font-black text-blue-500 uppercase tracking-wide">Số ca làm</div>
            <div class="font-black text-base text-blue-700 mt-1">${totalShifts} Ca</div>
          </div>
          <div class="bg-white border border-purple-100 rounded-2xl p-3.5 shadow-sm text-center">
            <div class="text-[10px] font-black text-purple-500 uppercase tracking-wide">Tổng số giờ</div>
            <div class="font-black text-base text-purple-700 mt-1">${totalHours} Giờ</div>
          </div>
        </div>

        <!-- Salary Policy Table Card (From Image 1 - Filtered by Employee Type) -->
        <div class="bg-white border border-pink-100 rounded-2xl p-4 shadow-sm">
          <div class="font-black text-xs text-pink-900 flex items-center gap-2 mb-3">
            <i class="fa-solid fa-scroll text-pink-500"></i> BẢNG QUY CHUẨN MỨC LƯƠNG TẠI CỬA HÀNG
          </div>
          <div class="text-xs">
            ${!isOfficial ? `
              <!-- Thử việc (Training) ONLY -->
              <div class="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-4 shadow-xs">
                <div class="font-black text-amber-900 text-sm mb-2.5 flex items-center justify-between">
                  <span class="flex items-center gap-1.5"><i class="fa-solid fa-graduation-cap text-amber-600"></i> MỨC LƯƠNG THỬ VIỆC (TRAINING)</span>
                  <span class="bg-amber-200 text-amber-950 font-black px-3 py-1 rounded-xl shadow-xs text-xs">21.000đ/giờ</span>
                </div>
                <ul class="space-y-2 text-slate-800 text-xs leading-relaxed font-semibold">
                  <li class="flex justify-between items-center bg-white/80 p-2.5 rounded-xl border border-amber-200">
                    <span>• <strong>Ca Sáng</strong> (07h - 12h: 5 tiếng)</span>
                    <strong class="text-amber-700 font-black">105.000đ / ca</strong>
                  </li>
                  <li class="flex justify-between items-center bg-white/80 p-2.5 rounded-xl border border-amber-200">
                    <span>• <strong>Ca Trưa</strong> (12h - 18h: 6 tiếng)</span>
                    <strong class="text-amber-700 font-black">126.000đ / ca</strong>
                  </li>
                  <li class="flex justify-between items-center bg-white/80 p-2.5 rounded-xl border border-amber-200">
                    <span>• <strong>Ca Tối</strong> (18h - 23h: 5 tiếng)</span>
                    <strong class="text-amber-700 font-black">105.000đ / ca</strong>
                  </li>
                </ul>
              </div>
            ` : `
              <!-- Chính thức (Official) ONLY -->
              <div class="rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-4 shadow-xs">
                <div class="font-black text-emerald-900 text-sm mb-2.5 flex items-center justify-between">
                  <span class="flex items-center gap-1.5"><i class="fa-solid fa-award text-emerald-600"></i> MỨC LƯƠNG CHÍNH THỨC (OFFICIAL)</span>
                  <span class="bg-emerald-200 text-emerald-950 font-black px-3 py-1 rounded-xl shadow-xs text-xs">25.500đ/giờ</span>
                </div>
                <ul class="space-y-2 text-slate-800 text-xs leading-relaxed font-semibold">
                  <li class="flex justify-between items-center bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                    <span>• <strong>Ca Sáng</strong> (07h - 12h: 5 tiếng)</span>
                    <strong class="text-emerald-700 font-black">127.500đ / ca</strong>
                  </li>
                  <li class="flex justify-between items-center bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                    <span>• <strong>Ca Trưa</strong> (12h - 18h: 6 tiếng)</span>
                    <strong class="text-emerald-700 font-black">153.000đ / ca</strong>
                  </li>
                  <li class="flex justify-between items-center bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                    <span>• <strong>Ca Tối</strong> (18h - 23h: 5 tiếng)</span>
                    <strong class="text-emerald-700 font-black">127.500đ / ca</strong>
                  </li>
                </ul>
              </div>
            `}
          </div>
        </div>

        <!-- Attendance Payroll Breakdown -->
        <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div class="font-black text-xs text-slate-800 flex items-center justify-between mb-3">
            <span class="flex items-center gap-2"><i class="fa-solid fa-list-check text-emerald-600"></i> CHI TIẾT BẢNG CÔNG & THU NHẬP CÁ NHÂN</span>
            <span class="text-[11px] text-slate-400 font-normal">Tự động đồng bộ từ Check-in</span>
          </div>

          ${totalShifts === 0 ? `
            <div class="p-6 text-center text-slate-400 text-xs font-semibold">
              Chưa có dữ liệu điểm danh ca làm việc. Bạn hãy thực hiện điểm danh ca đầu tiên!
            </div>
          ` : `
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-slate-50 text-[11px] text-slate-500 font-bold border-b border-slate-200">
                    <th class="py-2.5 px-3">Ngày làm</th>
                    <th class="py-2.5 px-3">Ca làm việc</th>
                    <th class="py-2.5 px-3 text-center">Thời lượng</th>
                    <th class="py-2.5 px-3 text-center">Đơn giá/h</th>
                    <th class="py-2.5 px-3 text-right">Lương ca</th>
                    <th class="py-2.5 px-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  ${shiftRows}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="p-6 text-center text-rose-500 font-bold text-xs">Lỗi tải dữ liệu bảng lương AI: ${err.message}</div>`;
  }
}

function showToast(msg, type='success'){
  const t=document.createElement('div');
  t.className=`fixed bottom-20 lg:bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-bold ${type==='success'?'bg-pink-500 text-white':'bg-red-600 text-white'}`;
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2500);
}

if(token && employee) showApp();
else { document.getElementById('loginOverlay').classList.remove('hidden'); document.getElementById('app').classList.add('hidden'); initNav(); }
