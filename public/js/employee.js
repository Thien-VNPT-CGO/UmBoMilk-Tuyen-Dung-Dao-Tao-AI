let token = localStorage.getItem('emp_token');
let employee = JSON.parse(localStorage.getItem('emp_data')||'null');
let empKey = localStorage.getItem('emp_key')||'';
let deviceId = localStorage.getItem('device_id') || ('dev_'+Math.random().toString(36).substring(2,10));
localStorage.setItem('device_id', deviceId);
let socket=null;
const API_BASE = location.hostname.includes('vercel.app') ? 'https://umbomilk-hr.onrender.com' : '';
let branches=[];
// === VIETNAM TIMEZONE REALTIME ===
function getVietnamTodayStr(){ return new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'}); }
function getVietnamNow(){ return new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Ho_Chi_Minh'})); }
function toVietnamDateStr(d){ const date = d instanceof Date ? d : new Date(d); return date.toLocaleDateString('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'}); }
function normalizeShift(s){ return s==='CA_TRUA' ? 'CA_CHIEU' : s; }


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
// Tab đang mở hiện tại - nguồn duy nhất quyết định section nào được hiển thị
let currentTab='home';

const NAV = [
  {id:'home', icon:'fa-house', label:'Trang chủ'},
  {id:'attendance', icon:'fa-camera', label:'Điểm danh'},
  {id:'schedule', icon:'fa-calendar-days', label:'Lịch'},
  {id:'salary', icon:'fa-sack-dollar', label:'Lương AI'},
  {id:'off', icon:'fa-umbrella-beach', label:'Nghỉ OFF'},
  {id:'shiftSwap', icon:'fa-people-arrows', label:'Đổi ca'},
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
    // Vietnam timezone display
    const vn = new Date(dt.toLocaleString('en-US', {timeZone: 'Asia/Ho_Chi_Minh'}));
    // Fallback to toLocaleString vi-VN with timezone for correctness
    return dt.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
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
// === VI TRANSLATION HELPERS - hiển thị tiếng Việt, giữ giá trị kỹ thuật gốc ===
function getStatusVi(s){
  if(!s) return '—';
  const m={
    COMPLETED:'Hoàn thành',
    CHECKED_IN:'Đã vào ca',
    CHECKED_OUT:'Đã ra ca',
    LATE:'Trễ',
    WORKING:'Đang làm',
    OFF:'Nghỉ',
    PENDING:'Chờ duyệt',
    PENDING_TARGET:'Chờ người được mời',
    PENDING_BROADCAST:'Chờ phổ biến',
    PENDING_BROADCAST_ACCEPTED:'Đã có người nhận',
    APPROVED:'Đã duyệt',
    REJECTED:'Từ chối',
    EXPIRED:'Hết hạn',
    FAILED:'Thất bại',
    SYNCED:'Đã đồng bộ',
    OFFICIAL:'Chính thức',
    TRAINING:'Thử việc',
    WAITING_TEST:'Chờ thi',
    RETEST:'Thi lại',
    PASSED_TEST:'Đã đậu',
    FAILED_TEST:'Không đạt',
    WAITING_OFFICIAL:'Chờ chính thức',
    ARCHIVED:'Đã lưu trữ',
    SUBSTITUTE:'Thay ca',
    EMERGENCY_OFF:'OFF đột xuất',
    ABSENT:'Vắng',
    PRESENT:'Có mặt',
    NO_CHECKOUT:'Thiếu ra ca',
    NO_SCHEDULE:'Không có lịch',
    CANCELLED:'Đã hủy',
    INACTIVE:'Ngừng hoạt động',
    CANCELLED:'Đã hủy',
    INACTIVE:'Ngừng hoạt động'
  };
  return m[s] || s;
}
function getViolationVi(v){
  if(!v) return '';
  const m={LATE:'Đi trễ', EARLY_LEAVE:'Về sớm', NO_CHECKOUT:'Thiếu ra ca', ABSENT:'Vắng', NO_SCHEDULE:'Không có lịch', MISSING_CHECK_IN:'Thiếu vào ca', MISSING_CHECK_OUT:'Thiếu ra ca'};
  return m[v] || v;
}
function getModeVi(m){
  if(m==='ONLINE') return 'Trực tuyến';
  if(m==='DEMO') return 'Dữ liệu mẫu';
  if(m==='AUTO') return 'Tự động';
  return m;
}
// === CA LÀM VIỆC TIẾNG VIỆT - giữ mã kỹ thuật, hiển thị tiếng Việt ===
function getShiftVi(s){
  if(!s) return '—';
  const m={CA_SANG:'Ca Sáng', CA_CHIEU:'Ca Chiều', CA_TRUA:'Ca Chiều', CA_TOI:'Ca Tối'};
  return m[s] || s;
}
function getShiftShortVi(s){
  if(!s) return '—';
  const m={CA_SANG:'SÁNG', CA_CHIEU:'CHIỀU', CA_TRUA:'CHIỀU', CA_TOI:'TỐI'};
  return m[normalizeShift(s)] || s;
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
    if(typeof showToast==='function') showToast('Chế độ: '+getModeVi(currentMode),'success');
  };
}


// Các tab bị ẩn mặc định với tài khoản TRAINING (emergency, đổi ca luôn ẩn; OFF mở để đăng ký tối đa 5 ngày)
const TRAINING_HIDDEN_TABS = ['emergency', 'shiftSwap'];

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

function isTraining5OffDaysCompleted(){
  if(!employee) return false;
  const isTraining = employee.type==='TRAINING' || employee.status==='TRAINING' || employee.status==='WAITING_TEST' || employee.status==='RETEST';
  if(!isTraining) return false;
  if(employee.registeredOffDates && employee.registeredOffDates.length >= 5) return true;
  if(employee.trainingOffDays && employee.trainingOffDays.length >= 5) return true;
  if(Array.isArray(myOffs)){
    const found = myOffs.find(o => (o.type==='TRAINING_OFF' || isTraining) && Array.isArray(o.dates) && o.dates.length >= 5);
    if(found) return true;
  }
  return false;
}

function getVisibleNav(){
  if(!employee) return NAV;
  const isOfficial = employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL';
  // Yêu cầu #5,6: ẩn Thông báo khỏi nav, chỉ dùng chuông
  const baseFilter = (n)=> n.id !== 'notifs';
  if(!isOfficial){
    // Training: ẩn emergency, shiftSwap, notifs; khi đã đăng ký 5 ngày OFF thì ẩn chức năng Nghỉ OFF
    const completed5Off = isTraining5OffDaysCompleted();
    return NAV.filter(n => {
      if(!baseFilter(n)) return false;
      if(TRAINING_HIDDEN_TABS.includes(n.id)) return false;
      if(n.id === 'off' && completed5Off) return false;
      if(n.id === 'elearning') return isElearningUnlocked();
      return true;
    });
  } else {
    // Official: ẩn elearning + notifs, mở emergency (OFF đột xuất) + đổi ca + OFF theo window (Master Spec Mục 19)
    const offOpen = isOffWindowOpen();
    return NAV.filter(n => {
      if(!baseFilter(n)) return false;
      if(n.id === 'elearning') return false;
      // emergency (OFF đột xuất) mở cho chính thức - tối đa 1 lần/tuần, phải có người thay
      if(n.id === 'off') return offOpen; // chỉ hiện trong T6 12:00 - T7 15:00
      if(n.id === 'shiftSwap') return true; // Đổi ca luôn hiện cho chính thức
      return true;
    });
  }
}

// Cập nhật nav sau khi employee data thay đổi (realtime #5,6)
// RÀNG BUỘC: chỉ switchTab() được phép ẩn/hiện section. Hàm này KHÔNG được
// remove 'hidden' khỏi bất kỳ section nào (trước đây gây lỗi hiện 2 chức năng cùng lúc).
function refreshNavVisibility(){
  if(!employee) return;
  const isOfficial = employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL';
  const unlocked = isElearningUnlocked();
  initNav();
  // Chỉ gắn class khóa để mờ nav, không đụng tới 'hidden' của section
  TRAINING_HIDDEN_TABS.forEach(tabId => {
    const sec = document.getElementById('tab-' + tabId);
    if(sec){
      if(!isOfficial) sec.classList.add('training-locked');
      else sec.classList.remove('training-locked');
    }
  });
  const shiftSwapSec = document.getElementById('tab-shiftSwap');
  if(shiftSwapSec){
    if(!isOfficial) shiftSwapSec.classList.add('training-locked');
    else shiftSwapSec.classList.remove('training-locked');
  }
  const elSec = document.getElementById('tab-elearning');
  if(elSec){
    if(!unlocked) elSec.classList.add('training-locked');
    else {
      elSec.classList.remove('training-locked');
      if(currentTab === 'elearning') loadElearning();
    }
  }
  // Nếu tab đang mở không còn được phép (OFF hết giờ, elearning bị khóa...) -> về trang chủ
  if(!isTabAllowed(currentTab)){
    switchTab('home');
    return;
  }
  // Ép ràng buộc: chỉ 1 section hiển thị tại 1 thời điểm
  enforceSingleVisibleTab();
}
// Tab có được phép mở với trạng thái NV hiện tại không (dùng chung cho switchTab + refresh)
function isTabAllowed(id){
  if(!employee) return true;
  const isOfficial = employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL';
  if(TRAINING_HIDDEN_TABS.includes(id) && !isOfficial) return false;
  if(!isOfficial && id === 'off' && isTraining5OffDaysCompleted()) return false;
  // emergency (OFF đột xuất) cho phép chính thức - Master Spec Mục 19 (tối đa 1 lần/tuần, phải có người thay)
  if(isOfficial && id === 'off' && !isOffWindowOpen()) return false;
  if(id === 'elearning' && !isElearningUnlocked()) return false;
  if(!isOfficial && (id === 'attendance' || id === 'schedule') && isTraining7DaysCompleted()) return false;
  if(isOfficial && id === 'attendance' && employee.officialStartDate && getVietnamTodayStr() < employee.officialStartDate) return false;
  return document.getElementById('tab-' + id) ? true : false;
}
// Ẩn tất cả section trừ tab đang mở - chống hiện 2 chức năng cùng lúc
function enforceSingleVisibleTab(){
  const target = 'tab-' + currentTab;
  document.querySelectorAll('.tab-section').forEach(s=>{
    if(s.id === target) s.classList.remove('hidden');
    else s.classList.add('hidden');
  });
}
// Tự động refresh nav mỗi phút để cập nhật window OFF realtime
setInterval(()=>{ if(employee) syncOffWindowFlag().then(()=>{ try{ refreshNavVisibility(); }catch(e){} }); }, 60000);

function initNav(){
  const el=document.getElementById('navMenu');
  const mobile=document.getElementById('mobileNav');
  const visibleNav = getVisibleNav();
  const isLocked7Days = isTraining7DaysCompleted();
  const isOfficial = employee && (employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL');
  
  // Ràng buộc OFF: T6 nhưng chưa đến giờ thì hiển thị nhưng khóa
  const now = getVietnamNow();
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
  // Giữ highlight tab đang mở sau khi vẽ lại nav (initNav hay được gọi realtime)
  document.querySelectorAll('[id^="nav-"]').forEach(b=>b.classList.remove('tab-active'));
  document.querySelectorAll('[id^="mnav-"]').forEach(b=>b.classList.remove('text-green-600'));
  document.getElementById('nav-'+currentTab)?.classList.add('tab-active');
  document.getElementById('mnav-'+currentTab)?.classList.add('text-green-600');

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
  // emergency (OFF đột xuất) được phép cho chính thức (Master Spec Mục 19)
  // Ràng buộc OFF: T6 < 12:00
  if(isOfficial && id === 'off' && getVietnamNow().getDay() === 5 && getVietnamNow().getHours() < 12){
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
    const todayStr = getVietnamTodayStr();
    if(todayStr < employee.officialStartDate){
      showToast(`🔒 Chưa đến ngày bắt đầu chính thức (${employee.officialStartDate.split('-').reverse().join('/')}). Điểm danh sẽ tự động mở vào ngày này.`, 'info');
      return;
    }
  }

  // Ràng buộc: chỉ 1 section hiển thị - ẩn hết rồi mới hiện tab được chọn
  currentTab = id;
  document.querySelectorAll('.tab-section').forEach(s=>s.classList.add('hidden'));
  const target = document.getElementById('tab-'+id);
  if(!target){ currentTab='home'; document.getElementById('tab-home')?.classList.remove('hidden'); }
  else target.classList.remove('hidden');
  enforceSingleVisibleTab();
  document.querySelectorAll('[id^="nav-"]').forEach(b=>b.classList.remove('tab-active'));
  document.querySelectorAll('[id^="mnav-"]').forEach(b=>b.classList.remove('text-green-600'));
  document.getElementById('nav-'+currentTab)?.classList.add('tab-active');
  document.getElementById('mnav-'+currentTab)?.classList.add('text-green-600');
  if(id==='home') loadHome();
  if(id==='attendance') loadAttendanceTab();
  if(id==='schedule') loadSchedule();
  if(id==='salary') loadSalaryTab();
  if(id==='off') loadOff();
  if(id==='emergency') loadEmergency();
  if(id==='shiftSwap') loadShiftSwap();
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
  // Lấy cờ VIP test OFF trước để tab OFF hiện ngay nếu Admin đang bật
  syncOffWindowFlag().then(()=>{ try{ refreshNavVisibility(); }catch(e){} });
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
    document.getElementById('syncBadge').textContent='ĐÃ ĐỒNG BỘ • Đã kết nối';
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
      if(hb) hb.textContent = `AUTO ${new Date(data.now).toLocaleTimeString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}`;
    }
    if(ev==='drive:update'){
      // toast drive realtime for employee
      if(data && Array.isArray(data) && data[0]) console.log('Drive realtime', data[0].drivePath);
    }
    document.getElementById('syncBadge').textContent='CẬP NHẬT TRỰC TIẾP';
    setTimeout(()=>document.getElementById('syncBadge').textContent='ĐÃ ĐỒNG BỘ',1200);
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
  // Realtime cờ VIP test OFF: Admin bật/tắt là NV thấy tab OFF mở/đóng ngay
  socket.on('offWindow:update', (data)=>{
    window._offVipTest = !!(data && data.vipTest);
    try{ refreshNavVisibility(); }catch(e){}
    try{
      const badge=document.getElementById('offWindowBadge');
      if(badge){
        const open=isOffWindowOpen();
        badge.textContent=open?(window._offVipTest?'ĐANG MỞ (VIP TEST)':'ĐANG MỞ (T6 12:00→T7 15:00)'):'ĐÃ ĐÓNG';
        badge.className='text-xs font-black px-3 py-1 rounded-full '+(open?'bg-pink-500 text-white':'bg-slate-200 text-slate-600');
      }
    }catch(e){}
  });
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
  document.getElementById('homeType').textContent=employee.type==='OFFICIAL' ? 'CHÍNH THỨC' : 'THỬ VIỆC';
  document.getElementById('homeType').className='text-xs font-black px-3 py-1 rounded-full shadow '+(employee.type==='OFFICIAL'?'official-badge':'training-badge');
  document.getElementById('homeBranch').textContent=getBranchFull(employee.branchId);
  document.getElementById('homeShift').textContent=getShiftVi(normalizeShift(employee.shift));
  document.getElementById('homeStatus').textContent=getStatusVi(employee.status);
  document.getElementById('homeStatus').className='mt-2 inline-flex text-xs font-black px-3 py-1 rounded-full '+(employee.status==='OFFICIAL'?'bg-pink-100 text-pink-700':employee.status==='TRAINING'?'bg-blue-100 text-blue-700':employee.status==='FAILED_TEST'?'bg-red-100 text-red-700':'bg-pink-100 text-pink-700');
  document.getElementById('homeDate').textContent=new Date().toLocaleDateString('vi-VN',{weekday:'long', timeZone:'Asia/Ho_Chi_Minh'}) + ' ' + fmtDMY(getVietnamTodayStr());
  // schedule today
  try{
    const scheds = await api('/api/schedules?employeeId='+employee.employeeId);
    const today = getVietnamTodayStr();
    let todaySched = null;
    scheds.forEach(s=>{ const d=s.days.find(x=>x.date===today); if(d) todaySched=d; });
    document.getElementById('homeSchedule').textContent= todaySched? `${getStatusVi(todaySched.status)} • ${getShiftVi(normalizeShift(todaySched.shift))}` : '—';
    document.getElementById('homeSchedule').className='font-black text-sm mt-1 '+(todaySched?.status==='OFF'?'text-red-600':todaySched?.status==='WORKING'?'text-green-600':'');
  }catch(e){ document.getElementById('homeSchedule').textContent='—'; }
  // attendance today
  try{
    const atts = await api('/api/attendances?employeeId='+employee.employeeId+'&date='+getVietnamTodayStr());
    const a=atts[0];
    document.getElementById('homeCheckin').textContent= a?.checkIn? a.checkIn.time + (a.status==='LATE'?' (Trễ)':'') : 'Chưa';
    document.getElementById('homeCheckout').textContent= a?.checkOut? a.checkOut.time : (a?.checkIn?'Chưa':'—');
    document.getElementById('todayStatus').textContent= a? `${getStatusVi(a.status)} • Vào ${a.checkIn?.time||'—'} • Ra ${a.checkOut?.time||'—'}` : 'Chưa điểm danh';
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
  // Ràng buộc realtime: Training type mới hiện, nhưng cũng hiện khi status TRAINING/WAITING_TEST/RETEST
  const isTraining = employee.type === 'TRAINING' || ['TRAINING','WAITING_TEST','RETEST','PASSED_TEST'].includes(employee.status);
  if (!isTraining) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const startDateStr = employee.startDate || getVietnamTodayStr();
  const parts = startDateStr.split('T')[0].split('-').map(Number);
  const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : getVietnamNow();
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
  // Draft lưu realtime để không mất khi reload/socket re-render (fix bug chọn 2-3 ngày bị reload mất)
  const draftKey = 'trainingOffDraft_' + employee.employeeId;
  let draft = [];
  try{ draft = JSON.parse(localStorage.getItem(draftKey) || '[]'); }catch(e){ draft=[]; }
  if (isAlreadyRegistered) {
    try{ localStorage.removeItem(draftKey); }catch(e){}
    box.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div class="font-black text-sm text-pink-900 flex items-center gap-2">
          <i class="fa-solid fa-calendar-check text-pink-600"></i> ĐÃ ĐĂNG KÝ 5 NGÀY NGHỈ (OFF) THỬ VIỆC
        </div>
        <span class="text-xs font-bold bg-pink-500 text-white px-2.5 py-0.5 rounded-full">12 NGÀY THỬ VIỆC</span>
      </div>
      <div class="text-xs text-pink-700 font-medium mb-3">
        Phạm vi 12 ngày: <b>${fmtDMY(trialDates[0].date)} → ${fmtDMY(trialDates[11].date)}</b> (7 ngày làm việc + 5 ngày OFF). <span class="text-emerald-700 font-bold">Đã lưu realtime</span>
      </div>
      <div class="flex flex-wrap gap-2">
        ${existingOff.map(d => `<span class="text-xs font-bold bg-pink-100 text-pink-700 border border-pink-200 px-3 py-1 rounded-full"><i class="fa-solid fa-bed text-pink-500"></i> OFF: ${fmtDMY(d)}</span>`).join('')}
      </div>
      <div class="mt-2 text-[11px] text-slate-500">Lịch làm việc đã được AI tự xếp 7 ngày WORKING còn lại. Xem ở tab Lịch.</div>
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
      ${trialDates.map(t => {
        const isChecked = draft.includes(t.date) ? 'checked' : '';
        return `
        <label class="flex flex-col items-center justify-center p-2 bg-white border border-pink-200 rounded-xl cursor-pointer hover:bg-pink-50 text-center transition ${isChecked ? 'bg-pink-50 border-pink-400' : ''}">
          <input type="checkbox" value="${t.date}" ${isChecked} onchange="updateTrainingOffSelection()" class="w-4 h-4 text-pink-600 rounded focus:ring-pink-500">
          <span class="text-[11px] font-black text-pink-900 mt-1">${t.dayName}</span>
          <span class="text-[10px] font-mono text-slate-500">${fmtDMYShort(t.date)}</span>
        </label>
      `}).join('')}
    </div>
    <div class="mt-3 flex items-center justify-between">
      <span id="trainingOffCountText" class="text-xs font-bold text-pink-800">Đã chọn: ${draft.length} / 5 ngày</span>
      <button id="btnSubmitTrainingOff" onclick="submitTrainingOffRegistration()" ${draft.length===5?'':'disabled'} class="text-xs font-black ${draft.length===5?'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow cursor-pointer':'bg-slate-300 text-slate-500 cursor-not-allowed'} px-4 py-2 rounded-xl transition">
        Xác nhận & Gửi 5 ngày OFF
      </button>
    </div>
  `;
  // Cập nhật trạng thái nút ngay sau render
  setTimeout(()=> updateTrainingOffSelection(), 0);
}

function updateTrainingOffSelection() {
  const checked = Array.from(document.querySelectorAll('#trainingOffCheckboxes input:checked')).map(c => c.value);
  const countText = document.getElementById('trainingOffCountText');
  const btn = document.getElementById('btnSubmitTrainingOff');
  if (countText) countText.textContent = `Đã chọn: ${checked.length} / 5 ngày`;
  // Lưu draft realtime để không mất khi socket reload (fix bug 2-3 ngày)
  try{
    if(employee && employee.employeeId){
      localStorage.setItem('trainingOffDraft_' + employee.employeeId, JSON.stringify(checked));
    }
  }catch(e){}
  // Highlight label đã chọn
  document.querySelectorAll('#trainingOffCheckboxes label').forEach(lab=>{
    const inp = lab.querySelector('input');
    if(inp && inp.checked) lab.classList.add('bg-pink-50','border-pink-400');
    else lab.classList.remove('bg-pink-50','border-pink-400');
  });
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
    employee.trainingOffDays = res.registeredOffDates || checked;
    localStorage.setItem('emp_data', JSON.stringify(employee));
    try{ localStorage.removeItem('trainingOffDraft_' + employee.employeeId); }catch(e){}
    showToast('Đã đăng ký 5 ngày OFF thử việc thành công! Lịch đã được AI cập nhật realtime', 'success');
    try{ refreshNavVisibility(); }catch(e){}
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
  if(el) el.textContent=new Date().toLocaleTimeString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});
  const t1=document.getElementById('timeCheckin');
  if(t1) t1.textContent=fmtDMYTime(new Date());
  const t2=document.getElementById('timeCheckout');
  if(t2) t2.textContent=fmtDMYTime(new Date());
  // update off window badge
  const badge=document.getElementById('offWindowBadge');
  if(badge){
    const isOpen = isOffWindowOpen();
    badge.textContent=isOpen?(window._offVipTest?'ĐANG MỞ (VIP TEST)':'ĐANG MỞ (T6 12:00→T7 15:00)'):'ĐÃ ĐÓNG';
    badge.className='text-xs font-black px-3 py-1 rounded-full '+(isOpen?'bg-pink-500 text-white':'bg-slate-200 text-slate-600');
  }
}
async function syncOffWindowFlag(){
  // Lấy cờ VIP test OFF từ server để tab OFF hiện ngay cả khi NV đăng nhập mới trong lúc VIP bật
  try{
    const win = await api('/api/off-window');
    window._offVipTest = !!win.vipTest;
  }catch(e){}
}
function isOffWindowOpen(){
  // Admin bật VIP test là mở mọi lúc (cờ realtime từ server, tắt là về khung giờ)
  if(window._offVipTest) return true;
  const now=getVietnamNow(); const day=now.getDay(); const hour=now.getHours()+now.getMinutes()/60;
  if(day===5 && hour>=12) return true;
  if(day===6 && hour<15) return true;
  return false;
}

// Attendance
let streamCheckin=null, streamCheckout=null;
let capturedCheckin=null, capturedCheckout=null;
async function startCamera(type){
  // Yêu cầu #5,6: Camera sau (environment) - ràng buộc realtime
  try{
    let stream = null;
    try{
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'environment'}}, audio:false});
    }catch(e){
      // Fallback nếu không có camera sau (một số device chỉ có front)
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}, audio:false});
    }
    if(type==='checkin'){ streamCheckin=stream; const v=document.getElementById('videoCheckin'); v.srcObject=stream; v.classList.remove('hidden'); document.getElementById('videoPlaceholder').classList.add('hidden'); document.getElementById('previewCheckin').classList.add('hidden'); }
    else { streamCheckout=stream; const v=document.getElementById('videoCheckout'); v.srcObject=stream; v.classList.remove('hidden'); document.getElementById('videoPlaceholder2')?.classList.add('hidden'); document.getElementById('previewCheckout').classList.add('hidden'); }
  }catch(e){ 
    // Thử fallback camera trước nếu sau thất bại
    try{
      const fallback = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false});
      if(type==='checkin'){ streamCheckin=fallback; const v=document.getElementById('videoCheckin'); v.srcObject=fallback; v.classList.remove('hidden'); document.getElementById('videoPlaceholder').classList.add('hidden'); document.getElementById('previewCheckin').classList.add('hidden'); showToast('Camera sau không khả dụng - đang dùng camera trước', 'info'); }
      else { streamCheckout=fallback; const v=document.getElementById('videoCheckout'); v.srcObject=fallback; v.classList.remove('hidden'); document.getElementById('videoPlaceholder2')?.classList.add('hidden'); document.getElementById('previewCheckout').classList.add('hidden'); showToast('Camera sau không khả dụng - đang dùng camera trước', 'info'); }
    }catch(e2){ alert('Không thể mở camera: '+e2.message+' - Vui lòng cấp quyền camera'); }
  }
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
  gpsEl.textContent='Đang lấy GPS thật...';
  gpsEl.dataset.valid='false';
  if(!navigator.geolocation){ gpsEl.textContent='❌ Trình duyệt không hỗ trợ GPS - Vui lòng dùng Chrome/Safari'; gpsEl.dataset.valid='false'; addrEl.textContent='⚠️ BẮT BUỘC bật GPS để điểm danh'; return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude, accuracy}=pos.coords;
    // Yêu cầu GPS thật: accuracy phải < 100m và không phải mock
    if(accuracy && accuracy > 200){
      gpsEl.textContent=`⚠️ GPS kém chính xác (${Math.round(accuracy)}m) - Vui lòng ra ngoài trời`;
      gpsEl.dataset.valid='false';
      showToast('GPS kém chính xác - vui lòng bật GPS chính xác cao', 'error');
      return;
    }
    gpsEl.textContent=latitude.toFixed(6)+', '+longitude.toFixed(6);
    gpsEl.dataset.valid='true';
    gpsEl.dataset.accuracy=String(accuracy||0);
    addrEl.textContent=branches.find(b=>b.id===employee.branchId)?.address|| `${latitude},${longitude}`;
  }, err=>{
    let msg = '❌ LỖI GPS - BẮT BUỘC bật GPS';
    if(err.code===1) msg='❌ BẠN ĐÃ TỪ CHỐI GPS - Vui lòng bật GPS trong cài đặt trình duyệt';
    else if(err.code===2) msg='❌ Không lấy được GPS - Vui lòng bật định vị';
    else if(err.code===3) msg='❌ Hết thời gian lấy GPS - Vui lòng thử lại';
    gpsEl.textContent=msg;
    gpsEl.dataset.valid='false';
    addrEl.textContent='⚠️ Không có GPS - KHÔNG thể điểm danh. Vui lòng bật GPS và bấm ↻';
    showToast(msg, 'error');
  }, {enableHighAccuracy:true, timeout:10000, maximumAge:0});
}
async function submitCheckin(){
  if(!capturedCheckin) return showToast('Chưa chụp ảnh vào ca bằng camera sau','error');
  const gpsEl=document.getElementById('gpsCheckin');
  const gps=gpsEl.textContent;
  const addr=document.getElementById('addrCheckin').textContent;
  // Ràng buộc GPS thật
  if(!gpsEl.dataset.valid || gpsEl.dataset.valid!=='true') return showToast('❌ GPS chưa sẵn sàng - Vui lòng bấm ↻ để lấy GPS thật (bắt buộc bật GPS)', 'error');
  if(!gps || gps.includes('Đang lấy') || gps.includes('LỖI') || gps.includes('mock') || !gps.includes(',')) return showToast('GPS không hợp lệ - Vui lòng bật GPS và thử lại', 'error');
  try{
    const activeShift = window._currentActiveShift || employee.shift;
    const res = await api('/api/attendance/checkin', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, gps, address:addr, image:capturedCheckin, shift:activeShift, isCameraCapture:true})});
    document.getElementById('checkinResult').className='mt-2 text-xs font-bold rounded-xl px-3 py-2 bg-pink-100 text-pink-700 border border-pink-200';
    document.getElementById('checkinResult').textContent='Vào ca '+getShiftVi(activeShift)+' thành công lúc '+res.checkIn.time+' • '+(res.status!=='CHECKED_IN'?'Vi phạm: '+getStatusVi(res.status):'Đúng giờ');
    document.getElementById('checkinResult').classList.remove('hidden');
    showToast('Check-in thành công ca '+getShiftVi(activeShift),'success');
    loadAttendanceTab(); loadHome();
  }catch(e){
    document.getElementById('checkinResult').className='mt-2 text-xs font-bold rounded-xl px-3 py-2 bg-red-100 text-red-700 border border-red-200';
    document.getElementById('checkinResult').textContent=e.message;
    document.getElementById('checkinResult').classList.remove('hidden');
    showToast(e.message,'error');
  }
}
async function submitCheckout(){
  if(!capturedCheckout) return showToast('Chưa chụp ảnh ra ca bằng camera sau','error');
  const gpsEl=document.getElementById('gpsCheckout');
  const gps=gpsEl.textContent;
  const addr=document.getElementById('addrCheckout').textContent;
  if(!gpsEl.dataset.valid || gpsEl.dataset.valid!=='true') return showToast('❌ GPS chưa sẵn sàng - Vui lòng bấm ↻ để lấy GPS thật (bắt buộc)', 'error');
  if(!gps || gps.includes('Đang lấy') || gps.includes('LỖI') || gps.includes('mock') || !gps.includes(',')) return showToast('GPS không hợp lệ - Vui lòng bật GPS', 'error');
  try{
    const activeShift = window._currentActiveShift || employee.shift;
    const res = await api('/api/attendance/checkout', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, gps, address:addr, image:capturedCheckout, shift:activeShift, isCameraCapture:true})});
    document.getElementById('checkoutResult').className='mt-2 text-xs font-bold rounded-xl px-3 py-2 bg-pink-100 text-pink-700 border border-pink-200';
    document.getElementById('checkoutResult').textContent='Ra ca '+getShiftVi(activeShift)+' thành công lúc '+res.checkOut.time+' • Ca hoàn thành';
    document.getElementById('checkoutResult').classList.remove('hidden');
    showToast('Ra ca '+getShiftVi(activeShift)+' thành công - Ca hoàn thành','success');
    loadAttendanceTab(); loadHome();
  }catch(e){
    document.getElementById('checkoutResult').className='mt-2 text-xs font-bold rounded-xl px-3 py-2 bg-red-100 text-red-700 border border-red-200';
    document.getElementById('checkoutResult').textContent=e.message;
    document.getElementById('checkoutResult').classList.remove('hidden');
    showToast(e.message,'error');
  }
}
async function loadAttendanceTab(){
  // AI realtime window cho NV chính thức — đồng bộ với server.js: checkInOpenBefore=30, checkInCloseAfter=60, penalty sau 5p/30p/60p (UTC+7 Vietnam)
  const SHIFT_MAP = {CA_SANG:{start:'07:00', end:'12:00', hours:5}, CA_CHIEU:{start:'12:00', end:'18:00', hours:6}, CA_TRUA:{start:'12:00', end:'18:00', hours:6}, CA_TOI:{start:'18:00', end:'23:00', hours:5}};
  const normalizeShiftEmp = (s)=> s==='CA_TRUA' ? 'CA_CHIEU' : s;
  const isOfficial = employee && (employee.type==='OFFICIAL' || employee.status==='OFFICIAL');
  const sInfo = SHIFT_MAP[normalizeShiftEmp(employee.shift)] || SHIFT_MAP['CA_SANG'];
  const fmtHM = (mins)=>{ const h=Math.floor(mins/60)%24; const m=mins%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); };
  const parseHM = (str)=>{ const [h,m]=str.split(':').map(Number); return h*60+m; };
  const startMins = parseHM(sInfo.start);
  const endMins = parseHM(sInfo.end);
  const openCheckIn = startMins - 30; // AI mở trước 30p
  const closeCheckIn = endMins - 60; // Tự động đóng trước giờ check out 1 tiếng và chuyển sang check out
  const openCheckOut = endMins - 60; // Tự động mở check-out từ trước 1 tiếng hết ca
  try{
    const winEl = document.getElementById('checkinWindow');
    if(winEl){
      if(isOfficial) winEl.textContent = `Mở ${fmtHM(openCheckIn)} → ${fmtHM(closeCheckIn)} (chuyển Check-out lúc ${fmtHM(closeCheckIn)})`;
      else winEl.textContent = `Mở ${sInfo.start} -30p (Training)`;
    }
  }catch(e){}

  // Sequential Check-in / Check-out UI + AI window realtime (official)
  try{
    const today = getVietnamTodayStr();
    const atts = await api('/api/attendances?employeeId='+employee.employeeId+'&date='+today);
    const todayAtt = atts[0];

    const cardCheckin = document.getElementById('cardCheckin');
    const cardCheckout = document.getElementById('cardCheckout');
    const btnIn = document.getElementById('btnSubmitCheckin');
    const btnOut = document.querySelector('#cardCheckout button[onclick="submitCheckout()"]') || document.getElementById('btnSubmitCheckout');

    const now = getVietnamNow();
    const nowMins = now.getHours()*60 + now.getMinutes();
    const diffLate = nowMins - startMins; // phút trễ

    // Tạo vùng thông báo AI realtime nếu chưa có
    let aiInfo = document.getElementById('attendanceAiInfo');
    if(!aiInfo && cardCheckin && cardCheckin.parentElement){
      aiInfo = document.createElement('div');
      aiInfo.id = 'attendanceAiInfo';
      aiInfo.className = 'card mt-3 p-3 text-xs font-bold hidden';
      cardCheckin.parentElement.insertBefore(aiInfo, cardCheckin);
    }
    let shiftMsg = document.getElementById('attendanceShiftMsg');
    if(!shiftMsg && cardCheckin && cardCheckin.parentElement){
      shiftMsg = document.createElement('div');
      shiftMsg.id = 'attendanceShiftMsg';
      shiftMsg.className = 'card bg-amber-50 border-amber-200 text-amber-800 text-sm font-bold text-center p-6 hidden';
      cardCheckin.parentElement.insertBefore(shiftMsg, cardCheckin);
    }

    const showAiInfo = (html, cls)=>{
      if(!aiInfo) return;
      aiInfo.className = 'card mt-3 p-3 text-xs font-bold text-center '+cls;
      aiInfo.innerHTML = html;
      aiInfo.classList.remove('hidden');
    };
    const hideAiInfo = ()=>{ if(aiInfo) aiInfo.classList.add('hidden'); };

    if(isOfficial){
      // --- NV CHÍNH THỨC: AI window mới (mở trước 30p, không đóng sau 60p, đóng trước 1h hết ca và chuyển check-out) ---
      if(!todayAtt || !todayAtt.checkIn){
        // Chưa check-in
        if(nowMins < openCheckIn){
          const remain = openCheckIn - nowMins;
          if(cardCheckin) cardCheckin.classList.remove('hidden');
          if(cardCheckout) cardCheckout.classList.add('hidden');
          if(shiftMsg){ shiftMsg.innerHTML = `<i class=\"fa-solid fa-robot text-pink-500 text-xl mb-2 block\"></i> AI chưa mở điểm danh<br><span class=\"text-sm\">Ca ${getShiftVi(normalizeShift(employee.shift))} ${sInfo.start}-${sInfo.end} • AI sẽ mở trước 30 phút lúc <b>${fmtHM(openCheckIn)}</b> (còn ${remain} phút)</span>`; shiftMsg.className='card bg-slate-50 border-slate-200 text-slate-600 text-sm font-bold text-center p-6'; shiftMsg.classList.remove('hidden'); }
          if(btnIn) btnIn.disabled = true, btnIn.classList.add('opacity-50','cursor-not-allowed');
          showAiInfo(`<i class=\"fa-solid fa-clock\"></i> AI tự động mở điểm danh trước 30 phút (${fmtHM(openCheckIn)}) • Tự động đóng Check-in và chuyển Check-out lúc ${fmtHM(closeCheckIn)} (trước ra ca 1 tiếng)`, 'bg-slate-50 border-slate-200 text-slate-600');
        } else if(nowMins < closeCheckIn){
          // Không đóng sau 60 phút: mở liên tục cho đến trước giờ ra ca 1 tiếng
          const remain = closeCheckIn - nowMins;
          const late5 = diffLate >=5 && diffLate <30;
          const late30 = diffLate >=30 && diffLate <60;
          const late60 = diffLate >=60;
          if(cardCheckin) cardCheckin.classList.remove('hidden');
          if(cardCheckout) cardCheckout.classList.add('hidden');
          if(shiftMsg) shiftMsg.classList.add('hidden');
          if(btnIn) btnIn.disabled = false, btnIn.classList.remove('opacity-50','cursor-not-allowed');
          if(late60) showAiInfo(`<span class=\"text-red-600\">⚠️ Đã trễ ${diffLate} phút — check-in sẽ phạt 100% ca (${(sInfo.hours*25500).toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}đ) • Tự động chuyển Check-out lúc ${fmtHM(closeCheckIn)} (còn ${remain} phút)</span>`, 'bg-red-50 border-red-200 text-red-700');
          else if(late30) showAiInfo(`<span class=\"text-orange-600\">⚠️ Đã trễ ${diffLate} phút — phạt 50% ca (${Math.round(sInfo.hours*25500*0.5).toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}đ) • Tự động chuyển Check-out lúc ${fmtHM(closeCheckIn)} (còn ${remain} phút)</span>`, 'bg-orange-50 border-orange-200 text-orange-700');
          else if(late5) showAiInfo(`<span class=\"text-amber-600\">⚠️ Trễ ${diffLate} phút — phạt 30.000đ • Tự động chuyển Check-out lúc ${fmtHM(closeCheckIn)} (còn ${remain} phút)</span>`, 'bg-amber-50 border-amber-200 text-amber-700');
          else showAiInfo(`<span class=\"text-emerald-600\">✔ AI đang mở Check-in • Còn ${remain} phút trước khi chuyển Check-out • Check-in đúng giờ không phạt</span>`, 'bg-emerald-50 border-emerald-200 text-emerald-700');
        } else {
          // Trước giờ ra ca 1 tiếng: Hệ thống TỰ ĐỘNG ĐÓNG CHECK-IN và CHUYỂN SANG CHECK-OUT!
          if(cardCheckin) cardCheckin.classList.add('hidden');
          if(cardCheckout) cardCheckout.classList.remove('hidden');
          if(shiftMsg) shiftMsg.classList.add('hidden');
          if(btnOut) btnOut.disabled = false, btnOut.classList.remove('opacity-50','cursor-not-allowed');
          showAiInfo(`<i class=\"fa-solid fa-triangle-exclamation text-amber-600\"></i> Đã quá hạn Check-in (hệ thống tự động đóng trước giờ ra ca 1 tiếng lúc <b>${fmtHM(closeCheckIn)}</b> và chuyển sang Check-out • Bấm Check-out để hoàn thành ca)`, 'bg-amber-50 border-amber-200 text-amber-800');
        }
      } else if(todayAtt.checkIn && !todayAtt.checkOut){
        // Đã check-in, chờ check-out
        if(cardCheckin) cardCheckin.classList.add('hidden');
        if(cardCheckout) cardCheckout.classList.remove('hidden');
        if(shiftMsg) shiftMsg.classList.add('hidden');
        if(nowMins < openCheckOut){
          const remain = openCheckOut - nowMins;
          if(btnOut) btnOut.disabled = true, btnOut.classList.add('opacity-50','cursor-not-allowed');
          showAiInfo(`<i class=\"fa-solid fa-hourglass-half\"></i> Đã Check-in lúc ${todayAtt.checkIn.time} • AI sẽ mở Check-out lúc <b>${sInfo.end}</b> sau khi hết ca (còn ${remain} phút) • Ra sớm trước ${sInfo.end} sẽ phạt 50.000đ`, 'bg-blue-50 border-blue-200 text-blue-700');
        } else {
          if(btnOut) btnOut.disabled = false, btnOut.classList.remove('opacity-50','cursor-not-allowed');
          hideAiInfo();
          // Cập nhật badge check-out window
          const coBadge = cardCheckout.querySelector('span.bg-rose-100');
          if(coBadge) coBadge.textContent = 'AI ĐANG MỞ • Bấm Check-out ngay';
        }
      } else {
        // Hoàn thành cả 2
        if(cardCheckin) cardCheckin.classList.add('hidden');
        if(cardCheckout) cardCheckout.classList.remove('hidden');
        if(shiftMsg) shiftMsg.classList.add('hidden');
        hideAiInfo();
        if(btnOut) btnOut.disabled = true, btnOut.classList.add('opacity-50','cursor-not-allowed');
      }
      // Realtime tự động refresh mỗi phút cho official
      if(!window._attendanceRealtimeInterval){
        window._attendanceRealtimeInterval = setInterval(()=>{ if(document.getElementById('tab-attendance') && !document.getElementById('tab-attendance').classList.contains('hidden')) loadAttendanceTab(); }, 60000);
      }
    } else {
      // --- NV TRAINING: Tự động nhận diện ca làm việc (hỗ trợ 1, 2 hoặc 3 ca / ngày) ---
      const schedToday = mySchedules.flatMap(s=>s.days||[]).find(d=>d.date===today);
      const todayShifts = [];
      if(schedToday && (schedToday.status==='WORKING' || schedToday.status==='SUBSTITUTE')){
        if(Array.isArray(schedToday.shifts) && schedToday.shifts.length){
          schedToday.shifts.forEach(s=> { if(s && !todayShifts.includes(s)) todayShifts.push(s); });
        } else {
          if(schedToday.shift && schedToday.shift!=='OFF') todayShifts.push(schedToday.shift);
          if(schedToday.shift2 && !todayShifts.includes(schedToday.shift2)) todayShifts.push(schedToday.shift2);
          if(schedToday.shift3 && !todayShifts.includes(schedToday.shift3)) todayShifts.push(schedToday.shift3);
        }
      }
      if(!todayShifts.length) todayShifts.push(employee.shift || 'CA_SANG');

      let activeShift = null;
      let activeAtt = null;
      const inProgress = (atts||[]).find(a=> a.checkIn && !a.checkOut);
      if(inProgress){
        activeShift = inProgress.shift;
        activeAtt = inProgress;
      } else {
        const currentTime = now.getHours() + now.getMinutes()/60;
        const uncompleted = todayShifts.filter(s => {
          const a = (atts||[]).find(x=> x.shift === s);
          return !a || !a.checkOut;
        });

        if(uncompleted.length === 0){
          activeShift = todayShifts[todayShifts.length - 1];
          activeAtt = (atts||[]).find(x=> x.shift === activeShift);
        } else {
          for(const s of uncompleted){
            const norm = normalizeShiftEmp(s);
            if(norm === 'CA_SANG' && currentTime <= 12.5) { activeShift = s; break; }
            if(norm === 'CA_CHIEU' && currentTime >= 11.5 && currentTime <= 18.5) { activeShift = s; break; }
            if(norm === 'CA_TOI' && currentTime >= 17.5) { activeShift = s; break; }
          }
          if(!activeShift) activeShift = uncompleted[0];
          activeAtt = (atts||[]).find(x=> x.shift === activeShift);
        }
      }

      window._currentActiveShift = activeShift;

      // Hiển thị dải trạng thái đa ca nếu hôm nay có từ 2 ca trở lên
      if(todayShifts.length > 1){
        const shiftsStatusHtml = todayShifts.map((s, idx)=>{
          const attS = (atts||[]).find(a=> a.shift === s);
          const isDone = attS && attS.checkOut;
          const isInProg = attS && attS.checkIn && !attS.checkOut;
          const isCurrent = s === activeShift;
          const bg = isDone ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : isInProg ? 'bg-pink-100 text-pink-800 border-pink-300 font-black ring-2 ring-pink-400' : isCurrent ? 'bg-blue-100 text-blue-800 border-blue-300 font-bold' : 'bg-slate-100 text-slate-500 border-slate-200';
          const icon = isDone ? 'fa-check' : isInProg ? 'fa-hourglass-half' : isCurrent ? 'fa-arrow-right' : 'fa-clock';
          const stateText = isDone ? 'Đã xong' : isInProg ? 'Đang làm' : isCurrent ? 'Ca hiện tại' : 'Chưa đến';
          return `<span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${bg}"><i class="fa-solid ${icon}"></i> Ca ${idx+1} (${getShiftVi(normalizeShiftEmp(s))}): ${stateText}</span>`;
        }).join(' ');

        showAiInfo(`<div class="text-xs font-black text-pink-900 mb-1"><i class="fa-solid fa-calendar-day text-pink-600 mr-1"></i> Hôm nay bạn xếp ${todayShifts.length} ca (Rút ngắn thời gian thử việc):</div><div class="flex flex-wrap items-center justify-center gap-1.5 mt-1">${shiftsStatusHtml}</div>`, 'bg-pink-50/80 border-pink-200 text-pink-900');
      } else {
        hideAiInfo();
      }

      // Kiểm tra trạng thái hoàn thành tất cả ca hôm nay
      const allCompleted = todayShifts.every(s => (atts||[]).some(a => a.shift === s && a.checkOut));
      if(allCompleted){
        if(cardCheckin) cardCheckin.classList.add('hidden');
        if(cardCheckout) cardCheckout.classList.add('hidden');
        if(shiftMsg){
          shiftMsg.innerHTML = `<i class=\"fa-solid fa-circle-check text-2xl text-emerald-600 mb-2 block\"></i> Đã hoàn thành tất cả ca làm việc hôm nay (${todayShifts.length}/${todayShifts.length} ca)<br><span class=\"text-xs font-normal opacity-75\">Rút ngắn đào tạo thành công! Tiếp tục duy trì phong độ cho các ngày tiếp theo.</span>`;
          shiftMsg.className='card bg-emerald-50 border-emerald-200 text-emerald-800 text-sm font-bold text-center p-6';
          shiftMsg.classList.remove('hidden');
        }
      } else {
        // Có ca đang làm hoặc sắp làm
        const currentTime = now.getHours() + now.getMinutes()/60;
        let isShiftTime = false;
        const normActive = normalizeShiftEmp(activeShift);
        if(normActive === 'CA_SANG') isShiftTime = currentTime >= 6.0 && currentTime <= 12.5;
        else if(normActive === 'CA_CHIEU') isShiftTime = currentTime >= 11.5 && currentTime <= 18.5;
        else if(normActive === 'CA_TOI') isShiftTime = currentTime >= 17.5 && currentTime <= 23.5;

        if(!isShiftTime && !activeAtt?.checkIn){
          if (cardCheckin) cardCheckin.classList.add('hidden');
          if (cardCheckout) cardCheckout.classList.add('hidden');
          if(shiftMsg){
            shiftMsg.innerHTML = `<i class=\"fa-solid fa-clock text-2xl mb-2 block\"></i> Chưa đến giờ ca làm việc (${getShiftVi(normActive)})<br><span class=\"text-xs font-normal opacity-75\">Hệ thống tự động nhận diện ca ${getShiftVi(normActive)} và sẽ mở Check-in khi đến ca.</span>`;
            shiftMsg.className='card bg-amber-50 border-amber-200 text-amber-800 text-sm font-bold text-center p-6';
            shiftMsg.classList.remove('hidden');
          }
        } else {
          if(shiftMsg) shiftMsg.classList.add('hidden');
          if(!activeAtt || !activeAtt.checkIn){
            // Sẵn sàng check-in ca hiện hành
            if(cardCheckin) cardCheckin.classList.remove('hidden');
            if(cardCheckout) cardCheckout.classList.add('hidden');
            const inBadge = cardCheckin.querySelector('span.bg-pink-100') || cardCheckin.querySelector('h3');
            if(inBadge) inBadge.title = `Điểm danh ca ${getShiftVi(normActive)}`;
          } else if(activeAtt.checkIn && !activeAtt.checkOut){
            // Sẵn sàng check-out ca hiện hành
            if(cardCheckin) cardCheckin.classList.add('hidden');
            if(cardCheckout) cardCheckout.classList.remove('hidden');
          }
          if(btnIn) btnIn.disabled=false, btnIn.classList.remove('opacity-50','cursor-not-allowed');
          if(btnOut) btnOut.disabled=false, btnOut.classList.remove('opacity-50','cursor-not-allowed');
        }
      }
    }
  }catch(e){}

  // history
  try{
    myAttendances = await api('/api/attendances?employeeId='+employee.employeeId);
    document.getElementById('attendanceHistory').innerHTML = myAttendances.map(a=>`
      <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
        <div><div class="font-bold text-sm">${fmtDMY(a.date)} • ${a.shift} • ${getStatusVi(a.status)}</div><div class="text-xs text-slate-500">Vào ${a.checkIn?.time||'—'} • Ra ${a.checkOut?.time||'—'}</div><div class="text-[11px] font-semibold text-pink-700">${(a.violations||[]).map(v=>getViolationVi(v)).join(', ')||'Không vi phạm'}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${a.status==='COMPLETED'?'bg-pink-500 text-white':a.status==='LATE'||(a.violations&&a.violations.length)?'bg-red-100 text-red-700':'bg-slate-200 text-slate-600'}">${getStatusVi(a.status)}</span>
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
      const month = getVietnamTodayStr().slice(0,7);
      const stats = await api('/api/attendance/official-monthly?employeeId='+employee.employeeId+'&month='+month);
      monthlyEl.innerHTML = `
        <div class="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-3">
          <div class="font-black text-sm text-emerald-900 flex items-center gap-2"><i class="fa-solid fa-calendar-check text-emerald-600"></i> Chấm công Chính thức - Tháng ${fmtMonthYear(month)} (T1→Cuối tháng)</div>
          <div class="grid grid-cols-3 gap-2 mt-2 text-xs">
            <div class="bg-white border border-emerald-100 rounded-xl p-2 text-center"><div class="font-bold text-slate-500">Tổng ngày</div><div class="font-black text-lg text-slate-800">${stats.daysInMonth}</div></div>
            <div class="bg-white border border-emerald-100 rounded-xl p-2 text-center"><div class="font-bold text-slate-500">OFF (2 ngày/tuần)</div><div class="font-black text-lg text-amber-600">${stats.offWeekly}</div><div class="text-[11px]">Đã đăng ký</div></div>
            <div class="bg-white border border-emerald-100 rounded-xl p-2 text-center"><div class="font-bold text-slate-500">Làm việc</div><div class="font-black text-lg text-emerald-600">${stats.workingScheduled}</div><div class="text-[11px] ${stats.min12Compliant?'text-emerald-600':'text-red-600 font-bold'}">${stats.min12Compliant?'✓ ≥12 ngày':'✗ &lt;12 ngày'}</div></div>
          </div>
          <div class="mt-2 text-xs flex justify-between"><span>Lịch WORKING trong tháng: <b>${stats.scheduledWorking}</b> ngày</span><span>Đã điểm danh: <b>${stats.completedAttendances}</b></span></div>
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
    // Ràng buộc realtime: Official chỉ hiện lịch tuần sau khi đã duyệt OFF 2 ngày và HR đã duyệt
    const isOfficial = employee.type==='OFFICIAL' || employee.status==='OFFICIAL';
    let displaySchedules = [...mySchedules];
    if(isOfficial){
      const nextMon = toVietnamDateStr(getMonday(new Date(getVietnamNow().getTime()+7*24*60*60*1000)));
      const nextWeekSched = mySchedules.find(s=>s.weekStart===nextMon);
      // Fix: kiểm tra OFF theo khoảng ngày tuần sau (T2-CN), không phụ thuộc nextWeekSched đã tồn tại hay chưa — để realtime cập nhật ngay sau khi đăng ký
      const nextWeekDates = [];
      for(let _i=0; _i<7; _i++){ const _d=new Date(nextMon); _d.setDate(new Date(nextMon).getDate()+_i); nextWeekDates.push(toVietnamDateStr(_d)); }
      const hasOffForNextWeek = (await api('/api/off-requests?employeeId='+employee.employeeId).catch(()=>[])).some(r=>r.status==='APPROVED' && r.dates && r.dates.some(d=> nextWeekDates.includes(d)));
      // Fix: hiển thị lịch tuần sau ngay khi NV đã đăng ký OFF 2 ngày (realtime), không chờ HR duyệt draft
      displaySchedules = mySchedules.filter(s=>{
        if(s.weekStart===nextMon){
          // Chỉ ẩn tuần sau nếu chưa đăng ký OFF; nếu đã có OFF phê duyệt thì hiển thị luôn kể cả draft PENDING (để NV thấy OFF ngay)
          if(!hasOffForNextWeek) return false;
        }
        // Ẩn các tuần tới xa hơn (chỉ hiện hiện tại và tuần sau)
        const weekDate = new Date(s.weekStart);
        const curMon = getMonday(getVietnamNow());
        const diffWeeks = Math.round((weekDate - curMon)/(7*24*60*60*1000));
        if(diffWeeks>1) return false;
        return true;
      });
      if(displaySchedules.length===0){
        return el.innerHTML='<div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">Chưa có lịch tuần sau - vui lòng đăng ký OFF 2 ngày (T6 12:00 - T7 15:00) để AI sắp lịch</div>';
      }
    }
    const today = getVietnamTodayStr();
    const offBanner = (!isOfficial && isTraining5OffDaysCompleted()) ? `
      <div class="bg-pink-50 border border-pink-200 rounded-3xl p-4 mb-4 flex items-center justify-between gap-3 shadow-xs">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            <i class="fa-solid fa-bed"></i>
          </div>
          <div>
            <div class="font-black text-sm text-pink-900">5 NGÀY NGHỈ (OFF) ĐÀO TẠO ĐÃ ĐƯỢC LƯU & TỰ ĐỘNG SẮP LỊCH</div>
            <div class="text-xs text-pink-700 font-medium mt-0.5">
              ${(employee.registeredOffDates || employee.trainingOffDays || []).map(d => `<span class="inline-block bg-white border border-pink-200 px-2 py-0.5 rounded-md font-bold text-[11px] mr-1">${fmtDMY(d)}</span>`).join('')}
            </div>
          </div>
        </div>
        <span class="text-xs font-bold bg-pink-500 text-white px-3 py-1 rounded-full whitespace-nowrap hidden sm:inline-block">5 NGÀY OFF ĐÃ LƯU</span>
      </div>
    ` : '';
    el.innerHTML = offBanner + displaySchedules.map(s=>{
      const isCurrentWeek = isDateInCurrentWeek(new Date(s.weekStart));
      const workingDays = s.days.filter(d => d.status === 'WORKING' || d.status === 'SUBSTITUTE').length;
      
      const isTraining = employee.type==='TRAINING' || employee.status==='TRAINING' || employee.status==='WAITING_TEST';
      return `
      <div class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="px-5 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-b flex flex-wrap justify-between items-center gap-3">
          <div class="flex items-center gap-3">
            <span class="font-black text-lg text-indigo-900">Tuần ${fmtDMY(s.weekStart)}</span>
            ${isCurrentWeek ? '<span class="text-base font-black bg-indigo-600 text-white px-4 py-1.5 rounded-full">TUẦN NÀY</span>' : '<span class="text-base font-black bg-slate-400 text-white px-4 py-1.5 rounded-full">TUẦN TỚI</span>'}
            <span class="text-base font-bold bg-white border border-indigo-100 px-4 py-1.5 rounded-full">${workingDays} ngày làm</span>
            <span class="hidden sm:inline-flex text-base font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-1.5 rounded-full" title="AI tự động xếp lịch T2→CN dựa trên 5 ngày OFF và quy định ≥12 ngày/tháng"><i class="fa-solid fa-robot mr-1"></i>AI Auto</span>
          </div>
          <div class="flex items-center gap-2">
            ${isTraining ? `<button onclick="openTrainingShiftModal('${s.weekStart}')" class="text-base font-black bg-gradient-to-r from-pink-500 to-rose-500 text-white px-5 py-2.5 rounded-xl shadow hover:from-pink-600 hover:to-rose-600 flex items-center gap-1.5"><i class="fa-solid fa-rotate"></i> Đổi ca</button><button onclick="openTrainingAddShiftModal('${s.weekStart}')" class="text-base font-black bg-white border border-pink-200 text-pink-700 px-4 py-2.5 rounded-xl hover:bg-pink-50"><i class="fa-solid fa-plus"></i> Thêm ca</button>` : ''}
            <span class="text-base font-bold text-slate-600 hidden md:inline">${getBranchDisplay(employee.branchId)}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4 p-4 bg-slate-50/50">
          ${s.days.map(d=>{
            const isToday = d.date === today;
            let bgColor = 'bg-white';
            let borderColor = 'border-slate-100';
            let statusClass = 'bg-slate-100 text-slate-500';
            let statusText = getStatusVi(d.status).toUpperCase();
            
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
              statusText = 'LÀM VIỆC';
            } else if(d.status === 'SUBSTITUTE') {
              bgColor = 'bg-indigo-50/30';
              borderColor = 'border-indigo-200';
              statusClass = 'bg-indigo-600 text-white';
              statusText = 'THAY CA';
            } else if(d.status === 'WAITING_OFFICIAL') {
              bgColor = 'bg-slate-50';
              borderColor = 'border-slate-200';
              statusClass = 'bg-slate-200 text-slate-600';
              statusText = 'CHỜ CHÍNH THỨC';
            } else if(d.status === 'EMERGENCY_PENDING') {
              bgColor = 'bg-amber-50/30';
              borderColor = 'border-amber-200';
              statusClass = 'bg-amber-500 text-white';
              statusText = 'CHỜ DUYỆT';
            }

            return `
            <div class="rounded-2xl border-2 ${borderColor} p-4 text-center transition-all ${bgColor} ${isToday ? 'ring-4 ring-pink-300 scale-[1.03] z-10 shadow-lg' : ''}">
              <div class="text-base font-black ${isToday?'text-pink-600':'text-slate-400'} uppercase tracking-widest">${d.dayName}</div>
              <div class="text-2xl font-mono font-black ${isToday?'text-pink-900':'text-slate-800'} leading-none mt-1">${fmtDMYShort(d.date)}</div>
              <div class="text-sm font-bold text-slate-500 mt-1">${fmtDMY(d.date)}</div>
              <div class="mt-3 flex flex-col items-center gap-2">
                <span class="text-sm font-black px-4 py-1.5 rounded-full ${statusClass}">${statusText}</span>
                <div class="text-base font-black text-slate-800 leading-tight min-h-[32px] flex flex-col items-center justify-center gap-0.5">
                  ${(() => {
                    if (d.status !== 'WORKING' && d.status !== 'SUBSTITUTE') return '—';
                    const shifts = [];
                    if (Array.isArray(d.shifts) && d.shifts.length) {
                      d.shifts.forEach(s => { if (s && !shifts.includes(s)) shifts.push(s); });
                    } else {
                      if (d.shift && d.shift !== 'OFF') shifts.push(d.shift);
                      if (d.shift2 && !shifts.includes(d.shift2)) shifts.push(d.shift2);
                      if (d.shift3 && !shifts.includes(d.shift3)) shifts.push(d.shift3);
                    }
                    if (!shifts.length) return getShiftShortVi(d.shift);
                    if (shifts.length === 1) return getShiftShortVi(shifts[0]);
                    return `<span class="text-pink-700">${shifts.map(s => getShiftShortVi(s)).join('+')}</span><span class="text-[10px] font-black bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">${shifts.length} ca/ngày</span>`;
                  })()}
                </div>
              </div>
              ${isToday ? '<div class="text-sm font-black text-pink-600 mt-2 uppercase tracking-widest">● Hôm nay</div>' : ''}
            </div>
            `;
          }).join('')}
        </div>
        <div class="px-5 py-3 bg-slate-50 border-t flex justify-between items-center text-sm text-slate-600">
           <span><i class="fa-solid fa-building-user mr-1"></i> ${getBranchDisplay(employee.branchId)}</span>
            <span class="italic">Cập nhật bởi AI lúc ${new Date().toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', timeZone: 'Asia/Ho_Chi_Minh'})}</span>
        </div>
        ${(() => {
          // Chú thích chi tiết lịch làm việc (hiển thị cho cả Training và Official) — chữ to cho NV dễ đọc
          const isTraining = employee.type==='TRAINING';
          if(isTraining){
            return `<div class="px-5 py-4 bg-amber-50 border-t border-amber-100 text-sm text-amber-800 leading-relaxed">
              <div class="font-black text-base flex items-center gap-2"><i class="fa-solid fa-circle-info text-amber-600"></i> Chú thích lịch Thử việc (12 ngày thử việc):</div>
              <div class="mt-2 text-sm">• <b>LÀM VIỆC:</b> Ngày làm việc (7/12 ngày) - AI tự xếp theo ca đăng ký</div>
              <div class="text-sm">• <b>NGHỈ:</b> Ngày nghỉ đã đăng ký (5/12 ngày) - chọn khi đăng ký nghỉ</div>
              <div class="text-sm">• <b>CHỜ CHÍNH THỨC:</b> Chờ HR duyệt lên chính thức</div>
              <div class="text-sm">• <b>Hôm nay:</b> Viền hồng đậm</div>
              <div class="text-sm">• Đổi ca: Thử việc có thể đổi/thêm ca (1 ngày 2 ca) để rút ngắn 7→6 ngày - HR duyệt 15 phút</div>
            </div>`;
          } else {
            return `<div class="px-5 py-4 bg-blue-50 border-t border-blue-100 text-sm text-blue-800 leading-relaxed">
              <div class="font-black text-base flex items-center gap-2"><i class="fa-solid fa-circle-info text-blue-600"></i> Chú thích hệ thống gán ca tự động:</div>
              <div class="mt-2 text-sm">• <b>LÀM VIỆC:</b> Ngày làm việc theo ca đã gán (Ca Sáng:07-12h, Ca Chiều:12-18h, Ca Tối:18-23h)</div>
              <div class="text-sm">• <b>NGHỈ:</b> Ngày nghỉ (đã đăng ký nghỉ 2 ngày/tuần hoặc Chủ Nhật) - AI đảm bảo không trùng ca cùng chi nhánh</div>
              <div class="text-sm">• <b>THAY CA:</b> Ngày thay ca cho nhân viên khác (đổi ca)</div>
              <div class="text-sm">• <b>Tuần này/Tuần tới:</b> Nhãn phân biệt tuần hiện tại và tuần sau</div>
              <div class="text-sm">• Lịch tuần sau AI tạo sau khi HR duyệt nghỉ (T7 15:00) và gửi đến nhân viên qua thông báo</div>
              <div class="text-sm">• <b>Đổi ca:</b></div>
              <div class="ml-3 text-sm">+ Xin phép đổi ca &gt; 24 tiếng trước lịch làm: thực hiện theo quy trình đổi ca trong app</div>
              <div class="ml-3 text-sm">+ Xin phép đổi ca &lt; 24 tiếng trước lịch làm: Vui lòng liên hệ trực tiếp HR</div>
            </div>`;
          }
        })()}
      </div>
      `;
    }).join('');
  }catch(e){ console.error('loadSchedule error', e); }
}
// Training: Đổi ca / Thêm ca (yêu cầu #5) – HR 15p auto duyệt, 1 ngày 2 ca để rút ngắn 7→6 ngày
async function loadTrainingShiftHistoryModal(){
  const container = document.getElementById('trainingShiftHistoryList');
  if(!container || !employee) return;
  try{
    const list = await api('/api/training/shift-requests?employeeId=' + employee.employeeId);
    if(!list || list.length === 0){
      container.innerHTML = '<div class="text-slate-400 text-center py-3">Chưa có yêu cầu đổi ca hoặc thêm ca nào</div>';
      return;
    }
    container.innerHTML = list.map(r => {
      const isAdd = r.type === 'ADD_SHIFT' || (r.reason && r.reason.startsWith('[THÊM CA]'));
      const typeBadge = isAdd
        ? '<span class="bg-teal-100 text-teal-800 border border-teal-200 text-[10px] font-black px-2 py-0.5 rounded-full">THÊM CA</span>'
        : '<span class="bg-pink-100 text-pink-800 border border-pink-200 text-[10px] font-black px-2 py-0.5 rounded-full">ĐỔI CA</span>';
      const statusClass = r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : (r.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-rose-100 text-rose-700 border-rose-200');
      const statusText = r.status === 'APPROVED' ? 'ĐÃ DUYỆT' : (r.status === 'PENDING' ? 'CHỜ DUYỆT (15p)' : 'TỪ CHỐI');
      return `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-left">
          <div class="flex items-center justify-between gap-1">
            <div class="font-bold text-xs text-slate-800 flex items-center gap-1.5">
              ${typeBadge}
              <span>${fmtDMY(r.date)}</span>
            </div>
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full border ${statusClass}">${statusText}</span>
          </div>
          <div class="text-xs text-slate-700 mt-1">
            ${isAdd ? `Ca thêm: <b>${getShiftVi(normalizeShift(r.toShift))}</b>` : `${getShiftVi(normalizeShift(r.fromShift))} → <b>${getShiftVi(normalizeShift(r.toShift))}</b>`}
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5">Lý do: ${r.reason || '—'}</div>
          <div class="text-[10px] text-slate-400 mt-1 flex justify-between">
            <span>Gửi: ${fmtDMYTime(r.createdAt)}</span>
            <span>${r.approvedBy ? 'Duyệt bởi ' + r.approvedBy : (r.status === 'PENDING' ? 'HR có 15p duyệt' : '')}</span>
          </div>
        </div>
      `;
    }).join('');
  }catch(e){
    container.innerHTML = `<div class="text-rose-500 text-center py-2">${e.message || 'Lỗi tải lịch sử'}</div>`;
  }
}

function getDayOfWeekVi(dStr){
  if(!dStr) return '';
  const parts = dStr.split('T')[0].split('-').map(Number);
  const dt = (parts.length===3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1]-1, parts[2]) : new Date(dStr);
  return ['CN','T2','T3','T4','T5','T6','T7'][dt.getDay()] || '';
}

