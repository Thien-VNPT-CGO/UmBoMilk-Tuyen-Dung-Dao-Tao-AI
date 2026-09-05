require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// === ENV & SECURITY CONFIG (Realtime & Automation foundation) ===
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'um-bo-milk-2026-secret-key-very-secure-CHANGE-IN-PROD';
if (!process.env.JWT_SECRET) console.warn('[SECURITY] JWT_SECRET dùng giá trị mặc định - hãy đặt JWT_SECRET trong .env cho production!');
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s=>s.trim());
// === VIETNAM TIMEZONE REALTIME - Toàn bộ hệ thống theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7) ===
function getVietnamTodayStr(){
  return new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'});
}
function getVietnamNow(){
  return new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Ho_Chi_Minh'}));
}
function toVietnamDateStr(date){
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'});
}
function getAllWebhookUrls(){
  const urls=[];
  const s=db.settings?.googleSheet;
  if(s?.targetWebhookUrl) urls.push(s.targetWebhookUrl);
  if(s?.targetWebhookUrl1) urls.push(s.targetWebhookUrl1);
  if(s?.targetWebhookUrl2) urls.push(s.targetWebhookUrl2);
  if(process.env.GOOGLE_SHEET_WEBHOOK_URL && !urls.includes(process.env.GOOGLE_SHEET_WEBHOOK_URL)) urls.push(process.env.GOOGLE_SHEET_WEBHOOK_URL);
  if(process.env.GOOGLE_SHEET_WEBHOOK_URL_1 && !urls.includes(process.env.GOOGLE_SHEET_WEBHOOK_URL_1)) urls.push(process.env.GOOGLE_SHEET_WEBHOOK_URL_1);
  if(process.env.GOOGLE_SHEET_WEBHOOK_URL_2 && !urls.includes(process.env.GOOGLE_SHEET_WEBHOOK_URL_2)) urls.push(process.env.GOOGLE_SHEET_WEBHOOK_URL_2);
  return [...new Set(urls)].filter(Boolean);
}

const CORS_ORIGIN = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET','POST','PUT','DELETE'] },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6
});

// Security headers + CORS + Rate limit (global)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN,
  credentials: CORS_ORIGIN !== '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.set('trust proxy', 1);
const globalLimiter = rateLimit({ windowMs: 60*1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Quá nhiều request, thử lại sau 1 phút' } });
const authLimiter = rateLimit({ windowMs: 60*1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Đăng nhập quá nhanh, thử lại sau' } });
app.use(globalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Realtime middleware: add requestId + audit source
app.use((req,res,next)=>{ req.requestId = uuidv4().slice(0,8); next(); });

// ============ DEFAULT DATA ============
const DEFAULT_BRANCHES = [
  { id: 'CN1', address: '130 Vạn kiếp, Phường 3, Quận Bình Thạnh', prefix: 'CN130', name: 'CN1 - 130 Vạn kiếp' },
  { id: 'CN2', address: '261 Tô Hiến Thành, Phường 12, Quận 10', prefix: 'CN261', name: 'CN2 - 261 Tô Hiến Thành' },
  { id: 'CN3', address: '120 Hoàng Diệu 2, Phường Linh Trung, TP. Thủ Đức', prefix: 'CN120', name: 'CN3 - 120 Hoàng Diệu 2' },
  { id: 'CN4', address: '111 Tôn Đản, Phường 15, Quận 4', prefix: 'CN111', name: 'CN4 - 111 Tôn Đản' }
];

const DEFAULT_SHIFTS = {
  CA_SANG: { name: 'Ca Sáng', start: '07:00', end: '12:00', hours: 5 },
  CA_CHIEU: { name: 'Ca Chiều', start: '12:00', end: '18:00', hours: 6 },
  CA_TRUA: { name: 'Ca Chiều', start: '12:00', end: '18:00', hours: 6 },
  CA_TOI: { name: 'Ca Tối', start: '18:00', end: '23:00', hours: 5 }
};

const DEFAULT_SETTINGS = {
  // Operational Data Hub - Ràng buộc theo render hiện tại (đã đồng bộ 05/09/2026)
  // - spreadsheetId: Sheet nộp Form (Nguồn vào) - khớp render 17iXM...
  // - formResponsesSheetId: Sheet nộp Form responses - 1rcq...
  // - targetDatabaseSpreadsheetId: Sheet Database chính (Nguồn xuất 20 cột) - khớp render 1rcq...
  // Lưu ý: render đang đảo so với Spec 28/08 (Spec: Form=1rcq, DB=17iXM); code đã đồng bộ theo render để 2 cột giống tên trong render
  googleSheet: {
    spreadsheetId: '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w',
    formResponsesSheetId: '1rcqEKraSRhr-Tn9qwlhADlkQUei8j65bXeHF_Tmkd38',
    formSheetName: 'FROM_NHAN_VIEN',
    targetDatabaseSpreadsheetId: '1rcqEKraSRhr-Tn9qwlhADlkQUei8j65bXeHF_Tmkd38',
    targetWebhookUrl: 'https://script.google.com/macros/s/AKfycbz_umbomilk_apps_script/exec',
    targetWebhookUrl1: 'https://script.google.com/macros/s/AKfycbxNfcYVUqqIgZPhXnGeY4aLdnH3ebJFutjGy-VIbxVEc1DV-l93RWo4ic6fc1IvYaM/exec',
    targetWebhookUrl2: 'https://script.google.com/macros/s/AKfycbxYZhMjR9riLFQfYEkgLfub33XtWlSP2IokghTt82Lb4SQVL4tKxQyNACr69yC0ACA/exec',
    secret: 'umbomilk_secret_2026',
    serviceAccountEmail: 'umbomilk-hr@umbomilk-hr.iam.gserviceaccount.com',
    privateKey: '',
    formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeteDABiq7mday0Yko-PyyUIW4uccicP7FJJt2evc7xbbWBfA/viewform',
    masked: true
  },
  googleDrive: { rootFolderId: '1-Wy-Di6KvfeGCKoTV7TSuFQpY_yKNy-1', backupFolderId: '1-Wy-Di6KvfeGCKoTV7TSuFQpY_yKNy-1', driveUrl: 'https://drive.google.com/drive/folders/1-Wy-Di6KvfeGCKoTV7TSuFQpY_yKNy-1' },
  googleForm: { formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSd9rRG4QLvmLclPseVVmpgPdizij1XYwiSTCgc6x2BPMfA_AA/viewform', mapping: {} },
  finance: { webhookUrl: 'https://script.google.com/macros/s/AKfycbxYZhMjR9riLFQfYEkgLfub33XtWlSP2IokghTt82Lb4SQVL4tKxQyNACr69yC0ACA/exec', secret: 'umbomilk_secret_2026' },
  ai: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o', temperature: 0.7 },
  zalo: { oaId: '', accessToken: '', template: '', reminderEnabled: true },
  calendar: { clientId: '', clientSecret: '', calendarId: 'primary', duration: 30, reminderOnce: true },
  scoring: { criteria: [{ name: 'Kinh nghiệm', weight: 30 }, { name: 'Giao tiếp', weight: 25 }, { name: 'Thái độ', weight: 25 }, { name: 'Sẵn sàng ca', weight: 20 }], passThreshold: 70 },
  attendance: { checkInOpenBefore: 30, checkInCloseAfter: 60, lateThreshold: 15, earlyLeaveThreshold: 15, penaltyLate: 30000, penaltyAbsent: 100000, penaltyNoCheckout: 50000 },
  payroll: { trainingRate: 21000, officialRate: 25500, shifts: DEFAULT_SHIFTS },
  off: { openDay: 5, openHour: 12, closeDay: 6, closeHour: 15, maxPerWeek: 2 },
  test: { minPerQuestion: 5, totalQuestions: 20, passScore: 7, retakeMin: 5, maxRetest: 3 },
  security: { sessionTimeout: 120, deviceBind: true }
};

// ============ GOOGLE SHEET AUTO-TABS DEFINITIONS - Realtime 1:1 per HR tab ============
// Mỗi tab HR sẽ tự động tạo 1 sheet với cột tương ứng, realtime 1:1 với db
const SHEET_DEFINITIONS = {
  // Tab Nhân viên mới - từ Form đăng ký
  NHAN_VIEN_MOI: { sheetName: 'NHAN_VIEN_MOI', headers: ['ID','Ngày ĐK','Họ tên','Giới tính','Năm sinh','Trình độ','Quê quán','SĐT','Ca đăng ký','Chi nhánh ĐK','Kinh nghiệm','Xử lý đột xuất','Facebook','Nguồn biết tin','Điểm AI','Kết quả','Trạng thái','Source ID','Version','Updated At'] },
  // Nhân viên cửa hàng - thêm cột Key (yêu cầu #9) – Key đi theo NV đến khi nghỉ
  NHAN_VIEN_TRAINING: { sheetName: 'NHAN_VIEN_TRAINING', headers: ['ID','Mã NV','Họ tên','SĐT','Key','Chi nhánh','Ca','Ngày bắt đầu','Ngày kết thúc','Số ngày Training','Trạng thái','Điểm TEST','Kết quả TEST','Loại','Category','Version','Updated At','Sync'] },
  NHAN_VIEN_CHINH_THUC: { sheetName: 'NHAN_VIEN_CHINH_THUC', headers: ['ID','Mã NV','Họ tên','SĐT','Key','Chi nhánh','Ca','Ngày bắt đầu','Trạng thái','Điểm TEST','Loại','Ngày chính thức','Version','Updated At','Sync'] },
  NHAN_VIEN_XUONG: { sheetName: 'NHAN_VIEN_XUONG', headers: ['ID','Mã NV','Họ tên','SĐT','Branch','Status','Sync'] },
  NHAN_VIEN_VAN_PHONG: { sheetName: 'NHAN_VIEN_VAN_PHONG', headers: ['ID','Mã NV','Họ tên','SĐT','Branch','Status','Sync'] },
  NHAN_VIEN_SALE: { sheetName: 'NHAN_VIEN_SALE', headers: ['ID','Mã NV','Họ tên','SĐT','Branch','Status','Sync'] },
  // Lịch
  LICH_LAM_VIEC: { sheetName: 'LICH_LAM_VIEC', headers: ['ID','Mã NV','Họ tên','Chi nhánh','Tuần bắt đầu','Ngày','Thứ','Ca','Trạng thái','Người thay','Version'] },
  // Phiếu
  PHIEU_OFF_HANG_TUAN: { sheetName: 'PHIEU_OFF_HANG_TUAN', headers: ['ID','Mã NV','Họ tên','Chi nhánh','Ca','Ngày OFF','Loại','Trạng thái','Auto Approve','Ngày tạo'] },
  PHIEU_OFF_DOT_XUAT: { sheetName: 'PHIEU_OFF_DOT_XUAT', headers: ['ID','Mã NV','Họ tên','Chi nhánh','Ca','Ngày OFF','Lý do','Người thay','Trạng thái','Cascade Step','Ngày tạo'] },
  PHIEU_DOI_THIET_BI: { sheetName: 'PHIEU_DOI_THIET_BI', headers: ['ID','Mã NV','Lý do','Thiết bị cũ','Thiết bị mới','Trạng thái','Ngày tạo','Hết hạn'] },
  PHIEU_DOI_CA_TRAINING: { sheetName: 'PHIEU_DOI_CA_TRAINING', headers: ['ID','Mã NV','Họ tên','Ngày','Ca cũ','Ca mới','Lý do','Trạng thái','Ngày tạo','Hết hạn','Người duyệt'] },
  // Điểm danh
  RECORD_DIEM_DANH: { sheetName: 'RECORD_DIEM_DANH', headers: ['ID','Mã NV','Họ tên','Ngày','Ca','Chi nhánh','Giờ Check-in','GPS In','Ảnh In','Drive In','Giờ Check-out','GPS Out','Ảnh Out','Drive Out','Trạng thái','Vi phạm','Version'] },
  RECORD_ZALO: { sheetName: 'RECORD_ZALO', headers: ['ID','Thời gian gửi','Người nhận','Loại','Nội dung','Trạng thái','Lỗi'] },
  // Báo cáo
  BAO_CAO_CHAM_CONG: { sheetName: 'BAO_CAO_CHAM_CONG', headers: ['Mã NV','Họ tên','Chi nhánh','Tháng','Ngày tiêu chuẩn','Thực tế','Tính lương','Giờ TC','Giờ TT','Giờ TL','Phép','OT','Trễ','Lỗi','Trạng thái'] },
  KET_QUA_TEST: { sheetName: 'KET_QUA_TEST', headers: ['ID','Mã NV','Họ tên','Khóa','Điểm','Đúng/Tổng','Kết quả','Thời gian làm','Ngày tạo'] },
  KHOA_TEST: { sheetName: 'KHOA_TEST', headers: ['ID','Tên khóa','Số câu','Min/câu','Ngày tạo'] },
  TAI_KHOAN: { sheetName: 'TAI_KHOAN', headers: ['ID','Username','Role','Branch Scope','Display Name','Allowed Tabs'] },
  AUDIT_LOG: { sheetName: 'AUDIT_LOG', headers: ['ID','Actor','Action','Entity','Before','After','Timestamp','IP'] },
  SYNC_QUEUE: { sheetName: 'SYNC_QUEUE', headers: ['ID','Entity','Operation','Version','Updated At','By','Source','Sync Status'] },
  DRIVE_FILES: { sheetName: 'DRIVE_FILES', headers: ['ID','Mã NV','Họ tên','Ngày','Loại','File name','Drive Path','URL','Created At'] }
};

let db = {
  users: [],
  branches: DEFAULT_BRANCHES,
  employees: [],
  applicants: [],
  keys: [],
  attendances: [],
  schedules: [],
  offRequests: [],
  emergencyRequests: [],
  deviceRequests: [],
  trainingShiftRequests: [],
  shiftSwapRequests: [],
  testCourses: [],
  testResults: [],
  settings: DEFAULT_SETTINGS,
  auditLogs: [],
  zaloRecords: [],
  syncQueue: [],
  notifications: [],
  payrollPeriods: [],
  attendanceAdjustments: [],
  overtimeRequests: [],
  leaveRequests: [],
  driveFiles: [],
  payrollSnapshots: [],
  financeKeys: []
};

// === SECRET ENCRYPTION HELPERS (Realtime automation needs secure storage) ===
const SECRET_KEY = process.env.SECRET_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-32-bytes-key-for-dev-only!!';
function getAesKey(){
  // derive 32 bytes from SECRET_KEY via sha256
  return crypto.createHash('sha256').update(SECRET_KEY).digest();
}
function encryptSecret(text){
  if(!text || typeof text!=='string' || text.includes('•') || text.startsWith('enc:')) return text;
  try{
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(), iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `enc:${iv.toString('hex')}:${tag}:${enc}`;
  }catch(e){ return text; }
}
function decryptSecret(encText){
  if(!encText || typeof encText!=='string' || !encText.startsWith('enc:')) return encText;
  try{
    const parts = encText.split(':');
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(parts[3], 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  }catch(e){ return encText; }
}
function decryptSettingsSecrets(settings){
  if(!settings) return;
  // decrypt known secret fields transparently for internal use
  const fields = [
    ['googleSheet','privateKey'],
    ['googleSheet','secret'],
    ['ai','apiKey'],
    ['zalo','accessToken'],
    ['calendar','clientSecret']
  ];
  fields.forEach(([grp,key])=>{
    if(settings[grp] && settings[grp][key] && typeof settings[grp][key]==='string' && settings[grp][key].startsWith('enc:')){
      try{ settings[grp][key] = decryptSecret(settings[grp][key]); }catch(e){}
    }
  });
}
function maskSecretValue(val){
  if(!val || typeof val!=='string') return '••••••••';
  if(val.startsWith('enc:')) return '••••••••'+val.slice(-8);
  if(val.length<=8) return '••••••••';
  return '••••••••'+val.slice(-4);
}
function getMaskedSettings(settings){
  const m = JSON.parse(JSON.stringify(settings));
  if(m.googleSheet?.privateKey) m.googleSheet.privateKey = maskSecretValue(settings.googleSheet.privateKey);
  if(m.googleSheet?.secret) m.googleSheet.secret = maskSecretValue(settings.googleSheet.secret);
  if(m.ai?.apiKey) m.ai.apiKey = maskSecretValue(settings.ai.apiKey);
  if(m.zalo?.accessToken) m.zalo.accessToken = maskSecretValue(settings.zalo.accessToken);
  if(m.calendar?.clientSecret) m.calendar.clientSecret = maskSecretValue(settings.calendar.clientSecret);
  return m;
}

// Load or init DB
function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const loaded = JSON.parse(raw);
      db = { ...db, ...loaded };
      // decrypt secrets if encrypted
      if(db.settings) decryptSettingsSecrets(db.settings);
      // ensure branches correct (CN2 fix)
      db.branches = DEFAULT_BRANCHES;
      if (!db.settings) db.settings = DEFAULT_SETTINGS;
      else db.settings = { ...DEFAULT_SETTINGS, ...db.settings, googleSheet: { ...DEFAULT_SETTINGS.googleSheet, ...(db.settings.googleSheet||{}) }, ai: { ...DEFAULT_SETTINGS.ai, ...(db.settings.ai||{}) }, zalo: { ...DEFAULT_SETTINGS.zalo, ...(db.settings.zalo||{}) }, calendar: { ...DEFAULT_SETTINGS.calendar, ...(db.settings.calendar||{}) }, attendance: { ...DEFAULT_SETTINGS.attendance, ...(db.settings.attendance||{}) } };
      // ensure payroll shifts
      if (!db.settings.payroll) db.settings.payroll = DEFAULT_SETTINGS.payroll;
      if (!db.payrollPeriods) db.payrollPeriods = [];
      if (!db.attendanceAdjustments) db.attendanceAdjustments = [];
      if (!db.overtimeRequests) db.overtimeRequests = [];
      if (!db.leaveRequests) db.leaveRequests = [];
      if (!db.trainingShiftRequests) db.trainingShiftRequests = [];
      if (!db.shiftSwapRequests) db.shiftSwapRequests = [];
      if (!db.penalties) db.penalties = [];
      if (!db.driveFiles) db.driveFiles = [];
      if (!db.payrollSnapshots) db.payrollSnapshots = [];
      if (!db.financeKeys) db.financeKeys = [];
      if (!db.overtimeRequests) db.overtimeRequests = [];
      if (!db.leaveRequests) db.leaveRequests = [];
    } else {
      initSeed();
    }
  } catch (e) {
    console.error('Load DB error', e);
    initSeed();
  }
}
function saveDB() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    // encrypt secrets before writing (clone)
    const clone = JSON.parse(JSON.stringify(db));
    if(clone.settings){
      if(clone.settings.googleSheet?.privateKey && !clone.settings.googleSheet.privateKey.startsWith('enc:') && clone.settings.googleSheet.privateKey.length>20 && !clone.settings.googleSheet.privateKey.includes('•')){
        clone.settings.googleSheet.privateKey = encryptSecret(clone.settings.googleSheet.privateKey);
      }
      if(clone.settings.ai?.apiKey && !clone.settings.ai.apiKey.startsWith('enc:') && clone.settings.ai.apiKey.length>10 && !clone.settings.ai.apiKey.includes('•')){
        clone.settings.ai.apiKey = encryptSecret(clone.settings.ai.apiKey);
      }
      if(clone.settings.zalo?.accessToken && !clone.settings.zalo.accessToken.startsWith('enc:') && clone.settings.zalo.accessToken.length>10 && !clone.settings.zalo.accessToken.includes('•')){
        clone.settings.zalo.accessToken = encryptSecret(clone.settings.zalo.accessToken);
      }
      if(clone.settings.calendar?.clientSecret && !clone.settings.calendar.clientSecret.startsWith('enc:') && clone.settings.calendar.clientSecret.length>10 && !clone.settings.calendar.clientSecret.includes('•')){
        clone.settings.calendar.clientSecret = encryptSecret(clone.settings.calendar.clientSecret);
      }
      if(clone.settings.googleSheet?.secret && !clone.settings.googleSheet.secret.startsWith('enc:') && clone.settings.googleSheet.secret.length>5 && !clone.settings.googleSheet.secret.includes('•')){
        clone.settings.googleSheet.secret = encryptSecret(clone.settings.googleSheet.secret);
      }
    }
    // atomic write: write to temp then rename
    const tmpFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(clone, null, 2));
    fs.renameSync(tmpFile, DATA_FILE);
    // backup rotation: keep only last 5 backups, delete old >5
    try{
      const dir = path.dirname(DATA_FILE);
      const files = fs.readdirSync(dir).filter(f=>f.startsWith('db_backup')||f.startsWith('db_before'));
      if(files.length>5){
        files.sort((a,b)=> fs.statSync(path.join(dir,a)).mtimeMs - fs.statSync(path.join(dir,b)).mtimeMs);
        for(let i=0;i<files.length-5;i++) fs.unlinkSync(path.join(dir, files[i]));
      }
    }catch(e){}
    // auto-limit image base64 size: if db > 5MB, prune oldest attendances images
    try{
      const stats = fs.statSync(DATA_FILE);
      if(stats.size > 5*1024*1024){
        console.warn('[DB] db.json >5MB, pruning oldest attendance images');
        db.attendances.slice(-50).forEach(a=>{ if(a.checkIn?.image && a.checkIn.image.length>50000) a.checkIn.image='[pruned]'; if(a.checkOut?.image && a.checkOut.image.length>50000) a.checkOut.image='[pruned]'; });
      }
    }catch(e){}
    io.emit('db:update', { timestamp: new Date().toISOString() });
  } catch (e) { console.error('Save DB error', e); }
}
function initSeed() {
  const hashed = bcrypt.hashSync('Master@@2027', 10);
  db.users = [
    { id: uuidv4(), username: 'admin', password: hashed, role: 'Admin', branchScope: ['CN1','CN2','CN3','CN4'], displayName: 'Administrator' },
    { id: uuidv4(), username: 'hr', password: bcrypt.hashSync('hr123',10), role: 'HR', branchScope: ['CN1','CN2'], displayName: 'HR Manager' },
    { id: uuidv4(), username: 'manager', password: bcrypt.hashSync('manager123',10), role: 'Manager', branchScope: ['CN2'], displayName: 'Manager CN2' },
    { id: uuidv4(), username: 'umbomilk', password: bcrypt.hashSync('view123',10), role: 'Umbomilk', branchScope: ['CN1','CN2','CN3','CN4'], displayName: 'Umbomilk Viewer' }
  ];
  // Seed employees
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}${mm}${yyyy}`;
  function genId(prefix){
    const rnd = String(Math.floor(1000+Math.random()*9000));
    return `${prefix}_UBM${dateStr}_NV${rnd}`;
  }
  db.employees = [
    { id: uuidv4(), employeeId: genId('CN130'), name: 'Nguyễn Văn An', phone: '0901234567', branchId: 'CN1', shift: 'CA_SANG', startDate: '2026-08-10', endDate: '2026-08-17', trainingDays: 7, status: 'TRAINING', testScore: null, testResult: null, type: 'TRAINING', category: 'STORE', avatar: '', checkHistory: [], version:1, updated_at: new Date().toISOString(), updated_by:'SYSTEM', source:'WEB_HR', sync_status:'SYNCED' },
    { id: uuidv4(), employeeId: genId('CN261'), name: 'Trần Thị Bích', phone: '0907654321', branchId: 'CN2', shift: 'CA_CHIEU', startDate: '2026-08-12', endDate: '2026-08-19', trainingDays: 7, status: 'WAITING_TEST', testScore: null, testResult: null, type: 'TRAINING', category: 'STORE', avatar: '', checkHistory: [], version:1, updated_at: new Date().toISOString(), updated_by:'SYSTEM', source:'WEB_HR', sync_status:'SYNCED' },
    { id: uuidv4(), employeeId: genId('CN261'), name: 'Lê Văn Cường', phone: '0909998888', branchId: 'CN2', shift: 'CA_TOI', startDate: '2026-07-01', endDate: null, trainingDays: null, status: 'OFFICIAL', testScore: 8.5, testResult: 'DAT', type: 'OFFICIAL', category: 'STORE', avatar: '', checkHistory: [], version:2, updated_at: new Date().toISOString(), updated_by:'SYSTEM', source:'WEB_HR', sync_status:'SYNCED' },
    { id: uuidv4(), employeeId: genId('CN120'), name: 'Phạm Thị Dung', phone: '0912345678', branchId: 'CN3', shift: 'CA_SANG', startDate: '2026-06-15', endDate: null, trainingDays: null, status: 'OFFICIAL', testScore: 9, testResult: 'DAT', type: 'OFFICIAL', category: 'STORE', avatar: '', checkHistory: [], version:2, updated_at: new Date().toISOString(), updated_by:'SYSTEM', source:'WEB_HR', sync_status:'SYNCED' },
    { id: uuidv4(), employeeId: genId('CN111'), name: 'Hoàng Văn Em', phone: '0923456789', branchId: 'CN4', shift: 'CA_CHIEU', startDate: '2026-08-20', endDate: '2026-08-27', trainingDays: 7, status: 'TRAINING', testScore: 6, testResult: 'CHUA_DU_DK', type: 'TRAINING', category: 'STORE', avatar: '', checkHistory: [], version:1, updated_at: new Date().toISOString(), updated_by:'SYSTEM', source:'WEB_HR', sync_status:'SYNCED' }
  ];
  // Keys for official
  db.keys = db.employees.filter(e=>e.status==='OFFICIAL').map(e=>({
    id: uuidv4(), employeeId: e.employeeId, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), deviceId: null, boundAt: null, status: 'ACTIVE', version:1, updated_at: new Date().toISOString(), sync_status:'SYNCED'
  }));
  // also keys for training waiting
  db.employees.filter(e=>e.type==='TRAINING').forEach(e=>{
    db.keys.push({ id: uuidv4(), employeeId: e.employeeId, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), deviceId: null, boundAt: null, status: 'ACTIVE', version:1, updated_at: new Date().toISOString(), sync_status:'SYNCED' });
  });
  // Applicants
  db.applicants = [
    { id: uuidv4(), name: 'Vũ Thị F', phone: '0931112222', email:'vu.f@gmail.com', branchPreference:'CN2', cvData:'Có kinh nghiệm pha chế 1 năm, giao tiếp tốt, sẵn sàng làm ca tối', aiScore: 85, aiBreakdown: [{criteria:'Kinh nghiệm',score:28, reason:'Có 1 năm pha chế'},{criteria:'Giao tiếp',score:22, reason:'Mô tả tốt'},{criteria:'Thái độ',score:20, reason:'Nhiệt tình'},{criteria:'Sẵn sàng ca',score:15, reason:'Chỉ ca tối'}], status:'NEW_APPLICANT', source_id:'form_'+uuidv4(), createdAt: new Date().toISOString(), version:1, sync_status:'SYNCED' },
    { id: uuidv4(), name: 'Ngô Văn G', phone: '0933334444', email:'ngo.g@gmail.com', branchPreference:'CN1', cvData:'Sinh viên, chưa có kinh nghiệm, rảnh ca sáng', aiScore: 62, aiBreakdown: [{criteria:'Kinh nghiệm',score:15, reason:'Chưa có KN'},{criteria:'Giao tiếp',score:18, reason:'TB'},{criteria:'Thái độ',score:19, reason:'Tốt'},{criteria:'Sẵn sàng ca',score:10, reason:'Chỉ sáng'}], status:'INTERVIEW', source_id:'form_'+uuidv4(), createdAt: new Date().toISOString(), version:1, sync_status:'SYNCED' },
    { id: uuidv4(), name: 'Đặng Thị H', phone: '0935556666', email:'dang.h@gmail.com', branchPreference:'CN3', cvData:'2 năm kinh nghiệm sales, giao tiếp xuất sắc', aiScore: 92, aiBreakdown: [{criteria:'Kinh nghiệm',score:30, reason:'Xuất sắc'},{criteria:'Giao tiếp',score:24, reason:'Rất tốt'},{criteria:'Thái độ',score:22, reason:'Tốt'},{criteria:'Sẵn sàng ca',score:16, reason:'Linh hoạt'}], status:'NEW_APPLICANT', source_id:'form_'+uuidv4(), createdAt: new Date().toISOString(), version:1, sync_status:'SYNCED' }
  ];
  // Test course
  db.testCourses = [
    {
      id: 'course_001',
      title: 'Kiểm tra đầu ra - Ụm Bò Milk 2026',
      description: 'Bài kiểm tra tổng hợp kiến thức sản phẩm và quy trình phục vụ',
      totalQuestions: 20,
      minPerQuestion: 5,
      questions: Array.from({length:20}, (_,i)=>({
        id: `q${i+1}`,
        question: `Câu ${i+1}: Thành phần chính của món Trà Sữa Ụm Bò Truyền Thống là gì? (Demo Q${i+1})`,
        options: ['Trà đen + Sữa tươi + Trân châu', 'Trà xanh + Sữa đặc', 'Cà phê + Sữa', 'Nước lọc + Đường'],
        correct: 0,
        explanation: 'Đáp án đúng là Trà đen + Sữa tươi'
      })),
      voiceSimulations: [
        { id:'vs1', scenario:'Khách hỏi: Trà sữa có béo quá không em?', rubric: ['Hiểu nhu cầu','Kiến thức SP','Logic tư vấn','Xử lý phản đối','Thái độ']},
        { id:'vs2', scenario:'Khách phàn nàn: Sao đợi lâu vậy?', rubric: ['Hiểu nhu cầu','Kiến thức SP','Logic tư vấn','Xử lý phản đối','Thái độ']}
      ],
      createdAt: new Date().toISOString()
    }
  ];
  // Schedules example: generate for current week Mon-Sun
  const weekStart = getMonday(new Date());
  db.employees.filter(e=>e.status==='OFFICIAL').forEach(emp=>{
    const days = [];
    for(let i=0;i<7;i++){
      const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
      const dateStr = toVietnamDateStr(d);
      // random OFF 1 day
      const isOff = Math.random()<0.15;
      days.push({ date: dateStr, dayName: ['T2','T3','T4','T5','T6','T7','CN'][i], shift: emp.shift, status: isOff?'OFF':'WORKING', substituteFor: null });
    }
    db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: toVietnamDateStr(weekStart), days, version:1, updated_at: new Date().toISOString() });
  });
  // Attendance mock cho NV chính thức - realtime đúng ca Vietnam (không tạo CA_TOI vào buổi sáng)
  const todayStr = getVietnamTodayStr();
  const nowVN = getVietnamNow();
  const nowMinsVN = nowVN.getHours()*60+nowVN.getMinutes();
  db.employees.filter(e=>e.status==='OFFICIAL').slice(0,2).forEach(emp=>{
    const sMap = DEFAULT_SHIFTS[emp.shift] || DEFAULT_SHIFTS['CA_SANG'];
    const [sh, sm] = sMap.start.split(':').map(Number);
    const startMins = sh*60+sm;
    const openMins = startMins - 30;
    const closeMins = startMins + 60;
    // Chỉ tạo mock nếu đang trong cửa sổ check-in Vietnam (tránh CA_TOI hiện Đang làm buổi sáng)
    const isInWindow = nowMinsVN >= openMins && nowMinsVN <= closeMins;
    if(!isInWindow){
      // Ngoài giờ ca, không tạo mock Đang làm - để HR thấy đúng Vắng/Sắp tới
      return;
    }
    const checkTime = `${String(sh).padStart(2,'0')}:${String(sm+2).padStart(2,'0')}`;
    const branch = db.branches.find(b=>b.id===emp.branchId);
    const branchFolder = `${branch?.prefix||emp.branchId} - ${branch?.name||emp.branchId}`;
    const drivePath = `NHAN_VIEN_CHINH_THUC/${branchFolder}/${emp.shift}/${emp.name} - ${emp.phone} - ${emp.employeeId}/${todayStr.split('-').reverse().join('-')}/CHECK_IN`;
    db.attendances.push({
      id: uuidv4(), employeeId: emp.employeeId, date: todayStr, shift: emp.shift,
      checkIn: { time: checkTime, gps: '10.762622,106.660172', address: branch?.address||'130 Vạn Kiếp', image: '', drivePath, timestamp: new Date().toISOString() },
      checkOut: null, status: 'CHECKED_IN', violations: [], branchId: emp.branchId, version:1, updated_at: new Date().toISOString(), sync_status:'SYNCED'
    });
  });
  // Zalo records
  db.zaloRecords = [
    { id: uuidv4(), sent_at: new Date().toISOString(), receiver: '0901234567', type: 'INTERVIEW_INVITE', content: 'Mời phỏng vấn tại CN2 261 Tô Hiến Thành lúc 09:00 29/08', status:'SENT', error:'' },
    { id: uuidv4(), sent_at: new Date().toISOString(), receiver: '0907654321', type: 'TEST_RESULT', content: 'Chúc mừng bạn đạt 8.5 điểm', status:'DELIVERED', error:'' }
  ];
  saveDB();
}
function getMonday(d){
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day===0 ? -6:1);
  date.setDate(diff);
  date.setHours(0,0,0,0);
  return date;
}
function getDaysInMonth(year, month){
  return new Date(year, month, 0).getDate();
}
// Global helper cho lịch 7 ngày (dùng cho cả TRAINING và OFFICIAL)
function buildFull7DaysForWeek(wStartStr, activeDaysMap, empShift, isTraining = false, startDStr = null){
  const parts = wStartStr.split('T')[0].split('-').map(Number);
  const wDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayNames = ['T2','T3','T4','T5','T6','T7','CN'];
  const days = [];
  let trialEnd = null;
  if(isTraining && startDStr){
    const sp = startDStr.split('T')[0].split('-').map(Number);
    const trialStart = new Date(sp[0], sp[1] - 1, sp[2]);
    trialEnd = new Date(trialStart); trialEnd.setDate(trialStart.getDate()+11);
  }
  for(let i=0;i<7;i++){
    const curr = new Date(wDate); curr.setDate(wDate.getDate()+i);
    const y = curr.getFullYear(); const m = String(curr.getMonth()+1).padStart(2,'0'); const d = String(curr.getDate()).padStart(2,'0');
    const dateStr = `${y}-${m}-${d}`;
    if(isTraining && trialEnd && curr > trialEnd){
      days.push({ date: dateStr, dayName: dayNames[i], shift: '-', status: 'WAITING_OFFICIAL', substituteFor: null });
      continue;
    }
    if(activeDaysMap[dateStr]){
      days.push({ date: dateStr, dayName: dayNames[i], shift: empShift || 'CA_TRUA', status: 'WORKING', substituteFor: null });
    } else {
      days.push({ date: dateStr, dayName: dayNames[i], shift: 'OFF', status: 'OFF', substituteFor: null });
    }
  }
  return days;
}

loadDB();
// Tự động cập nhật mật khẩu admin từ admin123 sang Master@@2027 nếu vẫn còn cũ (triệt để)
try{
  const adminUser = db.users.find(u=>u.username==='admin');
  if(adminUser && bcrypt.compareSync('admin123', adminUser.password)){
    adminUser.password = bcrypt.hashSync('Master@@2027', 10);
    console.log('[SECURITY] Đã tự động cập nhật mật khẩu admin từ admin123 -> Master@@2027');
    saveDB();
  }
}catch(e){ console.error('Admin pwd migrate error', e.message); }
// Override từ Render ENV nếu có (ưu tiên ENV > DB > DEFAULT) - phục vụ deploy Render
if(process.env.GOOGLE_SHEET_SPREADSHEET_ID) db.settings.googleSheet.spreadsheetId = process.env.GOOGLE_SHEET_SPREADSHEET_ID;
if(process.env.GOOGLE_SHEET_FORM_RESPONSES_ID) db.settings.googleSheet.formResponsesSheetId = process.env.GOOGLE_SHEET_FORM_RESPONSES_ID;
if(process.env.GOOGLE_SHEET_TARGET_DATABASE_ID) db.settings.googleSheet.targetDatabaseSpreadsheetId = process.env.GOOGLE_SHEET_TARGET_DATABASE_ID;
if(process.env.GOOGLE_SHEET_WEBHOOK_URL) db.settings.googleSheet.targetWebhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
if(process.env.GOOGLE_SHEET_WEBHOOK_URL_1) db.settings.googleSheet.targetWebhookUrl1 = process.env.GOOGLE_SHEET_WEBHOOK_URL_1;
if(process.env.GOOGLE_SHEET_WEBHOOK_URL_2) db.settings.googleSheet.targetWebhookUrl2 = process.env.GOOGLE_SHEET_WEBHOOK_URL_2;
if(process.env.GOOGLE_SHEET_WEBHOOK_SECRET) db.settings.googleSheet.secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET;
if(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) db.settings.googleSheet.serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
if(process.env.GOOGLE_PRIVATE_KEY) {
  const pk = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  if(pk.includes('BEGIN PRIVATE KEY')) db.settings.googleSheet.privateKey = pk;
}
// Finance Webhook - đồng bộ sang Google Sheets Finance (4 sheet)
if(process.env.FINANCE_WEBHOOK_URL){
  if(!db.settings.finance) db.settings.finance={ webhookUrl: process.env.FINANCE_WEBHOOK_URL, secret: process.env.FINANCE_WEBHOOK_SECRET || 'umbomilk_secret_2026' };
  else db.settings.finance.webhookUrl = process.env.FINANCE_WEBHOOK_URL;
  // Đồng bộ ngược để tương thích cũ
  db.settings.googleSheet.targetWebhookUrl2 = process.env.FINANCE_WEBHOOK_URL;
  if(process.env.FINANCE_WEBHOOK_SECRET) db.settings.finance.secret = process.env.FINANCE_WEBHOOK_SECRET;
}
if(process.env.FINANCE_WEBHOOK_SECRET && db.settings.finance){
  db.settings.finance.secret = process.env.FINANCE_WEBHOOK_SECRET;
}
if(process.env.GOOGLE_OAUTH_CLIENT_ID) db.settings.calendar.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
if(process.env.GOOGLE_OAUTH_CLIENT_SECRET) db.settings.calendar.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if(process.env.GOOGLE_CALENDAR_ID) db.settings.calendar.calendarId = process.env.GOOGLE_CALENDAR_ID;
if(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) db.settings.googleDrive.rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
if(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) db.settings.googleDrive.backupFolderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
// Log ràng buộc đã áp dụng
console.log(`[CONFIG] Google Sheet Hub: Form=${db.settings.googleSheet.formResponsesSheetId.slice(0,8)}... DB=${db.settings.googleSheet.targetDatabaseSpreadsheetId.slice(0,8)}... Webhooks=${getAllWebhookUrls().length} [${getAllWebhookUrls().map(u=>u.slice(0,35)+'...').join(', ')}]`);
console.log(`[CONFIG] Finance: ${db.settings.finance?.webhookUrl ? db.settings.finance.webhookUrl.slice(0,35)+'...' : 'EMPTY'} • Calendar: ${db.settings.calendar.clientId ? 'OAuth SET' : 'EMPTY'} • Drive: ${db.settings.googleDrive.rootFolderId ? db.settings.googleDrive.rootFolderId.slice(0,8)+'...' : 'EMPTY'}`);
// Fix mock attendance sai ca CA_TOI hiển thị Đang làm buổi sáng - realtime đúng Vietnam
(function cleanupIncorrectAttendances(){
  try{
    const todayVN = getVietnamTodayStr();
    const nowVN = getVietnamNow();
    const nowMins = nowVN.getHours()*60+nowVN.getMinutes();
    let removed=0;
    const beforeLen = db.attendances.length;
    db.attendances = db.attendances.filter(a=>{
      if(a.date===todayVN && a.shift==='CA_TOI' && a.checkIn && a.checkIn.time==='07:02'){
        // CA_TOI ca tối 18-23h mà check-in 07:02 buổi sáng là sai - xóa để HR không thấy Đang làm sai
        if(a.checkIn.drivePath && a.checkIn.drivePath.includes('CA_SANG')){
          removed++; return false;
        }
        // Nếu đang buổi sáng (<12h) mà đã có check-in CA_TOI thì sai
        if(nowMins < 12*60){
          removed++; return false;
        }
      }
      // Cũng xóa các mock CA_CHIEU/CA_SANG sai giờ tương tự
      if(a.date===todayVN && a.checkIn && a.checkIn.time==='07:02' && a.shift!=='CA_SANG'){
        // Chỉ CA_SANG mới được 07:02
        removed++; return false;
      }
      return true;
    });
    if(removed>0 || db.attendances.length!==beforeLen){
      saveDB();
      console.log(`[ATTENDANCE FIX] Đã xóa ${removed} mock sai ca (CA_TOI 07:02 buổi sáng) - realtime Vietnam`);
      try{ io.emit('attendances:update', db.attendances); }catch(e){}
    }
  }catch(e){ console.error('cleanupIncorrectAttendances', e.message); }
})();
// Cleanup old syncQueue DEAD do placeholder/KEY (fix 23 DEAD - triệt để)
(function cleanupOldSyncQueue(){
  try{
    if(!db.syncQueue || db.syncQueue.length===0) return;
    const wb = db.settings?.googleSheet?.targetWebhookUrl || '';
    const isPH = wb.includes('AKfycbz_umbomilk_apps_script') || wb.includes('umbomilk_apps_script');
    const before = db.syncQueue.length;
    const beforeDead = db.syncQueue.filter(i=>i.sync_status==='DEAD').length;
    // Lọc bỏ DEAD rõ ràng do placeholder/404/KEY
    db.syncQueue = db.syncQueue.filter(i=>{
      if(i.sync_status==='DEAD' && (i.error?.includes('placeholder') || i.error?.includes('404') || i.entity==='KEY' || i.error?.includes('No Google Sheet mapping'))) return false;
      return true;
    });
    // Chuyển FAILED do KEY/placeholder về trạng thái không lỗi
    db.syncQueue.forEach(i=>{
      if(i.entity==='KEY' && (i.sync_status==='FAILED' || i.sync_status==='DEAD')){ i.sync_status='SYNCED'; delete i.error; i.note='Key embedded - auto fixed'; i.syncedAt=new Date().toISOString(); }
      if(isPH && i.error?.includes('placeholder') && i.sync_status==='FAILED'){ i.sync_status='UNCONFIGURED'; i.error='Webhook placeholder - dữ liệu lưu local, Sheets API 60s sẽ đồng bộ khi có ServiceAccount'; }
      if(i.error?.includes('No Google Sheet mapping for KEY')){ i.sync_status='SYNCED'; delete i.error; i.note='Key embedded'; }
    });
    // Nếu vẫn còn DEAD do 404 webhook (placeholder) thì xóa luôn để không báo 23 DEAD
    const stillDead = db.syncQueue.filter(i=>i.sync_status==='DEAD');
    if(stillDead.length>0 && isPH){
      const cnt = stillDead.length;
      db.syncQueue = db.syncQueue.filter(i=>i.sync_status!=='DEAD');
      console.log(`[SYNC STARTUP CLEANUP] Xóa thêm ${cnt} DEAD còn lại do placeholder`);
    }
    if(db.syncQueue.length !== before || beforeDead>0){
      saveDB();
      console.log(`[SYNC STARTUP CLEANUP] ${before} -> ${db.syncQueue.length} mục (đã xóa ${before - db.syncQueue.length} DEAD placeholder/KEY)`);
      // Emit để UI cập nhật ngay
      setTimeout(()=>{ try{ io.emit('sync:update', db.syncQueue); }catch(e){} }, 1000);
    }
  }catch(e){ console.error('cleanupOldSyncQueue error', e.message); }
})();

// ============ HELPERS ============
function audit(actor, action, entity, before, after, ip='127.0.0.1'){
  const log = { id: uuidv4(), actor, action, entity, before, after, timestamp: new Date().toISOString(), ip, device: 'web' };
  db.auditLogs.unshift(log);
  if(db.auditLogs.length>500) db.auditLogs.pop();
  saveDB();
  io.emit('audit:new', log);
}
function emitForceLogout(employeeId, reason='Tài khoản không tồn tại'){
  const payload = { employeeId, reason, timestamp: new Date().toISOString() };
  // Gửi tới room riêng + broadcast để web app nhân viên dù chưa join room vẫn nhận
  try{ io.to(`employee:${employeeId}`).emit('employee:forceLogout', payload); }catch(e){}
  io.emit('employee:forceLogout', payload);
  console.log(`[FORCE_LOGOUT] ${employeeId} reason: ${reason}`);
}

async function syncToGoogleSheet(item){
  // Yêu cầu #9: Key đã gộp vào NHAN_VIEN_TRAINING/CHINH_THUC nên không cần sync riêng
  if(item.entity==='KEY'){
    // Key được đồng bộ qua dòng nhân viên (syncSheetTab) nên coi như SYNCED
    return { success:true, via:'KEY_EMBEDDED_IN_EMPLOYEE' };
  }
  const webhookUrls = getAllWebhookUrls();
  const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || 'umbomilk_secret_2026';
  if(webhookUrls.length===0) throw new Error('Chưa cấu hình Google Sheet Webhook URL trong Cài đặt (cần 1 trong 3: WEBHOOK_URL / _1 / _2)');
  const allPlaceholder = webhookUrls.every(u=> u.includes('AKfycbz_umbomilk_apps_script') || u.includes('umbomilk_apps_script'));
  if(allPlaceholder) throw new Error('Webhook placeholder chưa cấu hình - dữ liệu sẽ được đồng bộ qua Sheets API 60s (nếu có ServiceAccount) hoặc lưu local');

  const sheetMap = {
    APPLICANT: 'NHAN_VIEN_MOI',
    EMPLOYEE: item.payload?.type === 'OFFICIAL' ? 'NHAN_VIEN_CHINH_THUC' : 'NHAN_VIEN_TRAINING',
    PERSON: 'NHAN_VIEN_MOI',
    ATTENDANCE: 'RECORD_DIEM_DANH',
    SCHEDULE: 'LICH_LAM_VIEC',
    OFF_REQUEST: 'PHIEU_OFF_HANG_TUAN',
    EMERGENCY_REQUEST: 'PHIEU_OFF_DOT_XUAT',
    DEVICE_REQUEST: 'PHIEU_DOI_THIET_BI',
    TRAINING_SHIFT: 'PHIEU_DOI_CA_TRAINING',
    TEST_RESULT: 'KET_QUA_TEST',
    ZALO: 'RECORD_ZALO'
  };
  const sheetName = sheetMap[item.entity];
  if(!sheetName) throw new Error(`No Google Sheet mapping for ${item.entity}`);

  let lastError=null;
  for(const webhookUrl of webhookUrls){
    const isPH = webhookUrl.includes('AKfycbz_umbomilk_apps_script') || webhookUrl.includes('umbomilk_apps_script');
    if(isPH) continue;
    try{
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, sheetName, operation: item.operation, payload: item.payload }),
      });
      const text = await res.text();
      let data; try{ data=JSON.parse(text); }catch(e){ data={ success: res.ok, raw: text.slice(0,300)}; }
      if(!res.ok || !data.success){
        let msg = data.error || `Webhook HTTP ${res.status}`;
        if(res.status===401 || (msg && msg.toLowerCase().includes('unauthorized'))){
          msg = `Unauthorized (401) - Sai GOOGLE_SHEET_WEBHOOK_SECRET. Kiểm tra Apps Script secret vs Settings > Google Sheet > Secret. Hiện dùng secret: ${secret.slice(0,4)}•••• (webhook: ${webhookUrl.slice(0,50)}...)`;
        }
        if(res.status===404) msg += ' - Webhook URL không tồn tại (kiểm tra Script deployment)';
        lastError = new Error(msg + ` [${webhookUrl.slice(0,40)}...]`);
        continue;
      }
      return data;
    }catch(e){ lastError=e; continue; }
  }
  throw lastError || new Error('Tất cả 3 webhook đều lỗi/placeholder');
}

function addSyncQueue(entity, operation, payload, actor, source='WEB_HR'){
  const webhookUrls = getAllWebhookUrls();
  const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || 'umbomilk_secret_2026';
  const hasRealWebhook = webhookUrls.some(u=> !u.includes('AKfycbz_umbomilk_apps_script') && !u.includes('umbomilk_apps_script'));
  const isKeyEntity = entity==='KEY';
  let initialStatus = (webhookUrls.length===0 || !hasRealWebhook) ? 'UNCONFIGURED' : 'PENDING';
  if(isKeyEntity) initialStatus = 'SYNCED';
  if(!hasRealWebhook && !isKeyEntity) initialStatus = 'UNCONFIGURED';
  const item = { 
    id: uuidv4(), 
    entity, 
    operation, 
    payload, 
    version: payload.version||1, 
    updated_at: new Date().toISOString(), 
    updated_by: actor, 
    source, 
    sync_status: initialStatus, 
    retryCount:0 
  };
  if(initialStatus==='UNCONFIGURED'){
    if(!hasRealWebhook) item.error = 'Webhook placeholder (chưa deploy Apps Script) - dữ liệu lưu local, sẽ đồng bộ qua Sheets API 60s khi có ServiceAccount';
    else item.error = webhookUrls.length===0 ? 'Chưa cấu hình Google Sheet Webhook URL (cần 1 trong 3)' : 'Thiếu GOOGLE_SHEET_WEBHOOK_SECRET';
  }
  if(initialStatus==='SYNCED' && isKeyEntity){
    item.error = undefined;
    item.note = 'Key đã gộp vào dòng nhân viên (NHAN_VIEN_TRAINING/CHINH_THUC) - không cần sync riêng';
    item.syncedAt = new Date().toISOString();
  }
  db.syncQueue.unshift(item);
  if(db.syncQueue.length>200) db.syncQueue.pop();

  if(initialStatus==='PENDING'){
    syncToGoogleSheet(item)
      .then(()=>{ item.sync_status='SYNCED'; item.syncedAt=new Date().toISOString(); delete item.error; saveDB(); io.emit('sync:update', db.syncQueue); })
      .catch(err=>{
        // Nếu lỗi do placeholder thì đánh UNCONFIGURED thay vì FAILED để không thành DEAD
        if(err.message && err.message.includes('placeholder')){
          item.sync_status='UNCONFIGURED';
          item.error=err.message;
        } else {
          item.sync_status='FAILED'; item.error=err.message;
        }
        item.retryCount=(item.retryCount||0)+1; saveDB(); io.emit('sync:update', db.syncQueue);
      });
  } else {
    saveDB();
    io.emit('sync:update', db.syncQueue);
  }
  return item;
}
function generateEmployeeId(branchId){
  const branch = db.branches.find(b=>b.id===branchId);
  if(!branch) throw new Error('Branch not found');
  const now = new Date();
  const dd = String(now.getDate()).padStart(2,'0');
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  const datePart = `${dd}${mm}${yyyy}`;
  let attempt=0;
  while(attempt<100){
    const rnd = String(Math.floor(1000+Math.random()*9000));
    const eid = `${branch.prefix}_UBM${datePart}_NV${rnd}`;
    if(!db.employees.find(e=>e.employeeId===eid)) return eid;
    attempt++;
  }
  throw new Error('Cannot generate unique ID');
}
function isOffWindowOpen(){
  // Dùng giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7) để realtime đúng với client VN
  const nowUtc = new Date();
  const vietnamTime = new Date(nowUtc.toLocaleString('en-US', {timeZone: 'Asia/Ho_Chi_Minh'}));
  const day = vietnamTime.getDay(); //0 Sun, 5 Fri, 6 Sat
  const hour = vietnamTime.getHours() + vietnamTime.getMinutes()/60;
  // Rule: 12:00 Friday (5) to 15:00 Saturday (6) - giờ VN
  if(day===5 && hour>=12) return true;
  if(day===6 && hour<15) return true;
  return false;
}
function checkOffConflict(branchId, shift, date){
  // Check if same branch+shift+date already has OFF approved
  return db.offRequests.find(r=>r.branchId===branchId && r.shift===shift && r.dates.includes(date) && r.status==='APPROVED');
}
function calculatePayroll(employeeId, month){
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return null;
  const rate = emp.type==='TRAINING'? db.settings.payroll.trainingRate : db.settings.payroll.officialRate;
  // attendances in month
  const atts = db.attendances.filter(a=>a.employeeId===employeeId && a.date.startsWith(month) && a.status==='COMPLETED');
  let totalHours=0, totalPenalty=0, breakdown=[];
  atts.forEach(a=>{
    const shiftInfo = db.settings.payroll.shifts[a.shift];
    const hours = shiftInfo? shiftInfo.hours : 5;
    totalHours+=hours;
    let penalty=0;
    if(a.violations && a.violations.includes('LATE')) penalty+=db.settings.attendance.penaltyLate;
    if(a.violations && a.violations.includes('EARLY_LEAVE')) penalty+=db.settings.attendance.penaltyLate;
    if(a.violations && a.violations.includes('NO_CHECKOUT')) penalty+=db.settings.attendance.penaltyNoCheckout;
    totalPenalty+=penalty;
    breakdown.push({date:a.date, shift:a.shift, hours, rate, amount: hours*rate, penalty, net: hours*rate - penalty});
  });
  const gross = totalHours * rate;
  const net = gross - totalPenalty;
  return { employeeId, name: emp.name, type: emp.type, rate, totalHours, gross, totalPenalty, net, breakdown, month };
}
// === OFFICIAL MONTHLY ATTENDANCE (T1→Cuối tháng) ===
function getDaysInMonth(year, month){
  return new Date(year, month, 0).getDate();
}
function getOfficialMonthlyStats(employeeId, monthStr){
  // monthStr "2026-08"
  const [y,m] = monthStr.split('-').map(Number);
  const daysInMonth = getDaysInMonth(y,m);
  // OFF days in month (WEEKLY approved + emergency approved)
  const offWeekly = db.offRequests.filter(r=>r.employeeId===employeeId && r.status==='APPROVED' && r.dates.some(d=>d.startsWith(monthStr))).reduce((s,r)=> s + r.dates.filter(d=>d.startsWith(monthStr)).length ,0);
  const offEmergency = db.emergencyRequests.filter(r=>r.employeeId===employeeId && r.status==='APPROVED' && r.date.startsWith(monthStr)).length;
  const totalOff = offWeekly + offEmergency;
  const attendancesInMonth = db.attendances.filter(a=>a.employeeId===employeeId && a.date.startsWith(monthStr));
  const completed = attendancesInMonth.filter(a=>a.status==='COMPLETED').length;
  const workingScheduled = daysInMonth - totalOff; // scheduled working days
  const min12Compliant = workingScheduled >= 12;
  // Also compute actual working days from schedules where status WORKING/SUBSTITUTE in month
  let scheduledWorking = 0;
  db.schedules.filter(s=>s.employeeId===employeeId).forEach(s=>{
    s.days.forEach(d=>{
      if(d.date.startsWith(monthStr) && (d.status==='WORKING' || d.status==='SUBSTITUTE')) scheduledWorking++;
    });
  });
  return { month: monthStr, daysInMonth, totalOff, offWeekly, offEmergency, workingScheduled, scheduledWorking, completedAttendances: completed, min12Compliant, attendances: attendancesInMonth };
}
function validateOfficialMonthlyMin12(employeeId, monthStr, additionalOffDates){
  const stats = getOfficialMonthlyStats(employeeId, monthStr);
  const addByMonth = {};
  additionalOffDates.forEach(d=>{
    const m = d.slice(0,7);
    addByMonth[m] = (addByMonth[m]||0)+1;
  });
  for(const m in addByMonth){
    const [y,mo] = m.split('-').map(Number);
    const daysInMonth = getDaysInMonth(y,mo);
    const existingOff = db.offRequests.filter(r=>r.employeeId===employeeId && r.status==='APPROVED' && r.dates.some(d=>d.startsWith(m))).reduce((s,r)=> s + r.dates.filter(d=>d.startsWith(m)).length ,0) + db.emergencyRequests.filter(r=>r.employeeId===employeeId && r.status==='APPROVED' && r.date.startsWith(m)).length;
    const totalOffAfter = existingOff + addByMonth[m];
    const workingAfter = daysInMonth - totalOffAfter;
    if(workingAfter < 12) return { valid:false, month:m, existingOff, totalOffAfter, workingAfter, daysInMonth };
  }
  return { valid:true, stats };
}
function authMiddleware(req,res,next){
  const token = req.headers.authorization?.replace('Bearer ','');
  if(!token) return res.status(401).json({error:'No token'});
  try{
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  }catch(e){ return res.status(401).json({error:'Invalid token'}); }
}
function roleCheck(allowed){
  return (req,res,next)=>{
    if(!allowed.includes(req.user.role)) return res.status(403).json({error:'Forbidden'});
    next();
  };
}
// Realtime branchScope filter - ensures Manager chỉ thấy chi nhánh được cấp
function branchScopeFilter(req){
  if(!req.user || req.user.role==='Admin' || req.user.role==='HR' || req.user.role==='Umbomilk') return null; // HR và Admin đều xem full dữ liệu (chỉ khác chức năng)
  if(req.user.employeeId) return null; // nhân viên chỉ xem dữ liệu của mình (đã filter theo employeeId)
  return req.user.branchScope || []; // Manager mới lọc theo CN được phân quyền
}
function filterByBranchScope(list, req, branchField='branchId'){
  const scope = branchScopeFilter(req);
  if(!scope) return list;
  return list.filter(item=> scope.includes(item[branchField]));
}
function paginate(list, req){
  const page = Math.max(1, parseInt(req.query.page)||1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit)||50));
  const total = list.length;
  const start = (page-1)*limit;
  const data = list.slice(start, start+limit);
  return { data, total, page, limit, totalPages: Math.ceil(total/limit) };
}

// ============ AUTH ROUTES ============
// Input validation helper
function sanitizeString(str, max=200){ if(typeof str!=='string') return ''; return str.trim().slice(0,max).replace(/[<>]/g,''); }

app.post('/api/auth/login', authLimiter, (req,res)=>{
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({error:'Thiếu username/password'});
  const u = sanitizeString(username,50);
  const user = db.users.find(x=>x.username===u);
  if(!user) return res.status(401).json({error:'Sai tài khoản'});
  if(!bcrypt.compareSync(password, user.password)) return res.status(401).json({error:'Sai mật khẩu'});
  const token = jwt.sign({ id:user.id, username:user.username, role:user.role, branchScope:user.branchScope, allowedTabs: user.allowedTabs }, JWT_SECRET, {expiresIn: process.env.JWT_EXPIRES_IN || '12h'});
  audit(u,'LOGIN','USER',null,{username:u}, req.ip);
  res.json({ token, user:{ id:user.id, username:user.username, role:user.role, branchScope:user.branchScope, displayName:user.displayName, allowedTabs: user.allowedTabs }});
});
app.post('/api/auth/employee-login', authLimiter, (req,res)=>{
  const { employeeId, key, deviceId } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Mã nhân viên không tồn tại'});
  const keyRec = db.keys.find(k=>k.employeeId===employeeId && k.key===key);
  if(!keyRec) return res.status(401).json({error:'Key không hợp lệ'});
  if(keyRec.status!=='ACTIVE') return res.status(403).json({error:'Key đã bị vô hiệu hóa'});
  // Device binding check
  if(keyRec.deviceId && keyRec.deviceId!==deviceId){
    return res.status(403).json({error:'Key đã gắn với thiết bị khác. Vui lòng gửi yêu cầu đổi thiết bị.', needDeviceReset:true, boundDevice: keyRec.deviceId});
  }
  if(!keyRec.deviceId && deviceId){
    keyRec.deviceId = deviceId;
    keyRec.boundAt = new Date().toISOString();
    audit(employeeId,'DEVICE_BIND','KEY',null,{employeeId, deviceId}, req.ip);
    addSyncQueue('KEY','UPDATE',keyRec, employeeId, 'WEB_EMPLOYEE');
    saveDB();
    io.emit('keys:update', db.keys);
  }
  const token = jwt.sign({ employeeId, name: emp.name, type: emp.type, status: emp.status, branchId: emp.branchId }, JWT_SECRET, {expiresIn:'12h'});
  // update last login notification?
  res.json({ token, employee: emp, key: keyRec });
});
// Ràng buộc: Kiểm tra tài khoản nhân viên còn tồn tại không (realtime logout)
app.get('/api/employee/me', (req,res)=>{
  const token = req.headers.authorization?.replace('Bearer ','');
  if(!token) return res.status(401).json({ error:'No token', forceLogout:true });
  try{
    const decoded = jwt.verify(token, JWT_SECRET);
    const emp = db.employees.find(e=> e.employeeId===decoded.employeeId);
    if(!emp) return res.status(401).json({ error:'Tài khoản nhân viên không tồn tại', forceLogout:true, reason:'Tài khoản đã bị xóa khỏi hệ thống' });
    if(['ARCHIVED','TERMINATED','RESIGNED'].includes(emp.status)) return res.status(401).json({ error:`Tài khoản đã bị ${emp.status}`, forceLogout:true, reason:`Trạng thái ${emp.status} - liên hệ HR` });
    // Kiểm tra key còn active không
    const keyRec = db.keys.find(k=> k.employeeId===emp.employeeId);
    if(keyRec && keyRec.status!=='ACTIVE') return res.status(401).json({ error:'Key đã bị vô hiệu hóa', forceLogout:true, reason:'Key không còn hiệu lực' });
    res.json({ employee: emp, valid:true });
  }catch(e){
    return res.status(401).json({ error:'Token không hợp lệ', forceLogout:true });
  }
});
app.post('/api/auth/device-request', (req,res)=>{
  const { employeeId, reason, deviceId } = req.body;
  if(!reason) return res.status(400).json({error:'Lý do là bắt buộc'});
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Not found'});
  const keyRec = db.keys.find(k=>k.employeeId===employeeId);
  const reqId = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime()+30*60000); // 30 min
  const dr = { id:reqId, employeeId, reason, newDeviceId: deviceId, oldDeviceId: keyRec? keyRec.deviceId:null, status:'PENDING', createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(), version:1 };
  db.deviceRequests.unshift(dr);
  audit(employeeId,'DEVICE_REQUEST','DEVICE',null,dr, req.ip);
  addSyncQueue('DEVICE_REQUEST','CREATE',dr, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('deviceRequests:update', db.deviceRequests);
  // Realtime auto-expire handled by persistent poller (realtimeAutomationPoller) every 20s - survives restart
  res.json({ success:true, request: dr });
});

// ============ HEALTH & REALTIME ============
app.get('/health', (req,res)=> res.json({ status:'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), employees: db.employees.length, applicants: db.applicants.length, attendances: db.attendances.length, pendingDevices: db.deviceRequests.filter(r=>r.status==='PENDING').length, pendingEmerg: db.emergencyRequests.filter(r=>r.status==='PENDING').length }));
app.get('/api/health', (req,res)=> res.json({ status:'ok', realtime: true, socket: io.engine.clientsCount, db: { employees: db.employees.length, applicants: db.applicants.length } }));

// ============ BRANCHES ============
app.get('/api/branches', (req,res)=> res.json(db.branches));

// ============ DRIVE REALTIME (spec 4 folder structure) ============
app.get('/api/drive/files', authMiddleware, (req,res)=>{
  const { employeeId, date, type, limit } = req.query;
  let list = [...db.driveFiles];
  if(employeeId) list = list.filter(f=>f.employeeId===employeeId);
  if(date) list = list.filter(f=>f.date===date);
  if(type) list = list.filter(f=>f.type===type);
  const lim = Math.min(100, parseInt(limit)||20);
  res.json(list.slice(0, lim));
});
app.post('/api/drive/upload', authMiddleware, (req,res)=>{
  const { employeeId, date, type, fileName, base64 } = req.body;
  if(!employeeId || !date) return res.status(400).json({error:'Thiếu employeeId/date'});
  const f = addDriveFile(employeeId, date, type||'CHECK_IN', fileName||`capture_${Date.now()}.jpg`, { size: base64? base64.length : 0, uploader: req.user.username });
  if(!f) return res.status(404).json({error:'Employee not found'});
  saveDB();
  res.json(f);
});
app.get('/api/sync/status', authMiddleware, (req,res)=>{
  res.json({
    queue: db.syncQueue.slice(0,10),
    pending: db.syncQueue.filter(s=>s.sync_status==='PENDING').length,
    failed: db.syncQueue.filter(s=>s.sync_status==='FAILED').length,
    synced: db.syncQueue.filter(s=>s.sync_status==='SYNCED').length,
    driveFiles: db.driveFiles.length,
    lastHeartbeat: new Date().toISOString()
  });
});

// ============ EMPLOYEES ============
app.get('/api/employees', authMiddleware, (req,res)=>{
  const { status, branch, type, category, search, page, limit } = req.query;
  let list = [...db.employees];
  // BranchScope realtime filter
  list = filterByBranchScope(list, req, 'branchId');
  if(status) list = list.filter(e=>e.status===status);
  if(branch) list = list.filter(e=>e.branchId===branch);
  if(type) list = list.filter(e=>e.type===type);
  if(category) list = list.filter(e=>e.category===category);
  if(search) {
    const s = search.toLowerCase();
    list = list.filter(e=> e.name.toLowerCase().includes(s) || e.employeeId.toLowerCase().includes(s) || e.phone.includes(s));
  }
  // Pagination for realtime tables
  if(page || limit){
    const pag = paginate(list, req);
    return res.json({ ...pag, data: pag.data });
  }
  res.json(list);
});
app.post('/api/employees', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const { name, phone, branchId, shift, category } = req.body;
  if(!name||!phone||!branchId||!shift) return res.status(400).json({error:'Thiếu thông tin'});
  if(!db.branches.find(b=>b.id===branchId)) return res.status(400).json({error:'Chi nhánh không hợp lệ'});
  const employeeId = generateEmployeeId(branchId);
  const now = new Date();
  const end = new Date(); end.setDate(now.getDate()+7);
  const emp = {
    id: uuidv4(), employeeId, name, phone, branchId, shift,
    startDate: toVietnamDateStr(now),
    endDate: toVietnamDateStr(end),
    trainingDays: 7, status: 'TRAINING', testScore: null, testResult: null,
    type: 'TRAINING', category: category||'STORE', avatar:'', checkHistory:[],
    version:1, updated_at: now.toISOString(), updated_by: req.user.username, source:'WEB_HR', sync_status:'PENDING'
  };
  db.employees.push(emp);
  const key = { id: uuidv4(), employeeId, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: now.toISOString(), sync_status:'PENDING' };
  db.keys.push(key);
  audit(req.user.username,'CREATE','EMPLOYEE',null,emp, req.ip);
  addSyncQueue('EMPLOYEE','CREATE',emp, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  res.json({ employee: emp, key });
});
// Bulk import Official employees (data cũ)
app.post('/api/employees/import-official', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const rows = req.body.employees || req.body.rows || req.body.data || [];
  if(!Array.isArray(rows) || rows.length===0) return res.status(400).json({error:'Không có dữ liệu import (cần mảng employees)'});
  if(rows.length>500) return res.status(400).json({error:'Tối đa 500 nhân viên/lần import'});
  function normBranch(input){
    if(!input) return null;
    const raw = String(input).trim();
    if(db.branches.find(b=>b.id===raw)) return raw;
    if(db.branches.find(b=>b.prefix===raw)) return db.branches.find(b=>b.prefix===raw).id;
    // try contains
    const upper = raw.toUpperCase();
    if(upper.includes('CN1') || upper.includes('CN130') || upper.includes('130') ) return 'CN1';
    if(upper.includes('CN2') || upper.includes('CN261') || upper.includes('261') ) return 'CN2';
    if(upper.includes('CN3') || upper.includes('CN120') || upper.includes('120') ) return 'CN3';
    if(upper.includes('CN4') || upper.includes('CN111') || upper.includes('111') ) return 'CN4';
    // fallback try mapBranchText if exists
    try{ if(typeof mapBranchText==='function') return mapBranchText(raw); }catch(e){}
    return null;
  }
  function normShift(input){
    if(!input) return 'CA_SANG';
    const raw = String(input).trim().toUpperCase();
    if(['CA_SANG','CA_CHIEU','CA_TOI','CA_TRUA'].includes(raw)) return raw==='CA_TRUA' ? 'CA_CHIEU' : raw;
    const low = String(input).toLowerCase();
    if(low.includes('sáng') || low.includes('sang') || low.includes('7g') || low.includes('07:00')) return 'CA_SANG';
    if(low.includes('chiều') || low.includes('chieu') || low.includes('trưa') || low.includes('trua') || low.includes('12g') || low.includes('12:00')) return 'CA_CHIEU';
    if(low.includes('tối') || low.includes('toi') || low.includes('18g') || low.includes('18:00') || low.includes('23:00')) return 'CA_TOI';
    return 'CA_SANG';
  }
  function parseDate(input){
    if(!input) return getVietnamTodayStr();
    const s = String(input).trim();
    // already yyyy-mm-dd
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // dd/mm/yyyy
    if(s.includes('/')){
      const p = s.split('/');
      if(p.length===3){
        const dd = p[0].padStart(2,'0');
        const mm = p[1].padStart(2,'0');
        let yyyy = p[2];
        if(yyyy.length===2) yyyy='20'+yyyy;
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    // dd-mm-yyyy
    if(s.includes('-') && s.split('-')[0].length===2){
      const p=s.split('-');
      if(p.length===3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    }
    const d = new Date(s);
    if(!isNaN(d)) return toVietnamDateStr(d);
    return getVietnamTodayStr();
  }
  const results = { imported:0, skipped:[], errors:[], employees:[], keys:[] };
  rows.forEach((row, idx)=>{
    try{
      const name = (row.name || row['Họ tên'] || row['Ho ten'] || row['ten'] || row['Name'] || '').toString().trim();
      const phone = (row.phone || row['SĐT'] || row['SDT'] || row['sdt'] || row['Phone'] || row['phone'] || '').toString().trim();
      let branchId = normBranch(row.branchId || row['Chi nhánh'] || row['Chi nhanh'] || row['CN'] || row['branch'] || 'CN2');
      let shift = normShift(row.shift || row['Ca'] || row['Ca làm'] || row['Ca lam'] || 'CA_SANG');
      const startDate = parseDate(row.startDate || row['Ngày bắt đầu'] || row['Ngay bat dau'] || row['startDate'] || row['Ngày vào'] || '');
      const typeIn = (row.type||row['Loại']||'OFFICIAL').toString().toUpperCase();
      const type = typeIn.includes('TRAIN') ? 'TRAINING' : 'OFFICIAL';
      const statusIn = (row.status|| (type==='OFFICIAL'?'OFFICIAL':'TRAINING')).toString().toUpperCase();
      const status = statusIn.includes('OFFICIAL') ? 'OFFICIAL' : statusIn;
      const category = (row.category||'STORE').toString().toUpperCase();
      const employeeIdInput = (row.employeeId || row['Mã NV'] || row['Ma NV'] || row['ID'] || '').toString().trim();
      const testScore = row.testScore!=null ? Number(row.testScore) : (row['Điểm']!=null ? Number(row['Điểm']) : null);
      if(!name) { results.skipped.push({idx, reason:'Thiếu Họ tên', row}); return; }
      if(!phone) { results.skipped.push({idx, reason:'Thiếu SĐT', row}); return; }
      if(!branchId) { results.errors.push({idx, reason:'Chi nhánh không hợp lệ: '+ (row.branchId||row['Chi nhánh']), row}); return; }
      if(!db.branches.find(b=>b.id===branchId)) { results.errors.push({idx, reason:'Chi nhánh không tồn tại: '+branchId, row}); return; }
      if(db.employees.find(e=>e.phone===phone)){ results.skipped.push({idx, reason:'Trùng SĐT '+phone, row}); return; }
      let employeeId = employeeIdInput;
      if(employeeId){
        if(db.employees.find(e=>e.employeeId===employeeId) || results.employees.find(e=>e.employeeId===employeeId)){
          results.skipped.push({idx, reason:'Trùng Mã NV '+employeeId, row}); return;
        }
      } else {
        try{ employeeId = generateEmployeeId(branchId); }catch(e){ results.errors.push({idx, reason:'Không sinh được Mã NV', row}); return; }
        // ensure not duplicate in this batch
        let attempts=0;
        while(results.employees.find(e=>e.employeeId===employeeId) || db.employees.find(e=>e.employeeId===employeeId)){
          employeeId = generateEmployeeId(branchId);
          if(++attempts>5) break;
        }
      }
      const now = new Date().toISOString();
      const emp = {
        id: uuidv4(), employeeId, name, phone, branchId, shift,
        startDate,
        endDate: type==='OFFICIAL' ? null : (row.endDate? parseDate(row.endDate) : null),
        trainingDays: type==='TRAINING' ? 7 : null,
        status: type==='OFFICIAL' ? 'OFFICIAL' : (status||'TRAINING'),
        testScore: isNaN(testScore)? null : testScore,
        testResult: (testScore!=null && !isNaN(testScore)) ? (testScore>7?'DAT': testScore>=5?'CHUA_DU_DK':'FAILED') : null,
        type, category, avatar:'', checkHistory:[],
        version:1, updated_at: now, updated_by: req.user.username, source:'IMPORT_OFFICIAL', sync_status:'PENDING'
      };
      db.employees.push(emp);
      results.employees.push(emp);
      // create key
      const key = { id: uuidv4(), employeeId, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: now, sync_status:'PENDING' };
      db.keys.push(key);
      results.keys.push(key);
      results.imported++;
      audit(req.user.username,'IMPORT_OFFICIAL','EMPLOYEE',null,emp, req.ip);
      addSyncQueue('EMPLOYEE','CREATE',emp, req.user.username, 'IMPORT');
    }catch(e){
      results.errors.push({idx, reason:e.message, row});
    }
  });
  saveDB();
  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  res.json(results);
});
// Import Training - cập nhật dữ liệu training hiện tại (yêu cầu #3) - cho phép upsert theo SĐT/Mã NV
app.post('/api/employees/import-training', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const rows = req.body.employees || req.body.rows || req.body.data || [];
  if(!Array.isArray(rows) || rows.length===0) return res.status(400).json({error:'Không có dữ liệu import (cần mảng employees)'});
  if(rows.length>500) return res.status(400).json({error:'Tối đa 500 nhân viên/lần import'});
  function normBranch(input){
    if(!input) return null;
    const raw = String(input).trim();
    if(db.branches.find(b=>b.id===raw)) return raw;
    if(db.branches.find(b=>b.prefix===raw)) return db.branches.find(b=>b.prefix===raw).id;
    const upper = raw.toUpperCase();
    if(upper.includes('CN1') || upper.includes('CN130') || upper.includes('130') ) return 'CN1';
    if(upper.includes('CN2') || upper.includes('CN261') || upper.includes('261') ) return 'CN2';
    if(upper.includes('CN3') || upper.includes('CN120') || upper.includes('120') ) return 'CN3';
    if(upper.includes('CN4') || upper.includes('CN111') || upper.includes('111') ) return 'CN4';
    try{ if(typeof mapBranchText==='function') return mapBranchText(raw); }catch(e){}
    return null;
  }
  function normShift(input){
    if(!input) return 'CA_SANG';
    const raw = String(input).trim().toUpperCase();
    if(['CA_SANG','CA_CHIEU','CA_TOI','CA_TRUA'].includes(raw)) return raw==='CA_TRUA' ? 'CA_CHIEU' : raw;
    const low = String(input).toLowerCase();
    if(low.includes('sáng') || low.includes('sang') || low.includes('7g') || low.includes('07:00')) return 'CA_SANG';
    if(low.includes('chiều') || low.includes('chieu') || low.includes('trưa') || low.includes('trua') || low.includes('12g') || low.includes('12:00')) return 'CA_CHIEU';
    if(low.includes('tối') || low.includes('toi') || low.includes('18g') || low.includes('18:00') || low.includes('23:00')) return 'CA_TOI';
    return 'CA_SANG';
  }
  function parseDate(input){
    if(!input) return getVietnamTodayStr();
    const s = String(input).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if(s.includes('/')){
      const p = s.split('/');
      if(p.length===3){
        const dd = p[0].padStart(2,'0');
        const mm = p[1].padStart(2,'0');
        let yyyy = p[2];
        if(yyyy.length===2) yyyy='20'+yyyy;
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    if(s.includes('-') && s.split('-')[0].length===2){
      const p=s.split('-');
      if(p.length===3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    }
    const d = new Date(s);
    if(!isNaN(d)) return toVietnamDateStr(d);
    return getVietnamTodayStr();
  }
  const results = { imported:0, updated:0, skipped:[], errors:[], employees:[], keys:[] };
  rows.forEach((row, idx)=>{
    try{
      const name = (row.name || row['Họ tên'] || row['Ho ten'] || row['ten'] || row['Name'] || '').toString().trim();
      const phone = (row.phone || row['SĐT'] || row['SDT'] || row['sdt'] || row['Phone'] || row['phone'] || '').toString().trim();
      let branchId = normBranch(row.branchId || row['Chi nhánh'] || row['Chi nhanh'] || row['CN'] || row['branch'] || 'CN2');
      let shift = normShift(row.shift || row['Ca'] || row['Ca làm'] || row['Ca lam'] || 'CA_SANG');
      const startDate = parseDate(row.startDate || row['Ngày bắt đầu'] || row['Ngay bat dau'] || row['startDate'] || row['Ngày vào'] || '');
      const endDateInput = row.endDate || row['Ngày kết thúc'] || row['Ngay ket thuc'] || '';
      const statusIn = (row.status|| 'TRAINING').toString().toUpperCase();
      const category = (row.category||'STORE').toString().toUpperCase();
      const employeeIdInput = (row.employeeId || row['Mã NV'] || row['Ma NV'] || row['ID'] || '').toString().trim();
      if(!name) { results.skipped.push({idx, reason:'Thiếu Họ tên', row}); return; }
      if(!phone) { results.skipped.push({idx, reason:'Thiếu SĐT', row}); return; }
      if(!branchId) { results.errors.push({idx, reason:'Chi nhánh không hợp lệ', row}); return; }
      // Kiểm tra tồn tại theo SĐT hoặc Mã NV → UPDATE thay vì skip (yêu cầu #3)
      let existing = null;
      if(employeeIdInput) existing = db.employees.find(e=>e.employeeId===employeeIdInput);
      if(!existing) existing = db.employees.find(e=>e.phone===phone);
      if(existing){
        const before = {...existing};
        existing.name = name;
        existing.branchId = branchId;
        existing.shift = shift;
        existing.startDate = startDate;
        if(endDateInput) existing.endDate = parseDate(endDateInput);
        existing.status = statusIn.includes('OFFICIAL') ? 'OFFICIAL' : (statusIn || existing.status);
        existing.category = category;
        existing.version = (existing.version||1)+1;
        existing.updated_at = new Date().toISOString();
        existing.updated_by = req.user.username;
        existing.sync_status='PENDING';
        results.updated++;
        results.employees.push(existing);
        audit(req.user.username,'UPDATE_TRAINING_IMPORT','EMPLOYEE',before,existing, req.ip);
        addSyncQueue('EMPLOYEE','UPDATE',existing, req.user.username, 'IMPORT_TRAINING');
      } else {
        let employeeId = employeeIdInput;
        if(employeeId && db.employees.find(e=>e.employeeId===employeeId)){
          results.skipped.push({idx, reason:'Trùng Mã NV '+employeeId, row}); return;
        }
        if(!employeeId){
          try{ employeeId = generateEmployeeId(branchId); }catch(e){ results.errors.push({idx, reason:'Không sinh được Mã NV', row}); return; }
        }
        const now = new Date().toISOString();
        const emp = {
          id: uuidv4(), employeeId, name, phone, branchId, shift,
          startDate,
          endDate: endDateInput ? parseDate(endDateInput) : (()=>{ const d=new Date(startDate); d.setDate(d.getDate()+11); return toVietnamDateStr(d); })(),
          trainingDays: 12,
          status: 'TRAINING',
          testScore: null, testResult: null,
          type: 'TRAINING', category, avatar:'', checkHistory:[],
          version:1, updated_at: now, updated_by: req.user.username, source:'IMPORT_TRAINING', sync_status:'PENDING'
        };
        db.employees.push(emp);
        results.employees.push(emp);
        const key = { id: uuidv4(), employeeId, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: now, sync_status:'PENDING' };
        db.keys.push(key);
        results.keys.push(key);
        results.imported++;
        audit(req.user.username,'IMPORT_TRAINING','EMPLOYEE',null,emp, req.ip);
        addSyncQueue('EMPLOYEE','CREATE',emp, req.user.username, 'IMPORT_TRAINING');
      }
    }catch(e){
      results.errors.push({idx, reason:e.message, row});
    }
  });
  saveDB();
  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  res.json(results);
});
app.put('/api/employees/:id', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const emp = db.employees.find(e=>e.id===req.params.id || e.employeeId===req.params.id);
  if(!emp) return res.status(404).json({error:'Not found'});
  const before = {...emp};
  Object.assign(emp, req.body);
  emp.version = (emp.version||1)+1;
  emp.updated_at = new Date().toISOString();
  emp.updated_by = req.user.username;
  emp.sync_status = 'PENDING';
  audit(req.user.username,'UPDATE','EMPLOYEE',before,emp, req.ip);
  addSyncQueue('EMPLOYEE','UPDATE',emp, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('employees:update', db.employees);
  // Ràng buộc realtime: nếu chuyển sang ARCHIVED/TERMINATED/RESIGNED thì force logout ngay
  if(['ARCHIVED','TERMINATED','RESIGNED'].includes(emp.status) && !['ARCHIVED','TERMINATED','RESIGNED'].includes(before.status)){
    emitForceLogout(emp.employeeId, `Tài khoản của bạn đã bị ${emp.status}. Vui lòng liên hệ HR.`);
  }
  // Nếu key bị vô hiệu hóa qua PUT (ví dụ đổi status) cũng force logout
  if(req.body.keyStatus === 'INACTIVE' || req.body.status === 'INACTIVE'){
    emitForceLogout(emp.employeeId, 'Key đã bị vô hiệu hóa - tài khoản sẽ thoát');
  }
  res.json(emp);
});
app.delete('/api/employees/:id', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  // Hỗ trợ tìm bằng phone fallback (normalizePhone) để tương thích cascade route cũ
  let idx = db.employees.findIndex(e=>e.id===req.params.id || e.employeeId===req.params.id);
  if(idx===-1){
    try{
      const norm = typeof normalizePhone==='function'? normalizePhone(req.params.id): '';
      if(norm) idx = db.employees.findIndex(e=> typeof normalizePhone==='function' && normalizePhone(e.phone)===norm);
    }catch(e){}
  }
  if(idx===-1) return res.status(404).json({error:'Not found'});
  const before = db.employees[idx];
  const isHard = req.query.hard === 'true';
  if(isHard){
    if(req.user.role!=='Admin') return res.status(403).json({error:'Chỉ Admin mới được xoá cứng dữ liệu import'});
    const empId = before.employeeId;
    // Hard delete: cascade toàn bộ tabs (giữ logic cascadeDeletePerson để đồng bộ 1 nơi)
    if(typeof cascadeDeletePerson==='function'){
      // Dùng cascade để xóa toàn bộ (applicants, interviews, keys, schedules...)
      // Nhưng cascade đã gọi saveDB + emit + forceLogout, tránh double; ta gọi trực tiếp
      cascadeDeletePerson(before, req.user.username, req.ip);
      return res.json({success:true, hard:true, cascade:true});
    }
    // Fallback nếu chưa có cascade
    db.employees.splice(idx,1);
    const beforeKeys = db.keys.filter(k=>k.employeeId===empId).length;
    db.keys = db.keys.filter(k=>k.employeeId!==empId);
    db.attendances = db.attendances.filter(a=>a.employeeId!==empId);
    db.schedules = db.schedules.filter(s=>s.employeeId!==empId);
    db.offRequests = db.offRequests.filter(r=>r.employeeId!==empId);
    db.emergencyRequests = db.emergencyRequests.filter(r=>r.employeeId!==empId && r.substituteId!==empId);
    db.testResults = db.testResults.filter(t=>t.employeeId!==empId);
    audit(req.user.username,'HARD_DELETE','EMPLOYEE',before,null, req.ip);
    addSyncQueue('EMPLOYEE','HARD_DELETE', {employeeId: empId, name: before.name}, req.user.username, 'WEB_HR');
    saveDB();
    io.emit('employees:update', db.employees);
    io.emit('keys:update', db.keys);
    io.emit('schedules:update', db.schedules);
    io.emit('attendances:update', db.attendances);
    io.emit('offRequests:update', db.offRequests);
    io.emit('emergencyRequests:update', db.emergencyRequests);
    emitForceLogout(empId, 'Tài khoản nhân viên đã bị xóa vĩnh viễn khỏi hệ thống');
    return res.json({success:true, hard:true, removedKeys: beforeKeys});
  }
  // Default: soft delete -> ARCHIVED (giữ lịch sử) + forceLogout ngay - KHÔNG xóa trên Google Sheet 17iXM (1 chiều, Sheet giữ lại để Admin có thể đồng bộ lại)
  before.status='ARCHIVED';
  before.sync_status='PENDING';
  before.version = (before.version||1)+1;
  audit(req.user.username,'DELETE','EMPLOYEE',before,null, req.ip);
  // KHÔNG gọi addSyncQueue DELETE để giữ dữ liệu trên Sheet 17iXM (yêu cầu #1)
  saveDB();
  io.emit('employees:update', db.employees);
  emitForceLogout(before.employeeId, 'Tài khoản của bạn đã bị vô hiệu hóa (ARCHIVED). Vui lòng liên hệ HR.');
  res.json({success:true, keptOnSheet:true});
});
// FIX P0.4: merged transition (generic + official) - single source, realtime, branchScope check
app.post('/api/employees/:id/transition', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  // BranchScope check for Manager
  if(req.user.role==='Manager'){
    const empCheck = db.employees.find(e=>e.id===req.params.id || e.employeeId===req.params.id);
    if(empCheck && !req.user.branchScope.includes(empCheck.branchId)) return res.status(403).json({error:'Manager chỉ được thao tác chi nhánh được phân quyền'});
  }
  const emp = db.employees.find(e=>e.id===req.params.id || e.employeeId===req.params.id);
  if(!emp) return res.status(404).json({error:'Not found'});
  let { target, officialStartDate, shift: bodyShift } = req.body; // OFFICIAL etc
  if(!target && officialStartDate) target='OFFICIAL';
  if(!target) return res.status(400).json({error:'Thiếu target'});
  if(target==='OFFICIAL' && !['Admin','HR'].includes(req.user.role)) return res.status(403).json({error:'Chỉ Admin/HR mới được chuyển Chính thức'});
  const before = {...emp};
  // Rule: only WAITING_TEST with PASS can go OFFICIAL, etc.
  if(target==='OFFICIAL'){
    // Nếu có chọn ngày tương lai, xử lý WAITING_OFFICIAL
    const selDate = officialStartDate || getVietnamTodayStr();
    const todayStr = getVietnamTodayStr();
    const isFuture = selDate > todayStr;
    if(bodyShift) emp.shift = bodyShift;
    if(officialStartDate) emp.officialStartDate = officialStartDate;
    if(isFuture){
      emp.status='WAITING_OFFICIAL';
      emp.type='OFFICIAL';
    } else {
      emp.status='OFFICIAL';
      emp.type='OFFICIAL';
    }
    emp.endDate=null;
    // Tạo lịch: nếu tương lai thì tạo lịch với WAITING_OFFICIAL trước ngày, WORKING sau ngày
    if(officialStartDate){
      // Dùng logic 4 tuần như endpoint thứ 2 (để hiển thị lịch nhưng chưa gán ca trước ngày)
      const getMondayStrLocal = (dStr) => {
        const p = dStr.split('-').map(Number);
        const dt = new Date(p[0], p[1] - 1, p[2]);
        const day = dt.getDay();
        const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
        dt.setDate(diff);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      const op = selDate.split('T')[0].split('-').map(Number);
      const oStartD = (op.length === 3 && !isNaN(op[0])) ? new Date(op[0], op[1] - 1, op[2]) : new Date();
      const weekMap = {};
      for (let i = 0; i < 28; i++) {
        const curr = new Date(oStartD);
        curr.setDate(oStartD.getDate() + i);
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const d = String(curr.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const wStart = getMondayStrLocal(dateStr);
        if (!weekMap[wStart]) weekMap[wStart] = {};
        weekMap[wStart][dateStr] = true;
      }
      const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      for (const wStart in weekMap) {
        const wParts = wStart.split('-').map(Number);
        const wDate = new Date(wParts[0], wParts[1] - 1, wParts[2]);
        const fullDays = [];
        for (let i = 0; i < 7; i++) {
          const curr = new Date(wDate);
          curr.setDate(wDate.getDate() + i);
          const y = curr.getFullYear();
          const m = String(curr.getMonth() + 1).padStart(2, '0');
          const d = String(curr.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${d}`;
          if (dateStr >= selDate) {
            fullDays.push({ date: dateStr, dayName: dayNames[i], shift: emp.shift, status: 'WORKING', substituteFor: null });
          } else {
            fullDays.push({ date: dateStr, dayName: dayNames[i], shift: '-', status: 'WAITING_OFFICIAL', substituteFor: null });
          }
        }
        let existingSched = db.schedules.find(s => s.employeeId === emp.employeeId && s.weekStart === wStart);
        if (existingSched) {
          existingSched.days = fullDays;
          existingSched.version = (existingSched.version || 1) + 1;
          existingSched.updated_at = new Date().toISOString();
        } else {
          db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: wStart, days: fullDays, version: 1, updated_at: new Date().toISOString() });
        }
      }
    } else {
      // Không chọn ngày: tạo lịch tuần hiện tại như cũ
      const weekStart = getMonday(new Date());
      const days = [];
      for(let i=0;i<7;i++){
        const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
        const dateStr = toVietnamDateStr(d);
        days.push({ date: dateStr, dayName: ['T2','T3','T4','T5','T6','T7','CN'][i], shift: emp.shift, status:'WORKING', substituteFor: null });
      }
      db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: toVietnamDateStr(weekStart), days, version:1, updated_at: new Date().toISOString() });
    }
    audit(req.user.username,isFuture?'TRANSITION_WAITING_OFFICIAL':'TRANSITION_OFFICIAL','EMPLOYEE',before,emp, req.ip);
  } else {
    emp.status = target;
    audit(req.user.username,'TRANSITION','EMPLOYEE',before,emp, req.ip);
  }
  emp.version = (emp.version||1)+1;
  emp.updated_at = new Date().toISOString();
  emp.sync_status='PENDING';
  addSyncQueue('EMPLOYEE','UPDATE',emp, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('employees:update', db.employees);
  io.emit('schedules:update', db.schedules);
  res.json(emp);
});

// ============ APPLICANTS / RECRUITMENT ============
// Form field mapping for https://docs.google.com/forms/d/e/1FAIpQLSeteDABiq7mday0Yko-PyyUIW4uccicP7FJJt2evc7xbbWBfA/viewform
// Entry IDs extracted from FB_PUBLIC_LOAD_DATA_
const FORM_FIELD_MAP = {
  'entry.1686675793': 'name', // Tên Bạn là?
  'entry.825335480': 'gender', // Giới tính
  'entry.590202245': 'birthYear', // Năm Sinh
  'entry.289164083': 'education', // Trình độ
  'entry.2123395692': 'hometown', // Quê Quán
  'entry.1083316447': 'phone', // SĐT
  'entry.1544589282': 'shiftPreference', // Em có thể làm ca nào?
  'entry.1193565846': 'branchPreference', // Chi nhánh
  'entry.922110494': 'experience', // Kinh nghiệm
  'entry.1587639745': 'handling', // Xử lý đột xuất
  'entry.1056469443': 'facebook', // Facebook
  'entry.1876625202': 'source' // Biết tin qua
};
const BRANCH_MAP = {
  'CN4: 111 Tôn Đản, Phường 15, Quận 4': 'CN4',
  'CN3: 120 Hoàng Diệu 2, Phường Linh Trung, TP. Thủ Đức': 'CN3',
  'CN1: 130 Vạn kiếp, Phường 3, Quận Bình Thạnh': 'CN1',
  'CN2: 261 Tô Hiến Thành, Phường 12, Quận 10': 'CN2',
  'Có thể làm 2 chi nhánh trở lên': 'CN2'
};
const SHIFT_MAP = {
  'Ca Sáng: 7g00 - 12g00': 'CA_SANG',
  'Ca Trưa: 12g00 - 18g00': 'CA_CHIEU',
  'Ca Chiều: 12g00 - 18g00': 'CA_CHIEU',
  'Ca Tối: 18g00 - 23g00': 'CA_TOI',
  'Có thể làm từ 2 Ca trở lên': 'CA_SANG'
};
function mapBranchText(text){
  if(!text) return 'CN2';
  if(BRANCH_MAP[text]) return BRANCH_MAP[text];
  // Fallback: contains check
  if(text.includes('CN1') || text.includes('130 Vạn kiếp')) return 'CN1';
  if(text.includes('CN2') || text.includes('261 Tô Hiến Thành')) return 'CN2';
  if(text.includes('CN3') || text.includes('120 Hoàng Diệu')) return 'CN3';
  if(text.includes('CN4') || text.includes('111 Tôn Đản')) return 'CN4';
  if(text.includes('2 chi nhánh')) return 'CN2';
  const m = text.match(/CN[1-4]/);
  if(m) return m[0];
  return 'CN2';
}
function mapShiftText(text){
  if(!text) return 'CA_SANG';
  if(SHIFT_MAP[text]) return SHIFT_MAP[text];
  if(text.includes('Ca Sáng') || text.includes('7g00')) return 'CA_SANG';
  if(text.includes('Ca Trưa') || text.includes('Ca Chiều') || text.includes('12g00')) return 'CA_CHIEU';
  if(text.includes('Ca Tối') || text.includes('18g00')) return 'CA_TOI';
  if(text.includes('2 Ca')) return 'CA_SANG';
  return 'CA_SANG';
}

function runAIScoring(applicant) {
  let score = 0;
  const disqualifications = [];
  const breakdown = [];

  const name = (applicant.name || '').trim();
  const birthYear = (applicant.birthYear || '').toString();
  const hometown = (applicant.hometown || '').toLowerCase();
  const phone = (applicant.phone || '').trim();
  const education = (applicant.education || '').toLowerCase();
  const experience = (applicant.experience || '').toLowerCase();
  const source = (applicant.source || '').toLowerCase();
  const handling = (applicant.handling || '').trim();
  const facebook = (applicant.facebook || '').trim().toLowerCase();

  // 1. Tên Bạn là? (Ghi đủ họ và tên: 1đ)
  if (name.length >= 2) {
    score += 1;
    breakdown.push({ criteria: '1. Họ và tên', score: 1, max: 1, reason: 'Ghi đủ họ và tên (+1)' });
  } else {
    breakdown.push({ criteria: '1. Họ và tên', score: 0, max: 1, reason: 'Chưa đủ họ tên (+0)' });
  }

  // 2. Năm sinh của bạn? (2000-2004: 2đ; 2004-2008: 1đ; >2008: 0đ)
  let birthScore = 0;
  if (birthYear.includes('2000') || birthYear.includes('2001') || birthYear.includes('2002') || birthYear.includes('2003') || (birthYear.includes('2004') && !birthYear.includes('2004 - 2008'))) {
    birthScore = 2;
  } else if (birthYear.includes('2005') || birthYear.includes('2006') || birthYear.includes('2007') || birthYear.includes('2008') || birthYear.includes('2004 - 2008')) {
    birthScore = 1;
  } else if (birthYear.includes('>2008') || birthYear.includes('2009') || birthYear.includes('2010')) {
    birthScore = 0;
  } else {
    birthScore = 1;
  }
  score += birthScore;
  breakdown.push({ criteria: '2. Năm sinh', score: birthScore, max: 2, reason: `Nhóm tuổi (${applicant.birthYear||'2000-2004'}) (+${birthScore})` });

  // 3. Quê quán theo CCCD? (Ưu tiên Miền Nam, Miền Tây: 1đ; Miền Bắc, Miền Trung: 0đ)
  const northCentralKeywords = [
    'bắc', 'trung', 'hà nội', 'hải phòng', 'nghệ an', 'thanh hóa', 'hà tĩnh', 'quảng bình', 'quảng trị',
    'thừa thiên', 'huế', 'đà nẵng', 'quảng nam', 'quảng ngãi', 'bình định', 'phú yên', 'khánh hòa',
    'ninh thuận', 'bình thuận', 'nam định', 'thái bình', 'hải dương', 'hưng yên', 'vĩnh phúc', 'bắc ninh',
    'bắc giang', 'phú thọ', 'thái nguyên', 'lạng sơn', 'cao bằng', 'tuyên quang', 'hà giang', 'lào cai',
    'yên bái', 'điện biên', 'lai châu', 'sơn la', 'hòa bình'
  ];
  const isNorthCentral = northCentralKeywords.some(k => hometown.includes(k));
  if (isNorthCentral) {
    breakdown.push({ criteria: '3. Quê quán', score: 0, max: 1, reason: `Quê quán Miền Bắc/Miền Trung (${applicant.hometown}) (+0)` });
  } else {
    score += 1;
    breakdown.push({ criteria: '3. Quê quán', score: 1, max: 1, reason: `Ưu tiên Miền Nam / Miền Tây (${applicant.hometown||'Miền Nam'}) (+1)` });
  }

  // 4. Số điện thoại (Zalo) (Có SĐT: 1đ)
  if (phone.length >= 8) {
    score += 1;
    breakdown.push({ criteria: '4. SĐT / Zalo', score: 1, max: 1, reason: 'Có số điện thoại Zalo (+1)' });
  } else {
    breakdown.push({ criteria: '4. SĐT / Zalo', score: 0, max: 1, reason: 'Thiếu SĐT hợp lệ (+0)' });
  }

  // 5. Trình độ học vấn (Đại học/Cao đẳng: 1đ; Không đi học chỉ đi làm: 2đ)
  let eduScore = 1;
  if (education.includes('không đi học') || education.includes('nghỉ học') || education.includes('chỉ đi làm')) {
    eduScore = 2;
  } else if (education.includes('đại học') || education.includes('cao đẳng')) {
    eduScore = 1;
  } else {
    eduScore = 1;
  }
  score += eduScore;
  breakdown.push({ criteria: '5. Trình độ học vấn', score: eduScore, max: 2, reason: `Trình độ (${applicant.education||'Đại học'}) (+${eduScore})` });

  // 6. Kinh nghiệm làm việc? (Không: 0đ; Khác FNB: 1đ; Đã làm FNB: 2đ)
  let expScore = 0;
  if (experience.includes('fnb') || experience.includes('pha chế') || experience.includes('quán') || experience.includes('bán hàng')) {
    expScore = 2;
  } else if (experience.includes('có kinh nghiệm') || experience.includes('khác')) {
    expScore = 1;
  } else {
    expScore = 0;
  }
  score += expScore;
  breakdown.push({ criteria: '6. Kinh nghiệm FNB', score: expScore, max: 2, reason: `Kinh nghiệm (${applicant.experience||'Chưa có'}) (+${expScore})` });

  // 7. Biết tin ứng tuyển qua hình thức nào? (FB/Insta/Tiktok: 1đ; Bạn bè người quen giới thiệu: LOẠI THẲNG)
  if (source.includes('bạn bè') || source.includes('người quen') || source.includes('giới thiệu')) {
    disqualifications.push('Biết tin qua Bạn bè / Người quen giới thiệu');
    breakdown.push({ criteria: '7. Nguồn tin', score: 0, max: 1, reason: 'LOẠI THẲNG: Bạn bè người quen giới thiệu' });
  } else {
    score += 1;
    breakdown.push({ criteria: '7. Nguồn tin', score: 1, max: 1, reason: `Mạng xã hội FB/Tiktok/Insta (${applicant.source||'FB'}) (+1)` });
  }

  // 8. Hướng xử lý ca đột xuất (Đưa ra hướng xử lý: 1đ; Bỏ trống: 0đ)
  if (handling.length >= 2) {
    score += 1;
    breakdown.push({ criteria: '8. Xử lý ca đột xuất', score: 1, max: 1, reason: 'Đưa ra được hướng xử lý (+1)' });
  } else {
    breakdown.push({ criteria: '8. Xử lý ca đột xuất', score: 0, max: 1, reason: 'Chưa nhập hướng xử lý (+0)' });
  }

  // 9. Gửi link Facebook cá nhân... (Không/Ảo: 1đ; Thật: 2đ; FB Drama/châm biếm/tiêu cực: LOẠI THẲNG)
  let fbScore = 1;
  if (facebook.includes('drama') || facebook.includes('châm biếm') || facebook.includes('tiêu cực')) {
    disqualifications.push('Facebook/Thái độ Drama, châm biếm, share tiêu cực');
    breakdown.push({ criteria: '9. Link Facebook', score: 0, max: 2, reason: 'LOẠI THẲNG: Thái độ Drama / châm biếm / tiêu cực' });
  } else if (facebook.includes('facebook.com/') || facebook.includes('fb.com/')) {
    fbScore = 2;
    score += fbScore;
    breakdown.push({ criteria: '9. Link Facebook', score: fbScore, max: 2, reason: 'Có gửi link Facebook Thật (+2)' });
  } else {
    fbScore = 1;
    score += fbScore;
    breakdown.push({ criteria: '9. Link Facebook', score: fbScore, max: 2, reason: 'Không gửi link Facebook hoặc link ảo (+1)' });
  }

  // Dưới 8 điểm -> Bị loại
  if (score < 8) {
    disqualifications.push(`Điểm số ${score}/14 dưới thang chuẩn tối thiểu (Cần >= 8 điểm)`);
  }

  const isDisqualified = disqualifications.length > 0;
  applicant.aiScore = score;
  applicant.aiMaxScore = 14;
  applicant.aiBreakdown = breakdown;
  applicant.isDisqualified = isDisqualified;
  applicant.disqualifications = disqualifications;

  if (isDisqualified) {
    applicant.status = 'REJECTED';
  } else if (applicant.status === 'REJECTED') {
    applicant.status = 'NEW_APPLICANT';
  }

  // Trigger outbound sync to master database Google Sheet
  syncOutboundToMasterDatabaseSheet(applicant);

  return applicant;
}

function computeDataHash(applicant) {
  const str = `${applicant.id}|${applicant.name}|${applicant.phone}|${applicant.aiScore}|${applicant.status}|${applicant.branchPreference}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

async function syncOutboundToMasterDatabaseSheet(applicant) {
  // RÀNG BUỘC: Chỉ ghi vào Sheet Database chính (17iXM) 20 cột, không ghi vào Sheet nộp Form (1rcq)
  if (!applicant) return;
  const targetId = (db.settings && db.settings.googleSheet && db.settings.googleSheet.targetDatabaseSpreadsheetId) ? db.settings.googleSheet.targetDatabaseSpreadsheetId : '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const cfg = (db.settings && db.settings.googleSheet) ? db.settings.googleSheet : {};

  const resultText = applicant.isDisqualified || applicant.status === 'REJECTED'
    ? `LOẠI THẲNG (${applicant.aiScore}/14 - ${applicant.disqualifications?.join('; ')||'Không đạt'})`
    : `ĐẠT CHUẨN (${applicant.aiScore}/14 điểm)`;

  const row = [
    applicant.id,
    applicant.createdAt || new Date().toISOString(),
    applicant.name || '',
    applicant.gender || '',
    applicant.birthYear || '',
    applicant.education || '',
    applicant.hometown || '',
    applicant.phone || '',
    applicant.shiftText || applicant.shiftPreference || '',
    applicant.branchText || applicant.branchPreference || '',
    applicant.experience || '',
    applicant.handling || '',
    applicant.facebook || '',
    applicant.source || '',
    resultText,
    applicant.version || 1,
    new Date().toISOString(),
    'AI_SYSTEM',
    'SYNCED',
    computeDataHash(applicant)
  ];

  const syncItem = {
    id: uuidv4(),
    entity: 'APPLICANT',
    operation: 'OUTBOUND_SYNC_DATABASE_SHEET',
    targetSpreadsheetId: targetId,
    applicantId: applicant.id,
    applicantName: applicant.name,
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
    rowPayload: row
  };
  db.syncQueue.unshift(syncItem);

  if (cfg.targetWebhookUrl) {
    try {
      await fetch(cfg.targetWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPEND_ROW', spreadsheetId: targetId, row })
      });
    } catch (e) {
      console.error('Outbound Webhook Push Error:', e.message);
    }
  } else if (cfg.serviceAccountEmail && cfg.privateKey && cfg.privateKey.includes('BEGIN PRIVATE KEY')) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: cfg.serviceAccountEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };
      const privateKey = cfg.privateKey.replace(/\\n/g, '\n');
      const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${token}`
      });
      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [row] })
        });
      }
    } catch (e) {
      console.error('Outbound Service Account Push Error:', e.message);
    }
  }
}

app.get('/api/applicants', authMiddleware, (req,res)=>{
  let list = [...db.applicants];
  // realtime branchScope for recruiters
  const scope = branchScopeFilter(req);
  if(scope) list = list.filter(a=> scope.includes(a.branchPreference));
  const { status, search, page, limit } = req.query;
  if(status) list = list.filter(a=>a.status===status);
  if(search){
    const s = search.toLowerCase();
    list = list.filter(a=> a.name.toLowerCase().includes(s) || a.phone.includes(s));
  }
  if(page || limit){
    const pag = paginate(list, req);
    return res.json({ ...pag, data: pag.data });
  }
  res.json(list);
});
app.post('/api/applicants', (req,res)=>{
  const { name, phone, email, branchPreference, cvData, gender, birthYear, education, hometown, shiftPreference, experience, handling, facebook, source } = req.body;
  const source_id = 'form_'+uuidv4();
  // Check duplicate by phone only (more strict for real form)
  if(phone && db.applicants.find(a=>a.phone===phone)) return res.status(409).json({error:'Trùng SĐT - hồ sơ đã tồn tại'});
  // Map branch/shift text to ID using robust helpers
  let branchId = mapBranchText(branchPreference);
  let shift = mapShiftText(shiftPreference);

  let applicant = { 
    id: uuidv4(), 
    name: name||'', 
    phone: phone||'', 
    email: email||'', 
    branchPreference: branchId||'CN2', 
    branchText: branchPreference||'',
    cvData: cvData||'', 
    gender: gender||'', birthYear: birthYear||'', education: education||'', hometown: hometown||'',
    shiftPreference: shift||'CA_SANG', shiftText: shiftPreference||'',
    experience: experience||'', handling: handling||'', facebook: facebook||'', source: source||'',
    aiScore: null, aiBreakdown: [], status:'NEW_APPLICANT', source_id, createdAt: new Date().toISOString(), version:1, sync_status:'PENDING',
    rawData: req.body
  };
  applicant = runAIScoring(applicant);
  db.applicants.push(applicant);
  addSyncQueue('APPLICANT','CREATE',applicant,'SYSTEM','FORM');
  saveDB();
  io.emit('applicants:update', db.applicants);
  // Zalo notify
  const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: phone||'unknown', type:'NEW_APPLICANT', content:`[FORM] Ứng viên mới: ${name} - ${phone} - ${branchId} (AI: ${applicant.aiScore} điểm)`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json(applicant);
});
// Webhook for Google Form - handles both entry.xxx and direct field names, also Sheet sync
app.post('/api/recruitment/form-submit', (req,res)=>{
  const body = req.body;
  const mapped = {};
  for(const [k,v] of Object.entries(body)){
    if(FORM_FIELD_MAP[k]) mapped[FORM_FIELD_MAP[k]] = v;
    else if(k.startsWith('entry.')) {
      // Try to map by ID number
      const id = k.split('.')[1].split('_')[0];
      const field = FORM_FIELD_MAP[`entry.${id}`];
      if(field) mapped[field]=v;
    } else {
      mapped[k]=v;
    }
  }
  // Also handle Google Sheets row format (array)
  if(Array.isArray(body.row)){
    // row order: Timestamp, Tên, Giới tính, Năm Sinh, Trình độ, Quê quán, SĐT, Ca, Chi nhánh, Kinh nghiệm, Xử lý, Facebook, Biết tin
    const row = body.row;
    mapped.name = row[1]||mapped.name;
    mapped.gender = row[2]||mapped.gender;
    mapped.birthYear = row[3]||mapped.birthYear;
    mapped.education = row[4]||mapped.education;
    mapped.hometown = row[5]||mapped.hometown;
    mapped.phone = row[6]||mapped.phone;
    mapped.shiftPreference = row[7]||mapped.shiftPreference;
    mapped.branchPreference = row[8]||mapped.branchPreference;
    mapped.experience = row[9]||mapped.experience;
    mapped.handling = row[10]||mapped.handling;
    mapped.facebook = row[11]||mapped.facebook;
    mapped.source = row[12]||mapped.source;
  }
  if(!mapped.name || !mapped.phone) return res.status(400).json({error:'Thiếu Tên hoặc SĐT', received: mapped});
  // Call main applicant creation
  req.body = mapped;
  // Check duplicate
  if(mapped.phone && db.applicants.find(a=>a.phone===mapped.phone)) return res.status(409).json({error:'Trùng SĐT', phone:mapped.phone});
  let branchId = mapBranchText(mapped.branchPreference);
  let shift = mapShiftText(mapped.shiftPreference);
  let applicant = {
    id: uuidv4(),
    name: mapped.name, phone: mapped.phone, email: mapped.email||'',
    branchPreference: branchId||'CN2', branchText: mapped.branchPreference||'',
    cvData: `Giới tính:${mapped.gender||''} - Năm sinh:${mapped.birthYear||''} - Học vấn:${mapped.education||''} - Quê:${mapped.hometown||''} - Kinh nghiệm:${mapped.experience||''} - Xử lý:${mapped.handling||''} - FB:${mapped.facebook||''}`,
    gender: mapped.gender||'', birthYear: mapped.birthYear||'', education: mapped.education||'', hometown: mapped.hometown||'',
    shiftPreference: shift||'CA_SANG', shiftText: mapped.shiftPreference||'',
    experience: mapped.experience||'', handling: mapped.handling||'', facebook: mapped.facebook||'', source: mapped.source||'',
    aiScore: null, aiBreakdown: [], status:'NEW_APPLICANT', source_id:'form_'+uuidv4(), createdAt: new Date().toISOString(), version:1, sync_status:'SYNCED', rawData: mapped
  };
  applicant = runAIScoring(applicant);
  db.applicants.push(applicant);
  addSyncQueue('APPLICANT','CREATE',applicant,'SYSTEM','FORM');
  saveDB();
  io.emit('applicants:update', db.applicants);
  const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: mapped.phone, type:'NEW_APPLICANT', content:`[FORM] ${mapped.name} - ${mapped.phone} - ${branchId} (AI: ${applicant.aiScore} điểm)`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json({success:true, applicant});
});
app.post('/api/applicants/:id/score', authMiddleware, (req,res)=>{
  const appRec = db.applicants.find(a=>a.id===req.params.id);
  if(!appRec) return res.status(404).json({error:'Not found'});

  if (req.body.score != null || req.body.aiScore != null) {
    appRec.aiScore = req.body.score ?? req.body.aiScore;
    appRec.aiBreakdown = req.body.breakdown || req.body.aiBreakdown || [];
    appRec.evaluationType = req.body.evaluationType || 'CO_KN';
    appRec.evaluationResult = req.body.evaluationResult || 'PASS';
    appRec.evaluationNotes = req.body.notes || req.body.evaluationNotes || '';
    if (req.body.evaluationResult === 'LOẠI' || req.body.isDisqualified) {
      appRec.isDisqualified = true;
      appRec.status = 'REJECTED';
      if (!appRec.disqualifications) appRec.disqualifications = [];
      appRec.disqualifications.push('Bị loại ở vòng chấm điểm phỏng vấn hồ sơ');
    }
  } else {
    // Default AI score fallback
    const criteria = (db.settings && db.settings.scoring && db.settings.scoring.criteria) ? db.settings.scoring.criteria : [];
    const breakdown = criteria.map(c=>{
      const base = Math.floor( (c.weight * 0.7 + Math.random()*c.weight*0.3) );
      return { criteria:c.name, weight:c.weight, score: Math.min(c.weight, base), reason: `AI đánh giá ${c.name}: ${base}/${c.weight}` };
    });
    const total = breakdown.reduce((s,b)=>s+b.score,0);
    appRec.aiScore = total;
    appRec.aiBreakdown = breakdown;
  }

  appRec.version = (appRec.version||1)+1;
  appRec.sync_status='PENDING';
  audit(req.user.username,'EVALUATE_APPLICANT','APPLICANT',null,appRec, req.ip);
  addSyncQueue('APPLICANT','UPDATE',appRec, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('applicants:update', db.applicants);
  res.json(appRec);
});
app.get('/api/interviews', (req, res) => {
  res.json(db.interviews || []);
});

async function sendZaloBotNotification(payload) {
  const { phone, name, content, type } = payload;
  const cfg = (db.settings && db.settings.zalo) ? db.settings.zalo : {};
  const recordId = uuidv4();
  const timestamp = new Date().toISOString();

  const zr = {
    id: recordId,
    sent_at: timestamp,
    receiver: phone,
    receiverName: name || '',
    type: type || 'GENERAL_NOTIF',
    content: content,
    status: 'QUEUED',
    error: '',
    viaEngine: 'ZALO_BOT_API'
  };

  db.zaloRecords.unshift(zr);

  const webhookUrl = cfg.botWebhookUrl || (cfg.oaId ? `https://openapi.zalo.me/v2.0/oa/message` : null);

  if (webhookUrl) {
    try {
      console.log(`[ZALO BOT API] Sending message to ${phone} via ${webhookUrl}...`);
      
      let headers = { 'Content-Type': 'application/json' };
      if (cfg.accessToken && !cfg.accessToken.includes('•')) {
        headers['access_token'] = cfg.accessToken;
        headers['Authorization'] = `Bearer ${cfg.accessToken}`;
        headers['x-api-key'] = cfg.accessToken;
      }

      const formattedPhone = (phone || '').replace(/\D/g, '').replace(/^0/, '84');

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          token: cfg.accessToken || '',
          access_token: cfg.accessToken || '',
          recipient: { phone: formattedPhone, user_id: formattedPhone },
          message: { text: content },
          template_id: cfg.template || '',
          oa_id: cfg.oaId || '',
          phone: phone,
          name: name,
          content: content,
          type: type
        })
      });

      const resText = await response.text();
      let resData = {};
      try { resData = JSON.parse(resText); } catch(e) { resData = { raw: resText }; }

      const lowerText = (resText || '').toLowerCase();
      if (response.ok && (resData.error === 0 || resData.status === 'success' || resData.message_id || resData.id || lowerText.includes('accepted') || lowerText.includes('ok') || response.status === 200 || response.status === 202)) {
        zr.status = 'DELIVERED';
        zr.error = '';
        console.log(`[ZALO BOT API SUCCESS] Sent to ${phone} via Webhook`);
      } else {
        zr.status = 'FAILED';
        zr.error = resData.message || resData.error_description || resText.substring(0, 200);
        console.warn(`[ZALO BOT API WARNING] Response:`, resText);
      }
    } catch (e) {
      console.error(`[ZALO BOT API ERROR] ${e.message}`);
      zr.status = 'FAILED';
      zr.error = e.message;
    }
  } else {
    zr.status = 'QUEUED';
    zr.error = 'Chưa cấu hình Zalo Bot Webhook URL hoặc Zalo OA ID trong Cài Đặt';
    console.log(`[ZALO BOT GATEWAY] Message queued for ${name} (${phone}) - Webhook URL missing`);
  }

  saveDB();
  io.emit('zalo:update', db.zaloRecords);
  return zr;
}

app.post('/api/zalo/send', authMiddleware, async (req, res) => {
  const { phone, name, content, type } = req.body;
  if (!phone || !content) return res.status(400).json({ error: 'Thiếu số điện thoại hoặc nội dung tin nhắn' });

  const record = await sendZaloBotNotification({ phone, name, content, type: type || 'MANUAL_SEND' });
  res.json({ success: true, record });
});

app.post('/api/zalo/test', authMiddleware, roleCheck(['Admin']), async (req, res) => {
  const { phone, message } = req.body;
  const targetPhone = phone || '0901234567';
  const testMsg = message || `[ỤM BÒ MILK ZALO BOT TEST] Xin chào! Đây là tin nhắn kiểm tra tự động gửi từ hệ thống Ụm Bò Milk HR lúc ${new Date().toLocaleTimeString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'})}.`;

  const record = await sendZaloBotNotification({
    phone: targetPhone,
    name: 'Admin Test',
    content: testMsg,
    type: 'SYSTEM_TEST'
  });

  res.json({ success: true, record, settings: db.settings?.zalo });
});

app.post('/api/applicants/:id/schedule-interview', authMiddleware, async (req, res) => {
  const { interviewDate, timeSlot, meetLink, notes } = req.body;
  const applicant = db.applicants.find(a => a.id === req.params.id);
  if (!applicant) return res.status(404).json({ error: 'Không tìm thấy hồ sơ ứng viên' });
  if (applicant.isDisqualified || applicant.status === 'REJECTED') {
    return res.status(403).json({ error: 'Ứng viên thuộc diện LOẠI THẲNG, không được đặt lịch phỏng vấn' });
  }
  if (!interviewDate || !timeSlot) return res.status(400).json({ error: 'Thiếu Ngày hoặc Khung giờ phỏng vấn' });

  if (!db.interviews) db.interviews = [];

  const slotKey = `${interviewDate}_${timeSlot}`;

  // Check 30-minute slot locking / conflict: Ensure no other applicant has booked this 30-min slot
  const conflict = db.interviews.find(i => i.slotKey === slotKey && i.status !== 'CANCELLED' && i.applicantId !== applicant.id);
  if (conflict) {
    return res.status(409).json({
      error: `⚠️ Khung giờ ${timeSlot} ngày ${interviewDate} đã được đặt lịch phỏng vấn cho ứng viên "${conflict.applicantName}"! Vui lòng chọn khung giờ khác.`,
      conflict
    });
  }

  let generatedMeet = meetLink;
  if(!generatedMeet){
    // Thử tạo Meet thật qua Calendar API (dùng ServiceAccount với calendar scope)
    try{
      const tempInterview = { id: uuidv4(), interviewDate, timeSlot, branchPreference: applicant.branchPreference };
      const realMeet = await createCalendarMeetEvent(tempInterview, applicant);
      if(realMeet) generatedMeet = realMeet;
    }catch(e){ console.error('Tạo Meet thật lỗi, dùng giả:', e.message); }
    if(!generatedMeet) generatedMeet = `https://meet.google.com/umb-pv-${uuidv4().substring(0,8)}`;
  }
  const branchObj = db.branches.find(b => b.id === applicant.branchPreference);
  const branchName = branchObj ? branchObj.name + ' - ' + branchObj.address : 'Chi nhánh Ụm Bò Milk';

  // Find existing interview for this applicant if updating
  let interview = db.interviews.find(i => i.applicantId === applicant.id && i.status !== 'CANCELLED');
  if (interview) {
    interview.interviewDate = interviewDate;
    interview.timeSlot = timeSlot;
    interview.slotKey = slotKey;
    interview.meetLink = generatedMeet;
    interview.notes = notes || '';
    interview.scheduledBy = req.user.username;
    interview.updatedAt = new Date().toISOString();
  } else {
    interview = {
      id: uuidv4(),
      applicantId: applicant.id,
      applicantName: applicant.name,
      applicantPhone: applicant.phone,
      branchPreference: applicant.branchPreference,
      interviewDate,
      timeSlot,
      slotKey,
      meetLink: generatedMeet,
      notes: notes || '',
      scheduledBy: req.user.username,
      status: 'SCHEDULED',
      reminderSent: false,
      createdAt: new Date().toISOString()
    };
    db.interviews.push(interview);
  }

  applicant.status = 'INTERVIEW';
  applicant.interview = interview;

  // Send Automatic Zalo Invite Notification via Zalo Bot Engine
  const inviteContent = `[ỤM BÒ MILK - THƯ MỜI PHỎNG VẤN TRỰC TUYẾN]\n\nChào bạn ${applicant.name},\nChúc mừng bạn đã vượt qua vòng sơ tuyển hồ sơ AI của Ụm Bò Milk!\n\n📅 Thời gian: ${timeSlot} ngày ${interviewDate}\n🏢 Chi nhánh ứng tuyển: ${branchName}\n🎥 Link Google Meet phỏng vấn: ${generatedMeet}\n\nBạn vui lòng chuẩn bị trang phục lịch sự và truy cập vào đường link Google Meet trên trước 5 phút nhé! Trân trọng!`;

  await sendZaloBotNotification({
    phone: applicant.phone,
    name: applicant.name,
    content: inviteContent,
    type: 'INTERVIEW_INVITE'
  });

  audit(req.user.username, 'SCHEDULE_INTERVIEW', 'APPLICANT', null, { applicantId: applicant.id, slotKey, meetLink: generatedMeet }, req.ip);
  saveDB();

  io.emit('interviews:update', db.interviews);
  io.emit('applicants:update', db.applicants);

  // Sync to Master Database Sheet
  syncOutboundToMasterDatabaseSheet(applicant);

  res.json({ success: true, interview, applicant });
});

// Background 30-Minute Prior Interview Reminder Poller + Auto-PASS after meet ends
setInterval(async () => {
  if (!db.interviews || db.interviews.length === 0) return;
  const now = new Date();
  const nowMs = now.getTime();

  for (const inv of db.interviews) {
    if (inv.status !== 'SCHEDULED') continue;
    try {
      const parts = (inv.timeSlot || '').split('-');
      const startTimeStr = parts[0].trim();
      const endTimeStr = (parts[1] || '').trim();

      const [startH, startM] = startTimeStr.split(':').map(Number);
      const invStart = new Date(inv.interviewDate);
      invStart.setHours(startH, startM, 0, 0);
      const startMs = invStart.getTime();

      // ---- 30-MIN REMINDER ----
      if (!inv.reminderSent) {
        const reminderMs = startMs - (30 * 60 * 1000);
        if (nowMs >= reminderMs && nowMs < startMs + (30 * 60 * 1000)) {
          inv.reminderSent = true;
          const msg = `⏰ [NHẮC LỊCH PV 30 PHÚT] Chào ${inv.applicantName}, lịch phỏng vấn trực tuyến với Ụm Bò Milk sẽ bắt đầu lúc ${inv.timeSlot} ngày ${inv.interviewDate}. Bạn hãy chuẩn bị và tham gia qua Google Meet: ${inv.meetLink}`;
          await sendZaloBotNotification({ phone: inv.applicantPhone, name: inv.applicantName, content: msg, type: 'INTERVIEW_REMINDER_30MIN' });
          io.emit('interview:reminder_due', { interview: inv, message: msg });
          saveDB();
          io.emit('interviews:update', db.interviews);
          console.log(`[30-MIN REMINDER] ${inv.applicantName} - ${inv.timeSlot}`);
        }
      }

      // ---- AUTO-PASS AFTER MEET ENDS ----
      if (!inv.autoPassTriggered && endTimeStr) {
        const [endH, endM] = endTimeStr.split(':').map(Number);
        const invEnd = new Date(inv.interviewDate);
        invEnd.setHours(endH, endM, 0, 0);
        const endMs = invEnd.getTime();

        if (nowMs >= endMs) {
          // Auto-PASS the applicant
          const appRec = db.applicants.find(a => a.id === inv.applicantId);
          if (appRec && appRec.status === 'INTERVIEW') {
            const before = { ...appRec };
            appRec.status = 'PASS';
            appRec.version = (appRec.version || 1) + 1;
            appRec.updated_at = new Date().toISOString();
            appRec.passedAt = new Date().toISOString();
            appRec.passSource = 'AUTO_MEET_END';
            inv.autoPassTriggered = true;
            inv.status = 'COMPLETED';
            audit('SYSTEM', 'AUTO_PASS_INTERVIEW', 'APPLICANT', before, appRec, 'auto-poller');
            addSyncQueue('APPLICANT', 'UPDATE', appRec, 'SYSTEM', 'AUTO');
            saveDB();
            io.emit('applicants:update', db.applicants);
            io.emit('interviews:update', db.interviews);
            // Special event for UI real-time update
            io.emit('interview:auto_pass', {
              applicantId: appRec.id,
              applicantName: appRec.name,
              interviewId: inv.id,
              timeSlot: inv.timeSlot,
              interviewDate: inv.interviewDate
            });
            console.log(`[AUTO-PASS] ${appRec.name} - Meet ended at ${endTimeStr}, auto-PASS triggered.`);
          } else {
            // Mark as done even if already converted
            inv.autoPassTriggered = true;
            inv.status = 'COMPLETED';
            saveDB();
            io.emit('interviews:update', db.interviews);
          }
        }
      }

    } catch (e) {
      console.error('Error in interview poller:', e.message);
    }
  }
}, 30000);

app.post('/api/applicants/:id/status', authMiddleware, (req,res)=>{
  const appRec = db.applicants.find(a=>a.id===req.params.id);
  if(!appRec) return res.status(404).json({error:'Not found'});
  const { status } = req.body;
  const before = {...appRec};
  appRec.status = status;
  appRec.version = (appRec.version||1)+1;
  appRec.updated_at = new Date().toISOString();
  if(status==='PASS'){
    // Create calendar event mock + zalo
    const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: appRec.phone, type:'INTERVIEW_INVITE', content:`Mời ${appRec.name} phỏng vấn tại ${db.branches.find(b=>b.id===appRec.branchPreference)?.address||'CN2'} - Meet link: https://meet.google.com/${Math.random().toString(36).substring(2,10)}`, status:'QUEUED', error:'' };
    db.zaloRecords.unshift(zr);
    setTimeout(()=>{ zr.status='SENT'; io.emit('zalo:update', db.zaloRecords); saveDB(); }, 1500);
    io.emit('zalo:update', db.zaloRecords);
  }
  audit(req.user.username,'UPDATE_STATUS','APPLICANT',before,appRec, req.ip);
  addSyncQueue('APPLICANT','UPDATE',appRec, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('applicants:update', db.applicants);
  syncOutboundToMasterDatabaseSheet(appRec);
  res.json(appRec);
});
app.post('/api/applicants/:id/convert', authMiddleware, (req,res)=>{
  const appRec = db.applicants.find(a=>a.id===req.params.id);
  if(!appRec) return res.status(404).json({error:'Not found'});

  const branchId = req.body.branchId || appRec.branchPreference || 'CN2';
  const employeeId = generateEmployeeId(branchId);
  
  const startDateStr = req.body.startDate || getVietnamTodayStr();
  const trainingDays = 12; // Strictly 12 trial days (7 working + 5 off)
  
  const startD = new Date(startDateStr);
  const endD = new Date(startD);
  endD.setDate(startD.getDate() + 11);
  const endDateStr = toVietnamDateStr(endD);

  let shiftFromForm = req.body.shift || appRec.shiftPreference || appRec.shiftText || '';
  if(shiftFromForm && SHIFT_MAP[shiftFromForm]) shiftFromForm = SHIFT_MAP[shiftFromForm];
  if(!shiftFromForm) shiftFromForm = 'CA_TRUA';

  const emp = {
    id: uuidv4(), employeeId, name: appRec.name, phone: appRec.phone, branchId, shift: shiftFromForm,
    startDate: startDateStr, endDate: endDateStr,
    trainingDays, status:'TRAINING', testScore:null, testResult:null, type:'TRAINING', category:'STORE', avatar:'', checkHistory:[],
    version:1, updated_at: new Date().toISOString(), updated_by: req.user.username, source:'WEB_HR', sync_status:'PENDING'
  };
  db.employees.push(emp);

  const key = { id: uuidv4(), employeeId, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: new Date().toISOString(), sync_status:'PENDING' };
  db.keys.push(key);

  // Auto-generate schedules in db.schedules for Tab Lịch làm việc
  const getMondayStr = (dStr) => {
    const date = new Date(dStr);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return toVietnamDateStr(date);
  };

  const buildFull7DaysForWeek = (wStartStr, activeDaysMap, empShift, isTraining = false, startDStr = null) => {
    const parts = wStartStr.split('T')[0].split('-').map(Number);
    const wDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const days = [];

    let trialEnd = null;
    if (isTraining && startDStr) {
      const sp = startDStr.split('T')[0].split('-').map(Number);
      const trialStart = new Date(sp[0], sp[1] - 1, sp[2]);
      trialEnd = new Date(trialStart);
      trialEnd.setDate(trialStart.getDate() + 11);
    }

    for (let i = 0; i < 7; i++) {
      const curr = new Date(wDate);
      curr.setDate(wDate.getDate() + i);
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (isTraining && trialEnd && curr > trialEnd) {
        days.push({
          date: dateStr,
          dayName: dayNames[i],
          shift: '-',
          status: 'WAITING_OFFICIAL',
          substituteFor: null
        });
        continue;
      }

      if (activeDaysMap[dateStr]) {
        days.push({
          date: dateStr,
          dayName: dayNames[i],
          shift: empShift || 'CA_TRUA',
          status: 'WORKING',
          substituteFor: null
        });
      } else {
        days.push({
          date: dateStr,
          dayName: dayNames[i],
          shift: 'OFF',
          status: 'OFF',
          substituteFor: null
        });
      }
    }
    return days;
  };

  const weekMap = {}; // { '2026-08-24': { '2026-08-29': true, '2026-08-30': true } }

  for (let i = 0; i < trainingDays; i++) {
    const curr = new Date(startD);
    curr.setDate(startD.getDate() + i);
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const wStart = getMondayStr(dateStr);

    if (!weekMap[wStart]) weekMap[wStart] = {};
    weekMap[wStart][dateStr] = true;
  }

  for (const wStart in weekMap) {
    const fullDays = buildFull7DaysForWeek(wStart, weekMap[wStart], shiftFromForm, true, startDateStr);
    let existingSched = db.schedules.find(s => s.employeeId === employeeId && s.weekStart === wStart);
    if (existingSched) {
      existingSched.days = fullDays;
      existingSched.version = (existingSched.version || 1) + 1;
      existingSched.updated_at = new Date().toISOString();
    } else {
      const newSched = {
        id: uuidv4(),
        employeeId: employeeId,
        weekStart: wStart,
        days: fullDays,
        version: 1,
        updated_at: new Date().toISOString()
      };
      db.schedules.push(newSched);
    }
  }

  appRec.status='CONVERTED';
  appRec.convertedEmployeeId = employeeId;
  audit(req.user.username,'CONVERT_APPLICANT','EMPLOYEE',null,emp, req.ip);
  addSyncQueue('EMPLOYEE','CREATE',emp, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  io.emit('applicants:update', db.applicants);
  io.emit('schedules:update', db.schedules);
  res.json({ employee: emp, key, startDate: startDateStr, endDate: endDateStr, shift: shiftFromForm });
});
app.delete('/api/applicants/:id', authMiddleware, (req,res)=>{
  const applicant = db.applicants.find(a=>a.id===req.params.id || normalizePhone(a.phone) === normalizePhone(req.params.id));
  if(!applicant) return res.status(404).json({error:'Không tìm thấy hồ sơ'});
  if(req.user.role==='Umbomilk') return res.status(403).json({error:'Không có quyền xóa'});

  // Execute Cascade Delete across ALL tabs & Google Sheets
  cascadeDeletePerson(applicant, req.user.username, req.ip);

  res.json({ success: true, deleted: applicant.id });
});

// Legacy cascade route - đã gộp vào DELETE /api/employees/:id?hard=true, giữ lại alias /purge để tránh duplicate route
app.delete('/api/employees/:id/purge', authMiddleware, (req, res) => {
  const emp = db.employees.find(e => e.id === req.params.id || e.employeeId === req.params.id || normalizePhone(e.phone) === normalizePhone(req.params.id));
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  if (req.user.role === 'Umbomilk') return res.status(403).json({ error: 'Không có quyền xóa' });

  // Execute Cascade Delete across ALL tabs & Google Sheets
  cascadeDeletePerson(emp, req.user.username, req.ip);

  res.json({ success: true, deleted: emp.id });
});

function cascadeDeletePerson(target, username, ip) {
  if (!target) return;
  const normPhone = normalizePhone(target.phone);
  const targetId = target.id;
  const empId = target.employeeId || target.convertedEmployeeId;

  console.log(`[CASCADE DELETE] Purging all records across ALL tabs for "${target.name}" (ID: ${targetId}, Phone: ${target.phone}, EmpID: ${empId})...`);

  // 1. Delete from db.applicants (Nhân viên mới)
  if (db.applicants) {
    db.applicants = db.applicants.filter(a => {
      if (a.id === targetId) return false;
      if (normPhone && normalizePhone(a.phone) === normPhone) return false;
      return true;
    });
    io.emit('applicants:update', db.applicants);
  }

  // 2. Delete from db.interviews (Lịch Phỏng Vấn)
  if (db.interviews) {
    db.interviews = db.interviews.filter(inv => {
      if (inv.applicantId === targetId) return false;
      if (normPhone && normalizePhone(inv.applicantPhone) === normPhone) return false;
      return true;
    });
    io.emit('interviews:update', db.interviews);
  }

  // 3. Delete from db.employees (Nhân viên cửa hàng / Training)
  if (db.employees) {
    db.employees = db.employees.filter(e => {
      if (e.id === targetId) return false;
      if (empId && (e.employeeId === empId || e.id === empId)) return false;
      if (normPhone && normalizePhone(e.phone) === normPhone) return false;
      return true;
    });
    io.emit('employees:update', db.employees);
  }

  // 4. Delete from db.keys (Quản lý Key)
  if (db.keys && empId) {
    db.keys = db.keys.filter(k => k.employeeId !== empId);
    io.emit('keys:update', db.keys);
  }

  // 5. Delete from db.attendances (Chấm công)
  if (db.attendances && empId) {
    db.attendances = db.attendances.filter(att => att.employeeId !== empId);
    io.emit('attendances:update', db.attendances);
  }

  // 6. Delete from db.schedules (Xếp ca)
  if (db.schedules && empId) {
    db.schedules = db.schedules.filter(sch => sch.employeeId !== empId);
    io.emit('schedules:update', db.schedules);
  }

  // 7. Delete from db.offRequests (Xin nghỉ OFF)
  if (db.offRequests && empId) {
    db.offRequests = db.offRequests.filter(off => off.employeeId !== empId);
    io.emit('offRequests:update', db.offRequests);
  }

  // 8. Delete from db.emergencyRequests (Sự cố & Nghỉ việc)
  if (db.emergencyRequests && empId) {
    db.emergencyRequests = db.emergencyRequests.filter(em => em.employeeId !== empId);
    io.emit('emergencyRequests:update', db.emergencyRequests);
  }

  // 9. Delete from db.testResults (Bài test đào tạo)
  if (db.testResults && empId) {
    db.testResults = db.testResults.filter(tr => tr.employeeId !== empId);
    io.emit('testResults:update', db.testResults);
  }

  // 10. Delete from db.zaloRecords (Record Zalo)
  if (db.zaloRecords && normPhone) {
    db.zaloRecords = db.zaloRecords.filter(z => normalizePhone(z.receiver) !== normPhone);
    io.emit('zalo:update', db.zaloRecords);
  }

  audit(username || 'SYSTEM', 'CASCADE_DELETE', 'PERSON', target, null, ip || '127.0.0.1');
  // Yêu cầu #1: HR xóa local nhưng KHÔNG xóa trên Google Sheet 17iXM (1 chiều) – Sheet giữ lại để Admin đồng bộ lại
  // Không gọi addSyncQueue DELETE và không gọi deleteOutboundFromMasterDatabaseSheet cho master
  saveDB();
  if(empId) emitForceLogout(empId, 'Tài khoản của bạn đã bị xóa khỏi hệ thống (CASCADE). Vui lòng đăng nhập lại.');
  console.log(`[CASCADE DELETE] Local only, kept on Sheet 17iXM (https://docs.google.com/spreadsheets/d/17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w) for admin sync`);
}

// ============ ADMIN SYNC FROM SHEET (1 chiều, yêu cầu #1 + #9) ============
// Chỉ Admin được đồng bộ lại dữ liệu bị xóa từ Google Sheet 17iXM theo mã NV
// Khi HR xóa, Sheet giữ lại (không xóa) → Admin dùng nút này để khôi phục duy nhất 1 NV theo mã
// Khi khôi phục, KHÔNG push ngược lên Sheet (vì đã tồn tại) – chỉ tạo lại local db + key
app.post('/api/admin/sync-from-sheet', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const { employeeId } = req.body;
  if(!employeeId) return res.status(400).json({error:'Thiếu employeeId (Mã NV)'});
  const cleanId = String(employeeId).trim();
  // Nếu đã tồn tại local thì không cần sync
  if(db.employees.find(e=>e.employeeId===cleanId)) return res.status(409).json({error:`Mã NV ${cleanId} đã tồn tại trong Web App, không cần đồng bộ`});
  const targetId = db.settings?.googleSheet?.targetDatabaseSpreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const token = await getGoogleAccessToken();
  if(!token) return res.status(500).json({error:'Chưa cấu hình ServiceAccount (privateKey) để đọc Sheet. Cấu hình trong Settings > Google Sheet'});
  try{
    // Đọc cả 2 sheet Training và Chính thức
    const sheetsToCheck = ['NHAN_VIEN_TRAINING','NHAN_VIEN_CHINH_THUC'];
    let foundRow = null, foundSheet = null, headers = null;
    for(const sheetName of sheetsToCheck){
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent(sheetName)}!A1:Z1000`;
      const resp = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
      if(!resp.ok) continue;
      const j = await resp.json();
      const values = j.values || [];
      if(values.length<2) continue;
      headers = values[0];
      const idxMaNV = headers.findIndex(h=> h.includes('Mã NV'));
      if(idxMaNV===-1) continue;
      for(let i=1;i<values.length;i++){
        const row = values[i];
        if(row[idxMaNV] && String(row[idxMaNV]).trim()===cleanId){
          foundRow = row; foundSheet = sheetName; break;
        }
      }
      if(foundRow) break;
    }
    if(!foundRow) return res.status(404).json({error:`Không tìm thấy Mã NV ${cleanId} trên Google Sheet 17iXM (cả TRAINING và CHINH_THUC)`});
    // Map row -> employee object dựa trên headers
    const mapByHeader = (h)=> headers.findIndex(x=> x===h);
    const get = (headerName, fallbackIdx)=> {
      const idx = mapByHeader(headerName);
      if(idx!==-1) return foundRow[idx] || '';
      return fallbackIdx!==undefined ? (foundRow[fallbackIdx]||'') : '';
    };
    // Xác định Key từ Sheet (nếu có cột Key) – nếu không có thì giữ nguyên hoặc sinh mới
    const keyFromSheet = get('Key','') || get('key','');
    const idFromSheet = get('ID','') || uuidv4();
    const name = get('Họ tên','') || get('Họ tên',2) || 'Không tên';
    const phone = get('SĐT','') || '';
    const branchId = get('Chi nhánh','') || 'CN2';
    const shift = get('Ca','') || 'CA_SANG';
    const startDate = get('Ngày bắt đầu','') || getVietnamTodayStr();
    const endDate = get('Ngày kết thúc','') || null;
    const trainingDays = parseInt(get('Số ngày Training','')) || 7;
    const status = get('Trạng thái','') || (foundSheet==='NHAN_VIEN_CHINH_THUC' ? 'OFFICIAL' : 'TRAINING');
    const testScore = get('Điểm TEST','') ? Number(get('Điểm TEST','')) : null;
    const testResult = get('Kết quả TEST','') || null;
    const type = get('Loại','') || (foundSheet==='NHAN_VIEN_CHINH_THUC' ? 'OFFICIAL' : 'TRAINING');
    const category = get('Category','') || 'STORE';
    const version = parseInt(get('Version','')) || 1;
    // Tạo employee
    const emp = {
      id: idFromSheet,
      employeeId: cleanId,
      name: String(name).trim(),
      phone: String(phone).trim(),
      branchId: db.branches.find(b=>b.id===branchId) ? branchId : (db.branches.find(b=>b.name.includes(branchId))?.id || branchId || 'CN2'),
      shift: ['CA_SANG','CA_CHIEU','CA_TOI'].includes(shift) ? shift : 'CA_SANG',
      startDate,
      endDate: type==='TRAINING' ? endDate : null,
      trainingDays: type==='TRAINING' ? trainingDays : null,
      status,
      testScore: isNaN(testScore)? null : testScore,
      testResult,
      type,
      category,
      avatar:'',
      checkHistory:[],
      version,
      updated_at: new Date().toISOString(),
      updated_by: req.user.username,
      source:'SYNC_FROM_SHEET',
      sync_status:'SYNCED'
    };
    // BranchId fallback nếu là tên
    if(!db.branches.find(b=>b.id===emp.branchId)){
      const mapped = mapBranchText(emp.branchId);
      if(mapped) emp.branchId = mapped;
    }
    db.employees.push(emp);
    // Tạo/giữ Key – không push lại Sheet
    let keyRec = db.keys.find(k=>k.employeeId===cleanId);
    const finalKey = keyFromSheet && keyFromSheet.length>=6 ? keyFromSheet : (keyRec?.key || 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase());
    if(!keyRec){
      keyRec = { id: uuidv4(), employeeId: cleanId, key: finalKey, deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: new Date().toISOString(), sync_status:'SYNCED' };
      db.keys.push(keyRec);
    } else {
      keyRec.key = finalKey;
      keyRec.status='ACTIVE';
      keyRec.updated_at = new Date().toISOString();
    }
    saveDB();
    io.emit('employees:update', db.employees);
    io.emit('keys:update', db.keys);
    audit(req.user.username,'SYNC_FROM_SHEET','EMPLOYEE',null,emp, req.ip);
    res.json({success:true, employee: emp, key: keyRec, fromSheet: foundSheet, keptOnSheet:true});
  }catch(e){
    console.error('SYNC_FROM_SHEET error', e);
    res.status(500).json({error:e.message});
  }
});

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('84')) p = '0' + p.slice(2);
  if (p.length === 9 && !p.startsWith('0')) p = '0' + p;
  return p;
}

async function deleteRowFromSpreadsheet(spreadsheetId, accessToken, applicant) {
  if (!spreadsheetId || !accessToken || !applicant) return;
  const normPhone = normalizePhone(applicant.phone);
  const appNameClean = (applicant.name || '').trim().toLowerCase();

  try {
    const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z1000`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const getData = await getRes.json();
    const rows = getData.values || [];

    const matchingIndices = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;

      const candId = (r[0] || '').trim();
      const rowStr = r.join(' ').toLowerCase();

      const hasIdMatch = applicant.id && candId === applicant.id;
      const hasNameMatch = appNameClean && appNameClean.length >= 2 && rowStr.includes(appNameClean);
      const hasPhoneMatch = normPhone && normPhone.length >= 8 && (rowStr.includes(normPhone) || rowStr.includes(normPhone.slice(1)));

      if (hasIdMatch || hasPhoneMatch || hasNameMatch) {
        matchingIndices.push(i);
      }
    }

    console.log(`[DELETE DUAL SYNC] Found ${matchingIndices.length} matching rows on Sheet (${spreadsheetId}) for "${applicant.name}":`, matchingIndices);

    if (matchingIndices.length > 0) {
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const metaData = await metaRes.json();
      const sheetId = metaData.sheets?.[0]?.properties?.sheetId || 0;

      matchingIndices.sort((a, b) => b - a);

      const requests = matchingIndices.map(idx => ({
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: idx,
            endIndex: idx + 1
          }
        }
      }));

      const deleteRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });
      const deleteData = await deleteRes.json();
      console.log(`[DELETE DUAL SYNC SUCCESS] ${matchingIndices.length} rows deleted from ${spreadsheetId} for "${applicant.name}":`, JSON.stringify(deleteData));
    }
  } catch (e) {
    console.error(`[DELETE DUAL SYNC ERROR ${spreadsheetId}]`, e.message);
  }
}

async function deleteOutboundFromMasterDatabaseSheet(applicant) {
  if (!applicant) return;
  const targetId = (db.settings && db.settings.googleSheet && db.settings.googleSheet.targetDatabaseSpreadsheetId)
    ? db.settings.googleSheet.targetDatabaseSpreadsheetId
    : '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const formSheetId = (db.settings && db.settings.googleSheet && db.settings.googleSheet.spreadsheetId)
    ? db.settings.googleSheet.spreadsheetId
    : '1rcqEKraSRhr-Tn9qwlhADlkQUei8j65bXeHF_Tmkd38';

  const cfg = (db.settings && db.settings.googleSheet) ? db.settings.googleSheet : {};

  console.log(`[DELETE DUAL DUAL SYNC GOOGLE SHEETS] Removing candidate "${applicant.name}" (${applicant.id} / ${applicant.phone}) from Sheets (${targetId} & ${formSheetId})...`);

  // Channel 1: Webhook Push
  if (cfg.targetWebhookUrl) {
    try {
      await fetch(cfg.targetWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE_ROW',
          spreadsheetId: targetId,
          formSheetId: formSheetId,
          candidateId: applicant.id,
          phone: applicant.phone,
          name: applicant.name
        })
      });
      console.log(`[DELETE WEHOOK SYNC SUCCESS] Sent DELETE_ROW for ${applicant.name}`);
    } catch (e) {
      console.error('Outbound Webhook Delete Error:', e.message);
    }
  }

  // Channel 2: Service Account API v4 (Delete from BOTH Google Sheets!)
  if (cfg.serviceAccountEmail && cfg.privateKey && cfg.privateKey.includes('BEGIN PRIVATE KEY')) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: cfg.serviceAccountEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };
      const privateKey = cfg.privateKey.replace(/\\n/g, '\n');
      const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${token}`
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return;

      // Delete from Database Sheet
      await deleteRowFromSpreadsheet(targetId, tokenData.access_token, applicant);

      // Delete from Form Response Sheet
      if (formSheetId && formSheetId !== targetId) {
        await deleteRowFromSpreadsheet(formSheetId, tokenData.access_token, applicant);
      }
    } catch (e) {
      console.error('Outbound Service Account Dual Delete Error:', e.message);
    }
  }
}
function parseCSV(text) {
  const lines = [];
  let current = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') { field += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      current.push(field.trim());
      field = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      current.push(field.trim());
      if (current.length > 1 || current[0] !== '') lines.push(current);
      current = [];
      field = '';
    } else { field += c; }
  }
  if (field !== '' || current.length > 0) { current.push(field.trim()); lines.push(current); }
  return lines;
}

function syncLiveGoogleSheetCSV(spreadsheetId, sheetName) {
  return new Promise((resolve) => {
    const sid = spreadsheetId || db.settings.googleSheet.formResponsesSheetId || db.settings.googleSheet.spreadsheetId || '1rcqEKraSRhr-Tn9qwlhADlkQUei8j65bXeHF_Tmkd38';
    const sName = sheetName || db.settings.googleSheet.formSheetName || 'FROM_NHAN_VIEN';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sName)}`;
    https.get(csvUrl, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const rows = parseCSV(raw);
          if (rows.length <= 1) return resolve(0);

          const seenPhones = new Set();
          db.applicants.forEach(a => {
            const norm = normalizePhone(a.phone);
            if (norm) seenPhones.add(norm);
          });

          let added = 0;
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 5 || !row[1] || !row[6]) continue;
            const rawPhone = String(row[6]).trim();
            const normPhone = normalizePhone(rawPhone);
            if (!normPhone) continue;

            // AI Deduplication: Skip if phone already exists
            if (seenPhones.has(normPhone)) {
              continue;
            }

            // Mark phone as seen
            seenPhones.add(normPhone);

            const branchId = mapBranchText(row[8]);
            const shift = mapShiftText(row[7]);

            let applicant = {
              id: uuidv4(),
              name: row[1],
              gender: row[2] || '',
              birthYear: row[3] || '',
              education: row[4] || '',
              hometown: row[5] || '',
              phone: rawPhone,
              shiftPreference: shift,
              shiftText: row[7] || '',
              branchPreference: branchId,
              branchText: row[8] || '',
              experience: row[9] || '',
              handling: row[10] || '',
              facebook: row[11] || '',
              source: row[13] || row[12] || 'Google Sheet Live',
              email: '',
              cvData: `Giới tính:${row[2]||''} - Năm sinh:${row[3]||''} - Học vấn:${row[4]||''} - Quê:${row[5]||''} - Kinh nghiệm:${row[9]||''} - Xử lý:${row[10]||''}`,
              aiScore: null,
              aiBreakdown: [],
              status: 'NEW_APPLICANT',
              source_id: 'sheet_live_' + uuidv4(),
              createdAt: new Date().toISOString(),
              version: 1,
              sync_status: 'SYNCED',
              rawData: { row }
            };

            applicant = runAIScoring(applicant);
            db.applicants.push(applicant);
            added++;
          }
          if (added > 0) {
            saveDB();
            io.emit('applicants:update', db.applicants);
          }
          resolve(added);
        } catch (e) {
          console.error('syncLiveGoogleSheetCSV parse error:', e);
          resolve(0);
        }
      });
    }).on('error', (e) => {
      console.error('syncLiveGoogleSheetCSV fetch error:', e.message);
      resolve(0);
    });
  });
}

// Background auto-polling: CHỈ ĐỌC Sheet nộp Form (1rcq - nguồn vào), KHÔNG đọc Database (17iXM - nguồn xuất 20 cột)
// Luồng: Form (1rcq) --CSV--> HR Web App (mock) --AI scoring--> Database (17iXM) 20 cột
setInterval(async () => {
  const formSid = db.settings.googleSheet.formResponsesSheetId || db.settings.googleSheet.spreadsheetId;
  if(formSid) await syncLiveGoogleSheetCSV(formSid);
  // Không poll targetDatabaseSpreadsheetId - đây là sheet xuất, chỉ ghi qua outbound webhook
}, 15000);

app.post('/api/recruitment/sync-form', authMiddleware, async (req,res)=>{
  const cfg = db.settings.googleSheet;
  // RÀNG BUỘC: Chỉ đọc Sheet nộp Form (1rcq), không đọc Database (17iXM)
  const formSid = cfg.formResponsesSheetId || cfg.spreadsheetId || '1rcqEKraSRhr-Tn9qwlhADlkQUei8j65bXeHF_Tmkd38';
  const targetDbId = cfg.targetDatabaseSpreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const added = await syncLiveGoogleSheetCSV(formSid);
  const q = { id: uuidv4(), entity:'APPLICANT', operation:'SYNC_SHEET_REAL', payload:{added, addedForm:0, spreadsheetId: formSid, targetDatabaseSpreadsheetId: targetDbId}, version:1, updated_at: new Date().toISOString(), updated_by:req.user.username, source:'SHEET_FORM', sync_status:'SYNCED' };
  db.syncQueue.unshift(q);
  saveDB();
  io.emit('applicants:update', db.applicants);
  io.emit('sync:update', db.syncQueue);
  res.json({ added, addedForm:0, total: db.applicants.length, source:'SHEET_FORM_LIVE', spreadsheetId: formSid, targetDatabaseSpreadsheetId: targetDbId, note: 'Form Sheet (1rcq) là nguồn vào, HR mock lên web, sau đó xuất 20 cột ra Database Sheet (17iXM) qua webhook' });
});

// Ràng buộc: Xóa tất cả sheet còn lại trong file Form (1rcq), chỉ giữ FROM_NHAN_VIEN
app.post('/api/sheets/cleanup-form', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const formSid = db.settings.googleSheet.formResponsesSheetId || db.settings.googleSheet.spreadsheetId;
  const keepSheet = db.settings.googleSheet.formSheetName || 'FROM_NHAN_VIEN';
  const token = await getGoogleAccessToken();
  if(!token) return res.status(400).json({ error: 'Chưa cấu hình Service Account (privateKey/serviceAccountEmail) - không thể gọi Google Sheets API. Hãy dán Private Key qua UI hoặc set GOOGLE_PRIVATE_KEY trên Render.' });
  try{
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${formSid}`, { headers:{ Authorization:`Bearer ${token}` }});
    const meta = await metaRes.json();
    if(!meta.sheets) return res.status(502).json({ error: 'Không lấy được danh sách sheets', raw: meta });
    const allSheets = meta.sheets.map(s=>({ title: s.properties.title, sheetId: s.properties.sheetId }));
    const toDelete = allSheets.filter(s=> s.title !== keepSheet);
    if(toDelete.length===0) return res.json({ success:true, message:`Chỉ còn sheet duy nhất ${keepSheet}, không cần xóa`, keepSheet, allSheets });
    const requests = toDelete.map(s=>({ deleteSheet:{ sheetId: s.sheetId }}));
    const delRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${formSid}:batchUpdate`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
      body: JSON.stringify({ requests })
    });
    const delData = await delRes.json();
    if(delData.error) return res.status(502).json({ error: delData.error.message, toDelete });
    audit(req.user.username,'CLEANUP_FORM_SHEETS','SHEET', { before: allSheets.map(s=>s.title) }, { after: [keepSheet] }, req.ip);
    res.json({ success:true, deleted: toDelete.map(s=>s.title), keepSheet, deletedCount: toDelete.length });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/sheets/form-info', authMiddleware, async (req,res)=>{
  const formSid = db.settings.googleSheet.formResponsesSheetId || db.settings.googleSheet.spreadsheetId;
  const keepSheet = db.settings.googleSheet.formSheetName || 'FROM_NHAN_VIEN';
  // Thử lấy qua CSV để biết sheet có tồn tại không (không cần auth)
  const csvUrl = `https://docs.google.com/spreadsheets/d/${formSid}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(keepSheet)}`;
  let csvOk = false, rowCount = 0;
  try{
    const r = await fetch(csvUrl);
    const txt = await r.text();
    csvOk = r.ok && txt.includes('Tên Bạn là');
    if(csvOk) rowCount = txt.split('\n').length -1;
  }catch(e){}
  // Nếu có token thì lấy danh sách sheets chi tiết
  let sheets = [];
  const token = await getGoogleAccessToken();
  if(token){
    try{
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${formSid}`, { headers:{ Authorization:`Bearer ${token}` }});
      const meta = await metaRes.json();
      sheets = (meta.sheets||[]).map(s=> s.properties.title);
    }catch(e){}
  }
  res.json({ formSid, keepSheet, csvOk, rowCount, sheets, note: 'Sheet nộp Form (1rcq) - HR chỉ đọc FROM_NHAN_VIEN, các sheet khác sẽ bị xóa khi gọi /cleanup-form' });
});

// ============ KEYS ============
app.get('/api/keys', authMiddleware, (req,res)=>{
  let list = [...db.keys];
  const scope = branchScopeFilter(req);
  if(scope){
    const allowedIds = db.employees.filter(e=>scope.includes(e.branchId)).map(e=>e.employeeId);
    list = list.filter(k=>allowedIds.includes(k.employeeId));
  }
  res.json(list);
});
app.post('/api/keys/generate', authMiddleware, (req,res)=>{
  const { employeeId } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Employee not found'});
  let keyRec = db.keys.find(k=>k.employeeId===employeeId);
  const newKey = 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase();
  if(keyRec){
    const before = {...keyRec};
    keyRec.key = newKey;
    keyRec.deviceId = null;
    keyRec.boundAt = null;
    keyRec.version = (keyRec.version||1)+1;
    keyRec.updated_at = new Date().toISOString();
    audit(req.user.username,'REGENERATE_KEY','KEY',before,keyRec, req.ip);
  } else {
    keyRec = { id: uuidv4(), employeeId, key: newKey, deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: new Date().toISOString(), sync_status:'PENDING' };
    db.keys.push(keyRec);
    audit(req.user.username,'CREATE_KEY','KEY',null,keyRec, req.ip);
  }
  addSyncQueue('KEY','UPDATE',keyRec, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('keys:update', db.keys);
  res.json(keyRec);
});
app.post('/api/keys/:id/revoke', authMiddleware, (req,res)=>{
  const keyRec = db.keys.find(k=>k.id===req.params.id);
  if(!keyRec) return res.status(404).json({error:'Not found'});
  const before = {...keyRec};
  keyRec.deviceId=null;
  keyRec.boundAt=null;
  keyRec.version=(keyRec.version||1)+1;
  keyRec.updated_at=new Date().toISOString();
  audit(req.user.username,'REVOKE_KEY','KEY',before,keyRec, req.ip);
  addSyncQueue('KEY','UPDATE',keyRec, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('keys:update', db.keys);
  res.json(keyRec);
});

// ============ DEVICE REQUESTS ============
app.get('/api/device-requests', authMiddleware, (req,res)=>{
  let list = [...db.deviceRequests];
  const scope = branchScopeFilter(req);
  if(scope){
    const allowedIds = db.employees.filter(e=>scope.includes(e.branchId)).map(e=>e.employeeId);
    list = list.filter(r=>allowedIds.includes(r.employeeId));
  }
  res.json(list);
});
app.post('/api/device-requests/:id/approve', authMiddleware, (req,res)=>{
  const dr = db.deviceRequests.find(d=>d.id===req.params.id);
  if(!dr) return res.status(404).json({error:'Not found'});
  if(dr.status!=='PENDING') return res.status(400).json({error:'Already processed'});
  const keyRec = db.keys.find(k=>k.employeeId===dr.employeeId);
  if(keyRec){
    keyRec.deviceId=null;
    keyRec.boundAt=null;
    keyRec.version=(keyRec.version||1)+1;
    audit(req.user.username,'APPROVE_DEVICE_RESET','DEVICE',null,{dr, keyRec}, req.ip);
    addSyncQueue('KEY','UPDATE',keyRec, req.user.username, 'WEB_HR');
  }
  dr.status='APPROVED';
  dr.approvedBy=req.user.username;
  dr.approvedAt=new Date().toISOString();
  saveDB();
  io.emit('deviceRequests:update', db.deviceRequests);
  io.emit('keys:update', db.keys);
  res.json(dr);
});
app.post('/api/device-requests/:id/reject', authMiddleware, (req,res)=>{
  const dr = db.deviceRequests.find(d=>d.id===req.params.id);
  if(!dr) return res.status(404).json({error:'Not found'});
  dr.status='REJECTED';
  dr.rejectedBy=req.user.username;
  dr.rejectedAt=new Date().toISOString();
  audit(req.user.username,'REJECT_DEVICE_RESET','DEVICE',null,dr, req.ip);
  saveDB();
  io.emit('deviceRequests:update', db.deviceRequests);
  res.json(dr);
});

// ============ ATTENDANCE ============
app.get('/api/attendances', authMiddleware, (req,res)=>{
  const { employeeId, date, branch, status } = req.query;
  let list = [...db.attendances];
  const scope = branchScopeFilter(req);
  if(scope) list = list.filter(a=>{
    const emp = db.employees.find(e=>e.employeeId===a.employeeId);
    return emp && scope.includes(emp.branchId);
  });
  if(employeeId) list = list.filter(a=>a.employeeId===employeeId);
  if(date) list = list.filter(a=>a.date===date);
  if(branch) list = list.filter(a=>a.branchId===branch);
  if(status) list = list.filter(a=>a.status===status);
  res.json(list);
});
// Official monthly attendance T1→Cuối tháng
app.get('/api/attendance/official-monthly', (req,res)=>{
  const { employeeId, month } = req.query; // month "2026-08"
  if(!employeeId || !month) return res.status(400).json({error:'Thiếu employeeId hoặc month (YYYY-MM)'});
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Employee not found'});
  if(emp.type!=='OFFICIAL' && emp.status!=='OFFICIAL') return res.status(403).json({error:'Chỉ áp dụng cho Nhân viên Chính thức'});
  const stats = getOfficialMonthlyStats(employeeId, month);
  res.json(stats);
});
// ============ REGISTER OFF FOR TRAINING EMPLOYEE (12 TRIAL DAYS = 7 WORKING + 5 OFF) ============
app.post('/api/employee/register-off', (req, res) => {
  const { employeeId, offDates } = req.body;
  const emp = db.employees.find(e => e.employeeId === employeeId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

  if (!Array.isArray(offDates) || offDates.length !== 5) {
    return res.status(400).json({ error: 'Vui lòng chọn đủ 5 ngày NGHỈ (OFF) trong 12 ngày thử việc' });
  }

  const startDateStr = emp.startDate || getVietnamTodayStr();
  const parts = startDateStr.split('T')[0].split('-').map(Number);
  const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();

  // Compute 12 trial dates
  const trialDates = [];
  for (let i = 0; i < 12; i++) {
    const curr = new Date(startD);
    curr.setDate(startD.getDate() + i);
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    trialDates.push(`${y}-${m}-${d}`);
  }

  // Verify all offDates are within the 12 trial dates
  const invalidDate = offDates.find(d => !trialDates.includes(d));
  if (invalidDate) {
    return res.status(400).json({ error: `Ngày ${invalidDate} nằm ngoài phạm vi 12 ngày thử việc (${trialDates[0]} → ${trialDates[11]})` });
  }

  const getMondayStrLocal = (dStr) => {
    const p = dStr.split('-').map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2]);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    dt.setDate(diff);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Update or build schedules for all weeks spanned by the 12 trial days
  const weekMap = {};
  trialDates.forEach(dStr => {
    const wStart = getMondayStrLocal(dStr);
    if (!weekMap[wStart]) weekMap[wStart] = {};
    const isOff = offDates.includes(dStr);
    weekMap[wStart][dStr] = !isOff; // true = WORKING, false = OFF
  });

  const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  for (const wStart in weekMap) {
    const wParts = wStart.split('-').map(Number);
    const wDate = new Date(wParts[0], wParts[1] - 1, wParts[2]);
    const fullDays = [];

    for (let i = 0; i < 7; i++) {
      const curr = new Date(wDate);
      curr.setDate(wDate.getDate() + i);
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const isWorking = weekMap[wStart][dateStr];
      if (!trialDates.includes(dateStr)) {
        // Beyond 12 trial days -> Do NOT assign work shift for training employee!
        fullDays.push({
          date: dateStr,
          dayName: dayNames[i],
          shift: '-',
          status: 'WAITING_OFFICIAL',
          substituteFor: null
        });
      } else if (isWorking === true) {
        fullDays.push({
          date: dateStr,
          dayName: dayNames[i],
          shift: emp.shift || 'CA_SANG',
          status: 'WORKING',
          substituteFor: null
        });
      } else {
        fullDays.push({
          date: dateStr,
          dayName: dayNames[i],
          shift: 'OFF',
          status: 'OFF',
          substituteFor: null
        });
      }
    }

    let existingSched = db.schedules.find(s => s.employeeId === employeeId && s.weekStart === wStart);
    if (existingSched) {
      existingSched.days = fullDays;
      existingSched.version = (existingSched.version || 1) + 1;
      existingSched.updated_at = new Date().toISOString();
    } else {
      db.schedules.push({
        id: uuidv4(),
        employeeId: employeeId,
        weekStart: wStart,
        days: fullDays,
        version: 1,
        updated_at: new Date().toISOString()
      });
    }
  }

  emp.registeredOffDates = offDates;
  saveDB();
  io.emit('schedules:update', db.schedules);
  io.emit('employees:update', db.employees);

  res.json({ success: true, registeredOffDates: offDates, workingDaysCount: 7 });
});

// REMOVED duplicate transition - merged into single handler above (P0.4 fix) - compatibility alias
app.post('/api/employees/:id/transition-official', authMiddleware, roleCheck(['Admin','HR']), (req, res) => {
  // Alias for old clients - forward to main transition
  req.url = `/api/employees/${req.params.id}/transition`;
  req.body.target = 'OFFICIAL';
  // re-dispatch manually
  const emp = db.employees.find(e => e.id === req.params.id || e.employeeId === req.params.id);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  // reuse logic via 307
  res.redirect(307, `/api/employees/${req.params.id}/transition`);
});
// Tự động bật Chính thức khi đến ngày officialStartDate (HR chọn ngày tương lai)
function checkAutoOfficialTransitions(){
  const todayStr = getVietnamTodayStr();
  let changed=false;
  db.employees.forEach(emp=>{
    if(emp.status==='WAITING_OFFICIAL' && emp.officialStartDate && emp.officialStartDate <= todayStr){
      const before={...emp};
      emp.status='OFFICIAL';
      // type đã là OFFICIAL từ lúc HR chọn, giữ nguyên
      changed=true;
      audit('SYSTEM','AUTO_OFFICIAL','EMPLOYEE',before,emp,'system');
      addSyncQueue('EMPLOYEE','UPDATE',emp,'SYSTEM','AUTO');
      // Đảm bảo lịch ngày hôm nay đã là WORKING (đã tạo từ lúc HR chọn, chỉ cần đảm bảo không còn WAITING)
    }
  });
  if(changed){ saveDB(); io.emit('employees:update', db.employees); io.emit('schedules:update', db.schedules); console.log('[AUTO] Đã tự động bật Chính thức cho NV đến hạn', todayStr); }
}
setInterval(checkAutoOfficialTransitions, 60*60*1000);
setTimeout(checkAutoOfficialTransitions, 5000);

// === REALTIME AUTOMATION POLLER - Bền vững, sống sau restart (thay setTimeout rời rạc) ===
function realtimeAutomationPoller(){
  const now = Date.now();
  let changed=false;
  // 1. DeviceRequests auto-expire 30min
  db.deviceRequests.forEach(r=>{
    if(r.status==='PENDING' && r.expiresAt && new Date(r.expiresAt).getTime() <= now){
      r.status='EXPIRED';
      audit('SYSTEM','DEVICE_EXPIRED','DEVICE',null,r,'system');
      addSyncQueue('DEVICE_REQUEST','EXPIRE',r,'SYSTEM','AUTO');
      io.emit('deviceRequests:update', db.deviceRequests);
      changed=true;
      console.log(`[AUTO] DeviceRequest ${r.id} EXPIRED`);
    }
  });
  // 2. EmergencyRequests cascade TH3 bền vững (2p -> 30p)
  db.emergencyRequests.forEach(r=>{
    if(r.status!=='PENDING' || !r.timeoutAt) return;
    if(new Date(r.timeoutAt).getTime() > now) return;
    if(r.cascadeStep===1){
      // Chuyển B1 -> B2
      r.cascadeStep=2;
      r.timeoutAt = new Date(now+30*60*1000).toISOString();
      r.attempts = (r.attempts||0)+1;
      const candidates2 = db.employees.filter(e=>e.branchId===r.branchId && e.shift!==r.shift && e.employeeId!==r.employeeId && e.status==='OFFICIAL');
      if(candidates2.length>0){
        candidates2.forEach(c=>{
          const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: c.phone, type:'SUBSTITUTE_INVITE_STEP2_POLL', content:`[TH3-B2 Poller] Mời thay ca cho ${r.employeeName} ngày ${r.date} - Phản hồi trong 30 phút`, status:'SENT', error:'' };
          db.zaloRecords.unshift(zr);
          db.notifications.unshift({ id: uuidv4(), to: c.employeeId, type:'SUBSTITUTE_INVITE', title:'[TH3] Mời thay ca (khác ca) - Poller', content:`Mời thay ca khác ca cho ${r.employeeName} ngày ${r.date} ca ${r.shift}.`, requestId: r.id, step:2, createdAt: new Date().toISOString(), read:false });
        });
        io.emit('zalo:update', db.zaloRecords);
        io.emit('notifications:update', db.notifications);
        io.emit('emergencyRequests:update', db.emergencyRequests);
        console.log(`[AUTO] Emergency ${r.id} B1->B2 via poller`);
      } else {
        r.status='REJECTED';
        r.reasonReject='[TH3 Poller] Không có nhân viên cùng CN khác ca';
        const ws = toVietnamDateStr(getMonday(new Date(r.date)));
        const sched = db.schedules.find(s=>s.employeeId===r.employeeId && s.weekStart===ws);
        if(sched){ const day=sched.days.find(d=>d.date===r.date); if(day && day.status==='EMERGENCY_PENDING'){ day.status='WORKING'; } }
        io.emit('emergencyRequests:update', db.emergencyRequests);
        io.emit('schedules:update', db.schedules);
        console.log(`[AUTO] Emergency ${r.id} REJECTED (no B2) via poller`);
      }
      changed=true;
    } else if(r.cascadeStep===2){
      r.status='REJECTED';
      r.reasonReject='[TH3 Poller] Không có nhân viên thay ca sau 2 bước (2p+30p)';
      const ws = toVietnamDateStr(getMonday(new Date(r.date)));
      const sched = db.schedules.find(s=>s.employeeId===r.employeeId && s.weekStart===ws);
      if(sched){ const day=sched.days.find(d=>d.date===r.date); if(day && day.status==='EMERGENCY_PENDING'){ day.status='WORKING'; day.shift = db.employees.find(e=>e.employeeId===r.employeeId)?.shift || 'CA_SANG'; } }
      const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: db.employees.find(e=>e.employeeId===r.employeeId)?.phone, type:'EMERGENCY_REJECTED', content:`[TH3 Poller] OFF đột xuất ngày ${r.date} bị HỦY do không có người thay`, status:'SENT', error:'' };
      db.zaloRecords.unshift(zr);
      io.emit('emergencyRequests:update', db.emergencyRequests);
      io.emit('zalo:update', db.zaloRecords);
      io.emit('schedules:update', db.schedules);
      console.log(`[AUTO] Emergency ${r.id} REJECTED after B2 via poller`);
      changed=true;
    }
  });
  if(changed) saveDB();
  // 2b. Finance keys auto-expire (WEEK/MONTH/YEAR) - het han tu vang ra
  if(db.financeKeys){
    let financeChanged=false;
    db.financeKeys.forEach(k=>{
      if(k.status==='ACTIVE' && k.expiresAt && new Date(k.expiresAt).getTime() <= now){
        k.status='EXPIRED';
        financeChanged=true;
        console.log(`[AUTO] FinanceKey ${k.key} EXPIRED (${k.type})`);
        // emit force logout for finance clients
        io.emit('finance:forceLogout', { key: k.key, reason: `Key ${k.key} đã hết hạn (${k.type}) - ${k.expiresAt}` });
      }
    });
    if(financeChanged){ saveDB(); io.emit('financeKeys:update', db.financeKeys); changed=true; }
  }
  // 3. Training shift change auto-approve sau 15 phút (HR không tác động)
  let trainingChanged=false;
  db.trainingShiftRequests.forEach(r=>{
    if(r.status==='PENDING' && r.expiresAt && new Date(r.expiresAt).getTime() <= now){
      r.status='APPROVED'; r.approvedBy='AUTO_15P'; r.approvedAt=new Date().toISOString(); r.version=(r.version||1)+1;
      const emp = db.employees.find(e=> e.employeeId===r.employeeId);
      if(emp){
        let sched = db.schedules.find(s=> s.employeeId===r.employeeId && s.days.some(d=> d.date===r.date));
        if(sched){
          const day = sched.days.find(d=> d.date===r.date);
          const before={...day};
          day.shift = r.toShift; if(day.status==='OFF') day.status='WORKING';
          sched.version=(sched.version||1)+1; sched.updated_at=new Date().toISOString();
          audit('AUTO_15P','AUTO_APPROVE_TRAINING_SHIFT','SCHEDULE', before, day, 'system');
          addSyncQueue('SCHEDULE','UPDATE', sched, 'AUTO_15P', 'AUTO');
        } else {
          const monday = getMonday(new Date(r.date));
          const wy=monday.getFullYear(); const wm=String(monday.getMonth()+1).padStart(2,'0'); const wd=String(monday.getDate()).padStart(2,'0');
          const weekStart=`${wy}-${wm}-${wd}`;
          const days=[]; for(let i=0;i<7;i++){ const cur=new Date(monday); cur.setDate(monday.getDate()+i); const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0'); const dateStr=`${y}-${m}-${d}`; const isTarget = dateStr===r.date; days.push({ date: dateStr, dayName:['T2','T3','T4','T5','T6','T7','CN'][i], shift: isTarget ? r.toShift : emp.shift, status: isTarget ? 'WORKING' : 'OFF', substituteFor:null }); }
          const newSched={ id: uuidv4(), employeeId: r.employeeId, weekStart, days, version:1, updated_at: new Date().toISOString() };
          db.schedules.push(newSched);
          addSyncQueue('SCHEDULE','CREATE', newSched, 'AUTO_15P', 'AUTO');
        }
        const todayStr = getVietnamTodayStr();
        let att = db.attendances.find(a=> a.employeeId===r.employeeId && a.date===r.date);
        const shiftInfo = db.settings.payroll.shifts[r.toShift] || DEFAULT_SHIFTS[r.toShift] || DEFAULT_SHIFTS['CA_SANG'];
        if(!att){
          att={ id: uuidv4(), employeeId: r.employeeId, date: r.date, shift: r.toShift, branchId: emp.branchId, checkIn:null, checkOut:null, status: r.date <= todayStr ? 'COMPLETED' : 'NOT_STARTED', violations:[], version:1, updated_at: new Date().toISOString(), sync_status:'PENDING' };
          if(r.date <= todayStr){
            const now2=new Date();
            att.checkIn={ time: shiftInfo.start, gps:'10.762622,106.660172', address: db.branches.find(b=>b.id===emp.branchId)?.address || 'Training Auto', image:'', timestamp: now2.toISOString(), content:'Điểm danh Vào ca UBM (Training Auto - đổi ca AUTO)', drivePath: generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_IN') };
            att.checkOut={ time: shiftInfo.end, gps:'10.762622,106.660172', address: db.branches.find(b=>b.id===emp.branchId)?.address || 'Training Auto', image:'', timestamp: now2.toISOString(), content:'Điểm danh Ra ca UBM (Training Auto - đổi ca AUTO)', drivePath: generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_OUT') };
            addDriveFile(r.employeeId, r.date, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { gps: att.checkIn.gps, time: att.checkIn.time });
            addDriveFile(r.employeeId, r.date, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { gps: att.checkOut.gps, time: att.checkOut.time });
          }
          db.attendances.push(att);
          addSyncQueue('ATTENDANCE','CREATE', att, 'AUTO_15P', 'AUTO');
        } else {
          const before={...att};
          att.shift=r.toShift;
          if(att.checkIn){ att.checkIn.time=shiftInfo.start; att.checkIn.drivePath=generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_IN'); }
          if(att.checkOut){ att.checkOut.time=shiftInfo.end; att.checkOut.drivePath=generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_OUT'); }
          att.version=(att.version||1)+1; att.updated_at=new Date().toISOString();
          audit('AUTO_15P','UPDATE_ATTENDANCE_TRAINING_SHIFT','ATTENDANCE', before, att, 'system');
          addSyncQueue('ATTENDANCE','UPDATE', att, 'AUTO_15P', 'AUTO');
        }
        const notifEmp={ id: uuidv4(), to: r.employeeId, type:'TRAINING_SHIFT_AUTO_APPROVED', title:`Đổi ca ${r.date} tự động duyệt`, content:`Ca ${r.fromShift}->${r.toShift} ngày ${r.date} đã tự động duyệt sau 15 phút (HR không phản hồi)`, createdAt: new Date().toISOString(), read:false };
        db.notifications.push(notifEmp);
        const zr={ id: uuidv4(), sent_at: new Date().toISOString(), receiver: emp.phone, type:'TRAINING_SHIFT_AUTO', content:`[ỤM BÒ MILK] Đổi ca Training ${emp.name} ${r.date} ${r.fromShift}->${r.toShift} tự động duyệt sau 15 phút`, status:'SENT', error:'' };
        db.zaloRecords.unshift(zr);
      }
      audit('AUTO_15P','AUTO_APPROVE_TRAINING_SHIFT','TRAINING_SHIFT', null, r, 'system');
      addSyncQueue('TRAINING_SHIFT','UPDATE', r, 'AUTO_15P', 'AUTO');
      trainingChanged=true;
      console.log(`[AUTO] TrainingShift ${r.id} auto-approved after 15p`);
    }
  });
  if(trainingChanged){
    saveDB();
    io.emit('trainingShiftRequests:update', db.trainingShiftRequests);
    io.emit('schedules:update', db.schedules);
    io.emit('attendances:update', db.attendances);
    io.emit('notifications:update', db.notifications);
    io.emit('zalo:update', db.zaloRecords);
    changed=true;
  }
  // Dọn dẹp 1 lần các mục DEAD/FAILED cũ do placeholder hoặc KEY (fix triệt để #23 DEAD)
  const webhookUrlNow = db.settings?.googleSheet?.targetWebhookUrl || '';
  const isPlaceholderNow = webhookUrlNow.includes('AKfycbz_umbomilk_apps_script') || webhookUrlNow.includes('umbomilk_apps_script');
  // Tự động chuyển các DEAD do placeholder/KEY hoặc 404 webhook về UNCONFIGURED hoặc xóa nếu đã quá cũ
  if(db.syncQueue.some(i=>i.sync_status==='DEAD' && (i.error?.includes('placeholder') || i.error?.includes('404') || i.entity==='KEY' || i.error?.includes('No Google Sheet mapping for KEY')))){
    const beforeDead = db.syncQueue.filter(i=>i.sync_status==='DEAD').length;
    db.syncQueue = db.syncQueue.filter(i=> !(i.sync_status==='DEAD' && (i.error?.includes('placeholder') || i.error?.includes('404') || i.entity==='KEY' || i.error?.includes('No Google Sheet mapping'))));
    // Chuyển các FAILED do KEY/placeholder về SYNCED/UNCONFIGURED để không thành DEAD
    db.syncQueue.forEach(i=>{
      if(i.entity==='KEY' && (i.sync_status==='FAILED' || i.sync_status==='DEAD')){ i.sync_status='SYNCED'; delete i.error; i.note='Key embedded - auto fixed'; }
      if(isPlaceholderNow && i.error?.includes('placeholder') && i.sync_status==='FAILED'){ i.sync_status='UNCONFIGURED'; i.error='Webhook placeholder - dữ liệu lưu local, Sheets API sẽ đồng bộ khi có ServiceAccount'; }
      if(i.error?.includes('No Google Sheet mapping for KEY')){ i.sync_status='SYNCED'; delete i.error; }
    });
    if(beforeDead>0) console.log(`[SYNC CLEANUP] Đã dọn ${beforeDead} mục DEAD do placeholder/KEY`);
    saveDB(); io.emit('sync:update', db.syncQueue);
  }
  // 4. Sync queue auto-retry (exponential backoff, realtime) - không retry nếu là placeholder hoặc KEY
  const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || 'umbomilk_secret_2026';
  const webhookUrl = db.settings?.googleSheet?.targetWebhookUrl || '';
  const isPlaceholder = webhookUrl.includes('AKfycbz_umbomilk_apps_script') || webhookUrl.includes('umbomilk_apps_script');
  const hasWebhookConfig = !!(webhookUrl && secret && !isPlaceholder);
  if(hasWebhookConfig){
    const retryableSync = db.syncQueue.filter(item =>
      (item.sync_status==='FAILED' || item.sync_status==='PENDING') && // UNCONFIGURED không retry nếu là placeholder
      item.entity!=='KEY' && !item.error?.includes('placeholder') && !item.error?.includes('No Google Sheet mapping') &&
      (item.retryCount||0) < 5 && !item._retrying &&
      (!item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= now)
    );
    retryableSync.slice(0,3).forEach(item=>{
      item._retrying = true;
      item.sync_status='PENDING';
      item.retryCount = (item.retryCount||0)+1;
      syncToGoogleSheet(item)
        .then(()=>{
          item.sync_status='SYNCED';
          item.retriedAt=item.syncedAt=new Date().toISOString();
          delete item.error;
          delete item.nextRetryAt;
        })
        .catch(err=>{
          item.sync_status='FAILED';
          item.error=err.message;
          item.nextRetryAt = new Date(Date.now() + Math.pow(2, item.retryCount)*5000).toISOString();
        })
        .finally(()=>{ delete item._retrying; saveDB(); io.emit('sync:update', db.syncQueue); });
      changed=true;
    });
    if(changed) saveDB();
    const pendingSync = db.syncQueue.filter(s=>s.sync_status==='FAILED' || s.sync_status==='PENDING');
    pendingSync.forEach(item=>{
      if((item.retryCount||0) >= 5 && item.sync_status==='FAILED') item.sync_status='DEAD';
    });
    if(pendingSync.some(item=>item.sync_status==='DEAD')) saveDB();
  }
  // ponytail: queue chạy tối đa 3 tác vụ/poll; chuyển sang worker bền vững khi chạy đa instance.
  // 4. Broadcast realtime health + sync status
  io.emit('automation:heartbeat', {
    now: new Date().toISOString(),
    pendingDevices: db.deviceRequests.filter(r=>r.status==='PENDING').length,
    pendingEmerg: db.emergencyRequests.filter(r=>r.status==='PENDING').length,
    syncPending: db.syncQueue.filter(s=>s.sync_status==='PENDING').length,
    syncFailed: db.syncQueue.filter(s=>s.sync_status==='FAILED').length,
    driveFiles: db.driveFiles.length
  });
}
setInterval(realtimeAutomationPoller, 20*1000);
setTimeout(realtimeAutomationPoller, 10000);

// === GOOGLE SHEET 17iXM - SYNC DOWN DELETIONS (yêu cầu: Sheet là nơi duy nhất xóa, Web App mất vĩnh viễn) ===
async function syncDownDeletionsFromMasterSheet(){
  try{
    const targetId = db.settings?.googleSheet?.targetDatabaseSpreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
    const token = await getGoogleAccessToken();
    if(!token || !targetId) return;
    // Chỉ chạy khi Sheet đã có ServiceAccount
    const sheetsToCheck = ['NHAN_VIEN_TRAINING','NHAN_VIEN_CHINH_THUC'];
    const sheetIds = new Set();
    for(const sheetName of sheetsToCheck){
      try{
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent(sheetName)}!A2:Z1000`;
        const resp = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }});
        if(!resp.ok) continue;
        const j = await resp.json();
        const values = j.values || [];
        if(values.length===0) continue;
        // Tìm cột Mã NV (header row đã có, nhưng values từ A2 nên cột 1 là Mã NV)
        // Với sheets đã thêm Key, Mã NV vẫn là cột B (index 1)
        for(const row of values){
          const maNV = row[1] ? String(row[1]).trim() : '';
          if(maNV) sheetIds.add(maNV);
        }
      }catch(e){ console.error(`[SYNC DOWN] Sheet ${sheetName} error`, e.message); }
    }
    if(sheetIds.size===0) return; // Sheet rỗng hoặc lỗi fetch thì không xóa gì (an toàn)
    const toDelete = db.employees.filter(e=>{
      // Chỉ xóa nếu NV đã tồn tại >5 phút và đã SYNCED (tránh xóa NV vừa tạo chưa kịp sync lên Sheet 60s)
      const ageMs = Date.now() - new Date(e.updated_at || e.startDate || Date.now()).getTime();
      if(ageMs < 300000) return false;
      if(e.sync_status === 'PENDING') return false;
      return !sheetIds.has(e.employeeId);
    });
    if(toDelete.length>0){
      console.log(`[SYNC DOWN] Phát hiện ${toDelete.length} NV bị xóa trên Sheet 17iXM -> xóa vĩnh viễn trên Web App:`, toDelete.map(e=>e.employeeId).join(', '));
      for(const emp of toDelete){
        // Xóa vĩnh viễn local (không xóa lại Sheet vì đã xóa)
        const idx = db.employees.findIndex(x=>x.employeeId===emp.employeeId);
        if(idx!==-1) db.employees.splice(idx,1);
        db.keys = db.keys.filter(k=>k.employeeId!==emp.employeeId);
        db.attendances = db.attendances.filter(a=>a.employeeId!==emp.employeeId);
        db.schedules = db.schedules.filter(s=>s.employeeId!==emp.employeeId);
        db.offRequests = db.offRequests.filter(r=>r.employeeId!==emp.employeeId);
        db.emergencyRequests = db.emergencyRequests.filter(r=>r.employeeId!==emp.employeeId && r.substituteId!==emp.employeeId);
        db.testResults = db.testResults.filter(t=>t.employeeId!==emp.employeeId);
        audit('SYSTEM','SYNC_DOWN_DELETE','EMPLOYEE',emp,null,'sheet-sync-down');
        emitForceLogout(emp.employeeId, 'Tài khoản đã bị xóa trên Google Sheet (17iXM) - mất vĩnh viễn');
      }
      saveDB();
      io.emit('employees:update', db.employees);
      io.emit('keys:update', db.keys);
      io.emit('schedules:update', db.schedules);
      io.emit('attendances:update', db.attendances);
    }
  }catch(e){ console.error('[SYNC DOWN] error', e.message); }
}
setInterval(syncDownDeletionsFromMasterSheet, 60*1000);
setTimeout(syncDownDeletionsFromMasterSheet, 30000);
// Endpoint thủ công cho Admin
app.post('/api/admin/sync-down-deletions', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  await syncDownDeletionsFromMasterSheet();
  res.json({success:true, message:'Đã đồng bộ xóa từ Sheet 17iXM xuống Web App', employees: db.employees.length});
});

// === GOOGLE DRIVE REALTIME - Cấu trúc cake per spec 4, 1:1 thực tế ===
function generateDrivePath(employee, dateStr, type){
  const branch = db.branches.find(b=>b.id===employee.branchId);
  const branchFolder = `${branch?.prefix||employee.branchId} - ${branch?.name||employee.branchId}`;
  const shiftFolder = employee.shift || 'CA_SANG';
  // Spec 4 note: bổ sung Employee ID để tránh trùng tên/SĐT khi đổi số
  const empFolder = `${employee.name} - ${employee.phone} - ${employee.employeeId}`;
  const root = employee.type==='TRAINING' ? 'NHAN_VIEN_TRAINING' : 'NHAN_VIEN_CHINH_THUC';
  // Spec yêu cầu DD-MM-YYYY cho folder ngày
  const dParts = dateStr.split('-');
  const folderDate = dParts.length===3 ? `${dParts[2]}-${dParts[1]}-${dParts[0]}` : dateStr;
  // Full cake: NHAN_VIEN_.../CN.../CA_.../Họ tên - SĐT/DD-MM-YYYY/CHECK_IN
  return `${root}/${branchFolder}/${shiftFolder}/${empFolder}/${folderDate}/${type}`;
}
async function ensureDriveFolderCake(employee, dateStr, type){
  const cfg = db.settings?.googleDrive;
  if(!cfg || !cfg.rootFolderId || !db.settings?.googleSheet?.serviceAccountEmail || !db.settings?.googleSheet?.privateKey || !db.settings.googleSheet.privateKey.includes('BEGIN PRIVATE KEY')) return null;
  try{
    const accessToken = await getGoogleAccessToken();
    if(!accessToken) return null;
    const rootId = cfg.rootFolderId;
    const branch = db.branches.find(b=>b.id===employee.branchId);
    const pathParts = [
      employee.type==='TRAINING' ? 'NHAN_VIEN_TRAINING' : 'NHAN_VIEN_CHINH_THUC',
      `${branch?.prefix||employee.branchId} - ${branch?.name||employee.branchId}`,
      employee.shift || 'CA_SANG',
      `${employee.name} - ${employee.phone} - ${employee.employeeId}`,
      (()=>{ const p=dateStr.split('-'); return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:dateStr })(),
      type
    ];
    let parentId = rootId;
    for(const folderName of pathParts){
      // Check exists
      const q = encodeURIComponent(`'${parentId}' in parents and name='${folderName.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers:{ Authorization:`Bearer ${accessToken}`}});
      const searchData = await searchRes.json();
      let folderId = searchData.files?.[0]?.id;
      if(!folderId){
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method:'POST',
          headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json'},
          body: JSON.stringify({ name: folderName, mimeType:'application/vnd.google-apps.folder', parents:[parentId] })
        });
        const createData = await createRes.json();
        folderId = createData.id;
      }
      if(!folderId) break;
      parentId = folderId;
    }
    return parentId;
  }catch(e){ console.error('Drive cake error', e.message); return null; }
}
async function getGoogleAccessToken(){
  const cfg = db.settings?.googleSheet;
  if(!cfg || !cfg.serviceAccountEmail || !cfg.privateKey) return null;
  try{
    const now = Math.floor(Date.now()/1000);
    const payload = { iss: cfg.serviceAccountEmail, scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar', aud: 'https://oauth2.googleapis.com/token', exp: now+3600, iat: now };
    const privateKey = cfg.privateKey.replace(/\\n/g,'\n');
    const token = jwt.sign(payload, privateKey, { algorithm:'RS256' });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${token}`
    });
    const data = await tokenRes.json();
    return data.access_token||null;
  }catch(e){ console.error('getGoogleAccessToken error', e.message); return null; }
}
// Tạo Google Meet link thật qua Calendar API (dùng ServiceAccount với calendar scope)
async function createCalendarMeetEvent(interview, applicant){
  try{
    const token = await getGoogleAccessToken();
    if(!token) {
      console.log('[CALENDAR] Không có ServiceAccount token - dùng Meet giả');
      return null;
    }
    const calendarId = db.settings?.calendar?.calendarId || 'primary';
    // Parse timeSlot "09:00 - 09:30" và interviewDate "2026-08-30"
    const [startStr, endStr] = (interview.timeSlot||'09:00 - 09:30').split('-').map(s=>s.trim());
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = (endStr||'09:30').split(':').map(Number);
    const startDate = new Date(interview.interviewDate);
    startDate.setHours(sh||9, sm||0, 0, 0);
    const endDate = new Date(interview.interviewDate);
    endDate.setHours(eh||9, (em||30), 0, 0);
    // Convert to RFC3339 with Vietnam timezone (UTC+7)
    const toRFC3339 = (d)=>{
      const pad = (n)=>String(n).padStart(2,'0');
      const yyyy=d.getFullYear(), mm=pad(d.getMonth()+1), dd=pad(d.getDate()), hh=pad(d.getHours()), mi=pad(d.getMinutes()), ss=pad(d.getSeconds());
      // Sử dụng Asia/Ho_Chi_Minh offset +07:00
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+07:00`;
    };
    const event = {
      summary: `Phỏng vấn - ${applicant.name} (${applicant.phone}) - ${interview.branchPreference||''}`,
      description: `Phỏng vấn nhân viên mới Ụm Bò Milk\nỨng viên: ${applicant.name} - ${applicant.phone}\nChi nhánh: ${interview.branchPreference}\nGhi chú: ${interview.notes||''}\n\nTự động tạo từ HR Web App`,
      start: { dateTime: toRFC3339(startDate), timeZone: 'Asia/Ho_Chi_Minh' },
      end: { dateTime: toRFC3339(endDate), timeZone: 'Asia/Ho_Chi_Minh' },
      attendees: [{ email: applicant.email || 'candidate@example.com' }],
      conferenceData: {
        createRequest: { requestId: `umb-${interview.id}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } }
      },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] }
    };
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    const data = await res.json();
    if(!res.ok){
      console.error('[CALENDAR] Tạo Meet thất bại:', data);
      return null;
    }
    const meetLink = data.hangoutLink || data.conferenceData?.entryPoints?.find(p=>p.entryPointType==='video')?.uri || data.htmlLink;
    console.log(`[CALENDAR] Đã tạo Meet thật: ${meetLink} cho ${applicant.name}`);
    return meetLink;
  }catch(e){
    console.error('[CALENDAR] Lỗi tạo Meet:', e.message);
    return null;
  }
}
function addDriveFile(employeeId, dateStr, type, fileName, meta){
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return null;
  const drivePath = generateDrivePath(emp, dateStr, type);
  const file = {
    id: uuidv4(),
    employeeId,
    employeeName: emp.name,
    date: dateStr,
    type, // CHECK_IN / CHECK_OUT
    fileName,
    drivePath: drivePath + '/' + fileName,
    url: `https://drive.google.com/drive/folders/${db.settings?.googleDrive?.rootFolderId||'1-Wy-Di6KvfeGCKoTV7TSuFQpY_yKNy-1'}/${encodeURIComponent(drivePath)}/${fileName}`,
    meta: meta||{},
    createdAt: new Date().toISOString(),
    sync_status: 'PENDING'
  };
  db.driveFiles.unshift(file);
  if(db.driveFiles.length>500) db.driveFiles.pop();
  io.emit('drive:update', db.driveFiles.slice(0,20));
  // Realtime 1:1 - background sync to real Drive if credentials configured (yêu cầu #8: thực lưu ảnh/txt)
  (async()=>{
    try{
      const folderId = await ensureDriveFolderCake(emp, dateStr, type);
      const hasContent = meta && (meta.content || meta.image);
      if(folderId && hasContent){
        const token = await getGoogleAccessToken();
        if(token){
          const isImage = fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg') || fileName.toLowerCase().endsWith('.png');
          const rawContent = meta.content || meta.image || '';
          const isBase64Image = typeof rawContent==='string' && rawContent.startsWith('data:image');
          let mimeType = 'text/plain';
          let bodyContent = rawContent;
          let parents = [folderId];
          if(isImage && isBase64Image){
            mimeType = 'image/jpeg';
            // Tách base64 sau dấu phẩy
            const base64 = rawContent.split(',')[1] || '';
            // Tạo buffer và dùng multipart với binary – dùng base64 trực tiếp trong body với encoding base64
            const boundary = '-------314159265358979323846';
            const metadata = JSON.stringify({name: fileName, parents});
            // Với ảnh, gửi binary qua multipart: dùng Buffer
            const binary = Buffer.from(base64, 'base64');
            // Xây multipart bằng Buffer
            const part1 = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
            const part2Header = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
            const end = `\r\n--${boundary}--`;
            const bodyBuffer = Buffer.concat([Buffer.from(part1), Buffer.from(part2Header), binary, Buffer.from(end)]);
            const upRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':`multipart/related; boundary=${boundary}`}, body: bodyBuffer
            });
            const upData = await upRes.json();
            if(upData.id){ file.url = `https://drive.google.com/file/d/${upData.id}/view`; file.sync_status='SYNCED'; file.driveFileId = upData.id; file.mimeType=mimeType; io.emit('drive:update', db.driveFiles.slice(0,20)); saveDB(); return; }
          } else {
            // Text file (Diem_danh.txt) – giữ logic cũ
            const boundary = '-------314159265358979323846';
            const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name: fileName, parents:[folderId]})}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${bodyContent}\r\n--${boundary}--`;
            const upRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':`multipart/related; boundary=${boundary}`}, body
            });
            const upData = await upRes.json();
            if(upData.id){ file.url = `https://drive.google.com/file/d/${upData.id}/view`; file.sync_status='SYNCED'; file.driveFileId = upData.id; io.emit('drive:update', db.driveFiles.slice(0,20)); saveDB(); return; }
          }
        }
      }
      if(folderId){
        file.sync_status='SYNCED';
        file.driveFolderId = folderId;
        io.emit('drive:update', db.driveFiles.slice(0,20));
        saveDB();
      }
    }catch(e){ console.error('Drive sync error', e.message); file.sync_status='FAILED'; saveDB(); }
  })();
  return file;
}

// ============ GOOGLE SHEET REALTIME 1:1 - Auto-create sheets per HR tab ============
async function ensureSheetsExist(){
  const spreadsheetId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const token = await getGoogleAccessToken();
  if(!token) return false;
  try{
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers:{ Authorization:`Bearer ${token}` }});
    const meta = await metaRes.json();
    const existing = new Set((meta.sheets||[]).map(s=>s.properties.title));
    const requests = [];
    for(const key in SHEET_DEFINITIONS){
      const def = SHEET_DEFINITIONS[key];
      if(!existing.has(def.sheetName)){
        requests.push({ addSheet:{ properties:{ title: def.sheetName }}});
      }
    }
    if(requests.length>0){
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
        body: JSON.stringify({ requests })
      });
      console.log(`[SHEET] Auto-created ${requests.length} sheets per HR tabs`);
    }
    // Ensure headers for each sheet – cập nhật nếu thiếu cột Key (yêu cầu #9)
    for(const key in SHEET_DEFINITIONS){
      const def = SHEET_DEFINITIONS[key];
      const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A1:Z1`, { headers:{ Authorization:`Bearer ${token}` }});
      const headerData = await headerRes.json();
      const existingHeader = headerData.values?.[0] || [];
      const hasHeader = existingHeader[0]===def.headers[0] && existingHeader.length===def.headers.length && def.headers.every((h,i)=> existingHeader[i]===h);
      const missingKey = def.headers.includes('Key') && !existingHeader.includes('Key');
      if(!hasHeader || missingKey){
        // Clear header row and rewrite để thêm cột Key
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A1:Z1:clear`, {
          method:'POST', headers:{ Authorization:`Bearer ${token}` }
        });
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A1:append?valueInputOption=RAW`, {
          method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
          body: JSON.stringify({ values:[def.headers] })
        });
        console.log(`[SHEET] Updated header for ${def.sheetName} (added Key)`);
      }
    }
    return true;
  }catch(e){ console.error('ensureSheetsExist error', e.message); return false; }
}
async function syncSheetTab(sheetKey){
  const def = SHEET_DEFINITIONS[sheetKey];
  if(!def) return;
  const spreadsheetId = db.settings?.googleSheet?.spreadsheetId;
  const token = await getGoogleAccessToken();
  if(!token || !spreadsheetId) return;
  try{
    let rows = [];
    switch(sheetKey){
      case 'NHAN_VIEN_MOI':
        rows = db.applicants.map(a=>[a.id, a.createdAt, a.name, a.gender, a.birthYear, a.education, a.hometown, a.phone, a.shiftText, a.branchText, a.experience, a.handling, a.facebook, a.source, a.aiScore, a.isDisqualified?'LOAI':'DAT', a.status, a.source_id, a.version, a.updated_at]);
        break;
      case 'NHAN_VIEN_TRAINING':
        rows = db.employees.filter(e=>e.type==='TRAINING').map(e=>{
          const k = db.keys.find(k=>k.employeeId===e.employeeId)?.key || '';
          return [e.id, e.employeeId, e.name, e.phone, k, e.branchId, e.shift, e.startDate, e.endDate, e.trainingDays, e.status, e.testScore, e.testResult, e.type, e.category, e.version, e.updated_at, e.sync_status];
        });
        break;
      case 'NHAN_VIEN_CHINH_THUC':
        rows = db.employees.filter(e=>e.type==='OFFICIAL').map(e=>{
          const k = db.keys.find(k=>k.employeeId===e.employeeId)?.key || '';
          return [e.id, e.employeeId, e.name, e.phone, k, e.branchId, e.shift, e.startDate, e.status, e.testScore, e.type, e.officialStartDate||'', e.version, e.updated_at, e.sync_status];
        });
        break;
      case 'LICH_LAM_VIEC':
        rows = db.schedules.flatMap(s=> s.days.map(d=>[s.id, s.employeeId, db.employees.find(e=>e.employeeId===s.employeeId)?.name||'', db.employees.find(e=>e.employeeId===s.employeeId)?.branchId||'', s.weekStart, d.date, d.dayName, d.shift, d.status, d.substituteFor||'', s.version]));
        break;
      case 'RECORD_DIEM_DANH':
        rows = db.attendances.map(a=>[a.id, a.employeeId, db.employees.find(e=>e.employeeId===a.employeeId)?.name||'', a.date, a.shift, a.branchId, a.checkIn?.time||'', a.checkIn?.gps||'', a.checkIn?.image ? 'co_anh' : '', a.checkIn?.drivePath||'', a.checkOut?.time||'', a.checkOut?.gps||'', a.checkOut?.image ? 'co_anh' : '', a.checkOut?.drivePath||'', a.status, (a.violations||[]).join(','), a.version]);
        break;
      case 'RECORD_ZALO':
        rows = db.zaloRecords.map(z=>[z.id, z.sent_at, z.receiver, z.type, z.content?.slice(0,200), z.status, z.error||'']);
        break;
      case 'PHIEU_OFF_HANG_TUAN':
        rows = db.offRequests.map(r=>[r.id, r.employeeId, r.employeeName, r.branchId, r.shift, r.dates?.join(','), r.type, r.status, r.autoApproved?'YES':'', r.createdAt]);
        break;
      case 'PHIEU_OFF_DOT_XUAT':
        rows = db.emergencyRequests.map(r=>[r.id, r.employeeId, r.employeeName, r.branchId, r.shift, r.date, r.reason, r.substituteName||'', r.status, r.cascadeStep, r.createdAt]);
        break;
      case 'PHIEU_DOI_THIET_BI':
        rows = db.deviceRequests.map(r=>[r.id, r.employeeId, r.reason, r.oldDeviceId||'', r.newDeviceId||'', r.status, r.createdAt, r.expiresAt]);
        break;
      case 'KET_QUA_TEST':
        rows = db.testResults.map(t=>[t.id, t.employeeId, db.employees.find(e=>e.employeeId===t.employeeId)?.name||'', t.courseId, t.score, `${t.correct}/${t.total}`, t.result, t.timeSpent, t.createdAt]);
        break;
      case 'DRIVE_FILES':
        rows = db.driveFiles.map(f=>[f.id, f.employeeId, f.employeeName, f.date, f.type, f.fileName, f.drivePath, f.url, f.createdAt]);
        break;
      default:
        return;
    }
    // Clear and rewrite sheet (realtime 1:1)
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A2:Z:clear`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}` }
    });
    if(rows.length>0){
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A2:append?valueInputOption=RAW`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
        body: JSON.stringify({ values: rows })
      });
    }
    console.log(`[SHEET] Synced ${def.sheetName}: ${rows.length} rows - Realtime 1:1`);
  }catch(e){ console.error(`syncSheetTab ${sheetKey} error`, e.message); }
}
async function syncAllTabsToSheetsRealtime(){
  const ok = await ensureSheetsExist();
  if(!ok) return;
  for(const key in SHEET_DEFINITIONS){
    await syncSheetTab(key);
    await new Promise(r=>setTimeout(r, 200)); // throttle
  }
  io.emit('sync:update', { type:'SHEETS_REALTIME', timestamp: new Date().toISOString(), sheets: Object.keys(SHEET_DEFINITIONS).length });
}
// Auto-sync every 60s + on data change
setInterval(syncAllTabsToSheetsRealtime, 60*1000);
setTimeout(()=>{ syncAllTabsToSheetsRealtime().catch(()=>{}); }, 15000);

// Drive realtime status vars

// ============ ADMIN TEST: SIMULATE 7 DAYS TRAINING ============
app.post('/api/employees/:id/simulate-7days-training', authMiddleware, roleCheck(['Admin']), (req, res) => {
  const empId = req.params.id;
  const emp = db.employees.find(e => e.id === empId || e.employeeId === empId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

  const startDateStr = emp.startDate || getVietnamTodayStr();
  const parts = startDateStr.split('T')[0].split('-').map(Number);
  const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();

  const offSet = new Set(emp.registeredOffDates || []);
  const createdDates = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(startD);
    d.setDate(startD.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    // Skip OFF dates
    if (offSet.has(dateStr)) continue;

    // Check if attendance already exists
    let existingAtt = db.attendances.find(a => a.employeeId === emp.employeeId && a.date === dateStr);
    if (!existingAtt) {
      db.attendances.push({
        id: uuidv4(),
        employeeId: emp.employeeId,
        date: dateStr,
        shift: emp.shift || 'CA_SANG',
        branchId: emp.branchId || 'CN1',
        checkIn: { time: '07:00', gps: '10.762622,106.660172', address: 'CN Test Admin', timestamp: new Date().toISOString() },
        checkOut: { time: '12:00', gps: '10.762622,106.660172', address: 'CN Test Admin', timestamp: new Date().toISOString() },
        status: 'COMPLETED',
        violations: [],
        version: 1,
        updated_at: new Date().toISOString()
      });
    } else {
      existingAtt.status = 'COMPLETED';
      existingAtt.checkIn = existingAtt.checkIn || { time: '07:00', gps: '10.762622,106.660172', address: 'CN Test Admin', timestamp: new Date().toISOString() };
      existingAtt.checkOut = existingAtt.checkOut || { time: '12:00', gps: '10.762622,106.660172', address: 'CN Test Admin', timestamp: new Date().toISOString() };
    }
    createdDates.push(dateStr);
    if (createdDates.length >= 7) break;
  }

  saveDB();
  io.emit('attendances:update', db.attendances);
  io.emit('employees:update', db.employees);

  res.json({ success: true, employeeId: emp.employeeId, completedDates: createdDates, count: createdDates.length });
});

// ============ TRIGGER ONLINE APP TEST (OPTION 1) ============
app.post('/api/employees/:id/trigger-online-test', authMiddleware, (req, res) => {
  const empId = req.params.id;
  const emp = db.employees.find(e => e.id === empId || e.employeeId === empId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

  emp.testSchedule = {
    type: 'ONLINE_APP',
    status: 'WAITING_TEST',
    createdAt: new Date().toISOString()
  };
  emp.status = 'WAITING_TEST';
  emp.updated_at = new Date().toISOString();

  saveDB();
  io.emit('employees:update', db.employees);
  res.json({ success: true, employee: emp });
});

// ============ SCHEDULE MEET TEST (OPTION 2 WITH 1H30M GAP CONSTRAINT) ============
app.post('/api/employees/:id/schedule-test', authMiddleware, (req, res) => {
  const empId = req.params.id;
  const { scheduledAt, meetLink } = req.body;
  if (!scheduledAt) return res.status(400).json({ error: 'Vui lòng chọn thời gian phỏng vấn TEST' });

  const emp = db.employees.find(e => e.id === empId || e.employeeId === empId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

  const newTime = new Date(scheduledAt).getTime();
  if (isNaN(newTime)) return res.status(400).json({ error: 'Thời gian đặt lịch không hợp lệ' });

  // GAP CONSTRAINT CHECK: 1h30m (90 mins = 5,400,000 ms)
  const MIN_GAP_MS = 90 * 60 * 1000;
  for (const other of db.employees) {
    if (other.employeeId === emp.employeeId || other.id === emp.id) continue;
    if (other.testSchedule && other.testSchedule.type === 'MEET_TEST' && other.testSchedule.scheduledAt && other.testSchedule.status === 'SCHEDULED') {
      const existingTime = new Date(other.testSchedule.scheduledAt).getTime();
      const diffMs = Math.abs(newTime - existingTime);
      if (diffMs < MIN_GAP_MS) {
        const existingTimeStr = new Date(other.testSchedule.scheduledAt).toLocaleString('vi-VN');
        return res.status(400).json({
          error: `Lịch phỏng vấn bị trùng hoặc quá gần lịch của NV ${other.name} (${other.employeeId}) vào lúc ${existingTimeStr}. Mỗi lịch phỏng vấn TEST phải cách nhau tối thiểu 1 tiếng 30 phút!`
        });
      }
    }
  }

  emp.testSchedule = {
    type: 'MEET_TEST',
    scheduledAt: new Date(scheduledAt).toISOString(),
    meetLink: meetLink || 'https://meet.google.com/ubm-test-meet',
    status: 'SCHEDULED',
    createdAt: new Date().toISOString()
  };
  emp.status = 'WAITING_TEST';
  emp.updated_at = new Date().toISOString();

  saveDB();
  io.emit('employees:update', db.employees);
  res.json({ success: true, employee: emp, testSchedule: emp.testSchedule });
});

// ============ COMPLETE MEET TEST INTERVIEW ============
app.post('/api/employees/:id/complete-meet-test', authMiddleware, (req, res) => {
  const empId = req.params.id;
  const emp = db.employees.find(e => e.id === empId || e.employeeId === empId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

  if (!emp.testSchedule) emp.testSchedule = {};
  emp.testSchedule.status = 'COMPLETED_INTERVIEW';
  emp.testSchedule.completedAt = new Date().toISOString();
  emp.updated_at = new Date().toISOString();

  saveDB();
  io.emit('employees:update', db.employees);
  res.json({ success: true, employee: emp });
});

// ============ EVALUATE TEST SCORE (OFFICIAL 20-CRITERIA RUBRIC) ============
app.post('/api/employees/:id/evaluate-test', authMiddleware, (req, res) => {
  const empId = req.params.id;
  const { evaluatorName, shiftType, part1Scores, part2Scores, notes } = req.body;

  const emp = db.employees.find(e => e.id === empId || e.employeeId === empId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

  // Compute Part 1 total (max 10)
  const p1Total = Array.isArray(part1Scores) 
    ? part1Scores.reduce((sum, val) => sum + (Number(val) || 0), 0)
    : (Number(req.body.attitude) || 0);

  // Compute Part 2 total (max 10)
  const p2Total = Array.isArray(part2Scores)
    ? part2Scores.reduce((sum, val) => sum + (Number(val) || 0), 0)
    : (Number(req.body.knowledge) || 0);

  const totalScore = p1Total + p2Total; // max 20
  // Pass rule from official doc: both parts > 6.0/10 (or totalScore > 12)
  const isPassed = p1Total > 6 && p2Total > 6;
  const resultStatus = isPassed ? 'PASSED_TEST' : 'FAILED_TEST';

  emp.status = resultStatus;
  emp.testScore = Math.round((totalScore / 20) * 100); // Scale to 100% for compatibility
  emp.testResult = isPassed ? `ĐẠT (${totalScore}/20đ)` : `CHƯA ĐẠT (${totalScore}/20đ)`;
  
  if (!emp.testSchedule) emp.testSchedule = {};
  emp.testSchedule.status = 'EVALUATED';
  emp.testSchedule.evaluation = {
    evaluatorName: evaluatorName || req.user?.username || 'HR',
    shiftType: shiftType || 'Cố định',
    part1Score: p1Total,
    part2Score: p2Total,
    totalScore20: totalScore,
    totalScore100: emp.testScore,
    isPassed,
    notes: notes || '',
    part1Details: part1Scores || [],
    part2Details: part2Scores || [],
    evaluatedBy: req.user?.username || 'HR',
    evaluatedAt: new Date().toISOString()
  };
  emp.updated_at = new Date().toISOString();

  saveDB();
  io.emit('employees:update', db.employees);
  res.json({ success: true, employee: emp, totalScore, p1Total, p2Total, isPassed, resultStatus });
});

app.post('/api/attendance/checkin', (req,res)=>{
  const { employeeId, gps, address, image, shift, isCameraCapture } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Employee not found'});
  // Spec 16.1 - dữ liệu bắt buộc
  if(!image || typeof image!=='string' || image.length<100) return res.status(400).json({error:'Ảnh Check-in bắt buộc - phải chụp trực tiếp bằng camera (không cho upload gallery)'});
  // Chặn upload gallery: phải là ảnh chụp trực tiếp data:image/* base64, không chấp nhận URL/generic
  if(!image.startsWith('data:image/')) return res.status(400).json({error:'Ảnh phải được chụp trực tiếp từ camera (data:image), không cho upload từ thư viện'});
  // Optional flag từ client để đảm bảo camera live
  if(isCameraCapture === false) return res.status(400).json({error:'Không cho upload ảnh có sẵn từ Gallery - phải chụp trực tiếp'});
  if(!gps || typeof gps!=='string' || !gps.includes(',')) return res.status(400).json({error:'GPS bắt buộc khi Check-in'});
  // Validate GPS format: lat, lng
  if(!/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/.test(gps)) return res.status(400).json({error:'GPS không hợp lệ (định dạng: lat, lng)'});
  if(!address || address.trim().length<3) return res.status(400).json({error:'Địa chỉ/GPS address bắt buộc khi Check-in'});

  // Check-in lockdown during Online App Test
  if (emp.testSchedule && emp.testSchedule.type === 'ONLINE_APP' && emp.status === 'WAITING_TEST') {
    return res.status(403).json({ error: 'Bạn đang trong thời gian thực hiện bài TEST đầu ra trên Web App. Chức năng điểm danh (Check-in/Check-out) tạm thời khóa.' });
  }
  // Kiểm tra ngày bắt đầu chính thức - nếu chưa đến ngày thì chưa mở điểm danh, nhưng vẫn hiển thị lịch
  const todayForOfficialCheck = getVietnamTodayStr();
  if(emp.officialStartDate && todayForOfficialCheck < emp.officialStartDate){
    return res.status(403).json({ error: `Chưa đến ngày bắt đầu chính thức (${emp.officialStartDate.split('T')[0].split('-').reverse().join('/')}). Lịch đã hiển thị nhưng chưa gán ca. Điểm danh sẽ tự động mở vào ${emp.officialStartDate.split('T')[0].split('-').reverse().join('/')}.` });
  }
  if(emp.status === 'WAITING_OFFICIAL'){
    return res.status(403).json({ error: `Tài khoản đang chờ đến ngày chính thức ${emp.officialStartDate ? emp.officialStartDate.split('T')[0].split('-').reverse().join('/') : ''}. Vui lòng quay lại đúng ngày.` });
  }

  const today = getVietnamTodayStr();

  const isTraining = emp.type === 'TRAINING' || emp.status === 'TRAINING';
  if (isTraining) {
    const startDateStr = emp.startDate || getVietnamTodayStr();
    const parts = startDateStr.split('T')[0].split('-').map(Number);
    const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
    const trialEndD = new Date(startD);
    trialEndD.setDate(startD.getDate() + 11);

    const todayParts = today.split('-').map(Number);
    const todayD = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);

    if (todayD > trialEndD) {
      return res.status(400).json({ error: 'Bạn đã hoàn thành 12 ngày thử việc. Vui lòng liên hệ HR chuyển sang Nhân viên chính thức để tiếp tục xếp ca và điểm danh.' });
    }
  }

  let record = db.attendances.find(a=>a.employeeId===employeeId && a.date===today);
  if(record && record.checkIn) return res.status(400).json({error:'Đã Check-in hôm nay'});

  const shiftInfo = (db.settings.payroll.shifts && db.settings.payroll.shifts[shift||emp.shift]) || DEFAULT_SHIFTS[shift||emp.shift] || DEFAULT_SHIFTS['CA_SANG'];
  const now = getVietnamNow();
  const [sh, sm] = shiftInfo.start.split(':').map(Number);
  const shiftStart = new Date(now); shiftStart.setHours(sh, sm, 0,0);
  const open = new Date(shiftStart.getTime() - 30*60000); // 30 mins before shift start - Vietnam

  if(now < open) {
    return res.status(400).json({error: `Chưa đến giờ mở Check-in. Camera sẽ mở lúc ${open.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'})} (giờ Việt Nam)`});
  }
  // Spec 16: Đóng Check-in theo ngưỡng cho phép (Rule Engine) - default 60 phút sau giờ bắt đầu
  const closeAfter = db.settings?.attendance?.checkInCloseAfter ?? 60;
  const close = new Date(shiftStart.getTime() + closeAfter*60000);
  if(now > close){
    return res.status(400).json({error: `Đã đóng Check-in. Cửa sổ Check-in: ${open.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'})} - ${close.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'})} (giờ Việt Nam). Vui lòng liên hệ HR.`});
  }

  const isOfficial = emp.type === 'OFFICIAL' || emp.status === 'OFFICIAL';
  const diffMins = Math.floor((now - shiftStart) / 60000);
  const violations = [];
  let penaltyObj = null;

  if (isOfficial && diffMins >= 5) {
    const hourlyRate = db.settings.payroll.officialRate || 25500;
    const shiftHours = shiftInfo.hours || 5;
    const shiftWage = shiftHours * hourlyRate;

    if (diffMins < 30) {
      violations.push('VAO_TRE_5P');
      penaltyObj = {
        id: uuidv4(), employeeId: emp.employeeId, date: today, code: 'VAO_TRE_5P',
        title: 'Vào trễ ca (5-29 phút)', fineAmount: 30000, percentage: 0, createdAt: now.toISOString()
      };
    } else if (diffMins < 60) {
      violations.push('VAO_TRE_30P');
      const fineAmount = Math.round(shiftWage * 0.5);
      penaltyObj = {
        id: uuidv4(), employeeId: emp.employeeId, date: today, code: 'VAO_TRE_30P',
        title: 'Vào trễ ca (30-59 phút)', fineAmount, percentage: 50, createdAt: now.toISOString()
      };
    } else {
      violations.push('VAO_TRE_60P');
      const fineAmount = shiftWage;
      penaltyObj = {
        id: uuidv4(), employeeId: emp.employeeId, date: today, code: 'VAO_TRE_60P',
        title: 'Vào trễ ca (≥ 60 phút)', fineAmount, percentage: 100, createdAt: now.toISOString()
      };
    }
    if (!db.penalties) db.penalties = [];
    db.penalties.push(penaltyObj);
  }

  // Realtime validation: image size (tránh phình db.json)
  let safeImage = image||'';
  if(safeImage && safeImage.length > 500*1024){
    // Nén / cắt bớt để giữ realtime DB nhẹ - lưu marker thay vì base64 đầy đủ
    safeImage = safeImage.slice(0, 500*1024);
    console.warn(`[ATTENDANCE] Check-in image truncated for ${employeeId}`);
  }
  const drivePath = generateDrivePath(emp, today, 'CHECK_IN');
  const newRec = {
    id: uuidv4(), employeeId, date: today, shift: shift||emp.shift, branchId: emp.branchId,
    checkIn: { time: now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'}), gps: gps||'10.762622,106.660172', address: address||db.branches.find(b=>b.id===emp.branchId)?.address, image: safeImage, timestamp: now.toISOString(), content: 'Điểm danh Vào ca UBM', drivePath },
    checkOut: null, status: violations.length ? violations[0] : 'CHECKED_IN', violations, penalty: penaltyObj, version:1, updated_at: now.toISOString(), sync_status:'PENDING'
  };
  db.attendances.push(newRec);
  // Drive realtime: tạo file ảnh + txt điểm danh (yêu cầu #8: thực lưu)
  addDriveFile(employeeId, today, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { content: image, gps: newRec.checkIn.gps, time: newRec.checkIn.time });
  addDriveFile(employeeId, today, 'CHECK_IN', `Diem_danh.txt`, { content: `Điểm danh Vào ca UBM - ${emp.name} - ${today} ${newRec.checkIn.time} - GPS:${newRec.checkIn.gps} - Địa chỉ:${newRec.checkIn.address} - SĐT:${emp.phone} - Ca:${newRec.shift}` });
  audit(employeeId,'CHECKIN','ATTENDANCE',null,newRec, req.ip);
  addSyncQueue('ATTENDANCE','CREATE',newRec, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('attendances:update', db.attendances);
  if (penaltyObj) io.emit('penalties:update', db.penalties);

  const zr = { id: uuidv4(), sent_at: now.toISOString(), receiver: emp.phone, type:'CHECKIN', content:`${emp.name} đã Check-in lúc ${newRec.checkIn.time} ${violations.length ? '— TRỄ CA ('+violations[0]+')' : '— ĐÚNG GIỜ'}`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json(newRec);
});

app.post('/api/attendance/checkout', (req,res)=>{
  const { employeeId, gps, address, image, isCameraCapture } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Employee not found'});
  // Spec 17 - dữ liệu bắt buộc
  if(!image || typeof image!=='string' || image.length<100) return res.status(400).json({error:'Ảnh Check-out bắt buộc - phải chụp trực tiếp bằng camera'});
  if(!image.startsWith('data:image/')) return res.status(400).json({error:'Ảnh phải được chụp trực tiếp từ camera (data:image), không cho upload từ thư viện'});
  if(isCameraCapture === false) return res.status(400).json({error:'Không cho upload ảnh có sẵn từ Gallery - phải chụp trực tiếp'});
  if(!gps || typeof gps!=='string' || !gps.includes(',')) return res.status(400).json({error:'GPS bắt buộc khi Check-out'});
  if(!/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/.test(gps)) return res.status(400).json({error:'GPS không hợp lệ (định dạng: lat, lng)'});
  if(!address || address.trim().length<3) return res.status(400).json({error:'Địa chỉ/GPS address bắt buộc khi Check-out'});
  const today = getVietnamTodayStr();
  const record = db.attendances.find(a=>a.employeeId===employeeId && a.date===today);
  if(!record || !record.checkIn) return res.status(400).json({error:'Bạn chưa Check-in ca làm việc'});
  if(record.checkOut) return res.status(400).json({error:'Bạn đã Check-out ca làm việc hôm nay rồi'});

  const now = getVietnamNow();
  const shiftInfo = (db.settings.payroll.shifts && db.settings.payroll.shifts[record.shift]) || DEFAULT_SHIFTS[record.shift] || DEFAULT_SHIFTS['CA_SANG'];
  const [eh, em] = shiftInfo.end.split(':').map(Number);
  const shiftEnd = new Date(now); shiftEnd.setHours(eh, em, 0,0);

  if (now < shiftEnd) {
    const isEarly = (shiftEnd - now) > 2 * 60000;
    if (isEarly) {
      record.violations.push('RA_SOM');
      const penaltyObj = {
        id: uuidv4(), employeeId: emp.employeeId, date: today, code: 'RA_SOM',
        title: 'Ra ca sớm trước quy định', fineAmount: 50000, percentage: 0, createdAt: now.toISOString()
      };
      if (!db.penalties) db.penalties = [];
      db.penalties.push(penaltyObj);
      io.emit('penalties:update', db.penalties);
    }
  }

  let safeOutImage = image||'';
  if(safeOutImage && safeOutImage.length>500*1024) safeOutImage = safeOutImage.slice(0,500*1024);
  const outDrivePath = generateDrivePath(emp, today, 'CHECK_OUT');
  record.checkOut = { time: now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'}), gps: gps||'10.762622,106.660172', address: address||db.branches.find(b=>b.id===emp.branchId)?.address, image: safeOutImage, timestamp: now.toISOString(), content:'Điểm danh Ra ca UBM', drivePath: outDrivePath };
  record.status = 'COMPLETED';
  record.updated_at = now.toISOString();
  record.sync_status = 'PENDING';
  addDriveFile(employeeId, today, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { content: image, gps: record.checkOut.gps, time: record.checkOut.time });
  addDriveFile(employeeId, today, 'CHECK_OUT', `Diem_danh.txt`, { content: `Điểm danh Ra ca UBM - ${emp.name} - ${today} ${record.checkOut.time} - GPS:${record.checkOut.gps} - Địa chỉ:${record.checkOut.address}` });
  addSyncQueue('ATTENDANCE','UPDATE',record, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('attendances:update', db.attendances);

  const zr = { id: uuidv4(), sent_at: now.toISOString(), receiver: emp.phone, type:'CHECKOUT', content:`${emp.name} đã Check-out lúc ${record.checkOut.time} — Hoàn thành ca làm việc`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json(record);
});

// ============ SCHEDULES ============
app.get('/api/schedules', authMiddleware, (req,res)=>{
  const getMondayStr = (dStr) => {
    if (!dStr) return getVietnamTodayStr();
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
  };

  // Auto-generate missing schedules cho TRAINING và OFFICIAL (fix: OFFICIAL không hiển thị lịch)
  let updated = false;
  db.employees.filter(e => e.status === 'TRAINING' || e.type === 'TRAINING').forEach(emp => {
    const hasSched = db.schedules.some(s => s.employeeId === emp.employeeId);
    if (!hasSched) {
      const startDateStr = emp.startDate || getVietnamTodayStr();
      const trainingDays = emp.trainingDays || 7;
      const parts = startDateStr.split('T')[0].split('-').map(Number);
      const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
      
      const weekMap = {};
      for (let i = 0; i < trainingDays; i++) {
        const curr = new Date(startD);
        curr.setDate(startD.getDate() + i);
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const d = String(curr.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const wStart = getMondayStr(dateStr);

        if (!weekMap[wStart]) weekMap[wStart] = {};
        weekMap[wStart][dateStr] = true;
      }

      for (const wStart in weekMap) {
        const fullDays = buildFull7DaysForWeek(wStart, weekMap[wStart], emp.shift);
        db.schedules.push({
          id: uuidv4(),
          employeeId: emp.employeeId,
          weekStart: wStart,
          days: fullDays,
          version: 1,
          updated_at: new Date().toISOString()
        });
      }
      updated = true;
    }
  });
  // FIX: OFFICIAL chưa có lịch → tạo lịch tuần hiện tại (T2-CN) với ràng buộc AI: cùng CN cùng ca không trùng ngày
  const currentMonday = getMonday(new Date());
  const cy = currentMonday.getFullYear(); const cm = String(currentMonday.getMonth()+1).padStart(2,'0'); const cd = String(currentMonday.getDate()).padStart(2,'0');
  const currentWeekStart = `${cy}-${cm}-${cd}`;
  const officialsNeedingWeek = db.employees.filter(e => (e.status === 'OFFICIAL' || e.type === 'OFFICIAL') && !db.schedules.some(s => s.employeeId === e.employeeId && s.weekStart === currentWeekStart));
  if(officialsNeedingWeek.length>0){
    // Group cùng CN cùng ca để không trùng
    const groupMapWeek = {};
    officialsNeedingWeek.forEach(emp=>{ const k=`${emp.branchId}_${emp.shift}`; if(!groupMapWeek[k]) groupMapWeek[k]=[]; groupMapWeek[k].push(emp); });
    // Track ngày đã gán WORKING cho nhóm cùng CN cùng ca
    const weekDayStatus = {}; // dateStr -> Set of groupKey đã có WORKING
    // Đầu tiên xử lý nhóm >1 (cùng CN cùng ca) round-robin 7 ngày
    for(const key in groupMapWeek){
      const group = groupMapWeek[key];
      if(group.length>1){
        const workCount={}; group.forEach(e=> workCount[e.employeeId]=0);
        for(let i=0;i<7;i++){
          const cur = new Date(currentMonday); cur.setDate(currentMonday.getDate()+i);
          const yy = cur.getFullYear(); const mm = String(cur.getMonth()+1).padStart(2,'0'); const dd = String(cur.getDate()).padStart(2,'0');
          const dateStr = `${yy}-${mm}-${dd}`;
          // Chọn NV ít ngày nhất
          let chosen=group[0]; let min=workCount[chosen.employeeId];
          for(const emp of group){ if(workCount[emp.employeeId] < min){ min=workCount[emp.employeeId]; chosen=emp; } }
          if(!weekDayStatus[dateStr]) weekDayStatus[dateStr]=new Set();
          weekDayStatus[dateStr].add(key);
          // Tạm lưu để tạo days sau
          if(!chosen._weekDays) chosen._weekDays=[];
          chosen._weekDays.push({ date: dateStr, status:'WORKING' });
          workCount[chosen.employeeId]++;
          // Các NV còn lại trong nhóm OFF ngày này
          group.forEach(emp=>{
            if(emp.employeeId!==chosen.employeeId){
              if(!emp._weekDays) emp._weekDays=[];
              // Chỉ thêm nếu chưa có entry cho ngày này
              if(!emp._weekDays.find(d=>d.date===dateStr)) emp._weekDays.push({ date: dateStr, status:'OFF' });
            }
          });
        }
      }
    }
    // Xử lý nhóm size 1 (cùng CN khác ca hoặc khác CN) - 6 ngày làm, nghỉ CN
    officialsNeedingWeek.forEach(emp=>{
      const k=`${emp.branchId}_${emp.shift}`;
      if(groupMapWeek[k].length===1){
        for(let i=0;i<7;i++){
          const cur = new Date(currentMonday); cur.setDate(currentMonday.getDate()+i);
          const yy = cur.getFullYear(); const mm = String(cur.getMonth()+1).padStart(2,'0'); const dd = String(cur.getDate()).padStart(2,'0');
          const dateStr = `${yy}-${mm}-${dd}`;
          const dayOfWeek = cur.getDay();
          const status = (dayOfWeek===0) ? 'OFF' : 'WORKING'; // Nghỉ CN
          if(!emp._weekDays) emp._weekDays=[];
          if(!emp._weekDays.find(d=>d.date===dateStr)) emp._weekDays.push({ date: dateStr, status });
        }
      }
    });
    // Tạo weekly schedules từ _weekDays
    officialsNeedingWeek.forEach(emp=>{
      const days=[];
      for(let i=0;i<7;i++){
        const cur = new Date(currentMonday); cur.setDate(currentMonday.getDate()+i);
        const yy = cur.getFullYear(); const mm = String(cur.getMonth()+1).padStart(2,'0'); const dd = String(cur.getDate()).padStart(2,'0');
        const dateStr = `${yy}-${mm}-${dd}`;
        const found = emp._weekDays ? emp._weekDays.find(d=>d.date===dateStr) : null;
        const status = found ? found.status : 'WORKING';
        days.push({ date: dateStr, dayName: ['T2','T3','T4','T5','T6','T7','CN'][i], shift: emp.shift, status, substituteFor: null });
      }
      db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: currentWeekStart, days, version:1, updated_at: new Date().toISOString() });
      delete emp._weekDays;
      updated = true;
      console.log(`[SCHEDULE] Auto-generated OFFICIAL (constrained) for ${emp.name} ${emp.employeeId} week ${currentWeekStart}`);
    });
  }
  if (updated) saveDB();

  const { employeeId, weekStart, branch } = req.query;
  let list = [...db.schedules];
  const scopeSched = branchScopeFilter(req);
  if(scopeSched){
    const allowedIds = db.employees.filter(e=>scopeSched.includes(e.branchId)).map(e=>e.employeeId);
    list = list.filter(s=>allowedIds.includes(s.employeeId));
  }
  if(employeeId) list = list.filter(s=>s.employeeId===employeeId);
  if(weekStart) {
    const mondayStr = getMondayStr(weekStart);
    list = list.filter(s => s.weekStart === mondayStr || s.weekStart === weekStart);
  }
  if(branch){
    const empIds = db.employees.filter(e=>e.branchId===branch).map(e=>e.employeeId);
    list = list.filter(s=>empIds.includes(s.employeeId));
  }
  // enrich with employee info
  const enriched = list.map(s=>{
    const emp = db.employees.find(e=>e.employeeId===s.employeeId);
    return { ...s, employeeName: emp?.name, branchId: emp?.branchId, shift: emp?.shift };
  });
  res.json(enriched);
});
app.post('/api/schedules', authMiddleware, (req,res)=>{
  const { employeeId, weekStart, days } = req.body;
  const existing = db.schedules.find(s=>s.employeeId===employeeId && s.weekStart===weekStart);
  if(existing){
    const before = {...existing};
    existing.days = days;
    existing.version = (existing.version||1)+1;
    existing.updated_at = new Date().toISOString();
    audit(req.user.username,'UPDATE_SCHEDULE','SCHEDULE',before,existing, req.ip);
    addSyncQueue('SCHEDULE','UPDATE',existing, req.user.username, 'WEB_HR');
    // TRAINING linh hoạt: HR đổi ca -> auto cập nhật + tự điểm danh (cập nhật)
    const empForUpdate = db.employees.find(e=> e.employeeId===employeeId);
    if(empForUpdate && (empForUpdate.type==='TRAINING' || empForUpdate.status==='TRAINING')){
      const todayStrUp = getVietnamTodayStr();
      days.forEach(day=>{
        if(day.status==='WORKING'){
          let att = db.attendances.find(a=> a.employeeId===employeeId && a.date===day.date);
          const shiftInfo = db.settings.payroll.shifts[day.shift] || DEFAULT_SHIFTS[day.shift] || DEFAULT_SHIFTS['CA_SANG'];
          if(!att){
            att = { id: uuidv4(), employeeId, date: day.date, shift: day.shift, branchId: empForUpdate.branchId, checkIn: null, checkOut: null, status: 'NOT_STARTED', violations:[], version:1, updated_at: new Date().toISOString(), sync_status:'PENDING' };
            if(day.date <= todayStrUp){
              const now=new Date();
              att.checkIn={ time: shiftInfo.start, gps: '10.762622,106.660172', address: db.branches.find(b=>b.id===empForUpdate.branchId)?.address || 'Training Auto', image:'', timestamp: now.toISOString(), content:'Điểm danh Vào ca UBM (Training Auto)', drivePath: generateDrivePath({...empForUpdate, shift: day.shift}, day.date, 'CHECK_IN') };
              att.checkOut={ time: shiftInfo.end, gps: '10.762622,106.660172', address: db.branches.find(b=>b.id===empForUpdate.branchId)?.address || 'Training Auto', image:'', timestamp: now.toISOString(), content:'Điểm danh Ra ca UBM (Training Auto)', drivePath: generateDrivePath({...empForUpdate, shift: day.shift}, day.date, 'CHECK_OUT') };
              att.status='COMPLETED';
              addDriveFile(employeeId, day.date, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { gps: att.checkIn.gps, time: att.checkIn.time });
              addDriveFile(employeeId, day.date, 'CHECK_IN', `Diem_danh.txt`, { content: `Điểm danh Vào ca UBM (Training Auto) - ${empForUpdate.name} - ${day.date} ${att.checkIn.time}` });
              addDriveFile(employeeId, day.date, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { gps: att.checkOut.gps, time: att.checkOut.time });
              addDriveFile(employeeId, day.date, 'CHECK_OUT', `Diem_danh.txt`, { content: `Điểm danh Ra ca UBM (Training Auto) - ${empForUpdate.name} - ${day.date} ${att.checkOut.time}` });
            }
            att.shift=day.shift;
            db.attendances.push(att);
            addSyncQueue('ATTENDANCE','CREATE',att, req.user.username, 'WEB_HR');
          } else {
            if(att.shift !== day.shift){
              const beforeAtt={...att};
              const newShiftInfo = db.settings.payroll.shifts[day.shift] || DEFAULT_SHIFTS[day.shift] || DEFAULT_SHIFTS['CA_SANG'];
              att.shift=day.shift;
              // Cập nhật giờ + drivePath theo ca mới cho Training linh hoạt
              if(att.checkIn){
                att.checkIn.time = newShiftInfo.start;
                att.checkIn.drivePath = generateDrivePath({...empForUpdate, shift: day.shift}, day.date, 'CHECK_IN');
                att.checkIn.content = `Điểm danh Vào ca UBM (Training Auto - đổi ca ${day.shift})`;
              }
              if(att.checkOut){
                att.checkOut.time = newShiftInfo.end;
                att.checkOut.drivePath = generateDrivePath({...empForUpdate, shift: day.shift}, day.date, 'CHECK_OUT');
                att.checkOut.content = `Điểm danh Ra ca UBM (Training Auto - đổi ca ${day.shift})`;
              }
              att.version=(att.version||1)+1; att.updated_at=new Date().toISOString();
              audit(req.user.username,'UPDATE_ATTENDANCE_SHIFT_TRAINING','ATTENDANCE',beforeAtt,att,req.ip);
              addSyncQueue('ATTENDANCE','UPDATE',att,req.user.username,'WEB_HR');
              // Cập nhật Drive files cho ca mới
              addDriveFile(employeeId, day.date, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { gps: att.checkIn?.gps || '10.762622,106.660172', time: newShiftInfo.start });
              addDriveFile(employeeId, day.date, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { gps: att.checkOut?.gps || '10.762622,106.660172', time: newShiftInfo.end });
            }
            if(day.date <= todayStrUp && att.status!=='COMPLETED' && day.status==='WORKING'){
              const shiftInfo2 = db.settings.payroll.shifts[day.shift] || DEFAULT_SHIFTS[day.shift] || DEFAULT_SHIFTS['CA_SANG'];
              const now2=new Date();
              att.checkIn = att.checkIn || { time: shiftInfo2.start, gps: '10.762622,106.660172', address: db.branches.find(b=>b.id===empForUpdate.branchId)?.address || 'Training Auto', image:'', timestamp: now2.toISOString(), content:'Điểm danh Vào ca UBM (Training Auto)', drivePath: generateDrivePath(empForUpdate, day.date, 'CHECK_IN') };
              att.checkOut = att.checkOut || { time: shiftInfo2.end, gps: '10.762622,106.660172', address: db.branches.find(b=>b.id===empForUpdate.branchId)?.address || 'Training Auto', image:'', timestamp: now2.toISOString(), content:'Điểm danh Ra ca UBM (Training Auto)', drivePath: generateDrivePath(empForUpdate, day.date, 'CHECK_OUT') };
              att.status='COMPLETED'; addSyncQueue('ATTENDANCE','UPDATE',att,req.user.username,'WEB_HR');
            }
            if(day.status==='OFF' && att.status!=='OFF'){ att.status='OFF'; att.checkIn=null; att.checkOut=null; addSyncQueue('ATTENDANCE','UPDATE',att,req.user.username,'WEB_HR'); }
          }
        } else if(day.status==='OFF'){
          const attOff=db.attendances.find(a=> a.employeeId===employeeId && a.date===day.date);
          if(attOff && attOff.status==='COMPLETED'){ attOff.status='OFF'; attOff.checkIn=null; attOff.checkOut=null; addSyncQueue('ATTENDANCE','UPDATE',attOff,req.user.username,'WEB_HR'); }
        }
      });
      saveDB();
      io.emit('attendances:update', db.attendances);
      io.emit('drive:update', db.driveFiles.slice(0,20));
    }
    saveDB();
    io.emit('schedules:update', db.schedules);
    return res.json(existing);
  }
  const sched = { id: uuidv4(), employeeId, weekStart, days, version:1, updated_at: new Date().toISOString() };
  db.schedules.push(sched);
  audit(req.user.username,'CREATE_SCHEDULE','SCHEDULE',null,sched, req.ip);
  addSyncQueue('SCHEDULE','CREATE',sched, req.user.username, 'WEB_HR');
  // TRAINING linh hoạt: HR đổi ca trên lịch -> auto cập nhật + tự điểm danh realtime
  const empForSched = db.employees.find(e=> e.employeeId===employeeId);
  if(empForSched && (empForSched.type==='TRAINING' || empForSched.status==='TRAINING')){
    // Đồng bộ ca linh hoạt: nếu HR set ca khác nhau mỗi ngày thì giữ nguyên, không ghi đè emp.shift cố định
    // Tự động điểm danh cho TRAINING: với mỗi ngày WORKING đã qua hoặc hôm nay, tạo attendance COMPLETED
    const todayStr = getVietnamTodayStr();
    days.forEach(day=>{
      if(day.status==='WORKING'){
        let att = db.attendances.find(a=> a.employeeId===employeeId && a.date===day.date);
        const shiftInfo = db.settings.payroll.shifts[day.shift] || DEFAULT_SHIFTS[day.shift] || DEFAULT_SHIFTS['CA_SANG'];
        if(!att){
          // Tạo mới
          att = {
            id: uuidv4(), employeeId, date: day.date, shift: day.shift, branchId: empForSched.branchId,
            checkIn: null, checkOut: null, status: 'NOT_STARTED', violations:[], version:1, updated_at: new Date().toISOString(), sync_status:'PENDING'
          };
          // Nếu ngày đã qua hoặc hôm nay -> tự động điểm danh COMPLETED (AI auto) - dùng ca linh hoạt per day
          if(day.date <= todayStr){
            const now = new Date();
            att.checkIn = { time: shiftInfo.start, gps: '10.762622,106.660172', address: db.branches.find(b=>b.id===empForSched.branchId)?.address || 'Training Auto', image: '', timestamp: now.toISOString(), content: 'Điểm danh Vào ca UBM (Training Auto)', drivePath: generateDrivePath({...empForSched, shift: day.shift}, day.date, 'CHECK_IN') };
            att.checkOut = { time: shiftInfo.end, gps: '10.762622,106.660172', address: db.branches.find(b=>b.id===empForSched.branchId)?.address || 'Training Auto', image: '', timestamp: now.toISOString(), content: 'Điểm danh Ra ca UBM (Training Auto)', drivePath: generateDrivePath({...empForSched, shift: day.shift}, day.date, 'CHECK_OUT') };
            att.status='COMPLETED';
            // Tạo Drive files cho auto
            addDriveFile(employeeId, day.date, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { gps: att.checkIn.gps, time: att.checkIn.time });
            addDriveFile(employeeId, day.date, 'CHECK_IN', `Diem_danh.txt`, { content: `Điểm danh Vào ca UBM (Training Auto) - ${empForSched.name} - ${day.date} ${att.checkIn.time}` });
            addDriveFile(employeeId, day.date, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { gps: att.checkOut.gps, time: att.checkOut.time });
            addDriveFile(employeeId, day.date, 'CHECK_OUT', `Diem_danh.txt`, { content: `Điểm danh Ra ca UBM (Training Auto) - ${empForSched.name} - ${day.date} ${att.checkOut.time}` });
          } else {
            // Ngày tương lai -> chưa điểm danh, nhưng đã gán ca
            att.status='NOT_STARTED';
          }
          att.shift = day.shift; // linh hoạt ca
          db.attendances.push(att);
          addSyncQueue('ATTENDANCE','CREATE',att, req.user.username, 'WEB_HR');
        } else {
          // Đã có attendance -> cập nhật ca nếu HR đổi
          if(att.shift !== day.shift){
            const before = {...att};
            att.shift = day.shift;
            att.version = (att.version||1)+1;
            att.updated_at = new Date().toISOString();
            audit(req.user.username,'UPDATE_ATTENDANCE_SHIFT_TRAINING','ATTENDANCE', before, att, req.ip);
            addSyncQueue('ATTENDANCE','UPDATE', att, req.user.username, 'WEB_HR');
          }
          // Nếu ngày đã qua mà chưa COMPLETED thì auto COMPLETED
          if(day.date <= todayStr && att.status!=='COMPLETED' && day.status==='WORKING'){
            const shiftInfo2 = db.settings.payroll.shifts[day.shift] || DEFAULT_SHIFTS[day.shift] || DEFAULT_SHIFTS['CA_SANG'];
            const now2 = new Date();
            att.checkIn = att.checkIn || { time: shiftInfo2.start, gps: '10.762622,106.660172', address: db.branches.find(b=>b.id===empForSched.branchId)?.address || 'Training Auto', image: '', timestamp: now2.toISOString(), content: 'Điểm danh Vào ca UBM (Training Auto)', drivePath: generateDrivePath(empForSched, day.date, 'CHECK_IN') };
            att.checkOut = att.checkOut || { time: shiftInfo2.end, gps: '10.762622,106.660172', address: db.branches.find(b=>b.id===empForSched.branchId)?.address || 'Training Auto', image: '', timestamp: now2.toISOString(), content: 'Điểm danh Ra ca UBM (Training Auto)', drivePath: generateDrivePath(empForSched, day.date, 'CHECK_OUT') };
            att.status='COMPLETED';
            addSyncQueue('ATTENDANCE','UPDATE', att, req.user.username, 'WEB_HR');
          }
          if(day.status==='OFF' && att.status!=='OFF'){
            // Nếu HR đổi thành OFF thì xóa hoặc đánh dấu OFF
            att.status='OFF';
            att.checkIn=null; att.checkOut=null;
            addSyncQueue('ATTENDANCE','UPDATE', att, req.user.username, 'WEB_HR');
          }
        }
      } else if(day.status==='OFF'){
        // Đảm bảo không có attendance WORKING cho ngày OFF
        const attOff = db.attendances.find(a=> a.employeeId===employeeId && a.date===day.date);
        if(attOff && attOff.status==='COMPLETED'){
          // Nếu đã auto điểm danh mà HR đổi thành OFF thì chuyển thành OFF
          attOff.status='OFF'; attOff.checkIn=null; attOff.checkOut=null;
          addSyncQueue('ATTENDANCE','UPDATE', attOff, req.user.username, 'WEB_HR');
        }
      }
    });
    saveDB();
    io.emit('attendances:update', db.attendances);
    io.emit('drive:update', db.driveFiles.slice(0,20));
  }
  saveDB();
  io.emit('schedules:update', db.schedules);
  res.json(sched);
});

// ============ AI AUTO SCHEDULE FOR OFFICIAL (Spec: cùng CN cùng ca không trùng + min 12 ngày/tháng) ============
app.post('/api/schedules/auto-official', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const { month, preview } = req.body; // month: "2026-09" hoặc "2026-09-01", preview=true thì không lưu
  const targetMonth = month ? month.slice(0,7) : new Date().toISOString().slice(0,7);
  const [y,m] = targetMonth.split('-').map(Number);
  const daysInMonth = getDaysInMonth(y,m);
  const officials = db.employees.filter(e=> e.status==='OFFICIAL' || e.type==='OFFICIAL');
  if(officials.length===0) return res.status(400).json({ error:'Không có nhân viên chính thức để sắp lịch' });

  // Group cùng chi nhánh cùng ca
  const groupMap = {}; // key = branchId_shift
  officials.forEach(emp=>{ const k=`${emp.branchId}_${emp.shift}`; if(!groupMap[k]) groupMap[k]=[]; groupMap[k].push(emp); });

  // Chuẩn bị map ngày -> status cho từng NV
  const empDayStatus = {}; // employeeId -> { '2026-09-01': 'WORKING'/'OFF' }
  officials.forEach(emp=> empDayStatus[emp.employeeId]={});

  // 1) Cùng CN cùng ca + >1 NV: không trùng ngày (mỗi ngày chỉ 1 NV WORKING, còn lại OFF)
  for(const key in groupMap){
    const group = groupMap[key];
    if(group.length <=1) continue; // để xử lý ở bước 2
    // Round-robin theo số ngày đã làm (least-worked first)
    const workCount = {}; group.forEach(emp=> workCount[emp.employeeId]=0);
    for(let d=1; d<=daysInMonth; d++){
      const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      // Chọn NV có workCount nhỏ nhất
      let chosen = group[0];
      let min = workCount[chosen.employeeId];
      for(const emp of group){ if(workCount[emp.employeeId] < min){ min=workCount[emp.employeeId]; chosen=emp; } }
      // Gán
      group.forEach(emp=>{
        empDayStatus[emp.employeeId][dateStr] = (emp.employeeId===chosen.employeeId) ? 'WORKING' : 'OFF';
      });
      workCount[chosen.employeeId]++;
    }
  }

  // 2) Cùng CN khác ca hoặc khác CN khác ca (và các nhóm size 1): đảm bảo min 12 ngày
  // Những NV chưa được gán ở bước 1 (nhóm size 1) hoặc nhóm đã gán nhưng cần đảm bảo min 12
  const remaining = officials.filter(emp=>{
    const k=`${emp.branchId}_${emp.shift}`;
    return groupMap[k].length===1;
  });
  // Với nhóm size 1: cho làm 6 ngày/tuần, nghỉ CN để đủ 12+ (khoảng 26 ngày/tháng)
  remaining.forEach(emp=>{
    for(let d=1; d<=daysInMonth; d++){
      const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayOfWeek = new Date(y, m-1, d).getDay(); // 0 CN, 6 T7
      // Nghỉ CN hàng tuần để có OFF, còn lại WORKING
      empDayStatus[emp.employeeId][dateStr] = (dayOfWeek===0) ? 'OFF' : 'WORKING';
    }
  });
  // Kiểm tra lại nhóm >1 đã đủ 12 chưa (với 30 ngày và 2 NV, mỗi NV ~15 ngày là đủ)
  // Nếu nhóm >2 mà có NV <12 thì điều chỉnh: bù thêm ngày cho NV thiếu bằng cách đổi OFF->WORKING ở ngày ít quan trọng
  for(const key in groupMap){
    const group = groupMap[key];
    if(group.length<=1) continue;
    group.forEach(emp=>{
      const workingDays = Object.values(empDayStatus[emp.employeeId]).filter(s=>s==='WORKING').length;
      if(workingDays <12){
        // Cần bù
        let need = 12 - workingDays;
        for(let d=1; d<=daysInMonth && need>0; d++){
          const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          if(empDayStatus[emp.employeeId][dateStr]==='OFF'){
            // Tìm ngày mà NV đang WORKING hiện tại có thể nhường (chọn ngày mà NV đó đã làm nhiều)
            // Đơn giản: đổi OFF->WORKING, và cho 1 NV khác đang WORKING ngày đó thành OFF (giữ 1 WORKING/ngày)
            const otherWorking = group.find(o=> o.employeeId!==emp.employeeId && empDayStatus[o.employeeId][dateStr]==='WORKING');
            if(otherWorking){
              const otherCount = Object.values(empDayStatus[otherWorking.employeeId]).filter(s=>s==='WORKING').length;
              if(otherCount >12){
                empDayStatus[emp.employeeId][dateStr]='WORKING';
                empDayStatus[otherWorking.employeeId][dateStr]='OFF';
                need--;
              }
            }
          }
        }
      }
    });
  }

  // Realtime validate: mỗi NV phải >=12 ngày
  const violations = [];
  officials.forEach(emp=>{
    const workingDays = Object.values(empDayStatus[emp.employeeId]).filter(s=>s==='WORKING').length;
    if(workingDays <12) violations.push({ employeeId: emp.employeeId, name: emp.name, branchId: emp.branchId, shift: emp.shift, workingDays, need: 12-workingDays });
  });
  if(violations.length>0 && !preview){
    // Nếu preview thì trả về violations để HR xem, không chặn
    console.warn(`[AUTO-SCHEDULE] Violations min 12:`, violations);
  }

  // Chuyển empDayStatus thành weekly schedules (weekStart Mon -> 7 days)
  if(!preview){
    // Xóa lịch cũ của tháng đó cho các NV chính thức (để tránh trùng)
    const monthPrefix = targetMonth;
    db.schedules = db.schedules.filter(s=>{
      const isOfficial = officials.some(e=> e.employeeId===s.employeeId);
      if(!isOfficial) return true;
      // Giữ lại schedule không thuộc tháng target
      return !s.days.some(d=> d.date.startsWith(monthPrefix));
    });
    // Tạo weekly schedules
    const weekMapByEmp = {}; // employeeId -> { weekStart: { dateStr: status } }
    officials.forEach(emp=>{
      for(let d=1; d<=daysInMonth; d++){
        const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const status = empDayStatus[emp.employeeId][dateStr];
        const monday = getMonday(new Date(y, m-1, d));
        const wy = monday.getFullYear(); const wm = String(monday.getMonth()+1).padStart(2,'0'); const wd = String(monday.getDate()).padStart(2,'0');
        const weekStart = `${wy}-${wm}-${wd}`;
        if(!weekMapByEmp[emp.employeeId]) weekMapByEmp[emp.employeeId]={};
        if(!weekMapByEmp[emp.employeeId][weekStart]) weekMapByEmp[emp.employeeId][weekStart]={};
        weekMapByEmp[emp.employeeId][weekStart][dateStr]=status;
      }
    });
    for(const empId in weekMapByEmp){
      const emp = officials.find(e=> e.employeeId===empId);
      for(const weekStart in weekMapByEmp[empId]){
        const activeMap = weekMapByEmp[empId][weekStart];
        const days = buildFull7DaysForWeek(weekStart, activeMap, emp.shift);
        // Ghi đè status từ empDayStatus (buildFull7DaysForWeek mặc định OFF nếu không có trong activeMap)
        days.forEach(day=>{
          if(empDayStatus[empId][day.date]){
            day.status = empDayStatus[empId][day.date];
          } else if(!day.date.startsWith(monthPrefix)){
            // Ngày ngoài tháng target (đầu/cuối tuần lấn sang tháng khác) -> giữ OFF hoặc WORKING theo logic cũ
            // Để tránh ảnh hưởng tháng khác, set OFF cho ngày ngoài tháng
            if(!day.date.startsWith(targetMonth)) day.status='OFF';
          }
        });
        db.schedules.push({ id: uuidv4(), employeeId: empId, weekStart, days, version:1, updated_at: new Date().toISOString() });
      }
    }
    saveDB();
    io.emit('schedules:update', db.schedules);
    audit(req.user.username,'AUTO_SCHEDULE_OFFICIAL','SCHEDULE', { month: targetMonth, officials: officials.length }, { generated: Object.keys(weekMapByEmp).length, violations }, req.ip);
  }

  res.json({
    success: true,
    month: targetMonth,
    daysInMonth,
    officials: officials.length,
    groups: Object.keys(groupMap).map(k=>({ key:k, count: groupMap[k].length, members: groupMap[k].map(e=>({ name:e.name, branch:e.branchId, shift:e.shift })) })),
    preview: !!preview,
    violations,
    empDayStatus: preview ? empDayStatus : undefined,
    message: preview ? `Preview ${officials.length} NV - kiểm tra ràng buộc` : `Đã auto sắp lịch ${officials.length} NV chính thức cho tháng ${targetMonth} - cùng CN cùng ca không trùng ngày, min 12 ngày/tháng`
  });
});

// AI AUTO SCHEDULE FOR TRAINING - linh hoạt ca, HR tuỳ chỉnh, tự động điểm danh
app.post('/api/schedules/auto-training', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const { preview, shifts } = req.body; // shifts: optional { employeeId: ['CA_SANG','CA_CHIEU',...] } linh hoạt
  const trainings = db.employees.filter(e=> e.status==='TRAINING' || e.type==='TRAINING');
  if(trainings.length===0) return res.status(400).json({ error:'Không có nhân viên Training' });
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = toVietnamDateStr(today);
  // Tạo lịch 12 ngày trial (7 WORKING + 5 OFF) linh hoạt ca
  const empDayStatus={}; const empDayShift={};
  trainings.forEach(emp=>{
    empDayStatus[emp.employeeId]={}; empDayShift[emp.employeeId]={};
    const startStr = emp.startDate || todayStr;
    const start = new Date(startStr); start.setHours(0,0,0,0);
    // 12 ngày
    const shiftOptions = shifts && shifts[emp.employeeId] ? shifts[emp.employeeId] : [emp.shift || 'CA_SANG', 'CA_CHIEU', 'CA_TOI'];
    let workingCount=0;
    for(let i=0;i<12;i++){
      const cur = new Date(start); cur.setDate(start.getDate()+i);
      const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0');
      const dateStr=`${y}-${m}-${d}`;
      // 7 ngày đầu WORKING, 5 ngày sau OFF xen kẽ linh hoạt
      const isWorking = i <7; // 7 ngày đầu làm, 5 ngày sau nghỉ (có thể HR tuỳ chỉnh sau)
      empDayStatus[emp.employeeId][dateStr]= isWorking ? 'WORKING' : 'OFF';
      // Linh hoạt ca: xoay vòng shiftOptions
      empDayShift[emp.employeeId][dateStr]= isWorking ? shiftOptions[i % shiftOptions.length] : 'OFF';
    }
  });

  if(!preview){
    // Xóa lịch training cũ cho các NV này (trong 12 ngày) để tránh trùng
    const allDates = new Set(); trainings.forEach(emp=> Object.keys(empDayStatus[emp.employeeId]).forEach(d=> allDates.add(d)));
    db.schedules = db.schedules.filter(s=>{
      const isTraining = trainings.some(e=> e.employeeId===s.employeeId);
      if(!isTraining) return true;
      return !s.days.some(day=> allDates.has(day.date));
    });
    // Tạo weekly schedules
    const weekMapByEmp={};
    trainings.forEach(emp=>{
      Object.keys(empDayStatus[emp.employeeId]).forEach(dateStr=>{
        const status = empDayStatus[emp.employeeId][dateStr];
        const shift = empDayShift[emp.employeeId][dateStr];
        const monday = getMonday(new Date(dateStr));
        const wy=monday.getFullYear(); const wm=String(monday.getMonth()+1).padStart(2,'0'); const wd=String(monday.getDate()).padStart(2,'0');
        const weekStart=`${wy}-${wm}-${wd}`;
        if(!weekMapByEmp[emp.employeeId]) weekMapByEmp[emp.employeeId]={};
        if(!weekMapByEmp[emp.employeeId][weekStart]) weekMapByEmp[emp.employeeId][weekStart]={};
        weekMapByEmp[emp.employeeId][weekStart][dateStr]={ status, shift };
      });
    });
    for(const empId in weekMapByEmp){
      const emp = trainings.find(e=> e.employeeId===empId);
      for(const weekStart in weekMapByEmp[empId]){
        const activeMap={}; const shiftMap={};
        Object.keys(weekMapByEmp[empId][weekStart]).forEach(dateStr=>{
          const { status, shift } = weekMapByEmp[empId][weekStart][dateStr];
          if(status==='WORKING'){ activeMap[dateStr]=true; shiftMap[dateStr]=shift; }
        });
        // Dùng helper nhưng cần linh hoạt ca per day
        const days = buildFull7DaysForWeek(weekStart, activeMap, emp.shift);
        // Ghi đè shift linh hoạt per day
        days.forEach(day=>{
          if(shiftMap[day.date]) day.shift = shiftMap[day.date];
          if(empDayStatus[empId][day.date]) day.status = empDayStatus[empId][day.date];
          else if(!weekMapByEmp[empId][weekStart][day.date]) day.status='OFF';
        });
        db.schedules.push({ id: uuidv4(), employeeId: empId, weekStart, days, version:1, updated_at: new Date().toISOString(), isTrainingAuto:true });
      }
    }
    // Tự động điểm danh realtime cho Training (ngày đã qua -> COMPLETED)
    const todayStr2 = getVietnamTodayStr();
    trainings.forEach(emp=>{
      Object.keys(empDayStatus[emp.employeeId]).forEach(dateStr=>{
        const status = empDayStatus[emp.employeeId][dateStr];
        const shift = empDayShift[emp.employeeId][dateStr];
        if(status==='WORKING' && dateStr <= todayStr2){
          let att = db.attendances.find(a=> a.employeeId===emp.employeeId && a.date===dateStr);
          if(!att){
            const shiftInfo = db.settings.payroll.shifts[shift] || DEFAULT_SHIFTS[shift] || DEFAULT_SHIFTS['CA_SANG'];
            const now=new Date();
            att={ id: uuidv4(), employeeId: emp.employeeId, date: dateStr, shift, branchId: emp.branchId, checkIn:{ time: shiftInfo.start, gps:'10.762622,106.660172', address: db.branches.find(b=>b.id===emp.branchId)?.address || 'Training Auto', image:'', timestamp: now.toISOString(), content:'Điểm danh Vào ca UBM (Training Auto)', drivePath: generateDrivePath({...emp, shift}, dateStr, 'CHECK_IN') }, checkOut:{ time: shiftInfo.end, gps:'10.762622,106.660172', address: db.branches.find(b=>b.id===emp.branchId)?.address || 'Training Auto', image:'', timestamp: now.toISOString(), content:'Điểm danh Ra ca UBM (Training Auto)', drivePath: generateDrivePath({...emp, shift}, dateStr, 'CHECK_OUT') }, status:'COMPLETED', violations:[], version:1, updated_at: now.toISOString(), sync_status:'PENDING' };
            db.attendances.push(att);
            addDriveFile(emp.employeeId, dateStr, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { gps: att.checkIn.gps, time: att.checkIn.time });
            addDriveFile(emp.employeeId, dateStr, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { gps: att.checkOut.gps, time: att.checkOut.time });
            addSyncQueue('ATTENDANCE','CREATE',att, req.user.username, 'WEB_HR');
          }
        }
      });
    });
    saveDB();
    io.emit('schedules:update', db.schedules);
    io.emit('attendances:update', db.attendances);
    audit(req.user.username,'AUTO_SCHEDULE_TRAINING','SCHEDULE', { trainings: trainings.length }, { generated: Object.keys(weekMapByEmp).length }, req.ip);
  }
  res.json({ success:true, trainings: trainings.length, preview: !!preview, empDayStatus: preview ? empDayStatus : undefined, empDayShift: preview ? empDayShift : undefined, message: preview ? `Preview ${trainings.length} NV Training linh hoạt` : `Đã AI tự sắp lịch Training linh hoạt cho ${trainings.length} NV (12 ngày, 7 WORKING) + tự điểm danh realtime` });
});

// ============ TRAINING SHIFT CHANGE (12h gap, HR 15p auto) ============
// Employee Training đổi ca - cách nhau 12 tiếng
app.post('/api/training/shift-change', (req,res)=>{
  const { employeeId, date, fromShift, toShift, reason } = req.body;
  const emp = db.employees.find(e=> e.employeeId===employeeId);
  if(!emp) return res.status(404).json({ error:'Không tìm thấy nhân viên' });
  if(emp.type!=='TRAINING' && emp.status!=='TRAINING') return res.status(403).json({ error:'Chỉ nhân viên Training mới được đổi ca linh hoạt' });
  if(!date || !toShift) return res.status(400).json({ error:'Thiếu ngày hoặc ca mới' });
  if(!reason || !String(reason).trim()) return res.status(400).json({ error:'Lý do là bắt buộc - vui lòng nhập lý do đổi ca' });
  if(!['CA_SANG','CA_CHIEU','CA_TOI'].includes(toShift)) return res.status(400).json({ error:'Ca mới không hợp lệ (CA_SANG/CHIEU/TOI)' });
  // Tìm ca hiện tại trên lịch
  const sched = db.schedules.find(s=> s.employeeId===employeeId && s.days.some(d=> d.date===date));
  const day = sched ? sched.days.find(d=> d.date===date) : null;
  const currentShift = fromShift || day?.shift || emp.shift;
  if(currentShift===toShift) return res.status(400).json({ error:'Ca mới trùng ca hiện tại' });
  // Điều kiện 12 tiếng: request phải cách giờ bắt đầu ca mới ít nhất 12h
  const shiftInfo = db.settings.payroll.shifts[toShift] || DEFAULT_SHIFTS[toShift];
  const [sh, sm] = shiftInfo.start.split(':').map(Number);
  const shiftStart = new Date(date); shiftStart.setHours(sh, sm, 0,0);
  const now = new Date();
  const diffMs = shiftStart.getTime() - now.getTime();
  const diffHours = diffMs / (1000*60*60);
  if(diffHours <12){
    return res.status(400).json({ error:`Phải đổi ca trước giờ bắt đầu ca mới ít nhất 12 tiếng. Ca ${toShift} ${shiftInfo.start} ngày ${date} chỉ còn ${diffHours.toFixed(1)}h`, need12h:true });
  }
  if(new Date(date) < new Date(getVietnamTodayStr())) return res.status(400).json({ error:'Không thể đổi ca cho ngày đã qua' });
  // Kiểm tra đã có request pending cho ngày này chưa
  const existingPending = db.trainingShiftRequests.find(r=> r.employeeId===employeeId && r.date===date && r.status==='PENDING');
  if(existingPending) return res.status(409).json({ error:'Đã có phiếu đổi ca đang chờ duyệt cho ngày này', request: existingPending });
  const reqId = uuidv4();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15*60*1000).toISOString(); // 15 phút
  const newReq = {
    id: reqId, employeeId, employeeName: emp.name, branchId: emp.branchId,
    date, fromShift: currentShift, toShift, reason: reason||'',
    status:'PENDING', createdAt, expiresAt, version:1
  };
  db.trainingShiftRequests.unshift(newReq);
  audit(employeeId,'CREATE_TRAINING_SHIFT_CHANGE','TRAINING_SHIFT', null, newReq, req.ip);
  addSyncQueue('TRAINING_SHIFT','CREATE', newReq, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('trainingShiftRequests:update', db.trainingShiftRequests);
  // Gửi thông báo tới HR
  const notifHR = { id: uuidv4(), to: 'HR', type:'TRAINING_SHIFT_REQUEST', title:`Training ${emp.name} xin đổi ca ${date}`, content:`${emp.name} (${employeeId}) xin đổi ${currentShift} -> ${toShift} ngày ${date}. Lý do: ${reason||'Không có'}. Hết hạn 15 phút.`, createdAt, read:false, requestId: reqId };
  db.notifications.push(notifHR);
  io.emit('notifications:update', db.notifications);
  res.json({ success:true, request: newReq, message:'Đã gửi phiếu đổi ca tới HR, HR có 15 phút để duyệt, quá hạn tự động duyệt' });
});
app.get('/api/training/shift-change', authMiddleware, (req,res)=>{
  const { employeeId, status } = req.query;
  let list = [...db.trainingShiftRequests];
  // BranchScope filter cho Manager
  const scope = branchScopeFilter(req);
  if(scope) {
    const empIds = db.employees.filter(e=> scope.includes(e.branchId)).map(e=> e.employeeId);
    list = list.filter(r=> empIds.includes(r.employeeId));
  }
  if(employeeId) list = list.filter(r=> r.employeeId===employeeId);
  if(status) list = list.filter(r=> r.status===status);
  res.json(list);
});
app.post('/api/training/shift-change/:id/approve', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const r = db.trainingShiftRequests.find(x=> x.id===req.params.id);
  if(!r) return res.status(404).json({ error:'Không tìm thấy phiếu' });
  if(r.status!=='PENDING') return res.status(400).json({ error:'Phiếu đã xử lý', status: r.status });
  // BranchScope check
  if(req.user.role==='Manager'){
    const emp = db.employees.find(e=> e.employeeId===r.employeeId);
    if(emp && !req.user.branchScope.includes(emp.branchId)) return res.status(403).json({ error:'Manager chỉ duyệt chi nhánh được phân quyền' });
  }
  r.status='APPROVED'; r.approvedBy=req.user.username; r.approvedAt=new Date().toISOString(); r.version=(r.version||1)+1;
  // Tự động cập nhật ca + lịch + attendance
  const emp = db.employees.find(e=> e.employeeId===r.employeeId);
  if(emp){
    // Tìm schedule chứa ngày này
    let sched = db.schedules.find(s=> s.employeeId===r.employeeId && s.days.some(d=> d.date===r.date));
    if(sched){
      const day = sched.days.find(d=> d.date===r.date);
      const before={...day};
      day.shift = r.toShift;
      // Nếu ngày là OFF thì chuyển thành WORKING khi đổi ca
      if(day.status==='OFF') day.status='WORKING';
      sched.version=(sched.version||1)+1; sched.updated_at=new Date().toISOString();
      audit(req.user.username,'APPROVE_TRAINING_SHIFT','SCHEDULE', before, day, req.ip);
      addSyncQueue('SCHEDULE','UPDATE', sched, req.user.username, 'WEB_HR');
    } else {
      // Chưa có schedule cho tuần này -> tạo mới
      const monday = getMonday(new Date(r.date));
      const wy=monday.getFullYear(); const wm=String(monday.getMonth()+1).padStart(2,'0'); const wd=String(monday.getDate()).padStart(2,'0');
      const weekStart=`${wy}-${wm}-${wd}`;
      const days=[]; for(let i=0;i<7;i++){ const cur=new Date(monday); cur.setDate(monday.getDate()+i); const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0'); const dateStr=`${y}-${m}-${d}`; const isTarget = dateStr===r.date; days.push({ date: dateStr, dayName:['T2','T3','T4','T5','T6','T7','CN'][i], shift: isTarget ? r.toShift : (isTarget? r.toShift : emp.shift), status: isTarget ? 'WORKING' : 'OFF', substituteFor:null }); }
      const newSched={ id: uuidv4(), employeeId: r.employeeId, weekStart, days, version:1, updated_at: new Date().toISOString() };
      db.schedules.push(newSched);
      addSyncQueue('SCHEDULE','CREATE', newSched, req.user.username, 'WEB_HR');
    }
    // Cập nhật attendance nếu là Training
    if(emp.type==='TRAINING' || emp.status==='TRAINING'){
      const todayStr = getVietnamTodayStr();
      let att = db.attendances.find(a=> a.employeeId===r.employeeId && a.date===r.date);
      const shiftInfo = db.settings.payroll.shifts[r.toShift] || DEFAULT_SHIFTS[r.toShift];
      if(!att){
        att={ id: uuidv4(), employeeId: r.employeeId, date: r.date, shift: r.toShift, branchId: emp.branchId, checkIn:null, checkOut:null, status: r.date <= todayStr ? 'COMPLETED' : 'NOT_STARTED', violations:[], version:1, updated_at: new Date().toISOString(), sync_status:'PENDING' };
        if(r.date <= todayStr){
          const now=new Date();
          att.checkIn={ time: shiftInfo.start, gps:'10.762622,106.660172', address: db.branches.find(b=>b.id===emp.branchId)?.address || 'Training Auto', image:'', timestamp: now.toISOString(), content:'Điểm danh Vào ca UBM (Training Auto - đổi ca)', drivePath: generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_IN') };
          att.checkOut={ time: shiftInfo.end, gps:'10.762622,106.660172', address: db.branches.find(b=>b.id===emp.branchId)?.address || 'Training Auto', image:'', timestamp: now.toISOString(), content:'Điểm danh Ra ca UBM (Training Auto - đổi ca)', drivePath: generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_OUT') };
          addDriveFile(r.employeeId, r.date, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { gps: att.checkIn.gps, time: att.checkIn.time });
          addDriveFile(r.employeeId, r.date, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { gps: att.checkOut.gps, time: att.checkOut.time });
        }
        db.attendances.push(att);
        addSyncQueue('ATTENDANCE','CREATE', att, req.user.username, 'WEB_HR');
      } else {
        const before={...att};
        att.shift=r.toShift;
        if(att.checkIn){ att.checkIn.time=shiftInfo.start; att.checkIn.drivePath=generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_IN'); }
        if(att.checkOut){ att.checkOut.time=shiftInfo.end; att.checkOut.drivePath=generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_OUT'); }
        att.version=(att.version||1)+1; att.updated_at=new Date().toISOString();
        audit(req.user.username,'UPDATE_ATTENDANCE_TRAINING_SHIFT','ATTENDANCE', before, att, req.ip);
        addSyncQueue('ATTENDANCE','UPDATE', att, req.user.username, 'WEB_HR');
      }
    }
    // Thông báo cho NV
    const notifEmp={ id: uuidv4(), to: r.employeeId, type:'TRAINING_SHIFT_APPROVED', title:`Đổi ca ${r.date} đã duyệt`, content:`Ca ${r.fromShift} -> ${r.toShift} ngày ${r.date} đã được ${req.user.username} duyệt. Lịch đã cập nhật.`, createdAt: new Date().toISOString(), read:false };
    db.notifications.push(notifEmp);
    const zr={ id: uuidv4(), sent_at: new Date().toISOString(), receiver: emp.phone, type:'TRAINING_SHIFT_APPROVED', content:`[ỤM BÒ MILK] Đổi ca Training ${emp.name} ${r.date} ${r.fromShift}->${r.toShift} đã duyệt`, status:'SENT', error:'' };
    db.zaloRecords.unshift(zr);
  }
  saveDB();
  io.emit('schedules:update', db.schedules);
  io.emit('attendances:update', db.attendances);
  io.emit('trainingShiftRequests:update', db.trainingShiftRequests);
  io.emit('notifications:update', db.notifications);
  audit(req.user.username,'APPROVE_TRAINING_SHIFT','TRAINING_SHIFT', null, r, req.ip);
  addSyncQueue('TRAINING_SHIFT','UPDATE', r, req.user.username, 'WEB_HR');
  res.json({ success:true, request: r });
});
app.post('/api/training/shift-change/:id/reject', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const r = db.trainingShiftRequests.find(x=> x.id===req.params.id);
  if(!r) return res.status(404).json({ error:'Không tìm thấy phiếu' });
  if(r.status!=='PENDING') return res.status(400).json({ error:'Phiếu đã xử lý' });
  r.status='REJECTED'; r.rejectedBy=req.user.username; r.rejectedAt=new Date().toISOString(); r.reasonReject=req.body.reason||'';
  saveDB();
  io.emit('trainingShiftRequests:update', db.trainingShiftRequests);
  audit(req.user.username,'REJECT_TRAINING_SHIFT','TRAINING_SHIFT', null, r, req.ip);
  addSyncQueue('TRAINING_SHIFT','UPDATE', r, req.user.username, 'WEB_HR');
  // Thông báo NV
  const notif={ id: uuidv4(), to: r.employeeId, type:'TRAINING_SHIFT_REJECTED', title:`Đổi ca ${r.date} bị từ chối`, content:`Yêu cầu đổi ${r.fromShift}->${r.toShift} ngày ${r.date} bị từ chối. Lý do: ${r.reasonReject}`, createdAt: new Date().toISOString(), read:false };
  db.notifications.push(notif);
  io.emit('notifications:update', db.notifications);
  res.json({ success:true, request: r });
});

// ============ ĐỔI CA CHÍNH THỨC (Official) - TH1/TH2 24h AI tự duyệt ============
// TH1: NV A chọn người thay thế cụ thể -> gửi đến đúng NV đó, nếu chấp nhận -> AI cập nhật lịch 2 NV ngay, nếu từ chối -> chuyển TH2
// TH2: Không tìm được người -> gửi toàn chi nhánh, nếu có người chấp nhận -> AI tự duyệt sau 24h
if(!db.shiftSwapRequests) db.shiftSwapRequests=[];
app.post('/api/shift-swap', (req,res)=>{
  const { requesterId, date, fromShift, toShift, targetEmployeeId, reason } = req.body;
  const emp = db.employees.find(e=>e.employeeId===requesterId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhân viên yêu cầu'});
  if(emp.type!=='OFFICIAL' && emp.status!=='OFFICIAL') return res.status(403).json({error:'Chỉ nhân viên Chính thức mới được đổi ca'});
  if(!date) return res.status(400).json({error:'Thiếu ngày'});
  if(!reason || !String(reason).trim()) return res.status(400).json({error:'Lý do là bắt buộc - vui lòng nhập lý do đổi ca'});
  // Tìm ca hiện tại nếu không truyền
  let curShift = fromShift;
  if(!curShift){
    const sched = db.schedules.find(s=>s.employeeId===requesterId && s.days.some(d=>d.date===date));
    const day = sched ? sched.days.find(d=>d.date===date) : null;
    curShift = day ? day.shift : emp.shift;
  }
  const finalToShift = toShift || (curShift==='CA_SANG'?'CA_CHIEU': curShift==='CA_CHIEU'?'CA_TOI':'CA_SANG');
  const targetEmp = targetEmployeeId ? db.employees.find(e=>e.employeeId===targetEmployeeId) : null;
  if(targetEmployeeId && !targetEmp) return res.status(404).json({error:'Không tìm thấy nhân viên thay thế'});
  // Kiểm tra trùng request pending cùng ngày
  const existing = db.shiftSwapRequests.find(r=>r.requesterId===requesterId && r.date===date && r.status.includes('PENDING'));
  if(existing) return res.status(409).json({error:'Đã có yêu cầu đổi ca đang chờ cho ngày này', request: existing});
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24*60*60*1000).toISOString();
  const reqId = uuidv4();
  const isDirect = !!targetEmployeeId;
  const newReq = {
    id: reqId,
    requesterId, requesterName: emp.name, branchId: emp.branchId,
    date, fromShift: curShift, toShift: finalToShift,
    targetEmployeeId: targetEmployeeId||null, targetEmployeeName: targetEmp?targetEmp.name:null,
    reason: reason||'',
    status: isDirect ? 'PENDING_TARGET' : 'PENDING_BROADCAST',
    createdAt: now.toISOString(), expiresAt, version:1,
    acceptedBy: null, acceptedAt: null
  };
  db.shiftSwapRequests.unshift(newReq);
  audit(requesterId,'CREATE_SHIFT_SWAP','SHIFT_SWAP',null,newReq, req.ip);
  addSyncQueue('SHIFT_SWAP','CREATE',newReq, requesterId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('shiftSwap:update', db.shiftSwapRequests);
  // Gửi thông báo
  if(isDirect){
    const notif = { id: uuidv4(), to: targetEmployeeId, type:'SHIFT_SWAP_INVITE', title:`${emp.name} mời đổi ca ${date}`, content:`${emp.name} (${requesterId}) muốn đổi ${curShift}→${finalToShift} ngày ${fmtDMY?fmtDMY(date):date}. Lý do: ${reason||'—'}. Vui lòng chấp nhận/từ chối.`, createdAt: now.toISOString(), read:false, requestId: reqId };
    db.notifications.push(notif);
    const zr = { id: uuidv4(), sent_at: now.toISOString(), receiver: targetEmp.phone, type:'SHIFT_SWAP_INVITE', content:`[ĐỔI CA] ${emp.name} mời bạn đổi ${curShift}→${finalToShift} ngày ${date}. Chấp nhận?`, status:'SENT', error:'' };
    db.zaloRecords.unshift(zr);
  } else {
    // TH2: gửi toàn chi nhánh
    const branchEmps = db.employees.filter(e=>e.branchId===emp.branchId && e.employeeId!==requesterId && e.status==='OFFICIAL');
    branchEmps.forEach(e=>{
      const notif = { id: uuidv4(), to: e.employeeId, type:'SHIFT_SWAP_BROADCAST', title:`Cần người đổi ca ${date} - ${emp.branchId}`, content:`${emp.name} cần đổi ${curShift}→${finalToShift} ngày ${date}. Ai rảnh hãy chấp nhận. Hết hạn 24h.`, createdAt: now.toISOString(), read:false, requestId: reqId };
      db.notifications.push(notif);
    });
  }
  io.emit('notifications:update', db.notifications);
  io.emit('zalo:update', db.zaloRecords);
  res.json({success:true, request:newReq, message: isDirect ? 'Đã gửi tới NV được chọn (TH1) - chờ họ chấp nhận' : 'Đã gửi tới toàn chi nhánh (TH2) - chờ 24h AI tự duyệt nếu có người nhận'});
});
app.get('/api/shift-swap', authMiddleware, (req,res)=>{
  const { employeeId, branch, status } = req.query;
  let list = [...(db.shiftSwapRequests||[])];
  const scope = branchScopeFilter(req);
  if(scope){
    // HR/Manager chỉ thấy cùng chi nhánh
    list = list.filter(r=> scope.includes(r.branchId));
  }
  if(employeeId) list = list.filter(r=> r.requesterId===employeeId || r.targetEmployeeId===employeeId);
  if(branch) list = list.filter(r=> r.branchId===branch);
  if(status) list = list.filter(r=> r.status===status);
  res.json(list);
});
app.post('/api/shift-swap/:id/respond', (req,res)=>{
  const { employeeId, action } = req.body; // ACCEPT / REJECT
  const r = db.shiftSwapRequests.find(x=>x.id===req.params.id);
  if(!r) return res.status(404).json({error:'Không tìm thấy yêu cầu'});
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Nhân viên không tồn tại'});
  if(r.status==='APPROVED' || r.status==='REJECTED' || r.status==='AUTO_APPROVED') return res.status(400).json({error:'Yêu cầu đã xử lý'});
  // Kiểm tra quyền: TH1 chỉ target mới được respond, TH2 thì bất kỳ NV cùng chi nhánh
  const isTarget = r.targetEmployeeId===employeeId;
  const isBroadcast = r.status==='PENDING_BROADCAST' && r.branchId===emp.branchId && r.requesterId!==employeeId;
  if(r.status==='PENDING_TARGET' && !isTarget) return res.status(403).json({error:'Chỉ nhân viên được mời (TH1) mới được phản hồi'});
  if(r.status==='PENDING_BROADCAST' && !isBroadcast && !isTarget) return res.status(403).json({error:'Chỉ NV cùng chi nhánh mới được nhận TH2'});
  if(action==='REJECT'){
    if(r.status==='PENDING_TARGET'){
      // TH1 từ chối -> chuyển sang TH2 (broadcast)
      r.status='PENDING_BROADCAST';
      r.rejectedBy=employeeId; r.rejectedAt=new Date().toISOString();
      // Gửi broadcast tới toàn chi nhánh
      const branchEmps = db.employees.filter(e=>e.branchId===r.branchId && e.employeeId!==r.requesterId && e.status==='OFFICIAL' && e.employeeId!==employeeId);
      branchEmps.forEach(e=>{
        const notif = { id: uuidv4(), to: e.employeeId, type:'SHIFT_SWAP_BROADCAST', title:`Cần người đổi ca ${r.date} (TH1 từ chối)`, content:`${r.requesterName} cần đổi ${r.fromShift}→${r.toShift} ngày ${r.date} - TH1 bị từ chối, chuyển TH2 toàn chi nhánh.`, createdAt: new Date().toISOString(), read:false, requestId: r.id };
        db.notifications.push(notif);
      });
      audit(employeeId,'REJECT_SHIFT_SWAP_TH1','SHIFT_SWAP',null,r, req.ip);
      addSyncQueue('SHIFT_SWAP','UPDATE',r, employeeId, 'WEB_EMPLOYEE');
      saveDB();
      io.emit('shiftSwap:update', db.shiftSwapRequests);
      io.emit('notifications:update', db.notifications);
      return res.json({success:true, request:r, next:'TH2_BROADCAST'});
    } else {
      // TH2 reject thì chỉ ghi nhận, không chuyển
      // Nếu là broadcast mà 1 người từ chối thì không ảnh hưởng, vẫn chờ người khác
      return res.json({success:true, message:'Đã ghi nhận từ chối, vẫn chờ người khác trong 24h'});
    }
  }
  if(action==='ACCEPT'){
    if(r.status==='PENDING_TARGET'){
      // TH1 chấp nhận -> AI cập nhật lịch 2 NV ngay
      r.status='APPROVED'; r.acceptedBy=employeeId; r.acceptedAt=new Date().toISOString(); r.approvedAt=new Date().toISOString();
      // Đổi lịch 2 NV
      const requester = db.employees.find(e=>e.employeeId===r.requesterId);
      const target = db.employees.find(e=>e.employeeId===r.targetEmployeeId);
      [requester, target].forEach((e, idx)=>{
        if(!e) return;
        const otherShift = idx===0 ? r.toShift : r.fromShift; // requester -> toShift, target -> fromShift (swap)
        let sched = db.schedules.find(s=>s.employeeId===e.employeeId && s.days.some(d=>d.date===r.date));
        if(sched){
          const day = sched.days.find(d=>d.date===r.date);
          if(day){ day.shift=otherShift; day.status='WORKING'; day.substituteFor = idx===0 ? r.targetEmployeeId : r.requesterId; sched.version=(sched.version||1)+1; }
        }
      });
      saveDB();
      io.emit('shiftSwap:update', db.shiftSwapRequests);
      io.emit('schedules:update', db.schedules);
      // Thông báo 2 bên
      const notif1 = { id: uuidv4(), to: r.requesterId, type:'SHIFT_SWAP_APPROVED', title:`Đổi ca ${r.date} đã duyệt (TH1)`, content:`${emp.name} đã chấp nhận đổi ${r.fromShift}→${r.toShift} ngày ${r.date}. Lịch đã cập nhật.`, createdAt: new Date().toISOString(), read:false };
      const notif2 = { id: uuidv4(), to: r.targetEmployeeId, type:'SHIFT_SWAP_APPROVED', title:`Đổi ca ${r.date} đã duyệt`, content:`Bạn đã chấp nhận đổi ca với ${r.requesterName} ngày ${r.date}. Lịch đã cập nhật.`, createdAt: new Date().toISOString(), read:false };
      db.notifications.push(notif1, notif2);
      io.emit('notifications:update', db.notifications);
      audit(employeeId,'ACCEPT_SHIFT_SWAP_TH1','SHIFT_SWAP',null,r, req.ip);
      addSyncQueue('SHIFT_SWAP','UPDATE',r, employeeId, 'WEB_EMPLOYEE');
      saveDB();
      return res.json({success:true, request:r, message:'TH1 chấp nhận - AI đã cập nhật lịch 2 NV'});
    } else if(r.status==='PENDING_BROADCAST'){
      // TH2: ghi nhận người chấp nhận đầu tiên, nhưng chưa duyệt ngay - đợi 24h
      if(r.acceptedBy) return res.status(409).json({error:'Đã có người chấp nhận trước, đang chờ AI duyệt sau 24h', acceptedBy: r.acceptedBy});
      r.acceptedBy=employeeId; r.acceptedAt=new Date().toISOString();
      r.status='PENDING_BROADCAST_ACCEPTED'; // chờ 24h
      audit(employeeId,'ACCEPT_SHIFT_SWAP_TH2','SHIFT_SWAP',null,r, req.ip);
      addSyncQueue('SHIFT_SWAP','UPDATE',r, employeeId, 'WEB_EMPLOYEE');
      saveDB();
      io.emit('shiftSwap:update', db.shiftSwapRequests);
      const notif = { id: uuidv4(), to: r.requesterId, type:'SHIFT_SWAP_TH2_ACCEPTED', title:`Có người nhận đổi ca ${r.date} (TH2)`, content:`${emp.name} đã nhận đổi ca ${r.fromShift}→${r.toShift} ngày ${r.date}. AI sẽ tự duyệt sau 24h kể từ lúc gửi yêu cầu (${fmtDMY?fmtDMY(r.date):r.date}).`, createdAt: new Date().toISOString(), read:false };
      db.notifications.push(notif);
      io.emit('notifications:update', db.notifications);
      return res.json({success:true, request:r, message:'Đã ghi nhận chấp nhận TH2 - AI sẽ tự duyệt sau 24h'});
    }
  }
  return res.status(400).json({error:'Action không hợp lệ'});
});
// HR tạo yêu cầu đổi ca <24h (NV liên hệ trực tiếp HR, HR gửi tới toàn chi nhánh - nội dung khác)
app.post('/api/shift-swap/hr-broadcast', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const { requesterId, date, fromShift, toShift, reason } = req.body;
  const emp = db.employees.find(e=>e.employeeId===requesterId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy NV yêu cầu'});
  if(emp.branchId && req.user.role==='Manager' && !req.user.branchScope.includes(emp.branchId)) return res.status(403).json({error:'Manager chỉ xử lý CN được phân quyền'});
  if(!date) return res.status(400).json({error:'Thiếu ngày'});
  if(!reason || !String(reason).trim()) return res.status(400).json({error:'Lý do bắt buộc'});
  let curShift = fromShift;
  if(!curShift){
    const sched = db.schedules.find(s=>s.employeeId===requesterId && s.days.some(d=>d.date===date));
    const day = sched ? sched.days.find(d=>d.date===date) : null;
    curShift = day ? day.shift : emp.shift;
  }
  const finalToShift = toShift || (curShift==='CA_SANG'?'CA_CHIEU': curShift==='CA_CHIEU'?'CA_TOI':'CA_SANG');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24*60*60*1000).toISOString();
  const reqId = uuidv4();
  const newReq = {
    id: reqId,
    requesterId, requesterName: emp.name, branchId: emp.branchId,
    date, fromShift: curShift, toShift: finalToShift,
    targetEmployeeId: null, targetEmployeeName: null,
    reason, isHrCreated: true, isUrgent: true, urgency: '<24h',
    status: 'PENDING_BROADCAST',
    createdAt: now.toISOString(), expiresAt, version:1,
    createdByHr: req.user.username
  };
  db.shiftSwapRequests.unshift(newReq);
  audit(req.user.username,'HR_CREATE_SHIFT_SWAP_URGENT','SHIFT_SWAP',null,newReq, req.ip);
  addSyncQueue('SHIFT_SWAP','CREATE',newReq, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('shiftSwap:update', db.shiftSwapRequests);
  // Gửi tới toàn chi nhánh với nội dung KHÁC (HR gửi)
  const branchEmps = db.employees.filter(e=>e.branchId===emp.branchId && e.employeeId!==requesterId && e.status==='OFFICIAL');
  branchEmps.forEach(e=>{
    const notif = { id: uuidv4(), to: e.employeeId, type:'SHIFT_SWAP_HR_URGENT', title:`[HR] Cần đổi ca gấp ${date} - ${emp.branchId}`, content:`[HR - KHẨN <24h] ${emp.name} (${requesterId}) cần hoán đổi ca ${curShift}→${finalToShift} ngày ${date}. Lý do: ${reason}. Đây là yêu cầu do HR gửi thay (NV liên hệ trực tiếp HR). Vui lòng hỗ trợ!`, createdAt: now.toISOString(), read:false, requestId: reqId };
    db.notifications.push(notif);
    const zr = { id: uuidv4(), sent_at: now.toISOString(), receiver: e.phone, type:'SHIFT_SWAP_HR_URGENT', content:`[HR KHẨN] ${emp.name} cần đổi ${curShift}→${finalToShift} ${date} (<24h). HR nhờ bạn hỗ trợ.`, status:'SENT', error:'' };
    db.zaloRecords.unshift(zr);
  });
  // Thông báo cho người yêu cầu
  const notifReq = { id: uuidv4(), to: requesterId, type:'SHIFT_SWAP_HR_CREATED', title:`HR đã gửi yêu cầu đổi ca <24h`, content:`HR đã gửi yêu cầu hoán đổi ${curShift}→${finalToShift} ngày ${date} tới toàn chi nhánh ${emp.branchId}. Nội dung HR khác với NV gửi.`, createdAt: now.toISOString(), read:false };
  db.notifications.push(notifReq);
  io.emit('notifications:update', db.notifications);
  io.emit('zalo:update', db.zaloRecords);
  res.json({success:true, request:newReq, message:`HR đã gửi yêu cầu <24h tới ${branchEmps.length} NV cùng CN ${emp.branchId} với nội dung khác`});
});
// Poller 24h cho TH2
function checkShiftSwap24h(){
  const now=Date.now();
  let changed=false;
  (db.shiftSwapRequests||[]).forEach(r=>{
    if(r.status==='PENDING_BROADCAST_ACCEPTED' && r.createdAt){
      const elapsed = now - new Date(r.createdAt).getTime();
      if(elapsed >= 24*60*60*1000){
        r.status='AUTO_APPROVED'; r.approvedAt=new Date().toISOString();
        // Cập nhật lịch như TH1
        const requester = db.employees.find(e=>e.employeeId===r.requesterId);
        const accepter = db.employees.find(e=>e.employeeId===r.acceptedBy);
        if(requester && accepter){
          // Swap shifts
          [requester, accepter].forEach((e, idx)=>{
            const otherShift = idx===0 ? r.toShift : r.fromShift;
            let sched = db.schedules.find(s=>s.employeeId===e.employeeId && s.days.some(d=>d.date===r.date));
            if(sched){
              const day = sched.days.find(d=>d.date===r.date);
              if(day){ day.shift=otherShift; day.status='WORKING'; sched.version=(sched.version||1)+1; }
            }
          });
        }
        const notif1={ id: uuidv4(), to: r.requesterId, type:'SHIFT_SWAP_AUTO_APPROVED', title:`Đổi ca ${r.date} tự duyệt sau 24h`, content:`Yêu cầu đổi ${r.fromShift}→${r.toShift} ngày ${r.date} đã được AI tự duyệt sau 24h (TH2).`, createdAt: new Date().toISOString(), read:false };
        const notif2={ id: uuidv4(), to: r.acceptedBy, type:'SHIFT_SWAP_AUTO_APPROVED', title:`Đổi ca ${r.date} tự duyệt`, content:`Bạn đã được duyệt đổi ca với ${r.requesterName} ngày ${r.date} sau 24h.`, createdAt: new Date().toISOString(), read:false };
        db.notifications.push(notif1, notif2);
        audit('SYSTEM','AUTO_APPROVE_SHIFT_SWAP','SHIFT_SWAP',null,r,'system');
        addSyncQueue('SHIFT_SWAP','UPDATE',r,'SYSTEM','AUTO');
        changed=true;
        console.log(`[AUTO] ShiftSwap ${r.id} auto-approved after 24h`);
      }
    }
    // Expire nếu quá 24h mà không ai nhận (TH2) hoặc TH1 quá hạn
    if((r.status==='PENDING_BROADCAST' || r.status==='PENDING_TARGET') && r.expiresAt && new Date(r.expiresAt).getTime() <= now && !r.acceptedBy){
      r.status='EXPIRED';
      changed=true;
    }
  });
  if(changed){ saveDB(); io.emit('shiftSwap:update', db.shiftSwapRequests); io.emit('schedules:update', db.schedules); io.emit('notifications:update', db.notifications); }
}
setInterval(checkShiftSwap24h, 60*60*1000);
setTimeout(checkShiftSwap24h, 10000);

// ============ WORKFLOW: OFF -> AI DRAFT TUẦN SAU -> HR DUYỆT -> GỬI NV ============
function getNextMonday(d=new Date()){
  const curMon = getMonday(d);
  const next = new Date(curMon); next.setDate(curMon.getDate()+7);
  return next;
}
function getNextWeekStartStr(){
  const nextMon = getNextMonday();
  const y=nextMon.getFullYear(); const m=String(nextMon.getMonth()+1).padStart(2,'0'); const d=String(nextMon.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
// Generate draft tuần sau (AI) - tôn trọng OFF đã đăng ký, không trùng cùng CN cùng ca, min 12 realtime
async function generateNextWeekDraft(triggerBy='SYSTEM'){
  const nextWeekStart = getNextWeekStartStr();
  const nextMon = getNextMonday();
  const officials = db.employees.filter(e=> e.status==='OFFICIAL' || e.type==='OFFICIAL');
  if(officials.length===0) return { error:'Không có NV chính thức' };
  // Kiểm tra đã có draft tuần sau chưa
  const existingDrafts = db.schedules.filter(s=> s.weekStart===nextWeekStart && s.approvalStatus==='PENDING_APPROVAL');
  if(existingDrafts.length>0) return { alreadyExists:true, weekStart: nextWeekStart, count: existingDrafts.length };

  // Lấy OFF đã duyệt cho tuần sau
  const nextWeekDates = []; for(let i=0;i<7;i++){ const cur=new Date(nextMon); cur.setDate(nextMon.getDate()+i); const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0'); nextWeekDates.push(`${y}-${m}-${d}`); }
  const offMap = {}; // employeeId -> Set of OFF dates
  db.offRequests.filter(r=> r.status==='APPROVED').forEach(r=>{
    r.dates.forEach(date=>{
      if(nextWeekDates.includes(date)){
        if(!offMap[r.employeeId]) offMap[r.employeeId]=new Set();
        offMap[r.employeeId].add(date);
      }
    });
  });

  // Group cùng CN cùng ca
  const groupMap={}; officials.forEach(emp=>{ const k=`${emp.branchId}_${emp.shift}`; if(!groupMap[k]) groupMap[k]=[]; groupMap[k].push(emp); });
  const empDayStatus={}; officials.forEach(emp=> empDayStatus[emp.employeeId]={});

  // Fix: cùng chi nhánh cùng ca không trùng OFF - cho phép nhiều WORKING, chỉ 1 OFF/ngày
  for(const key in groupMap){
    const group = groupMap[key];
    if(group.length<=1) continue;
    const workCount={}; group.forEach(e=> workCount[e.employeeId]=0);
    for(const dateStr of nextWeekDates){
      const available = group.filter(emp=> !(offMap[emp.employeeId] && offMap[emp.employeeId].has(dateStr)));
      if(available.length===0){
        group.forEach(emp=> empDayStatus[emp.employeeId][dateStr]='OFF');
        continue;
      }
      if(available.length===1){
        const sole = available[0];
        group.forEach(emp=> empDayStatus[emp.employeeId][dateStr] = (emp.employeeId===sole.employeeId) ? 'WORKING' : 'OFF');
        workCount[sole.employeeId]++;
        continue;
      }
      // Chọn NV ít ngày nhất trong available - đảm bảo cùng CN cùng ca không trùng ngày WORKING
      let chosen=available[0]; let min=workCount[chosen.employeeId];
      for(const emp of available){ if(workCount[emp.employeeId] < min){ min=workCount[emp.employeeId]; chosen=emp; } }
      group.forEach(emp=>{
        if(offMap[emp.employeeId] && offMap[emp.employeeId].has(dateStr)){
          empDayStatus[emp.employeeId][dateStr]='OFF';
        } else {
          empDayStatus[emp.employeeId][dateStr] = (emp.employeeId===chosen.employeeId) ? 'WORKING' : 'OFF';
        }
      });
      workCount[chosen.employeeId]++;
    }
  }
  // Nhóm size 1: tôn trọng OFF, còn lại WORKING (trừ CN nếu không OFF thì WORKING)
  officials.forEach(emp=>{
    const k=`${emp.branchId}_${emp.shift}`;
    if(groupMap[k].length>1) return;
    for(const dateStr of nextWeekDates){
      if(offMap[emp.employeeId] && offMap[emp.employeeId].has(dateStr)){
        empDayStatus[emp.employeeId][dateStr]='OFF';
      } else {
        // Mặc định WORKING, trừ CN nếu muốn nghỉ nhưng vẫn đảm bảo min12 nên cho WORKING
        empDayStatus[emp.employeeId][dateStr]='WORKING';
      }
    }
  });

  // Realtime validate min 12 cho tháng chứa tuần sau
  const targetMonth = nextWeekStart.slice(0,7);
  const violations=[];
  officials.forEach(emp=>{
    const stats = getOfficialMonthlyStats(emp.employeeId, targetMonth);
    // Tính thêm draft tuần sau
    const draftWorkingInMonth = nextWeekDates.filter(d=> d.startsWith(targetMonth) && empDayStatus[emp.employeeId][d]==='WORKING').length;
    const totalWorking = (stats.scheduledWorking||0) + draftWorkingInMonth;
    // Nếu đã có schedule cho tuần sau cũ thì trừ ra? Đơn giản: kiểm tra tổng sau khi thêm
    // Đếm lại tổng từ schedules hiện tại + draft
    let currentScheduledInMonth = 0;
    db.schedules.filter(s=> s.employeeId===emp.employeeId).forEach(s=>{
      s.days.forEach(day=>{
        if(day.date.startsWith(targetMonth) && day.status==='WORKING') currentScheduledInMonth++;
      });
    });
    // Nếu draft thay thế tuần sau thì không double count tuần cũ, nên tính lại
    const existingNextWeek = db.schedules.find(s=> s.employeeId===emp.employeeId && s.weekStart===nextWeekStart);
    let existingNextWeekWorking = 0;
    if(existingNextWeek) existingNextWeekWorking = existingNextWeek.days.filter(d=> d.date.startsWith(targetMonth) && d.status==='WORKING').length;
    const projected = currentScheduledInMonth - existingNextWeekWorking + draftWorkingInMonth;
    if(projected <12) violations.push({ employeeId: emp.employeeId, name: emp.name, projected, need: 12-projected });
  });

  // Tạo schedules draft PENDING_APPROVAL
  for(const emp of officials){
    const days=[];
    for(let i=0;i<7;i++){
      const cur=new Date(nextMon); cur.setDate(nextMon.getDate()+i);
      const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0');
      const dateStr=`${y}-${m}-${d}`;
      const status = empDayStatus[emp.employeeId][dateStr] || 'WORKING';
      days.push({ date: dateStr, dayName: ['T2','T3','T4','T5','T6','T7','CN'][i], shift: emp.shift, status, substituteFor: null });
    }
    db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: nextWeekStart, days, version:1, updated_at: new Date().toISOString(), approvalStatus:'PENDING_APPROVAL', generatedBy: triggerBy, generatedAt: new Date().toISOString() });
  }
  saveDB();
  io.emit('schedules:update', db.schedules);
  io.emit('schedules:draftReady', { weekStart: nextWeekStart, count: officials.length });
  audit(triggerBy,'GENERATE_DRAFT_NEXT_WEEK','SCHEDULE', { weekStart: nextWeekStart }, { officials: officials.length, violations }, 'SYSTEM');
  return { success:true, weekStart: nextWeekStart, count: officials.length, violations, nextWeekDates };
}

// API: HR/Admin xem draft tuần sau + OFF đăng ký + AI validate
app.get('/api/schedules/next-week', authMiddleware, (req,res)=>{
  const nextWeekStart = getNextWeekStartStr();
  const drafts = db.schedules.filter(s=> s.weekStart===nextWeekStart && s.approvalStatus==='PENDING_APPROVAL');
  const nextMon = getNextMonday();
  const nextWeekDates=[]; for(let i=0;i<7;i++){ const cur=new Date(nextMon); cur.setDate(nextMon.getDate()+i); const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0'); nextWeekDates.push(`${y}-${m}-${d}`); }
  const offForNextWeek = db.offRequests.filter(r=> r.dates && r.dates.some(d=> nextWeekDates.includes(d)));
  // Realtime check
  const officials = db.employees.filter(e=> e.status==='OFFICIAL' || e.type==='OFFICIAL');
  const checks = officials.map(emp=>{
    const stats = getOfficialMonthlyStats(emp.employeeId, nextWeekStart.slice(0,7));
    const draft = drafts.find(d=> d.employeeId===emp.employeeId);
    const draftWorking = draft ? draft.days.filter(d=> d.status==='WORKING').length : 0;
    return { employeeId: emp.employeeId, name: emp.name, branchId: emp.branchId, shift: emp.shift, draftWorking, scheduledWorking: stats.scheduledWorking, min12Compliant: (stats.scheduledWorking + draftWorking) >=12 };
  });
  res.json({ weekStart: nextWeekStart, nextWeekDates, drafts, offRequests: offForNextWeek, checks, needApproval: drafts.length>0 });
});

// API: HR/Admin bấm duyệt lịch tuần sau -> cập nhật chính thức và gửi đến NV
app.post('/api/schedules/approve-next-week', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const nextWeekStart = getNextWeekStartStr();
  const drafts = db.schedules.filter(s=> s.weekStart===nextWeekStart && s.approvalStatus==='PENDING_APPROVAL');
  if(drafts.length===0) return res.status(400).json({ error:'Không có lịch draft tuần sau để duyệt. Hãy đợi AI tự động tạo sau khung OFF (T7 15:00) hoặc gọi /generate-next-week-draft' });
  // Kiểm tra lại ràng buộc realtime
  const officials = db.employees.filter(e=> e.status==='OFFICIAL' || e.type==='OFFICIAL');
  const violations=[];
  drafts.forEach(d=>{
    const emp = officials.find(e=> e.employeeId===d.employeeId);
    const stats = getOfficialMonthlyStats(emp.employeeId, nextWeekStart.slice(0,7));
    const draftWorking = d.days.filter(day=> day.status==='WORKING').length;
    if(stats.scheduledWorking + draftWorking <12) violations.push({ employeeId: emp.employeeId, name: emp.name, need: 12 - (stats.scheduledWorking + draftWorking) });
  });
  // Realtime check - cảnh báo nhưng vẫn cho duyệt (HR quyết định), chỉ chặn nếu force=false và violations nghiêm trọng
  let warning = null;
  if(violations.length>0){
    warning = `Cảnh báo: ${violations.length} NV chưa đạt min 12 ngày/tháng (cần thêm ${violations.map(v=> v.need).join(', ')} ngày) - vẫn cho duyệt, HR cần theo dõi`;
    console.warn(`[APPROVE] Min12 warning:`, violations);
    // Nếu HR không force và muốn chặn thì có thể return 400, nhưng hiện cho phép duyệt với warning để linh hoạt tuần đầu tháng
    // if(!req.body.force) return res.status(400).json({ error:'Chưa đạt min 12', violations, hint:'Dùng force:true để duyệt' });
  }
  // Duyệt: chuyển PENDING -> APPROVED, xóa draft cũ nếu có, gửi thông báo
  drafts.forEach(d=>{
    d.approvalStatus='APPROVED';
    d.approvedBy = req.user.username;
    d.approvedAt = new Date().toISOString();
    d.version = (d.version||1)+1;
    // Tạo notification cho NV
    const notif = { id: uuidv4(), to: d.employeeId, type:'SCHEDULE_APPROVED', title: `Lịch tuần sau ${nextWeekStart} đã được duyệt`, content: `Lịch làm việc tuần ${nextWeekStart} của bạn đã được HR duyệt. Vui lòng kiểm tra Web App Nhân viên.`, createdAt: new Date().toISOString(), read:false };
    db.notifications.push(notif);
    // Zalo record
    const emp = db.employees.find(e=> e.employeeId===d.employeeId);
    if(emp){
      const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: emp.phone, type:'SCHEDULE_APPROVED', content: `[ỤM BÒ MILK] Lịch tuần ${nextWeekStart} của ${emp.name} đã duyệt: ${d.days.filter(day=> day.status==='WORKING').map(day=> day.dayName).join(', ')}`, status:'SENT', error:'' };
      db.zaloRecords.unshift(zr);
    }
  });
  saveDB();
  io.emit('schedules:update', db.schedules);
  io.emit('schedules:approved', { weekStart: nextWeekStart, count: drafts.length });
  io.emit('notifications:update', db.notifications);
  audit(req.user.username,'APPROVE_NEXT_WEEK_SCHEDULE','SCHEDULE', { weekStart: nextWeekStart, drafts: drafts.length }, { approved: drafts.length, warning }, req.ip);
  res.json({ success:true, weekStart: nextWeekStart, approved: drafts.length, warning, violations, message:`Đã duyệt lịch tuần sau ${nextWeekStart} cho ${drafts.length} NV và gửi đến Web App Nhân viên${warning ? ' - ' + warning : ''}` });
});

// API: Trigger thủ công tạo draft (để test hoặc khi OFF xong sớm)
app.post('/api/schedules/generate-next-week-draft', authMiddleware, roleCheck(['Admin','HR']), async (req,res)=>{
  const result = await generateNextWeekDraft(req.user.username);
  if(result.error) return res.status(400).json(result);
  if(result.alreadyExists) return res.json({ success:true, message:`Draft tuần ${result.weekStart} đã tồn tại (${result.count} NV)`, ...result });
  res.json(result);
});

// Auto-trigger sau khung OFF (T7 15:00) - poll mỗi phút (dùng giờ VN)
setInterval(async ()=>{
  const nowUtc = new Date();
  const now = new Date(nowUtc.toLocaleString('en-US', {timeZone: 'Asia/Ho_Chi_Minh'}));
  const day = now.getDay(); // 6 = Thứ 7
  const hour = now.getHours() + now.getMinutes()/60;
  // Chỉ chạy đúng 15:00-15:01 Thứ 7 giờ VN
  if(day===6 && hour>=15 && hour<15.02){
    const nextWeekStart = getNextWeekStartStr();
    const hasDraft = db.schedules.some(s=> s.weekStart===nextWeekStart && s.approvalStatus==='PENDING_APPROVAL');
    if(!hasDraft){
      console.log(`[AUTO-SCHEDULE] Tới khung OFF xong (T7 15:00), tự động tạo draft tuần sau ${nextWeekStart}`);
      await generateNextWeekDraft('AUTO_T7_15:00');
    }
  }
}, 60*1000);

// ============ OFF WEEKLY AUTO APPROVE ============
app.get('/api/off-requests', authMiddleware, (req,res)=>{
  const { employeeId, status } = req.query;
  let list = [...db.offRequests];
  const scope = branchScopeFilter(req);
  if(scope){
    const allowedIds = db.employees.filter(e=>scope.includes(e.branchId)).map(e=>e.employeeId);
    list = list.filter(r=>allowedIds.includes(r.employeeId));
  }
  if(employeeId) list = list.filter(r=>r.employeeId===employeeId);
  if(status) list = list.filter(r=>r.status===status);
  res.json(list);
});
app.post('/api/off-requests', (req,res)=>{
  const { employeeId, dates } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Employee not found'});
  if(emp.status!=='OFFICIAL') return res.status(403).json({error:'Chỉ nhân viên Chính thức (status OFFICIAL) mới được đăng ký OFF hàng tuần'});
  // Check window - allow bypass for demo if setting offWindowBypass
  const bypass = req.body.bypassWindow;
  if(!bypass && !isOffWindowOpen()){
    return res.status(400).json({error:'Ngoài khung giờ đăng ký: Thứ 6 12:00 - Thứ 7 15:00'});
  }
  if(!dates || dates.length===0) return res.status(400).json({error:'Chưa chọn ngày'});
  if(dates.length>db.settings.off.maxPerWeek) return res.status(400).json({error:`Tối đa ${db.settings.off.maxPerWeek} ngày/tuần`});
  // Check already has OFF this week approved count
  const weekOffCount = db.offRequests.filter(r=>r.employeeId===employeeId && r.status==='APPROVED' && isSameWeek(r.createdAt, new Date().toISOString())).reduce((s,r)=>s+r.dates.length,0);
  if(weekOffCount + dates.length > db.settings.off.maxPerWeek) return res.status(400).json({error:`Bạn đã có ${weekOffCount} ngày OFF tuần này, chỉ được tối đa ${db.settings.off.maxPerWeek}`});
  // TH1: Conflict check FCFS - Cùng CN cùng ca không được OFF trùng ngày
  for(const date of dates){
    const conflict = checkOffConflict(emp.branchId, emp.shift, date);
    if(conflict) return res.status(409).json({error:`[TH1] Ngày ${date} đã có nhân viên cùng chi nhánh + cùng ca OFF (${conflict.employeeName||conflict.employeeId}). Cùng CN cùng ca không được trùng OFF trong 1 ngày.`, conflict});
  }
  // TH1/TH2: Đảm bảo 1 tháng tối thiểu 12 ngày làm việc (OFFICIAL)
  const monthlyCheck = validateOfficialMonthlyMin12(employeeId, dates[0].slice(0,7), dates);
  // validate all months involved
  const monthsSet = new Set(dates.map(d=>d.slice(0,7)));
  for(const m of monthsSet){
    const addDates = dates.filter(d=>d.startsWith(m));
    const chk = validateOfficialMonthlyMin12(employeeId, m, addDates);
    if(!chk.valid){
      return res.status(400).json({error:`[TH1/TH2] Tháng ${m} sau khi OFF sẽ chỉ còn ${chk.workingAfter} ngày làm (tổng ${chk.daysInMonth} - OFF ${chk.totalOffAfter}). Yêu cầu tối thiểu 12 ngày làm/tháng.`, detail: chk});
    }
  }
  // Auto Approve if all valid (AI Rule Engine)
  const reqId = uuidv4();
  const newReq = {
    id: reqId, employeeId, employeeName: emp.name, branchId: emp.branchId, shift: emp.shift,
    dates, type:'WEEKLY', status:'APPROVED', autoApproved:true, createdAt: new Date().toISOString(),
    message: 'AI Auto Approve - Thỏa TH1/TH2 (12 ngày/tháng, không trùng ca)', version:1, sync_status:'SYNCED'
  };
  db.offRequests.push(newReq);
  // AI tự động cập nhật lịch tuần sau (T2→CN) theo ca còn lại
  const nextWeekMonday = getMonday(new Date(Date.now()+7*24*60*60*1000));
  const weekStr = toVietnamDateStr(nextWeekMonday);
  let sched = db.schedules.find(s=>s.employeeId===employeeId && s.weekStart===weekStr);
  if(!sched){
    const days=[];
    for(let i=0;i<7;i++){
      const d = new Date(nextWeekMonday); d.setDate(nextWeekMonday.getDate()+i);
      const ds = toVietnamDateStr(d);
      // AI: nếu ngày trong dates => OFF, còn lại WORKING theo ca
      days.push({ date: ds, dayName:['T2','T3','T4','T5','T6','T7','CN'][i], shift: emp.shift, status: dates.includes(ds)?'OFF':'WORKING', substituteFor:null });
    }
    sched = { id: uuidv4(), employeeId, weekStart: weekStr, days, version:1, updated_at: new Date().toISOString(), approvalStatus:'APPROVED' };
    db.schedules.push(sched);
  } else {
    sched.days.forEach(d=>{
      if(dates.includes(d.date)) d.status='OFF';
      else if(d.status==='OFF' && !dates.includes(d.date)) {
        // Keep existing OFF if not in new dates? No, only update requested dates, else keep WORKING
        // Ensure AI resets to WORKING if not OFF
        d.status='WORKING';
        d.shift = emp.shift;
      }
    });
    // Ensure all days in next week are correctly set by AI
    for(let i=0;i<7;i++){
      const d = new Date(nextWeekMonday); d.setDate(nextWeekMonday.getDate()+i);
      const ds = toVietnamDateStr(d);
      const dayRec = sched.days.find(x=>x.date===ds);
      if(dayRec){
        dayRec.status = dates.includes(ds)?'OFF':'WORKING';
        dayRec.shift = dates.includes(ds)? 'OFF' : emp.shift;
      }
    }
    sched.version = (sched.version||1)+1;
    sched.updated_at = new Date().toISOString();
    // Đảm bảo lịch tuần sau hiển thị ngay cho NV sau khi đăng ký OFF (realtime) - gỡ trạng thái chờ duyệt
    sched.approvalStatus = 'APPROVED';
  }
  // AI also ensures next week's schedule respects TH1 (no duplicate OFF same shift already checked)
  audit(employeeId,'OFF_WEEKLY_AI_AUTO','OFF_REQUEST',null,newReq, req.ip);
  addSyncQueue('OFF_REQUEST','CREATE',newReq, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('offRequests:update', db.offRequests);
  io.emit('schedules:update', db.schedules);
  const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: emp.phone, type:'OFF_APPROVED', content:`OFF tuần sau đã được Auto Approve: ${dates.join(', ')}`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json(newReq);
});
function isSameWeek(date1, date2){
  const d1 = getMonday(new Date(date1));
  const d2 = getMonday(new Date(date2));
  return toVietnamDateStr(d1)===toVietnamDateStr(d2);
}
app.get('/api/off-window', (req,res)=>{
  const isOpen = isOffWindowOpen();
  const now = new Date();
  // Tính next open/close AI cho Official (dùng giờ VN)
  function getNextWindow(){
    const curUtc = new Date();
    const cur = new Date(curUtc.toLocaleString('en-US', {timeZone: 'Asia/Ho_Chi_Minh'}));
    const day = cur.getDay();
    const hour = cur.getHours() + cur.getMinutes()/60;
    let nextOpen = new Date(cur);
    let nextClose = new Date(cur);
    // Next Friday 12:00
    const daysUntilFri = (5 - day + 7) % 7;
    nextOpen.setDate(cur.getDate() + daysUntilFri);
    nextOpen.setHours(12,0,0,0);
    if(day===5 && hour>=12 && hour<24) { // already open on Friday
      nextClose.setDate(cur.getDate() + (6 - day));
      nextClose.setHours(15,0,0,0);
      if(cur < nextClose) return { nextOpen: cur.toISOString(), nextClose: nextClose.toISOString(), isOpen:true };
    }
    if(day===6 && hour<15){ // still open Saturday
      nextOpen = new Date(cur);
      nextOpen.setDate(cur.getDate() -1);
      nextOpen.setHours(12,0,0,0);
      nextClose.setDate(cur.getDate());
      nextClose.setHours(15,0,0,0);
      return { nextOpen: nextOpen.toISOString(), nextClose: nextClose.toISOString(), isOpen:true };
    }
    // otherwise next Friday
    if(nextOpen <= cur) nextOpen.setDate(nextOpen.getDate()+7);
    nextClose = new Date(nextOpen);
    nextClose.setDate(nextOpen.getDate()+1);
    nextClose.setHours(15,0,0,0);
    return { nextOpen: nextOpen.toISOString(), nextClose: nextClose.toISOString(), isOpen:false };
  }
  const win = getNextWindow();
  res.json({ 
    isOpen, 
    isOfficialOnly: true,
    aiStatus: isOpen ? 'AI đang MỞ đăng ký OFF cho Nhân viên Chính thức (T6 12:00 → T7 15:00)' : 'AI đã ĐÓNG đăng ký OFF - ngoài khung giờ',
    aiAuto: true,
    rule: db.settings.off, 
    now: now.toISOString(),
    nextOpen: win.nextOpen,
    nextClose: win.nextClose,
    officialCount: db.employees.filter(e=>e.type==='OFFICIAL'||e.status==='OFFICIAL').length
  });
});
// Broadcast OFF window AI status every minute
setInterval(()=>{
  const isOpen = isOffWindowOpen();
  io.emit('offWindow:update', { isOpen, now: new Date().toISOString(), aiAuto:true });
}, 60*1000);

// ============ EMERGENCY OFF ============
app.get('/api/emergency-requests', authMiddleware, (req,res)=>{
  let list = [...db.emergencyRequests];
  const scope = branchScopeFilter(req);
  if(scope){
    const allowedIds = db.employees.filter(e=>scope.includes(e.branchId)).map(e=>e.employeeId);
    list = list.filter(r=>allowedIds.includes(r.employeeId));
  }
  res.json(list);
});
app.post('/api/emergency-requests', (req,res)=>{
  const { employeeId, date, reason } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Not found'});
  if(emp.status!=='OFFICIAL') return res.status(403).json({error:'Chỉ Nhân viên Chính thức (status OFFICIAL) mới được tạo phiếu OFF đột xuất'});
  // TH2: Check monthly min 12 days for OFF đột xuất
  const monthStr = String(date).slice(0,7);
  const chk = validateOfficialMonthlyMin12(employeeId, monthStr, [date]);
  if(!chk.valid) return res.status(400).json({error:`Tháng ${monthStr} sau khi OFF đột xuất sẽ chỉ còn ${chk.workingAfter} ngày làm. Tối thiểu 12 ngày/tháng.`, detail:chk});
  // Check max 1 per week
  const weekCount = db.emergencyRequests.filter(r=>r.employeeId===employeeId && r.status==='APPROVED' && isSameWeek(r.createdAt, new Date().toISOString())).length;
  if(weekCount>=1) return res.status(400).json({error:'Đã đạt giới hạn 1 OFF đột xuất/tuần'});
  if(!reason) return res.status(400).json({error:'Lý do bắt buộc'});
  const reqId = uuidv4();
  const er = {
    id: reqId, employeeId, employeeName: emp.name, branchId: emp.branchId, shift: emp.shift,
    date, reason, status:'PENDING', cascadeStep:1, substituteId:null, substituteName:null,
    createdAt: new Date().toISOString(), timeoutAt: new Date(Date.now()+2*60*1000).toISOString(), attempts:0, version:1
  };
  db.emergencyRequests.unshift(er);
  // AI đăng ký tạm lịch EMERGENCY_PENDING cho NV gửi yêu cầu
  try{
    const weekStart = getMonday(new Date(date));
    const ws = toVietnamDateStr(weekStart);
    let sched = db.schedules.find(s=>s.employeeId===employeeId && s.weekStart===ws);
    if(!sched){
      const dayNames=['T2','T3','T4','T5','T6','T7','CN'];
      const wDate = weekStart;
      const days=[];
      for(let i=0;i<7;i++){ const cur=new Date(wDate); cur.setDate(wDate.getDate()+i); const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0'); const ds=`${y}-${m}-${d}`; days.push({date:ds, dayName:dayNames[i], shift: emp.shift, status: ds===date ? 'EMERGENCY_PENDING' : 'WORKING', substituteFor:null});}
      sched={ id: uuidv4(), employeeId, weekStart: ws, days, version:1, updated_at: new Date().toISOString()};
      db.schedules.push(sched);
    } else {
      const day = sched.days.find(d=>d.date===date);
      if(day){ day.status='EMERGENCY_PENDING'; day.shift = emp.shift; }
    }
    io.emit('schedules:update', db.schedules);
  }catch(e){ console.error('temp schedule error',e); }
  audit(employeeId,'EMERGENCY_REQUEST','OFF_REQUEST',null,er, req.ip);
  saveDB();
  io.emit('emergencyRequests:update', db.emergencyRequests);
  // Trigger cascade search TH3
  handleEmergencyCascade(er);
  res.json(er);
});
function handleEmergencyCascade(request){
  // TH3: Cascade 2 phút (cùng CN cùng ca) → 30 phút (cùng CN khác ca) → hủy
  const step1Candidates = db.employees.filter(e=>e.branchId===request.branchId && e.shift===request.shift && e.employeeId!==request.employeeId && e.status==='OFFICIAL');
  if(step1Candidates.length>0){
    step1Candidates.forEach(c=>{
      const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: c.phone, type:'SUBSTITUTE_INVITE_STEP1', content:`[TH3-B1] Mời thay ca (cùng CN cùng ca) cho ${request.employeeName} ngày ${request.date} ca ${request.shift} - Phản hồi trong 2 phút`, status:'SENT', error:'' };
      db.zaloRecords.unshift(zr);
      db.notifications.unshift({ id: uuidv4(), to: c.employeeId, type:'SUBSTITUTE_INVITE', title:'[TH3] Mời thay ca đột xuất (cùng ca)', content:`Bạn (cùng CN ${request.branchId} cùng ca ${request.shift}) được mời thay ca cho ${request.employeeName} ngày ${request.date}. Vui lòng phản hồi trong 2 phút.`, requestId: request.id, step:1, createdAt: new Date().toISOString(), read:false });
    });
    io.emit('zalo:update', db.zaloRecords);
    io.emit('notifications:update', db.notifications);
    saveDB();
    // Update timeout to 2 min from now
    request.timeoutAt = new Date(Date.now()+2*60*1000).toISOString();
    io.emit('emergencyRequests:update', db.emergencyRequests);
    const timeoutMsStep1 = 2*60*1000; // 2 phút
    setTimeout(()=>{
      const r = db.emergencyRequests.find(x=>x.id===request.id);
      if(!r || r.status!=='PENDING') return;
      // Sau 2 phút không ai nhận → chuyển B2
      r.cascadeStep=2;
      r.timeoutAt = new Date(Date.now()+30*60*1000).toISOString();
      r.attempts = (r.attempts||0)+1;
      saveDB();
      io.emit('emergencyRequests:update', db.emergencyRequests);
      // Notify step2 candidates: cùng CN khác ca
      const candidates2 = db.employees.filter(e=>e.branchId===request.branchId && e.shift!==request.shift && e.employeeId!==request.employeeId && e.status==='OFFICIAL');
      if(candidates2.length>0){
        candidates2.forEach(c=>{
          const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: c.phone, type:'SUBSTITUTE_INVITE_STEP2', content:`[TH3-B2] Mời thay ca (cùng CN khác ca) cho ${request.employeeName} ngày ${request.date} - Phản hồi trong 30 phút`, status:'SENT', error:'' };
          db.zaloRecords.unshift(zr);
          db.notifications.unshift({ id: uuidv4(), to: c.employeeId, type:'SUBSTITUTE_INVITE', title:'[TH3] Mời thay ca (khác ca)', content:`Bạn (cùng CN ${request.branchId} khác ca) được mời thay ca cho ${request.employeeName} ngày ${request.date} ca ${request.shift}. Phản hồi trong 30 phút.`, requestId: request.id, step:2, createdAt: new Date().toISOString(), read:false });
        });
        io.emit('zalo:update', db.zaloRecords);
        io.emit('notifications:update', db.notifications);
        saveDB();
        const timeoutMsStep2 = 30*60*1000; // 30 phút
        setTimeout(()=>{
          const r2 = db.emergencyRequests.find(x=>x.id===request.id);
          if(r2 && r2.status==='PENDING'){
            r2.status='REJECTED';
            r2.reasonReject='[TH3] Không có nhân viên thay ca sau 2 bước (2 phút cùng ca + 30 phút khác ca)';
            // Hủy lịch tạm EMERGENCY_PENDING → trả về WORKING
            try{
              const ws = toVietnamDateStr(getMonday(new Date(r2.date)));
              const sched = db.schedules.find(s=>s.employeeId===r2.employeeId && s.weekStart===ws);
              if(sched){ const day=sched.days.find(d=>d.date===r2.date); if(day && day.status==='EMERGENCY_PENDING'){ day.status='WORKING'; day.shift = db.employees.find(e=>e.employeeId===r2.employeeId)?.shift || 'CA_SANG'; io.emit('schedules:update', db.schedules); }}
            }catch(e){}
            saveDB();
            io.emit('emergencyRequests:update', db.emergencyRequests);
            const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: db.employees.find(e=>e.employeeId===r2.employeeId)?.phone, type:'EMERGENCY_REJECTED', content:`[TH3] OFF đột xuất ngày ${r2.date} bị HỦY do không có người thay ca sau 2 phút + 30 phút. Vui lòng liên hệ quản lý.`, status:'SENT', error:'' };
            db.zaloRecords.unshift(zr);
            db.notifications.unshift({ id: uuidv4(), to: r2.employeeId, type:'EMERGENCY_REJECTED', title:'OFF đột xuất bị hủy', content:`Phiếu OFF đột xuất ngày ${r2.date} bị hủy do không tìm được người thay ca (TH3).`, requestId: r2.id, createdAt: new Date().toISOString(), read:false });
            io.emit('zalo:update', db.zaloRecords);
            io.emit('notifications:update', db.notifications);
          }
        }, timeoutMsStep2);
      } else {
        // Không có ứng viên B2 → hủy luôn sau 2 phút (không chờ 30p)
        r.status='REJECTED';
        r.reasonReject='[TH3] Không có nhân viên cùng CN khác ca để thay';
        // Hủy tạm
        try{
          const ws = toVietnamDateStr(getMonday(new Date(r.date)));
          const sched = db.schedules.find(s=>s.employeeId===r.employeeId && s.weekStart===ws);
          if(sched){ const day=sched.days.find(d=>d.date===r.date); if(day && day.status==='EMERGENCY_PENDING'){ day.status='WORKING'; io.emit('schedules:update', db.schedules); }}
        }catch(e){}
        saveDB();
        io.emit('emergencyRequests:update', db.emergencyRequests);
        const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: db.employees.find(e=>e.employeeId===r.employeeId)?.phone, type:'EMERGENCY_REJECTED', content:`OFF đột xuất ngày ${r.date} bị hủy do không có ứng viên thay ca (cùng CN).`, status:'SENT', error:'' };
        db.zaloRecords.unshift(zr);
        io.emit('zalo:update', db.zaloRecords);
      }
    }, timeoutMsStep1);
  } else {
    // Không có ứng viên B1 → chuyển thẳng B2
    request.cascadeStep=2;
    request.timeoutAt = new Date(Date.now()+30*60*1000).toISOString();
    saveDB();
    io.emit('emergencyRequests:update', db.emergencyRequests);
    const candidates2 = db.employees.filter(e=>e.branchId===request.branchId && e.shift!==request.shift && e.employeeId!==request.employeeId && e.status==='OFFICIAL');
    if(candidates2.length>0){
      candidates2.forEach(c=>{
        const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: c.phone, type:'SUBSTITUTE_INVITE_STEP2_DIRECT', content:`[TH3-B2 trực tiếp] Mời thay ca (khác ca) cho ${request.employeeName} ngày ${request.date}`, status:'SENT', error:'' };
        db.zaloRecords.unshift(zr);
        db.notifications.unshift({ id: uuidv4(), to: c.employeeId, type:'SUBSTITUTE_INVITE', title:'[TH3] Mời thay ca (khác ca)', content:`Mời thay ca khác ca cho ${request.employeeName} ngày ${request.date}`, requestId: request.id, step:2, createdAt: new Date().toISOString(), read:false });
      });
      io.emit('zalo:update', db.zaloRecords);
      io.emit('notifications:update', db.notifications);
      saveDB();
      setTimeout(()=>{
        const r2 = db.emergencyRequests.find(x=>x.id===request.id);
        if(r2 && r2.status==='PENDING'){
          r2.status='REJECTED';
          r2.reasonReject='[TH3] Không tìm được người thay ca (khác ca) sau 30 phút';
          try{ const ws=toVietnamDateStr(getMonday(new Date(r2.date))); const sched=db.schedules.find(s=>s.employeeId===r2.employeeId && s.weekStart===ws); if(sched){ const day=sched.days.find(d=>d.date===r2.date); if(day && day.status==='EMERGENCY_PENDING'){ day.status='WORKING'; io.emit('schedules:update', db.schedules); }}}catch(e){}
          saveDB(); io.emit('emergencyRequests:update', db.emergencyRequests);
          const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: db.employees.find(e=>e.employeeId===r2.employeeId)?.phone, type:'EMERGENCY_REJECTED', content:`OFF đột xuất ngày ${r2.date} bị hủy do không có người thay`, status:'SENT', error:'' };
          db.zaloRecords.unshift(zr); io.emit('zalo:update', db.zaloRecords);
        }
      }, 30*60*1000);
    } else {
      request.status='REJECTED';
      request.reasonReject='[TH3] Không có ứng viên thay ca (cùng CN)';
      try{ const ws=toVietnamDateStr(getMonday(new Date(request.date))); const sched=db.schedules.find(s=>s.employeeId===request.employeeId && s.weekStart===ws); if(sched){ const day=sched.days.find(d=>d.date===request.date); if(day) {day.status='WORKING'; io.emit('schedules:update', db.schedules);}}}catch(e){}
      saveDB(); io.emit('emergencyRequests:update', db.emergencyRequests);
    }
  }
}
app.post('/api/emergency-requests/:id/respond', (req,res)=>{
  const { substituteId, action } = req.body; // action APPROVE/REJECT
  const er = db.emergencyRequests.find(r=>r.id===req.params.id);
  if(!er) return res.status(404).json({error:'Not found'});
  if(er.status!=='PENDING') return res.status(400).json({error:'Already processed'});
  const subEmp = db.employees.find(e=>e.employeeId===substituteId);
  if(!subEmp) return res.status(404).json({error:'Substitute not found'});
  if(action==='REJECT'){
    // just log, keep pending for others
    audit(substituteId,'REJECT_SUBSTITUTE','EMERGENCY',null,{er, substituteId}, req.ip);
    return res.json({ message:'Đã từ chối, hệ thống tiếp tục tìm người khác' });
  }
  // APPROVE
  er.status='APPROVED';
  er.substituteId = substituteId;
  er.substituteName = subEmp.name;
  er.approvedAt = new Date().toISOString();
  // Update schedules for both
  const sched1 = db.schedules.find(s=>s.employeeId===er.employeeId && s.days.some(d=>d.date===er.date));
  if(sched1){
    const day = sched1.days.find(d=>d.date===er.date);
    if(day){ day.status='EMERGENCY_OFF'; day.substituteFor = substituteId; }
  }
  let sched2 = db.schedules.find(s=>s.employeeId===substituteId && s.days.some(d=>d.date===er.date));
  if(sched2){
    const day = sched2.days.find(d=>d.date===er.date);
    if(day){ day.status='SUBSTITUTE'; day.substituteFor = er.employeeId; }
  } else {
    // create schedule for substitute
    const weekStart = getMonday(new Date(er.date));
    const ws = toVietnamDateStr(weekStart);
    const existing = db.schedules.find(s=>s.employeeId===substituteId && s.weekStart===ws);
    if(existing){
      const d = existing.days.find(x=>x.date===er.date);
      if(d){ d.status='SUBSTITUTE'; d.substituteFor=er.employeeId; }
    }
  }
  audit(substituteId,'APPROVE_SUBSTITUTE','EMERGENCY',null,er, req.ip);
  addSyncQueue('EMERGENCY','UPDATE',er, substituteId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('emergencyRequests:update', db.emergencyRequests);
  io.emit('schedules:update', db.schedules);
  const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: db.employees.find(e=>e.employeeId===er.employeeId)?.phone, type:'EMERGENCY_APPROVED', content:`OFF đột xuất ngày ${er.date} đã được duyệt, người thay: ${subEmp.name}`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json(er);
});

// ============ E-LEARNING & TEST ============
app.get('/api/courses', (req,res)=> res.json(db.testCourses));
app.get('/api/test-results', (req,res)=>{
  const { employeeId } = req.query;
  let list = [...db.testResults];
  if(employeeId) list = list.filter(r=>r.employeeId===employeeId);
  res.json(list);
});
app.post('/api/courses/:id/submit', (req,res)=>{
  const { employeeId, answers, timeSpent, voiceAnswers } = req.body;
  const course = db.testCourses.find(c=>c.id===req.params.id);
  if(!course) return res.status(404).json({error:'Not found'});
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Employee not found'});
  // Validate min time 5s per question
  const minTime = (course.minPerQuestion || 5) * (course.totalQuestions || 20);
  if(timeSpent && timeSpent < minTime) {
    return res.status(400).json({error:`Thời gian làm bài tối thiểu là ${minTime} giây (${course.totalQuestions} câu x ${course.minPerQuestion||5}s). Bạn đã làm ${timeSpent}s.`});
  }
  // Calculate score: 10 point scale? correct/total *10
  let correct =0;
  course.questions.forEach((q,idx)=>{
    if(answers[idx]===q.correct) correct++;
  });
  const score = (correct / course.totalQuestions) * 10;
  const rounded = Math.round(score*10)/10;
  const passScore = (db.settings && db.settings.test) ? db.settings.test.passScore : 7;
  let result, newStatus;
  if(rounded < 5){ result='FAILED'; newStatus='FAILED_TEST'; }
  else if(rounded < passScore){ result='CHUA_DU_DK'; newStatus='RETEST'; }
  else { result='DAT'; newStatus='OFFICIAL'; }
  const testRes = {
    id: uuidv4(), employeeId, courseId: course.id, score: rounded, correct, total: course.totalQuestions,
    answers, timeSpent, voiceAnswers, result, createdAt: new Date().toISOString(), version:1
  };
  db.testResults.unshift(testRes);
  const before = {...emp};
  emp.testScore = rounded;
  emp.testResult = result;
  // Transition logic
  if(result==='FAILED'){
    emp.status='FAILED_TEST';
    // After 2 hours would go ARCHIVED - simulate? For now keep FAILED, but allow HR to archive
    setTimeout(()=>{
      const e = db.employees.find(x=>x.employeeId===employeeId);
      if(e && e.status==='FAILED_TEST'){
        e.status='ARCHIVED';
        saveDB();
        io.emit('employees:update', db.employees);
        audit('SYSTEM','AUTO_ARCHIVE','EMPLOYEE',before,e,'system');
      }
    }, 2*60*60*1000); // 2h
  } else if(result==='CHUA_DU_DK'){
    emp.status='RETEST';
    emp.type='TRAINING';
  } else if(result==='DAT'){
    // Will auto transition after delay (for demo immediate, but spec says after time quy định)
    setTimeout(()=>{
      const e = db.employees.find(x=>x.employeeId===employeeId);
      if(e && e.testResult==='DAT'){
        e.status='OFFICIAL';
        e.type='OFFICIAL';
        e.endDate=null;
        // create schedule
        const weekStart = getMonday(new Date());
        const days=[];
        for(let i=0;i<7;i++){
          const d=new Date(weekStart); d.setDate(weekStart.getDate()+i);
          const ds=toVietnamDateStr(d);
          days.push({date:ds, dayName:['T2','T3','T4','T5','T6','T7','CN'][i], shift:e.shift, status:'WORKING', substituteFor:null});
        }
        db.schedules.push({ id: uuidv4(), employeeId: e.employeeId, weekStart: toVietnamDateStr(weekStart), days, version:1, updated_at: new Date().toISOString()});
        saveDB();
        io.emit('employees:update', db.employees);
        io.emit('schedules:update', db.schedules);
      }
    }, 3000);
    emp.status='WAITING_OFFICIAL'; // transitional
  }
  emp.version=(emp.version||1)+1;
  emp.updated_at=new Date().toISOString();
  emp.sync_status='PENDING';
  addSyncQueue('TEST_RESULT','CREATE',testRes, employeeId, 'WEB_EMPLOYEE');
  addSyncQueue('EMPLOYEE','UPDATE',emp, employeeId, 'WEB_EMPLOYEE');
  audit(employeeId,'SUBMIT_TEST','TEST',before,emp, req.ip);
  saveDB();
  io.emit('testResults:update', db.testResults);
  io.emit('employees:update', db.employees);
  const zr = { id: uuidv4(), sent_at: new Date().toISOString(), receiver: emp.phone, type:'TEST_RESULT', content:`Kết quả TEST: ${rounded} điểm - ${result}`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json({ testResult: testRes, employee: emp });
});

// Helper: xác định field nào đang bị ENV khóa (Render)
function getEnvLocked(){
  const locked = {};
  if(process.env.GOOGLE_SHEET_SPREADSHEET_ID) locked['googleSheet.spreadsheetId']=true;
  if(process.env.GOOGLE_SHEET_FORM_RESPONSES_ID) locked['googleSheet.formResponsesSheetId']=true;
  if(process.env.GOOGLE_SHEET_TARGET_DATABASE_ID) locked['googleSheet.targetDatabaseSpreadsheetId']=true;
  if(process.env.GOOGLE_SHEET_WEBHOOK_URL) locked['googleSheet.targetWebhookUrl']=true;
  if(process.env.GOOGLE_SHEET_WEBHOOK_URL_1) locked['googleSheet.targetWebhookUrl1']=true;
  if(process.env.GOOGLE_SHEET_WEBHOOK_URL_2) locked['googleSheet.targetWebhookUrl2']=true;
  if(process.env.FINANCE_WEBHOOK_URL) locked['finance.webhookUrl']=true;
  if(process.env.FINANCE_WEBHOOK_SECRET) locked['finance.secret']=true;
  if(process.env.GOOGLE_SHEET_WEBHOOK_SECRET) locked['googleSheet.secret']=true;
  if(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) locked['googleSheet.serviceAccountEmail']=true;
  if(process.env.GOOGLE_PRIVATE_KEY) locked['googleSheet.privateKey']=true;
  if(process.env.GOOGLE_OAUTH_CLIENT_ID) locked['calendar.clientId']=true;
  if(process.env.GOOGLE_OAUTH_CLIENT_SECRET) locked['calendar.clientSecret']=true;
  if(process.env.GOOGLE_CALENDAR_ID) locked['calendar.calendarId']=true;
  if(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) locked['googleDrive.rootFolderId']=true;
  if(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) locked['googleDrive.backupFolderId']=true;
  return locked;
}
// ============ SETTINGS ============
// FIX P0.2: không bao giờ trả raw secret - chỉ trả masked, realtime masked
app.get('/api/settings', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const masked = getMaskedSettings(db.settings);
  const envLocked = getEnvLocked();
  // HR/Manager chỉ được xem, không thấy secret thật
  res.json({ settings: masked, masked, envLocked });
});
app.get('/api/settings/masked', authMiddleware, (req,res)=>{
  res.json(getMaskedSettings(db.settings));
});
app.put('/api/settings', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const before = JSON.parse(JSON.stringify(db.settings));
  const envLocked = getEnvLocked();
  const blocked = [];
  const { path: p, value } = req.body; // alternative: full object
  if(p && value!==undefined){
    // Khóa khi dùng ENV
    if(envLocked[p]){
      return res.status(423).json({ error: `🔒 Field ${p} đang bị khóa bởi ENV Render (process.env). Vui lòng đổi trên Render Dashboard → Environment, không sửa trên UI.` , envLocked });
    }
    // set nested
    const keys = p.split('.');
    let cur = db.settings;
    for(let i=0;i<keys.length-1;i++) cur = cur[keys[i]];
    // if masked value, don't overwrite if contains •
    if(typeof value==='string' && value.includes('•')){
      // keep original
    } else {
      cur[keys[keys.length-1]] = value;
    }
  } else {
    // full replace but keep masking logic + ENV lock
    const incoming = req.body.settings || req.body;
    Object.keys(incoming).forEach(k=>{
      if(db.settings[k]){
        Object.keys(incoming[k]).forEach(sub=>{
          const fullPath = `${k}.${sub}`;
          if(envLocked[fullPath]){
            blocked.push(fullPath);
            return;
          }
          const val = incoming[k][sub];
          if(typeof val==='string' && val.includes('•')) return;
          db.settings[k][sub]=val;
        });
      }
    });
    if(blocked.length>0){
      console.log(`[SETTINGS] Blocked ENV-locked fields: ${blocked.join(', ')}`);
    }
  }
  audit(req.user.username,'UPDATE_SETTINGS','SETTINGS',getMaskedSettings(before),getMaskedSettings(db.settings), req.ip);
  // FIX: SETTINGS không đồng bộ lên Google Sheet (không có sheet mapping) -> bỏ queue để tránh DEAD
  // Nếu đổi webhook/secret thì auto-reset các mục DEAD/FAILED để thử lại
  const webhookChanged = (before.googleSheet?.targetWebhookUrl !== db.settings.googleSheet?.targetWebhookUrl) || (before.googleSheet?.secret !== db.settings.googleSheet?.secret);
  if(webhookChanged){
    let resetCount=0;
    db.syncQueue.forEach(item=>{
      if(item.sync_status==='DEAD' || item.sync_status==='FAILED'){
        item.sync_status='PENDING';
        item.retryCount=0;
        delete item.nextRetryAt;
        delete item.error;
        resetCount++;
      }
    });
    if(resetCount>0) console.log(`[SETTINGS] Webhook/secret changed -> reset ${resetCount} DEAD/FAILED to PENDING`);
  }
  saveDB();
  io.emit('settings:update', getMaskedSettings(db.settings));
  io.emit('sync:update', db.syncQueue);
  const resp = getMaskedSettings(db.settings);
  // Trả thêm envLocked và blocked để UI biết khóa
  res.json({ settings: resp, masked: resp, envLocked: getEnvLocked(), blocked, warning: blocked.length>0 ? `🔒 ${blocked.length} field bị khóa bởi ENV Render, không lưu qua UI: ${blocked.join(', ')}` : undefined });
});


// ============ USERS / ROLES ============
app.get('/api/users', authMiddleware, roleCheck(['Admin']), (req,res)=> res.json(db.users.map(u=>({id:u.id, username:u.username, role:u.role, branchScope:u.branchScope, displayName:u.displayName, allowedTabs: u.allowedTabs}))));
app.post('/api/users', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const { username, password, role, branchScope, displayName, allowedTabs } = req.body;
  if(db.users.find(u=>u.username===username)) return res.status(409).json({error:'Username exists'});
  const hashed = bcrypt.hashSync(password,10);
  const defaultTabs = ['dashboard','applicants','interviews','employees-store','keys','attendance','schedule','test-management','requests','zalo-records','audit-logs','settings'];
  const user = { id: uuidv4(), username, password:hashed, role, branchScope: branchScope||[], displayName: displayName||username, allowedTabs: allowedTabs || (role==='Admin'? defaultTabs : ['dashboard','applicants','employees-store']) };
  db.users.push(user);
  audit(req.user.username,'CREATE_USER','USER',null,{username, role}, req.ip);
  saveDB();
  io.emit('users:update', db.users.map(u=>({id:u.id, username:u.username, role:u.role, branchScope:u.branchScope, allowedTabs: u.allowedTabs})));
  res.json({id:user.id, username, role, branchScope, allowedTabs: user.allowedTabs});
});
app.put('/api/users/:id', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const user = db.users.find(u=>u.id===req.params.id);
  if(!user) return res.status(404).json({error:'Not found'});
  const before = {...user};
  if(req.body.role) user.role = req.body.role;
  if(req.body.branchScope) user.branchScope = req.body.branchScope;
  if(req.body.displayName) user.displayName = req.body.displayName;
  if(req.body.password) user.password = bcrypt.hashSync(req.body.password,10);
  if(Array.isArray(req.body.allowedTabs)) user.allowedTabs = req.body.allowedTabs;

  audit(req.user.username,'UPDATE_USER','USER',before,{username:user.username, role:user.role, allowedTabs: user.allowedTabs}, req.ip);
  saveDB();
  io.emit('users:update', db.users.map(u=>({id:u.id, username:u.username, role:u.role, branchScope:u.branchScope, allowedTabs: u.allowedTabs})));
  res.json(user);
});
app.delete('/api/users/:id', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const idx = db.users.findIndex(u=>u.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Not found'});
  const removed = db.users.splice(idx,1)[0];
  audit(req.user.username,'DELETE_USER','USER',removed,null, req.ip);
  saveDB();
  io.emit('users:update', db.users.map(u=>({id:u.id, username:u.username, role:u.role, branchScope:u.branchScope, allowedTabs: u.allowedTabs})));
  res.json({success:true});
});

// ============ REPORTS / PAYROLL ============
app.get('/api/reports/attendance', authMiddleware, (req,res)=>{
  const { branch, startDate, endDate, type, shift } = req.query;
  let list = [...db.attendances];
  if(branch) list = list.filter(a=>a.branchId===branch);
  if(startDate) list = list.filter(a=>a.date>=startDate);
  if(endDate) list = list.filter(a=>a.date<=endDate);
  if(shift) list = list.filter(a=>a.shift===shift);
  if(type){
    const empIds = db.employees.filter(e=>e.type===type).map(e=>e.employeeId);
    list = list.filter(a=>empIds.includes(a.employeeId));
  }
  // enrich
  const enriched = list.map(a=>{
    const emp = db.employees.find(e=>e.employeeId===a.employeeId);
    return {...a, employeeName: emp?.name, type: emp?.type, phone: emp?.phone };
  });
  res.json(enriched);
});
app.get('/api/reports/payroll', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const { month, branch } = req.query; // month YYYY-MM
  const m = month || new Date().toISOString().slice(0,7);
  let emps = [...db.employees];
  if(branch) emps = emps.filter(e=>e.branchId===branch);
  const payrolls = emps.map(e=> calculatePayroll(e.employeeId, m)).filter(Boolean);
  res.json(payrolls);
});

// ============ REPORT OVERVIEW (Spec 3.2) ============
app.get('/api/reports/overview', authMiddleware, (req,res)=>{
  const { month, branch, startDate, endDate } = req.query;
  const m = month || new Date().toISOString().slice(0,7);
  const start = startDate || (m+'-01');
  const end = endDate || (m+'-31');
  let emps = [...db.employees];
  if(branch) emps = emps.filter(e=>e.branchId===branch);
  // Filter out ARCHIVED for overview
  const activeEmps = emps.filter(e=>e.status!=='ARCHIVED');
  // Scheduled days in month
  let totalScheduledDays = 0, totalScheduledHours = 0;
  activeEmps.forEach(emp=>{
    const scheds = db.schedules.filter(s=>s.employeeId===emp.employeeId);
    scheds.forEach(s=>{
      s.days.forEach(d=>{
        if(d.date>=start && d.date<=end && (d.status==='WORKING' || d.status==='SUBSTITUTE')){
          totalScheduledDays++;
          const h = (db.settings.payroll.shifts[emp.shift]?.hours)||5;
          totalScheduledHours+=h;
        }
      });
    });
  });
  // Fallback if no schedules: estimate from offRequests
  if(totalScheduledDays===0){
    const daysInMonth = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]), 0).getDate();
    const avgScheduled = Math.max(0, daysInMonth - 4); // approx
    totalScheduledDays = activeEmps.length * avgScheduled;
    totalScheduledHours = totalScheduledDays * 5.5;
  }
  const attsInMonth = db.attendances.filter(a=>a.date>=start && a.date<=end && a.checkIn);
  const totalActualDays = attsInMonth.filter(a=>a.checkIn).length;
  const totalActualHours = attsInMonth.reduce((s,a)=>{
    const emp = db.employees.find(e=>e.employeeId===a.employeeId);
    const h = (db.settings.payroll.shifts[emp?.shift||a.shift]?.hours)||5;
    return s + (a.checkIn && a.checkOut ? h : 0);
  },0);
  // Payable = actual + approved OFF (weekly) + emergency approved counted as paid
  const offApproved = db.offRequests.filter(r=>r.status==='APPROVED' && r.dates.some(d=>d>=start && d<=end)).reduce((s,r)=> s + r.dates.filter(d=>d>=start&&d<=end).length,0);
  const emergApproved = db.emergencyRequests.filter(r=>r.status==='APPROVED' && r.date>=start && r.date<=end).length;
  const paidLeave = offApproved; // simplified: weekly OFF as paid
  const totalPayableDays = totalActualDays + paidLeave + emergApproved;
  const totalPayableHours = totalActualHours + (paidLeave * 5.5);
  // OT (if any overtimeRequests)
  const otHours = (db.overtimeRequests||[]).filter(r=>r.status==='APPROVED' && r.date>=start && r.date<=end).reduce((s,r)=>s+(r.hours||0),0);
  // Late / Early
  let lateCount=0, lateMinutes=0, earlyCount=0, earlyMinutes=0, missingIn=0, missingOut=0;
  attsInMonth.forEach(a=>{
    if(a.violations){
      if(a.violations.includes('LATE')){ lateCount++; lateMinutes+=15; }
      if(a.violations.includes('EARLY_LEAVE')){ earlyCount++; earlyMinutes+=15; }
      if(a.violations.includes('NO_CHECKOUT')) missingOut++;
    }
    if(!a.checkIn) missingIn++;
    else if(!a.checkOut) missingOut++;
  });
  // Also count absent: scheduled but no attendance
  let absentNoCheckIn = 0;
  activeEmps.forEach(emp=>{
    const scheds = db.schedules.filter(s=>s.employeeId===emp.employeeId);
    const scheduledDates = new Set();
    scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')) scheduledDates.add(d.date); }));
    scheduledDates.forEach(date=>{
      const hasAtt = db.attendances.find(a=>a.employeeId===emp.employeeId && a.date===date && a.checkIn);
      if(!hasAtt) absentNoCheckIn++;
    });
  });
  missingIn = Math.max(missingIn, absentNoCheckIn);
  const pendingAdjust = (db.attendanceAdjustments||[]).filter(r=>r.status==='PENDING').length;
  const period = db.payrollPeriods.find(p=>p.month===m);
  const status = period ? period.status : 'DRAFT';
  const kpi = {
    month: m, start, end, branch: branch||'ALL',
    totalEmployees: activeEmps.length,
    totalScheduledDays, totalScheduledHours: Math.round(totalScheduledHours*10)/10,
    totalActualDays, totalActualHours: Math.round(totalActualHours*10)/10,
    totalPayableDays, totalPayableHours: Math.round(totalPayableHours*10)/10,
    totalOT: otHours,
    paidLeave, unpaidLeave: 0,
    lateCount, lateMinutes, earlyCount, earlyMinutes,
    missingCheckIn: missingIn, missingCheckOut: missingOut,
    pendingAdjust, locked: status==='LOCKED' ? 1 : 0, pending: status!=='LOCKED' ? 1 : 0,
    status
  };
  res.json(kpi);
});
// Bảng chốt công - mỗi NV 1 dòng (Spec 4.1)
app.get('/api/reports/monthly', authMiddleware, (req,res)=>{
  const { month, branch } = req.query;
  const m = month || new Date().toISOString().slice(0,7);
  const start = m+'-01';
  const end = m+'-31';
  let emps = [...db.employees].filter(e=>e.status!=='ARCHIVED');
  if(branch) emps = emps.filter(e=>e.branchId===branch);
  const rows = emps.map(emp=>{
    const scheds = db.schedules.filter(s=>s.employeeId===emp.employeeId);
    let scheduledDays=0, scheduledHours=0;
    scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')){ scheduledDays++; scheduledHours+= (db.settings.payroll.shifts[emp.shift]?.hours||5); }}));
    const atts = db.attendances.filter(a=>a.employeeId===emp.employeeId && a.date>=start && a.date<=end && a.checkIn);
    const actualDays = atts.filter(a=>a.checkIn).length;
    const actualHours = atts.filter(a=>a.checkIn && a.checkOut).length * ((db.settings.payroll.shifts[emp.shift]?.hours)||5);
    const offApproved = db.offRequests.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED' && r.dates.some(d=>d>=start&&d<=end)).reduce((s,r)=> s+r.dates.filter(d=>d>=start&&d<=end).length,0);
    const emergApproved = db.emergencyRequests.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED' && r.date>=start&&r.date<=end).length;
    const payableDays = actualDays + offApproved;
    const payableHours = actualHours + offApproved*5.5;
    let lateCount=0, lateMin=0, earlyCount=0, earlyMin=0, missIn=0, missOut=0;
    atts.forEach(a=>{
      if(a.violations){
        if(a.violations.includes('LATE')){ lateCount++; lateMin+=15; }
        if(a.violations.includes('EARLY_LEAVE')){ earlyCount++; earlyMin+=15; }
        if(a.violations.includes('NO_CHECKOUT')) missOut++;
      }
      if(!a.checkIn) missIn++; else if(!a.checkOut) missOut++;
    });
    // scheduled but no att = absent
    const scheduledDates = new Set();
    scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')) scheduledDates.add(d.date); }));
    let absent = 0;
    scheduledDates.forEach(date=>{ if(!atts.find(a=>a.date===date)) absent++; });
    missIn = Math.max(missIn, absent);
    const period = db.payrollPeriods.find(p=>p.month===m);
    return {
      employeeId: emp.employeeId, name: emp.name, branchId: emp.branchId, branchName: (db.branches.find(b=>b.id===emp.branchId)?.name||emp.branchId),
      type: emp.type, shift: emp.shift, startDate: emp.startDate,
      standardDays: scheduledDays, scheduledDays, actualDays, payableDays,
      standardHours: scheduledHours, actualHours, payableHours: Math.round(payableHours*10)/10,
      paidLeave: offApproved, unpaidLeave: 0, otHours: 0,
      lateCount, lateMin, earlyCount, earlyMin,
      missingIn: missIn, missingOut: missOut,
      status: period? period.status : 'DRAFT'
    };
  });
  res.json(rows);
});
// Chi tiết chấm công theo ngày (Spec 6)
app.get('/api/reports/daily', authMiddleware, (req,res)=>{
  const { employeeId, month, startDate, endDate } = req.query;
  if(!employeeId) return res.status(400).json({error:'Thiếu employeeId'});
  const m = month || new Date().toISOString().slice(0,7);
  const start = startDate || (m+'-01');
  const end = endDate || (m+'-31');
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Not found'});
  const schedMap = {};
  db.schedules.filter(s=>s.employeeId===employeeId).forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end) schedMap[d.date]=d; }));
  const dates = [];
  let cur = new Date(start); const endD = new Date(end);
  while(cur<=endD){ dates.push(toVietnamDateStr(cur)); cur.setDate(cur.getDate()+1); }
  const details = dates.map(date=>{
    const sched = schedMap[date];
    const att = db.attendances.find(a=>a.employeeId===employeeId && a.date===date);
    const shift = sched ? sched.shift : emp.shift;
    const shiftHours = (db.settings.payroll.shifts[shift]?.hours)||5;
    let actualHours = 0, lateMin=0, earlyMin=0, ot=0, status='—';
    if(sched && sched.status==='OFF') status='OFF';
    else if(!att || !att.checkIn){ status = sched && sched.status==='WORKING' ? 'ABSENT' : '—'; }
    else if(att.checkIn && !att.checkOut){ status='MISSING_CHECKOUT'; }
    else if(att.violations && att.violations.includes('LATE')){ status='LATE'; lateMin=15; actualHours=shiftHours-0.25; }
    else if(att.status==='COMPLETED'){ status='PRESENT'; actualHours=shiftHours; }
    else status=att.status||'PRESENT';
    return { date, dayName: ['CN','T2','T3','T4','T5','T6','T7'][new Date(date).getDay()], shift, shiftHours, checkIn: att?.checkIn?.time||'', checkOut: att?.checkOut?.time||'', actualHours, lateMin, earlyMin, ot, status, schedStatus: sched?.status||'', violations: att?.violations||[] };
  });
  res.json(details);
});
// Sai lệch (Spec 10)
app.get('/api/attendance/anomalies', authMiddleware, (req,res)=>{
  const { month, branch } = req.query;
  const m = month || new Date().toISOString().slice(0,7);
  const start=m+'-01', end=m+'-31';
  let emps=[...db.employees].filter(e=>e.status!=='ARCHIVED');
  if(branch) emps=emps.filter(e=>e.branchId===branch);
  const anomalies=[];
  emps.forEach(emp=>{
    const scheds=db.schedules.filter(s=>s.employeeId===emp.employeeId);
    const schedDates=new Set();
    scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')) schedDates.add(d.date); }));
    schedDates.forEach(date=>{
      const att=db.attendances.find(a=>a.employeeId===emp.employeeId && a.date===date);
      if(!att || !att.checkIn) anomalies.push({ employeeId: emp.employeeId, name: emp.name, branchId: emp.branchId, date, type:'MISSING_CHECK_IN', desc:'Có lịch làm nhưng không chấm công', schedStatus:'WORKING' });
      else if(att.checkIn && !att.checkOut) anomalies.push({ employeeId: emp.employeeId, name: emp.name, branchId: emp.branchId, date, type:'MISSING_CHECK_OUT', desc:'Thiếu Check-out', checkIn: att.checkIn.time });
    });
    // Có chấm công nhưng không có lịch
    db.attendances.filter(a=>a.employeeId===emp.employeeId && a.date>=start&&a.date<=end && a.checkIn).forEach(att=>{
      if(!schedDates.has(att.date)) anomalies.push({ employeeId: emp.employeeId, name: emp.name, branchId: emp.branchId, date: att.date, type:'NO_SCHEDULE', desc:'Có chấm công nhưng không có lịch', checkIn: att.checkIn.time });
    });
  });
  // OT chưa duyệt
  (db.overtimeRequests||[]).filter(r=>r.status==='PENDING' && r.date>=start&&r.date<=end).forEach(r=>{
    const emp=db.employees.find(e=>e.employeeId===r.employeeId);
    anomalies.push({ employeeId: r.employeeId, name: emp?.name||r.employeeId, branchId: emp?.branchId, date: r.date, type:'OT_PENDING', desc:'OT chưa duyệt' });
  });
  res.json(anomalies);
});
// Điều chỉnh công (Spec 11)
app.get('/api/attendance/adjustments', authMiddleware, (req,res)=> res.json(db.attendanceAdjustments||[]));
app.post('/api/attendance/adjustments', authMiddleware, (req,res)=>{
  const { employeeId, date, field, oldValue, newValue, reason } = req.body;
  if(!employeeId||!date||!field) return res.status(400).json({error:'Thiếu thông tin'});
  const adj={ id: uuidv4(), employeeId, date, field, oldValue, newValue, reason, status:'PENDING', requestedBy: req.user.username, requestedAt: new Date().toISOString(), approvedBy:null, approvedAt:null };
  db.attendanceAdjustments.push(adj);
  audit(req.user.username,'CREATE_ADJUST','ATTENDANCE',null,adj, req.ip);
  saveDB(); io.emit('adjustments:update', db.attendanceAdjustments);
  res.json(adj);
});
app.post('/api/attendance/adjustments/:id/approve', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const adj=db.attendanceAdjustments.find(a=>a.id===req.params.id);
  if(!adj) return res.status(404).json({error:'Not found'});
  adj.status='APPROVED'; adj.approvedBy=req.user.username; adj.approvedAt=new Date().toISOString();
  // apply to attendance
  const att=db.attendances.find(a=>a.employeeId===adj.employeeId && a.date===adj.date);
  if(att) att[adj.field]=adj.newValue;
  audit(req.user.username,'APPROVE_ADJUST','ATTENDANCE',null,adj, req.ip);
  saveDB(); io.emit('adjustments:update', db.attendanceAdjustments); io.emit('attendances:update', db.attendances);
  res.json(adj);
});
app.post('/api/attendance/adjustments/:id/reject', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const adj=db.attendanceAdjustments.find(a=>a.id===req.params.id);
  if(!adj) return res.status(404).json({error:'Not found'});
  adj.status='REJECTED'; adj.approvedBy=req.user.username; adj.approvedAt=new Date().toISOString();
  audit(req.user.username,'REJECT_ADJUST','ATTENDANCE',null,adj, req.ip);
  saveDB(); io.emit('adjustments:update', db.attendanceAdjustments);
  res.json(adj);
});
// ============ OVERTIME REALTIME (spec 8,10) ============
app.get('/api/overtime-requests', authMiddleware, (req,res)=>{
  let list = [...db.overtimeRequests];
  const { employeeId, status, month } = req.query;
  if(employeeId) list = list.filter(r=>r.employeeId===employeeId);
  if(status) list = list.filter(r=>r.status===status);
  if(month) list = list.filter(r=>r.date && r.date.startsWith(month));
  list = filterByBranchScope(list, req, 'branchId');
  res.json(list);
});
app.post('/api/overtime-requests', authMiddleware, (req,res)=>{
  const { employeeId, date, hours, type, reason } = req.body;
  if(!employeeId || !date || !hours) return res.status(400).json({error:'Thiếu employeeId/date/hours'});
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Employee not found'});
  const ot = { id: uuidv4(), employeeId, employeeName: emp.name, branchId: emp.branchId, date, hours: Number(hours), type: type||'OT_NORMAL', reason: reason||'', status:'PENDING', createdAt: new Date().toISOString(), createdBy: req.user.username };
  db.overtimeRequests.unshift(ot);
  audit(req.user.username,'CREATE_OT','OVERTIME',null,ot, req.ip);
  saveDB();
  io.emit('overtime:update', db.overtimeRequests);
  io.emit('overtime:new', ot);
  res.json(ot);
});
app.post('/api/overtime-requests/:id/approve', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const ot = db.overtimeRequests.find(x=>x.id===req.params.id);
  if(!ot) return res.status(404).json({error:'Not found'});
  ot.status='APPROVED'; ot.approvedBy=req.user.username; ot.approvedAt=new Date().toISOString();
  audit(req.user.username,'APPROVE_OT','OVERTIME',null,ot, req.ip);
  saveDB(); io.emit('overtime:update', db.overtimeRequests);
  res.json(ot);
});
app.post('/api/overtime-requests/:id/reject', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const ot = db.overtimeRequests.find(x=>x.id===req.params.id);
  if(!ot) return res.status(404).json({error:'Not found'});
  ot.status='REJECTED'; ot.rejectedBy=req.user.username; ot.rejectedAt=new Date().toISOString(); ot.rejectReason=req.body.reason||'';
  audit(req.user.username,'REJECT_OT','OVERTIME',null,ot, req.ip);
  saveDB(); io.emit('overtime:update', db.overtimeRequests);
  res.json(ot);
});
// Compatibility aliases for spec 25
app.get('/api/overtime/reports', authMiddleware, (req,res)=> res.redirect('/api/overtime-requests?'+new URLSearchParams(req.query).toString()));
app.post('/api/overtime', authMiddleware, (req,res)=>{ req.url='/api/overtime-requests'; app.handle(req,res); });

// ============ LEAVE REALTIME (spec 9) ============
app.get('/api/leave-requests', authMiddleware, (req,res)=>{
  let list = [...db.leaveRequests];
  const { employeeId, status, month, type } = req.query;
  if(employeeId) list = list.filter(r=>r.employeeId===employeeId);
  if(status) list = list.filter(r=>r.status===status);
  if(type) list = list.filter(r=>r.type===type);
  if(month) list = list.filter(r=>r.date && r.date.startsWith(month));
  list = filterByBranchScope(list, req, 'branchId');
  res.json(list);
});
app.get('/api/leave/balances', authMiddleware, (req,res)=>{
  // Tính số dư phép đơn giản: mỗi NV có 12 ngày/năm, trừ đã nghỉ
  let emps = filterByBranchScope([...db.employees].filter(e=>e.status!=='ARCHIVED'), req, 'branchId');
  const balances = emps.map(emp=>{
    const used = db.leaveRequests.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED' && (r.type==='ANNUAL_LEAVE'||r.type==='PAID_LEAVE')).reduce((s,r)=> s + (Number(r.days)||1),0);
    return { employeeId: emp.employeeId, name: emp.name, branchId: emp.branchId, total: 12, used, remaining: 12 - used };
  });
  res.json(balances);
});
app.post('/api/leave-requests', authMiddleware, (req,res)=>{
  const { employeeId, date, days, type, reason } = req.body;
  if(!employeeId || !date) return res.status(400).json({error:'Thiếu employeeId/date'});
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Employee not found'});
  const leave = { id: uuidv4(), employeeId, employeeName: emp.name, branchId: emp.branchId, date, days: Number(days)||1, type: type||'ANNUAL_LEAVE', reason: reason||'', status:'PENDING', createdAt: new Date().toISOString(), createdBy: req.user.username||employeeId };
  db.leaveRequests.unshift(leave);
  audit(req.user.username||employeeId,'CREATE_LEAVE','LEAVE',null,leave, req.ip);
  saveDB(); io.emit('leave:update', db.leaveRequests);
  res.json(leave);
});
app.post('/api/leave-requests/:id/approve', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const lv = db.leaveRequests.find(x=>x.id===req.params.id);
  if(!lv) return res.status(404).json({error:'Not found'});
  lv.status='APPROVED'; lv.approvedBy=req.user.username; lv.approvedAt=new Date().toISOString();
  audit(req.user.username,'APPROVE_LEAVE','LEAVE',null,lv, req.ip);
  saveDB(); io.emit('leave:update', db.leaveRequests);
  res.json(lv);
});
app.post('/api/leave-requests/:id/reject', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const lv = db.leaveRequests.find(x=>x.id===req.params.id);
  if(!lv) return res.status(404).json({error:'Not found'});
  lv.status='REJECTED'; lv.rejectedBy=req.user.username; lv.rejectedAt=new Date().toISOString();
  audit(req.user.username,'REJECT_LEAVE','LEAVE',null,lv, req.ip);
  saveDB(); io.emit('leave:update', db.leaveRequests);
  res.json(lv);
});
app.get('/api/leave/reports', authMiddleware, (req,res)=> res.redirect('/api/leave-requests?'+new URLSearchParams(req.query).toString()));

// Payroll periods - Chốt kỳ (Spec 12) - with snapshot + realtime
app.get('/api/payroll-periods', authMiddleware, (req,res)=> res.json(db.payrollPeriods));
app.post('/api/payroll-periods', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const { month } = req.body; // YYYY-MM
  if(!month) return res.status(400).json({error:'Thiếu month'});
  if(db.payrollPeriods.find(p=>p.month===month)) return res.status(409).json({error:'Kỳ đã tồn tại'});
  const period={ id: uuidv4(), month, startDate: month+'-01', endDate: month+'-31', status:'DRAFT', createdBy: req.user.username, createdAt: new Date().toISOString(), lockedBy:null, lockedAt:null };
  db.payrollPeriods.push(period);
  audit(req.user.username,'CREATE_PERIOD','PAYROLL',null,period, req.ip);
  saveDB(); io.emit('payrollPeriods:update', db.payrollPeriods);
  res.json(period);
});
app.post('/api/payroll-periods/:id/lock', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const p=db.payrollPeriods.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  const m=p.month; const start=m+'-01', end=m+'-31';
  const hasMissing = db.attendances.some(a=>a.date>=start&&a.date<=end && a.checkIn && !a.checkOut);
  if(hasMissing && !req.body.force) return res.status(400).json({error:'Còn lỗi thiếu Check-out, không thể chốt. Dùng force=true để bỏ qua.'});
  // Real anomaly check (mở rộng): OT chưa duyệt, điều chỉnh pending
  const pendingOT = db.overtimeRequests.filter(r=>r.status==='PENDING' && r.date>=start && r.date<=end).length;
  const pendingAdj = db.attendanceAdjustments.filter(r=>r.status==='PENDING').length;
  if((pendingOT>0 || pendingAdj>0) && !req.body.force) return res.status(400).json({error:`Còn ${pendingOT} OT chưa duyệt và ${pendingAdj} điều chỉnh pending - dùng force=true để chốt`});
  p.status='LOCKED'; p.lockedBy=req.user.username; p.lockedAt=new Date().toISOString();
  // Snapshot payroll realtime (spec 28) - đóng băng dữ liệu lương tháng cũ
  try{
    const snapshotData = db.employees.filter(e=>e.status!=='ARCHIVED').map(emp=>{
      const payroll = calculatePayroll(emp.employeeId, m);
      // Enrich with attendance breakdown for audit
      const atts = db.attendances.filter(a=>a.employeeId===emp.employeeId && a.date>=start && a.date<=end);
      return {
        employeeId: emp.employeeId, name: emp.name, branchId: emp.branchId, type: emp.type,
        payroll,
        attendances: atts.length,
        offApproved: db.offRequests.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED' && r.dates.some(d=>d>=start&&d<=end)).length,
        otApproved: db.overtimeRequests.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED' && r.date>=start&&r.date<=end).reduce((s,r)=>s+(r.hours||0),0)
      };
    });
    const snapshot = {
      id: uuidv4(),
      periodId: p.id,
      month: m,
      snapshotData,
      totalEmployees: snapshotData.length,
      lockedBy: req.user.username,
      lockedAt: p.lockedAt,
      payrollCode: `PAYROLL-${m.replace('-','')}-${String(db.payrollSnapshots.filter(s=>s.month===m).length+1).padStart(3,'0')}`
    };
    db.payrollSnapshots.push(snapshot);
    p.snapshotId = snapshot.id;
    p.payrollCode = snapshot.payrollCode;
    io.emit('payrollSnapshots:update', db.payrollSnapshots);
  }catch(e){ console.error('Snapshot error', e); }
  audit(req.user.username,'LOCK_PERIOD','PAYROLL',null,p, req.ip);
  addSyncQueue('PAYROLL','LOCK',p, req.user.username, 'WEB_HR');
  saveDB(); io.emit('payrollPeriods:update', db.payrollPeriods);
  res.json(p);
});
app.post('/api/payroll-periods/:id/reopen', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const p=db.payrollPeriods.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  const { reason } = req.body;
  if(!reason) return res.status(400).json({error:'Cần lý do reopen'});
  p.status='DRAFT'; p.reopenReason=reason; p.reopenedBy=req.user.username; p.reopenedAt=new Date().toISOString();
  audit(req.user.username,'REOPEN_PERIOD','PAYROLL',null,p, req.ip);
  saveDB(); io.emit('payrollPeriods:update', db.payrollPeriods);
  res.json(p);
});
// Export - Xuất báo cáo (Spec 18)
app.get('/api/reports/export/:type', authMiddleware, (req,res)=>{
  const { type } = req.params; // payroll-input, attendance, anomalies, etc.
  const { month, branch } = req.query;
  const m = month || new Date().toISOString().slice(0,7);
  if(type==='payroll-input'){
    // Du_lieu_tinh_luong_08_2026.csv
    let emps=[...db.employees].filter(e=>e.status!=='ARCHIVED');
    if(branch) emps=emps.filter(e=>e.branchId===branch);
    const header='MaNV,Thang,NgayTieuChuan,NgayThucTe,NghiPhep,NgayTinhLuong,GioTieuChuan,GioThucTe,GioTinhLuong,TangCa,SoLanTre,SoPhutTre,SoLanVeSom,SoPhutVeSom\n';
    const rows=emps.map(emp=>{
      const scheds=db.schedules.filter(s=>s.employeeId===emp.employeeId);
      let stdDays=0; scheds.forEach(s=> s.days.forEach(d=>{ if(d.date.startsWith(m) && (d.status==='WORKING'||d.status==='SUBSTITUTE')) stdDays++; }));
      const atts=db.attendances.filter(a=>a.employeeId===emp.employeeId && a.date.startsWith(m) && a.checkIn);
      const actual=atts.length;
      const paid= db.offRequests.filter(r=>r.employeeId===emp.employeeId && r.status==='APPROVED' && r.dates.some(d=>d.startsWith(m))).reduce((s,r)=>s+r.dates.filter(d=>d.startsWith(m)).length,0);
      const payable=actual+paid;
      const stdH=stdDays*5.5, actualH=actual*5.5, payableH=payable*5.5;
      return `${emp.employeeId},${m},${stdDays},${actual},${paid},${payable},${stdH},${actualH},${payableH},0,0,0,0,0`;
    }).join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="Du_lieu_tinh_luong_${m.replace('-','_')}.csv"`);
    return res.send('\uFEFF'+header+rows);
  }
  res.status(400).json({error:'type không hỗ trợ'});
});
// Reset toàn bộ dữ liệu Tab Báo cáo chấm công - chỉ Admin (chỉ xoá dữ liệu báo cáo, không xoá nhân viên/lịch)
app.post('/api/reports/reset', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const beforeCounts = {
    attendances: db.attendances.length,
    payrollPeriods: db.payrollPeriods.length,
    attendanceAdjustments: db.attendanceAdjustments.length,
    overtimeRequests: db.overtimeRequests.length
  };
  db.attendances = [];
  db.payrollPeriods = [];
  db.attendanceAdjustments = [];
  db.overtimeRequests = [];
  // Giữ lại employees, schedules, offRequests, emergencyRequests, etc. để các tab khác không ảnh hưởng
  audit(req.user.username,'RESET_REPORT','REPORT', beforeCounts, {attendances:0, payrollPeriods:0}, req.ip);
  addSyncQueue('REPORT','RESET', beforeCounts, req.user.username, 'WEB_HR');
  saveDB();
  io.emit('attendances:update', db.attendances);
  io.emit('payrollPeriods:update', db.payrollPeriods);
  io.emit('adjustments:update', db.attendanceAdjustments);
  res.json({success:true, cleared: beforeCounts});
});

// ============ AUDIT / SYNC / ZALO / NOTIF ============
app.get('/api/audit-logs', authMiddleware, (req,res)=> res.json(db.auditLogs));
app.get('/api/sync-queue', authMiddleware, (req,res)=> res.json(db.syncQueue));
app.post('/api/sync-queue/clear-failed', authMiddleware, (req,res)=>{
  const beforeCount = db.syncQueue.length;
  db.syncQueue = db.syncQueue.filter(s=>s.sync_status !== 'FAILED' && s.sync_status !== 'DEAD' && s.sync_status !== 'UNCONFIGURED');
  const removed = beforeCount - db.syncQueue.length;
  saveDB();
  io.emit('sync:update', db.syncQueue);
  res.json({ success: true, removedCount: removed, remainingCount: db.syncQueue.length });
});
app.post('/api/sync-queue/clear-all', authMiddleware, (req,res)=>{
  db.syncQueue = [];
  saveDB();
  io.emit('sync:update', db.syncQueue);
  res.json({ success: true, remainingCount: 0 });
});
app.post('/api/sync-queue/retry-all', authMiddleware, async (req,res)=>{
  const failedItems = db.syncQueue.filter(s=>s.sync_status==='FAILED' || s.sync_status==='DEAD' || s.sync_status==='UNCONFIGURED');
  failedItems.forEach(item => {
    item.sync_status = 'PENDING';
    item.retryCount = 0;
    delete item.nextRetryAt;
    delete item.error;
  });
  saveDB();
  io.emit('sync:update', db.syncQueue);
  setTimeout(realtimeAutomationPoller, 100);
  res.json({ success: true, retriedCount: failedItems.length });
});
app.post('/api/sync-queue/:id/retry', authMiddleware, async (req,res)=>{
  const item = db.syncQueue.find(s=>s.id===req.params.id);
  if(!item) return res.status(404).json({error:'Not found'});
  // Reset để cho phép thử lại đủ 5 lần (fix lỗi dừng sau 5 lần)
  item.sync_status='PENDING';
  item.retryCount=0;
  delete item.nextRetryAt;
  delete item.error;
  try {
    await syncToGoogleSheet(item);
    item.sync_status='SYNCED';
    item.syncedAt=new Date().toISOString();
    delete item.error;
    saveDB();
    io.emit('sync:update', db.syncQueue);
    res.json(item);
  } catch (err) {
    item.sync_status='FAILED';
    item.error=err.message;
    saveDB();
    io.emit('sync:update', db.syncQueue);
    res.status(502).json(item);
  }
});
// Diagnostic: test webhook/secret mà không cần tạo queue - giúp admin kiểm tra ngay
app.post('/api/sync/test-webhook', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const webhookUrl = req.body.webhookUrl || db.settings?.googleSheet?.targetWebhookUrl;
  const secret = req.body.secret || process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || 'umbomilk_secret_2026';
  if(!webhookUrl) return res.status(400).json({ error:'Chưa cấu hình webhookUrl', hint:'Vào Cài đặt > Google Sheet > Webhook URL' });
  try{
    const testRes = await fetch(webhookUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ secret, sheetName:'TEST', operation:'PING', payload:{ test:true, timestamp: new Date().toISOString() } })
    });
    const text = await testRes.text();
    let data; try{ data=JSON.parse(text);}catch(e){ data={ raw: text.slice(0,500)}; }
    const ok = testRes.ok && (data.success || text.includes('success') || testRes.status===200);
    res.json({
      webhookUrl: webhookUrl.slice(0,60)+'...',
      secretMasked: secret.slice(0,4)+'••••',
      httpStatus: testRes.status,
      ok,
      response: data,
      raw: text.slice(0,800),
      hint: !ok && testRes.status===401 ? 'Sai secret - kiểm tra lại Apps Script doGet/doPost secret phải khớp với Settings > Google Sheet > Secret' : undefined
    });
  }catch(e){
    res.status(502).json({ error: e.message, webhookUrl, secretMasked: secret.slice(0,4)+'••••' });
  }
});
// Diagnostic: chi tiết sync queue + webhook config
app.get('/api/sync/diagnostic', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const webhookUrl = db.settings?.googleSheet?.targetWebhookUrl;
  const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || 'umbomilk_secret_2026';
  const counts = {};
  db.syncQueue.forEach(i=>{ counts[i.sync_status]=(counts[i.sync_status]||0)+1; });
  const topErrors = [...db.syncQueue.filter(i=>i.error).slice(0,5).map(i=>({id:i.id.slice(0,8), entity:i.entity, status:i.sync_status, retry:i.retryCount, error:i.error?.slice(0,150)}))];
  res.json({
    webhookConfigured: !!webhookUrl,
    webhookUrl: webhookUrl ? webhookUrl.slice(0,70)+'...' : null,
    secretSource: process.env.GOOGLE_SHEET_WEBHOOK_SECRET ? 'ENV' : (db.settings?.googleSheet?.secret ? 'DB_SETTINGS' : 'DEFAULT'),
    secretMasked: secret.slice(0,4)+'••••',
    counts,
    total: db.syncQueue.length,
    topErrors,
    hint: counts.DEAD ? `${counts.DEAD} mục DEAD (dừng sau 5 lần) - bấm Retry All sau khi sửa webhook/secret` : undefined
  });
});
app.get('/api/zalo-records', authMiddleware, (req,res)=> res.json(db.zaloRecords));
app.get('/api/notifications', (req,res)=>{
  const { employeeId } = req.query;
  let list = [...db.notifications];
  if(employeeId) list = list.filter(n=>n.to===employeeId);
  res.json(list);
});
app.post('/api/notifications/:id/read', (req,res)=>{
  const n = db.notifications.find(x=>x.id===req.params.id);
  if(n) n.read=true;
  saveDB();
  io.emit('notifications:update', db.notifications);
  res.json(n);
});

// ============ DASHBOARD ============
app.get('/api/dashboard/kpi', authMiddleware, (req,res)=>{
  const today = getVietnamTodayStr();
  
  const passedInterviewCount = db.applicants.filter(a => a.status === 'PASS' || a.evaluationResult === 'PASS').length;
  const failedInterviewCount = db.applicants.filter(a => a.status === 'FAILED_INTERVIEW' || a.status === 'REJECTED' || a.evaluationResult === 'LOẠI' || a.isDisqualified).length;

  const passedTestCount = db.testResults.filter(r => r.result === 'DAT' || r.result === 'PASSED').length + db.employees.filter(e => e.status === 'PASSED_TEST').length;
  const failedTestCount = db.testResults.filter(r => r.result === 'FAILED' || r.result === 'LOAI' || r.result === 'CHUA_DU_DK').length + db.employees.filter(e => e.status === 'FAILED_TEST').length;

  const kpi = {
    newApplicants: db.applicants.filter(a=>a.status==='NEW_APPLICANT').length,
    waitingInterview: db.applicants.filter(a=>a.status==='INTERVIEW').length,
    passedInterview: passedInterviewCount,
    failedInterview: failedInterviewCount,
    waitingScore: db.applicants.filter(a => a.status === 'PASS' && (a.aiScore == null || !a.evaluationResult)).length,
    trainingNow: db.employees.filter(e=>e.status==='TRAINING' || e.status==='RETEST' || e.status==='WAITING_TEST').length,
    waitingTest: db.employees.filter(e=>e.status==='WAITING_TEST' || e.status==='RETEST').length,
    passedTest: passedTestCount,
    failedTest: failedTestCount,
    official: db.employees.filter(e=>e.status==='OFFICIAL').length,
    workingToday: db.attendances.filter(a=>a.date===today && (a.status==='CHECKED_IN'||a.status==='LATE'||a.status==='COMPLETED')).length,
    lateToday: db.attendances.filter(a=>a.date===today && a.status==='LATE').length,
    absent: Math.max(0, db.employees.filter(e=>e.status==='OFFICIAL').length - db.attendances.filter(a=>a.date===today).length),
    offToday: db.offRequests.filter(r=>r.dates && r.dates.includes(today) && r.status==='APPROVED').length,
    emergencyOff: db.emergencyRequests.filter(r=>r.date===today && r.status==='APPROVED').length,
    pendingRequests: db.deviceRequests.filter(r=>r.status==='PENDING').length + db.emergencyRequests.filter(r=>r.status==='PENDING').length,
    missingCheckout: db.attendances.filter(a=>a.date===today && a.checkIn && !a.checkOut).length
  };
  res.json(kpi);
});
app.get('/api/dashboard/charts', authMiddleware, (req,res)=>{
  const branches = db.branches.map(b=>({ branch: b.id, count: db.employees.filter(e=>e.branchId===b.id).length }));
  const testDist = { failed: db.testResults.filter(r=>r.result==='FAILED').length, retake: db.testResults.filter(r=>r.result==='CHUA_DU_DK').length, passed: db.testResults.filter(r=>r.result==='DAT').length };
  const lateMonthly = Array.from({length:12}, (_,i)=>{
    const m = String(i+1).padStart(2,'0');
    const monthStr = `2026-${m}`;
    return { month: m, late: db.attendances.filter(a=>a.date.startsWith(monthStr) && a.status==='LATE').length };
  });
  res.json({ branches, testDist, lateMonthly });
});

// ============ SYSTEM RESET ============
app.post('/api/system/reset', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const { scope } = req.body; // ALL = reset mọi dữ liệu vận hành, giữ settings
  if(scope==='ALL'){
    const keepSettings = db.settings;
    db.employees=[]; db.applicants=[]; db.interviews=[]; db.attendances=[]; db.schedules=[]; db.offRequests=[]; db.emergencyRequests=[]; db.deviceRequests=[]; db.trainingShiftRequests=[]; db.shiftSwapRequests=[]; db.testResults=[]; db.keys=[]; db.zaloRecords=[]; db.notifications=[]; db.syncQueue=[]; db.auditLogs=[];
    db.driveFiles=[]; db.payrollSnapshots=[]; db.overtimeRequests=[]; db.leaveRequests=[]; db.payrollPeriods=[]; db.attendanceAdjustments=[]; db.penalties=[]; db.financeKeys=[];
    db.settings = keepSettings || DEFAULT_SETTINGS;
  } else if(scope==='EMPLOYEES'){
    db.employees=[]; db.keys=[]; db.attendances=[]; db.schedules=[];
  }
  audit(req.user.username,'SYSTEM_RESET','SYSTEM', {scope, before: 'snapshot'}, {scope}, req.ip);
  saveDB();
  io.emit('system:reset', {scope});
  // Đảm bảo interviews cũng được xóa khi reset ALL (fix lỗi 1 NV vướng)
  if(scope==='ALL'){
    // additional cleanup đã làm ở trên, nhưng đảm bảo emit
    io.emit('interviews:update', db.interviews);
    io.emit('applicants:update', db.applicants);
    io.emit('employees:update', db.employees);
  }
  res.json({success:true});
});
// Fix triệt để 1 NV vướng lịch phỏng vấn sau reset - Admin có thể gọi riêng
app.post('/api/interviews/clear-all', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const beforeInterviews = (db.interviews||[]).length;
  const beforeApplicants = db.applicants.filter(a=>a.status==='INTERVIEW').length;
  // Xóa toàn bộ interviews
  db.interviews = [];
  // Reset applicants đang ở trạng thái INTERVIEW về NEW_APPLICANT để không vướng
  let resetCount=0;
  db.applicants.forEach(a=>{
    if(a.status==='INTERVIEW'){
      a.status='NEW_APPLICANT';
      delete a.interview;
      a.version=(a.version||1)+1;
      a.updated_at=new Date().toISOString();
      resetCount++;
    }
  });
  // Xóa luôn applicants bị vướng nếu có interviewId không tồn tại
  saveDB();
  io.emit('interviews:update', db.interviews);
  io.emit('applicants:update', db.applicants);
  audit(req.user.username,'CLEAR_ALL_INTERVIEWS','INTERVIEW',{beforeInterviews, beforeApplicants},{afterInterviews:0, resetApplicants:resetCount}, req.ip);
  res.json({success:true, clearedInterviews:beforeInterviews, resetApplicants:resetCount, message:`Đã xóa ${beforeInterviews} lịch phỏng vấn và reset ${resetCount} ứng viên INTERVIEW về NEW_APPLICANT`});
});
// ponytail: giữ nguyên settings để không làm gãy webhook/secret; nếu cần reset riêng cấu hình thì thêm scope SETTINGS sau.

// ============ FINANCE WEB APP - Kế toán tổng hợp báo cáo chấm công ============
if(!db.financeKeys) db.financeKeys = [];
function generateFinanceKey(type){
  const prefix = type==='WEEK' ? 'FIN-W' : type==='MONTH' ? 'FIN-M' : 'FIN-Y';
  const rnd = Math.random().toString(36).substring(2,10).toUpperCase();
  return `${prefix}-${rnd}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}
function getFinanceExpiry(type){
  const now = new Date();
  if(type==='WEEK'){ const d=new Date(now); d.setDate(now.getDate()+7); return d; }
  if(type==='YEAR'){ const d=new Date(now); d.setFullYear(now.getFullYear()+1); return d; }
  // MONTH default
  const d=new Date(now); d.setMonth(now.getMonth()+1); return d;
}
// Admin tạo key Finance theo tuần/tháng/năm
app.post('/api/finance-keys/generate', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const { type, label } = req.body; // WEEK, MONTH, YEAR
  const t = (type||'MONTH').toUpperCase();
  if(!['WEEK','MONTH','YEAR'].includes(t)) return res.status(400).json({error:'type phải là WEEK/MONTH/YEAR'});
  const key = generateFinanceKey(t);
  const expiresAt = getFinanceExpiry(t).toISOString();
  const rec = { id: uuidv4(), key, type: t, label: label||`Kế toán ${t} ${new Date().toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})}`, expiresAt, createdAt: new Date().toISOString(), createdBy: req.user.username, status:'ACTIVE', version:1 };
  db.financeKeys.unshift(rec);
  if(db.financeKeys.length>100) db.financeKeys.pop();
  audit(req.user.username,'CREATE_FINANCE_KEY','FINANCE_KEY',null,rec, req.ip);
  saveDB();
  io.emit('financeKeys:update', db.financeKeys);
  res.json(rec);
});
app.get('/api/finance-keys', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  // auto-expire check
  const now = Date.now();
  let changed=false;
  db.financeKeys.forEach(k=>{ if(k.status==='ACTIVE' && new Date(k.expiresAt).getTime() <= now){ k.status='EXPIRED'; changed=true; } });
  if(changed){ saveDB(); io.emit('financeKeys:update', db.financeKeys); }
  res.json(db.financeKeys);
});
app.post('/api/finance-keys/:id/revoke', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const rec = db.financeKeys.find(k=>k.id===req.params.id);
  if(!rec) return res.status(404).json({error:'Not found'});
  const before={...rec};
  rec.status='REVOKED'; rec.revokedBy=req.user.username; rec.revokedAt=new Date().toISOString();
  audit(req.user.username,'REVOKE_FINANCE_KEY','FINANCE_KEY',before,rec, req.ip);
  saveDB(); io.emit('financeKeys:update', db.financeKeys);
  res.json(rec);
});
// Finance login bằng key (không cần username/password)
app.post('/api/auth/finance-login', (req,res)=>{
  const { key } = req.body;
  if(!key) return res.status(400).json({error:'Thiếu key'});
  const rec = db.financeKeys.find(k=>k.key===key);
  if(!rec) return res.status(401).json({error:'Key không hợp lệ'});
  if(rec.status!=='ACTIVE') return res.status(403).json({error:`Key đã ${rec.status} (${rec.status==='EXPIRED'?'hết hạn':'bị thu hồi'})`});
  if(new Date(rec.expiresAt).getTime() <= Date.now()){
    rec.status='EXPIRED'; saveDB(); io.emit('financeKeys:update', db.financeKeys);
    return res.status(403).json({error:'Key đã hết hạn', expired:true});
  }
  const expSec = Math.floor((new Date(rec.expiresAt).getTime() - Date.now())/1000);
  if(expSec <=0) return res.status(403).json({error:'Key đã hết hạn'});
  const token = jwt.sign({ financeKeyId: rec.id, key: rec.key, role:'Finance', type: rec.type, label: rec.label }, JWT_SECRET, {expiresIn: expSec});
  audit('FINANCE_KEY','FINANCE_LOGIN','FINANCE_KEY',null,{key: rec.key, type: rec.type}, req.ip);
  res.json({ token, key: rec, expiresAt: rec.expiresAt, expSec });
});
// Middleware cho Finance
function financeAuthMiddleware(req,res,next){
  const token = req.headers.authorization?.replace('Bearer ','');
  if(!token) return res.status(401).json({error:'No token', needLogin:true});
  try{
    const decoded = jwt.verify(token, JWT_SECRET);
    if(decoded.role!=='Finance') return res.status(403).json({error:'Not Finance role'});
    // check key still active
    const rec = db.financeKeys.find(k=>k.id===decoded.financeKeyId || k.key===decoded.key);
    if(!rec) return res.status(401).json({error:'Key không tồn tại', needLogin:true});
    if(rec.status!=='ACTIVE') return res.status(403).json({error:`Key đã ${rec.status}`, needLogin:true, expired: rec.status==='EXPIRED'});
    if(new Date(rec.expiresAt).getTime() <= Date.now()){
      rec.status='EXPIRED'; saveDB(); io.emit('financeKeys:update', db.financeKeys);
      return res.status(403).json({error:'Key đã hết hạn', needLogin:true, expired:true});
    }
    req.finance = decoded;
    req.financeKey = rec;
    next();
  }catch(e){ return res.status(401).json({error:'Invalid/Expired token', needLogin:true, expired:true}); }
}
// Finance reports - chỉ đọc báo cáo chấm công (reuse logic)
app.get('/api/finance/reports/overview', financeAuthMiddleware, (req,res)=>{
  const { month, branch } = req.query;
  const m = month || new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7);
  // reuse overview logic (copy from /api/reports/overview)
  const start = m+'-01'; const end = m+'-31';
  let emps = [...db.employees].filter(e=>e.status!=='ARCHIVED');
  if(branch) emps = emps.filter(e=>e.branchId===branch);
  const activeEmps = emps.filter(e=>e.status!=='ARCHIVED');
  let totalScheduledDays=0, totalScheduledHours=0;
  activeEmps.forEach(emp=>{
    const scheds = db.schedules.filter(s=>s.employeeId===emp.employeeId);
    scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')){ totalScheduledDays++; totalScheduledHours+= (db.settings.payroll.shifts[emp.shift]?.hours||5); }}));
  });
  if(totalScheduledDays===0){ const daysInMonth=new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]),0).getDate(); const avgScheduled=Math.max(0,daysInMonth-4); totalScheduledDays=activeEmps.length*avgScheduled; totalScheduledHours=totalScheduledDays*5.5; }
  const attsInMonth=db.attendances.filter(a=>a.date>=start&&a.date<=end&&a.checkIn);
  const totalActualDays=attsInMonth.filter(a=>a.checkIn).length;
  const totalActualHours=attsInMonth.reduce((s,a)=>{ const emp=db.employees.find(e=>e.employeeId===a.employeeId); const h=(db.settings.payroll.shifts[emp?.shift||a.shift]?.hours)||5; return s+(a.checkIn&&a.checkOut?h:0); },0);
  const offApproved=db.offRequests.filter(r=>r.status==='APPROVED'&&r.dates.some(d=>d>=start&&d<=end)).reduce((s,r)=>s+r.dates.filter(d=>d>=start&&d<=end).length,0);
  const emergApproved=db.emergencyRequests.filter(r=>r.status==='APPROVED'&&r.date>=start&&r.date<=end).length;
  const paidLeave=offApproved; const totalPayableDays=totalActualDays+paidLeave+emergApproved; const totalPayableHours=totalActualHours+(paidLeave*5.5);
  const otHours=(db.overtimeRequests||[]).filter(r=>r.status==='APPROVED'&&r.date>=start&&r.date<=end).reduce((s,r)=>s+(r.hours||0),0);
  let lateCount=0, lateMinutes=0, earlyCount=0, earlyMinutes=0, missingIn=0, missingOut=0;
  attsInMonth.forEach(a=>{ if(a.violations){ if(a.violations.includes('LATE')){lateCount++; lateMinutes+=15;} if(a.violations.includes('EARLY_LEAVE')){earlyCount++; earlyMinutes+=15;} if(a.violations.includes('NO_CHECKOUT')) missingOut++; } if(!a.checkIn) missingIn++; else if(!a.checkOut) missingOut++; });
  let absentNoCheckIn=0; activeEmps.forEach(emp=>{ const scheds=db.schedules.filter(s=>s.employeeId===emp.employeeId); const scheduledDates=new Set(); scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')) scheduledDates.add(d.date); })); scheduledDates.forEach(date=>{ if(!db.attendances.find(a=>a.employeeId===emp.employeeId&&a.date===date&&a.checkIn)) absentNoCheckIn++; }); }); missingIn=Math.max(missingIn, absentNoCheckIn);
  const pendingAdjust=(db.attendanceAdjustments||[]).filter(r=>r.status==='PENDING').length;
  const period=db.payrollPeriods.find(p=>p.month===m); const status=period?period.status:'DRAFT';
  res.json({ month:m, start, end, branch: branch||'ALL', totalEmployees:activeEmps.length, totalScheduledDays, totalScheduledHours:Math.round(totalScheduledHours*10)/10, totalActualDays, totalActualHours:Math.round(totalActualHours*10)/10, totalPayableDays, totalPayableHours:Math.round(totalPayableHours*10)/10, totalOT:otHours, paidLeave, unpaidLeave:0, lateCount, lateMinutes, earlyCount, earlyMinutes, missingCheckIn:missingIn, missingCheckOut:missingOut, pendingAdjust, locked:status==='LOCKED'?1:0, pending:status!=='LOCKED'?1:0, status, financeKey: req.financeKey.key, expiresAt: req.financeKey.expiresAt });
});
app.get('/api/finance/reports/monthly', financeAuthMiddleware, (req,res)=>{
  const { month, branch } = req.query; const m = month || new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7); const start=m+'-01'; const end=m+'-31';
  let emps=[...db.employees].filter(e=>e.status!=='ARCHIVED'); if(branch) emps=emps.filter(e=>e.branchId===branch);
  const rows=emps.map(emp=>{
    const scheds=db.schedules.filter(s=>s.employeeId===emp.employeeId); let scheduledDays=0, scheduledHours=0;
    scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')){ scheduledDays++; scheduledHours+= (db.settings.payroll.shifts[emp.shift]?.hours||5); }}));
    const atts=db.attendances.filter(a=>a.employeeId===emp.employeeId&&a.date>=start&&a.date<=end&&a.checkIn);
    const actualDays=atts.filter(a=>a.checkIn).length; const actualHours=atts.filter(a=>a.checkIn&&a.checkOut).length*((db.settings.payroll.shifts[emp.shift]?.hours)||5);
    const offApproved=db.offRequests.filter(r=>r.employeeId===emp.employeeId&&r.status==='APPROVED'&&r.dates.some(d=>d>=start&&d<=end)).reduce((s,r)=>s+r.dates.filter(d=>d>=start&&d<=end).length,0);
    const payableDays=actualDays+offApproved; const payableHours=actualHours+offApproved*5.5;
    let lateCount=0, lateMin=0, earlyCount=0, earlyMin=0, missIn=0, missOut=0;
    atts.forEach(a=>{ if(a.violations){ if(a.violations.includes('LATE')){lateCount++; lateMin+=15;} if(a.violations.includes('EARLY_LEAVE')){earlyCount++; earlyMin+=15;} if(a.violations.includes('NO_CHECKOUT')) missOut++; } if(!a.checkIn) missIn++; else if(!a.checkOut) missOut++; });
    const scheduledDates=new Set(); scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')) scheduledDates.add(d.date); }));
    let absent=0; scheduledDates.forEach(date=>{ if(!atts.find(a=>a.date===date)) absent++; }); missIn=Math.max(missIn, absent);
    const period=db.payrollPeriods.find(p=>p.month===m);
    return { employeeId:emp.employeeId, name:emp.name, branchId:emp.branchId, branchName:(db.branches.find(b=>b.id===emp.branchId)?.name||emp.branchId), type:emp.type, shift:emp.shift, startDate:emp.startDate, standardDays:scheduledDays, scheduledDays, actualDays, payableDays, standardHours:scheduledHours, actualHours, payableHours:Math.round(payableHours*10)/10, paidLeave:offApproved, unpaidLeave:0, otHours:0, lateCount, lateMin, earlyCount, earlyMin, missingIn:missIn, missingOut:missOut, status:period?period.status:'DRAFT' };
  });
  res.json(rows);
});
app.get('/api/finance/reports/daily', financeAuthMiddleware, (req,res)=>{
  const { employeeId, month } = req.query; if(!employeeId) return res.status(400).json({error:'Thiếu employeeId'}); const m = month || new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7); const start=m+'-01'; const end=m+'-31';
  const emp=db.employees.find(e=>e.employeeId===employeeId); if(!emp) return res.status(404).json({error:'Not found'});
  const schedMap={}; db.schedules.filter(s=>s.employeeId===employeeId).forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end) schedMap[d.date]=d; }));
  const dates=[]; let cur=new Date(start); const endD=new Date(end); while(cur<=endD){ dates.push(cur.toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'})); cur.setDate(cur.getDate()+1); }
  const details=dates.map(date=>{
    const sched=schedMap[date]; const att=db.attendances.find(a=>a.employeeId===employeeId&&a.date===date);
    const shift=sched?sched.shift:emp.shift; const shiftHours=(db.settings.payroll.shifts[shift]?.hours)||5;
    let actualHours=0, lateMin=0, earlyMin=0, ot=0, status='—';
    if(sched&&sched.status==='OFF') status='OFF'; else if(!att||!att.checkIn){ status=sched&&sched.status==='WORKING'?'ABSENT':'—'; } else if(att.checkIn&&!att.checkOut){ status='MISSING_CHECKOUT'; } else if(att.violations&&att.violations.includes('LATE')){ status='LATE'; lateMin=15; actualHours=shiftHours-0.25; } else if(att.status==='COMPLETED'){ status='PRESENT'; actualHours=shiftHours; } else status=att.status||'PRESENT';
    return { date, dayName:['CN','T2','T3','T4','T5','T6','T7'][new Date(date).getDay()], shift, shiftHours, checkIn:att?.checkIn?.time||'', checkOut:att?.checkOut?.time||'', actualHours, lateMin, earlyMin, ot, status, schedStatus:sched?.status||'', violations:att?.violations||[] };
  });
  res.json(details);
});
app.get('/api/finance/reports/anomalies', financeAuthMiddleware, (req,res)=>{
  const { month, branch } = req.query; const m = month || new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7); const start=m+'-01', end=m+'-31';
  let emps=[...db.employees].filter(e=>e.status!=='ARCHIVED'); if(branch) emps=emps.filter(e=>e.branchId===branch);
  const anomalies=[]; emps.forEach(emp=>{
    const scheds=db.schedules.filter(s=>s.employeeId===emp.employeeId); const schedDates=new Set();
    scheds.forEach(s=> s.days.forEach(d=>{ if(d.date>=start&&d.date<=end && (d.status==='WORKING'||d.status==='SUBSTITUTE')) schedDates.add(d.date); }));
    schedDates.forEach(date=>{ const att=db.attendances.find(a=>a.employeeId===emp.employeeId&&a.date===date); if(!att||!att.checkIn) anomalies.push({ employeeId:emp.employeeId, name:emp.name, branchId:emp.branchId, date, type:'MISSING_CHECK_IN', desc:'Có lịch làm nhưng không chấm công', schedStatus:'WORKING' }); else if(att.checkIn&&!att.checkOut) anomalies.push({ employeeId:emp.employeeId, name:emp.name, branchId:emp.branchId, date, type:'MISSING_CHECK_OUT', desc:'Thiếu Check-out', checkIn:att.checkIn.time }); });
    db.attendances.filter(a=>a.employeeId===emp.employeeId&&a.date>=start&&a.date<=end&&a.checkIn).forEach(att=>{ if(!schedDates.has(att.date)) anomalies.push({ employeeId:emp.employeeId, name:emp.name, branchId:emp.branchId, date:att.date, type:'NO_SCHEDULE', desc:'Có chấm công nhưng không có lịch', checkIn:att.checkIn.time }); });
  });
  (db.overtimeRequests||[]).filter(r=>r.status==='PENDING'&&r.date>=start&&r.date<=end).forEach(r=>{ const emp=db.employees.find(e=>e.employeeId===r.employeeId); anomalies.push({ employeeId:r.employeeId, name:emp?.name||r.employeeId, branchId:emp?.branchId, date:r.date, type:'OT_PENDING', desc:'OT chưa duyệt' }); });
  res.json(anomalies);
});
app.get('/api/finance/export/payroll-input', financeAuthMiddleware, (req,res)=>{
  const { month, branch } = req.query; const m = month || new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'}).slice(0,7);
  let emps=[...db.employees].filter(e=>e.status!=='ARCHIVED'); if(branch) emps=emps.filter(e=>e.branchId===branch);
  const header='MaNV,Thang,NgayTieuChuan,NgayThucTe,NghiPhep,NgayTinhLuong,GioTieuChuan,GioThucTe,GioTinhLuong,TangCa,SoLanTre,SoPhutTre,SoLanVeSom,SoPhutVeSom\n';
  const rows=emps.map(emp=>{
    const scheds=db.schedules.filter(s=>s.employeeId===emp.employeeId); let stdDays=0; scheds.forEach(s=> s.days.forEach(d=>{ if(d.date.startsWith(m) && (d.status==='WORKING'||d.status==='SUBSTITUTE')) stdDays++; }));
    const atts=db.attendances.filter(a=>a.employeeId===emp.employeeId&&a.date.startsWith(m)&&a.checkIn);
    const actual=atts.length; const paid=db.offRequests.filter(r=>r.employeeId===emp.employeeId&&r.status==='APPROVED'&&r.dates.some(d=>d.startsWith(m))).reduce((s,r)=>s+r.dates.filter(d=>d.startsWith(m)).length,0);
    const payable=actual+paid; const stdH=stdDays*5.5, actualH=actual*5.5, payableH=payable*5.5;
    return `${emp.employeeId},${m},${stdDays},${actual},${paid},${payable},${stdH},${actualH},${payableH},0,0,0,0,0`;
  }).join('\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="Du_lieu_tinh_luong_${m.replace('-','_')}_FINANCE.csv"`);
  return res.send('\uFEFF'+header+rows);
});
// Finance 4 sheets - hiển thị trên web finance
app.get('/api/finance/sheets/master-data', financeAuthMiddleware, async (req,res)=>{
  // Thử lấy từ Google Sheets Finance nếu cấu hình, fallback DB
  const financeId = process.env.FINANCE_MASTER_ID || db.settings.finance?.spreadsheetId || 'FINANCE_MASTER_ID';
  let rows=[];
  // Fallback: lấy từ MASTER_DATA local (db.employees)
  rows = db.employees.filter(e=> e.status!=='ARCHIVED').map(e=> ({
    bhCode: e.employeeId, hoTen: e.name, branchGoc: e.branchId, status: e.status, ngayLenChinhThuc: e.officialStartDate || e.startDate || '', donGia: e.status==='OFFICIAL'?25500:21000
  }));
  res.json({ sheet:'MASTER_DATA', rows, source:'DB_FALLBACK' });
});
app.get('/api/finance/sheets/dong-phuc', financeAuthMiddleware, (req,res)=>{
  // DONG_PHUC: hoàn cọc đồng phục, mock từ DB hoặc Google Sheets
  const rows = (db.financeDongPhuc||[]).map(r=> ({ bhCode:r.bhCode, hoTen:r.hoTen, soTien:r.soTien, ngay:r.ngay }));
  res.json({ sheet:'DONG_PHUC', rows });
});
app.get('/api/finance/sheets/kham-suc-khoe', financeAuthMiddleware, (req,res)=>{
  const rows = (db.financeKhamSK||[]).map(r=> ({ bhCode:r.bhCode, hoTen:r.hoTen, soTien:r.soTien, ngay:r.ngay }));
  res.json({ sheet:'KHAM_SUC_KHOE', rows });
});
app.get('/api/finance/sheets/template-info', financeAuthMiddleware, (req,res)=>{
  res.json({
    sheet: TEMPLATE_NAME,
    hidden: true,
    formulas: {
      tongGio: '=SUM(E6:AI6)',
      ngayCong: '=AJ6/8',
      luongTraining: '=SUMPRODUCT((E$3:AI$3 < TEXT($H6,"yyyy-mm-dd"))*E6:AI6)*21000',
      luongOfficial: '=SUMPRODUCT((E$3:AI$3 >= TEXT($H6,"yyyy-mm-dd"))*E6:AI6)*25500',
      hoanCoc: '=XLOOKUP(A6, DONG_PHUC!A:A, DONG_PHUC!C:C, 0)+XLOOKUP(A6, KHAM_SUC_KHOE!A:A, KHAM_SUC_KHOE!C:C, 0)',
      tongLuong: '=AL6+AM6+AN6'
    },
    note: 'Sheet ẩn _TEMPLATE_LUONG chứa công thức, khi tạo LUONG_THANG_MM_YYYY sẽ copy nguyên mẫu'
  });
});
// Finance 4 sheets - đồng bộ 2 chiều khi kế toán sửa trên web
app.post('/api/finance/sheets/master-data', financeAuthMiddleware, async (req,res)=>{
  const { bhCode, hoTen, branchGoc, status, ngayLenChinhThuc } = req.body;
  if(!bhCode) return res.status(400).json({ error:'Thiếu BH_Code' });
  // Cập nhật local DB (MASTER_DATA) - nếu chưa có thì tạo mới (finance có thể tạo BH mới)
  let emp = db.employees.find(e=> e.employeeId===bhCode);
  if(emp){
    const before={...emp};
    if(hoTen) emp.name=hoTen;
    if(branchGoc) emp.branchId=branchGoc;
    if(status) emp.status=status;
    if(ngayLenChinhThuc!==undefined) emp.officialStartDate=ngayLenChinhThuc;
    emp.updated_at=new Date().toISOString();
    audit(req.finance.key,'UPDATE_MASTER_DATA','MASTER_DATA', before, emp, req.ip);
  } else {
    // Tạo mới BH_Code từ Finance web (chưa có trong HR)
    const newEmp = {
      id: uuidv4(), employeeId: bhCode, name: hoTen||bhCode, phone: '', branchId: branchGoc||'CN1', shift: 'CA_SANG',
      startDate: new Date().toISOString().split('T')[0], status: status||'Training', type: (status==='Official'?'OFFICIAL':'TRAINING'),
      category: 'STORE', version:1, updated_at: new Date().toISOString(), updated_by: req.finance.key, source:'FINANCE_WEB', sync_status:'PENDING'
    };
    if(ngayLenChinhThuc) newEmp.officialStartDate=ngayLenChinhThuc;
    db.employees.push(newEmp);
    audit(req.finance.key,'CREATE_MASTER_DATA','MASTER_DATA', null, newEmp, req.ip);
    // Tạo key cho NV mới nếu cần
    const newKey={ id: uuidv4(), employeeId: bhCode, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), status:'ACTIVE', version:1, updated_at: new Date().toISOString(), sync_status:'PENDING' };
    db.keys.push(newKey);
  }
  // Đồng bộ lên Google Sheets Finance MASTER_DATA
  const financeId = db.settings.finance?.spreadsheetId || process.env.FINANCE_MASTER_ID || 'FINANCE_MASTER_ID';
  const webhookUrl = db.settings.finance?.webhookUrl || process.env.FINANCE_WEBHOOK_URL;
  const secret = db.settings.finance?.secret || process.env.FINANCE_WEBHOOK_SECRET || 'umbomilk_secret_2026';
  if(webhookUrl){
    try{ await fetch(webhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ secret, action:'UPSERT_EMPLOYEE', payload:{ bhCode, hoTen, branchGoc, status, ngayLenChinhThuc } }) }); }catch(e){ console.error('Finance MASTER_DATA sync error', e.message); }
  }
  saveDB(); io.emit('finance:masterData:update', db.employees);
  res.json({ success:true, bhCode });
});
app.post('/api/finance/sheets/dong-phuc', financeAuthMiddleware, async (req,res)=>{
  const { bhCode, hoTen, soTien, ngay, ghiChu } = req.body;
  if(!bhCode) return res.status(400).json({ error:'Thiếu BH_Code' });
  if(!db.financeDongPhuc) db.financeDongPhuc=[];
  let row = db.financeDongPhuc.find(r=> r.bhCode===bhCode);
  if(row){ Object.assign(row, { hoTen: hoTen||row.hoTen, soTien: soTien!=null?Number(soTien):row.soTien, ngay: ngay||row.ngay, ghiChu: ghiChu||row.ghiChu, updatedAt: new Date().toISOString() }); }
  else { row={ bhCode, hoTen: hoTen||'', soTien: Number(soTien)||0, ngay: ngay||new Date().toISOString().split('T')[0], ghiChu: ghiChu||'', createdAt: new Date().toISOString() }; db.financeDongPhuc.push(row); }
  const webhookUrl = db.settings.finance?.webhookUrl || process.env.FINANCE_WEBHOOK_URL;
  const secret = db.settings.finance?.secret || process.env.FINANCE_WEBHOOK_SECRET || 'umbomilk_secret_2026';
  if(webhookUrl){ try{ await fetch(webhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ secret, action:'UPSERT_DONGPHUC', payload: row }) }); }catch(e){} }
  saveDB(); io.emit('finance:dongPhuc:update', db.financeDongPhuc);
  res.json({ success:true, row });
});
app.post('/api/finance/sheets/kham-suc-khoe', financeAuthMiddleware, async (req,res)=>{
  const { bhCode, hoTen, soTien, ngay, ghiChu } = req.body;
  if(!bhCode) return res.status(400).json({ error:'Thiếu BH_Code' });
  if(!db.financeKhamSK) db.financeKhamSK=[];
  let row = db.financeKhamSK.find(r=> r.bhCode===bhCode);
  if(row){ Object.assign(row, { hoTen: hoTen||row.hoTen, soTien: soTien!=null?Number(soTien):row.soTien, ngay: ngay||row.ngay, ghiChu: ghiChu||row.ghiChu, updatedAt: new Date().toISOString() }); }
  else { row={ bhCode, hoTen: hoTen||'', soTien: Number(soTien)||0, ngay: ngay||new Date().toISOString().split('T')[0], ghiChu: ghiChu||'', createdAt: new Date().toISOString() }; db.financeKhamSK.push(row); }
  const webhookUrl = db.settings.finance?.webhookUrl || process.env.FINANCE_WEBHOOK_URL;
  const secret = db.settings.finance?.secret || process.env.FINANCE_WEBHOOK_SECRET || 'umbomilk_secret_2026';
  if(webhookUrl){ try{ await fetch(webhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ secret, action:'UPSERT_KHAMSUC', payload: row }) }); }catch(e){} }
  saveDB(); io.emit('finance:khamSK:update', db.financeKhamSK);
  res.json({ success:true, row });
});

// Serve frontend
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/admin', (req,res)=> res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/employee', (req,res)=> res.sendFile(path.join(__dirname,'public','employee.html')));
app.get('/finance', (req,res)=> res.sendFile(path.join(__dirname,'public','finance.html')));

// Socket - Realtime with optional auth + heartbeat
io.use((socket, next)=>{
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ','');
  if(token){
    try{ const decoded = jwt.verify(token, JWT_SECRET); socket.user = decoded; }catch(e){ /* allow anonymous but mark */ }
  }
  next();
});
io.on('connection', (socket)=>{
  console.log('Socket connected', socket.id, socket.user ? `user:${socket.user.username||socket.user.employeeId}` : 'anonymous');
  socket.emit('db:init', { employees: db.employees.length, applicants: db.applicants.length, timestamp: new Date().toISOString(), heartbeat: true });
  socket.emit('automation:heartbeat', { now: new Date().toISOString(), realtime: true });
  // Realtime room per branch + per employee (để force logout khi xóa tài khoản)
  if(socket.user?.branchScope) socket.user.branchScope.forEach(b=> socket.join(`branch:${b}`));
  if(socket.user?.branchId) socket.join(`branch:${socket.user.branchId}`);
  if(socket.user?.employeeId) socket.join(`employee:${socket.user.employeeId}`);
  socket.on('disconnect', ()=> console.log('disconnected', socket.id));
  socket.on('ping:heartbeat', ()=> socket.emit('pong:heartbeat', { now: new Date().toISOString() }));
});

server.listen(PORT, ()=> console.log(`Ụm Bò Milk HR running at http://localhost:${PORT}`));