function openTrainingShiftModal(weekStart){
  if(!employee) return;
  // Lấy toàn bộ các ngày trong chu kỳ 12 ngày thử việc
  const startDateStr = employee.startDate || getVietnamTodayStr();
  const parts = startDateStr.split('T')[0].split('-').map(Number);
  const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : getVietnamNow();
  const trialDates = [];
  for(let i=0; i<12; i++){
    const curr = new Date(startD);
    curr.setDate(startD.getDate() + i);
    trialDates.push(toVietnamDateStr(curr));
  }

  const allDays = (mySchedules || []).flatMap(s => s.days || []);
  const dayMap = {};
  allDays.forEach(d => { dayMap[d.date] = d; });

  const registeredOffs = Array.isArray(employee.registeredOffDates) ? employee.registeredOffDates : [];

  // Danh sách các ngày đang CÓ CA LÀM VIỆC (WORKING) để chọn đổi TỪ
  const workingDays = trialDates.filter(dStr => {
    const dRec = dayMap[dStr];
    if(dRec && dRec.status === 'WORKING') return true;
    if(!registeredOffs.includes(dStr) && (!dRec || dRec.status !== 'OFF')) return true;
    return false;
  });

  const fromOptions = workingDays.map(dStr => {
    const dRec = dayMap[dStr];
    const shiftName = getShiftVi(normalizeShift(dRec?.shift || employee.shift));
    const dayOfWeek = getDayOfWeekVi(dStr);
    return `<option value="${dStr}">${fmtDMY(dStr)} (${dayOfWeek}) - ${shiftName}</option>`;
  }).join('');

  // Danh sách 12 ngày thử việc để chọn CHUYỂN SANG
  const toOptions = trialDates.map(dStr => {
    const dRec = dayMap[dStr];
    const isOff = registeredOffs.includes(dStr) || (dRec && dRec.status === 'OFF');
    const dayOfWeek = getDayOfWeekVi(dStr);
    const label = isOff 
      ? `${fmtDMY(dStr)} (${dayOfWeek}) - [NGÀY NGHỈ OFF] ✨ Tự động hoán đổi`
      : `${fmtDMY(dStr)} (${dayOfWeek}) - [Đang làm: ${getShiftVi(normalizeShift(dRec?.shift || employee.shift))}]`;
    return `<option value="${dStr}" data-is-off="${isOff ? '1' : '0'}">${label}</option>`;
  }).join('');

  const modalHtml = `
    <div id="trainingShiftModal" class="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="font-black text-pink-900 flex items-center gap-2"><i class="fa-solid fa-rotate text-pink-600"></i> Đổi ca làm việc Training</div>
        <div class="text-xs text-slate-500 mt-1">Chọn ngày cần đổi ca và ngày chuyển sang. Nếu chọn chuyển sang ngày đã đăng ký OFF, hệ thống tự động hoán đổi ngày OFF để duy trì đủ <b>7 ngày training và 5 ngày OFF</b> trong 12 ngày thử việc.</div>
        <div class="mt-3 space-y-3">
          <div>
            <label class="text-xs font-bold text-slate-700">Ngày cần đổi ca (TỪ):</label>
            <select id="shiftFromDate" class="w-full mt-1 px-3 py-2 rounded-xl border text-sm font-semibold">${fromOptions || '<option value="">Chưa có ngày làm việc</option>'}</select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-700">Chuyển sang ngày (ĐẾN):</label>
            <select id="shiftToDate" onchange="checkSelectedToDate()" class="w-full mt-1 px-3 py-2 rounded-xl border text-sm font-semibold">${toOptions}</select>
          </div>
          <div id="swapOffNotice" class="hidden text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 p-2.5 rounded-xl font-bold flex items-center gap-2">
            <i class="fa-solid fa-wand-magic-sparkles text-emerald-600 text-sm flex-shrink-0"></i>
            <span><b>Tự động hoán đổi ngày OFF:</b> Ngày này sẽ trở thành ngày đi làm, và ngày cũ sẽ tự động trở thành ngày Nghỉ OFF. Luôn bảo toàn đúng <b>7 ngày training & 5 ngày OFF</b>!</span>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-700">Ca làm việc mới:</label>
            <select id="shiftTo" class="w-full mt-1 px-3 py-2 rounded-xl border text-sm font-semibold">
              <option value="CA_SANG">Ca Sáng (07:00-12:00)</option>
              <option value="CA_CHIEU">Ca Chiều (12:00-18:00)</option>
              <option value="CA_TOI">Ca Tối (18:00-23:00)</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-700">Lý do đổi ca <span class="text-red-500">*</span> (bắt buộc):</label>
            <input id="shiftReason" class="w-full mt-1 px-3 py-2 rounded-xl border text-sm focus:border-pink-400" placeholder="Nhập lý do đổi ca...">
          </div>
        </div>
        <div class="mt-4 flex gap-2">
          <button onclick="submitTrainingShift(false)" class="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black py-2.5 rounded-xl shadow hover:from-pink-600 hover:to-rose-600">Xác nhận đổi ca</button>
          <button onclick="document.getElementById('trainingShiftModal').remove()" class="px-4 bg-slate-100 font-bold py-2.5 rounded-xl hover:bg-slate-200">Đóng</button>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-200">
          <div class="font-black text-xs text-pink-900 flex items-center justify-between mb-2">
            <span><i class="fa-solid fa-clock-rotate-left text-pink-600"></i> Lịch sử yêu cầu Đổi ca / Thêm ca</span>
            <button type="button" onclick="loadTrainingShiftHistoryModal()" class="text-pink-600 hover:text-pink-800 text-[11px] font-bold">↻ Cập nhật</button>
          </div>
          <div id="trainingShiftHistoryList" class="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
            <div class="text-slate-400 text-center py-2">Đang tải lịch sử...</div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  checkSelectedToDate();
  loadTrainingShiftHistoryModal();
}

function checkSelectedToDate(){
  const sel = document.getElementById('shiftToDate');
  const notice = document.getElementById('swapOffNotice');
  if(!sel || !notice) return;
  const opt = sel.options[sel.selectedIndex];
  const isOff = opt?.getAttribute('data-is-off') === '1';
  if(isOff){
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
}

function openTrainingAddShiftModal(weekStart){
  if(!employee) return;
  const sched = mySchedules.find(s=>s.weekStart===weekStart);
  const dates = (sched?.days || []).filter(d=>d.status==='WORKING');
  if(dates.length===0) return showToast('Không có ngày làm việc để thêm ca (chức năng chỉ áp dụng cho ngày đi làm, không áp dụng ngày nghỉ OFF)','error');

  const getDayShiftsList = (d) => {
    const list = [];
    if(Array.isArray(d.shifts) && d.shifts.length){
      d.shifts.forEach(s=> { if(s && !list.includes(s)) list.push(s); });
    } else {
      if(d.shift && d.shift !== 'OFF') list.push(d.shift);
      if(d.shift2 && !list.includes(d.shift2)) list.push(d.shift2);
      if(d.shift3 && !list.includes(d.shift3)) list.push(d.shift3);
    }
    return list.length ? list : (d.shift ? [d.shift] : []);
  };

  const options = dates.map(d=> {
    const curShifts = getDayShiftsList(d);
    const countText = curShifts.length === 1 ? '1 ca' : `${curShifts.length} ca`;
    return `<option value="${d.date}">${fmtDMY(d.date)} (${d.dayName}) - Đang có: ${curShifts.map(s=>getShiftVi(normalizeShift(s))).join(' + ')} (${countText})</option>`;
  }).join('');

  const modalHtml = `
    <div id="trainingShiftModal" class="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="font-black text-pink-900 flex items-center gap-2"><i class="fa-solid fa-plus text-pink-600"></i> Thêm ca làm việc (2 ca hoặc 3 ca / ngày)</div>
        <div class="text-xs text-slate-500 mt-1">Sắp 2 ca hoặc 3 ca trên 1 ngày làm việc giúp tích lũy ca nhanh hơn và rút ngắn quá trình đào tạo. Chức năng chỉ áp dụng cho ngày đi làm (ngày nghỉ OFF không thực hiện được).</div>
        <div class="mt-3 space-y-3">
          <div>
            <label class="text-xs font-bold">Ngày đi làm (đã có ca)</label>
            <select id="shiftDate" onchange="onSelectAddShiftDate('${weekStart}')" class="w-full mt-1 px-3 py-2 rounded-xl border text-sm">${options}</select>
          </div>
          <div id="addShiftNotice" class="p-2.5 rounded-xl text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-800">
            Đang tải thông tin ca...
          </div>
          <div>
            <label class="text-xs font-bold">Ca THÊM</label>
            <select id="shiftTo" class="w-full mt-1 px-3 py-2 rounded-xl border text-sm"></select>
          </div>
          <div>
            <label class="text-xs font-bold">Lý do <span class="text-red-500">*</span> (bắt buộc)</label>
            <input id="shiftReason" class="w-full mt-1 px-3 py-2 rounded-xl border text-sm focus:border-pink-400" placeholder="Nhập lý do thêm ca (ví dụ: Muốn tăng tốc hoàn thành đào tạo)...">
          </div>
        </div>
        <div class="mt-4 flex gap-2">
          <button id="btnSubmitAddShift" onclick="submitTrainingShift(true)" class="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black py-2.5 rounded-xl shadow hover:from-emerald-600 hover:to-teal-700">Gửi yêu cầu thêm ca</button>
          <button onclick="document.getElementById('trainingShiftModal').remove()" class="px-4 bg-slate-100 font-bold py-2.5 rounded-xl hover:bg-slate-200">Đóng</button>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-200">
          <div class="font-black text-xs text-pink-900 flex items-center justify-between mb-2">
            <span><i class="fa-solid fa-clock-rotate-left text-pink-600"></i> Lịch sử yêu cầu Đổi ca / Thêm ca</span>
            <button type="button" onclick="loadTrainingShiftHistoryModal()" class="text-pink-600 hover:text-pink-800 text-[11px] font-bold">↻ Cập nhật</button>
          </div>
          <div id="trainingShiftHistoryList" class="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
            <div class="text-slate-400 text-center py-2">Đang tải lịch sử...</div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  onSelectAddShiftDate(weekStart);
  loadTrainingShiftHistoryModal();
}

function onSelectAddShiftDate(weekStart){
  const selDate = document.getElementById('shiftDate')?.value;
  const selTo = document.getElementById('shiftTo');
  const notice = document.getElementById('addShiftNotice');
  const btnSubmit = document.getElementById('btnSubmitAddShift');
  if(!selDate || !selTo || !notice) return;

  const sched = mySchedules.find(s=>s.weekStart===weekStart);
  const day = (sched?.days || []).find(d=>d.date===selDate);
  if(!day){
    notice.className = 'p-2.5 rounded-xl text-xs font-semibold bg-red-50 border border-red-200 text-red-700';
    notice.textContent = 'Không tìm thấy ngày đã chọn';
    if(btnSubmit) btnSubmit.disabled = true;
    return;
  }

  const existingShifts = [];
  if(Array.isArray(day.shifts) && day.shifts.length){
    day.shifts.forEach(s=> { if(s && !existingShifts.includes(s)) existingShifts.push(s); });
  } else {
    if(day.shift && day.shift !== 'OFF') existingShifts.push(day.shift);
    if(day.shift2 && !existingShifts.includes(day.shift2)) existingShifts.push(day.shift2);
    if(day.shift3 && !existingShifts.includes(day.shift3)) existingShifts.push(day.shift3);
  }

  const ALL_SHIFTS = [
    { value: 'CA_SANG', label: 'Ca Sáng (07:00-12:00)' },
    { value: 'CA_CHIEU', label: 'Ca Chiều (12:00-18:00)' },
    { value: 'CA_TOI', label: 'Ca Tối (18:00-23:00)' }
  ];

  const available = ALL_SHIFTS.filter(s => !existingShifts.includes(s.value));

  if(available.length === 0){
    selTo.innerHTML = '<option value="">-- Đã đủ 3 ca (tối đa) --</option>';
    selTo.disabled = true;
    notice.className = 'p-2.5 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-800';
    notice.innerHTML = '<i class="fa-solid fa-lock text-amber-600 mr-1"></i> Ngày này đã xếp đủ 3 ca (Ca Sáng, Ca Chiều, Ca Tối) - không thể thêm ca nữa.';
    if(btnSubmit){ btnSubmit.disabled = true; btnSubmit.classList.add('opacity-50','cursor-not-allowed'); }
  } else {
    selTo.disabled = false;
    selTo.innerHTML = available.map(s => `<option value="${s.value}">${s.label}</option>`).join('');
    if(btnSubmit){ btnSubmit.disabled = false; btnSubmit.classList.remove('opacity-50','cursor-not-allowed'); }

    const nextCount = existingShifts.length + 1;
    notice.className = 'p-2.5 rounded-xl text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800';
    notice.innerHTML = `<i class="fa-solid fa-bolt text-emerald-600 mr-1"></i> Ngày này hiện có <b>${existingShifts.length} ca</b> (${existingShifts.map(s=>getShiftVi(s)).join(', ')}). Thêm ca sẽ nâng lên <b>${nextCount} ca/ngày</b> để rút ngắn quá trình đào tạo!`;
  }
}

async function submitTrainingShift(isAdd){
  const fromDate = document.getElementById('shiftFromDate')?.value;
  const toDate = isAdd ? document.getElementById('shiftDate')?.value : document.getElementById('shiftToDate')?.value;
  const date = toDate || document.getElementById('shiftDate')?.value;
  const toShift = document.getElementById('shiftTo')?.value;
  const reason = document.getElementById('shiftReason')?.value.trim() || '';

  if(!date || !toShift) return showToast('Thiếu ngày hoặc ca làm việc','error');
  if(!reason) return showToast('Vui lòng nhập lý do (bắt buộc)','error');
  try{
    const endpoint = '/api/training/shift-change';
    const bodyReason = isAdd ? `[THÊM CA] ${reason}` : reason;
    const res = await api(endpoint, {
      method:'POST',
      body: JSON.stringify({
        employeeId: employee.employeeId,
        fromDate: isAdd ? date : fromDate,
        toDate: date,
        date,
        toShift,
        reason: bodyReason,
        isAdd
      })
    });
    showToast(res.message || (isAdd ? 'Đã gửi yêu cầu thêm ca - chờ HR duyệt' : 'Đổi ca thành công'), 'success');
    if(res.registeredOffDates && Array.isArray(res.registeredOffDates)){
      employee.registeredOffDates = res.registeredOffDates;
    }
    loadTrainingShiftHistoryModal();
    if(document.getElementById('shiftReason')) document.getElementById('shiftReason').value = '';
    await loadSchedule();
  }catch(e){ showToast(e.message,'error'); }
}

function isDateInCurrentWeek(date) {
  const now = getVietnamNow();
  const startOfWeek = getMonday(now);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return date >= startOfWeek && date <= endOfWeek;
}

// OFF weekly - Chính thức: AI T6 12:00→T7 15:00 + TH1/TH2 & Training: tối đa 5 ngày
async function loadOff(){
  const isTraining = employee && (employee.type==='TRAINING' || employee.status==='TRAINING' || employee.status==='WAITING_TEST');
  const isOfficial = employee && (employee.type==='OFFICIAL' || employee.status==='OFFICIAL');

  let dates=[];
  if(isTraining){
    // Training: 12 ngày từ startDate (hoặc hôm nay)
    const baseDateStr = employee.startDate || getVietnamTodayStr();
    const baseDate = new Date(baseDateStr);
    for(let i=0; i<12; i++){
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      dates.push(toVietnamDateStr(d));
    }
    try{
      if(mySchedules && mySchedules.length>0){
        const scDates = mySchedules.flatMap(s => (s.days||[]).map(d=>d.date));
        if(scDates.length > 0){
          dates = Array.from(new Set([...dates, ...scDates])).sort();
        }
      }
    }catch(e){}
  } else {
    // generate dates for next week Mon-Sun
    const nextMon = getMonday(new Date(getVietnamNow().getTime()+7*24*60*60*1000));
    for(let i=0;i<7;i++){ const d=new Date(nextMon); d.setDate(nextMon.getDate()+i); dates.push(toVietnamDateStr(d)); }
  }

  try{
    const win = await api('/api/off-window');
    const statusEl=document.getElementById('offWindowStatus');
    const aiEl=document.getElementById('offAiStatus');
    
    // my offs
    myOffs = await api('/api/off-requests?employeeId='+employee.employeeId);
    
    // Check if already registered
    const alreadyRegistered = myOffs.find(r => {
       return r.dates && r.dates.some(d => dates.includes(d));
    });

    const isOpen = isTraining ? true : win.isOpen;
    window._offVipTest = !!win.vipTest;
    try{ refreshNavVisibility(); }catch(e){}

    if(isTraining){
      statusEl.textContent = '🟢 AI đang MỞ đăng ký OFF Nhân viên Đào tạo (Tối đa 5 ngày) - Tự động đồng bộ Google Sheet realtime';
      statusEl.className = 'mt-3 text-xs font-bold rounded-xl px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200';
      if(aiEl){
        aiEl.classList.remove('hidden');
        aiEl.innerHTML = `<div class="font-bold text-blue-800 flex items-center gap-1"><i class="fa-solid fa-robot"></i> AI Tự Động Xếp Lịch Training</div><div class="text-[11px] text-blue-700 mt-1">Đăng ký tối đa 5 ngày OFF trong đợt đào tạo • Các ngày còn lại AI tự động xếp LÀM VIỆC (WORKING) và đồng bộ Google Sheet realtime</div>`;
      }
    } else {
      statusEl.textContent = isOpen? (win.vipTest?'🟢 AI đang MỞ đăng ký OFF (VIP TEST — Admin mở, TH1/TH2 giữ nguyên) - Auto Approve FCFS':'🟢 AI đang MỞ đăng ký OFF (T6 12:00 → T7 15:00) - Auto Approve FCFS') : '🔴 AI đã ĐÓNG đăng ký OFF - ngoài khung giờ (sẽ bị từ chối)';
      statusEl.className='mt-3 text-xs font-bold rounded-xl px-3 py-2 '+(isOpen?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-100 text-red-700 border border-red-200');
      if(aiEl){
        aiEl.classList.remove('hidden');
        aiEl.innerHTML = `<div class="font-bold text-blue-800 flex items-center gap-1"><i class="fa-solid fa-robot"></i> ${win.aiStatus||'AI Auto'}</div><div class="text-[11px] text-blue-700 mt-1">Next: ${win.nextOpen?fmtDMY(win.nextOpen):'—'} 12:00 → ${win.nextClose?fmtDMY(win.nextClose):'—'} 15:00 • Official: ${win.officialCount} NV • Ràng buộc AI: Cùng CN cùng ca không trùng ca, khác ca/khác CN được trùng • ≥12 ngày/tháng → Tự động đồng bộ Google Sheet realtime</div>`;
      }
    }

    const registrationBox = document.getElementById('offRegistrationContainer');
    if (!isOpen) {
      registrationBox.innerHTML = `
        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center">
          <i class="fa-solid fa-clock text-slate-400 text-3xl mb-3 block"></i>
          <div class="font-black text-slate-700">CHƯA ĐẾN THỜI GIAN ĐĂNG KÝ</div>
          <div class="text-xs text-slate-500 mt-2">Vui lòng quay lại vào khung giờ mở cửa (Thứ 6 12:00 - Thứ 7 15:00).</div>
        </div>
      `;
    } else if(alreadyRegistered){
      registrationBox.innerHTML = `
        <div class="bg-pink-50 border border-pink-200 rounded-2xl p-5 text-center">
          <i class="fa-solid fa-calendar-check text-pink-500 text-3xl block mb-3"></i>
          <div class="font-black text-pink-900">${isTraining ? 'BẠN ĐÃ ĐĂNG KÝ OFF ĐÀO TẠO' : 'BẠN ĐÃ ĐĂNG KÝ OFF TUẦN SAU'}</div>
          <div class="text-xs text-pink-700 mt-2">Các ngày đã chọn:</div>
          <div class="flex flex-wrap justify-center gap-2 mt-3">
            ${alreadyRegistered.dates.map(d => `<span class="bg-white border border-pink-200 text-pink-700 font-bold px-3 py-1.5 rounded-full text-xs">${fmtDMY(d)}</span>`).join('')}
          </div>
          <div class="text-[11px] text-slate-500 mt-4 italic">Hệ thống đã ghi nhận và tự động sắp lịch WORKING cho các ngày còn lại (đồng bộ realtime sang Google Sheet).</div>
        </div>
      `;
    } else {
      const maxText = isTraining ? 'Tối đa 5 ngày' : 'Tối đa 2 ngày';
      registrationBox.innerHTML = `
        <div class="font-black text-sm text-pink-900 mb-2 flex items-center justify-between">
          <span>${isTraining ? 'Chọn ngày OFF đào tạo' : 'Chọn ngày OFF tuần sau'} <span class="text-xs font-normal text-pink-600">(${maxText})</span></span>
          <span class="text-[11px] font-bold bg-white border border-pink-200 px-2 py-1 rounded-full text-pink-600">AI sắp lịch</span>
        </div>
        <div id="offDates" class="grid grid-cols-2 md:grid-cols-4 gap-2"></div>
        <div class="mt-3 flex gap-2">
          <button onclick="submitOff()" class="flex-1 text-white font-black py-3 rounded-xl shadow text-sm" style="background:linear-gradient(135deg,#ec4899,#f43f5e)">Gửi đăng ký (AI Auto Approve)</button>
          <button onclick="loadOff()" class="bg-white border border-pink-200 text-pink-700 font-bold px-4 py-3 rounded-xl text-sm">↻</button>
        </div>
      `;
      const offDatesEl=document.getElementById('offDates');
      offDatesEl.innerHTML = dates.map(d=>{
        const dayIdx = new Date(d).getDay();
        const dayName=['CN','T2','T3','T4','T5','T6','T7'][dayIdx];
        return `<label class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-sky-50"><input type="checkbox" value="${d}" class="offCheck rounded"> <span class="text-xs font-bold">${dayName} ${fmtDMY(d)}</span></label>`;
      }).join('');
    }

    // also listen for socket offWindow:update
    if(!window._offWindowSocketBound && typeof socket!=='undefined' && socket){
      window._offWindowSocketBound=true;
      socket.on('offWindow:update', (data)=>{
        window._offVipTest = !!(data && data.vipTest);
        if(!isTraining){
          const open = data.isOpen;
          statusEl.textContent = open? (window._offVipTest?'🟢 AI đang MỞ đăng ký OFF (VIP TEST) - Cập nhật trực tiếp':'🟢 AI đang MỞ đăng ký OFF - Cập nhật trực tiếp') : '🔴 AI đã ĐÓNG - Cập nhật trực tiếp';
          statusEl.className='mt-3 text-xs font-bold rounded-xl px-3 py-2 '+(open?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-100 text-red-700 border border-red-200');
        }
        try{ refreshNavVisibility(); }catch(e){}
      });
    }
  }catch(e){}
  
  // my offs history list
  try{
    document.getElementById('myOffList').innerHTML = myOffs.map(r=>`
      <div class="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
        <div><div class="font-bold text-sm">${r.dates.map(d=>fmtDMY(d)).join(', ')}</div><div class="text-xs text-slate-500">${fmtDMYTime(r.createdAt)} • ${r.autoApproved?'Tự động duyệt':''}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='APPROVED'?'bg-pink-500 text-white':r.status==='PENDING'?'bg-pink-100 text-pink-700':'bg-red-100 text-red-700'}">${getStatusVi(r.status)}</span>
      </div>
    `).join('') || '<div class="text-xs text-slate-400 text-center py-2">Chưa có OFF</div>';
  }catch(e){}
}
async function submitOff(){
  const isTraining = employee && (employee.type==='TRAINING' || employee.status==='TRAINING' || employee.status==='WAITING_TEST');
  const maxAllowed = isTraining ? 5 : 2;
  const checks=[...document.querySelectorAll('.offCheck:checked')].map(c=>c.value);
  if(checks.length===0) return showToast('Chưa chọn ngày','error');
  if(checks.length > maxAllowed){
    return showToast(isTraining ? 'Nhân viên Đào tạo được đăng ký tối đa 5 ngày OFF' : 'Chỉ được đăng ký tối đa 2 ngày OFF tuần sau', 'error');
  }
  try{
    const res = await api('/api/off-requests', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, dates:checks})});
    showToast('OFF đã tự động duyệt: '+(res.dates||checks).map(d=>fmtDMY(d)).join(', '),'success');
    if(isTraining && checks.length >= 5){
      employee.registeredOffDates = checks;
      employee.trainingOffDays = checks;
      localStorage.setItem('emp_data', JSON.stringify(employee));
      try{ refreshNavVisibility(); }catch(e){}
    }
    await loadOff();
    await loadSchedule();
    await loadHome();
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
    const nextMon = getMonday(new Date(getVietnamNow().getTime()+7*24*60*60*1000));
    const nextWeekStr = toVietnamDateStr(nextMon);
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
        <div class="flex justify-between items-start"><span class="font-bold text-sm">${fmtDMY(r.date)} • ${getShiftVi(normalizeShift(r.shift))} • ${getBranchDisplay(r.branchId)}</span><span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='PENDING'?'bg-amber-500 text-white':r.status==='APPROVED'?'bg-emerald-500 text-white':'bg-red-100 text-red-700'}">${getStatusVi(r.status)}</span></div>
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
        <div class="text-xs text-slate-600">Ngày ${fmtDMY(r.date)} • ${getShiftVi(normalizeShift(r.shift))} • ${getBranchDisplay(r.branchId)} • Lý do: ${r.reason}</div>
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
// Đổi ca (Official) - 24h AI tự duyệt
let shiftSwapRequests=[];
async function loadShiftSwap(){
  try{
    // Load all employees cùng chi nhánh để chọn người thay thế
    const branchEmps = await api('/api/employees?branch='+employee.branchId).catch(()=>[]);
    const emps = Array.isArray(branchEmps) ? branchEmps : (branchEmps.data||[]);
    const opts = emps.filter(e=>e.employeeId!==employee.employeeId && e.status==='OFFICIAL').map(e=>`<option value="${e.employeeId}">${e.name} - ${e.employeeId} - ${getShiftVi(normalizeShift(e.shift))}</option>`).join('');
    const sel=document.getElementById('swapTarget');
    if(sel){
      const cur = sel.value;
      sel.innerHTML = `<option value="">-- Không chọn (gửi toàn bộ chi nhánh) --</option>` + opts;
      if(cur) sel.value=cur;
    }
    const fromEl=document.getElementById('swapFromShift');
    if(fromEl) fromEl.value=employee.shift;
    // Load requests
    shiftSwapRequests = await api('/api/shift-swap?employeeId='+employee.employeeId).catch(()=>[]);
    const allRequests = await api('/api/shift-swap?branch='+employee.branchId).catch(()=>[]);
    const mine = shiftSwapRequests;
    document.getElementById('myShiftSwapList').innerHTML = mine.map(r=>{
      const statusColor = r.status==='PENDING_TARGET' ? 'bg-amber-500 text-white' : r.status==='PENDING_BROADCAST' ? 'bg-blue-500 text-white' : r.status==='APPROVED' ? 'bg-emerald-500 text-white' : r.status==='REJECTED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
      const thText = r.targetEmployeeId ? `Gửi tới ${r.targetEmployeeName||r.targetEmployeeId}` : 'Gửi toàn chi nhánh';
      return `<div class="border rounded-xl p-3 ${r.status.includes('PENDING')?'bg-amber-50 border-amber-200':'bg-white'}">
        <div class="flex justify-between items-start"><span class="font-bold text-sm">${fmtDMY(r.date)} • ${getShiftVi(normalizeShift(r.fromShift))} → ${getShiftVi(normalizeShift(r.toShift))}</span><span class="text-[11px] font-black px-2 py-1 rounded-full ${statusColor}">${getStatusVi(r.status)}</span></div>
        <div class="text-xs text-slate-600 mt-1">${thText} • ${getBranchDisplay(r.branchId)}</div>
        <div class="text-xs text-slate-500 mt-1">Lý do: ${r.reason||'—'}</div>
        <div class="text-[11px] text-slate-400 mt-1">Tạo: ${fmtDMYTime(r.createdAt)} • Hết hạn: ${fmtDMYTime(r.expiresAt)}</div>
        ${r.status==='PENDING_TARGET' || r.status==='PENDING_BROADCAST' ? '<div class="text-[11px] text-amber-700 mt-1">AI sẽ tự duyệt sau 24h nếu có người chấp nhận hoặc ngay khi người được mời chấp nhận</div>' : ''}
      </div>`;
    }).join('') || '<div class="text-xs text-slate-400 text-center py-2">Chưa có yêu cầu đổi ca</div>';
    // Invites: where you are target or broadcast and not requester
    const invites = allRequests.filter(r=> r.status==='PENDING_TARGET' && r.targetEmployeeId===employee.employeeId);
    const broadcastInvites = allRequests.filter(r=> r.status==='PENDING_BROADCAST' && r.branchId===employee.branchId && r.requesterId!==employee.employeeId && !r.acceptedBy);
    const allInvites = [...invites, ...broadcastInvites].slice(0,5);
    document.getElementById('shiftSwapInviteList').innerHTML = allInvites.map(r=>{
      const isDirect = r.targetEmployeeId===employee.employeeId;
      return `<div class="border ${isDirect?'border-blue-200 bg-blue-50':'border-emerald-200 bg-emerald-50'} rounded-xl p-3">
        <div class="font-bold text-sm">${r.requesterName} muốn đổi ca <span class="text-[11px] bg-slate-900 text-white px-2 py-0.5 rounded-full">${isDirect?'Gửi riêng bạn':'Toàn chi nhánh'}</span></div>
        <div class="text-xs text-slate-600">Ngày ${fmtDMY(r.date)} • ${getShiftVi(normalizeShift(r.fromShift))} → ${getShiftVi(normalizeShift(r.toShift))} • ${getBranchDisplay(r.branchId)} • Lý do: ${r.reason||'—'}</div>
        <div class="text-[11px] text-slate-500 mt-1">Hết hạn: ${fmtDMYTime(r.expiresAt)}</div>
        <div class="mt-2 flex gap-2"><button onclick="respondShiftSwap('${r.id}','ACCEPT')" class="flex-1 bg-emerald-600 text-white text-xs font-bold py-1.5 rounded-lg">✅ Chấp nhận</button><button onclick="respondShiftSwap('${r.id}','REJECT')" class="flex-1 bg-white border text-xs font-bold py-1.5 rounded-lg">Từ chối</button></div>
      </div>`;
    }).join('') || '<div class="text-xs text-slate-400 text-center py-2">Không có lời mời đổi ca</div>';
  }catch(e){ console.error('loadShiftSwap',e); }
}
let shiftSwapSending=false;
async function submitShiftSwap(){
  if(shiftSwapSending) return showToast('Đang gửi, vui lòng đợi...','info');
  const date=document.getElementById('swapDate')?.value;
  const fromShift=document.getElementById('swapFromShift')?.value || employee.shift;
  const targetId=document.getElementById('swapTarget')?.value || '';
  const reason=document.getElementById('swapReason')?.value.trim()||'';
  if(!date) return showToast('Chọn ngày muốn đổi','error');
  if(!reason) return showToast('Vui lòng nhập lý do (bắt buộc)','error');
  shiftSwapSending=true;
  // Tìm toShift: nếu TH1 thì lấy ca của target, nếu TH2 thì cần chọn ca muốn đổi? Đơn giản: đổi ca hiện tại sang ca khác (chọn trong target's shift)
  // Ở đây ta cho phép chọn ca đích là ca của target hoặc nếu TH2 thì mặc định đổi sang ca khác (ví dụ: nếu đang CA_SANG thì đổi sang CA_CHIEU)
  let toShift = employee.shift;
  if(targetId){
    try{
      const emps=await api('/api/employees');
      const target=emps.find(e=>e.employeeId===targetId);
      if(target) toShift=target.shift;
    }catch(e){}
    if(toShift===fromShift){
      // Nếu trùng thì tự đổi sang ca khác
      toShift = fromShift==='CA_SANG' ? 'CA_CHIEU' : fromShift==='CA_CHIEU' ? 'CA_TOI' : 'CA_SANG';
    }
  } else {
    // TH2: không chọn người, thì mặc định đổi sang ca khác
    toShift = fromShift==='CA_SANG' ? 'CA_CHIEU' : fromShift==='CA_CHIEU' ? 'CA_TOI' : 'CA_SANG';
  }
  try{
    const res=await api('/api/shift-swap', {method:'POST', body:JSON.stringify({requesterId:employee.employeeId, date, fromShift, toShift, targetEmployeeId: targetId||null, reason})});
    showToast(res.message||'Đã gửi yêu cầu đổi ca','success');
    loadShiftSwap();
  }catch(e){ showToast(e.message,'error'); }
  finally{ shiftSwapSending=false; }
}
async function respondShiftSwap(requestId, action){
  try{
    await api('/api/shift-swap/'+requestId+'/respond', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, action})});
    showToast(action==='ACCEPT'?'Đã chấp nhận đổi ca':'Đã từ chối','success');
    loadShiftSwap();
  }catch(e){ showToast(e.message,'error'); }
}

// Device
async function loadDevice(){
  // key info - bảo vệ null access khi element chưa tồn tại trong DOM
  try{
    const keyInfoEl = document.getElementById('deviceKeyInfo');
    if(keyInfoEl) {
      keyInfoEl.innerHTML = `<div>Key: <span class="font-black">${empKey}</span></div><div>Device ID: <span class="font-bold">${deviceId}</span></div><div class="text-[11px] text-slate-500">Employee: ${employee.employeeId} • ${employee.name}</div>`;
    }
    const history = await api('/api/device-requests', {headers:{Authorization:'Bearer '+token}}).catch(()=>[]);
    const mine = Array.isArray(history)? history.filter(r=>r.employeeId===employee.employeeId) : [];
    const historyEl = document.getElementById('deviceHistory');
    if(historyEl) {
      historyEl.innerHTML = mine.map(r=>`
        <div class="flex justify-between items-center bg-slate-50 border rounded-xl px-3 py-2">
          <div><div class="text-xs font-bold">${r.reason}</div><div class="text-[11px] text-slate-500">${fmtDMYTime(r.createdAt)}</div></div>
          <span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='PENDING'?'bg-pink-100 text-pink-700':r.status==='APPROVED'?'bg-pink-500 text-white':r.status==='EXPIRED'?'bg-slate-400 text-white':'bg-red-100 text-red-700'}">${getStatusVi(r.status)}</span>
        </div>
      `).join('') || '<div class="text-xs text-slate-400 text-center py-2">Chưa có yêu cầu</div>';
    }
  }catch(e){ console.error('[loadDevice]', e); }
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
                <span class="text-xs font-bold bg-pink-100 text-pink-700 px-2 py-1 rounded-full">≥${c.minPerQuestion} giây/câu = ${c.totalQuestions*c.minPerQuestion} giây tối thiểu</span>
              </div>
              <button onclick="startTest('${c.id}')" class="w-full mt-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-2.5 rounded-xl">Bắt đầu làm TEST (random 25 câu • 5s/câu)</button>
              ${lastResult?`<div class="mt-3 bg-slate-50 border rounded-xl p-2 text-xs"><div class="font-bold">Kết quả gần nhất: ${lastResult.score}đ • ${lastResult.result} • ${fmtDMYTime(lastResult.createdAt)}</div><div class="text-[11px] text-slate-500">${lastResult.correct}/${lastResult.total} đúng • ${lastResult.timeSpent}s</div></div>`:''}
            </div>
          `).join('')}
        </div>
        <div class="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
          <div class="font-black">Quy tắc kết quả (25 câu • 5s/câu • thang 10đ):</div>
          <div class="mt-1 space-y-1">
            <div class="flex justify-between"><span>Điểm &lt; 5</span><span class="font-bold text-red-600">LOẠI → TB app + logout sau 15p</span></div>
            <div class="flex justify-between"><span>5 – dưới 8</span><span class="font-bold text-amber-600">Chưa ĐẠT → thi lại (HR gửi lịch)</span></div>
            <div class="flex justify-between"><span>Điểm ≥ 8</span><span class="font-bold text-green-600">ĐẠT 🎆 → chờ duyệt Chính thức</span></div>
          </div>
        </div>
      </div>
    `;
  }catch(e){}
}
async function startTest(courseId){
  try{
    showToast('Đang mở đề thi 25 câu...','info');
    const isForce = !!(employee.forceOpenTest || employee.isForceUnlocked || (employee.testSchedule && (employee.testSchedule.force || employee.testSchedule.isForceUnlocked)) || employee.status === 'WAITING_TEST');
    const sess = await api('/api/quiz/open',{method:'POST', body:JSON.stringify({employeeId:employee.employeeId, force: isForce})});
    currentTest = { id: sess.courseId, questions: sess.questions, totalQuestions: sess.total||25, minPerQuestion: sess.perQuestionSec||5, questionIds: sess.questionIds };
    testAnswers = Array(25).fill(null);
    testIndex=0;
    testStartTime=Date.now();
    document.getElementById('testModal').classList.remove('hidden');
    document.getElementById('testMin').textContent='125';
    const info=document.getElementById('testEmpInfo');
    if(info) info.textContent=`${sess.employee.employeeId} • ${sess.employee.name} • ${sess.employee.phone}`;
    renderTestQuestion();
    startTestTimer();
  }catch(e){ showToast(e.message||'Chưa mở được đề thi — liên hệ HR','error'); }
}
function startTestTimer(){
  if(testTimerInterval) clearInterval(testTimerInterval);
  testTimerInterval=setInterval(()=>{
    const elapsed = Math.floor((Date.now()-testStartTime)/1000);
    const m=String(Math.floor(elapsed/60)).padStart(2,'0');
    const s=String(elapsed%60).padStart(2,'0');
    const t=document.getElementById('testTimer');
    if(t) t.textContent=`${m}:${s}`;
  },1000);
  startQTimer();
}
function startQTimer(){
  if(window.testQTimerInterval) clearInterval(window.testQTimerInterval);
  window.testQTimeLeft=5;
  const el=document.getElementById('testQTimer');
  if(el) el.textContent='5';
  window.testQTimerInterval=setInterval(()=>{
    window.testQTimeLeft--;
    const qel=document.getElementById('testQTimer');
    if(qel) qel.textContent=String(Math.max(window.testQTimeLeft,0));
    if(window.testQTimeLeft<=0){
      clearInterval(window.testQTimerInterval);
      if(testIndex < 24){ testIndex++; renderTestQuestion(); startQTimer(); }
      else submitTest(true);
    }
  },1000);
}
function renderTestQuestion(){
  const q=currentTest.questions[testIndex];
  if(!q) return;
  document.getElementById('testProgress').textContent=`${testIndex+1}/25`;
  document.getElementById('testBody').innerHTML=`
    <div class="font-bold text-sm text-slate-800">Câu ${testIndex+1}/25: ${q.question}</div>
    <div class="mt-4 space-y-2">
      ${q.options.map((opt,i)=>`
        <label class="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer ${testAnswers[testIndex]===i?'border-indigo-500 bg-indigo-50':'border-slate-200 hover:bg-slate-50'}">
          <input type="radio" name="q${testIndex}" value="${i}" ${testAnswers[testIndex]===i?'checked':''} onchange="selectAnswer(${i})" class="accent-indigo-600">
          <span class="text-sm font-medium">${String.fromCharCode(65+i)}. ${opt}</span>
        </label>
      `).join('')}
    </div>
    <div class="mt-4 text-[11px] text-slate-500">Mỗi câu 5 giây — hết giờ tự chuyển câu • Tổng 25 câu thang 10đ</div>
  `;
}
function selectAnswer(i){ testAnswers[testIndex]=i; renderTestQuestion(); }
function prevQuestion(){ if(testIndex>0){ testIndex--; renderTestQuestion(); startQTimer(); } }
function nextQuestion(){ if(testIndex < 24){ testIndex++; renderTestQuestion(); startQTimer(); } }
function closeTest(){ document.getElementById('testModal').classList.add('hidden'); if(testTimerInterval) clearInterval(testTimerInterval); if(window.testQTimerInterval) clearInterval(window.testQTimerInterval); }
function showFireworks(){
  try{
    const ov=document.createElement('div');
    ov.id='fireworksOverlay';
    ov.style.cssText='position:fixed;inset:0;z-index:9999;pointer-events:none;background:rgba(0,0,0,.25)';
    ov.innerHTML='<canvas id="fwCanvas" style="width:100%;height:100%"></canvas><div style="position:absolute;top:18%;width:100%;text-align:center;color:#fff;font-weight:900;font-size:22px;text-shadow:0 2px 12px rgba(0,0,0,.5)">🎆 Chúc mừng bạn đã ĐẠT! 🎆</div>';
    document.body.appendChild(ov);
    const cv=document.getElementById('fwCanvas');
    cv.width=window.innerWidth; cv.height=window.innerHeight;
    const ctx=cv.getContext('2d');
    const colors=['#f43f5e','#f59e0b','#10b981','#3b82f6','#a855f7','#facc15'];
    const parts=[];
    for(let i=0;i<160;i++) parts.push({x:Math.random()*cv.width, y:cv.height*0.3+Math.random()*cv.height*0.4, vx:(Math.random()-0.5)*8, vy:(Math.random()-0.5)*8-2, c:colors[i%colors.length], life:60+Math.random()*40});
    let frames=0;
    const iv=setInterval(()=>{
      frames++;
      ctx.clearRect(0,0,cv.width,cv.height);
      parts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life--; ctx.fillStyle=p.c; ctx.fillRect(p.x,p.y,4,4); });
      if(frames>240){ clearInterval(iv); ov.remove(); }
    },33);
  }catch(_){}
}
async function submitTest(auto){
  if(window.testQTimerInterval) clearInterval(window.testQTimerInterval);
  const unanswered = testAnswers.filter(a=>a===null).length;
  if(!auto && unanswered>0 && !confirm(`Còn ${unanswered} câu chưa trả lời (hết 5s tự bỏ qua). Vẫn nộp?`)) { startQTimer(); return; }
  const timeSpent = Math.floor((Date.now()-testStartTime)/1000);
  try{
    const res = await api('/api/courses/'+currentTest.id+'/submit', {method:'POST', body:JSON.stringify({employeeId:employee.employeeId, answers:testAnswers, timeSpent, questionIds:currentTest.questionIds})});
    closeTest();
    const r=res.testResult;
    if(r.result==='DAT'){
      showFireworks();
      showToast(`🎆 Chúc mừng ${employee.name}! ĐẠT ${r.score}đ — hoàn thành tốt, chờ HR duyệt thành Nhân viên chính thức Ụm Bò Milk`,'success');
      alert(`🎆 CHÚC MỪNG! Bạn đạt ${r.score}đ (≥ 8đ) — ĐẠT!\nĐúng ${r.correct}/25 câu.\nBạn đã hoàn thành tốt, chờ HR duyệt trở thành Nhân viên chính thức Ụm Bò Milk.`);
    } else if(r.result==='CHUA_DU_DK'){
      showToast(`Bạn đạt ${r.score}đ (5–dưới 8đ) — Chưa ĐẠT. Thông báo thi lại lần sau, HR sẽ gửi lịch thi lại.`,'error');
      alert(`Bạn đạt ${r.score}đ — Chưa ĐẠT.\nĐúng ${r.correct}/25 câu.\nThông báo thi lại lần sau, HR sẽ gửi lịch thi lại cho bạn.`);
    } else {
      showToast(`Bạn đạt ${r.score}đ (< 5đ) — LOẠI. Hệ thống đã gửi thông báo và sẽ tự động đăng xuất sau 15 phút.`,'error');
      alert(`Bạn đạt ${r.score}đ — LOẠI.\nĐúng ${r.correct}/25 câu.\nHệ thống đã gửi thông báo đến app của bạn, sau 15 phút tài khoản sẽ tự động đăng xuất.`);
    }
    employee = res.employee;
    localStorage.setItem('emp_data', JSON.stringify(employee));
    loadElearning(); loadHome();
  }catch(e){ alert(e.message); startQTimer(); }
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
        <div class="text-sm text-slate-600 mt-0.5">${employee.phone} • ${getBranchDisplay(employee.branchId)} • ${getShiftVi(normalizeShift(employee.shift))}</div>
        <div class="mt-1.5 inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm">
          <i class="fa-solid fa-circle-check text-[10px]"></i>${getStatusVi(employee.type)} • ${getStatusVi(employee.status)}
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm mt-4">
      <div class="bg-pink-50 border border-pink-100 rounded-xl p-3"><div class="text-[11px] font-bold text-pink-500 uppercase tracking-wide">Chi nhánh</div><div class="font-bold text-slate-800 mt-0.5 text-xs">${getBranchFull(employee.branchId)}</div></div>
      <div class="bg-pink-50 border border-pink-100 rounded-xl p-3"><div class="text-[11px] font-bold text-pink-500 uppercase tracking-wide">Ca làm</div><div class="font-bold text-slate-800 mt-0.5">${getShiftVi(normalizeShift(employee.shift))}</div></div>
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
        <span class="text-[11px] font-black px-2 py-1 rounded-full ${r.status==='PENDING'?'bg-amber-100 text-amber-700':r.status==='APPROVED'?'bg-green-100 text-green-700':r.status==='EXPIRED'?'bg-slate-200 text-slate-500':'bg-red-100 text-red-700'}">${getStatusVi(r.status)}</span>
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
          <td class="py-3 px-3 text-center font-semibold text-slate-500">${hourlyRate.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}đ/h</td>
          <td class="py-3 px-3 text-right font-black text-emerald-600">${shiftSalary.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}đ</td>
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

        <!-- Summary Stat Cards - Responsive -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-white border border-emerald-100 rounded-2xl p-4 shadow-sm text-center">
            <div class="text-[10px] font-black text-emerald-500 uppercase tracking-wide">Tổng thu nhập</div>
            <div class="font-black text-lg sm:text-base text-emerald-700 mt-1">${totalSalary.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}đ</div>
            <div class="text-[10px] text-emerald-600 mt-1">AI tính tự động theo ca</div>
          </div>
          <div class="bg-white border border-blue-100 rounded-2xl p-4 shadow-sm text-center">
            <div class="text-[10px] font-black text-blue-500 uppercase tracking-wide">Số ca làm</div>
            <div class="font-black text-lg sm:text-base text-blue-700 mt-1">${totalShifts} Ca</div>
            <div class="text-[10px] text-blue-600 mt-1">Đã điểm danh</div>
          </div>
          <div class="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm text-center">
            <div class="text-[10px] font-black text-purple-500 uppercase tracking-wide">Tổng số giờ</div>
            <div class="font-black text-lg sm:text-base text-purple-700 mt-1">${totalHours} Giờ</div>
            <div class="text-[10px] text-purple-600 mt-1">Tích lũy</div>
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
                <div class="mt-3 text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2"><i class="fa-solid fa-circle-info text-amber-600"></i> Mức Lương này chỉ được chi trả khi nhân viên training làm đủ 7 ngày thử việc</div>
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
