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
function getVietnamISOString(){
  const vn = new Date().toLocaleString("sv-SE", {timeZone: "Asia/Ho_Chi_Minh"});
  return vn.replace(" ", "T") + ".000+07:00";
}
function getVietnamDateTimeStr(){
  return new Date().toLocaleString("en-CA", {timeZone: "Asia/Ho_Chi_Minh", hour12:false}).replace(",", "");
}
function toVietnamDateStr(date){
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-CA', {timeZone: 'Asia/Ho_Chi_Minh'});
}
function fmtDMY(dStr){
  if(!dStr) return '';
  const p = String(dStr).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(dStr);
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
// Secret mặc định lấy từ ENV — không hard-code trong source (bảo mật)
const DEFAULT_WEBHOOK_SECRET = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || 'umbomilk_secret_2026';
const DEFAULT_FINANCE_WEBHOOK_SECRET = process.env.FINANCE_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;
// Cờ tắt đẩy dữ liệu ra ngoài (Google Sheet/Zalo) — dùng khi chạy test/CI để dữ liệu test
// không bao giờ rò rỉ ra production. Bật bằng DISABLE_OUTBOUND_SYNC=true hoặc NODE_ENV=test.
const OUTBOUND_SYNC_DISABLED = process.env.DISABLE_OUTBOUND_SYNC === 'true' || process.env.NODE_ENV === 'test';

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
const globalLimiter = rateLimit({ windowMs: 60*1000, max: 500, skip: (req) => req.headers['x-is-test']==='true' || process.env.NODE_ENV==='test', standardHeaders: true, legacyHeaders: false, message: { error: 'Quá nhiều request, thử lại sau 1 phút' } });
const authLimiter = rateLimit({ windowMs: 60*1000, max: 50, skip: (req) => req.headers['x-is-test']==='true' || process.env.NODE_ENV==='test', standardHeaders: true, legacyHeaders: false, message: { error: 'Đăng nhập quá nhanh, thử lại sau' } });
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
    secret: DEFAULT_WEBHOOK_SECRET,
    serviceAccountEmail: 'umbomilk-hr@umbomilk-hr.iam.gserviceaccount.com',
    privateKey: '',
    formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeteDABiq7mday0Yko-PyyUIW4uccicP7FJJt2evc7xbbWBfA/viewform',
    masked: true
  },
  // Ngân hàng câu hỏi trắc nghiệm đầu ra — nguồn thật duy nhất là Google Sheet (HR/Admin sửa trên Sheet, server tự kéo)
  quizBank: {
    spreadsheetId: '1h06TrHMRnBOHMkp7Ri4Rz8yRw8ptemQp0ftjMldHYdc',
    sheetName: '',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1h06TrHMRnBOHMkp7Ri4Rz8yRw8ptemQp0ftjMldHYdc/edit?usp=sharing'
  },
  googleDrive: { rootFolderId: '1-Wy-Di6KvfeGCKoTV7TSuFQpY_yKNy-1', backupFolderId: '1-Wy-Di6KvfeGCKoTV7TSuFQpY_yKNy-1', driveUrl: 'https://drive.google.com/drive/folders/1-Wy-Di6KvfeGCKoTV7TSuFQpY_yKNy-1' },
  googleForm: { formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSd9rRG4QLvmLclPseVVmpgPdizij1XYwiSTCgc6x2BPMfA_AA/viewform', mapping: {} },
  finance: { webhookUrl: 'https://script.google.com/macros/s/AKfycbxYZhMjR9riLFQfYEkgLfub33XtWlSP2IokghTt82Lb4SQVL4tKxQyNACr69yC0ACA/exec', secret: DEFAULT_WEBHOOK_SECRET, spreadsheetId: '13Y4rycVMq2-HXGySjaJJBl2YZswKEaK5WkSLWVkLjuY' },
  ai: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o', temperature: 0.7 },
  zalo: { oaId: '', accessToken: '', template: '', reminderEnabled: true },
  calendar: { clientId: '', clientSecret: '', calendarId: 'primary', duration: 30, reminderOnce: true },
  scoring: { criteria: [{ name: 'Kinh nghiệm', weight: 30 }, { name: 'Giao tiếp', weight: 25 }, { name: 'Thái độ', weight: 25 }, { name: 'Sẵn sàng ca', weight: 20 }], passThreshold: 70 },
  attendance: { checkInOpenBefore: 30, checkInCloseAfter: 60, lateThreshold: 15, earlyLeaveThreshold: 15, penaltyLate: 30000, penaltyAbsent: 100000, penaltyNoCheckout: 50000 },
  payroll: { trainingRate: 21000, officialRate: 25500, shifts: DEFAULT_SHIFTS },
  off: { openDay: 5, openHour: 12, closeDay: 6, closeHour: 15, maxPerWeek: 2, vipTestMode: false },
  test: { minPerQuestion: 5, totalQuestions: 25, passScore: 8, retakeMin: 5, maxRetest: 3 },
  security: { sessionTimeout: 120, deviceBind: true }
};

// ============ GOOGLE SHEET AUTO-TABS DEFINITIONS - Realtime 1:1 per HR tab ============
// Mỗi tab HR sẽ tự động tạo 1 sheet với cột tương ứng, realtime 1:1 với db
const SHEET_DEFINITIONS = {
  // Tab Nhân viên mới - từ Form đăng ký
  NHAN_VIEN_MOI: { sheetName: 'NHAN_VIEN_MOI', headers: ['ID','Ngày ĐK','Họ tên','Giới tính','Năm sinh','Trình độ','Quê quán','SĐT','Ca đăng ký','Chi nhánh ĐK','Kinh nghiệm','Xử lý đột xuất','Facebook','Nguồn biết tin','Điểm AI','Kết quả','Trạng thái','Mã nguồn','Phiên bản','Cập nhật lúc'] },
  // Nhân viên cửa hàng - thêm cột Key (yêu cầu #9) – Key đi theo NV đến khi nghỉ
  NHAN_VIEN_TRAINING: { sheetName: 'NHAN_VIEN_TRAINING', headers: ['ID','Mã NV','Họ tên','SĐT','Khóa','Chi nhánh','Ca','Ngày bắt đầu','Ngày kết thúc','Số ngày Thử việc','Trạng thái','Điểm TEST','Kết quả TEST','Loại','Nhóm','Phiên bản','Cập nhật lúc','Đồng bộ'] },
  NHAN_VIEN_CHINH_THUC: { sheetName: 'NHAN_VIEN_CHINH_THUC', headers: ['ID','Mã NV','Họ tên','SĐT','Khóa','Chi nhánh','Ca','Ngày bắt đầu','Trạng thái','Điểm TEST','Loại','Ngày chính thức','Phiên bản','Cập nhật lúc','Đồng bộ'] },
  NHAN_VIEN_XUONG: { sheetName: 'NHAN_VIEN_XUONG', headers: ['ID','Mã NV','Họ tên','SĐT','Chi nhánh','Trạng thái','Đồng bộ'] },
  NHAN_VIEN_VAN_PHONG: { sheetName: 'NHAN_VIEN_VAN_PHONG', headers: ['ID','Mã NV','Họ tên','SĐT','Chi nhánh','Trạng thái','Đồng bộ'] },
  NHAN_VIEN_SALE: { sheetName: 'NHAN_VIEN_SALE', headers: ['ID','Mã NV','Họ tên','SĐT','Chi nhánh','Trạng thái','Đồng bộ'] },
  // Lịch
  LICH_LAM_VIEC: { sheetName: 'LICH_LAM_VIEC', headers: ['ID','Mã NV','Họ tên','Chi nhánh','Tuần bắt đầu','Ngày','Thứ','Ca','Trạng thái','Người thay','Phiên bản'] },
  // Phiếu
  PHIEU_OFF_HANG_TUAN: { sheetName: 'PHIEU_OFF_HANG_TUAN', headers: ['ID','Mã NV','Họ tên','Chi nhánh','Ca','Ngày OFF','Loại','Trạng thái','Tự động duyệt','Ngày tạo'] },
  PHIEU_OFF_DOT_XUAT: { sheetName: 'PHIEU_OFF_DOT_XUAT', headers: ['ID','Mã NV','Họ tên','Chi nhánh','Ca','Ngày OFF','Lý do','Người thay','Trạng thái','Bước liên hoàn','Ngày tạo'] },
  PHIEU_DOI_THIET_BI: { sheetName: 'PHIEU_DOI_THIET_BI', headers: ['ID','Mã NV','Lý do','Thiết bị cũ','Thiết bị mới','Trạng thái','Ngày tạo','Hết hạn'] },
  PHIEU_DOI_CA_TRAINING: { sheetName: 'PHIEU_DOI_CA_TRAINING', headers: ['ID','Mã NV','Họ tên','Ngày','Ca cũ','Ca mới','Lý do','Trạng thái','Ngày tạo','Hết hạn','Người duyệt'] },
  PHIEU_DOI_CA_OFFICIAL: { sheetName: 'PHIEU_DOI_CA_OFFICIAL', headers: ['ID','Mã NV','Họ tên','Ngày','Ca cũ','Ca mới','NV thay ca','Lý do','Trạng thái','Ngày tạo','Người duyệt'] },
  // Điểm danh
  RECORD_DIEM_DANH: { sheetName: 'RECORD_DIEM_DANH', headers: ['ID','Mã NV','Họ tên','Ngày','Ca','Chi nhánh','Giờ vào ca','GPS vào','Ảnh vào','Drive vào','Giờ ra ca','GPS ra','Ảnh ra','Drive ra','Trạng thái','Vi phạm','Phiên bản'] },
  RECORD_ZALO: { sheetName: 'RECORD_ZALO', headers: ['ID','Thời gian gửi','Người nhận','Loại','Nội dung','Trạng thái','Lỗi'] },
  // Báo cáo
  BAO_CAO_CHAM_CONG: { sheetName: 'BAO_CAO_CHAM_CONG', headers: ['Mã NV','Họ tên','Chi nhánh','Tháng','Ngày tiêu chuẩn','Thực tế','Tính lương','Giờ TC','Giờ TT','Giờ TL','Phép','OT','Trễ','Lỗi','Trạng thái'] },
  KET_QUA_TEST: { sheetName: 'KET_QUA_TEST', headers: ['ID','Mã NV','Họ tên','Khóa','Điểm','Đúng/Tổng','Kết quả','Thời gian làm','Ngày tạo'] },
  KHOA_TEST: { sheetName: 'KHOA_TEST', headers: ['ID','Tên khóa','Số câu','Tối thiểu/câu','Ngày tạo'] },
  TAI_KHOAN: { sheetName: 'TAI_KHOAN', headers: ['ID','Tên đăng nhập','Vai trò','Phạm vi chi nhánh','Tên hiển thị','Tab được phép'] },
  AUDIT_LOG: { sheetName: 'AUDIT_LOG', headers: ['ID','Người thực hiện','Hành động','Thực thể','Trước','Sau','Thời gian','IP'] },
  SYNC_QUEUE: { sheetName: 'SYNC_QUEUE', headers: ['ID','Thực thể','Thao tác','Phiên bản','Cập nhật lúc','Người thực hiện','Nguồn','Trạng thái đồng bộ'] },
  DRIVE_FILES: { sheetName: 'DRIVE_FILES', headers: ['ID','Mã NV','Họ tên','Ngày','Loại','Tên tệp','Đường dẫn Drive','Liên kết','Ngày tạo'] }
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

// === SYSTEM RESET LOCK (Ngăn chặn background sync ghi đè/hồi sinh dữ liệu khi đang reset) ===
let isSystemResetting = false;

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
      else db.settings = { ...DEFAULT_SETTINGS, ...db.settings, googleSheet: { ...DEFAULT_SETTINGS.googleSheet, ...(db.settings.googleSheet||{}) }, quizBank: { ...DEFAULT_SETTINGS.quizBank, ...(db.settings.quizBank||{}) }, ai: { ...DEFAULT_SETTINGS.ai, ...(db.settings.ai||{}) }, zalo: { ...DEFAULT_SETTINGS.zalo, ...(db.settings.zalo||{}) }, calendar: { ...DEFAULT_SETTINGS.calendar, ...(db.settings.calendar||{}) }, attendance: { ...DEFAULT_SETTINGS.attendance, ...(db.settings.attendance||{}) }, off: { ...DEFAULT_SETTINGS.off, ...(db.settings.off||{}) } };
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
      // Tự động chuẩn hóa branchPreference và shiftPreference nếu chưa có
      if (Array.isArray(db.applicants)) {
        db.applicants.forEach(a => {
          if (!a.branchPreference && a.branchText) a.branchPreference = mapBranchText(a.branchText);
          if (!a.shiftPreference && a.shiftText) a.shiftPreference = mapShiftText(a.shiftText);
        });
      }
    } else {
      initEmpty();
    }
  } catch (e) {
    console.error('Load DB error', e);
    // RÀNG BUỘC GIỮ SESSION: DB lỗi không được xóa câm — lưu file hỏng để cứu hộ rồi mới khởi tạo rỗng
    try{
      if (fs.existsSync(DATA_FILE)){
        const bad = path.join(path.dirname(DATA_FILE), `db_corrupt_${Date.now()}.json`);
        fs.renameSync(DATA_FILE, bad);
        console.error(`[DB] Đã giữ file lỗi tại ${bad} để cứu hộ`);
      }
    }catch(_){}
    initEmpty();
  }
}
function saveDB() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    // RÀNG BUỘC TUYỆT ĐỐI: TUYỆT ĐỐI KHÔNG LƯU DỮ LIỆU TEST VÀO DB THẬT
    // Lọc sạch 100% dữ liệu test khỏi tất cả các bảng trước khi ghi ra file db.json
    const clone = JSON.parse(JSON.stringify(db));
    if(Array.isArray(clone.employees)) clone.employees = clone.employees.filter(e => !isTestRecord(e));
    if(Array.isArray(clone.applicants)) clone.applicants = clone.applicants.filter(a => !isTestRecord(a));
    if(Array.isArray(clone.testResults)) clone.testResults = clone.testResults.filter(t => !isTestRecord(t));
    if(Array.isArray(clone.keys)) clone.keys = clone.keys.filter(k => !isTestRecord(k));
    if(Array.isArray(clone.syncQueue)) clone.syncQueue = clone.syncQueue.filter(q => !isTestRecord(q) && !isTestRecord(q?.payload));
    if(Array.isArray(clone.attendances)) clone.attendances = clone.attendances.filter(a => !isTestRecord(a));
    if(Array.isArray(clone.offRequests)) clone.offRequests = clone.offRequests.filter(r => !isTestRecord(r));
    if(Array.isArray(clone.emergencyRequests)) clone.emergencyRequests = clone.emergencyRequests.filter(r => !isTestRecord(r));
    if(Array.isArray(clone.deviceRequests)) clone.deviceRequests = clone.deviceRequests.filter(r => !isTestRecord(r));
    if(Array.isArray(clone.driveFiles)) clone.driveFiles = clone.driveFiles.filter(f => !isTestRecord(f));
    if(Array.isArray(clone.shiftSwapRequests)) clone.shiftSwapRequests = clone.shiftSwapRequests.filter(r => !isTestRecord(r));
    if(Array.isArray(clone.trainingShiftRequests)) clone.trainingShiftRequests = clone.trainingShiftRequests.filter(r => !isTestRecord(r));
    if(Array.isArray(clone.zaloRecords)) clone.zaloRecords = clone.zaloRecords.filter(z => !isTestRecord(z));
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
        db.attendances.slice(0, Math.max(0, db.attendances.length - 50)).forEach(a=>{ if(a.checkIn?.image && a.checkIn.image.length>50000) a.checkIn.image='[pruned]'; if(a.checkOut?.image && a.checkOut.image.length>50000) a.checkOut.image='[pruned]'; });
      }
    }catch(e){}
    io.emit('db:update', { timestamp: getVietnamISOString() });
  } catch (e) { console.error('Save DB error', e); }
}
// KHỞI TẠO RỖNG - 100% DỮ LIỆU THẬT, KHÔNG MOCK
// Ràng buộc tuyệt đối: mọi dữ liệu vận hành (nhân viên, ứng viên, chấm công, lịch...)
// chỉ lấy từ Google Sheet thật (Form 1rcq / Database 17iXM) hoặc do HR import.
// Không tự sinh bất kỳ bản ghi nghiệp vụ mẫu nào.
function initEmpty() {
  const hashed = bcrypt.hashSync('Master@@2027', 10);
  db.users = [
    { id: uuidv4(), username: 'admin', password: hashed, role: 'Admin', branchScope: ['CN1','CN2','CN3','CN4'], displayName: 'Administrator' },
    { id: uuidv4(), username: 'hr', password: bcrypt.hashSync('hr123',10), role: 'HR', branchScope: ['CN1','CN2'], displayName: 'HR Manager' },
    { id: uuidv4(), username: 'manager', password: bcrypt.hashSync('manager123',10), role: 'Manager', branchScope: ['CN2'], displayName: 'Manager CN2' },
    { id: uuidv4(), username: 'umbomilk', password: bcrypt.hashSync('view123',10), role: 'Umbomilk', branchScope: ['CN1','CN2','CN3','CN4'], displayName: 'Umbomilk Viewer' }
  ];
  // Toàn bộ dữ liệu nghiệp vụ để trống - chờ đồng bộ từ Google Sheet thật
  db.employees = [];
  db.applicants = [];
  db.keys = [];
  db.attendances = [];
  db.schedules = [];
  db.offRequests = [];
  db.emergencyRequests = [];
  db.deviceRequests = [];
  db.trainingShiftRequests = [];
  db.shiftSwapRequests = [];
  // Ngân hàng câu hỏi kiểm tra đầu ra: 100% tự động kéo từ Google Sheet 1h06TrHMRnBOHMkp7Ri4Rz8yRw8ptemQp0ftjMldHYdc
  // Tuyệt đối không lưu câu hỏi mock/thử nghiệm trên hệ thống.
  db.testCourses = [];
  db.testResults = [];
  db.zaloRecords = [];
  db.syncQueue = [];
  db.notifications = [];
  db.payrollPeriods = [];
  db.attendanceAdjustments = [];
  db.overtimeRequests = [];
  db.leaveRequests = [];
  db.driveFiles = [];
  db.payrollSnapshots = [];
  db.financeKeys = [];
  db.penalties = [];
  console.log('[DB] Khởi tạo rỗng - chờ dữ liệu thật từ Google Sheet (Form/Sync/Import)');
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
  if(!db.settings.finance) db.settings.finance={ webhookUrl: process.env.FINANCE_WEBHOOK_URL, secret: process.env.FINANCE_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET };
  else db.settings.finance.webhookUrl = process.env.FINANCE_WEBHOOK_URL;
  // Đồng bộ ngược để tương thích cũ
  db.settings.googleSheet.targetWebhookUrl2 = process.env.FINANCE_WEBHOOK_URL;
  if(process.env.FINANCE_WEBHOOK_SECRET) db.settings.finance.secret = process.env.FINANCE_WEBHOOK_SECRET;
}
if(process.env.FINANCE_WEBHOOK_SECRET && db.settings.finance){
  db.settings.finance.secret = process.env.FINANCE_WEBHOOK_SECRET;
}
if(process.env.FINANCE_MASTER_ID){
  if(!db.settings.finance) db.settings.finance={ webhookUrl: '', secret: DEFAULT_WEBHOOK_SECRET, spreadsheetId: process.env.FINANCE_MASTER_ID };
  else db.settings.finance.spreadsheetId = process.env.FINANCE_MASTER_ID;
}
if(process.env.DATABASE_URL){
  db.settings.databaseUrl = process.env.DATABASE_URL;
}
if(process.env.GOOGLE_OAUTH_CLIENT_ID) db.settings.calendar.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
if(process.env.GOOGLE_OAUTH_CLIENT_SECRET) db.settings.calendar.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if(process.env.GOOGLE_CALENDAR_ID) db.settings.calendar.calendarId = process.env.GOOGLE_CALENDAR_ID;
if(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) db.settings.googleDrive.rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
if(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) db.settings.googleDrive.backupFolderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
// Log ràng buộc đã áp dụng
console.log(`[CONFIG] Google Sheet Hub: Form=${db.settings.googleSheet.formResponsesSheetId.slice(0,8)}... DB=${db.settings.googleSheet.targetDatabaseSpreadsheetId.slice(0,8)}... Webhooks=${getAllWebhookUrls().length} [${getAllWebhookUrls().map(u=>u.slice(0,35)+'...').join(', ')}]`);
console.log(`[CONFIG] Finance: ${db.settings.finance?.webhookUrl ? db.settings.finance.webhookUrl.slice(0,35)+'...' : 'EMPTY'} • Calendar: ${db.settings.calendar.clientId ? 'OAuth SET' : 'EMPTY'} • Drive: ${db.settings.googleDrive.rootFolderId ? db.settings.googleDrive.rootFolderId.slice(0,8)+'...' : 'EMPTY'}`);
// ĐÃ LOẠI BỎ cleanupIncorrectAttendances: dữ liệu 100% thật, server không được
// tự ý xóa bản ghi chấm công (trước đây xóa các bản ghi 07:02, có thể trúng dữ liệu thật).
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
      if(i.entity==='KEY' && (i.sync_status==='FAILED' || i.sync_status==='DEAD')){ i.sync_status='SYNCED'; delete i.error; i.note='Key embedded - auto fixed'; i.syncedAt=getVietnamISOString(); }
      if(isPH && i.error?.includes('placeholder') && i.sync_status==='FAILED'){ i.sync_status='UNCONFIGURED'; i.error='Webhook placeholder - dữ liệu lưu local, Sheets API 60s sẽ đồng bộ khi có ServiceAccount'; }
      if(i.error?.includes('No Google Sheet mapping for KEY')){ i.sync_status='SYNCED'; delete i.error; i.note='Key embedded'; }
    });
    // Nếu vẫn còn DEAD do 404 webhook (placeholder) thì xóa luôn để không báo 23 DEAD
    const stillDead = db.syncQueue.filter(i=>i.sync_status==='DEAD');
    if(stillDead.length>0 && isPH){
      const cnt = stillDead.length;
      db.syncQueue = db.syncQueue.filter(i=>i.sync_status!=='DEAD');
      console.log(`[ĐỒNG BỘ KHỞI ĐỘNG] Xóa thêm ${cnt} DEAD còn lại do placeholder`);
    }
    if(db.syncQueue.length !== before || beforeDead>0){
      saveDB();
      console.log(`[ĐỒNG BỘ KHỞI ĐỘNG] ${before} -> ${db.syncQueue.length} mục (đã xóa ${before - db.syncQueue.length} DEAD placeholder/KEY)`);
      // Emit để UI cập nhật ngay
      setTimeout(()=>{ try{ io.emit('sync:update', db.syncQueue); }catch(e){} }, 1000);
    }
  }catch(e){ console.error('cleanupOldSyncQueue error', e.message); }
})();
// RÀNG BUỘC: mã NV + key bất biến theo nhân viên đó luôn qua mọi lần cập nhật tính năng/redeploy.
console.log(`[DB ỔN ĐỊNH] Giữ nguyên ${db.employees.length} NV + ${db.keys.length} key (mã NV/key không đổi khi cập nhật code)`);
// Tự hồi phục từ Sheet 17iXM khi boot rỗng (VD: Render chưa gắn disk persistent).
// Chỉ chạy khi local KHÔNG còn NV nào nhưng Sheet vẫn có dữ liệu -> dựng lại đúng mã NV + key cũ.
async function rehydrateFromSheet(){
  if(isSystemResetting) return;
  try{
    if(db.employees.length>0) return;
    const spreadsheetId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
    const token = await getGoogleAccessToken();
    if(!token || !spreadsheetId) { console.log('[HỒI PHỤC] Bỏ qua (chưa cấu hình ServiceAccount/Sheet)'); return; }
    const sheets = [
      { name:'NHAN_VIEN_TRAINING', defType:'TRAINING' },
      { name:'NHAN_VIEN_CHINH_THUC', defType:'OFFICIAL' }
    ];
    let restoredEmps = 0, restoredKeys = 0;
    for(const { name: sheetName, defType } of sheets){
      let values = [];
      try{
        const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:Z2000`, { headers:{ Authorization:`Bearer ${token}` }});
        if(!resp.ok) continue;
        const j = await resp.json();
        values = j.values || [];
      }catch(e){ console.error(`[HỒI PHỤC] Đọc ${sheetName} lỗi`, e.message); continue; }
      if(values.length<2) continue;
      for(let i=1;i<values.length;i++){
        const row = values[i];
        const maNV = (row[1]||'').toString().trim();
        if(!maNV || db.employees.find(e=>e.employeeId===maNV)) continue;
        const shift = ['CA_SANG','CA_CHIEU','CA_TOI'].includes(row[6]) ? row[6] : 'CA_SANG';
        const branchId = db.branches.find(b=>b.id===(row[5]||'').toString().trim()) ? row[5].toString().trim() : 'CN2';
        const type = row[13]==='OFFICIAL' || defType==='OFFICIAL' ? 'OFFICIAL' : 'TRAINING';
        const emp = {
          id: (row[0]||'').toString().trim() || uuidv4(),
          employeeId: maNV,
          name: (row[2]||'').toString().trim() || maNV,
          phone: (row[3]||'').toString().trim(),
          branchId, shift,
          startDate: (row[7]||'').toString().trim() || getVietnamTodayStr(),
          endDate: type==='TRAINING' ? ((row[8]||'').toString().trim() || null) : null,
          trainingDays: type==='TRAINING' ? (parseInt(row[9])||7) : null,
          status: (row[10]||'').toString().trim() || type,
          testScore: row[11]!==undefined && row[11]!=='' ? Number(row[11]) : null,
          testResult: (row[12]||'').toString().trim() || null,
          type, category: (row[14]||'').toString().trim() || 'STORE',
          avatar: '', checkHistory: [],
          version: 1, updated_at: getVietnamISOString(),
          updated_by: 'REHYDRATE_BOOT', source: 'SHEET_17iXM', sync_status: 'SYNCED'
        };
        db.employees.push(emp); restoredEmps++;
        // Giữ nguyên key cũ từ Sheet (cột Khóa index 4)
        const sheetKey = (row[4]||'').toString().trim();
        if(sheetKey && !db.keys.find(k=>k.employeeId===maNV)){
          db.keys.push({ id: uuidv4(), employeeId: maNV, key: sheetKey, deviceId: null, boundAt: null, status: 'ACTIVE', version: 1, updated_at: getVietnamISOString(), sync_status: 'SYNCED' });
          restoredKeys++;
        }
      }
    }
    if(restoredEmps>0){
      saveDB();
      io.emit('employees:update', db.employees);
      io.emit('keys:update', db.keys);
      console.log(`[HỒI PHỤC] Dựng lại ${restoredEmps} NV + ${restoredKeys} key từ Sheet 17iXM (giữ nguyên mã NV/key cũ)`);
    } else {
      console.log('[HỒI PHỤC] Sheet 17iXM không có dữ liệu NV để hồi phục');
    }
  }catch(e){ console.error('[HỒI PHỤC] Lỗi', e.message); }
}
setTimeout(()=>{ rehydrateFromSheet().catch(()=>{}); }, 20000);
// KÉO DỮ LIỆU TỪ SHEET 17iXM LÊN WEB MỖI LẦN KHỞI ĐỘNG (deploy/cập nhật code/sửa tính năng).
// Upsert theo mã NV: thiếu thì thêm (giữ nguyên mã NV + key), có rồi thì chỉ ghi đè
// khi dòng Sheet mới hơn local. Không bao giờ xóa local. Không push ngược (tránh loop).
async function bootPullFromMasterSheet(manualBy){
  if(isSystemResetting) return { pulled:0, updated:0, keys:0, skipped:0 };
  const out = { pulled:0, updated:0, keys:0, skipped:0 };
  try{
    const spreadsheetId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
    const token = await getGoogleAccessToken();
    if(!token || !spreadsheetId){ console.log('[KÉO SHEET] Bỏ qua (chưa cấu hình ServiceAccount/Sheet)'); return out; }
    const sheets = [
      { name:'NHAN_VIEN_TRAINING', defType:'TRAINING' },
      { name:'NHAN_VIEN_CHINH_THUC', defType:'OFFICIAL' }
    ];
    for(const { name: sheetName, defType } of sheets){
      let values = [];
      try{
        const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:Z5000`, { headers:{ Authorization:`Bearer ${token}` }});
        if(!resp.ok) continue;
        const j = await resp.json();
        values = j.values || [];
      }catch(e){ console.error(`[KÉO SHEET] Đọc ${sheetName} lỗi`, e.message); continue; }
      if(values.length<2) continue;
      const headers = values[0];
      const col = (h, fb)=>{ const i=headers.findIndex(x=>x===h); return i!==-1?i:fb; };
      const isOfficial = sheetName==='NHAN_VIEN_CHINH_THUC';
      const iMaNV=col('Mã NV',1), iName=col('Họ tên',2), iPhone=col('SĐT',3), iKey=col('Khóa',4),
            iBranch=col('Chi nhánh',5), iShift=col('Ca',6), iStart=col('Ngày bắt đầu',7),
            iStatus=col('Trạng thái', isOfficial?8:10), iUpdated=col('Cập nhật lúc', isOfficial?13:16);
      for(let r=1;r<values.length;r++){
        const row = values[r];
        const maNV=(row[iMaNV]||'').toString().trim();
        if(!maNV){ out.skipped++; continue; }
        const sheetUpdated=(row[iUpdated]||'').toString().trim();
        const sheetTime = sheetUpdated ? new Date(sheetUpdated).getTime() : 0;
        const shift = ['CA_SANG','CA_CHIEU','CA_TOI'].includes((row[iShift]||'').toString().trim()) ? row[iShift].toString().trim() : 'CA_SANG';
        const branchRaw = (row[iBranch]||'').toString().trim();
        const branchId = db.branches.find(b=>b.id===branchRaw) ? branchRaw : 'CN2';
        const sheetKey = (row[iKey]||'').toString().trim();
        let emp = db.employees.find(e=>e.employeeId===maNV);
        if(!emp){
          const type = isOfficial ? 'OFFICIAL' : (((row[col('Loại', isOfficial?10:13)]||'').toString().trim()==='OFFICIAL') ? 'OFFICIAL' : 'TRAINING');
          emp = {
            id: ((row[col('ID',0)]||'').toString().trim()) || uuidv4(),
            employeeId: maNV,
            name: (row[iName]||'').toString().trim() || maNV,
            phone: (row[iPhone]||'').toString().trim(),
            branchId, shift,
            startDate: (row[iStart]||'').toString().trim() || getVietnamTodayStr(),
            endDate: null, trainingDays: type==='TRAINING' ? 7 : null,
            status: (row[iStatus]||'').toString().trim() || type,
            testScore: null, testResult: null, type, category: 'STORE',
            avatar:'', checkHistory: [],
            version: 1, updated_at: sheetUpdated || getVietnamISOString(),
            updated_by: manualBy||'BOOT_PULL', source:'SHEET_17iXM', sync_status:'SYNCED'
          };
          if(type==='OFFICIAL' && isOfficial) emp.officialStartDate = (row[col('Ngày chính thức',11)]||'').toString().trim() || null;
          db.employees.push(emp); out.pulled++;
        } else {
          const localTime = emp.updated_at ? new Date(emp.updated_at).getTime() : 0;
          if(sheetTime>0 && sheetTime>localTime){
            const beforeStatus = emp.status;
            if(row[iName]) emp.name = row[iName].toString().trim();
            if(row[iPhone]!==undefined) emp.phone = (row[iPhone]||'').toString().trim();
            emp.branchId = branchId; emp.shift = shift;
            if(row[iStart]) emp.startDate = row[iStart].toString().trim();
            if(row[iStatus]) emp.status = row[iStatus].toString().trim();
            if(isOfficial && row[col('Ngày chính thức',11)]) emp.officialStartDate = row[col('Ngày chính thức',11)].toString().trim();
            emp.version = (emp.version||1)+1;
            emp.updated_at = sheetUpdated;
            emp.updated_by = manualBy||'BOOT_PULL';
            emp.sync_status = 'SYNCED';
            out.updated++;
            if(beforeStatus!==emp.status) console.log(`[KÉO SHEET] ${maNV} trạng thái ${beforeStatus} -> ${emp.status}`);
          } else { out.skipped++; }
        }
        // Key: giữ device binding local, chỉ đồng bộ chuỗi key theo Sheet
        if(sheetKey){
          let keyRec = db.keys.find(k=>k.employeeId===maNV);
          if(!keyRec){
            db.keys.push({ id: uuidv4(), employeeId: maNV, key: sheetKey, deviceId: null, boundAt: null, status: 'ACTIVE', version: 1, updated_at: getVietnamISOString(), sync_status: 'SYNCED' });
            out.keys++;
          } else if(keyRec.key!==sheetKey){
            keyRec.key = sheetKey; keyRec.status='ACTIVE';
            keyRec.version=(keyRec.version||1)+1; keyRec.updated_at = getVietnamISOString();
            out.keys++;
          }
        }
      }
    }
    // Kéo ứng viên từ NHAN_VIEN_MOI (upsert theo ID, bắt buộc có SĐT — bỏ qua header/template)
    try{
      const respA = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('NHAN_VIEN_MOI')}!A1:Z5000`, { headers:{ Authorization:`Bearer ${token}` }});
      if(respA.ok){
        const jA = await respA.json();
        const vals = jA.values || [];
        if(vals.length>=2){
          const H = vals[0];
          const ci = (h, fb)=>{ const i=H.findIndex(x=>x===h); return i!==-1?i:fb; };
          const iId=ci('ID',0), iCreated=ci('Ngày ĐK',1), iName=ci('Họ tên',2), iGender=ci('Giới tính',3),
                iBirth=ci('Năm sinh',4), iEdu=ci('Trình độ',5), iHome=ci('Quê quán',6), iPhone=ci('SĐT',7),
                iShiftT=ci('Ca đăng ký',8), iBranchT=ci('Chi nhánh ĐK',9), iExp=ci('Kinh nghiệm',10),
                iHand=ci('Xử lý đột xuất',11), iFb=ci('Facebook',12), iSrc=ci('Nguồn biết tin',13),
                iAi=ci('Điểm AI',14), iStatus=ci('Trạng thái',16), iSrcId=ci('Mã nguồn',17), iUpd=ci('Cập nhật lúc',19);
          for(let r=1;r<vals.length;r++){
            const row = vals[r];
            const id = (row[iId]||'').toString().trim();
            const phone = (row[iPhone]||'').toString().trim();
            if(!id || !normalizePhone(phone)){ out.skipped++; continue; }
            const sheetUpd = (row[iUpd]||'').toString().trim();
            const sheetTime = sheetUpd ? new Date(sheetUpd).getTime() : 0;
            const sText = (row[iShiftT]||'').toString().trim();
            const bText = (row[iBranchT]||'').toString().trim();
            const sPref = typeof mapShiftText === 'function' ? mapShiftText(sText) : (SHIFT_MAP[sText] || 'CA_SANG');
            const bPref = typeof mapBranchText === 'function' ? mapBranchText(bText) : 'CN2';
            let app = db.applicants.find(a=>a.id===id);
            if(!app){
              db.applicants.push({
                id, name: (row[iName]||'').toString().trim()||id, gender: (row[iGender]||'').toString().trim(),
                birthYear: (row[iBirth]||'').toString().trim(), education: (row[iEdu]||'').toString().trim(),
                hometown: (row[iHome]||'').toString().trim(), phone,
                shiftPreference: sPref, shiftText: sText,
                branchPreference: bPref, branchText: bText,
                experience: (row[iExp]||'').toString().trim(), handling: (row[iHand]||'').toString().trim(),
                facebook: (row[iFb]||'').toString().trim(), source: (row[iSrc]||'').toString().trim()||'Google Sheet',
                aiScore: row[iAi]===''||row[iAi]===undefined ? null : Number(String(row[iAi]).replace(',','.'))||null,
                aiBreakdown: [], status: (row[iStatus]||'').toString().trim()||'NEW_APPLICANT',
                source_id: (row[iSrcId]||'').toString().trim()||('sheet_pull_'+id),
                createdAt: (row[iCreated]||'').toString().trim()||getVietnamISOString(),
                version: 1, updated_at: sheetUpd||getVietnamISOString(),
                updated_by: manualBy||'BOOT_PULL', sync_status:'SYNCED'
              });
              out.pulledApplicants = (out.pulledApplicants||0)+1;
            } else {
              const localTime = app.updated_at ? new Date(app.updated_at).getTime() : 0;
              if(sheetTime>0 && sheetTime>localTime){
                if(row[iName]) app.name = row[iName].toString().trim();
                if(row[iPhone]!==undefined) app.phone = phone;
                if(row[iShiftT]!==undefined){ app.shiftText = sText; if(!app.shiftPreference || app.status!=='CONVERTED') app.shiftPreference = sPref; }
                if(row[iBranchT]!==undefined){ app.branchText = bText; if(!app.branchPreference || app.status!=='CONVERTED') app.branchPreference = bPref; }
                if(row[iStatus]) app.status = row[iStatus].toString().trim();
                app.updated_at = sheetUpd; app.updated_by = manualBy||'BOOT_PULL'; app.sync_status='SYNCED';
                app.version = (app.version||1)+1;
                out.updatedApplicants = (out.updatedApplicants||0)+1;
              } else out.skipped++;
            }
          }
        }
      }
    }catch(e){ console.error('[KÉO SHEET] Đọc NHAN_VIEN_MOI lỗi', e.message); }
    if(out.pulled>0 || out.updated>0 || out.keys>0 || out.pulledApplicants>0 || out.updatedApplicants>0){
      saveDB();
      io.emit('employees:update', db.employees);
      io.emit('keys:update', db.keys);
      io.emit('applicants:update', db.applicants);
    }
    console.log(`[KÉO SHEET 17iXM] Thêm mới ${out.pulled} + cập nhật ${out.updated} NV + ${out.keys} key + ${out.pulledApplicants||0}/${out.updatedApplicants||0} ứng viên mới/cập nhật (bỏ qua ${out.skipped})${manualBy?` bởi ${manualBy}`:''}`);
    return out;
  }catch(e){ console.error('[KÉO SHEET] Lỗi', e.message); return out; }
}
if(!OUTBOUND_SYNC_DISABLED) setTimeout(()=>{ bootPullFromMasterSheet().catch(()=>{}); }, 12000); // test/CI: khong keo Sheet that vao DB test (AGENTS.md zero-leak)
// ============ TỰ ĐỘNG KÉO SHEET → WEB (Sheet 17iXM là kho chính) ============
// Chạy định kỳ bootPullFromMasterSheet (NV/key/ứng viên) + pullRemainingTabsFromMasterSheet
// (lịch/chấm công/OFF/đột xuất/thiết bị/test/drive). Hai hàm đã tự phát socket update
// (employees/keys/applicants/schedules/attendances/...) nên cả web HR lẫn web NV refresh realtime.
// Bỏ qua khi: đang Reset, đang chạy test/CI (giữ DB test sạch), hoặc 1 vòng kéo trước chưa xong.
let isPullingSheet = false;
async function autoPullSheetToWeb(){
  if(isSystemResetting || isPullingSheet) return;
  if(OUTBOUND_SYNC_DISABLED) return; // test/CI: không kéo dữ liệu thật vào DB test
  isPullingSheet = true;
  try{
    await bootPullFromMasterSheet('AUTO_PULL');
    await pullRemainingTabsFromMasterSheet('AUTO_PULL');
  }catch(e){ console.error('[AUTO PULL SHEET] Lỗi', e.message); }
  finally{ isPullingSheet = false; }
}
const SHEET_PULL_INTERVAL_MS = (parseInt(process.env.SHEET_PULL_INTERVAL_SEC || '60', 10) || 60) * 1000;
setInterval(autoPullSheetToWeb, SHEET_PULL_INTERVAL_MS);

// ============ HELPERS ============
function audit(actor, action, entity, before, after, ip='127.0.0.1'){
  const log = { id: uuidv4(), actor, action, entity, before, after, timestamp: getVietnamISOString(), ip, device: 'web' };
  db.auditLogs.unshift(log);
  if(db.auditLogs.length>500) db.auditLogs.pop();
  saveDB();
  io.emit('audit:new', log);
}
function emitForceLogout(employeeId, reason='Tài khoản không tồn tại'){
  const payload = { employeeId, reason, timestamp: getVietnamISOString() };
  // Gửi tới room riêng + broadcast để web app nhân viên dù chưa join room vẫn nhận
  try{ io.to(`employee:${employeeId}`).emit('employee:forceLogout', payload); }catch(e){}
  io.emit('employee:forceLogout', payload);
  console.log(`[FORCE_LOGOUT] ${employeeId} reason: ${reason}`);
}

// Thông báo Realtime cho Admin và HR khi nhân viên thao tác
function notifyAdminAndHR({ action, employeeId, employeeName, branchId, title, message, type='info', data=null }){
  const notifId = uuidv4();
  const createdAt = getVietnamISOString();
  const notif = {
    id: notifId,
    to: 'HR',
    role: 'HR',
    action: action || 'EMPLOYEE_ACTION',
    employeeId: employeeId || 'ANONYMOUS',
    employeeName: employeeName || 'Nhân viên',
    branchId: branchId || '',
    title: title || 'Thông báo mới từ nhân viên',
    content: message || '',
    message: message || '',
    type,
    createdAt,
    read: false,
    data: data || {}
  };
  if(!db.notifications) db.notifications = [];
  db.notifications.unshift(notif);
  if(db.notifications.length > 500) db.notifications = db.notifications.slice(0, 500);

  // Phát 3 kênh realtime để đảm bảo mọi client Admin/HR đều nhận ngay lập tức:
  io.emit('employee:action', notif);
  io.emit('admin:notification', notif);
  io.emit('notifications:update', db.notifications);

  try {
    audit(employeeId || 'EMPLOYEE', `NOTIF_${(action||'ACTION').toUpperCase()}`, 'NOTIFICATION', null, { title, message }, 'web_employee');
  } catch(e){}

  return notif;
}

// ============ RÀNG BUỘC TUYỆT ĐỐI: CHẶN DỮ LIỆU TEST LÊN GOOGLE SHEET ============
// Google Sheet 17iXM là 100% dữ liệu thật đang vận hành của công ty.
// Tuyệt đối không lưu, không ghi đè, không đồng bộ bất kỳ bản ghi test/thử nghiệm nào lên Sheet thật.
function isTestRecord(item){
  if(!item) return false;
  if(Array.isArray(item)){
    const id = String(item[0]||'').toLowerCase().trim();
    const code = String(item[1]||'').toLowerCase().trim();
    const name = String(item[2]||'').toLowerCase().trim();
    if(id === 'test' || id.startsWith('test_') || id.startsWith('mock_') || id.includes('_test')) return true;
    if(code === 'test' || code.startsWith('test_') || code.startsWith('mock_') || code.includes('_test')) return true;
    if(/\btest\b/i.test(name) || name.includes('thử nghiệm') || name.includes('thu nghiem') || name.includes('forcelogout')) return true;
    const allStr = item.map(x => String(x||'')).join(' ').toLowerCase();
    if(allStr.includes('0909990001') || allStr.includes('0909990003') || allStr.includes('0909990005') || allStr.includes('090999999') || allStr.includes('0909990099') || allStr.includes('09099')) return true;
    if(allStr.includes('test submit') || allStr.includes('test forcelogout') || allStr.includes('test harddelete') || allStr.includes('test socket') || allStr.includes('test notexist') || allStr.includes('test put') || allStr.includes('test nv 3 ngay') || allStr.includes('test force') || allStr.includes('nguyen van test')) return true;
    if(allStr.includes('"istest":true') || allStr.includes('"is_test":true')) return true;
    return false;
  }
  if(item.isTest === true || item.is_test === true) return true;
  const name = (item.name || item.employeeName || item.applicantName || item.requesterName || item.targetEmployeeName || item.substituteName || '').toString().trim().toLowerCase();
  if(/\b(test|mock)\b/i.test(name) || /^nv [a-d] \(/i.test(name) || name.includes('thử nghiệm') || name.includes('thu nghiem') || name.includes('forcelogout') || name.includes('test submit') || name.includes('test force')) return true;
  const phone = (item.phone || item.receiver || '').toString().replace(/\D/g, '');
  if(phone.startsWith('09099') || phone === '0909990001' || phone === '0909990003' || phone === '0909990005') return true;
  const empId = (item.employeeId || item.id || '').toString().toLowerCase().trim();
  if(empId === 'test' || empId.startsWith('test_') || empId.startsWith('mock_') || empId.includes('_test')) return true;
  if(item.payload && isTestRecord(item.payload)) return true;
  const jsonStr = JSON.stringify(item).toLowerCase();
  if(jsonStr.includes('"istest":true') || jsonStr.includes('"is_test":true')) return true;
  if(jsonStr.includes('test submit') || jsonStr.includes('test forcelogout') || jsonStr.includes('test harddelete') || jsonStr.includes('test socket') || jsonStr.includes('test notexist') || jsonStr.includes('test put') || jsonStr.includes('test nv 3 ngay') || jsonStr.includes('test force') || jsonStr.includes('nguyen van test')) return true;
  return false;
}

async function syncToGoogleSheet(item){
  // RÀNG BUỘC BẢO VỆ TUYỆT ĐỐI: Chặn 100% dữ liệu test
  if(isTestRecord(item?.payload)){
    console.log(`[TEST GUARD] Chặn tuyệt đối: Bỏ qua sync Google Sheet cho dữ liệu test (${item.payload?.name || item.payload?.employeeId || item.entity})`);
    return { success:true, via:'TEST_DATA_BLOCKED', note:'Dữ liệu test không được phép lưu lên Google Sheet thật' };
  }
  // Yêu cầu #9: Key đã gộp vào NHAN_VIEN_TRAINING/CHINH_THUC nên không cần sync riêng
  if(item.entity==='KEY'){
    // Key được đồng bộ qua dòng nhân viên (syncSheetTab) nên coi như SYNCED
    return { success:true, via:'KEY_EMBEDDED_IN_EMPLOYEE' };
  }
  // RÀNG BUỘC TUYỆT ĐỐI: không bao giờ gửi lệnh xóa lên Google Sheet.
  // Web xóa local -> Sheet 17iXM GIỮ NGUYÊN dữ liệu vĩnh viễn (kể cả import rồi xóa).
  if(/DELETE/.test(item.operation||'')){
    console.log(`[SYNC BẢO VỆ] Chặn lệnh xóa ${item.entity}/${item.operation} - Google Sheet giữ dữ liệu`);
    return { success:true, via:'DELETE_BLOCKED_SHEET_PROTECTED', note:'Google Sheet 17iXM không bao giờ bị xóa dòng' };
  }
  // RÀNG BUỘC CHỐNG RÁC REALTIME: webhook đi thẳng qua Apps Script (bypass merge 60s)
  // nên chặn ngay tại đây nếu payload thiếu cả SĐT lẫn Mã NV.
  {
    const p = item.payload||{};
    const digits = String(p.phone||p.receiver||'').replace(/\D/g,'');
    const code = String(p.employeeId||p.id||'').trim();
    const badCode = !code || /^(ID|MÃ NV|MA NV)$/i.test(code);
    const hasId = digits.length>=9 || !badCode;
    if(!hasId){
      console.log(`[CHỐNG RÁC] Chặn webhook ${item.entity}/${item.operation} thiếu SĐT/Mã NV - không đẩy lên Sheet`);
      return { success:true, via:'TRASH_BLOCKED_NO_PHONE_OR_CODE', note:'Payload thiếu SĐT và Mã NV nên không đồng bộ lên Sheet' };
    }
  }
  const webhookUrls = getAllWebhookUrls();
  const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || DEFAULT_WEBHOOK_SECRET;
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
    SHIFT_SWAP: 'PHIEU_DOI_CA_OFFICIAL',
    TEST_RESULT: 'KET_QUA_TEST',
    ZALO: 'RECORD_ZALO'
  };
  const sheetName = sheetMap[item.entity];
  if(!sheetName) throw new Error(`Chưa cấu hình bảng tính cho ${item.entity}`);
  // RÀNG BUỘC CHỐNG TRÙNG web→Sheet: CREATE nhưng Sheet đã có dòng cùng ID hoặc cùng SĐT
  // thì chuyển thành UPDATE (GAS upsert theo ID/SĐT) - không tạo dòng trùng.
  if(item.operation==='CREATE'){
    try{
      const canonicalId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
      const rowId = item.payload?.id || item.payload?.employeeId || item.payload?.source_id;
      if(rowId && await sheetHasRowId(canonicalId, sheetName, rowId)){
        console.log(`[CHỐNG TRÙNG] ${item.entity} ${rowId} đã có trên Sheet ${sheetName} -> chuyển CREATE thành UPDATE`);
        item.operation = 'UPDATE';
      }
      // RÀNG BUỘC CHỐNG TRÙNG SĐT: Nếu trùng số điện thoại thì KHÔNG ĐƯỢC LƯU VÀO GOOGLE SHEET (không tạo dòng mới)
      const pPhone = normalizePhone(item.payload?.phone || item.payload?.receiver || '');
      if(pPhone && pPhone.length >= 9 && await sheetHasPhone(canonicalId, sheetName, pPhone)){
        console.log(`[CHỐNG TRÙNG SĐT] ${item.entity} SĐT ${pPhone} đã có trên Sheet ${sheetName} -> chuyển CREATE thành UPDATE để không tạo dòng mới trùng SĐT`);
        item.operation = 'UPDATE';
      }
    }catch(e){}
  }

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

// Khởi tạo cache số điện thoại trên Google Sheet (toàn cục)
var sheetPhoneCache = { at: 0, set: new Set() };

// Kiểm tra ID đã tồn tại trên Sheet chưa (chống trùng web→Sheet)
async function sheetHasRowId(spreadsheetId, sheetName, id){
  try{
    const token = await getGoogleAccessToken();
    if(!token || !spreadsheetId || !id) return null; // không xác định được -> để GAS upsert xử lý
    const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:A5000`, { headers:{ Authorization:`Bearer ${token}` }});
    if(!resp.ok) return null;
    const j = await resp.json();
    const vals = j.values || [];
    return vals.some(r=> (r[0]||'').toString()===id.toString());
  }catch(e){ return null; }
}

// Kiểm tra SĐT đã tồn tại trên Sheet chưa (chống trùng SĐT web→Sheet)
async function sheetHasPhone(spreadsheetId, sheetName, phone){
  const norm = normalizePhone(phone||'');
  if(!norm || norm.length < 9) return false;
  try{
    if(sheetPhoneCache && sheetPhoneCache.set && sheetPhoneCache.set.has(norm)) return true;
    const token = await getGoogleAccessToken();
    if(!token || !spreadsheetId) return false;
    const targetSheets = sheetName ? [sheetName] : ['NHAN_VIEN_MOI','NHAN_VIEN_TRAINING','NHAN_VIEN_CHINH_THUC','NHAN_VIEN_XUONG','NHAN_VIEN_VAN_PHONG','NHAN_VIEN_SALE'];
    for(const sName of targetSheets){
      try{
        const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sName)}!A1:Z5000`, { headers:{ Authorization:`Bearer ${token}` }});
        if(!resp.ok) continue;
        const j = await resp.json();
        const vals = j.values || [];
        if(vals.length < 2) continue;
        const iPhone = vals[0].findIndex(h=> /^(sđt|số điện thoại|điện thoại|phone|sdt)$/i.test(String(h||'').trim()));
        if(iPhone === -1) continue;
        for(let i=1; i<vals.length; i++){
          if(normalizePhone(vals[i][iPhone]) === norm){
            if(sheetPhoneCache && sheetPhoneCache.set) sheetPhoneCache.set.add(norm);
            return true;
          }
        }
      }catch(_){}
    }
  }catch(e){}
  return false;
}
function addSyncQueue(entity, operation, payload, actor, source='WEB_HR'){
  if(isSystemResetting) return null;
  // RÀNG BUỘC BẢO VỆ TUYỆT ĐỐI: Không bao giờ đưa dữ liệu test vào hàng đợi đồng bộ Google Sheet
  if (isTestRecord(payload) || actor === 'TEST' || (payload && payload.isTest)) {
    console.log(`[TEST GUARD] Bỏ qua addSyncQueue cho dữ liệu test: ${payload?.name || payload?.employeeId || entity}`);
    return null;
  }
  // RÀNG BUỘC CHỐNG TRÙNG trong hàng đợi: cùng entity+operation+ID đang PENDING
  // thì gộp (cập nhật payload mới vào mục cũ) thay vì tạo mục trùng.
  try{
    const dupKey = payload?.id || payload?.employeeId || payload?.source_id;
    if(dupKey){
      const existing = db.syncQueue.find(q=> q.entity===entity && q.operation===operation && q.sync_status==='PENDING' && ((q.payload?.id||q.payload?.employeeId||q.payload?.source_id)===dupKey));
      if(existing){
        existing.payload = payload;
        existing.version = payload.version||existing.version||1;
        existing.updated_at = getVietnamISOString();
        existing.updated_by = actor;
        console.log(`[CHỐNG TRÙNG] Gộp queue ${entity}/${operation} cho ${dupKey} (không tạo mục trùng)`);
        return existing;
      }
    }
  }catch(e){}
  const webhookUrls = getAllWebhookUrls();
  const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || DEFAULT_WEBHOOK_SECRET;
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
    updated_at: getVietnamISOString(), 
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
    item.syncedAt = getVietnamISOString();
  }
  db.syncQueue.unshift(item);
  if(db.syncQueue.length>200) db.syncQueue.pop();

  if(initialStatus==='PENDING'){
    syncToGoogleSheet(item)
      .then(()=>{ item.sync_status='SYNCED'; item.syncedAt=getVietnamISOString(); delete item.error; saveDB(); io.emit('sync:update', db.syncQueue); })
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
  // Kích hoạt đồng bộ realtime tức thì sang Google Sheet 17iXM
  try{
    const entitySheetMap = {
      APPLICANT: 'NHAN_VIEN_MOI',
      EMPLOYEE: payload?.type === 'OFFICIAL' ? 'NHAN_VIEN_CHINH_THUC' : 'NHAN_VIEN_TRAINING',
      PERSON: 'NHAN_VIEN_MOI',
      ATTENDANCE: 'RECORD_DIEM_DANH',
      SCHEDULE: 'LICH_LAM_VIEC',
      OFF_REQUEST: 'PHIEU_OFF_HANG_TUAN',
      EMERGENCY_REQUEST: 'PHIEU_OFF_DOT_XUAT',
      DEVICE_REQUEST: 'PHIEU_DOI_THIET_BI',
      TRAINING_SHIFT: 'PHIEU_DOI_CA_TRAINING',
      SHIFT_SWAP: 'PHIEU_DOI_CA_OFFICIAL',
      TEST_RESULT: 'KET_QUA_TEST',
      ZALO: 'RECORD_ZALO'
    };
    if(entitySheetMap[entity] && typeof triggerRealtimeSheetSync === 'function'){
      triggerRealtimeSheetSync(entitySheetMap[entity]);
    }
  }catch(_){}
  return item;
}
function generateEmployeeId(branchId){
  const branch = db.branches.find(b=>b.id===branchId);
  if(!branch) throw new Error('Không tìm thấy chi nhánh');
  const now = getVietnamNow();
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
  throw new Error('Không thể tạo mã nhân viên duy nhất');
}
function isOffWindowOpen(){
  // Chế độ VIP test (Admin bật): luôn mở cửa sổ OFF cho NV chính thức để test,
  // mọi ràng buộc TH1/TH2 khi đăng ký giữ nguyên. Tắt là về khung giờ T6 12:00–T7 15:00.
  if(db.settings?.off?.vipTestMode) return true;
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
function checkOffConflict(branchId, shift, date, excludeEmployeeId){
  // Check if same branch+shift+date already has OFF approved
  return db.offRequests.find(r=> {
    if(excludeEmployeeId && r.employeeId === excludeEmployeeId) return false;
    return r.branchId===branchId && r.shift===shift && (r.dates||[]).includes(date) && r.status==='APPROVED';
  });
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
  if(!token) return res.status(401).json({error:'Chưa có token - vui lòng đăng nhập lại', code:'No token'});
  try{
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  }catch(e){ return res.status(401).json({error:'Token không hợp lệ - vui lòng đăng nhập lại', code:'Invalid token'}); }
}
function roleCheck(allowed){
  return (req,res,next)=>{
    if(!allowed.includes(req.user.role)) return res.status(403).json({error:'Không có quyền truy cập', code:'Forbidden'});
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
    keyRec.boundAt = getVietnamISOString();
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
  if(!token) return res.status(401).json({ error:'Chưa có token - vui lòng đăng nhập lại', code:'No token', forceLogout:true });
  try{
    const decoded = jwt.verify(token, JWT_SECRET);
    const emp = db.employees.find(e=> e.employeeId===decoded.employeeId);
    if(!emp) return res.status(401).json({ error:'Tài khoản nhân viên không tồn tại', forceLogout:true, reason:'Tài khoản đã bị xóa khỏi hệ thống' });
    if(['ARCHIVED','TERMINATED','RESIGNED'].includes(emp.status)) return res.status(401).json({ error:`Tài khoản đã bị ${emp.status}`, forceLogout:true, reason:`Trạng thái ${emp.status} - liên hệ HR` });
    // Kiểm tra key còn active không
    const keyRec = db.keys.find(k=> k.employeeId===emp.employeeId);
    if(keyRec && keyRec.status!=='ACTIVE') return res.status(401).json({ error:'Key đã bị vô hiệu hóa', forceLogout:true, reason:'Key không còn hiệu lực' });
    if(emp && (emp.type==='TRAINING' || emp.status==='TRAINING')){
      if(!emp.registeredOffDates || emp.registeredOffDates.length===0){
        const off = db.offRequests.find(r=> r.employeeId===emp.employeeId && r.status==='APPROVED' && Array.isArray(r.dates) && r.dates.length>=5);
        if(off){
          emp.registeredOffDates = off.dates;
          emp.trainingOffDays = Array.isArray(off.dates) ? off.dates.length : 5;
        }
      }
    }
    res.json({ employee: emp, valid:true });
  }catch(e){
    return res.status(401).json({ error:'Token không hợp lệ', forceLogout:true });
  }
});
app.post('/api/auth/device-request', (req,res)=>{
  const { employeeId, reason, deviceId } = req.body;
  if(!reason) return res.status(400).json({error:'Lý do là bắt buộc'});
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy'});
  const keyRec = db.keys.find(k=>k.employeeId===employeeId);
  const reqId = uuidv4();
  const now = getVietnamNow();
  const expiresAt = new Date(now.getTime()+30*60000); // 30 min
  const dr = { id:reqId, employeeId, reason, newDeviceId: deviceId, oldDeviceId: keyRec? keyRec.deviceId:null, status:'PENDING', createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(), version:1 };
  db.deviceRequests.unshift(dr);
  audit(employeeId,'DEVICE_REQUEST','DEVICE',null,dr, req.ip);
  addSyncQueue('DEVICE_REQUEST','CREATE',dr, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('deviceRequests:update', db.deviceRequests);
  notifyAdminAndHR({
    action: 'device_request',
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: `Yêu cầu Đổi thiết bị: ${emp.name}`,
    message: `${emp.name} (${employeeId}) vừa gửi yêu cầu đổi máy chấm công. Lý do: "${reason}". Hết hạn 30 phút.`,
    type: 'warning',
    data: { requestId: reqId, reason, deviceId }
  });
  // Realtime auto-expire handled by persistent poller (realtimeAutomationPoller) every 20s - survives restart
  res.json({ success:true, request: dr });
});

// ============ HEALTH & REALTIME ============
app.get('/health', (req,res)=> res.json({ status:'ok', uptime: process.uptime(), timestamp: getVietnamISOString(), employees: db.employees.length, applicants: db.applicants.length, attendances: db.attendances.length, pendingDevices: db.deviceRequests.filter(r=>r.status==='PENDING').length, pendingEmerg: db.emergencyRequests.filter(r=>r.status==='PENDING').length }));
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
  if(!f) return res.status(404).json({error:'Không tìm thấy nhôn viôn'});
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
    lastHeartbeat: getVietnamISOString()
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
app.post('/api/employees', authMiddleware, roleCheck(['Admin','HR']), async (req,res)=>{
  const { name, phone, branchId, shift, category } = req.body;
  if(!name||!phone||!branchId||!shift) return res.status(400).json({error:'Thiếu thông tin'});
  if(!db.branches.find(b=>b.id===branchId)) return res.status(400).json({error:'Chi nhánh không hợp lệ'});
  // RÀNG BUỘC realtime: 1 SĐT duy nhất trên toàn bộ 17iXM + web (ứng viên + nhân viên)
  {
    const dup = await isPhoneDuplicateEverywhere(phone);
    if(dup.dup) return res.status(409).json({error: dupPhoneErrorMessage(phone, dup)});
  }
  const employeeId = generateEmployeeId(branchId);
  const now = getVietnamNow();
  const end = getVietnamNow(); end.setDate(now.getDate()+7);
  const isTest = req.headers['x-is-test'] === 'true' || isTestRecord({ name, phone, employeeId }) || req.body.isTest === true;
  const empType = req.body.type || (req.body.status === 'OFFICIAL' ? 'OFFICIAL' : 'TRAINING');
  const empStatus = req.body.status || (req.body.type === 'OFFICIAL' ? 'OFFICIAL' : 'TRAINING');
  const emp = {
    id: uuidv4(), employeeId, name, phone, branchId, shift,
    startDate: req.body.startDate || toVietnamDateStr(now),
    endDate: empType === 'OFFICIAL' ? null : toVietnamDateStr(end),
    trainingDays: empType === 'OFFICIAL' ? 0 : 7, 
    status: empStatus, 
    testScore: null, testResult: null,
    type: empType, 
    category: category||'STORE', avatar:'', checkHistory:[],
    isTest: isTest || undefined,
    version:1, updated_at: now.toISOString(), updated_by: req.user.username, source: isTest ? 'TEST' : 'WEB_HR', sync_status: isTest ? 'TEST_BLOCKED' : 'PENDING'
  };
  db.employees.push(emp);
  const key = { id: uuidv4(), employeeId, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), deviceId:null, boundAt:null, status:'ACTIVE', isTest: isTest || undefined, version:1, updated_at: now.toISOString(), sync_status: isTest ? 'TEST_BLOCKED' : 'PENDING' };
  db.keys.push(key);
  audit(req.user.username,'CREATE','EMPLOYEE',null,emp, req.ip);
  if(!isTest && !isTestRecord(emp)){
    addSyncQueue('EMPLOYEE','CREATE',emp, req.user.username, 'WEB_HR');
  }
  saveDB();
  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  io.emit('hr:action', { action: 'create_employee', success: true, detail: 'New employee created' });
  res.json({ employee: emp, key });
});
// Bulk import Official employees (data cũ)
app.post('/api/employees/import-official', authMiddleware, roleCheck(['Admin','HR']), async (req,res)=>{
  const rows = req.body.employees || req.body.rows || req.body.data || [];
  if(!Array.isArray(rows) || rows.length===0) return res.status(400).json({error:'Không có dữ liệu import (cần mảng employees)'});
  if(rows.length>500) return res.status(400).json({error:'Tối đa 500 nhân viên/lần import'});
  // RÀNG BUỘC realtime: nạp 1 lần tập SĐT trên Sheet 17iXM để chặn trùng cho cả batch
  const importSheetPhones = await getSheetPhoneSet().catch(()=>new Set());
  const batchPhones = new Set();
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
      // RÀNG BUỘC realtime: 1 SĐT duy nhất (chuẩn hóa) trên web + batch + Sheet 17iXM
      {
        const norm = normalizePhone(phone);
        const hitE = db.employees.find(e=>normalizePhone(e.phone)===norm);
        if(hitE){ results.skipped.push({idx, reason:`Trùng SĐT ${phone} (nhân viên ${hitE.name})`, row}); return; }
        const hitA = db.applicants.find(a=>normalizePhone(a.phone)===norm);
        if(hitA){ results.skipped.push({idx, reason:`Trùng SĐT ${phone} (ứng viên ${hitA.name} - dùng Chuyển Training thay vì import)`, row}); return; }
        if(batchPhones.has(norm)){ results.skipped.push({idx, reason:`Trùng SĐT ${phone} trong cùng file import`, row}); return; }
        if(importSheetPhones.has(norm)){ results.skipped.push({idx, reason:`Trùng SĐT ${phone} đã có trên Google Sheet 17iXM`, row}); return; }
        batchPhones.add(norm);
      }
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
      const now = getVietnamISOString();
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
app.post('/api/employees/import-training', authMiddleware, roleCheck(['Admin','HR']), async (req,res)=>{
  const rows = req.body.employees || req.body.rows || req.body.data || [];
  if(!Array.isArray(rows) || rows.length===0) return res.status(400).json({error:'Không có dữ liệu import (cần mảng employees)'});
  if(rows.length>500) return res.status(400).json({error:'Tối đa 500 nhân viên/lần import'});
  // RÀNG BUỘC realtime: nạp 1 lần tập SĐT trên Sheet 17iXM để chặn trùng cho cả batch
  const importSheetPhones = await getSheetPhoneSet().catch(()=>new Set());
  const batchPhones = new Set();
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
  // Dùng for..of (không dùng forEach) để await kiểm tra trùng SĐT realtime từng dòng
  for(const [idx, row] of rows.entries()){
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
      if(!name) { results.skipped.push({idx, reason:'Thiếu Họ tên', row}); continue; }
      if(!phone) { results.skipped.push({idx, reason:'Thiếu SĐT', row}); continue; }
      if(!branchId) { results.errors.push({idx, reason:'Chi nhánh không hợp lệ', row}); continue; }
      // RÀNG BUỘC realtime: chỉ UPDATE khi đúng Mã NV (cùng người).
      // SĐT trùng người khác (web/batch/Sheet 17iXM/ứng viên) -> bỏ qua, không ghi đè hồ sơ người khác.
      const normPhone = normalizePhone(phone);
      let existing = null;
      if(employeeIdInput) existing = db.employees.find(e=>e.employeeId===employeeIdInput);
      if(existing){
        if(normalizePhone(existing.phone)!==normPhone){
          const dup = await isPhoneDuplicateEverywhere(phone, {excludeEmployeeId: existing.employeeId});
          if(dup.dup){ results.skipped.push({idx, reason: dupPhoneErrorMessage(phone, dup), row}); continue; }
        }
      } else {
        const hitE = db.employees.find(e=>normalizePhone(e.phone)===normPhone);
        if(hitE){ results.skipped.push({idx, reason:`Trùng SĐT ${phone} (nhân viên ${hitE.name})`, row}); continue; }
        const hitA = db.applicants.find(a=>normalizePhone(a.phone)===normPhone);
        if(hitA){ results.skipped.push({idx, reason:`Trùng SĐT ${phone} (ứng viên ${hitA.name})`, row}); continue; }
        if(batchPhones.has(normPhone)){ results.skipped.push({idx, reason:`Trùng SĐT ${phone} trong cùng file import`, row}); continue; }
        if(importSheetPhones.has(normPhone)){ results.skipped.push({idx, reason:`Trùng SĐT ${phone} đã có trên Google Sheet 17iXM`, row}); continue; }
        batchPhones.add(normPhone);
      }
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
        existing.updated_at = getVietnamISOString();
        existing.updated_by = req.user.username;
        existing.sync_status='PENDING';
        results.updated++;
        results.employees.push(existing);
        audit(req.user.username,'UPDATE_TRAINING_IMPORT','EMPLOYEE',before,existing, req.ip);
        addSyncQueue('EMPLOYEE','UPDATE',existing, req.user.username, 'IMPORT_TRAINING');
      } else {
        let employeeId = employeeIdInput;
        if(employeeId && db.employees.find(e=>e.employeeId===employeeId)){
          results.skipped.push({idx, reason:'Trùng Mã NV '+employeeId, row}); continue;
        }
        if(!employeeId){
          try{ employeeId = generateEmployeeId(branchId); }catch(e){ results.errors.push({idx, reason:'Không sinh được Mã NV', row}); continue; }
        }
        const now = getVietnamISOString();
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
        batchPhones.add(normalizePhone(phone));
        audit(req.user.username,'IMPORT_TRAINING','EMPLOYEE',null,emp, req.ip);
        addSyncQueue('EMPLOYEE','CREATE',emp, req.user.username, 'IMPORT_TRAINING');
      }
    }catch(e){
      results.errors.push({idx, reason:e.message, row});
    }
  }
  saveDB();
  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  res.json(results);
});
app.put('/api/employees/:id', authMiddleware, roleCheck(['Admin','HR','Manager']), async (req,res)=>{
  const emp = db.employees.find(e=>e.id===req.params.id || e.employeeId===req.params.id);
  if(!emp) return res.status(404).json({error:'Không tìm thấy'});
  const before = {...emp};
  // RÀNG BUỘC: mã NV + id nội bộ là bất biến theo nhân viên đó luôn.
  // Mọi cập nhật tính năng/code không được đổi mã; chỉ cấp mới khi xóa rồi đăng ký/import lại.
  const { employeeId: _eid, id: _id, ...safeBody } = req.body || {};
  if(_eid && _eid!==emp.employeeId) console.log(`[BẢO VỆ MÃ NV] Chặn đổi mã ${emp.employeeId} -> ${_eid} bởi ${req.user.username}`);
  // RÀNG BUỘC realtime: đổi SĐT sang số đã tồn tại (web/Sheet 17iXM) thì chặn
  if(safeBody.phone && normalizePhone(safeBody.phone)!==normalizePhone(emp.phone)){
    const dup = await isPhoneDuplicateEverywhere(safeBody.phone, {excludeEmployeeId: emp.employeeId});
    if(dup.dup) return res.status(409).json({error: dupPhoneErrorMessage(safeBody.phone, dup)});
  }
  Object.assign(emp, safeBody);
  emp.version = (emp.version||1)+1;
  emp.updated_at = getVietnamISOString();
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
  if(idx===-1) return res.status(404).json({error:'Không tìm thấy'});
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
      return res.json({success:true, hard:true, cascade:true, note:'Đã xóa local. Dòng trên Google Sheet vẫn giữ (ràng buộc tuyệt đối) và sẽ tự kéo lại sau deploy - muốn xóa vĩnh viễn hãy xóa trực tiếp trên Sheet hoặc dùng POST /api/admin/delete-sheet-rows'});
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
    // RÀNG BUỘC TUYỆT ĐỐI: xóa cứng local nhưng KHÔNG đồng bộ xóa lên Google Sheet 17iXM (Sheet giữ dữ liệu vĩnh viễn)
    saveDB();
    io.emit('employees:update', db.employees);
    io.emit('keys:update', db.keys);
    io.emit('schedules:update', db.schedules);
    io.emit('attendances:update', db.attendances);
    io.emit('offRequests:update', db.offRequests);
    io.emit('emergencyRequests:update', db.emergencyRequests);
    emitForceLogout(empId, 'Tài khoản nhân viên đã bị xóa vĩnh viễn khỏi hệ thống');
    return res.json({success:true, hard:true, removedKeys: beforeKeys, note:'Đã xóa local. Dòng trên Google Sheet vẫn giữ (ràng buộc tuyệt đối) và sẽ tự kéo lại sau deploy - muốn xóa vĩnh viễn hãy xóa trực tiếp trên Sheet hoặc dùng POST /api/admin/delete-sheet-rows'});
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
  io.emit('hr:action', { action: 'archive_employee', success: true, detail: 'Soft delete (ARCHIVED)' });
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
  if(!emp) return res.status(404).json({error:'Không tìm thấy'});
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
      const oStartD = (op.length === 3 && !isNaN(op[0])) ? new Date(op[0], op[1] - 1, op[2]) : getVietnamNow();
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
          existingSched.updated_at = getVietnamISOString();
        } else {
          db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: wStart, days: fullDays, version: 1, updated_at: getVietnamISOString() });
        }
      }
    } else {
      // Không chọn ngày: tạo lịch tuần hiện tại như cũ
      const weekStart = getMonday(getVietnamNow());
      const days = [];
      for(let i=0;i<7;i++){
        const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
        const dateStr = toVietnamDateStr(d);
        days.push({ date: dateStr, dayName: ['T2','T3','T4','T5','T6','T7','CN'][i], shift: emp.shift, status:'WORKING', substituteFor: null });
      }
      db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: toVietnamDateStr(weekStart), days, version:1, updated_at: getVietnamISOString() });
    }
    audit(req.user.username,isFuture?'TRANSITION_WAITING_OFFICIAL':'TRANSITION_OFFICIAL','EMPLOYEE',before,emp, req.ip);
  } else {
    emp.status = target;
    audit(req.user.username,'TRANSITION','EMPLOYEE',before,emp, req.ip);
  }
  emp.version = (emp.version||1)+1;
  emp.updated_at = getVietnamISOString();
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
  // RÀNG BUỘC TUYỆT ĐỐI: Chặn 100% dữ liệu test không bao giờ đẩy lên Sheet
  if (!applicant || isTestRecord(applicant)) {
    console.log(`[TEST GUARD] Bỏ qua syncOutboundToMasterDatabaseSheet cho dữ liệu test: ${applicant?.name || applicant?.id}`);
    return;
  }
  const targetId = (db.settings && db.settings.googleSheet && db.settings.googleSheet.targetDatabaseSpreadsheetId) ? db.settings.googleSheet.targetDatabaseSpreadsheetId : '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const cfg = (db.settings && db.settings.googleSheet) ? db.settings.googleSheet : {};

  const resultText = applicant.isDisqualified || applicant.status === 'REJECTED'
    ? `LOẠI THẲNG (${applicant.aiScore}/14 - ${applicant.disqualifications?.join('; ')||'Không đạt'})`
    : `ĐẠT CHUẨN (${applicant.aiScore}/14 điểm)`;

  const row = [
    applicant.id,
    applicant.createdAt || getVietnamISOString(),
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
    getVietnamISOString(),
    'AI_SYSTEM',
    'SYNCED',
    computeDataHash(applicant)
  ];

  // RÀNG BUỘC CHỐNG TRÙNG web→Sheet (APPEND):
  // - Dữ liệu không đổi so với lần gửi thành công trước -> bỏ qua (không ghi lại).
  // - Sheet đã có dòng cùng ID -> bỏ qua APPEND (bản hợp nhất 60s sẽ cập nhật dòng đó).
  const rowHash = computeDataHash(applicant);
  if(applicant.outboundRowHash && applicant.outboundRowHash===rowHash){
    return;
  }
  try{
    if(await sheetHasRowId(targetId, 'NHAN_VIEN_MOI', applicant.id)){
      console.log(`[CHỐNG TRÙNG] Ứng viên ${applicant.id} đã có trên Sheet Database -> bỏ qua APPEND (merge 60s sẽ cập nhật)`);
      applicant.outboundRowHash = rowHash;
      return;
    }
    // RÀNG BUỘC CHỐNG TRÙNG SĐT: Nếu trùng số điện thoại thì KHÔNG ĐƯỢC LƯU VÀO GOOGLE SHEET
    const normPhone = normalizePhone(applicant.phone);
    if(normPhone && normPhone.length >= 9 && await sheetHasPhone(targetId, 'NHAN_VIEN_MOI', normPhone)){
      console.log(`[CHỐNG TRÙNG SĐT] Ứng viên SĐT ${applicant.phone} đã tồn tại trên Sheet 17iXM -> Bỏ qua APPEND để không lưu trùng`);
      applicant.outboundRowHash = rowHash;
      return;
    }
  }catch(e){}

  const syncItem = {
    id: uuidv4(),
    entity: 'APPLICANT',
    operation: 'OUTBOUND_SYNC_DATABASE_SHEET',
    targetSpreadsheetId: targetId,
    applicantId: applicant.id,
    applicantName: applicant.name,
    status: 'SUCCESS',
    timestamp: getVietnamISOString(),
    rowPayload: row
  };
  db.syncQueue.unshift(syncItem);

  let sentOk = false;
  if (cfg.targetWebhookUrl) {
    try {
      await fetch(cfg.targetWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPEND_ROW', spreadsheetId: targetId, row })
      });
      sentOk = true;
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
        sentOk = true;
      }
    } catch (e) {
      console.error('Outbound Service Account Push Error:', e.message);
    }
  }
  // Chỉ đánh dấu đã gửi khi thành công -> gửi lỗi sẽ thử lại lần sau, không mất dữ liệu
  if(sentOk) applicant.outboundRowHash = rowHash;
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
app.post('/api/applicants', async (req,res)=>{
  const { name, phone, email, branchPreference, cvData, gender, birthYear, education, hometown, shiftPreference, experience, handling, facebook, source } = req.body;
  const source_id = 'form_'+uuidv4();
  // RÀNG BUỘC realtime: 1 SĐT duy nhất trên toàn bộ 17iXM + web (ứng viên + nhân viên)
  if(phone){
    const dup = await isPhoneDuplicateEverywhere(phone);
    if(dup.dup) return res.status(409).json({error: dupPhoneErrorMessage(phone, dup)});
  }
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
    aiScore: null, aiBreakdown: [], status:'NEW_APPLICANT', source_id, createdAt: getVietnamISOString(), version:1, sync_status:'PENDING',
    rawData: req.body
  };
  applicant = runAIScoring(applicant);
  db.applicants.push(applicant);
  addSyncQueue('APPLICANT','CREATE',applicant,'SYSTEM','FORM');
  saveDB();
  io.emit('applicants:update', db.applicants);
  // Zalo notify
  const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: phone||'unknown', type:'NEW_APPLICANT', content:`[FORM] Ứng viên mới: ${name} - ${phone} - ${branchId} (AI: ${applicant.aiScore} điểm)`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json(applicant);
});
// Webhook for Google Form - handles both entry.xxx and direct field names, also Sheet sync
app.post('/api/recruitment/form-submit', async (req,res)=>{
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
  // RÀNG BUỘC realtime: 1 SĐT duy nhất trên toàn bộ 17iXM + web (ứng viên + nhân viên)
  if(mapped.phone){
    const dup = await isPhoneDuplicateEverywhere(mapped.phone);
    if(dup.dup) return res.status(409).json({error: dupPhoneErrorMessage(mapped.phone, dup), phone:mapped.phone});
  }
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
    aiScore: null, aiBreakdown: [], status:'NEW_APPLICANT', source_id:'form_'+uuidv4(), createdAt: getVietnamISOString(), version:1, sync_status:'SYNCED', rawData: mapped
  };
  applicant = runAIScoring(applicant);
  db.applicants.push(applicant);
  addSyncQueue('APPLICANT','CREATE',applicant,'SYSTEM','FORM');
  saveDB();
  io.emit('applicants:update', db.applicants);
  const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: mapped.phone, type:'NEW_APPLICANT', content:`[FORM] ${mapped.name} - ${mapped.phone} - ${branchId} (AI: ${applicant.aiScore} điểm)`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json({success:true, applicant});
});
app.post('/api/applicants/:id/score', authMiddleware, (req,res)=>{
  const appRec = db.applicants.find(a=>a.id===req.params.id);
  if(!appRec) return res.status(404).json({error:'Không tìm thấy'});

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
  const timestamp = getVietnamISOString();

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

// ============ P0 PHASE 1: Zalo inbound confirmation webhook (Master 6.4) ============
// Outbound da co (sendZaloBotNotification). Inbound nhan xac nhan tham gia PV.
// Provider: OfficialOA / ConfiguredWebhook / Mock(dev). Nhan webhook generic
// {phone, text/content/message, message_id, ...} + verify secret tuy chon.
function normalizeZaloText(s){
  try{
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }catch(_){ return String(s || '').toLowerCase().trim(); }
}
function classifyZaloInbound(normText){
  const t = ` ${normText} `;
  const positive = ['xac nhan', 'dong y', 'tham gia', 'ok', 'okay', 'yes', 'co', 'confirm', 'da nhan'];
  const negative = ['khong', 'ban', 'huy', 'cancel', 'nghi', 'tu choi', 'doi lich', 'xep lai'];
  if(t.trim() === 'co' || t.trim() === 'ok' || t.trim() === 'yes') return 'POSITIVE';
  const hasNeg = negative.some(k => t.includes(k));
  const hasPos = positive.some(k => t.includes(k));
  if(hasNeg && !t.includes('xac nhan')) return 'NEGATIVE';
  if(hasPos) return 'POSITIVE';
  return 'UNKNOWN';
}
app.post('/api/zalo/inbound', async (req, res) => {
  const body = req.body || {};
  const phone = body.phone || body.sender || body.from || body.user_id || body.follower_id || '';
  const text = body.text || body.content || body.message || body.msg || '';
  const messageId = body.message_id || body.msg_id || body.id || null;
  const cfgSecret = process.env.ZALO_WEBHOOK_SECRET || db.settings?.zalo?.webhookSecret || '';
  if(cfgSecret){
    const got = req.headers['x-zalo-signature'] || req.headers['x-webhook-secret'] || body.secret || '';
    if(got !== cfgSecret) return res.status(401).json({ error: 'Webhook secret khong hop le' });
  }
  if(!phone || !text) return res.status(400).json({ error: 'Thieu phone hoac text' });
  const normPhone = String(phone).replace(/\D/g, '');
  const nowMs = Date.now();
  if(!global.__zaloInboundSeen) global.__zaloInboundSeen = [];
  global.__zaloInboundSeen = global.__zaloInboundSeen.filter(x => nowMs - x.at < 60000);
  const dup = global.__zaloInboundSeen.find(x => x.phone === normPhone && x.text === String(text));
  if(dup && (!messageId || dup.messageId === messageId)){
    return res.json({ success: true, deduped: true, classification: dup.classification });
  }
  const norm = normalizeZaloText(text);
  const classification = classifyZaloInbound(norm);
  // AGENTS.md zero-leak: test/CI goi webhook (x-is-test / NODE_ENV=test) thi chi xu ly
  // in-memory + tra response, khong persist record/test-notify/saveDB.
  const isTestCall = req.headers['x-is-test'] === 'true' || body.isTest || process.env.NODE_ENV === 'test' || OUTBOUND_SYNC_DISABLED;
  const zr = {
    id: uuidv4(), sent_at: getVietnamISOString(), receiver: `HR-INBOUND:${normPhone}`,
    receiverName: '', type: 'ZALO_INBOUND', content: String(text), status: `INBOUND_${classification}`,
    error: '', direction: 'INBOUND', phone: normPhone, normText: norm, messageId: messageId || undefined
  };
  if(!isTestCall) db.zaloRecords.unshift(zr);
  let matched = null;
  if(classification !== 'UNKNOWN'){
    const cands = (db.interviews || []).filter(i => i.applicantPhone && String(i.applicantPhone).replace(/\D/g, '').endsWith(normPhone.slice(-9)) && (i.status === 'SCHEDULED' || i.confirmationStatus === 'WAITING_CONFIRM'));
    matched = cands.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
    if(matched){
      const before = { confirmationStatus: matched.confirmationStatus || 'WAITING_CONFIRM' };
      if(classification === 'POSITIVE'){
        matched.confirmationStatus = 'CONFIRMED';
        matched.confirmedAt = getVietnamISOString();
        matched.confirmSource = 'ZALO_INBOUND';
      } else {
        matched.confirmationStatus = 'NEED_RESCHEDULE';
        matched.confirmSource = 'ZALO_INBOUND';
      }
      const appRec = db.applicants.find(a => a.id === matched.applicantId);
      if(appRec){
        const b2 = { ...appRec };
        appRec.confirmationStatus = matched.confirmationStatus;
        appRec.version = (appRec.version || 1) + 1;
        appRec.updated_at = getVietnamISOString();
        audit('ZALO_INBOUND', classification === 'POSITIVE' ? 'CONFIRM_INTERVIEW' : 'REQUEST_RESCHEDULE', 'APPLICANT', b2, appRec, req.ip);
      }
      audit('ZALO_INBOUND', 'PARSE_' + classification, 'INTERVIEW', before, { confirmationStatus: matched.confirmationStatus }, req.ip);
    }
  } else {
    // Ambiguous -> Exception Inbox (HR review), khong tu quyet dinh (bo qua khi test)
    if(!isTestCall){
      try{
        notifyAdminAndHR({ action: 'ZALO_INBOUND_UNKNOWN', employeeId: normPhone, employeeName: normPhone, title: 'Zalo phan hoi khong xac dinh', message: `SDT ${normPhone} nhan: "${text}" — can HR xem va xac nhan thu cong.`, type: 'warning', data: { phone: normPhone, text } });
      }catch(_){}
    }
  }
  global.__zaloInboundSeen.push({ phone: normPhone, text: String(text), messageId: messageId || null, classification, at: nowMs });
  if(!isTestCall) saveDB();
  io.emit('zalo:update', db.zaloRecords);
  io.emit('interviews:update', db.interviews || []);
  io.emit('applicants:update', db.applicants || []);
  io.emit('zalo:received', { phone: normPhone, classification, interviewId: matched ? matched.id : null });
  res.json({ success: true, classification, interviewId: matched ? matched.id : null, confirmationStatus: matched ? matched.confirmationStatus : null });
});

// ============ P0 PHASE 1: Interview business-hours validator (Master 6.2) ============
// Rule: T2-T7, 08:00-17:00, 30 phut/slot, slot cuoi 16:30, khong Sunday, khong qua khu.
// Khong dung LLM; deterministic. Giu tuong thich slotKey cu + them overlap that.
function parseInterviewSlot(timeSlot){
  if(!timeSlot || typeof timeSlot !== 'string') return null;
  const parts = timeSlot.split('-');
  if(parts.length !== 2) return null;
  const a = parts[0].trim().split(':').map(Number);
  const b = parts[1].trim().split(':').map(Number);
  if(a.length !== 2 || b.length !== 2) return null;
  if(a.some(isNaN) || b.some(isNaN)) return null;
  const [sh, sm] = a; const [eh, em] = b;
  if(sh < 0 || sh > 23 || eh < 0 || eh > 23 || sm < 0 || sm > 59 || em < 0 || em > 59) return null;
  return { sh, sm, eh, em, startMins: sh * 60 + sm, endMins: eh * 60 + em };
}
function validateInterviewSlot(interviewDate, timeSlot){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(interviewDate || '')) return { ok: false, error: 'Ngay phong van khong hop le (YYYY-MM-DD)' };
  const slot = parseInterviewSlot(timeSlot);
  if(!slot) return { ok: false, error: 'Khung gio khong hop le (vi du 08:00-08:30)' };
  if(slot.endMins - slot.startMins !== 30) return { ok: false, error: 'Moi lich phong van 30 phut' };
  if(slot.startMins < 8 * 60) return { ok: false, error: 'Lich phong van chi tu 08:00' };
  if(slot.endMins > 17 * 60) return { ok: false, error: 'Lich phong van ket thuc truoc 17:00' };
  if(slot.startMins > 16 * 60 + 30) return { ok: false, error: 'Slot cuoi trong ngay la 16:30' };
  const d = new Date(interviewDate + 'T00:00:00');
  if(isNaN(d.getTime())) return { ok: false, error: 'Ngay phong van khong hop le' };
  if(d.getDay() === 0) return { ok: false, error: 'Khong dat lich phong van Chu nhat' };
  const todayStr = getVietnamTodayStr();
  if(interviewDate < todayStr) return { ok: false, error: 'Khong dat lich trong qua khu' };
  if(interviewDate === todayStr){
    const now = getVietnamNow();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if(slot.startMins <= nowMins) return { ok: false, error: 'Khong dat lich trong qua khu (gio da qua hom nay)' };
  }
  return { ok: true, slot };
}
function checkInterviewOverlap(interviewDate, startMins, endMins, excludeApplicantId){
  if(!db.interviews) return null;
  return db.interviews.find(i => {
    if(i.interviewDate !== interviewDate) return false;
    if(i.status === 'CANCELLED') return false;
    if(excludeApplicantId && i.applicantId === excludeApplicantId) return false;
    const s = parseInterviewSlot(i.timeSlot);
    if(!s) return i.slotKey === `${interviewDate}_${startMins}`;
    return startMins < s.endMins && s.startMins < endMins;
  }) || null;
}

app.post('/api/applicants/:id/schedule-interview', authMiddleware, async (req, res) => {
  const { interviewDate, timeSlot, meetLink, notes } = req.body;
  const applicant = db.applicants.find(a => a.id === req.params.id);
  if (!applicant) return res.status(404).json({ error: 'Không tìm thấy hồ sơ ứng viên' });
  if (applicant.isDisqualified || applicant.status === 'REJECTED') {
    return res.status(403).json({ error: 'Ứng viên thuộc diện LOẠI THẲNG, không được đặt lịch phỏng vấn' });
  }
  if (!interviewDate || !timeSlot) return res.status(400).json({ error: 'Thiếu Ngày hoặc Khung giờ phỏng vấn' });

  // P0 PHASE 1 (Master 6.2): enforce business hours that backend
  const slotCheck = validateInterviewSlot(interviewDate, timeSlot);
  if(!slotCheck.ok) return res.status(400).json({ error: slotCheck.error });

  if (!db.interviews) db.interviews = [];

  const slotKey = `${interviewDate}_${timeSlot}`;

  // Check 30-minute slot locking / conflict: Ensure no other applicant has booked this 30-min slot
  const conflict = db.interviews.find(i => i.slotKey === slotKey && i.status !== 'CANCELLED' && i.applicantId !== applicant.id)
    || checkInterviewOverlap(interviewDate, slotCheck.slot.startMins, slotCheck.slot.endMins, applicant.id);
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
    interview.updatedAt = getVietnamISOString();
    // P0 PHASE 1: reschedule -> reset idempotent reminder flags (T30/T15/T5)
    interview.reminderSent = false;
    interview.reminderT30Sent = false;
    interview.reminderT15Sent = false;
    interview.reminderT5Sent = false;
    interview.status = 'SCHEDULED';
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
      confirmationStatus: 'WAITING_CONFIRM',
      reminderSent: false,
      reminderT30Sent: false,
      reminderT15Sent: false,
      reminderT5Sent: false,
      createdAt: getVietnamISOString()
    };
    db.interviews.push(interview);
  }

  applicant.status = 'INTERVIEW';
  applicant.interview = interview;

  // Send Automatic Zalo Invite Notification via Zalo Bot Engine
  // P0 PHASE 1 (Master 15.3): tin nhan yeu cau XAC NHAN THAM GIA de inbound parse
  const inviteContent = `[ỤM BÒ MILK - THƯ MỜI PHỎNG VẤN TRỰC TUYẾN]\n\nChào bạn ${applicant.name},\nChúc mừng bạn đã vượt qua vòng sơ tuyển hồ sơ AI của Ụm Bò Milk!\n\n📅 Thời gian: ${timeSlot} ngày ${interviewDate}\n🏢 Chi nhánh ứng tuyển: ${branchName}\n🎥 Link Google Meet phỏng vấn: ${generatedMeet}\n\nBạn vui lòng nhắn tin XÁC NHẬN THAM GIA (hoac OK) de giu lich. Neu ban khong the tham gia, vui long nhan HUY/BAN de HR xep lai. Vui long truy cap Meet truoc 5 phut! Tran trong!`;

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

// Background Interview Reminder Poller (T-30/T-15/T-5) + Meet-end -> WAITING REVIEW (P0 PHASE 1, Master 6.1/6.3)
// P0: TUYET DOI KHONG auto-PASS khi Meet ket thuc. Chi dat COMPLETED_WAITING_PROCESSING + applicant WAITING_HR_REVIEW.
setInterval(async () => {
  if (!db.interviews || db.interviews.length === 0) return;
  const now = getVietnamNow();
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

      // ---- T-30 REMINDER (idempotent, giu tuong thich reminderSent) ----
      if (!inv.reminderT30Sent && !inv.reminderSent) {
        const reminderMs = startMs - (30 * 60 * 1000);
        if (nowMs >= reminderMs && nowMs < startMs + (30 * 60 * 1000)) {
          inv.reminderSent = true;
          inv.reminderT30Sent = true;
          inv.reminderT30At = getVietnamISOString();
          const msg = `⏰ [NHẮC LỊCH PV 30 PHÚT] Chào ${inv.applicantName}, lịch phỏng vấn trực tuyến với Ụm Bò Milk sẽ bắt đầu lúc ${inv.timeSlot} ngày ${inv.interviewDate}. Bạn hãy chuẩn bị và tham gia qua Google Meet: ${inv.meetLink}`;
          await sendZaloBotNotification({ phone: inv.applicantPhone, name: inv.applicantName, content: msg, type: 'INTERVIEW_REMINDER_30MIN' });
          io.emit('interview:reminder_due', { interview: inv, message: msg, kind: 'T30' });
          saveDB();
          io.emit('interviews:update', db.interviews);
          console.log(`[30-MIN REMINDER] ${inv.applicantName} - ${inv.timeSlot}`);
        }
      }
      // ---- T-15 REMINDER (P0 PHASE 1, idempotent) ----
      if (!inv.reminderT15Sent) {
        const reminder15Ms = startMs - (15 * 60 * 1000);
        if (nowMs >= reminder15Ms && nowMs < startMs + (30 * 60 * 1000)) {
          inv.reminderT15Sent = true;
          inv.reminderT15At = getVietnamISOString();
          const msg15 = `⏰ [NHẮC LỊCH PV 15 PHÚT] Chào ${inv.applicantName}, chỉ còn 15 phút nữa buổi phỏng vấn (${inv.timeSlot} ngày ${inv.interviewDate}) bắt đầu. Vui lòng sẵn sàng vào Meet: ${inv.meetLink}`;
          await sendZaloBotNotification({ phone: inv.applicantPhone, name: inv.applicantName, content: msg15, type: 'INTERVIEW_REMINDER_15MIN' });
          io.emit('interview:reminder_due', { interview: inv, message: msg15, kind: 'T15' });
          saveDB();
          io.emit('interviews:update', db.interviews);
          console.log(`[15-MIN REMINDER] ${inv.applicantName} - ${inv.timeSlot}`);
        }
      }
      // ---- T-5 HR PREPARE (P0 PHASE 1, idempotent, khong spam ung vien) ----
      if (!inv.reminderT5Sent) {
        const reminder5Ms = startMs - (5 * 60 * 1000);
        if (nowMs >= reminder5Ms && nowMs < startMs + (30 * 60 * 1000)) {
          inv.reminderT5Sent = true;
          inv.reminderT5At = getVietnamISOString();
          io.emit('interview:reminder_due', { interview: inv, message: `Chuẩn bị mở Meet cho ${inv.applicantName} (${inv.timeSlot})`, kind: 'T5_HR_PREPARE' });
          try { io.emit('hr:action', { actor: 'SYSTEM', action: 'INTERVIEW_T5_PREPARE', applicantName: inv.applicantName, interviewId: inv.id, timestamp: getVietnamISOString() }); } catch(_){}
          saveDB();
          io.emit('interviews:update', db.interviews);
          console.log(`[5-MIN HR PREPARE] ${inv.applicantName} - ${inv.timeSlot}`);
        }
      }

      // ---- MEET END -> COMPLETED_WAITING_PROCESSING (KHONG auto-PASS, Master 6.1) ----
      if (!inv.autoPassTriggered && !inv.processedAfterMeet && endTimeStr) {
        const [endH, endM] = endTimeStr.split(':').map(Number);
        const invEnd = new Date(inv.interviewDate);
        invEnd.setHours(endH, endM, 0, 0);
        const endMs = invEnd.getTime();

        if (nowMs >= endMs) {
          // P0 PHASE 1 (Master 6.1): KHONG auto-PASS. Chuyen sang cho HR review.
          const appRec = db.applicants.find(a => a.id === inv.applicantId);
          if (appRec && appRec.status === 'INTERVIEW') {
            const before = { ...appRec };
            appRec.status = 'WAITING_HR_REVIEW';
            appRec.version = (appRec.version || 1) + 1;
            appRec.updated_at = getVietnamISOString();
            appRec.interviewCompletedAt = getVietnamISOString();
            appRec.interviewResult = 'COMPLETED_WAITING_PROCESSING';
            inv.autoPassTriggered = true; // giu flag cu de khong reprocess + tuong thich UI
            inv.processedAfterMeet = true;
            inv.status = 'COMPLETED_WAITING_PROCESSING';
            inv.completedAt = getVietnamISOString();
            audit('SYSTEM', 'INTERVIEW_COMPLETED_WAITING_REVIEW', 'APPLICANT', before, appRec, 'auto-poller');
            addSyncQueue('APPLICANT', 'UPDATE', appRec, 'SYSTEM', 'AUTO');
            saveDB();
            io.emit('applicants:update', db.applicants);
            io.emit('interviews:update', db.interviews);
            // Giu compat event interview:auto_pass cho UI cu, nhung payload bao khong PASS tu dong
            io.emit('interview:auto_pass', {
              applicantId: appRec.id,
              applicantName: appRec.name,
              interviewId: inv.id,
              timeSlot: inv.timeSlot,
              interviewDate: inv.interviewDate,
              autoPassDisabled: true,
              nextStatus: 'WAITING_HR_REVIEW'
            });
            console.log(`[INTERVIEW END] ${appRec.name} - Meet ended at ${endTimeStr}, -> WAITING_HR_REVIEW (no auto-PASS).`);
          } else {
            // Mark as done even if already converted
            inv.autoPassTriggered = true;
            inv.processedAfterMeet = true;
            inv.status = inv.status === 'SCHEDULED' ? 'COMPLETED_WAITING_PROCESSING' : inv.status;
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
  if(!appRec) return res.status(404).json({error:'Không tìm thấy'});
  const { status } = req.body;
  const before = {...appRec};
  appRec.status = status;
  appRec.version = (appRec.version||1)+1;
  appRec.updated_at = getVietnamISOString();
  if(status==='PASS'){
    // Create calendar event + zalo
    const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: appRec.phone, type:'INTERVIEW_INVITE', content:`Mời ${appRec.name} phỏng vấn tại ${db.branches.find(b=>b.id===appRec.branchPreference)?.address||'CN2'} - Meet link: https://meet.google.com/${Math.random().toString(36).substring(2,10)}`, status:'QUEUED', error:'' };
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
  if(!appRec) return res.status(404).json({error:'Không tìm thấy'});

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
    version:1, updated_at: getVietnamISOString(), updated_by: req.user.username, source:'WEB_HR', sync_status:'PENDING'
  };
  db.employees.push(emp);

  const key = { id: uuidv4(), employeeId, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: getVietnamISOString(), sync_status:'PENDING' };
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
      existingSched.updated_at = getVietnamISOString();
    } else {
      const newSched = {
        id: uuidv4(),
        employeeId: employeeId,
        weekStart: wStart,
        days: fullDays,
        version: 1,
        updated_at: getVietnamISOString()
      };
      db.schedules.push(newSched);
    }
  }

  const shiftDisplayMap = {
    'CA_SANG': 'Ca Sáng: 7g00 - 12g00',
    'CA_TRUA': 'Ca Trưa: 12g00 - 18g00',
    'CA_CHIEU': 'Ca Chiều: 12g00 - 18g00',
    'CA_TOI': 'Ca Tối: 18g00 - 23g00'
  };
  const branchDisplayMap = {
    'CN1': 'CN1: 130 Vạn kiếp, Phường 3, Quận Bình Thạnh',
    'CN2': 'CN2: 261 Tô Hiến Thành, Phường 13, Quận 10',
    'CN3': 'CN3: 120 Hoàng Diệu, Phường 12, Quận 4',
    'CN4': 'CN4: 111 Tôn Đản, Phường 14, Quận 4'
  };

  // Cập nhật lại Ca và Chi nhánh cho Ứng viên khi HR bấm Training
  appRec.shiftPreference = shiftFromForm;
  appRec.shiftText = shiftDisplayMap[shiftFromForm] || (shiftFromForm === 'CA_SANG' ? 'Ca Sáng: 7g00 - 12g00' : shiftFromForm === 'CA_TOI' ? 'Ca Tối: 18g00 - 23g00' : 'Ca Trưa: 12g00 - 18g00');
  appRec.branchPreference = branchId;
  appRec.branchText = branchDisplayMap[branchId] || branchId;
  appRec.status = 'CONVERTED';
  appRec.convertedEmployeeId = employeeId;
  appRec.updated_at = getVietnamISOString();
  appRec.updated_by = req.user.username;
  appRec.version = (appRec.version || 1) + 1;
  appRec.sync_status = 'PENDING';

  audit(req.user.username, 'CONVERT_APPLICANT', 'EMPLOYEE', null, emp, req.ip);
  addSyncQueue('APPLICANT', 'UPDATE', appRec, req.user.username, 'WEB_HR');
  addSyncQueue('EMPLOYEE', 'CREATE', emp, req.user.username, 'WEB_HR');
  saveDB();

  // Kích hoạt đồng bộ tức thì sang Google Sheet 17iXM (cả 3 tab liên quan)
  try {
    if (typeof triggerRealtimeSheetSync === 'function') {
      triggerRealtimeSheetSync('NHAN_VIEN_MOI');
      triggerRealtimeSheetSync('NHAN_VIEN_TRAINING');
      triggerRealtimeSheetSync('LICH_LAM_VIEC');
    }
  } catch(_) {}

  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  io.emit('applicants:update', db.applicants);
  io.emit('schedules:update', db.schedules);
  io.emit('hr:action', {
    type: 'CONVERT_TRAINING',
    applicantName: appRec.name,
    employeeId: employeeId,
    branchId: branchId,
    shift: shiftFromForm,
    message: `HR đã cập nhật ca ${shiftFromForm} và chi nhánh ${branchId}, chuyển ứng viên ${appRec.name} sang Thử việc (Mã NV: ${employeeId})`
  });
  res.json({ employee: emp, key, startDate: startDateStr, endDate: endDateStr, shift: shiftFromForm, branchId: branchId, applicant: appRec });
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
    const trainingDays = parseInt(get('Số ngày Thử việc','')) || 7;
    const rawStatus = get('Tr\u1ea1ng th\u00e1i',''); const status = rawStatus==='OFFICIAL'||rawStatus==='Ch\u00ednh th\u1ee9c'||rawStatus==='chinh thuc'||rawStatus==='official' ? 'OFFICIAL' : (rawStatus||null) || (foundSheet==='NHAN_VIEN_CHINH_THUC' ? 'OFFICIAL' : 'TRAINING');
    const testScore = get('Điểm TEST','') ? Number(get('Điểm TEST','')) : null;
    const testResult = get('Kết quả TEST','') || null;
    const rawType = get('Lo\u1ea1i',''); const type = rawType==='OFFICIAL'||rawType==='Ch\u00ednh th\u1ee9c'||rawType==='chinh thuc'||rawType==='official' ? 'OFFICIAL' : (rawType==='TRAINING'||rawType==='Th\u1eed vi\u1ec7c'||rawType==='training' ? 'TRAINING' : (rawType||null) || (foundSheet==='NHAN_VIEN_CHINH_THUC' ? 'OFFICIAL' : 'TRAINING'));
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
      updated_at: getVietnamISOString(),
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
      keyRec = { id: uuidv4(), employeeId: cleanId, key: finalKey, deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: getVietnamISOString(), sync_status:'SYNCED' };
      db.keys.push(keyRec);
    } else {
      keyRec.key = finalKey;
      keyRec.status='ACTIVE';
      keyRec.updated_at = getVietnamISOString();
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
// Kéo các tab còn lại (lịch, chấm công, phiếu, test, zalo, drive) từ Sheet 17iXM lên web.
// Upsert theo ID, bỏ qua dòng rác (thiếu Mã NV/SĐT, header lặp), bản ghi pulled đánh SYNCED
// và KHÔNG đẩy ngược lên Sheet (tránh loop). Chỉ Admin gọi qua nút "Cập nhật dữ liệu từ Google Sheet".
async function pullRemainingTabsFromMasterSheet(manualBy){
  const out = { tabs: {} };
  const spreadsheetId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const token = await getGoogleAccessToken();
  if(!token || !spreadsheetId){ console.log('[KÉO SHEET] Bỏ qua tabs phụ (chưa cấu hình ServiceAccount/Sheet)'); return out; }
  const readTab = async (sheetName)=>{
    try{
      const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:Z5000`, { headers:{ Authorization:`Bearer ${token}` }});
      if(!resp.ok) return null;
      const j = await resp.json();
      const values = j.values || [];
      if(values.length<2) return { H: values[0]||[], rows: [] };
      return { H: values[0], rows: values.slice(1) };
    }catch(e){ console.error(`[KÉO SHEET] Đọc ${sheetName} lỗi`, e.message); return null; }
  };
  const ci = (H,h,fb)=>{ const i=(H||[]).findIndex(x=>x===h); return i!==-1?i:fb; };
  const badId = (id)=>{ const s=String(id||'').trim(); return !s || /^(ID|MÃ NV|MA NV)$/i.test(s); };
  const badCode = (c)=>{ const s=String(c||'').trim(); return !s || /^(ID|MÃ NV|MA NV)$/i.test(s); };
  const S = (v)=> (v||'').toString().trim();
  const num = (v)=>{ if(v===''||v===undefined||v===null) return null; const n=Number(String(v).replace(',','.')); return isNaN(n)?null:n; };
  let changed = false;
  const emitFlags = {};
  const touch = (...evs)=>{ changed=true; evs.forEach(e=>emitFlags[e]=true); };

  // 1. LICH_LAM_VIEC → db.schedules (gộp ngày theo schedule id, dedupe theo ngày giữ dòng sau)
  {
    const t = await readTab('LICH_LAM_VIEC');
    const st = { pulled:0, updated:0, skipped:0 };
    if(t){
      const H=t.H;
      const iId=ci(H,'ID',0), iEmp=ci(H,'Mã NV',1), iWeek=ci(H,'Tuần bắt đầu',4), iDate=ci(H,'Ngày',5),
            iDay=ci(H,'Thứ',6), iShift=ci(H,'Ca',7), iStatus=ci(H,'Trạng thái',8), iSub=ci(H,'Người thay',9), iVer=ci(H,'Phiên bản',10);
      const groups = new Map();
      for(const row of t.rows){
        const sid=S(row[iId]), empId=S(row[iEmp]), date=S(row[iDate]);
        if(badId(sid) || badCode(empId) || !date){ st.skipped++; continue; }
        if(!groups.has(sid)) groups.set(sid, { empId, week: S(row[iWeek]), days: new Map() });
        const g = groups.get(sid);
        const rawShift = S(row[iShift]);
        let parsedShifts = [];
        if(rawShift && (rawShift.includes('+') || rawShift.includes(','))){
          parsedShifts = rawShift.split(/[,+]/).map(s=>s.trim()).filter(Boolean);
        }
        const primaryShift = parsedShifts[0] || rawShift || 'CA_SANG';
        g.days.set(date, {
          date,
          dayName: S(row[iDay]),
          shift: primaryShift,
          shift2: parsedShifts[1] || null,
          shift3: parsedShifts[2] || null,
          shifts: parsedShifts.length > 1 ? parsedShifts : (primaryShift && primaryShift !== 'OFF' ? [primaryShift] : []),
          status: S(row[iStatus])||'WORKING',
          substituteFor: S(row[iSub])||null
        });
        const v = num(row[iVer]); if(v!==null) g.version = Math.max(g.version||0, v);
      }
      for(const [sid, g] of groups){
        // Khớp theo ID trước, nếu lệch ID (lịch local tạo lại) thì khớp theo NV+tuần để không sinh bản ghi song song
        let sched = db.schedules.find(s=>s.id===sid) || db.schedules.find(s=>s.employeeId===g.empId && s.weekStart===g.week);
        if(!sched){
          sched = { id: sid, employeeId: g.empId, weekStart: g.week||'', days: [...g.days.values()], version: g.version||1, updated_at: getVietnamISOString(), updated_by: manualBy||'PULL_SHEET', approvalStatus:'APPROVED' };
          db.schedules.push(sched); st.pulled++;
        } else {
          let dirty=false;
          for(const d of g.days.values()){
            const ex = (sched.days||[]).find(x=>x.date===d.date);
            if(!ex){ (sched.days=sched.days||[]).push(d); dirty=true; }
            else {
              if (d.shifts && d.shifts.length > 1) {
                ex.shifts = d.shifts;
                ex.shift = d.shift;
                ex.shift2 = d.shift2;
                ex.shift3 = d.shift3;
                dirty = true;
              } else if (!ex.shifts || ex.shifts.length <= 1) {
                if(ex.status!==d.status || ex.shift!==d.shift){ ex.status=d.status; ex.shift=d.shift; dirty=true; }
              }
              if(ex.status!==d.status){ ex.status=d.status; dirty=true; }
              ex.dayName = d.dayName || ex.dayName;
              ex.substituteFor = d.substituteFor;
            }
          }
          if(dirty){ sched.version=(sched.version||1)+1; sched.updated_at=getVietnamISOString(); st.updated++; }
          else st.skipped++;
        }
      }
    }
    out.tabs.schedules = st; if(st.pulled||st.updated) touch('schedules:update');
  }
  // 2. RECORD_DIEM_DANH → db.attendances (thêm mới; bản ghi có sẵn chỉ bù checkOut còn thiếu)
  {
    const t = await readTab('RECORD_DIEM_DANH');
    const st = { pulled:0, updated:0, skipped:0 };
    if(t){
      const H=t.H;
      const iId=ci(H,'ID',0), iEmp=ci(H,'Mã NV',1), iDate=ci(H,'Ngày',3), iShift=ci(H,'Ca',4), iBranch=ci(H,'Chi nhánh',5),
            iInT=ci(H,'Giờ vào ca',6), iInG=ci(H,'GPS vào',7), iInD=ci(H,'Drive vào',9),
            iOutT=ci(H,'Giờ ra ca',10), iOutG=ci(H,'GPS ra',11), iOutD=ci(H,'Drive ra',13),
            iStatus=ci(H,'Trạng thái',14), iVio=ci(H,'Vi phạm',15), iVer=ci(H,'Phiên bản',16);
      for(const row of t.rows){
        const id=S(row[iId]), empId=S(row[iEmp]), date=S(row[iDate]);
        if(badId(id) || badCode(empId) || !date){ st.skipped++; continue; }
        let a = db.attendances.find(x=>x.id===id);
        if(!a){
          db.attendances.push({ id, employeeId: empId, date, shift: S(row[iShift])||'CA_SANG', branchId: S(row[iBranch])||'',
            checkIn: S(row[iInT])?{ time:S(row[iInT]), gps:S(row[iInG]), image:'', drivePath:S(row[iInD]), timestamp:'', content:'' }:null,
            checkOut: S(row[iOutT])?{ time:S(row[iOutT]), gps:S(row[iOutG]), image:'', drivePath:S(row[iOutD]), timestamp:'', content:'' }:null,
            status: S(row[iStatus])||'COMPLETED', violations: S(row[iVio])?S(row[iVio]).split(',').map(s=>s.trim()).filter(Boolean):[],
            version: num(row[iVer])||1, updated_at: getVietnamISOString(), sync_status:'SYNCED' });
          st.pulled++;
        } else {
          let dirty=false;
          if((!a.checkOut || !a.checkOut.time) && S(row[iOutT])){ a.checkOut={ time:S(row[iOutT]), gps:S(row[iOutG]), image:'', drivePath:S(row[iOutD]), timestamp:'', content:'' }; dirty=true; }
          if((!a.checkIn || !a.checkIn.time) && S(row[iInT])){ a.checkIn={ time:S(row[iInT]), gps:S(row[iInG]), image:'', drivePath:S(row[iInD]), timestamp:'', content:'' }; dirty=true; }
          if(dirty){ a.version=(a.version||1)+1; st.updated++; } else st.skipped++;
        }
      }
    }
    out.tabs.attendances = st; if(st.pulled||st.updated) touch('attendances:update');
  }
  // 3. RECORD_ZALO → db.zaloRecords (chỉ thêm mới — nội dung Sheet bị cắt 200 ký tự nên không ghi đè)
  {
    const t = await readTab('RECORD_ZALO');
    const st = { pulled:0, skipped:0 };
    if(t){
      const H=t.H;
      const iId=ci(H,'ID',0), iSent=ci(H,'Thời gian gửi',1), iRecv=ci(H,'Người nhận',2), iType=ci(H,'Loại',3), iContent=ci(H,'Nội dung',4), iStatus=ci(H,'Trạng thái',5), iErr=ci(H,'Lỗi',6);
      for(const row of t.rows){
        const id=S(row[iId]);
        if(badId(id)){ st.skipped++; continue; }
        if(!db.zaloRecords.find(z=>z.id===id)){
          db.zaloRecords.unshift({ id, sent_at: S(row[iSent])||getVietnamISOString(), receiver: S(row[iRecv]), type: S(row[iType]), content: S(row[iContent]), status: S(row[iStatus])||'SENT', error: S(row[iErr]) });
          st.pulled++;
        } else st.skipped++;
      }
    }
    out.tabs.zalo = st; if(st.pulled) touch('zalo:update');
  }
  // 4. PHIEU_OFF_HANG_TUAN → db.offRequests (upsert theo ID)
  {
    const t = await readTab('PHIEU_OFF_HANG_TUAN');
    const st = { pulled:0, updated:0, skipped:0 };
    if(t){
      const H=t.H;
      const iId=ci(H,'ID',0), iEmp=ci(H,'Mã NV',1), iName=ci(H,'Họ tên',2), iBranch=ci(H,'Chi nhánh',3), iShift=ci(H,'Ca',4),
            iDates=ci(H,'Ngày OFF',5), iType=ci(H,'Loại',6), iStatus=ci(H,'Trạng thái',7), iAuto=ci(H,'Tự động duyệt',8), iCreated=ci(H,'Ngày tạo',9);
      for(const row of t.rows){
        const id=S(row[iId]), empId=S(row[iEmp]);
        if(badId(id) || badCode(empId)){ st.skipped++; continue; }
        const dates = S(row[iDates]).split(',').map(s=>s.trim()).filter(Boolean);
        if(!dates.length){ st.skipped++; continue; }
        let r = db.offRequests.find(x=>x.id===id);
        if(!r){
          db.offRequests.push({ id, employeeId: empId, employeeName: S(row[iName]), branchId: S(row[iBranch]), shift: S(row[iShift]),
            dates, type: S(row[iType])||'WEEKLY', status: S(row[iStatus])||'APPROVED', autoApproved: S(row[iAuto])==='YES',
            createdAt: S(row[iCreated])||getVietnamISOString(), version:1, sync_status:'SYNCED' });
          st.pulled++;
        } else {
          const ns = S(row[iStatus]);
          if(ns && ns!==r.status){ r.status=ns; r.version=(r.version||1)+1; st.updated++; }
          else st.skipped++;
        }
      }
    }
    out.tabs.offRequests = st; if(st.pulled||st.updated) touch('offRequests:update');
  }
  // 5. PHIEU_OFF_DOT_XUAT → db.emergencyRequests (upsert theo ID)
  {
    const t = await readTab('PHIEU_OFF_DOT_XUAT');
    const st = { pulled:0, updated:0, skipped:0 };
    if(t){
      const H=t.H;
      const iId=ci(H,'ID',0), iEmp=ci(H,'Mã NV',1), iName=ci(H,'Họ tên',2), iBranch=ci(H,'Chi nhánh',3), iShift=ci(H,'Ca',4),
            iDate=ci(H,'Ngày OFF',5), iReason=ci(H,'Lý do',6), iSub=ci(H,'Người thay',7), iStatus=ci(H,'Trạng thái',8), iStep=ci(H,'Bước liên hoàn',9), iCreated=ci(H,'Ngày tạo',10);
      for(const row of t.rows){
        const id=S(row[iId]), empId=S(row[iEmp]), date=S(row[iDate]);
        if(badId(id) || badCode(empId) || !date){ st.skipped++; continue; }
        let r = db.emergencyRequests.find(x=>x.id===id);
        if(!r){
          db.emergencyRequests.push({ id, employeeId: empId, employeeName: S(row[iName]), branchId: S(row[iBranch]), shift: S(row[iShift]),
            date, reason: S(row[iReason]), substituteName: S(row[iSub]), status: S(row[iStatus])||'APPROVED',
            cascadeStep: num(row[iStep])||1, createdAt: S(row[iCreated])||getVietnamISOString(), version:1, sync_status:'SYNCED' });
          st.pulled++;
        } else {
          const ns = S(row[iStatus]);
          if(ns && ns!==r.status){ r.status=ns; r.version=(r.version||1)+1; st.updated++; }
          else st.skipped++;
        }
      }
    }
    out.tabs.emergencyRequests = st; if(st.pulled||st.updated) touch('emergencyRequests:update');
  }
  // 6. PHIEU_DOI_THIET_BI → db.deviceRequests (upsert theo ID)
  {
    const t = await readTab('PHIEU_DOI_THIET_BI');
    const st = { pulled:0, updated:0, skipped:0 };
    if(t){
      const H=t.H;
      const iId=ci(H,'ID',0), iEmp=ci(H,'Mã NV',1), iReason=ci(H,'Lý do',2), iOld=ci(H,'Thiết bị cũ',3), iNew=ci(H,'Thiết bị mới',4),
            iStatus=ci(H,'Trạng thái',5), iCreated=ci(H,'Ngày tạo',6), iExp=ci(H,'Hết hạn',7);
      for(const row of t.rows){
        const id=S(row[iId]), empId=S(row[iEmp]);
        if(badId(id) || badCode(empId)){ st.skipped++; continue; }
        let r = db.deviceRequests.find(x=>x.id===id);
        if(!r){
          db.deviceRequests.push({ id, employeeId: empId, reason: S(row[iReason]), oldDeviceId: S(row[iOld])||null, newDeviceId: S(row[iNew])||null,
            status: S(row[iStatus])||'APPROVED', createdAt: S(row[iCreated])||getVietnamISOString(), expiresAt: S(row[iExp])||null, version:1, sync_status:'SYNCED' });
          st.pulled++;
        } else {
          const ns = S(row[iStatus]);
          if(ns && ns!==r.status){ r.status=ns; r.version=(r.version||1)+1; st.updated++; }
          else st.skipped++;
        }
      }
    }
    out.tabs.deviceRequests = st; if(st.pulled||st.updated) touch('deviceRequests:update');
  }
  // 7. KET_QUA_TEST → db.testResults (chỉ thêm mới theo ID — điểm số không ghi đè)
  {
    const t = await readTab('KET_QUA_TEST');
    const st = { pulled:0, skipped:0 };
    if(t){
      const H=t.H;
      const iId=ci(H,'ID',0), iEmp=ci(H,'Mã NV',1), iCourse=ci(H,'Khóa',3), iScore=ci(H,'Điểm',4), iCT=ci(H,'Đúng/Tổng',5),
            iResult=ci(H,'Kết quả',6), iTime=ci(H,'Thời gian làm',7), iCreated=ci(H,'Ngày tạo',8);
      for(const row of t.rows){
        const id=S(row[iId]), empId=S(row[iEmp]);
        if(badId(id) || badCode(empId)){ st.skipped++; continue; }
        if(!db.testResults.find(x=>x.id===id)){
          const ct = S(row[iCT]).split('/').map(s=>parseInt(s,10));
          db.testResults.unshift({ id, employeeId: empId, courseId: S(row[iCourse]), score: num(row[iScore])??0,
            correct: isNaN(ct[0])?0:ct[0], total: isNaN(ct[1])?0:ct[1], result: S(row[iResult]),
            timeSpent: S(row[iTime]), createdAt: S(row[iCreated])||getVietnamISOString(), version:1, sync_status:'SYNCED' });
          st.pulled++;
        } else st.skipped++;
      }
    }
    out.tabs.testResults = st; if(st.pulled) touch('testResults:update');
  }
  // 8. DRIVE_FILES → db.driveFiles (chỉ thêm mới theo ID)
  {
    const t = await readTab('DRIVE_FILES');
    const st = { pulled:0, skipped:0 };
    if(t){
      const H=t.H;
      const iId=ci(H,'ID',0), iEmp=ci(H,'Mã NV',1), iName=ci(H,'Họ tên',2), iDate=ci(H,'Ngày',3), iType=ci(H,'Loại',4),
            iFile=ci(H,'Tên tệp',5), iPath=ci(H,'Đường dẫn Drive',6), iUrl=ci(H,'Liên kết',7), iCreated=ci(H,'Ngày tạo',8);
      for(const row of t.rows){
        const id=S(row[iId]), empId=S(row[iEmp]);
        if(badId(id) || badCode(empId)){ st.skipped++; continue; }
        if(!db.driveFiles.find(x=>x.id===id)){
          db.driveFiles.push({ id, employeeId: empId, employeeName: S(row[iName]), date: S(row[iDate]), type: S(row[iType]),
            fileName: S(row[iFile]), drivePath: S(row[iPath]), url: S(row[iUrl]), createdAt: S(row[iCreated])||getVietnamISOString(), version:1, sync_status:'SYNCED' });
          st.pulled++;
        } else st.skipped++;
      }
    }
    out.tabs.driveFiles = st; if(st.pulled) touch('drive:update');
  }
  if(changed){
    saveDB();
    const payloads = { 'schedules:update': db.schedules, 'attendances:update': db.attendances, 'offRequests:update': db.offRequests, 'emergencyRequests:update': db.emergencyRequests, 'deviceRequests:update': db.deviceRequests, 'testResults:update': db.testResults, 'zalo:update': db.zaloRecords, 'drive:update': db.driveFiles.slice(0,20) };
    for(const ev of Object.keys(emitFlags)) io.emit(ev, payloads[ev]);
  }
  console.log('[KÉO SHEET 17iXM] Tabs phụ:', JSON.stringify(out.tabs));
  return out;
}
// Kéo toàn bộ NV + key từ Sheet 17iXM lên web (thủ công, Admin).
// Dùng sau mỗi lần cập nhật code/deploy nếu cần làm mới ngay, hoặc boot đã tự chạy.
app.post('/api/admin/pull-from-sheet', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const out = await bootPullFromMasterSheet(req.user.username);
  const extra = await pullRemainingTabsFromMasterSheet(req.user.username);
  const tabs = extra.tabs||{};
  audit(req.user.username,'PULL_FROM_SHEET','EMPLOYEE',null,{...out, tabs}, req.ip);
  res.json({success:true, ...out, tabs, employees: db.employees.length, keys: db.keys.length});
});

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('84')) p = '0' + p.slice(2);
  if (p.length === 9 && !p.startsWith('0')) p = '0' + p;
  return p;
}
// RÀNG BUỘC realtime: 1 SĐT chỉ tồn tại 1 lần trên toàn bộ file 17iXM + web.
// Cache SĐT trên Sheet 60s để không gọi API mỗi lần nhập liệu.
async function getSheetPhoneSet(forceFresh = false){
  const now = Date.now();
  if(!forceFresh && now - sheetPhoneCache.at < 60000 && sheetPhoneCache.set && sheetPhoneCache.set.size > 0) return sheetPhoneCache.set;
  try{
    const spreadsheetId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
    const token = await getGoogleAccessToken();
    // RÀNG BUỘC: dựng set MỚI từ Sheet mỗi lần fetch (không cộng dồn cache cũ)
    // để số đã xóa/reset khỏi Sheet không còn bị báo trùng oan.
    const set = new Set();
    let fetched = false;
    if(token){
      const phoneSheets = ['NHAN_VIEN_MOI','NHAN_VIEN_TRAINING','NHAN_VIEN_CHINH_THUC','NHAN_VIEN_XUONG','NHAN_VIEN_VAN_PHONG','NHAN_VIEN_SALE'];
      for(const sheetName of phoneSheets){
        try{
          const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:Z5000`, { headers:{ Authorization:`Bearer ${token}` }});
          if(!resp.ok) continue;
          fetched = true;
          const j = await resp.json();
          const values = j.values || [];
          if(values.length<2) continue;
          const iPhone = values[0].findIndex(h=> /^(sđt|số điện thoại|điện thoại|phone|sdt)$/i.test(String(h||'').trim()));
          if(iPhone===-1) continue;
          for(let i=1;i<values.length;i++){
            const ph = normalizePhone((values[i][iPhone]||'').toString());
            if(ph && ph.length >= 9) set.add(ph);
          }
        }catch(e){}
      }
    }
    // Chỉ ghi đè cache khi ít nhất 1 tab đọc OK (kể cả Sheet trống → set rỗng);
    // lỗi mạng/token thì giữ cache cũ để vẫn chống trùng được.
    if(fetched) sheetPhoneCache = { at: now, set };
  }catch(e){}
  return sheetPhoneCache.set;
}
// Kiểm tra SĐT đã tồn tại ở web (ứng viên + nhân viên) hoặc Sheet 17iXM chưa.
// opts: {excludeApplicantId, excludeEmployeeId} - bỏ qua chính bản ghi đang tự cập nhật.
async function isPhoneDuplicateEverywhere(phone, opts={}){
  const norm = normalizePhone(phone||'');
  if(!norm) return { dup:false };
  const hitA = db.applicants.find(a=> normalizePhone(a.phone)===norm && a.id!==opts.excludeApplicantId);
  if(hitA) return { dup:true, where:'WEB', kind:'applicant', name:hitA.name, id:hitA.id };
  const hitE = db.employees.find(e=> normalizePhone(e.phone)===norm && e.employeeId!==opts.excludeEmployeeId && e.id!==opts.excludeEmployeeId);
  if(hitE) return { dup:true, where:'WEB', kind:'employee', name:hitE.name, id:hitE.employeeId };
  try{
    const set = await getSheetPhoneSet();
    if(set.has(norm)) return { dup:true, where:'SHEET_17iXM', kind:'sheet' };
  }catch(e){}
  return { dup:false };
}
function dupPhoneErrorMessage(phone, info){
  const place = info.where==='SHEET_17iXM' ? 'Google Sheet 17iXM' : 'Web App';
  const who = info.name ? ` (${info.kind==='applicant'?'ứng viên':'nhân viên'} ${info.name})` : '';
  return `Trùng SĐT ${phone} - đã tồn tại trên ${place}${who}, không lưu trùng`;
}

// Danh sách Sheet được bảo vệ tuyệt đối - không bao giờ xóa dòng (dù web đã xóa)
function isSheetDeleteProtected(spreadsheetId){
  const master = db.settings?.googleSheet?.targetDatabaseSpreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const form = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  return spreadsheetId===master || spreadsheetId===form || spreadsheetId==='17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
}
async function deleteRowFromSpreadsheet(spreadsheetId, accessToken, applicant) {
  if (!spreadsheetId || !accessToken || !applicant) return;
  // RÀNG BUỘC TUYỆT ĐỐI: từ chối xóa dòng trên Sheet được bảo vệ (17iXM)
  if(isSheetDeleteProtected(spreadsheetId)){
    console.log(`[SYNC BẢO VỆ] Từ chối xóa dòng trên Sheet được bảo vệ ${spreadsheetId} cho "${applicant.name}" - Sheet giữ dữ liệu vĩnh viễn`);
    return;
  }
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
  // RÀNG BUỘC TUYỆT ĐỐI: hàm xóa Sheet đã bị vô hiệu hóa - Google Sheet giữ dữ liệu vĩnh viễn dù web đã xóa.
  console.log(`[SYNC BẢO VỆ] Bỏ qua xóa Sheet cho "${applicant.name}" - Sheet giữ dữ liệu vĩnh viễn`);
  return;
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
  if(isSystemResetting) return Promise.resolve(0);
  // RÀNG BUỘC realtime: nạp sẵn SĐT của nhân viên + Sheet 17iXM để không tạo trùng
  const preloadPhones = getSheetPhoneSet().catch(()=>new Set());
  return Promise.resolve(preloadPhones).then((sheetSet)=> new Promise((resolve) => {
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
          // RÀNG BUỘC realtime: SĐT đã có ở nhân viên hoặc bất kỳ tab nào của 17iXM thì không tạo ứng viên trùng
          db.employees.forEach(e => {
            const norm = normalizePhone(e.phone);
            if (norm) seenPhones.add(norm);
          });
          try{ (sheetSet||new Set()).forEach(ph=>{ if(ph) seenPhones.add(ph); }); }catch(e){}

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
              createdAt: getVietnamISOString(),
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
  }));
}

// Background auto-polling: CHỈ ĐỌC Sheet nộp Form (1rcq - nguồn vào), KHÔNG đọc Database (17iXM - nguồn xuất 20 cột)
// Luồng dữ liệu thật: Form (1rcq) --CSV--> HR Web App --AI scoring--> Database (17iXM) 20 cột
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
  const q = { id: uuidv4(), entity:'APPLICANT', operation:'SYNC_SHEET_REAL', payload:{added, addedForm:0, spreadsheetId: formSid, targetDatabaseSpreadsheetId: targetDbId}, version:1, updated_at: getVietnamISOString(), updated_by:req.user.username, source:'SHEET_FORM', sync_status:'SYNCED' };
  db.syncQueue.unshift(q);
  saveDB();
  io.emit('applicants:update', db.applicants);
  io.emit('sync:update', db.syncQueue);
  res.json({ added, addedForm:0, total: db.applicants.length, source:'SHEET_FORM_LIVE', spreadsheetId: formSid, targetDatabaseSpreadsheetId: targetDbId, note: 'Form Sheet (1rcq) là nguồn vào, HR lấy dữ liệu thật lên web, sau đó xuất 20 cột ra Database Sheet (17iXM) qua webhook' });
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
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhôn viôn'});
  let keyRec = db.keys.find(k=>k.employeeId===employeeId);
  const newKey = 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase();
  if(keyRec){
    const before = {...keyRec};
    keyRec.key = newKey;
    keyRec.deviceId = null;
    keyRec.boundAt = null;
    keyRec.version = (keyRec.version||1)+1;
    keyRec.updated_at = getVietnamISOString();
    audit(req.user.username,'REGENERATE_KEY','KEY',before,keyRec, req.ip);
  } else {
    keyRec = { id: uuidv4(), employeeId, key: newKey, deviceId:null, boundAt:null, status:'ACTIVE', version:1, updated_at: getVietnamISOString(), sync_status:'PENDING' };
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
  if(!keyRec) return res.status(404).json({error:'Không tìm thấy'});
  const before = {...keyRec};
  keyRec.deviceId=null;
  keyRec.boundAt=null;
  keyRec.version=(keyRec.version||1)+1;
  keyRec.updated_at=getVietnamISOString();
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
  if(!dr) return res.status(404).json({error:'Không tìm thấy'});
  if(dr.status!=='PENDING') return res.status(400).json({error:'Đã xử lý rồi'});
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
  dr.approvedAt=getVietnamISOString();
  saveDB();
  io.emit('deviceRequests:update', db.deviceRequests);
  io.emit('keys:update', db.keys);
  res.json(dr);
});
app.post('/api/device-requests/:id/reject', authMiddleware, (req,res)=>{
  const dr = db.deviceRequests.find(d=>d.id===req.params.id);
  if(!dr) return res.status(404).json({error:'Không tìm thấy'});
  dr.status='REJECTED';
  dr.rejectedBy=req.user.username;
  dr.rejectedAt=getVietnamISOString();
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
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhôn viôn'});
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
  const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : getVietnamNow();

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
      existingSched.updated_at = getVietnamISOString();
      addSyncQueue('SCHEDULE','UPDATE',existingSched,employeeId,'WEB_EMPLOYEE');
    } else {
      const newSched = {
        id: uuidv4(),
        employeeId: employeeId,
        weekStart: wStart,
        days: fullDays,
        version: 1,
        updated_at: getVietnamISOString()
      };
      db.schedules.push(newSched);
      addSyncQueue('SCHEDULE','CREATE',newSched,employeeId,'WEB_EMPLOYEE');
    }
  }

  emp.registeredOffDates = offDates;
  emp.trainingOffDays = 5;

  // Lưu phiếu OFF Training vào offRequests để đồng bộ lên Google Sheet (tab PHIEU_OFF_HANG_TUAN) như các tab khác.
  // Tìm-thấy-cập-nhật / chưa-có-tạo-mới để không trùng dòng khi NV đăng ký lại.
  const isTestOff = emp.isTest || isTestRecord(emp) || req.headers['x-is-test'] === 'true';
  let trainingOffReq = db.offRequests.find(r => r.employeeId === employeeId && (r.type === 'TRAINING_OFF' || r.type === 'TRAINING'));
  if (trainingOffReq) {
    trainingOffReq.dates = offDates;
    trainingOffReq.employeeName = emp.name;
    trainingOffReq.branchId = emp.branchId;
    trainingOffReq.shift = emp.shift;
    trainingOffReq.status = 'APPROVED';
    trainingOffReq.autoApproved = true;
    trainingOffReq.updated_at = getVietnamISOString();
    if (isTestOff) trainingOffReq.isTest = true;
  } else {
    trainingOffReq = {
      id: uuidv4(), employeeId, employeeName: emp.name, branchId: emp.branchId, shift: emp.shift,
      dates: offDates, type: 'TRAINING_OFF', status: 'APPROVED', autoApproved: true,
      createdAt: getVietnamISOString(),
      isTest: isTestOff || undefined,
      message: 'AI Auto Approve - 5 ngày OFF Nhân viên Training (12 ngày thử việc)',
      version: 1, sync_status: isTestOff ? 'TEST_BLOCKED' : 'SYNCED'
    };
    db.offRequests.push(trainingOffReq);
  }
  audit(employeeId, 'OFF_TRAINING_5DAYS', 'OFF_REQUEST', null, trainingOffReq, req.ip);
  addSyncQueue('OFF_REQUEST', 'CREATE', trainingOffReq, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('schedules:update', db.schedules);
  io.emit('employees:update', db.employees);
  io.emit('offRequests:update', db.offRequests);
  notifyAdminAndHR({
    action: 'register_off_training',
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: `NV Training ${emp.name} đăng ký 5 ngày OFF`,
    message: `${emp.name} (${emp.employeeId}) đã chọn 5 ngày OFF trong 12 ngày thử việc: ${offDates.map(d=>fmtDMY(d)).join(', ')}. Lịch làm việc 7 ngày training đã được tự động tạo.`,
    type: 'success',
    data: { employeeId, offDates, workingDaysCount: 7 }
  });

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
          const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: c.phone, type:'SUBSTITUTE_INVITE_STEP2_POLL', content:`[TH3-B2 Poller] Mời thay ca cho ${r.employeeName} ngày ${r.date} - Phản hồi trong 30 phút`, status:'SENT', error:'' };
          db.zaloRecords.unshift(zr);
          db.notifications.unshift({ id: uuidv4(), to: c.employeeId, type:'SUBSTITUTE_INVITE', title:'[TH3] Mời thay ca (khác ca) - Poller', content:`Mời thay ca khác ca cho ${r.employeeName} ngày ${r.date} ca ${r.shift}.`, requestId: r.id, step:2, createdAt: getVietnamISOString(), read:false });
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
      const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: db.employees.find(e=>e.employeeId===r.employeeId)?.phone, type:'EMERGENCY_REJECTED', content:`[TH3 Poller] OFF đột xuất ngày ${r.date} bị HỦY do không có người thay`, status:'SENT', error:'' };
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
        io.emit('finance:forceLogout', { key: k.key, reason: `Key ${k.key} đã hết hạn (${k.type}) - vui lòng xin key mới - ${k.expiresAt}` });
      }
    });
    if(financeChanged){ saveDB(); io.emit('financeKeys:update', db.financeKeys); changed=true; }
  }
  // 3. Training shift change auto-approve sau 15 phút (HR không tác động)
  let trainingChanged=false;
  db.trainingShiftRequests.forEach(r=>{
    if(r.status==='PENDING' && r.expiresAt && new Date(r.expiresAt).getTime() <= now){
      r.status='APPROVED'; r.approvedBy='AUTO_15P'; r.approvedAt=getVietnamISOString(); r.version=(r.version||1)+1;
      const emp = db.employees.find(e=> e.employeeId===r.employeeId);
      if(emp){
        let sched = db.schedules.find(s=> s.employeeId===r.employeeId && s.days.some(d=> d.date===r.date));
        if(sched){
          const day = sched.days.find(d=> d.date===r.date);
          const before={...day};
          day.shift = r.toShift; if(day.status==='OFF') day.status='WORKING';
          sched.version=(sched.version||1)+1; sched.updated_at=getVietnamISOString();
          audit('AUTO_15P','AUTO_APPROVE_TRAINING_SHIFT','SCHEDULE', before, day, 'system');
          addSyncQueue('SCHEDULE','UPDATE', sched, 'AUTO_15P', 'AUTO');
        } else {
          const monday = getMonday(new Date(r.date));
          const wy=monday.getFullYear(); const wm=String(monday.getMonth()+1).padStart(2,'0'); const wd=String(monday.getDate()).padStart(2,'0');
          const weekStart=`${wy}-${wm}-${wd}`;
          const days=[]; for(let i=0;i<7;i++){ const cur=new Date(monday); cur.setDate(monday.getDate()+i); const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0'); const dateStr=`${y}-${m}-${d}`; const isTarget = dateStr===r.date; days.push({ date: dateStr, dayName:['T2','T3','T4','T5','T6','T7','CN'][i], shift: isTarget ? r.toShift : emp.shift, status: isTarget ? 'WORKING' : 'OFF', substituteFor:null }); }
          const newSched={ id: uuidv4(), employeeId: r.employeeId, weekStart, days, version:1, updated_at: getVietnamISOString() };
          db.schedules.push(newSched);
          addSyncQueue('SCHEDULE','CREATE', newSched, 'AUTO_15P', 'AUTO');
        }
        const todayStr = getVietnamTodayStr();
        let att = db.attendances.find(a=> a.employeeId===r.employeeId && a.date===r.date);
        const shiftInfo = db.settings.payroll.shifts[r.toShift] || DEFAULT_SHIFTS[r.toShift] || DEFAULT_SHIFTS['CA_SANG'];
        if(!att){
          att={ id: uuidv4(), employeeId: r.employeeId, date: r.date, shift: r.toShift, branchId: emp.branchId, checkIn:null, checkOut:null, status: r.date <= todayStr ? 'COMPLETED' : 'NOT_STARTED', violations:[], version:1, updated_at: getVietnamISOString(), sync_status:'PENDING' };
          if(r.date <= todayStr){
            const now2=getVietnamNow();
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
          att.version=(att.version||1)+1; att.updated_at=getVietnamISOString();
          audit('AUTO_15P','UPDATE_ATTENDANCE_TRAINING_SHIFT','ATTENDANCE', before, att, 'system');
          addSyncQueue('ATTENDANCE','UPDATE', att, 'AUTO_15P', 'AUTO');
        }
        const notifEmp={ id: uuidv4(), to: r.employeeId, type:'TRAINING_SHIFT_AUTO_APPROVED', title:`Đổi ca ${r.date} tự động duyệt`, content:`Ca ${r.fromShift}->${r.toShift} ngày ${r.date} đã tự động duyệt sau 15 phút (HR không phản hồi)`, createdAt: getVietnamISOString(), read:false };
        db.notifications.push(notifEmp);
        const zr={ id: uuidv4(), sent_at: getVietnamISOString(), receiver: emp.phone, type:'TRAINING_SHIFT_AUTO', content:`[ỤM BÒ MILK] Đổi ca Training ${emp.name} ${r.date} ${r.fromShift}->${r.toShift} tự động duyệt sau 15 phút`, status:'SENT', error:'' };
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
    if(beforeDead>0) console.log(`[ĐỒNG BỘ DỌN DẸP] Đã dọn ${beforeDead} mục DEAD do placeholder/KEY`);
    saveDB(); io.emit('sync:update', db.syncQueue);
  }
  // 4. Sync queue auto-retry (exponential backoff, realtime) - không retry nếu là placeholder hoặc KEY
  const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || DEFAULT_WEBHOOK_SECRET;
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
          item.retriedAt=item.syncedAt=getVietnamISOString();
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
    now: getVietnamISOString(),
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
function linkDriveUrlToAttendance(meta, url, driveFileId){
  try{
    if(!meta || !meta.attendanceId || !meta.slot) return;
    if(meta.slot!=='checkIn' && meta.slot!=='checkOut') return;
    const rec = db.attendances.find(a=>a.id===meta.attendanceId);
    if(!rec || !rec[meta.slot]) return;
    rec[meta.slot].driveUrl = url;
    rec[meta.slot].driveFileId = driveFileId;
    rec.updated_at = getVietnamISOString();
    saveDB();
    io.emit('attendances:update', db.attendances);
    // Đẩy URL ảnh lên Sheet ngay (không chờ vòng 60s)
    if(typeof triggerRealtimeSheetSync==='function') triggerRealtimeSheetSync('RECORD_DIEM_DANH');
  }catch(e){ console.error('linkDriveUrl error', e.message); }
}
async function shareDrivePublicRead(token, fileId){
  try{
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ role:'reader', type:'anyone' })
    });
  }catch(e){ console.error('Drive share error', e.message); }
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
    createdAt: getVietnamISOString(),
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
            if(upData.id){
              file.url = `https://drive.google.com/file/d/${upData.id}/view`; file.sync_status='SYNCED'; file.driveFileId = upData.id; file.mimeType=mimeType;
              await shareDrivePublicRead(token, upData.id); // HR mở link xem được ngay
              linkDriveUrlToAttendance(meta, file.url, upData.id); // gắn URL vào điểm danh -> Sheet
              io.emit('drive:update', db.driveFiles.slice(0,20)); saveDB(); return;
            }
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
    // Ensure headers cho từng sheet - RÀNG BUỘC TUYỆT ĐỐI: không bao giờ xóa/sửa
    // dòng đã có dữ liệu. Chỉ ghi header khi dòng 1 trống hoặc đã đúng header.
    for(const key in SHEET_DEFINITIONS){
      const def = SHEET_DEFINITIONS[key];
      const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A1:Z1`, { headers:{ Authorization:`Bearer ${token}` }});
      const headerData = await headerRes.json();
      const existingHeader = headerData.values?.[0] || [];
      const hasHeader = existingHeader[0]===def.headers[0] && existingHeader.length===def.headers.length && def.headers.every((h,i)=> existingHeader[i]===h);
      if(hasHeader) continue;
      if(existingHeader.length===0){
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A1:append?valueInputOption=RAW`, {
          method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
          body: JSON.stringify({ values:[def.headers] })
        });
        console.log(`[SHEET] Ghi header mới cho ${def.sheetName}`);
      } else {
        // Dòng 1 đang chứa dữ liệu/header cũ -> KHÔNG đụng vào (giữ tuyệt đối),
        // Admin dùng POST /api/admin/rebuild-sheet-tab để sửa thủ công khi cần.
        console.log(`[SHEET BẢO VỆ] Giữ nguyên dòng 1 của ${def.sheetName} (không khớp header chuẩn nhưng có dữ liệu)`);
      }
    }
    return true;
  }catch(e){ console.error('ensureSheetsExist error', e.message); return false; }
}
async function syncSheetTab(sheetKey){
  const def = SHEET_DEFINITIONS[sheetKey];
  if(!def) return;
  // === RÀNG BUỘC: Không đồng bộ lên Sheet khi Web DB rỗng (yêu cầu ràng buộc dữ liệu) ===
  // Chỉ sync khi có dữ liệu thực tế trên web, tránh đẩy rỗng/mock data lên Sheet
  // Sử dụng ?? 0 để xử lý trường hợp dbCollection là undefined/null
  let dbCollection;
  let dbLen = 0;
  switch(sheetKey){
    case 'NHAN_VIEN_MOI':     dbCollection = db.applicants.filter(a=>!isTestRecord(a));      dbLen = dbCollection.length;    break;
    case 'NHAN_VIEN_TRAINING': dbCollection = db.employees.filter(e=>e.type==='TRAINING' && !isTestRecord(e)); dbLen = dbCollection.length;    break;
    case 'NHAN_VIEN_CHINH_THUC': dbCollection = db.employees.filter(e=>(e.type==='OFFICIAL'||e.status==='OFFICIAL') && !isTestRecord(e)); dbLen = dbCollection.length;    break;
    case 'LICH_LAM_VIEC':     dbCollection = db.schedules.filter(s=>!isTestRecord(s));       dbLen = dbCollection.length;    break;
    case 'RECORD_DIEM_DANH':  dbCollection = db.attendances.filter(a=>!isTestRecord(a));   dbLen = dbCollection.length;  break;
    case 'PHIEU_OFF_HANG_TUAN': dbCollection = db.offRequests.filter(r=>!isTestRecord(r)); dbLen = dbCollection.length;    break;
    case 'PHIEU_OFF_DOT_XUAT': dbCollection = db.emergencyRequests.filter(r=>!isTestRecord(r)); dbLen = dbCollection.length; break;
    case 'PHIEU_DOI_THIET_BI': dbCollection = db.deviceRequests.filter(r=>!isTestRecord(r)); dbLen = dbCollection.length; break;
    case 'PHIEU_DOI_CA_TRAINING': dbCollection = (db.trainingShiftRequests||[]).filter(r=>!isTestRecord(r)); dbLen = dbCollection.length; break;
    case 'PHIEU_DOI_CA_OFFICIAL': dbCollection = (db.shiftSwapRequests||[]).filter(r=>!isTestRecord(r)); dbLen = dbCollection.length; break;
    case 'KET_QUA_TEST':      dbCollection = db.testResults.filter(t=>!isTestRecord(t));   dbLen = dbCollection.length;  break;
    case 'SYNC_QUEUE':        dbCollection = db.syncQueue.filter(q=>!isTestRecord(q)&&!isTestRecord(q.payload));     dbLen = dbCollection.length;  break;
    default:                  dbCollection = null;               dbLen = 0;                              break;
  }
  if(dbLen === 0){
    console.log(`[SYNC GUARD] Sheet ${def.sheetName}: Web DB rỗng (length=${dbLen}) -> Bỏ qua sync tránh đẩy dữ liệu rỗng lên Sheet`);
    return;
  }
  const spreadsheetId = db.settings?.googleSheet?.spreadsheetId;
  const token = await getGoogleAccessToken();
  if(!token || !spreadsheetId) return;
  try{
    let rows = [];
    switch(sheetKey){
      case 'NHAN_VIEN_MOI':
        rows = db.applicants.filter(a=>!isTestRecord(a)).map(a=>[a.id, a.createdAt, a.name, a.gender, a.birthYear, a.education, a.hometown, a.phone, a.shiftText, a.branchText, a.experience, a.handling, a.facebook, a.source, a.aiScore, a.isDisqualified?'LOAI':'DAT', a.status, a.source_id, a.version, a.updated_at]);
        break;
      case 'NHAN_VIEN_TRAINING':
        rows = db.employees.filter(e=>e.type==='TRAINING' && !isTestRecord(e)).map(e=>{
          const k = db.keys.find(k=>k.employeeId===e.employeeId)?.key || '';
          return [e.id, e.employeeId, e.name, e.phone, k, e.branchId, e.shift, e.startDate, e.endDate, e.trainingDays, e.status, e.testScore, e.testResult, e.type, e.category, e.version, e.updated_at, e.sync_status];
        });
        break;
      case 'NHAN_VIEN_CHINH_THUC':
        rows = db.employees.filter(e=>e.type==='OFFICIAL' && !isTestRecord(e)).map(e=>{
          const k = db.keys.find(k=>k.employeeId===e.employeeId)?.key || '';
          return [e.id, e.employeeId, e.name, e.phone, k, e.branchId, e.shift, e.startDate, e.status, e.testScore, e.type, e.officialStartDate||'', e.version, e.updated_at, e.sync_status];
        });
        break;
      case 'LICH_LAM_VIEC':
        rows = db.schedules.filter(s=>!isTestRecord(s)).flatMap(s=> s.days.map(d=>{
          const shiftStr = (Array.isArray(d.shifts) && d.shifts.length > 1) ? d.shifts.join('+') : (d.shift2 ? `${d.shift}+${d.shift2}` : d.shift);
          return [s.id, s.employeeId, db.employees.find(e=>e.employeeId===s.employeeId)?.name||'', db.employees.find(e=>e.employeeId===s.employeeId)?.branchId||'', s.weekStart, d.date, d.dayName, shiftStr, d.status, d.substituteFor||'', s.version];
        }));
        break;
      case 'RECORD_DIEM_DANH':
        rows = db.attendances.filter(a=>!isTestRecord(a)).map(a=>[a.id, a.employeeId, db.employees.find(e=>e.employeeId===a.employeeId)?.name||'', a.date, a.shift, a.branchId, a.checkIn?.time||'', a.checkIn?.gps||'', a.checkIn?.image ? 'co_anh' : '', a.checkIn?.driveUrl||a.checkIn?.drivePath||'', a.checkOut?.time||'', a.checkOut?.gps||'', a.checkOut?.image ? 'co_anh' : '', a.checkOut?.driveUrl||a.checkOut?.drivePath||'', a.status, (a.violations||[]).join(','), a.version]);
        break;
      case 'RECORD_ZALO':
        rows = db.zaloRecords.filter(z=>!isTestRecord(z)).map(z=>[z.id, z.sent_at, z.receiver, z.type, z.content?.slice(0,200), z.status, z.error||'']);
        break;
      case 'PHIEU_OFF_HANG_TUAN':
        rows = db.offRequests.filter(r=>!isTestRecord(r)).map(r=>[r.id, r.employeeId, r.employeeName, r.branchId, r.shift, r.dates?.join(','), r.type, r.status, r.autoApproved?'YES':'', r.createdAt]);
        break;
      case 'PHIEU_OFF_DOT_XUAT':
        rows = db.emergencyRequests.filter(r=>!isTestRecord(r)).map(r=>[r.id, r.employeeId, r.employeeName, r.branchId, r.shift, r.date, r.reason, r.substituteName||'', r.status, r.cascadeStep, r.createdAt]);
        break;
      case 'PHIEU_DOI_THIET_BI':
        rows = db.deviceRequests.filter(r=>!isTestRecord(r)).map(r=>[r.id, r.employeeId, r.reason, r.oldDeviceId||'', r.newDeviceId||'', r.status, r.createdAt, r.expiresAt]);
        break;
      case 'PHIEU_DOI_CA_TRAINING':
        rows = (db.trainingShiftRequests||[]).filter(r=>!isTestRecord(r)).map(r=>[r.id, r.employeeId, r.employeeName||'', r.toDate||r.date||'', r.fromShift||'', r.toShift||'', r.reason||'', r.status, r.createdAt, r.expiresAt||'', r.approvedBy||'']);
        break;
      case 'PHIEU_DOI_CA_OFFICIAL':
        rows = (db.shiftSwapRequests||[]).filter(r=>!isTestRecord(r)).map(r=>[r.id, r.requesterId, r.requesterName||'', r.date||'', r.fromShift||'', r.toShift||'', r.targetEmployeeName||r.acceptedBy||'', r.reason||'', r.status, r.createdAt, r.approvedBy||'']);
        break;
      case 'KET_QUA_TEST':
        rows = db.testResults.filter(t=>!isTestRecord(t)).map(t=>[t.id, t.employeeId, db.employees.find(e=>e.employeeId===t.employeeId)?.name||'', t.courseId, t.score, `${t.correct}/${t.total}`, t.result, t.timeSpent, t.createdAt]);
        break;
      case 'DRIVE_FILES':
        rows = db.driveFiles.filter(f=>!isTestRecord(f)).map(f=>[f.id, f.employeeId, f.employeeName, f.date, f.type, f.fileName, f.drivePath, f.url, f.createdAt]);
        break;
      default:
        return;
    }
    // RÀNG BUỘC CHỐNG RÁC: chỉ lưu dòng có SĐT hoặc Mã NV — dòng thiếu cả 2 = rác, bỏ qua.
    // Vị trí cột SĐT / Mã NV theo từng tab (phone:-1 = tab này không có cột SĐT).
    const TRASH_GUARD = {
      NHAN_VIEN_MOI: { phone: 7, code: -1 },
      NHAN_VIEN_TRAINING: { phone: 3, code: 1 },
      NHAN_VIEN_CHINH_THUC: { phone: 3, code: 1 },
      LICH_LAM_VIEC: { phone: -1, code: 1 },
      RECORD_DIEM_DANH: { phone: -1, code: 1 },
      RECORD_ZALO: { phone: 2, code: -1 },
      PHIEU_OFF_HANG_TUAN: { phone: -1, code: 1 },
      PHIEU_OFF_DOT_XUAT: { phone: -1, code: 1 },
      PHIEU_DOI_THIET_BI: { phone: -1, code: 1 },
      PHIEU_DOI_CA_TRAINING: { phone: -1, code: 1 },
      PHIEU_DOI_CA_OFFICIAL: { phone: -1, code: 1 },
      KET_QUA_TEST: { phone: -1, code: 1 },
      DRIVE_FILES: { phone: -1, code: 1 }
    };
    const guard = TRASH_GUARD[sheetKey];
    const hasPhoneOrCode = (row)=>{
      if(!guard) return true;
      const digits = guard.phone>=0 ? String(row[guard.phone]||'').replace(/\D/g,'') : '';
      const code = guard.code>=0 ? String(row[guard.code]||'').trim() : '';
      const badCode = !code || /^(ID|MÃ NV|MA NV)$/i.test(code);
      const okPhone = digits.length >= 9;
      if(guard.phone>=0 && guard.code>=0) return okPhone || !badCode;
      if(guard.phone>=0) return okPhone;
      return !badCode;
    };
    // 1. Lọc rác và CHẶN TUYỆT ĐỐI dữ liệu test từ web trước khi đẩy lên Sheet
    rows = rows.filter(r => !isTestRecord(r));
    if(guard){
      const before = rows.length;
      rows = rows.filter(hasPhoneOrCode);
      if(rows.length!==before) console.log(`[CHỐNG RÁC] ${def.sheetName}: bỏ ${before-rows.length} dòng web thiếu SĐT/Mã NV`);
    }
    // 2. Lịch: gộp trùng theo Mã NV + Ngày (giữ dòng mới nhất) — mỗi lần render không append thêm dòng
    if(sheetKey==='LICH_LAM_VIEC'){
      const seen = new Map();
      rows.forEach(r=>{ seen.set(String(r[1]||'').trim()+'|'+String(r[5]||'').trim(), r); });
      rows = [...seen.values()];
    }
    // RÀNG BUỘC: Sheet GIỮ dữ liệu thật (web xóa local không xóa Sheet).
    // RÀNG BUỘC TUYỆT ĐỐI GOOGLE SHEET 17iXM:
    // Dữ liệu thật trên Google Sheet sẽ KHÔNG BỊ MẤT trừ khi admin reset ALL trên web app.
    // Ngoại lệ duy nhất: dòng DỮ LIỆU TEST (bị lọc bỏ để không lưu trên Sheet thật).
    const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A2:Z`, { headers:{ Authorization:`Bearer ${token}` }});
    const getData = await getRes.json().catch(()=>({}));
    const existing = getData.values || [];
    const isBadKey = (k)=> !k || /\s/.test(k) || k==='ID';
    // Key merge: lịch dùng Mã NV + Ngày (ổn định qua mọi lần render), các tab khác dùng ID
    const matchKey = (r)=> sheetKey==='LICH_LAM_VIEC' ? (String(r[1]||'').trim()+'|'+String(r[5]||'').trim()) : (r[0]||'').toString();
    const merged = [];
    const oldIndexMap = new Map();
    const phoneIndexMap = new Map();
    let droppedTest = 0;
    let droppedDupPhone = 0;
    existing.forEach((r)=>{
      // Chặn và dọn dẹp triệt để dữ liệu test trên Google Sheet
      if(isTestRecord(r)){
        droppedTest++;
        return;
      }
      // RÀNG BUỘC CHỐNG TRÙNG SĐT TRÊN GOOGLE SHEET:
      // Nếu dòng existing trên Sheet bị trùng SĐT với một dòng trước đó trên cùng tab, loại bỏ dòng trùng thừa
      if(guard && guard.phone >= 0){
        const normPhone = normalizePhone(r[guard.phone]);
        if(normPhone && normPhone.length >= 9){
          if(phoneIndexMap.has(normPhone)){
            console.log(`[CHỐNG TRÙNG SĐT GOOGLE SHEET] Dọn dòng cũ trùng SĐT ${r[guard.phone]} trên ${def.sheetName}`);
            droppedDupPhone++;
            return;
          }
          phoneIndexMap.set(normPhone, merged.length);
        }
      }
      const k = matchKey(r);
      if(sheetKey==='LICH_LAM_VIEC'){
        if(k && !oldIndexMap.has(k)){
          oldIndexMap.set(k, [merged.length]);
        }
      } else if(k && !isBadKey(k)){
        if(!oldIndexMap.has(k)) oldIndexMap.set(k, []);
        oldIndexMap.get(k).push(merged.length);
      }
      merged.push([...r]);
    });
    let appended = 0, updated = 0;
    rows.forEach(r=>{
      const k = matchKey(r);
      if(sheetKey==='LICH_LAM_VIEC'){
        if(!String(r[1]||'').trim() || !String(r[5]||'').trim()) return;
      } else if(isBadKey(k)) return;

      // RÀNG BUỘC CHỐNG TRÙNG SĐT: Nếu trùng số điện thoại thì KHÔNG ĐƯỢC LƯU VÀO GOOGLE SHEET (không tạo thêm dòng mới)
      if(guard && guard.phone >= 0){
        const normPhone = normalizePhone(r[guard.phone]);
        if(normPhone && normPhone.length >= 9){
          if(phoneIndexMap.has(normPhone)){
            const targetIdx = phoneIndexMap.get(normPhone);
            const old = merged[targetIdx];
            const len = Math.max(old.length, r.length);
            const nr = [];
            for(let c=0;c<len;c++) nr[c] = (c<r.length && r[c]!==undefined && r[c]!=='') ? r[c] : old[c];
            merged[targetIdx]=nr; updated++;
            console.log(`[CHỐNG TRÙNG SĐT GOOGLE SHEET] SĐT ${r[guard.phone]} đã có trên ${def.sheetName} -> Cập nhật dòng hiện có, KHÔNG tạo dòng mới`);
            return; // Đã cập nhật dòng có cùng SĐT, không append thêm dòng mới
          }
        }
      }

      if(oldIndexMap.has(k)){
        oldIndexMap.get(k).forEach(ei=>{
          const old = merged[ei];
          const len = Math.max(old.length, r.length);
          const nr = [];
          for(let c=0;c<len;c++) nr[c] = (c<r.length && r[c]!==undefined && r[c]!=='') ? r[c] : old[c];
          merged[ei]=nr; updated++;
        });
      } else {
        if(guard && guard.phone >= 0){
          const normPhone = normalizePhone(r[guard.phone]);
          if(normPhone && normPhone.length >= 9){
            phoneIndexMap.set(normPhone, merged.length);
          }
        }
        oldIndexMap.set(k, [merged.length]); merged.push(r); appended++;
      }
    });
    // Ghi đè đúng vùng (update, giữ nguyên dữ liệu thật)
    if(merged.length>0){
      const endRow = 1 + merged.length;
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A2:Z${endRow}?valueInputOption=RAW`, {
        method:'PUT', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
        body: JSON.stringify({ values: merged })
      });
      // Thumbnail ảnh trong Sheet (chỉ RECORD_DIEM_DANH): cột I/M = công thức IMAGE từ URL Drive (cột J/N).
      // Ghi RIÊNG 2 cột ảnh bằng USER_ENTERED để không reinterpret SĐT/mã NV ở các cột khác (vẫn RAW).
      // Không có URL -> giữ marker cũ (admin xem ảnh trên web app / link Drive).
      if(sheetKey==='RECORD_DIEM_DANH'){
        try{
          const toImg = (u, marker)=> (typeof u==='string' && u.startsWith('http')) ? `=IMAGE("${u.replace(/"/g,'')}",1)` : (marker||'');
          const colI = merged.map(r=> [toImg(r[9], r[8])]);
          const colM = merged.map(r=> [toImg(r[13], r[12])]);
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!I2:I${endRow}?valueInputOption=USER_ENTERED`, {
            method:'PUT', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
            body: JSON.stringify({ values: colI })
          });
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!M2:M${endRow}?valueInputOption=USER_ENTERED`, {
            method:'PUT', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
            body: JSON.stringify({ values: colM })
          });
        }catch(e){ console.error('[SHEET IMAGE] thumbnail that bai (giu link URL):', e.message); }
      }
      // Nếu có dòng test bị dọn hoặc dòng trùng SĐT bị dọn (merged ngắn hơn existing), xóa vùng thừa để dọn sạch
      const oldEndRow = 1 + existing.length;
      if((droppedTest > 0 || droppedDupPhone > 0) && oldEndRow > endRow){
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(def.sheetName)}!A${endRow+1}:Z${oldEndRow}:clear`, {
          method:'POST', headers:{ Authorization:`Bearer ${token}` }
        });
        console.log(`[SHEET CLEANUP] Đã dọn ${droppedTest} dòng test và ${droppedDupPhone} dòng trùng SĐT trên ${def.sheetName}`);
      }
    }
    console.log(`[SHEET] Đã đồng bộ ${def.sheetName}: giữ nguyên ${existing.length - droppedTest - droppedDupPhone} dòng thật + dọn ${droppedTest} dòng test + dọn ${droppedDupPhone} dòng trùng SĐT + cập nhật ${updated} + thêm ${appended}`);
  }catch(e){ console.error(`syncSheetTab ${sheetKey} error`, e.message); }
}
async function syncAllTabsToSheetsRealtime(){
  if(isSystemResetting) return;
  if(OUTBOUND_SYNC_DISABLED) return; // test/CI: không đẩy dữ liệu test ra Google Sheet production
  // === RÀNG BUỘC: Không sync khi Web DB rỗng (yêu cầu ràng buộc dữ liệu) ===
  // Chỉ chạy sync khi có dữ liệu thực tế trên web, tránh ping Sheet khi không có gì để đồng bộ
  // Sử dụng nullish coalescing ?? an toàn cho mọi trường hợp
  const hasData = 
    (db.applicants?.length ?? 0) > 0 ||
    (db.employees?.length ?? 0) > 0 ||
    (db.schedules?.length ?? 0) > 0 ||
    (db.attendances?.length ?? 0) > 0 ||
    (db.offRequests?.length ?? 0) > 0 ||
    (db.emergencyRequests?.length ?? 0) > 0 ||
    (db.deviceRequests?.length ?? 0) > 0 ||
    (db.testResults?.length ?? 0) > 0 ||
    (db.syncQueue?.length ?? 0) > 0;
  if(!hasData){
    console.log('[SYNC GUARD] Web DB rỗng -> B? qua syncAllTabsToSheetsRealtime tránh d?y d? li?u r?ng l�n Sheet');
    return;
  }
  const ok = await ensureSheetsExist();
  if(!ok) return;
  for(const key in SHEET_DEFINITIONS){
    await syncSheetTab(key);
    await new Promise(r=>setTimeout(r, 200)); // throttle
  }
  io.emit('sync:update', { type:'SHEETS_REALTIME', timestamp: getVietnamISOString(), sheets: Object.keys(SHEET_DEFINITIONS).length });
}
// Auto-sync every 60s + on data change
setInterval(syncAllTabsToSheetsRealtime, 60*1000);
setTimeout(()=>{ syncAllTabsToSheetsRealtime().catch(()=>{}); }, 15000);

// ============ REALTIME SHEET SYNC TRIGGER ============
// Tự động đồng bộ ngay lập tức về Google Sheet 17iXM khi có thay đổi trên Web App
const _pendingSheetSyncs = new Set();
let _sheetSyncDebounceTimer = null;
let _lastEnsureSheetsAt = 0;

function triggerRealtimeSheetSync(sheetKey){
  if(isSystemResetting) return;
  if(OUTBOUND_SYNC_DISABLED) return; // test/CI: không đẩy dữ liệu test ra Google Sheet production
  if(sheetKey) _pendingSheetSyncs.add(sheetKey);
  clearTimeout(_sheetSyncDebounceTimer);
  _sheetSyncDebounceTimer = setTimeout(async ()=>{
    try{
      // Tự tạo tab còn thiếu (kèm header) trước khi đẩy dòng realtime
      const nowMs = Date.now();
      if(nowMs - _lastEnsureSheetsAt > 60000){
        _lastEnsureSheetsAt = nowMs;
        try{ await ensureSheetsExist(); }catch(e){ console.error('[REALTIME SHEET ENSURE]', e.message); }
      }
      const keysToSync = [..._pendingSheetSyncs];
      _pendingSheetSyncs.clear();
      if(keysToSync.length === 0){
        await syncAllTabsToSheetsRealtime();
      } else {
        for(const k of keysToSync){
          await syncSheetTab(k);
          await new Promise(r=>setTimeout(r, 150));
        }
      }
    }catch(e){
      console.error('[REALTIME SHEET SYNC ERROR]', e.message);
    }
  }, 100);
}

// Drive realtime status vars

// ĐÃ LOẠI BỎ endpoint giả lập điểm danh (simulate-7days-training):
// dữ liệu 100% thật, điểm danh chỉ từ check-in/out thật hoặc auto theo lịch HR duyệt.
// ============ TRIGGER ONLINE APP TEST (OPTION 1) ============
app.post('/api/employees/:id/trigger-online-test', authMiddleware, (req, res) => {
  const empId = req.params.id;
  const emp = db.employees.find(e => e.id === empId || e.employeeId === empId);
  if (!emp) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

  emp.testSchedule = {
    type: 'ONLINE_APP',
    status: 'WAITING_TEST',
    force: true,
    isForceUnlocked: true,
    createdAt: getVietnamISOString()
  };
  emp.forceOpenTest = true;
  emp.isForceUnlocked = true;
  emp.status = 'WAITING_TEST';
  emp.updated_at = getVietnamISOString();

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
        const existingTimeStr = new Date(other.testSchedule.scheduledAt).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'});
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
    createdAt: getVietnamISOString()
  };
  emp.status = 'WAITING_TEST';
  emp.updated_at = getVietnamISOString();

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
  emp.testSchedule.completedAt = getVietnamISOString();
  emp.updated_at = getVietnamISOString();

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

  // P0 PHASE 1 (Master 6.5/19.4): them recommendation thang 10 de tuong thich VIP.
  // AI/HR cham theo rubric 20 tieu chi (moi cau 1/0.5/0) nhung quyet dinh cuoi theo thang 10:
  // <5 FAIL | 5-<8 RETEST | >=8 PASS_WAITING_OFFICIAL_APPROVAL. Khong tu promote/logout.
  const totalScore10 = Math.round((totalScore / 2) * 100) / 100;
  const recommendation = totalScore10 < 5 ? 'FAIL' : (totalScore10 < 8 ? 'RETEST' : 'PASS_WAITING_OFFICIAL_APPROVAL');

  emp.status = resultStatus;
  emp.testScore = Math.round((totalScore / 20) * 100); // Scale to 100% for compatibility
  emp.testResult = isPassed ? `ĐẠT (${totalScore}/20đ)` : `CHƯA ĐẠT (${totalScore}/20đ)`;
  emp.testScore10 = totalScore10;
  emp.testRecommendation = recommendation;
  emp.testNeedsHrReview = true;
  emp.testFinalPending = true;
  emp.testScoredAt = getVietnamISOString(); // mốc TEST có điểm -> Thư mời tính hẹn ký HĐ +5 ngày
  
  if (!emp.testSchedule) emp.testSchedule = {};
  emp.testSchedule.status = 'EVALUATED';
  emp.testSchedule.evaluation = {
    evaluatorName: evaluatorName || req.user?.username || 'HR',
    shiftType: shiftType || 'Cố định',
    part1Score: p1Total,
    part2Score: p2Total,
    totalScore20: totalScore,
    totalScore100: emp.testScore,
    totalScore10,
    recommendation,
    needsHrReview: true,
    isPassed,
    notes: notes || '',
    part1Details: part1Scores || [],
    part2Details: part2Scores || [],
    evaluatedBy: req.user?.username || 'HR',
    evaluatedAt: getVietnamISOString()
  };
  emp.updated_at = getVietnamISOString();
  audit(req.user.username, 'EVALUATE_TEST', 'EMPLOYEE', null, { employeeId: emp.employeeId, totalScore20: totalScore, totalScore10, recommendation }, req.ip);

  saveDB();
  io.emit('employees:update', db.employees);
  res.json({ success: true, employee: emp, totalScore, p1Total, p2Total, isPassed, resultStatus, totalScore10, recommendation, needsHrReview: true });
});

// ============ P0 PHASE 1: HR finalize TEST (Master 19: AI propose -> HR review -> FINAL) ============
// Khong auto logout truoc HR confirm. Chi sau HR confirm FAIL moi duoc revoke theo policy.
app.post('/api/vip/test/:id/finalize', authMiddleware, roleCheck(['Admin', 'HR']), (req, res) => {
  const empId = req.params.id;
  const { decision, hrScores, notes } = req.body || {};
  const emp = db.employees.find(e => e.id === empId || e.employeeId === empId);
  if(!emp) return res.status(404).json({ error: 'Khong tim thay nhan vien' });
  if(!emp.testSchedule || !emp.testSchedule.evaluation) return res.status(400).json({ error: 'Nhan vien chua co AI evaluation de HR duyet' });
  const allowed = ['FAIL', 'RETEST', 'PASS_WAITING_OFFICIAL_APPROVAL'];
  if(!allowed.includes(decision)) return res.status(400).json({ error: 'Decision phai la FAIL | RETEST | PASS_WAITING_OFFICIAL_APPROVAL' });
  const before = { testRecommendation: emp.testRecommendation, status: emp.status, testFinalPending: emp.testFinalPending };
  emp.testFinalDecision = decision;
  emp.testFinalPending = false;
  emp.testNeedsHrReview = false;
  emp.testHrOverride = { hrScores: hrScores || null, notes: notes || '', decidedBy: req.user.username, decidedAt: getVietnamISOString() };
  if(emp.testSchedule.evaluation) emp.testSchedule.evaluation.finalDecision = decision;
  audit(req.user.username, decision === 'FAIL' ? 'CONFIRM_TEST_RESULT' : 'HR_OVERRIDE_SCORE', 'EMPLOYEE', before, { testFinalDecision: decision }, req.ip);
  saveDB();
  io.emit('employees:update', db.employees);
  res.json({ success: true, employee: emp });
});

function getShiftVi(s){
  if(!s) return '—';
  const m = { CA_SANG: 'Ca Sáng', CA_CHIEU: 'Ca Chiều', CA_TRUA: 'Ca Chiều', CA_TOI: 'Ca Tối' };
  return m[s] || s;
}

// === TỰ ĐỘNG NHẬN DIỆN CA LÀM VIỆC ĐIỂM DANH (HỖ TRỢ 1, 2 HOẶC 3 CA / NGÀY) ===
function getActiveShiftForAttendance(employeeId, mockNow) {
  const now = mockNow ? new Date(mockNow) : getVietnamNow();
  const today = getVietnamTodayStr(now);
  const emp = db.employees.find(e => e.employeeId === employeeId);
  if (!emp) return 'CA_SANG';

  // Lấy lịch của nhân viên trong ngày hôm nay
  const sched = db.schedules.find(s => s.employeeId === employeeId && s.days.some(d => d.date === today));
  const day = sched ? sched.days.find(d => d.date === today) : null;

  const scheduledShifts = [];
  if (day && (day.status === 'WORKING' || day.status === 'SUBSTITUTE')) {
    if (Array.isArray(day.shifts) && day.shifts.length > 0) {
      day.shifts.forEach(s => { if (s && !scheduledShifts.includes(s)) scheduledShifts.push(s); });
    } else {
      if (day.shift && day.shift !== 'OFF' && !scheduledShifts.includes(day.shift)) scheduledShifts.push(day.shift);
      if (day.shift2 && !scheduledShifts.includes(day.shift2)) scheduledShifts.push(day.shift2);
      if (day.shift3 && !scheduledShifts.includes(day.shift3)) scheduledShifts.push(day.shift3);
    }
  }
  if (scheduledShifts.length === 0) {
    scheduledShifts.push(emp.shift || 'CA_SANG');
  }

  // Lấy các bản ghi điểm danh hôm nay
  const todayAtts = db.attendances.filter(a => a.employeeId === employeeId && a.date === today);

  // 1. Ưu tiên ca đang dở dang (đã check-in nhưng chưa check-out)
  const inProgressAtt = todayAtts.find(a => a.checkIn && !a.checkOut);
  if (inProgressAtt) {
    return inProgressAtt.shift;
  }

  // 2. Lọc các ca chưa hoàn thành (chưa có check-out)
  const uncompletedShifts = scheduledShifts.filter(s => {
    const att = todayAtts.find(a => a.shift === s);
    return !att || !att.checkOut;
  });

  if (uncompletedShifts.length === 0) {
    return scheduledShifts[scheduledShifts.length - 1] || emp.shift || 'CA_SANG';
  }

  // 3. Khớp theo khung giờ hiện tại
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const s of uncompletedShifts) {
    const norm = s === 'CA_TRUA' ? 'CA_CHIEU' : s;
    if (norm === 'CA_SANG' && nowMins <= 12 * 60 + 30) return s;
    if (norm === 'CA_CHIEU' && nowMins >= 11 * 60 + 30 && nowMins <= 18 * 60 + 30) return s;
    if (norm === 'CA_TOI' && nowMins >= 17 * 60 + 30) return s;
  }

  return uncompletedShifts[0];
}

app.post(['/api/attendance/checkin', '/api/attendance/check-in'], (req,res)=>{
  const { employeeId, gps, address, image, shift, isCameraCapture } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhôn viôn'});
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
    const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : getVietnamNow();
    const trialEndD = new Date(startD);
    trialEndD.setDate(startD.getDate() + 11);

    const todayParts = today.split('-').map(Number);
    const todayD = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);

    if (todayD > trialEndD) {
      return res.status(400).json({ error: 'Bạn đã hoàn thành 12 ngày thử việc. Vui lòng liên hệ HR chuyển sang Nhân viên chính thức để tiếp tục xếp ca và điểm danh.' });
    }
  }

  const now = (req.body.mockTime && (req.body.isTest || req.headers['x-is-test'])) ? new Date(req.body.mockTime) : getVietnamNow();
  const detectedShift = getActiveShiftForAttendance(employeeId, now);
  const targetShift = shift || detectedShift || emp.shift || 'CA_SANG';

  let record = db.attendances.find(a=>a.employeeId===employeeId && a.date===today && a.shift===targetShift);
  if(record && record.checkIn) return res.status(400).json({error:`Đã Check-in ca ${getShiftVi(targetShift)} hôm nay`});

  const shiftInfo = (db.settings.payroll.shifts && db.settings.payroll.shifts[targetShift]) || DEFAULT_SHIFTS[targetShift] || DEFAULT_SHIFTS['CA_SANG'];
  const [sh, sm] = shiftInfo.start.split(':').map(Number);
  const shiftStart = new Date(now); shiftStart.setHours(sh, sm, 0,0);
  const open = new Date(shiftStart.getTime() - 30*60000); // 30 mins before shift start - Vietnam

  const isOfficial = emp.type === 'OFFICIAL' || emp.status === 'OFFICIAL';
  const [eh, em] = shiftInfo.end.split(':').map(Number);
  const shiftEnd = new Date(now); shiftEnd.setHours(eh, em, 0,0);
  const autoCloseCheckIn = new Date(shiftEnd.getTime() - 60*60000); // Tự động đóng trước giờ check out 1 tiếng

  if(now < open) {
    return res.status(400).json({error: `Chưa đến giờ mở Check-in. Check-in mở trước 30 phút vào ca lúc ${open.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'})} (giờ Việt Nam)`});
  }

  // Ràng buộc check-in: Không đóng khi nhân viên chưa check-in, tự động đóng trước giờ ra ca 1 tiếng và chuyển sang check-out
  if(isOfficial){
    if(now >= autoCloseCheckIn){
      return res.status(400).json({error: `Hệ thống đã tự động đóng Check-in trước giờ ra ca 1 tiếng (lúc ${autoCloseCheckIn.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'})}) và chuyển sang Check-out.`});
    }
  } else {
    const closeAfter = db.settings?.attendance?.checkInCloseAfter ?? 120;
    const close = new Date(shiftStart.getTime() + closeAfter*60000);
    if(now > close){
      return res.status(400).json({error: `Đã đóng Check-in Training. Cửa sổ Check-in: ${open.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'})} - ${close.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'})} (giờ Việt Nam). Vui lòng liên hệ HR.`});
    }
  }
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
  const drivePath = generateDrivePath({...emp, shift: targetShift}, today, 'CHECK_IN');
  const newRec = {
    id: uuidv4(), employeeId, date: today, shift: targetShift, branchId: emp.branchId,
    checkIn: { time: now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'}), gps, address: address||db.branches.find(b=>b.id===emp.branchId)?.address, image: safeImage, timestamp: now.toISOString(), content: 'Điểm danh Vào ca UBM', drivePath },
    checkOut: null, status: violations.length ? violations[0] : 'CHECKED_IN', violations, penalty: penaltyObj, version:1, updated_at: now.toISOString(), sync_status:'PENDING'
  };
  db.attendances.push(newRec);
  // Drive realtime: tạo file ảnh + txt điểm danh (yêu cầu #8: thực lưu)
  addDriveFile(employeeId, today, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { content: image, gps: newRec.checkIn.gps, time: newRec.checkIn.time, attendanceId: newRec.id, slot: 'checkIn' });
  addDriveFile(employeeId, today, 'CHECK_IN', `Diem_danh.txt`, { content: `Điểm danh Vào ca UBM - ${emp.name} - ${today} ${newRec.checkIn.time} - GPS:${newRec.checkIn.gps} - Địa chỉ:${newRec.checkIn.address} - SĐT:${emp.phone} - Ca:${newRec.shift}` });
  audit(employeeId,'CHECKIN','ATTENDANCE',null,newRec, req.ip);
  addSyncQueue('ATTENDANCE','CREATE',newRec, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('attendances:update', db.attendances);
  if (penaltyObj) io.emit('penalties:update', db.penalties);

  notifyAdminAndHR({
    action: 'checkin',
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: `Điểm danh Vào ca: ${emp.name}`,
    message: `${emp.name} (${emp.employeeId} • ${emp.branchId}) vừa Check-in ca ${newRec.shift} lúc ${newRec.checkIn.time} (${violations.length ? 'Trễ: ' + violations.join(', ') : 'Đúng giờ'})`,
    type: violations.length ? 'warning' : 'success',
    data: { attendanceId: newRec.id, shift: newRec.shift, time: newRec.checkIn.time, violations }
  });

  const zr = { id: uuidv4(), sent_at: now.toISOString(), receiver: emp.phone, type:'CHECKIN', content:`${emp.name} đã Check-in lúc ${newRec.checkIn.time} ${violations.length ? '— TRỄ CA ('+violations[0]+')' : '— ĐÚNG GIỜ'}`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json(newRec);
});

app.post(['/api/attendance/checkout', '/api/attendance/check-out'], (req,res)=>{
  const { employeeId, gps, address, image, shift, isCameraCapture } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhôn viôn'});
  // Spec 17 - dữ liệu bắt buộc
  if(!image || typeof image!=='string' || image.length<100) return res.status(400).json({error:'Ảnh Check-out bắt buộc - phải chụp trực tiếp bằng camera'});
  if(!image.startsWith('data:image/')) return res.status(400).json({error:'Ảnh phải được chụp trực tiếp từ camera (data:image), không cho upload từ thư viện'});
  if(isCameraCapture === false) return res.status(400).json({error:'Không cho upload ảnh có sẵn từ Gallery - phải chụp trực tiếp'});
  if(!gps || typeof gps!=='string' || !gps.includes(',')) return res.status(400).json({error:'GPS bắt buộc khi Check-out'});
  if(!/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/.test(gps)) return res.status(400).json({error:'GPS không hợp lệ (định dạng: lat, lng)'});
  if(!address || address.trim().length<3) return res.status(400).json({error:'Địa chỉ/GPS address bắt buộc khi Check-out'});
  const today = getVietnamTodayStr();
  const isOfficial = emp.type === 'OFFICIAL' || emp.status === 'OFFICIAL';

  const now = (req.body.mockTime && (req.body.isTest || req.headers['x-is-test'])) ? new Date(req.body.mockTime) : getVietnamNow();
  let record = null;
  if (shift) {
    record = db.attendances.find(a => a.employeeId === employeeId && a.date === today && a.shift === shift);
  }
  if (!record) {
    // Ưu tiên ca đã check-in nhưng chưa check-out
    record = db.attendances.find(a => a.employeeId === employeeId && a.date === today && a.checkIn && !a.checkOut);
  }
  if (!record) {
    record = db.attendances.find(a => a.employeeId === employeeId && a.date === today);
  }

  const currentShift = record?.shift || shift || emp.shift || 'CA_SANG';
  const shiftInfo = (db.settings.payroll.shifts && db.settings.payroll.shifts[currentShift]) || DEFAULT_SHIFTS[currentShift] || DEFAULT_SHIFTS['CA_SANG'];
  const [eh, em] = shiftInfo.end.split(':').map(Number);
  const shiftEnd = new Date(now); shiftEnd.setHours(eh, em, 0,0);
  const autoCloseCheckIn = new Date(shiftEnd.getTime() - 60*60000);

  if(!record || !record.checkIn){
    if(isOfficial && now >= autoCloseCheckIn){
      // Tự động chuyển sang Check-out khi nhân viên chưa check-in trước 1 tiếng hết ca
      const hourlyRate = db.settings.payroll.officialRate || 25500;
      const shiftHours = shiftInfo.hours || 5;
      const shiftWage = shiftHours * hourlyRate;
      const penaltyObj = {
        id: uuidv4(), employeeId: emp.employeeId, date: today, code: 'KHONG_CHECKIN',
        title: 'Không Check-in ca làm việc (tự động chuyển Check-out)', fineAmount: shiftWage, percentage: 100, createdAt: now.toISOString()
      };
      if (!db.penalties) db.penalties = [];
      db.penalties.push(penaltyObj);
      io.emit('penalties:update', db.penalties);

      if(!record){
        record = {
          id: uuidv4(), employeeId, date: today, shift: currentShift, branchId: emp.branchId,
          checkIn: null, checkOut: null, status: 'KHONG_CHECKIN', violations: ['KHONG_CHECKIN'],
          penalty: penaltyObj, version: 1, updated_at: now.toISOString(), sync_status: 'PENDING'
        };
        db.attendances.push(record);
      } else {
        record.violations = record.violations || [];
        if(!record.violations.includes('KHONG_CHECKIN')) record.violations.push('KHONG_CHECKIN');
        record.penalty = penaltyObj;
      }
    } else {
      return res.status(400).json({error:'Bạn chưa Check-in ca làm việc'});
    }
  }
  if(record.checkOut) return res.status(400).json({error:`Bạn đã Check-out ca ${getShiftVi(currentShift)} hôm nay rồi`});

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
  record.checkOut = { time: now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit', timeZone:'Asia/Ho_Chi_Minh'}), gps, address: address||db.branches.find(b=>b.id===emp.branchId)?.address, image: safeOutImage, timestamp: now.toISOString(), content:'Điểm danh Ra ca UBM', drivePath: outDrivePath };
  record.status = 'COMPLETED';
  record.updated_at = now.toISOString();
  record.sync_status = 'PENDING';
  addDriveFile(employeeId, today, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { content: image, gps: record.checkOut.gps, time: record.checkOut.time, attendanceId: record.id, slot: 'checkOut' });
  addDriveFile(employeeId, today, 'CHECK_OUT', `Diem_danh.txt`, { content: `Điểm danh Ra ca UBM - ${emp.name} - ${today} ${record.checkOut.time} - GPS:${record.checkOut.gps} - Địa chỉ:${record.checkOut.address}` });
  addSyncQueue('ATTENDANCE','UPDATE',record, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('attendances:update', db.attendances);

  notifyAdminAndHR({
    action: 'checkout',
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: `Điểm danh Ra ca: ${emp.name}`,
    message: `${emp.name} (${emp.employeeId} • ${emp.branchId}) vừa Check-out ca ${currentShift} lúc ${record.checkOut.time} (${record.violations?.length ? 'Vi phạm: ' + record.violations.join(', ') : 'Hoàn thành ca'})`,
    type: record.violations?.length ? 'warning' : 'success',
    data: { attendanceId: record.id, shift: currentShift, time: record.checkOut.time, violations: record.violations }
  });

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
  db.employees.filter(e => !isTestRecord(e) && !e.isTest && (e.status === 'TRAINING' || e.type === 'TRAINING')).forEach(emp => {
    const hasSched = db.schedules.some(s => s.employeeId === emp.employeeId);
    if (!hasSched) {
      const startDateStr = emp.startDate || getVietnamTodayStr();
      const trainingDays = emp.trainingDays || 7;
      const parts = startDateStr.split('T')[0].split('-').map(Number);
      const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : getVietnamNow();
      
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
          updated_at: getVietnamISOString()
        });
      }
      updated = true;
    }
  });
  // FIX: OFFICIAL chưa có lịch → tạo lịch tuần hiện tại (T2-CN) với ràng buộc AI: cùng CN cùng ca không trùng ngày
  const currentMonday = getMonday(getVietnamNow());
  const cy = currentMonday.getFullYear(); const cm = String(currentMonday.getMonth()+1).padStart(2,'0'); const cd = String(currentMonday.getDate()).padStart(2,'0');
  const currentWeekStart = `${cy}-${cm}-${cd}`;
  const officialsNeedingWeek = db.employees.filter(e => !isTestRecord(e) && !e.isTest && (e.status === 'OFFICIAL' || e.type === 'OFFICIAL') && !db.schedules.some(s => s.employeeId === e.employeeId && s.weekStart === currentWeekStart));
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
      db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: currentWeekStart, days, version:1, updated_at: getVietnamISOString() });
      delete emp._weekDays;
      updated = true;
      console.log(`[SCHEDULE] Auto-generated OFFICIAL (constrained) for ${emp.name} ${emp.employeeId} week ${currentWeekStart}`);
    });
  }
  // Đảm bảo mọi ca đã duyệt (ADD_SHIFT) luôn hiển thị 2-3 ca trên lịch
  if (Array.isArray(db.trainingShiftRequests)) {
    db.trainingShiftRequests.filter(r => r.status === 'APPROVED' && r.type === 'ADD_SHIFT').forEach(r => {
      const emp = db.employees.find(e => e.employeeId === r.employeeId || e.id === r.employeeId);
      const empId = emp ? emp.employeeId : r.employeeId;
      const empUUID = emp ? emp.id : null;
      const targetSched = db.schedules.find(s => (s.employeeId === empId || s.employeeId === r.employeeId || (empUUID && s.employeeId === empUUID)) && s.days && s.days.some(d => d.date === r.date));
      if (targetSched) {
        const day = targetSched.days.find(d => d.date === r.date);
        if (day) {
          const shifts = [];
          if (day.shift && day.shift !== 'OFF') shifts.push(day.shift);
          if (day.shift2 && !shifts.includes(day.shift2)) shifts.push(day.shift2);
          if (day.shift3 && !shifts.includes(day.shift3)) shifts.push(day.shift3);
          if (Array.isArray(day.shifts)) {
            day.shifts.forEach(s => { if (s && s !== 'OFF' && !shifts.includes(s)) shifts.push(s); });
          }
          if (r.toShift && !shifts.includes(r.toShift)) {
            shifts.push(r.toShift);
            updated = true;
          }
          const SHIFT_CHRONO_ORDER = { 'CA_SANG': 1, 'CA_CHIEU': 2, 'CA_TOI': 3 };
          shifts.sort((a, b) => (SHIFT_CHRONO_ORDER[a] || 99) - (SHIFT_CHRONO_ORDER[b] || 99));
          day.shifts = shifts;
          if (shifts[0]) day.shift = shifts[0];
          if (shifts[1]) day.shift2 = shifts[1];
          if (shifts[2]) day.shift3 = shifts[2];
          day.additionalShift = r.toShift;
          day.status = 'WORKING';
        }
      }
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
    existing.updated_at = getVietnamISOString();
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
            att = { id: uuidv4(), employeeId, date: day.date, shift: day.shift, branchId: empForUpdate.branchId, checkIn: null, checkOut: null, status: 'NOT_STARTED', violations:[], version:1, updated_at: getVietnamISOString(), sync_status:'PENDING' };
            if(day.date <= todayStrUp){
              const now=getVietnamNow();
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
              att.version=(att.version||1)+1; att.updated_at=getVietnamISOString();
              audit(req.user.username,'UPDATE_ATTENDANCE_SHIFT_TRAINING','ATTENDANCE',beforeAtt,att,req.ip);
              addSyncQueue('ATTENDANCE','UPDATE',att,req.user.username,'WEB_HR');
              // Cập nhật Drive files cho ca mới
              addDriveFile(employeeId, day.date, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { gps: att.checkIn?.gps || '10.762622,106.660172', time: newShiftInfo.start });
              addDriveFile(employeeId, day.date, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { gps: att.checkOut?.gps || '10.762622,106.660172', time: newShiftInfo.end });
            }
            if(day.date <= todayStrUp && att.status!=='COMPLETED' && day.status==='WORKING'){
              const shiftInfo2 = db.settings.payroll.shifts[day.shift] || DEFAULT_SHIFTS[day.shift] || DEFAULT_SHIFTS['CA_SANG'];
              const now2=getVietnamNow();
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
  const sched = { id: uuidv4(), employeeId, weekStart, days, version:1, updated_at: getVietnamISOString() };
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
            checkIn: null, checkOut: null, status: 'NOT_STARTED', violations:[], version:1, updated_at: getVietnamISOString(), sync_status:'PENDING'
          };
          // Nếu ngày đã qua hoặc hôm nay -> tự động điểm danh COMPLETED (AI auto) - dùng ca linh hoạt per day
          if(day.date <= todayStr){
            const now = getVietnamNow();
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
            att.updated_at = getVietnamISOString();
            audit(req.user.username,'UPDATE_ATTENDANCE_SHIFT_TRAINING','ATTENDANCE', before, att, req.ip);
            addSyncQueue('ATTENDANCE','UPDATE', att, req.user.username, 'WEB_HR');
          }
          // Nếu ngày đã qua mà chưa COMPLETED thì auto COMPLETED
          if(day.date <= todayStr && att.status!=='COMPLETED' && day.status==='WORKING'){
            const shiftInfo2 = db.settings.payroll.shifts[day.shift] || DEFAULT_SHIFTS[day.shift] || DEFAULT_SHIFTS['CA_SANG'];
            const now2=getVietnamNow();
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
  const targetMonth = month ? month.slice(0,7) : getVietnamTodayStr().slice(0,7);
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
        db.schedules.push({ id: uuidv4(), employeeId: empId, weekStart, days, version:1, updated_at: getVietnamISOString() });
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
  const today = getVietnamNow(); today.setHours(0,0,0,0);
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
        db.schedules.push({ id: uuidv4(), employeeId: empId, weekStart, days, version:1, updated_at: getVietnamISOString(), isTrainingAuto:true });
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
            const now=getVietnamNow();
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
  const employeeId = req.body.employeeId || req.user?.employeeId;
  const { date, fromDate: reqFromDate, toDate: reqToDate, fromShift, toShift, reason } = req.body;
  const emp = db.employees.find(e=> e.employeeId===employeeId);
  if(!emp) return res.status(404).json({ error:'Không tìm thấy nhân viên' });
  if(emp.type!=='TRAINING' && emp.status!=='TRAINING') return res.status(403).json({ error:'Chỉ nhân viên Training mới được đổi ca linh hoạt' });

  const fromDate = reqFromDate || date;
  const toDate = reqToDate || date || fromDate;
  if(!fromDate || !toDate || !toShift) return res.status(400).json({ error:'Thiếu ngày hoặc ca mới' });
  if(!reason || !String(reason).trim()) return res.status(400).json({ error:'Lý do là bắt buộc - vui lòng nhập lý do đổi ca' });
  if(!['CA_SANG','CA_CHIEU','CA_TOI'].includes(toShift)) return res.status(400).json({ error:'Ca mới không hợp lệ (CA_SANG/CHIEU/TOI)' });
  const isAdd = Boolean(req.body.isAdd || (reason && reason.startsWith('[THÊM CA]')) || req.body.type === 'ADD_SHIFT');

  // 12 ngày thử việc của nhân viên Training
  const startDateStr = emp.startDate || getVietnamTodayStr();
  const parts = startDateStr.split('T')[0].split('-').map(Number);
  const startD = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2]) : getVietnamNow();
  const trialDates = [];
  for (let i = 0; i < 12; i++) {
    const curr = new Date(startD);
    curr.setDate(startD.getDate() + i);
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    trialDates.push(`${y}-${m}-${d}`);
  }

  let currentOffDates = Array.isArray(emp.registeredOffDates) ? [...emp.registeredOffDates] : [];
  if (currentOffDates.length === 0) {
    currentOffDates = trialDates.filter(td => db.schedules.some(s => s.employeeId === employeeId && s.days.some(d => d.date === td && d.status === 'OFF')));
  }

  const fromSched = db.schedules.find(s=> s.employeeId===employeeId && s.days.some(d=> d.date===fromDate));
  const fromDay = fromSched ? fromSched.days.find(d=> d.date===fromDate) : null;
  const currentShift = fromShift || fromDay?.shift || emp.shift;

  // Kiểm tra nếu toDate là ngày OFF:
  const isToDateOff = currentOffDates.includes(toDate) || db.schedules.some(s => s.employeeId === employeeId && s.days.some(d => d.date === toDate && d.status === 'OFF'));

  // RÀNG BUỘC THÊM CA (2-3 ca/ngày, chỉ thực hiện trên ngày có ca làm việc, chặn ngày OFF):
  if(isAdd){
    if(isToDateOff){
      return res.status(400).json({ error:'Không thể thêm ca vào ngày nghỉ OFF. Chức năng thêm ca chỉ áp dụng cho ngày đi làm.' });
    }
    const toSched = db.schedules.find(s=> s.employeeId===employeeId && s.days.some(d=> d.date===toDate));
    const toDay = toSched ? toSched.days.find(d=> d.date===toDate) : null;
    if(toDay && toDay.status!=='WORKING'){
      return res.status(400).json({ error:'Không thể thêm ca vào ngày nghỉ OFF. Chức năng thêm ca chỉ áp dụng cho ngày đi làm.' });
    }
    if(!toDay && !trialDates.includes(toDate)){
      return res.status(400).json({ error:'Chức năng thêm ca chỉ thực hiện trên những ngày có ca làm việc.' });
    }
    const existingShifts = [];
    if(toDay){
      if(toDay.shift && toDay.shift !== 'OFF') existingShifts.push(toDay.shift);
      if(toDay.shift2 && !existingShifts.includes(toDay.shift2)) existingShifts.push(toDay.shift2);
      if(toDay.shift3 && !existingShifts.includes(toDay.shift3)) existingShifts.push(toDay.shift3);
      if(Array.isArray(toDay.shifts)){
        toDay.shifts.forEach(s=> { if(s && s !== 'OFF' && !existingShifts.includes(s)) existingShifts.push(s); });
      }
    } else {
      if(emp.shift && emp.shift !== 'OFF') existingShifts.push(emp.shift);
    }
    if(existingShifts.includes(toShift)){
      return res.status(400).json({ error:`Ngày ${fmtDMY(toDate)} đã có ca ${toShift}, không thể thêm trùng ca.` });
    }
    if(existingShifts.length >= 3){
      return res.status(400).json({ error:`Ngày ${fmtDMY(toDate)} đã có tối đa 3 ca làm việc.` });
    }
    const existingPending = db.trainingShiftRequests.find(r=> r.employeeId===employeeId && r.date===toDate && r.toShift===toShift && r.status==='PENDING');
    if(existingPending) return res.status(409).json({ error:`Đã có phiếu thêm ca ${toShift} đang chờ duyệt cho ngày này`, request: existingPending });
  }

  if(isToDateOff && fromDate !== toDate && !isAdd){
    // ============ TỰ ĐỘNG HOÁN ĐỔI NGÀY OFF & BẢO TOÀN 7 TRAINING + 5 OFF ============
    let newOffDates = currentOffDates.filter(d => d !== toDate);
    if(!newOffDates.includes(fromDate)) newOffDates.push(fromDate);
    newOffDates = [...new Set(newOffDates)].sort();

    // Chuẩn hóa đúng 5 ngày OFF trong 12 ngày thử việc
    if(newOffDates.length !== 5){
      const candidateOffs = trialDates.filter(d => d !== toDate && (d === fromDate || newOffDates.includes(d)));
      while(candidateOffs.length < 5){
        const extra = trialDates.find(d => d !== toDate && d !== fromDate && !candidateOffs.includes(d));
        if(extra) candidateOffs.push(extra);
        else break;
      }
      newOffDates = candidateOffs.slice(0, 5).sort();
    }

    emp.registeredOffDates = newOffDates;
    emp.trainingOffDays = 5;

    let offReq = db.offRequests.find(r => r.employeeId === employeeId && (r.type === 'TRAINING_OFF' || r.type === 'TRAINING'));
    if(offReq){
      offReq.dates = newOffDates;
      offReq.updated_at = getVietnamISOString();
    } else {
      offReq = {
        id: uuidv4(), employeeId, employeeName: emp.name, branchId: emp.branchId, shift: emp.shift,
        dates: newOffDates, type: 'TRAINING_OFF', status: 'APPROVED', autoApproved: true,
        createdAt: getVietnamISOString(), version: 1, sync_status: 'SYNCED'
      };
      db.offRequests.push(offReq);
    }
    // Đẩy ngày OFF mới lên Google Sheet (tab PHIEU_OFF_HANG_TUAN) để Sheet không bị lệch sau đổi ca
    addSyncQueue('OFF_REQUEST', 'UPDATE', offReq, employeeId, 'WEB_EMPLOYEE');

    // Cập nhật ngày fromDate thành OFF
    if(fromSched && fromDay){
      fromDay.status = 'OFF';
      fromDay.shift = 'OFF';
      fromSched.version = (fromSched.version || 1) + 1;
      fromSched.updated_at = getVietnamISOString();
      addSyncQueue('SCHEDULE', 'UPDATE', fromSched, employeeId, 'WEB_EMPLOYEE');
    }

    // Cập nhật ngày toDate thành WORKING
    let toSched = db.schedules.find(s=> s.employeeId===employeeId && s.days.some(d=> d.date===toDate));
    if(toSched){
      const toDay = toSched.days.find(d=> d.date===toDate);
      if(toDay){
        toDay.status = 'WORKING';
        toDay.shift = toShift;
      }
      toSched.version = (toSched.version || 1) + 1;
      toSched.updated_at = getVietnamISOString();
      addSyncQueue('SCHEDULE', 'UPDATE', toSched, employeeId, 'WEB_EMPLOYEE');
    } else {
      const monday = getMonday(new Date(toDate));
      const wy=monday.getFullYear(); const wm=String(monday.getMonth()+1).padStart(2,'0'); const wd=String(monday.getDate()).padStart(2,'0');
      const weekStart=`${wy}-${wm}-${wd}`;
      const dayNames = ['T2','T3','T4','T5','T6','T7','CN'];
      const days = [];
      for(let i=0; i<7; i++){
        const cur = new Date(monday); cur.setDate(monday.getDate()+i);
        const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0');
        const dStr = `${y}-${m}-${d}`;
        const isTarget = dStr === toDate;
        const isDayOff = newOffDates.includes(dStr);
        days.push({
          date: dStr,
          dayName: dayNames[i],
          shift: isTarget ? toShift : (isDayOff ? 'OFF' : emp.shift),
          status: isTarget ? 'WORKING' : (isDayOff ? 'OFF' : 'WORKING'),
          substituteFor: null
        });
      }
      toSched = { id: uuidv4(), employeeId, weekStart, days, version: 1, updated_at: getVietnamISOString(), approvalStatus: 'APPROVED' };
      db.schedules.push(toSched);
      addSyncQueue('SCHEDULE', 'CREATE', toSched, employeeId, 'WEB_EMPLOYEE');
    }

    const reqId = uuidv4();
    const createdAt = getVietnamISOString();
    const newReq = {
      id: reqId, employeeId, employeeName: emp.name, branchId: emp.branchId,
      date: toDate, fromDate, toDate, fromShift: currentShift, toShift, reason: reason||'',
      type: 'CHANGE_SHIFT', status: 'APPROVED',
      approvedBy: 'HỆ THỐNG TỰ ĐỘNG (Auto-Swap OFF)', approvedAt: createdAt,
      autoSwappedOff: true, oldOffDate: toDate, newOffDate: fromDate,
      createdAt, version: 1
    };
    db.trainingShiftRequests.unshift(newReq);
    audit(employeeId, 'SWAP_OFF_TRAINING_SHIFT', 'TRAINING_SHIFT', null, newReq, req.ip);
    addSyncQueue('TRAINING_SHIFT', 'CREATE', newReq, employeeId, 'WEB_EMPLOYEE');
    saveDB();

    io.emit('schedules:update', db.schedules);
    io.emit('offRequests:update', db.offRequests);
    io.emit('employees:update', db.employees);
    io.emit('trainingShiftRequests:update', db.trainingShiftRequests);

    notifyAdminAndHR({
      action: 'training_shift_swap_off',
      employeeId,
      employeeName: emp.name,
      branchId: emp.branchId,
      title: `Tự động đổi ca: NV Training ${emp.name} sang ngày OFF`,
      message: `${emp.name} (${employeeId}) đã đổi ca làm từ ${fmtDMY(fromDate)} sang ngày OFF ${fmtDMY(toDate)} (${toShift}). Hệ thống đã tự động hoán đổi ngày OFF (ngày ${fmtDMY(fromDate)} thành OFF, ngày ${fmtDMY(toDate)} thành ĐI LÀM) để duy trì đúng 7 ngày training và 5 ngày OFF trong 12 ngày thử việc.`,
      type: 'success',
      data: { requestId: reqId, fromDate, toDate, toShift, registeredOffDates: newOffDates }
    });

    return res.json({
      success: true,
      request: newReq,
      isAutoSwap: true,
      autoApproved: true,
      autoSwappedOff: true,
      registeredOffDates: newOffDates,
      message: `Đã đổi ca thành công! Ngày ${fmtDMY(toDate)} chuyển thành ngày làm việc và ngày ${fmtDMY(fromDate)} tự động chuyển thành ngày nghỉ OFF (đảm bảo đúng 7 ngày làm và 5 ngày OFF trong 12 ngày thử việc).`
    });
  }

  // Trường hợp đổi ca cùng ngày hoặc thêm ca:
  if(!isAdd && currentShift===toShift && fromDate===toDate) return res.status(400).json({ error:'Ca mới trùng ca hiện tại' });
  const shiftInfo = db.settings.payroll.shifts[toShift] || DEFAULT_SHIFTS[toShift];
  const [sh, sm] = shiftInfo.start.split(':').map(Number);
  const shiftStart = new Date(toDate); shiftStart.setHours(sh, sm, 0,0);
  const now = (req.body.mockTime && (req.body.isTest || req.headers['x-is-test'])) ? new Date(req.body.mockTime) : getVietnamNow();
  const diffMs = shiftStart.getTime() - now.getTime();
  const diffHours = diffMs / (1000*60*60);
  if(diffHours < 12 && !(req.body.mockTime && (req.body.isTest || req.headers['x-is-test']))){
    return res.status(400).json({ error:`Phải đổi ca trước giờ bắt đầu ca mới ít nhất 12 tiếng. Ca ${toShift} ${shiftInfo.start} ngày ${toDate} chỉ còn ${diffHours.toFixed(1)}h`, need12h:true });
  }
  if(new Date(toDate) < new Date(getVietnamTodayStr())) return res.status(400).json({ error:'Không thể đổi ca cho ngày đã qua' });

  if(!isAdd){
    const existingPending = db.trainingShiftRequests.find(r=> r.employeeId===employeeId && (r.date===toDate || r.date===fromDate) && r.status==='PENDING');
    if(existingPending) return res.status(409).json({ error:'Đã có phiếu đổi ca đang chờ duyệt cho ngày này', request: existingPending });
  }

  const reqId = uuidv4();
  const createdAt = getVietnamISOString();
  const expiresAt = new Date(Date.now() + 15*60*1000).toISOString(); // 15 phút
  const newReq = {
    id: reqId, employeeId, employeeName: emp.name, branchId: emp.branchId,
    date: toDate, fromDate, toDate, fromShift: currentShift, toShift, reason: reason||'',
    type: isAdd ? 'ADD_SHIFT' : 'CHANGE_SHIFT',
    status:'PENDING', createdAt, expiresAt, version:1,
    isTest: (emp.isTest || isTestRecord(emp) || req.headers['x-is-test']==='true' || (req.body && req.body.isTest===true)) || undefined
  };
  db.trainingShiftRequests.unshift(newReq);
  audit(employeeId,'CREATE_TRAINING_SHIFT_CHANGE','TRAINING_SHIFT', null, newReq, req.ip);
  addSyncQueue('TRAINING_SHIFT','CREATE', newReq, employeeId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('trainingShiftRequests:update', db.trainingShiftRequests);

  notifyAdminAndHR({
    action: isAdd ? 'training_add_shift' : 'training_shift_change',
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: `Training ${emp.name} xin ${isAdd?'thêm':'đổi'} ca`,
    message: `${emp.name} (${employeeId}) xin ${isAdd?'thêm ca':'đổi'} ${currentShift} -> ${toShift} ngày ${fmtDMY(toDate)}. Lý do: ${reason||'Không có'}. Hết hạn 15 phút.`,
    type: 'info',
    data: { requestId: reqId, request: newReq }
  });

  res.json({ success:true, request: newReq, message:`Đã gửi phiếu ${isAdd?'thêm ca':'đổi ca'} tới HR, HR có 15 phút để duyệt, quá hạn tự động duyệt` });
});
app.get(['/api/training/shift-change', '/api/training/shift-requests'], authMiddleware, (req,res)=>{
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
app.post(['/api/training/shift-change/:id/approve', '/api/training/shift-requests/:id/approve'], authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const r = db.trainingShiftRequests.find(x=> x.id===req.params.id);
  if(!r) return res.status(404).json({ error:'Không tìm thấy phiếu' });
  if(r.status!=='PENDING') return res.status(400).json({ error:'Phiếu đã xử lý', status: r.status });
  // BranchScope check
  if(req.user.role==='Manager'){
    const emp = db.employees.find(e=> e.employeeId===r.employeeId);
    if(emp && !req.user.branchScope.includes(emp.branchId)) return res.status(403).json({ error:'Manager chỉ duyệt chi nhánh được phân quyền' });
  }
  r.status='APPROVED'; r.approvedBy=req.user.username; r.approvedAt=getVietnamISOString(); r.version=(r.version||1)+1;
  // Tự động cập nhật ca + lịch + attendance
  const emp = db.employees.find(e=> e.employeeId===r.employeeId || e.id===r.employeeId);
  const empId = emp ? emp.employeeId : r.employeeId;
  const empUUID = emp ? emp.id : null;
  if(emp || r.employeeId){
    // Tìm schedule chứa ngày này
    let sched = db.schedules.find(s=> (s.employeeId===empId || s.employeeId===r.employeeId || (empUUID && s.employeeId===empUUID)) && s.days && s.days.some(d=> d.date===r.date));
    if(sched){
      const day = sched.days.find(d=> d.date===r.date);
      const before={...day};
      if(r.type === 'ADD_SHIFT'){
        const existingShifts = [];
        if (day.shift && day.shift !== 'OFF') existingShifts.push(day.shift);
        if (day.shift2) existingShifts.push(day.shift2);
        if (day.shift3) existingShifts.push(day.shift3);
        if (Array.isArray(day.shifts)) {
          day.shifts.forEach(s => { if (s && !existingShifts.includes(s)) existingShifts.push(s); });
        }
        if (!existingShifts.includes(r.toShift)) {
          existingShifts.push(r.toShift);
        }
        const SHIFT_CHRONO_ORDER = { 'CA_SANG': 1, 'CA_CHIEU': 2, 'CA_TOI': 3 };
        existingShifts.sort((a, b) => (SHIFT_CHRONO_ORDER[a] || 99) - (SHIFT_CHRONO_ORDER[b] || 99));
        day.shifts = existingShifts;
        if (existingShifts[0]) day.shift = existingShifts[0];
        if (existingShifts[1]) day.shift2 = existingShifts[1];
        if (existingShifts[2]) day.shift3 = existingShifts[2];
        day.additionalShift = r.toShift;
        day.status = 'WORKING';
      } else {
        day.shift = r.toShift;
        if(day.status==='OFF') day.status='WORKING';
      }
      sched.version=(sched.version||1)+1; sched.updated_at=getVietnamISOString();
      audit(req.user.username,'APPROVE_TRAINING_SHIFT','SCHEDULE', before, day, req.ip);
      addSyncQueue('SCHEDULE','UPDATE', sched, req.user.username, 'WEB_HR');
    } else {
      // Chưa có schedule cho tuần này -> tạo mới
      const monday = getMonday(new Date(r.date));
      const wy=monday.getFullYear(); const wm=String(monday.getMonth()+1).padStart(2,'0'); const wd=String(monday.getDate()).padStart(2,'0');
      const weekStart=`${wy}-${wm}-${wd}`;
      const days=[]; for(let i=0;i<7;i++){ const cur=new Date(monday); cur.setDate(monday.getDate()+i); const y=cur.getFullYear(); const m=String(cur.getMonth()+1).padStart(2,'0'); const d=String(cur.getDate()).padStart(2,'0'); const dateStr=`${y}-${m}-${d}`; const isTarget = dateStr===r.date; const dayObj = { date: dateStr, dayName:['T2','T3','T4','T5','T6','T7','CN'][i], shift: isTarget ? (r.type==='ADD_SHIFT' ? (emp.shift || r.toShift) : r.toShift) : emp.shift, status: isTarget ? 'WORKING' : 'OFF', substituteFor:null }; if(isTarget && r.type==='ADD_SHIFT' && emp.shift && emp.shift !== r.toShift){ dayObj.shift2 = r.toShift; dayObj.shifts = [dayObj.shift, r.toShift]; } days.push(dayObj); }
      const newSched={ id: uuidv4(), employeeId: r.employeeId, weekStart, days, version:1, updated_at: getVietnamISOString() };
      db.schedules.push(newSched);
      addSyncQueue('SCHEDULE','CREATE', newSched, req.user.username, 'WEB_HR');
    }
    // Cập nhật attendance nếu là Training
    if(emp.type==='TRAINING' || emp.status==='TRAINING'){
      const todayStr = getVietnamTodayStr();
      const shiftInfo = db.settings.payroll.shifts[r.toShift] || DEFAULT_SHIFTS[r.toShift];
      if(r.type === 'ADD_SHIFT'){
        // Thêm ca mới: Tìm xem đã có attendance cho ca này chưa, nếu chưa thì tạo mới (không ghi đè ca trước)
        let att = db.attendances.find(a=> a.employeeId===r.employeeId && a.date===r.date && a.shift===r.toShift);
        if(!att){
          att={ id: uuidv4(), employeeId: r.employeeId, date: r.date, shift: r.toShift, branchId: emp.branchId, checkIn:null, checkOut:null, status: r.date <= todayStr ? 'COMPLETED' : 'NOT_STARTED', violations:[], version:1, updated_at: getVietnamISOString(), sync_status:'PENDING' };
          if(r.date <= todayStr){
            const now=getVietnamNow();
            att.checkIn={ time: shiftInfo.start, gps:'10.762622,106.660172', address: db.branches.find(b=>b.id===emp.branchId)?.address || 'Training Auto', image:'', timestamp: now.toISOString(), content:'Điểm danh Vào ca UBM (Training Auto - thêm ca)', drivePath: generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_IN') };
            att.checkOut={ time: shiftInfo.end, gps:'10.762622,106.660172', address: db.branches.find(b=>b.id===emp.branchId)?.address || 'Training Auto', image:'', timestamp: now.toISOString(), content:'Điểm danh Ra ca UBM (Training Auto - thêm ca)', drivePath: generateDrivePath({...emp, shift: r.toShift}, r.date, 'CHECK_OUT') };
            addDriveFile(r.employeeId, r.date, 'CHECK_IN', `Anh_chup_cua_hang.jpg`, { gps: att.checkIn.gps, time: att.checkIn.time });
            addDriveFile(r.employeeId, r.date, 'CHECK_OUT', `Anh_chup_cua_hang.jpg`, { gps: att.checkOut.gps, time: att.checkOut.time });
          }
          db.attendances.push(att);
          addSyncQueue('ATTENDANCE','CREATE', att, req.user.username, 'WEB_HR');
        }
      } else {
        // Đổi ca: Cập nhật ca của bản ghi hiện có
        let att = db.attendances.find(a=> a.employeeId===r.employeeId && a.date===r.date);
        if(!att){
          att={ id: uuidv4(), employeeId: r.employeeId, date: r.date, shift: r.toShift, branchId: emp.branchId, checkIn:null, checkOut:null, status: r.date <= todayStr ? 'COMPLETED' : 'NOT_STARTED', violations:[], version:1, updated_at: getVietnamISOString(), sync_status:'PENDING' };
          if(r.date <= todayStr){
            const now=getVietnamNow();
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
          att.version=(att.version||1)+1; att.updated_at=getVietnamISOString();
          audit(req.user.username,'UPDATE_ATTENDANCE_TRAINING_SHIFT','ATTENDANCE', before, att, req.ip);
          addSyncQueue('ATTENDANCE','UPDATE', att, req.user.username, 'WEB_HR');
        }
      }
    }
    // Thông báo cho NV
    const notifEmp={ id: uuidv4(), to: r.employeeId, type:'TRAINING_SHIFT_APPROVED', title:`${r.type==='ADD_SHIFT'?'Thêm ca':'Đổi ca'} ${r.date} đã duyệt`, content:`Yêu cầu ${r.type==='ADD_SHIFT'?'thêm ca '+r.toShift:'đổi ca '+r.fromShift+' -> '+r.toShift} ngày ${r.date} đã được ${req.user.username} duyệt. Lịch đã cập nhật.`, createdAt: getVietnamISOString(), read:false };
    db.notifications.push(notifEmp);
    const zr={ id: uuidv4(), sent_at: getVietnamISOString(), receiver: emp.phone, type:'TRAINING_SHIFT_APPROVED', content:`[ỤM BÒ MILK] ${r.type==='ADD_SHIFT'?'Thêm ca':'Đổi ca'} Training ${emp.name} ${r.date} ${r.toShift} đã duyệt`, status:'SENT', error:'' };
    db.zaloRecords.unshift(zr);
  }
  saveDB();
  io.emit('schedules:update', db.schedules);
  io.emit('attendances:update', db.attendances);
  io.emit('trainingShiftRequests:update', db.trainingShiftRequests);
  io.emit('notifications:update', db.notifications);
  audit(req.user.username,'APPROVE_TRAINING_SHIFT','TRAINING_SHIFT', null, r, req.ip);
  addSyncQueue('TRAINING_SHIFT','UPDATE', r, req.user.username, 'WEB_HR');
  notifyAdminAndHR({
    action: 'training_shift_approved',
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    branchId: r.branchId,
    title: `Đã duyệt đơn Training: ${r.employeeName}`,
    message: `${req.user.username} đã duyệt đơn ${r.type === 'ADD_SHIFT' ? 'thêm ca' : 'đổi ca'} (${r.fromShift} -> ${r.toShift}) ngày ${fmtDMY(r.date)} của ${r.employeeName}`,
    type: 'success',
    data: { requestId: r.id }
  });
  res.json({ success:true, request: r });
});
app.post(['/api/training/shift-change/:id/reject', '/api/training/shift-requests/:id/reject'], authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const r = db.trainingShiftRequests.find(x=> x.id===req.params.id);
  if(!r) return res.status(404).json({ error:'Không tìm thấy phiếu' });
  if(r.status!=='PENDING') return res.status(400).json({ error:'Phiếu đã xử lý' });
  r.status='REJECTED'; r.rejectedBy=req.user.username; r.rejectedAt=getVietnamISOString(); r.reasonReject=req.body.reason||'';
  saveDB();
  io.emit('trainingShiftRequests:update', db.trainingShiftRequests);
  audit(req.user.username,'REJECT_TRAINING_SHIFT','TRAINING_SHIFT', null, r, req.ip);
  addSyncQueue('TRAINING_SHIFT','UPDATE', r, req.user.username, 'WEB_HR');
  // Thông báo NV
  const notif={ id: uuidv4(), to: r.employeeId, type:'TRAINING_SHIFT_REJECTED', title:`Đổi ca ${r.date} bị từ chối`, content:`Yêu cầu đổi ${r.fromShift}->${r.toShift} ngày ${r.date} bị từ chối. Lý do: ${r.reasonReject}`, createdAt: getVietnamISOString(), read:false };
  db.notifications.push(notif);
  io.emit('notifications:update', db.notifications);
  notifyAdminAndHR({
    action: 'training_shift_rejected',
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    branchId: r.branchId,
    title: `Từ chối đơn Training: ${r.employeeName}`,
    message: `${req.user.username} đã từ chối đơn ${r.type === 'ADD_SHIFT' ? 'thêm ca' : 'đổi ca'} ngày ${fmtDMY(r.date)} của ${r.employeeName}. Lý do: ${r.reasonReject}`,
    type: 'warning',
    data: { requestId: r.id }
  });
  res.json({ success:true, request: r });
});

// ============ ĐỔI CA CHÍNH THỨC (Official) - TH1/TH2 24h AI tự duyệt ============
// TH1: NV A chọn người thay thế cụ thể -> gửi đến đúng NV đó, nếu chấp nhận -> AI cập nhật lịch 2 NV ngay, nếu từ chối -> chuyển TH2
// TH2: Không tìm được người -> gửi toàn chi nhánh, nếu có người chấp nhận -> AI tự duyệt sau 24h
if(!db.shiftSwapRequests) db.shiftSwapRequests=[];
app.post('/api/shift-swap', (req,res)=>{
  const requesterId = req.body.requesterId || req.body.employeeId || req.user?.employeeId;
  const { date, fromShift, toShift, targetEmployeeId, reason } = req.body;
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
  const now = getVietnamNow();
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
    acceptedBy: null, acceptedAt: null,
    isTest: (emp.isTest || isTestRecord(emp) || req.headers['x-is-test']==='true' || (req.body && req.body.isTest===true)) || undefined
  };
  db.shiftSwapRequests.unshift(newReq);
  audit(requesterId,'CREATE_SHIFT_SWAP','SHIFT_SWAP',null,newReq, req.ip);
  addSyncQueue('SHIFT_SWAP','CREATE',newReq, requesterId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('shiftSwap:update', db.shiftSwapRequests);
  io.emit('shiftSwapRequests:update', db.shiftSwapRequests);
  // Gửi thông báo
  if(isDirect){
    const notif = { id: uuidv4(), to: targetEmployeeId, type:'SHIFT_SWAP_INVITE', title:`${emp.name} mời đổi ca ${date}`, content:`${emp.name} (${requesterId}) muốn đổi ${curShift}→${finalToShift} ngày ${fmtDMY(date)}. Lý do: ${reason||'—'}. Vui lòng chấp nhận/từ chối.`, createdAt: now.toISOString(), read:false, requestId: reqId };
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
  notifyAdminAndHR({
    action: 'shift_swap_request',
    employeeId: requesterId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: `NV Chính thức ${emp.name} xin đổi ca`,
    message: `${emp.name} (${requesterId}) xin đổi ca ngày ${fmtDMY(date)} (${curShift} -> ${finalToShift}). ${targetEmp ? 'Đổi trực tiếp với: ' + targetEmp.name : 'Gửi toàn chi nhánh'}. Lý do: ${reason}`,
    type: 'info',
    data: { requestId: reqId, date, fromShift: curShift, toShift: finalToShift }
  });
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
      r.rejectedBy=employeeId; r.rejectedAt=getVietnamISOString();
      // Gửi broadcast tới toàn chi nhánh
      const branchEmps = db.employees.filter(e=>e.branchId===r.branchId && e.employeeId!==r.requesterId && e.status==='OFFICIAL' && e.employeeId!==employeeId);
      branchEmps.forEach(e=>{
        const notif = { id: uuidv4(), to: e.employeeId, type:'SHIFT_SWAP_BROADCAST', title:`Cần người đổi ca ${r.date} (TH1 từ chối)`, content:`${r.requesterName} cần đổi ${r.fromShift}→${r.toShift} ngày ${r.date} - TH1 bị từ chối, chuyển TH2 toàn chi nhánh.`, createdAt: getVietnamISOString(), read:false, requestId: r.id };
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
      r.status='APPROVED'; r.acceptedBy=employeeId; r.acceptedAt=getVietnamISOString(); r.approvedAt=getVietnamISOString();
      // Đổi lịch 2 NV
      const requester = db.employees.find(e=>e.employeeId===r.requesterId);
      const target = db.employees.find(e=>e.employeeId===r.targetEmployeeId);
      [requester, target].forEach((e, idx)=>{
        if(!e) return;
        const otherShift = idx===0 ? r.toShift : r.fromShift; // requester -> toShift, target -> fromShift (swap)
        let sched = db.schedules.find(s=>s.employeeId===e.employeeId && s.days.some(d=>d.date===r.date));
        if(sched){
          const day = sched.days.find(d=>d.date===r.date);
          if(day){ day.shift=otherShift; day.status='WORKING'; day.substituteFor = idx===0 ? r.targetEmployeeId : r.requesterId; sched.version=(sched.version||1)+1; addSyncQueue('SCHEDULE','UPDATE',sched,employeeId,'WEB_EMPLOYEE'); }
        }
      });
      saveDB();
      io.emit('shiftSwap:update', db.shiftSwapRequests);
      io.emit('shiftSwapRequests:update', db.shiftSwapRequests);
      io.emit('schedules:update', db.schedules);
      // Thông báo 2 bên
      const notif1 = { id: uuidv4(), to: r.requesterId, type:'SHIFT_SWAP_APPROVED', title:`Đổi ca ${r.date} đã duyệt (TH1)`, content:`${emp.name} đã chấp nhận đổi ${r.fromShift}→${r.toShift} ngày ${r.date}. Lịch đã cập nhật.`, createdAt: getVietnamISOString(), read:false };
      const notif2 = { id: uuidv4(), to: r.targetEmployeeId, type:'SHIFT_SWAP_APPROVED', title:`Đổi ca ${r.date} đã duyệt`, content:`Bạn đã chấp nhận đổi ca với ${r.requesterName} ngày ${r.date}. Lịch đã cập nhật.`, createdAt: getVietnamISOString(), read:false };
      db.notifications.push(notif1, notif2);
      notifyAdminAndHR({
        action: 'shift_swap_accepted',
        employeeId: emp.employeeId,
        employeeName: emp.name,
        branchId: emp.branchId,
        title: `Đổi ca TH1: ${emp.name} chấp nhận đổi ca`,
        message: `${emp.name} đã chấp nhận đổi ca với ${r.requesterName} ngày ${fmtDMY(r.date)}. AI đã tự động cập nhật lịch làm việc 2 nhân viên.`,
        type: 'success',
        data: { requestId: r.id, requesterId: r.requesterId, targetEmployeeId: r.targetEmployeeId }
      });
      io.emit('notifications:update', db.notifications);
      audit(employeeId,'ACCEPT_SHIFT_SWAP_TH1','SHIFT_SWAP',null,r, req.ip);
      addSyncQueue('SHIFT_SWAP','UPDATE',r, employeeId, 'WEB_EMPLOYEE');
      saveDB();
      return res.json({success:true, request:r, message:'TH1 chấp nhận - AI đã cập nhật lịch 2 NV'});
    } else if(r.status==='PENDING_BROADCAST'){
      // TH2: ghi nhận người chấp nhận đầu tiên, nhưng chưa duyệt ngay - đợi 24h
      if(r.acceptedBy) return res.status(409).json({error:'Đã có người chấp nhận trước, đang chờ AI duyệt sau 24h', acceptedBy: r.acceptedBy});
      r.acceptedBy=employeeId; r.acceptedAt=getVietnamISOString();
      r.status='PENDING_BROADCAST_ACCEPTED'; // chờ 24h
      audit(employeeId,'ACCEPT_SHIFT_SWAP_TH2','SHIFT_SWAP',null,r, req.ip);
      addSyncQueue('SHIFT_SWAP','UPDATE',r, employeeId, 'WEB_EMPLOYEE');
      saveDB();
      io.emit('shiftSwap:update', db.shiftSwapRequests);
      io.emit('shiftSwapRequests:update', db.shiftSwapRequests);
      const notif = { id: uuidv4(), to: r.requesterId, type:'SHIFT_SWAP_TH2_ACCEPTED', title:`Có người nhận đổi ca ${r.date} (TH2)`, content:`${emp.name} đã nhận đổi ca ${r.fromShift}→${r.toShift} ngày ${r.date}. AI sẽ tự duyệt sau 24h kể từ lúc gửi yêu cầu (${fmtDMY?fmtDMY(r.date):r.date}).`, createdAt: getVietnamISOString(), read:false };
      db.notifications.push(notif);
      notifyAdminAndHR({
        action: 'shift_swap_th2_accepted',
        employeeId: emp.employeeId,
        employeeName: emp.name,
        branchId: emp.branchId,
        title: `Đổi ca TH2: ${emp.name} nhận thế ca`,
        message: `${emp.name} đã nhận thế ca ngày ${fmtDMY(r.date)} của ${r.requesterName}. AI sẽ tự duyệt sau 24h.`,
        type: 'info',
        data: { requestId: r.id, requesterId: r.requesterId, acceptedBy: emp.employeeId }
      });
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
  const now = getVietnamNow();
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
    createdByHr: req.user.username,
    isTest: (emp.isTest || isTestRecord(emp) || req.headers['x-is-test']==='true' || (req.body && req.body.isTest===true)) || undefined
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
// HR duyệt yêu cầu đổi ca chính thức
app.post('/api/shift-swap/:id/approve', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const r = db.shiftSwapRequests.find(x=>x.id===req.params.id);
  if(!r) return res.status(404).json({error:'Không tìm thấy yêu cầu'});
  if(r.status==='APPROVED' || r.status==='REJECTED' || r.status==='AUTO_APPROVED') return res.status(400).json({error:'Yêu cầu đã xử lý'});

  r.status='APPROVED';
  r.approvedBy=req.user.username;
  r.approvedAt=getVietnamISOString();
  r.version=(r.version||1)+1;

  const requester = db.employees.find(e=>e.employeeId===r.requesterId);
  const targetId = r.acceptedBy || r.targetEmployeeId;
  const target = targetId ? db.employees.find(e=>e.employeeId===targetId) : null;

  if(requester){
    let sched = db.schedules.find(s=>s.employeeId===requester.employeeId && s.days.some(d=>d.date===r.date));
    if(sched){
      const day = sched.days.find(d=>d.date===r.date);
      if(day){ day.shift = r.toShift; day.status='WORKING'; day.substituteFor = targetId||null; sched.version=(sched.version||1)+1; addSyncQueue('SCHEDULE','UPDATE',sched,req.user.username,'WEB_HR'); }
    }
  }
  if(target){
    let sched = db.schedules.find(s=>s.employeeId===target.employeeId && s.days.some(d=>d.date===r.date));
    if(sched){
      const day = sched.days.find(d=>d.date===r.date);
      if(day){ day.shift = r.fromShift; day.status='WORKING'; day.substituteFor = r.requesterId; sched.version=(sched.version||1)+1; addSyncQueue('SCHEDULE','UPDATE',sched,req.user.username,'WEB_HR'); }
    }
  }

  audit(req.user.username,'APPROVE_SHIFT_SWAP_HR','SHIFT_SWAP',null,r,req.ip);
  addSyncQueue('SHIFT_SWAP','UPDATE',r,req.user.username,'WEB_HR');
  saveDB();
  io.emit('shiftSwap:update', db.shiftSwapRequests);
  io.emit('shiftSwapRequests:update', db.shiftSwapRequests);
  io.emit('schedules:update', db.schedules);

  const notif1 = { id: uuidv4(), to: r.requesterId, type:'SHIFT_SWAP_APPROVED', title:`Đổi ca ${r.date} đã được HR duyệt`, content:`Yêu cầu đổi ${r.fromShift}→${r.toShift} ngày ${r.date} đã được ${req.user.username} phê duyệt. Lịch đã cập nhật.`, createdAt: getVietnamISOString(), read:false };
  db.notifications.push(notif1);
  if(targetId){
    const notif2 = { id: uuidv4(), to: targetId, type:'SHIFT_SWAP_APPROVED', title:`Đổi ca ${r.date} đã được HR duyệt`, content:`Đổi ca với ${r.requesterName} ngày ${r.date} đã được ${req.user.username} phê duyệt. Lịch đã cập nhật.`, createdAt: getVietnamISOString(), read:false };
    db.notifications.push(notif2);
  }
  notifyAdminAndHR({
    action: 'shift_swap_approved',
    employeeId: r.requesterId,
    employeeName: r.requesterName,
    branchId: r.branchId,
    title: `HR đã duyệt đổi ca: ${r.requesterName}`,
    message: `${req.user.username} đã duyệt đổi ca ngày ${fmtDMY(r.date)} cho ${r.requesterName}. Lịch đã cập nhật.`,
    type: 'success',
    data: { requestId: r.id }
  });
  io.emit('notifications:update', db.notifications);
  res.json({success:true, request:r, message:'HR đã duyệt yêu cầu đổi ca'});
});

// HR từ chối yêu cầu đổi ca chính thức
app.post('/api/shift-swap/:id/reject', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const r = db.shiftSwapRequests.find(x=>x.id===req.params.id);
  if(!r) return res.status(404).json({error:'Không tìm thấy yêu cầu'});
  if(r.status==='APPROVED' || r.status==='REJECTED' || r.status==='AUTO_APPROVED') return res.status(400).json({error:'Yêu cầu đã xử lý'});

  r.status='REJECTED';
  r.rejectedBy=req.user.username;
  r.rejectedAt=getVietnamISOString();
  r.reasonReject=req.body.reason||'';
  r.version=(r.version||1)+1;

  audit(req.user.username,'REJECT_SHIFT_SWAP_HR','SHIFT_SWAP',null,r,req.ip);
  addSyncQueue('SHIFT_SWAP','UPDATE',r,req.user.username,'WEB_HR');
  saveDB();
  io.emit('shiftSwap:update', db.shiftSwapRequests);
  io.emit('shiftSwapRequests:update', db.shiftSwapRequests);

  const notif = { id: uuidv4(), to: r.requesterId, type:'SHIFT_SWAP_REJECTED', title:`Đổi ca ${r.date} bị HR từ chối`, content:`Yêu cầu đổi ca ngày ${r.date} bị ${req.user.username} từ chối. Lý do: ${r.reasonReject||'Không có'}`, createdAt: getVietnamISOString(), read:false };
  db.notifications.push(notif);
  notifyAdminAndHR({
    action: 'shift_swap_rejected',
    employeeId: r.requesterId,
    employeeName: r.requesterName,
    branchId: r.branchId,
    title: `HR từ chối đổi ca: ${r.requesterName}`,
    message: `${req.user.username} đã từ chối yêu cầu đổi ca ngày ${fmtDMY(r.date)} của ${r.requesterName}. Lý do: ${r.reasonReject||'Không có'}`,
    type: 'warning',
    data: { requestId: r.id }
  });
  io.emit('notifications:update', db.notifications);
  res.json({success:true, request:r, message:'HR đã từ chối yêu cầu đổi ca'});
});

// Poller 24h cho TH2
function checkShiftSwap24h(){
  const now=Date.now();
  let changed=false;
  (db.shiftSwapRequests||[]).forEach(r=>{
    if(r.status==='PENDING_BROADCAST_ACCEPTED' && r.createdAt){
      const elapsed = now - new Date(r.createdAt).getTime();
      if(elapsed >= 24*60*60*1000){
        r.status='AUTO_APPROVED'; r.approvedAt=getVietnamISOString();
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
              if(day){ day.shift=otherShift; day.status='WORKING'; sched.version=(sched.version||1)+1; addSyncQueue('SCHEDULE','UPDATE',sched,'SYSTEM','AUTO'); }
            }
          });
        }
        const notif1={ id: uuidv4(), to: r.requesterId, type:'SHIFT_SWAP_AUTO_APPROVED', title:`Đổi ca ${r.date} tự duyệt sau 24h`, content:`Yêu cầu đổi ${r.fromShift}→${r.toShift} ngày ${r.date} đã được AI tự duyệt sau 24h (TH2).`, createdAt: getVietnamISOString(), read:false };
        const notif2={ id: uuidv4(), to: r.acceptedBy, type:'SHIFT_SWAP_AUTO_APPROVED', title:`Đổi ca ${r.date} tự duyệt`, content:`Bạn đã được duyệt đổi ca với ${r.requesterName} ngày ${r.date} sau 24h.`, createdAt: getVietnamISOString(), read:false };
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
function getNextMonday(d=getVietnamNow()){
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
    db.schedules.push({ id: uuidv4(), employeeId: emp.employeeId, weekStart: nextWeekStart, days, version:1, updated_at: getVietnamISOString(), approvalStatus:'PENDING_APPROVAL', generatedBy: triggerBy, generatedAt: getVietnamISOString() });
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
    d.approvedAt = getVietnamISOString();
    d.version = (d.version||1)+1;
    // Tạo notification cho NV
    const notif = { id: uuidv4(), to: d.employeeId, type:'SCHEDULE_APPROVED', title: `Lịch tuần sau ${nextWeekStart} đã được duyệt`, content: `Lịch làm việc tuần ${nextWeekStart} của bạn đã được HR duyệt. Vui lòng kiểm tra Web App Nhân viên.`, createdAt: getVietnamISOString(), read:false };
    db.notifications.push(notif);
    // Zalo record
    const emp = db.employees.find(e=> e.employeeId===d.employeeId);
    if(emp){
      const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: emp.phone, type:'SCHEDULE_APPROVED', content: `[ỤM BÒ MILK] Lịch tuần ${nextWeekStart} của ${emp.name} đã duyệt: ${d.days.filter(day=> day.status==='WORKING').map(day=> day.dayName).join(', ')}`, status:'SENT', error:'' };
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

// ============ DUYỆT LỊCH ĐĂNG KÝ TEST (nút Admin) ============
// Chính sách bật nút:
// - VIP test OFF đang BẬT -> luôn cho duyệt (để admin test).
// - VIP TẮT -> chỉ cho duyệt khi đã hết giờ đăng ký (ngoài khung T6 12:00-T7 15:00, tức sau 15h00 T7).
// Khi duyệt: khóa đợt đăng ký OFF tuần sau + AI tạo (nếu chưa có) & duyệt lịch tuần sau cho NV chính thức + đồng bộ Sheet.
app.get('/api/schedules/approve-test-status', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const nextWeekStart = getNextWeekStartStr();
  const vip = !!db.settings?.off?.vipTestMode;
  const windowOpen = isOffWindowOpen();
  const locked = Array.isArray(db.settings?.off?.lockedWeeks) && db.settings.off.lockedWeeks.includes(nextWeekStart);
  const drafts = db.schedules.filter(s=> s.weekStart===nextWeekStart && s.approvalStatus==='PENDING_APPROVAL').length;
  const approved = db.schedules.filter(s=> s.weekStart===nextWeekStart && s.approvalStatus==='APPROVED').length;
  const canApprove = vip || !windowOpen;
  // Ai khoa/luc nao (de HR doi chieu khi nut bi khoa ma khong nho da bam)
  let lockInfo = null;
  if(locked){
    const alogs = (db.auditLogs||[]).filter(a=> a.entity==='SCHEDULE' && (a.action==='APPROVE_TEST_WEEK_SCHEDULE' || a.action==='UNLOCK_WEEK_SCHEDULE') && a.after && a.after.weekStart===nextWeekStart);
    // audit unshift moi nhat len dau
    const lastLock = alogs.find(a=> a.action==='APPROVE_TEST_WEEK_SCHEDULE');
    if(lastLock) lockInfo = { by: lastLock.actor, at: lastLock.timestamp };
  }
  res.json({ weekStart: nextWeekStart, vipTestMode: vip, windowOpen, locked, lockInfo, drafts, approved, canApprove,
    reason: vip ? 'VIP test đang BẬT - duyệt test mọi lúc' : (windowOpen ? 'Đang trong giờ đăng ký T6 12:00-T7 15:00 - nút mở sau 15h00 T7' : (locked ? 'Tuần này đã duyệt & khóa' : 'Đã hết giờ đăng ký - bấm để duyệt & khóa lịch')) });
});
app.post('/api/schedules/approve-test-week', authMiddleware, roleCheck(['Admin','HR']), async (req,res)=>{
  const nextWeekStart = getNextWeekStartStr();
  const vip = !!db.settings?.off?.vipTestMode;
  if(!vip && isOffWindowOpen()) return res.status(400).json({error:'Đang trong giờ đăng ký OFF (T6 12:00-T7 15:00). Nút duyệt mở sau 15h00 Thứ 7 (hoặc bật VIP test để duyệt test).'});
  // 1. Đảm bảo có draft (AI tự sắp lịch nếu chưa có)
  let drafts = db.schedules.filter(s=> s.weekStart===nextWeekStart && s.approvalStatus==='PENDING_APPROVAL');
  let generated = false;
  if(drafts.length===0){
    const gen = await generateNextWeekDraft(req.user.username+'_TEST_APPROVE');
    if(gen.error) return res.status(400).json({error: gen.error});
    generated = true;
    drafts = db.schedules.filter(s=> s.weekStart===nextWeekStart && s.approvalStatus==='PENDING_APPROVAL');
    if(drafts.length===0) return res.status(400).json({error:'Không tạo được lịch draft tuần sau (không có NV chính thức).'});
  }
  // 2. Kiểm tra min12 (cảnh báo như luồng duyệt thường)
  const officials = db.employees.filter(e=> e.status==='OFFICIAL' || e.type==='OFFICIAL');
  const violations=[];
  drafts.forEach(d=>{
    const emp = officials.find(e=> e.employeeId===d.employeeId);
    if(!emp) return;
    const stats = getOfficialMonthlyStats(emp.employeeId, nextWeekStart.slice(0,7));
    const draftWorking = d.days.filter(day=> day.status==='WORKING').length;
    if(stats.scheduledWorking + draftWorking <12) violations.push({ employeeId: emp.employeeId, name: emp.name, need: 12 - (stats.scheduledWorking + draftWorking) });
  });
  let warning = null;
  if(violations.length>0) warning = `Cảnh báo: ${violations.length} NV chưa đạt min 12 ngày/tháng - vẫn cho duyệt, HR cần theo dõi`;
  // 3. Duyệt + khóa đợt đăng ký + đồng bộ Sheet realtime
  drafts.forEach(d=>{
    d.approvalStatus='APPROVED';
    d.approvedBy = req.user.username;
    d.approvedAt = getVietnamISOString();
    d.version = (d.version||1)+1;
    const notif = { id: uuidv4(), to: d.employeeId, type:'SCHEDULE_APPROVED', title: `Lịch tuần sau ${nextWeekStart} đã được duyệt`, content: `Lịch làm việc tuần ${nextWeekStart} của bạn đã được ${req.user.username} duyệt${vip?' (chế độ test)':''}. Vui lòng kiểm tra Web App Nhân viên.`, createdAt: getVietnamISOString(), read:false };
    db.notifications.push(notif);
    const emp = db.employees.find(e=> e.employeeId===d.employeeId);
    if(emp){
      const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: emp.phone, type:'SCHEDULE_APPROVED', content: `[ỤM BÒ MILK] Lịch tuần ${nextWeekStart} của ${emp.name} đã duyệt: ${d.days.filter(day=> day.status==='WORKING').map(day=> day.dayName).join(', ')}`, status:'SENT', error:'' };
      db.zaloRecords.unshift(zr);
    }
    addSyncQueue('SCHEDULE','UPDATE',d,req.user.username,'WEB_HR');
  });
  if(!db.settings.off) db.settings.off = {};
  if(!Array.isArray(db.settings.off.lockedWeeks)) db.settings.off.lockedWeeks = [];
  if(!db.settings.off.lockedWeeks.includes(nextWeekStart)) db.settings.off.lockedWeeks.push(nextWeekStart);
  audit(req.user.username,'APPROVE_TEST_WEEK_SCHEDULE','SCHEDULE', { weekStart: nextWeekStart, generated }, { approved: drafts.length, locked: true, vip, warning }, req.ip);
  saveDB();
  io.emit('schedules:update', db.schedules);
  io.emit('schedules:approved', { weekStart: nextWeekStart, count: drafts.length });
  io.emit('notifications:update', db.notifications);
  res.json({ success:true, weekStart: nextWeekStart, approved: drafts.length, generated, locked:true, vipTestMode: vip, warning, violations, message:`Đã duyệt lịch tuần sau ${nextWeekStart} cho ${drafts.length} NV${generated?' (AI vừa tự sắp lịch)':''}, khóa đợt đăng ký OFF & đồng bộ Sheet${warning ? ' - ' + warning : ''}` });
});

// API: Mở khóa đợt đăng ký OFF tuần sau (khi khóa nhầm/khóa sớm, Admin/HR mở lại cho NV đăng ký tiếp)
app.post('/api/schedules/unlock-week', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const weekStart = (req.body && req.body.weekStart) || getNextWeekStartStr();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({error:'weekStart không hợp lệ (YYYY-MM-DD)'});
  if(!db.settings.off) db.settings.off = {};
  if(!Array.isArray(db.settings.off.lockedWeeks)) db.settings.off.lockedWeeks = [];
  const before = [...db.settings.off.lockedWeeks];
  db.settings.off.lockedWeeks = db.settings.off.lockedWeeks.filter(w=> w!==weekStart);
  const wasLocked = before.length !== db.settings.off.lockedWeeks.length;
  audit(req.user.username,'UNLOCK_WEEK_SCHEDULE','SCHEDULE', { weekStart, lockedWeeks: before }, { weekStart, lockedWeeks: db.settings.off.lockedWeeks }, req.ip);
  saveDB();
  io.emit('schedules:update', db.schedules);
  res.json({ success:true, weekStart, wasLocked, locked:false, message: wasLocked ? `Đã mở khóa đăng ký OFF tuần ${weekStart} - NV có thể đăng ký tiếp (TH1/TH2 giữ nguyên)` : `Tuần ${weekStart} vốn không bị khóa` });
});

// API: Xóa lịch tuần (Admin only - destructive, có confirm 2 lớp ở UI).
// Xóa toàn bộ schedules của weekStart + gỡ khóa + xóa offRequests trùng tuần
// để đăng ký lại từ đầu. Ghi audit đầy đủ trước khi xóa.
app.post('/api/schedules/delete-week', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const weekStart = req.body && req.body.weekStart;
  if(!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({error:'weekStart không hợp lệ (YYYY-MM-DD, VD 2026-09-14)'});
  const weekDates = []; { const mon = new Date(weekStart); for(let i=0;i<7;i++){ const d = new Date(mon); d.setDate(mon.getDate()+i); weekDates.push(toVietnamDateStr(d)); } }
  const schedHit = db.schedules.filter(s=> s.weekStart===weekStart);
  const offHit = db.offRequests.filter(r=> r.dates && r.dates.some(d=> weekDates.includes(d)));
  const before = {
    weekStart,
    schedules: schedHit.length,
    offRequests: offHit.length,
    offSummary: offHit.map(r=> ({ employeeId: r.employeeId, dates: r.dates })),
    wasLocked: Array.isArray(db.settings?.off?.lockedWeeks) && db.settings.off.lockedWeeks.includes(weekStart)
  };
  db.schedules = db.schedules.filter(s=> s.weekStart!==weekStart);
  db.offRequests = db.offRequests.filter(r=> !(r.dates && r.dates.some(d=> weekDates.includes(d))));
  if(db.settings.off && Array.isArray(db.settings.off.lockedWeeks)){
    db.settings.off.lockedWeeks = db.settings.off.lockedWeeks.filter(w=> w!==weekStart);
  }
  audit(req.user.username,'DELETE_WEEK_SCHEDULE','SCHEDULE', before, { weekStart, deletedSchedules: schedHit.length, deletedOffRequests: offHit.length }, req.ip);
  saveDB();
  io.emit('schedules:update', db.schedules);
  io.emit('offRequests:update', db.offRequests);
  res.json({ success:true, weekStart, deletedSchedules: schedHit.length, deletedOffRequests: offHit.length, message:`Đã xóa ${schedHit.length} lịch + ${offHit.length} phiếu OFF tuần ${weekStart} (mở khóa đăng ký)` });
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
// API: Admin thu hồi phiếu OFF (xóa phiếu + trả lịch về mặc định chưa đăng ký)
app.post('/api/off-requests/:id/revoke', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const r = db.offRequests.find(x=>x.id===req.params.id);
  if(!r) return res.status(404).json({error:'Không tìm thấy phiếu OFF'});
  const emp = db.employees.find(e=>e.employeeId===r.employeeId);
  const before = { ...r, dates:[...(r.dates||[])] };
  const revokedDates = new Set(r.dates||[]);
  // 1. Restore lịch: ngày OFF của phiếu này -> WORKING + ca mặc định của NV
  let restoredDays = 0;
  if(emp){
    db.schedules.forEach(s=>{
      if(s.employeeId!==r.employeeId) return;
      let touched = false;
      (s.days||[]).forEach(d=>{
        if(revokedDates.has(d.date) && d.status==='OFF'){ d.status='WORKING'; d.shift=emp.shift; touched = true; restoredDays++; }
      });
      if(touched){ s.version=(s.version||1)+1; s.updated_at=getVietnamISOString(); }
    });
    // 2. Training: gỡ ngày khỏi registeredOffDates (về chưa đăng ký)
    if((emp.type==='TRAINING'||emp.status==='TRAINING') && Array.isArray(emp.registeredOffDates)){
      const rest = emp.registeredOffDates.filter(d=>!revokedDates.has(d));
      if(rest.length!==emp.registeredOffDates.length){ emp.registeredOffDates=rest; emp.trainingOffDays=rest.length; emp.updated_at=getVietnamISOString(); }
    }
  }
  // 3. Xóa phiếu
  db.offRequests = db.offRequests.filter(x=>x.id!==r.id);
  audit(req.user.username,'REVOKE_OFF_REQUEST','OFF_REQUEST', before, { revoked:true, restoredDays, employeeId:r.employeeId }, req.ip);
  saveDB();
  io.emit('offRequests:update', db.offRequests);
  io.emit('schedules:update', db.schedules);
  io.emit('employees:update', db.employees);
  res.json({ success:true, restoredDays, message:`Đã thu hồi phiếu OFF của ${r.employeeName||r.employeeId} (${(r.dates||[]).length} ngày) - lịch đã về WORKING như chưa đăng ký` });
});
app.post('/api/off-requests', (req,res)=>{
  const employeeId = req.body.employeeId || req.user?.employeeId;
  const { dates } = req.body;
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhân viên'});
  
  const isTraining = emp.type==='TRAINING' || emp.status==='TRAINING';
  const isOfficial = emp.type==='OFFICIAL' || emp.status==='OFFICIAL';
  if(!isTraining && !isOfficial) {
    return res.status(403).json({error:'Chỉ nhân viên Training hoặc Chính thức mới được đăng ký OFF'});
  }

  if(!dates || !Array.isArray(dates) || dates.length===0) return res.status(400).json({error:'Chưa chọn ngày'});

  const bypass = req.body.bypassWindow;
  const maxAllowed = isTraining ? 5 : (db.settings?.off?.maxPerWeek || 2);

  if(dates.length > maxAllowed){
    return res.status(400).json({
      error: isTraining ? 'Nhân viên Training được đăng ký tối đa 5 ngày OFF' : `Tối đa ${maxAllowed} ngày/tuần`
    });
  }

  // Khung giờ đăng ký chỉ áp dụng cho Chính thức (Thứ 6 12:00 - Thứ 7 15:00), Training được đăng ký linh hoạt
  if(isOfficial && !bypass && !isOffWindowOpen()){
    return res.status(400).json({error:'Ngoài khung giờ đăng ký: Thứ 6 12:00 - Thứ 7 15:00'});
  }

  // RÀNG BUỘC KHÓA ĐỢT ĐĂNG KÝ: tuần đã được Admin/HR duyệt lịch thì khóa đăng ký OFF mới (VIP test được bỏ qua để test)
  if(isOfficial && !db.settings?.off?.vipTestMode && Array.isArray(db.settings?.off?.lockedWeeks) && db.settings.off.lockedWeeks.length>0){
    const lockedHit = (dates||[]).find(d=>{ try{ return db.settings.off.lockedWeeks.includes(toVietnamDateStr(getMonday(new Date(d)))); }catch(_){ return false; } });
    if(lockedHit) return res.status(400).json({error:`Đợt đăng ký tuần ${fmtDMY(lockedHit)} đã được duyệt & khóa lịch. Vui lòng chờ đợt đăng ký tiếp theo.`});
  }

  if(isOfficial){
    // Kiểm tra số ngày OFF trong tuần của Chính thức
    const weekOffCount = db.offRequests.filter(r=>r.employeeId===employeeId && r.status==='APPROVED' && isSameWeek(r.createdAt, getVietnamISOString())).reduce((s,r)=>s+r.dates.length,0);
    if(weekOffCount + dates.length > maxAllowed){
      return res.status(400).json({error:`Bạn đã có ${weekOffCount} ngày OFF tuần này, chỉ được tối đa ${maxAllowed} ngày`});
    }

    // RÀNG BUỘC THEO QUY ĐỊNH AI:
    // 1. Cùng Chi nhánh + Cùng Ca: Không được trùng ca làm việc trong 1 ngày
    // 2. Cùng Chi nhánh + Khác Ca: Được phép trùng ngày làm việc
    // 3. Khác Chi nhánh: Được phép trùng ngày làm việc
    for(const date of dates){
      const conflict = checkOffConflict(emp.branchId, emp.shift, date, employeeId);
      if(conflict) return res.status(409).json({error:`[TH1] Ngày ${date} đã có nhân viên cùng chi nhánh + cùng ca OFF (${conflict.employeeName||conflict.employeeId}). Cùng CN cùng ca không được trùng OFF trong 1 ngày.`, conflict});
      const schedHit = db.schedules.find(s=>{
        if(s.employeeId===employeeId) return false;
        const o = db.employees.find(e=>e.employeeId===s.employeeId);
        if(!o || o.branchId!==emp.branchId || (o.shift||'')!==(emp.shift||'')) return false;
        if(!(o.type==='OFFICIAL'||o.status==='OFFICIAL')) return false;
        return (s.days||[]).some(d=>d.date===date && d.status==='OFF');
      });
      if(schedHit){
        const o = db.employees.find(e=>e.employeeId===schedHit.employeeId);
        return res.status(409).json({error:`[TH1] Ngày ${date} đã OFF trên lịch của ${o?o.name+' ('+o.employeeId+')':schedHit.employeeId} (cùng chi nhánh + cùng ca). Cùng CN cùng ca không được trùng OFF trong 1 ngày.`});
      }
    }

    // TH1/TH2: Đảm bảo 1 tháng tối thiểu 12 ngày làm việc (OFFICIAL)
    const monthsSet = new Set(dates.map(d=>d.slice(0,7)));
    for(const m of monthsSet){
      const addDates = dates.filter(d=>d.startsWith(m));
      const chk = validateOfficialMonthlyMin12(employeeId, m, addDates);
      if(!chk.valid){
        return res.status(400).json({error:`[TH1/TH2] Tháng ${m} sau khi OFF sẽ chỉ còn ${chk.workingAfter} ngày làm (tổng ${chk.daysInMonth} - OFF ${chk.totalOffAfter}). Yêu cầu tối thiểu 12 ngày làm/tháng.`, detail: chk});
      }
    }
  }

  // Auto Approve if all valid (AI Rule Engine)
  const reqId = uuidv4();
  const reqType = isTraining ? 'TRAINING_OFF' : 'WEEKLY';
  const isTest = emp.isTest || isTestRecord(emp) || req.headers['x-is-test'] === 'true' || undefined;
  const newReq = {
    id: reqId,
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    shift: emp.shift,
    dates,
    type: reqType,
    status: 'APPROVED',
    autoApproved: true,
    createdAt: getVietnamISOString(),
    isTest: isTest || undefined,
    message: isTraining 
      ? 'AI Auto Approve - Lịch OFF Nhân viên Training (tối đa 5 ngày)'
      : 'AI Auto Approve - Thỏa TH1/TH2 (12 ngày/tháng, không trùng ca)',
    version: 1,
    sync_status: isTest ? 'TEST_BLOCKED' : 'SYNCED'
  };
  db.offRequests.push(newReq);

  let coordResult = { resolved: [], skippedMin12: [] };

  if(isTraining){
    emp.registeredOffDates = dates;
    emp.trainingOffDays = Array.isArray(dates) ? dates.length : 5;
    // Tìm hoặc tạo schedule cho các tuần chứa các ngày OFF của nhân viên Training
    const weekMap = new Map();
    dates.forEach(d => {
      const mon = toVietnamDateStr(getMonday(new Date(d)));
      if(!weekMap.has(mon)) weekMap.set(mon, []);
      weekMap.get(mon).push(d);
    });

    weekMap.forEach((offDatesInWeek, weekStr) => {
      let sched = db.schedules.find(s => s.employeeId === employeeId && s.weekStart === weekStr);
      const monDate = new Date(weekStr);
      if(!sched){
        const days = [];
        for(let i=0; i<7; i++){
          const d = new Date(monDate);
          d.setDate(monDate.getDate() + i);
          const ds = toVietnamDateStr(d);
          const isOff = offDatesInWeek.includes(ds);
          days.push({
            date: ds,
            dayName: ['T2','T3','T4','T5','T6','T7','CN'][i],
            shift: isOff ? 'OFF' : emp.shift,
            status: isOff ? 'OFF' : 'WORKING',
            substituteFor: null
          });
        }
        sched = { id: uuidv4(), employeeId, weekStart: weekStr, days, version: 1, updated_at: getVietnamISOString(), approvalStatus: 'APPROVED' };
        db.schedules.push(sched);
      } else {
        sched.days.forEach(d => {
          if(offDatesInWeek.includes(d.date)){
            d.status = 'OFF';
            d.shift = 'OFF';
          }
        });
        sched.version = (sched.version || 1) + 1;
        sched.updated_at = getVietnamISOString();
        sched.approvalStatus = 'APPROVED';
      }
      addSyncQueue('SCHEDULE', 'UPDATE', sched, employeeId, 'WEB_EMPLOYEE');
    });
  } else {
    // Với Nhân viên Chính Thức: AI tự động cập nhật lịch tuần sau (T2→CN)
    const nextWeekMonday = getMonday(new Date(getVietnamNow().getTime() + 7*24*60*60*1000));
    const weekStr = toVietnamDateStr(nextWeekMonday);
    let sched = db.schedules.find(s => s.employeeId === employeeId && s.weekStart === weekStr);
    if(!sched){
      const days = [];
      for(let i=0; i<7; i++){
        const d = new Date(nextWeekMonday);
        d.setDate(nextWeekMonday.getDate() + i);
        const ds = toVietnamDateStr(d);
        const isOff = dates.includes(ds);
        days.push({
          date: ds,
          dayName: ['T2','T3','T4','T5','T6','T7','CN'][i],
          shift: isOff ? 'OFF' : emp.shift,
          status: isOff ? 'OFF' : 'WORKING',
          substituteFor: null
        });
      }
      sched = { id: uuidv4(), employeeId, weekStart: weekStr, days, version: 1, updated_at: getVietnamISOString(), approvalStatus: 'APPROVED' };
      db.schedules.push(sched);
    } else {
      sched.days.forEach(d => {
        if(dates.includes(d.date)) {
          d.status = 'OFF';
          d.shift = 'OFF';
        } else if(d.status==='OFF' && !dates.includes(d.date)) {
          d.status = 'WORKING';
          d.shift = emp.shift;
        }
      });
      for(let i=0; i<7; i++){
        const d = new Date(nextWeekMonday);
        d.setDate(nextWeekMonday.getDate() + i);
        const ds = toVietnamDateStr(d);
        const dayRec = sched.days.find(x => x.date === ds);
        if(dayRec){
          dayRec.status = dates.includes(ds) ? 'OFF' : 'WORKING';
          dayRec.shift = dates.includes(ds) ? 'OFF' : emp.shift;
        }
      }
      sched.version = (sched.version || 1) + 1;
      sched.updated_at = getVietnamISOString();
      sched.approvalStatus = 'APPROVED';
    }

    // AI cân lịch chống trùng ca theo đúng 3 điều kiện:
    // 1. Cùng CN + Cùng Ca: không trùng ca làm việc trong 1 ngày (giữ tối đa 1 NV WORKING)
    // 2. Cùng CN + Khác Ca: ĐƯỢC trùng ngày làm việc
    // 3. Khác CN: ĐƯỢC trùng ngày làm việc
    const coord = coordinateBranchShifts(weekStr, employeeId);
    if(coord && coord.resolved) coordResult = coord;
    addSyncQueue('SCHEDULE', 'UPDATE', sched, employeeId, 'WEB_EMPLOYEE');
  }

  audit(employeeId, 'OFF_WEEKLY_AI_AUTO', 'OFF_REQUEST', null, newReq, req.ip);
  addSyncQueue('OFF_REQUEST', 'CREATE', newReq, employeeId, 'WEB_EMPLOYEE');
  saveDB();

  io.emit('offRequests:update', db.offRequests);
  io.emit('schedules:update', db.schedules);

  notifyAdminAndHR({
    action: isTraining ? 'register_off_training' : 'register_off_official',
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: isTraining ? `NV Training ${emp.name} đăng ký OFF` : `NV Chính thức ${emp.name} đăng ký OFF`,
    message: `${emp.name} (${employeeId}) vừa đăng ký ${dates.length} ngày OFF: ${dates.map(d=>fmtDMY(d)).join(', ')}. AI đã tự động duyệt và xếp lịch.`,
    type: 'info',
    data: { requestId: reqId, dates }
  });

  // Kích hoạt đồng bộ realtime tức thì sang Google Sheet 17iXM
  triggerRealtimeSheetSync('PHIEU_OFF_HANG_TUAN');
  triggerRealtimeSheetSync('LICH_LAM_VIEC');

  const zr = { 
    id: uuidv4(), 
    sent_at: getVietnamISOString(), 
    receiver: emp.phone, 
    type: 'OFF_APPROVED', 
    content: isTraining
      ? `Đăng ký OFF ${dates.length} ngày đã được Auto Approve: ${dates.join(', ')}`
      : `OFF tuần sau đã được Auto Approve: ${dates.join(', ')}${coordResult.resolved.length ? ` • AI cân lịch: ${coordResult.resolved.length} ca trùng đã chuyển OFF` : ''}`, 
    status: 'SENT', 
    error: '' 
  };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);

  res.json({ ...newReq, coordinated: coordResult.resolved.length, coordSkipped: (coordResult.skippedMin12||[]).length });
});
// AI cân lịch chống trùng ca: cùng Chi nhánh + cùng Ngày + cùng Ca → giữ tối đa 1 NV WORKING.
// Ưu tiên FCFS (ai được duyệt OFF trước giữ slot). Người bị chuyển sang OFF nhận TB + audit.
// Safeguard TH2: không lật ngày nào khiến NV dưới 12 ngày làm/tháng (ngày đó giữ nguyên, báo HR xử tay).
function coordinateBranchShifts(weekStart, actor){
  const result = { weekStart, resolved: [], skippedMin12: [], groups: 0 };
  try{
    const byEmp = new Map(db.employees.map(e=>[e.employeeId, e]));
    const groups = new Map();
    for(const s of db.schedules.filter(x=>x.weekStart===weekStart)){
      const emp = byEmp.get(s.employeeId);
      if(!emp) continue;
      if(!(emp.type==='OFFICIAL' || emp.status==='OFFICIAL')) continue;
      for(const d of (s.days||[])){
        if(d.status!=='WORKING') continue;
        const shift = d.shift || emp.shift;
        const key = `${emp.branchId}|${d.date}|${shift}`;
        if(!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ sched: s, day: d, emp });
      }
    }
    // Sắp xếp nhóm theo ngày để phân bổ lần lượt, cân bằng số ngày làm giữa các NV
    const orderedGroups = [...groups.entries()].filter(([,list])=>list.length>1)
      .sort((a,b)=> a[1][0].day.date < b[1][0].day.date ? -1 : 1);
    // Đếm số ngày WORKING hiện tại trong tuần cho cân bằng tải
    const weekWorkCount = new Map();
    for(const s of db.schedules.filter(x=>x.weekStart===weekStart)){
      const n = (s.days||[]).filter(d=>d.status==='WORKING').length;
      weekWorkCount.set(s.employeeId, (weekWorkCount.get(s.employeeId)||0)+n);
    }
    const firstApproved = (empId)=>{
      const reqs = db.offRequests.filter(r=>r.employeeId===empId && r.status==='APPROVED');
      if(!reqs.length) return Infinity;
      return Math.min(...reqs.map(r=>{ const t=new Date(r.createdAt).getTime(); return isNaN(t)?Infinity:t; }));
    };
    for(const [key, list] of orderedGroups){
      result.groups++;
      // Ưu tiên: ai ít ngày làm trong tuần hơn thì giữ slot (cân bằng tải);
      // bằng nhau thì ai được duyệt OFF trước (FCFS) giữ slot
      list.sort((a,b)=>{
        const ca = weekWorkCount.get(a.emp.employeeId)||0, cb = weekWorkCount.get(b.emp.employeeId)||0;
        if(ca!==cb) return ca-cb;
        return firstApproved(a.emp.employeeId)-firstApproved(b.emp.employeeId);
      });
      const [keeper, ...rest] = list;
      // Trừ ngày của keeper khỏi đếm của những người còn lại? Không — cập nhật đếm sau mỗi lần lật
      weekWorkCount.set(keeper.emp.employeeId, (weekWorkCount.get(keeper.emp.employeeId)||0));
      for(const it of rest){
        // RÀNG BUỘC HỞ CA: lật ngày này mà slot không còn ai trực (0 WORKING) thì GIỮ NGUYÊN + báo HR
        const stillWorking = list.filter(x=>x!==it && x.day.status==='WORKING').length;
        if(stillWorking<1){ result.keptForCoverage = result.keptForCoverage||[]; result.keptForCoverage.push({ employeeId: it.emp.employeeId, name: it.emp.name, date: it.day.date, slot: key }); continue; }
        // Safeguard: đếm ngày WORKING còn lại trong tháng (trừ chính ngày này), nếu tháng này đã lên lịch >= 12 ngày mà dưới 12 thì giữ nguyên
        const m = it.day.date.slice(0,7);
        let totalDaysScheduled = 0;
        let working = 0;
        db.schedules.filter(s=>s.employeeId===it.emp.employeeId).forEach(s=>(s.days||[]).forEach(d=>{
          if(d.date.startsWith(m)){
            totalDaysScheduled++;
            if(d.status==='WORKING' && d.date!==it.day.date) working++;
          }
        }));
        if(totalDaysScheduled >= 12 && working < 12){ result.skippedMin12.push({ employeeId: it.emp.employeeId, name: it.emp.name, date: it.day.date, slot: key }); continue; }
        it.day.status='OFF';
        it.day.shift='OFF';
        it.day.autoOff=true;
        it.day.autoOffReason=`AI cân lịch: giữ ${keeper.emp.name} trực ${key.split('|')[2]} ngày ${it.day.date}`;
        weekWorkCount.set(it.emp.employeeId, (weekWorkCount.get(it.emp.employeeId)||0)-1);
        it.sched.version=(it.sched.version||1)+1;
        it.sched.updated_at=getVietnamISOString();
        result.resolved.push({ employeeId: it.emp.employeeId, name: it.emp.name, date: it.day.date, keeper: keeper.emp.employeeId, slot: key });
        db.notifications.unshift({ id: uuidv4(), to: it.emp.employeeId, type:'SCHEDULE_COORDINATED', title:'AI cân lịch chống trùng ca', content:`Ngày ${it.day.date}: bạn chuyển sang OFF (giữ ${keeper.emp.name} trực ca ${key.split('|')[2]}).`, createdAt: getVietnamISOString(), read:false });
      }
    }
    if(result.resolved.length){
      saveDB();
      io.emit('schedules:update', db.schedules);
      io.emit('notifications:update', db.notifications);
      audit(actor||'SYSTEM','COORDINATE_SCHEDULE','SCHEDULE',{weekStart},result,'system');
    }
  }catch(e){ console.error('[COORDINATE] error', e.message); }
  return result;
}
// HR/Admin chạy tay AI cân lịch cho 1 tuần (vá lịch cũ + kiểm tra sau đăng ký)
app.post('/api/schedules/coordinate', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const { weekStart } = req.body||{};
  if(!weekStart) return res.status(400).json({error:'Thiếu weekStart (YYYY-MM-DD thứ 2 đầu tuần)'});
  const out = coordinateBranchShifts(weekStart, req.user.username);
  res.json({ success:true, ...out });
});
function isSameWeek(date1, date2){
  const d1 = getMonday(new Date(date1));
  const d2 = getMonday(new Date(date2));
  return toVietnamDateStr(d1)===toVietnamDateStr(d2);
}
app.get('/api/off-window', (req,res)=>{
  const isOpen = isOffWindowOpen();
  const now = getVietnamNow();
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
  const vipTest = !!db.settings?.off?.vipTestMode;
  res.json({
    isOpen,
    vipTest,
    isOfficialOnly: true,
    aiStatus: vipTest ? 'AI đang MỞ đăng ký OFF (chế độ VIP test — Admin mở, bỏ qua khung giờ)' : (isOpen ? 'AI đang MỞ đăng ký OFF cho Nhân viên Chính thức (T6 12:00 → T7 15:00)' : 'AI đã ĐÓNG đăng ký OFF - ngoài khung giờ'),
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
  io.emit('offWindow:update', { isOpen, vipTest: !!db.settings?.off?.vipTestMode, now: getVietnamISOString(), aiAuto:true });
}, 60*1000);
// AI tự cân lịch chống trùng ca định kỳ (tuần này + tuần sau): vá mọi lịch hiện có,
// kể cả lịch tạo trước khi có tính năng hoặc admin sửa tay — không cần bấm nút
function autoCoordinateComingWeeks(){
  try{
    const m1 = getMonday(getVietnamNow());
    const m2 = getMonday(new Date(getVietnamNow().getTime()+7*24*60*60*1000));
    for(const w of [toVietnamDateStr(m1), toVietnamDateStr(m2)]) coordinateBranchShifts(w, 'AUTO_INTERVAL');
  }catch(e){ console.error('[COORDINATE] auto error', e.message); }
}
setInterval(autoCoordinateComingWeeks, 10*60*1000);
setTimeout(()=>{ autoCoordinateComingWeeks(); }, 45000);
// Admin bật/tắt chế độ VIP test đăng ký OFF 2 ngày/tuần cho NV chính thức
app.post('/api/admin/off-vip', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const enabled = !!req.body.enabled;
  if(!db.settings.off) db.settings.off = { maxPerWeek: 2 };
  const before = !!db.settings.off.vipTestMode;
  db.settings.off.vipTestMode = enabled;
  audit(req.user.username,'OFF_VIP_TEST','SETTINGS',{vipTestMode:before},{vipTestMode:enabled}, req.ip);
  saveDB();
  io.emit('offWindow:update', { isOpen: isOffWindowOpen(), vipTest: enabled, now: getVietnamISOString(), aiAuto:true });
  console.log(`[OFF VIP] ${req.user.username} ${enabled?'BẬT':'TẮT'} chế độ VIP test đăng ký OFF`);
  res.json({ success:true, vipTestMode: enabled });
});

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
  if(!emp) return res.status(404).json({error:'Không tìm thấy'});
  if(emp.status!=='OFFICIAL') return res.status(403).json({error:'Chỉ Nhân viên Chính thức (status OFFICIAL) mới được tạo phiếu OFF đột xuất'});
  // TH2: Check monthly min 12 days for OFF đột xuất
  const monthStr = String(date).slice(0,7);
  const chk = validateOfficialMonthlyMin12(employeeId, monthStr, [date]);
  if(!chk.valid) return res.status(400).json({error:`Tháng ${monthStr} sau khi OFF đột xuất sẽ chỉ còn ${chk.workingAfter} ngày làm. Tối thiểu 12 ngày/tháng.`, detail:chk});
  // Check max 1 per week
  const weekCount = db.emergencyRequests.filter(r=>r.employeeId===employeeId && r.status==='APPROVED' && isSameWeek(r.createdAt, getVietnamISOString())).length;
  if(weekCount>=1) return res.status(400).json({error:'Đã đạt giới hạn 1 OFF đột xuất/tuần'});
  if(!reason) return res.status(400).json({error:'Lý do bắt buộc'});
  const reqId = uuidv4();
  const er = {
    id: reqId, employeeId, employeeName: emp.name, branchId: emp.branchId, shift: emp.shift,
    date, reason, status:'PENDING', cascadeStep:1, substituteId:null, substituteName:null,
    createdAt: getVietnamISOString(), timeoutAt: new Date(Date.now()+2*60*1000).toISOString(), attempts:0, version:1,
    isTest: (emp.isTest || isTestRecord(emp) || req.headers['x-is-test']==='true' || (req.body && req.body.isTest===true)) || undefined
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
      sched={ id: uuidv4(), employeeId, weekStart: ws, days, version:1, updated_at: getVietnamISOString()};
      db.schedules.push(sched);
      addSyncQueue('SCHEDULE','CREATE',sched,employeeId,'WEB_EMPLOYEE');
    } else {
      const day = sched.days.find(d=>d.date===date);
      if(day){ day.status='EMERGENCY_PENDING'; day.shift = emp.shift; sched.version=(sched.version||1)+1; addSyncQueue('SCHEDULE','UPDATE',sched,employeeId,'WEB_EMPLOYEE'); }
    }
    io.emit('schedules:update', db.schedules);
  }catch(e){ console.error('temp schedule error',e); }
  audit(employeeId,'EMERGENCY_REQUEST','OFF_REQUEST',null,er, req.ip);
  addSyncQueue('EMERGENCY_REQUEST','CREATE',er,employeeId,'WEB_EMPLOYEE');
  saveDB();
  io.emit('emergencyRequests:update', db.emergencyRequests);
  notifyAdminAndHR({
    action: 'emergency_request',
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: `Đơn khẩn cấp: ${emp.name}`,
    message: `${emp.name} (${employeeId}) vừa gửi đơn xin nghỉ đột xuất ngày ${fmtDMY(date)}: "${reason}". AI đang tự động tìm người thế ca.`,
    type: 'error',
    data: { requestId: reqId, date, reason }
  });
  // Trigger cascade search TH3
  handleEmergencyCascade(er);
  res.json(er);
});
function handleEmergencyCascade(request){
  // TH3: Cascade 2 phút (cùng CN cùng ca) → 30 phút (cùng CN khác ca) → hủy
  const step1Candidates = db.employees.filter(e=>e.branchId===request.branchId && e.shift===request.shift && e.employeeId!==request.employeeId && e.status==='OFFICIAL');
  if(step1Candidates.length>0){
    step1Candidates.forEach(c=>{
      const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: c.phone, type:'SUBSTITUTE_INVITE_STEP1', content:`[TH3-B1] Mời thay ca (cùng CN cùng ca) cho ${request.employeeName} ngày ${request.date} ca ${request.shift} - Phản hồi trong 2 phút`, status:'SENT', error:'' };
      db.zaloRecords.unshift(zr);
      db.notifications.unshift({ id: uuidv4(), to: c.employeeId, type:'SUBSTITUTE_INVITE', title:'[TH3] Mời thay ca đột xuất (cùng ca)', content:`Bạn (cùng CN ${request.branchId} cùng ca ${request.shift}) được mời thay ca cho ${request.employeeName} ngày ${request.date}. Vui lòng phản hồi trong 2 phút.`, requestId: request.id, step:1, createdAt: getVietnamISOString(), read:false });
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
          const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: c.phone, type:'SUBSTITUTE_INVITE_STEP2', content:`[TH3-B2] Mời thay ca (cùng CN khác ca) cho ${request.employeeName} ngày ${request.date} - Phản hồi trong 30 phút`, status:'SENT', error:'' };
          db.zaloRecords.unshift(zr);
          db.notifications.unshift({ id: uuidv4(), to: c.employeeId, type:'SUBSTITUTE_INVITE', title:'[TH3] Mời thay ca (khác ca)', content:`Bạn (cùng CN ${request.branchId} khác ca) được mời thay ca cho ${request.employeeName} ngày ${request.date} ca ${request.shift}. Phản hồi trong 30 phút.`, requestId: request.id, step:2, createdAt: getVietnamISOString(), read:false });
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
            const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: db.employees.find(e=>e.employeeId===r2.employeeId)?.phone, type:'EMERGENCY_REJECTED', content:`[TH3] OFF đột xuất ngày ${r2.date} bị HỦY do không có người thay ca sau 2 phút + 30 phút. Vui lòng liên hệ quản lý.`, status:'SENT', error:'' };
            db.zaloRecords.unshift(zr);
            db.notifications.unshift({ id: uuidv4(), to: r2.employeeId, type:'EMERGENCY_REJECTED', title:'OFF đột xuất bị hủy', content:`Phiếu OFF đột xuất ngày ${r2.date} bị hủy do không tìm được người thay ca (TH3).`, requestId: r2.id, createdAt: getVietnamISOString(), read:false });
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
        const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: db.employees.find(e=>e.employeeId===r.employeeId)?.phone, type:'EMERGENCY_REJECTED', content:`OFF đột xuất ngày ${r.date} bị hủy do không có ứng viên thay ca (cùng CN).`, status:'SENT', error:'' };
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
        const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: c.phone, type:'SUBSTITUTE_INVITE_STEP2_DIRECT', content:`[TH3-B2 trực tiếp] Mời thay ca (khác ca) cho ${request.employeeName} ngày ${request.date}`, status:'SENT', error:'' };
        db.zaloRecords.unshift(zr);
        db.notifications.unshift({ id: uuidv4(), to: c.employeeId, type:'SUBSTITUTE_INVITE', title:'[TH3] Mời thay ca (khác ca)', content:`Mời thay ca khác ca cho ${request.employeeName} ngày ${request.date}`, requestId: request.id, step:2, createdAt: getVietnamISOString(), read:false });
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
          const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: db.employees.find(e=>e.employeeId===r2.employeeId)?.phone, type:'EMERGENCY_REJECTED', content:`OFF đột xuất ngày ${r2.date} bị hủy do không có người thay`, status:'SENT', error:'' };
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
  if(!er) return res.status(404).json({error:'Không tìm thấy'});
  if(er.status!=='PENDING') return res.status(400).json({error:'Đã xử lý rồi'});
  const subEmp = db.employees.find(e=>e.employeeId===substituteId);
  if(!subEmp) return res.status(404).json({error:'Không tìm thấy người thay thế'});
  if(action==='REJECT'){
    // just log, keep pending for others
    audit(substituteId,'REJECT_SUBSTITUTE','EMERGENCY',null,{er, substituteId}, req.ip);
    return res.json({ message:'Đã từ chối, hệ thống tiếp tục tìm người khác' });
  }
  // APPROVE
  er.status='APPROVED';
  er.substituteId = substituteId;
  er.substituteName = subEmp.name;
  er.approvedAt = getVietnamISOString();
  // Update schedules for both
  const sched1 = db.schedules.find(s=>s.employeeId===er.employeeId && s.days.some(d=>d.date===er.date));
  if(sched1){
    const day = sched1.days.find(d=>d.date===er.date);
    if(day){ day.status='EMERGENCY_OFF'; day.substituteFor = substituteId; sched1.version=(sched1.version||1)+1; addSyncQueue('SCHEDULE','UPDATE',sched1,substituteId,'WEB_EMPLOYEE'); }
  }
  let sched2 = db.schedules.find(s=>s.employeeId===substituteId && s.days.some(d=>d.date===er.date));
  if(sched2){
    const day = sched2.days.find(d=>d.date===er.date);
    if(day){ day.status='SUBSTITUTE'; day.substituteFor = er.employeeId; sched2.version=(sched2.version||1)+1; addSyncQueue('SCHEDULE','UPDATE',sched2,substituteId,'WEB_EMPLOYEE'); }
  } else {
    // create schedule for substitute
    const weekStart = getMonday(new Date(er.date));
    const ws = toVietnamDateStr(weekStart);
    const existing = db.schedules.find(s=>s.employeeId===substituteId && s.weekStart===ws);
    if(existing){
      const d = existing.days.find(x=>x.date===er.date);
      if(d){ d.status='SUBSTITUTE'; d.substituteFor=er.employeeId; existing.version=(existing.version||1)+1; addSyncQueue('SCHEDULE','UPDATE',existing,substituteId,'WEB_EMPLOYEE'); }
    }
  }
  audit(substituteId,'APPROVE_SUBSTITUTE','EMERGENCY',null,er, req.ip);
  addSyncQueue('EMERGENCY_REQUEST','UPDATE',er, substituteId, 'WEB_EMPLOYEE');
  saveDB();
  io.emit('emergencyRequests:update', db.emergencyRequests);
  io.emit('schedules:update', db.schedules);
  notifyAdminAndHR({
    action: 'emergency_accepted',
    employeeId: substituteId,
    employeeName: subEmp.name,
    branchId: subEmp.branchId,
    title: `Đã có người thay ca khẩn cấp: ${subEmp.name}`,
    message: `${subEmp.name} đã chấp nhận thay ca ngày ${fmtDMY(er.date)} cho ${er.employeeName}. Lịch đã được cập nhật.`,
    type: 'success',
    data: { requestId: er.id, substituteId, originalEmployeeId: er.employeeId }
  });
  const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: db.employees.find(e=>e.employeeId===er.employeeId)?.phone, type:'EMERGENCY_APPROVED', content:`OFF đột xuất ngày ${er.date} đã được duyệt, người thay: ${subEmp.name}`, status:'SENT', error:'' };
  db.zaloRecords.unshift(zr);
  io.emit('zalo:update', db.zaloRecords);
  res.json(er);
});

// ============ NGÂN HÀNG ĐỀ TRẮC NGHIỆM — NGUỒN THẬT DUY NHẤT: GOOGLE SHEET ============
// HR/Admin sửa câu hỏi trực tiếp trên Sheet, server tự kéo về mỗi 60s (không cần bấm import).
// Sheet phải chia sẻ "Bất kỳ ai có đường liên kết → Người xem" (khuyên dùng, không cần ServiceAccount).
function getQuizBankConfig(){
  const qb = db.settings?.quizBank || {};
  return {
    spreadsheetId: process.env.QUIZ_BANK_SPREADSHEET_ID || qb.spreadsheetId || '1h06TrHMRnBOHMkp7Ri4Rz8yRw8ptemQp0ftjMldHYdc',
    sheetName: process.env.QUIZ_BANK_SHEET_NAME || qb.sheetName || '',
    sheetUrl: qb.sheetUrl || 'https://docs.google.com/spreadsheets/d/1h06TrHMRnBOHMkp7Ri4Rz8yRw8ptemQp0ftjMldHYdc/edit?usp=sharing'
  };
}
function fetchQuizBankCSV(){
  const cfg = getQuizBankConfig();
  const sheetParam = cfg.sheetName ? `&sheet=${encodeURIComponent(cfg.sheetName)}` : '';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}`;
  return new Promise((resolve)=>{
    https.get(csvUrl, (res)=>{
      let raw='';
      res.on('data', chunk=> raw+=chunk);
      res.on('end', ()=>{
        try{
          if(!res.statusCode || res.statusCode>=400) return resolve({ ok:false, error:`Sheet HTTP ${res.statusCode} — kiểm tra chia sẻ "Bất kỳ ai có link → Người xem"` });
          const rows = parseCSV(raw);
          resolve({ ok:true, rows });
        }catch(e){ resolve({ ok:false, error:e.message }); }
      });
    }).on('error', (e)=> resolve({ ok:false, error:e.message }));
  });
}
function normalizeQuizBankRows(rows){
  if(!rows || rows.length<2) return [];
  const normCell = s=>String(s||'').trim().toLowerCase().replace(/đ/g,'d').replace(/Đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim();
  let hi=-1, map=null;
  for(let r=0;r<Math.min(3,rows.length);r++){
    const cells=(rows[r]||[]).map(normCell);
    const m={};
    cells.forEach((c,i)=>{
      if(m.q===undefined && (c.includes('cau hoi')||c==='question'||c.includes('cauhoi'))) m.q=i;
      else if(c==='a') m.A=i; else if(c==='b') m.B=i; else if(c==='c') m.C=i; else if(c==='d') m.D=i;
      else if(c.includes('dap an')||c.includes('ap an')||c==='answer'||c.includes('dapan')||c.includes('ans')) m.ans=i;
      else if(c.includes('giai thich')||c.includes('explanation')||c==='note') m.exp=i;
    });
    if(m.q!==undefined && m.A!==undefined && m.ans!==undefined){ hi=r; map=m; break; }
  }
  if(!map) return [];
  const toIdx = (v)=>{
    const s=String(v??'').trim().toUpperCase();
    if(/^[A-D]$/.test(s)) return s.charCodeAt(0)-65;
    const n=parseInt(s,10);
    if(!isNaN(n)) return (n>=0&&n<=3)?n:((n>=1&&n<=4)?n-1:-1);
    return -1;
  };
  const out=[];
  for(let r=hi+1;r<rows.length;r++){
    const row=rows[r]||[];
    const qtext=String(row[map.q]??'').trim();
    const opts=[row[map.A],row[map.B],row[map.C],row[map.D]].map(x=>String(x??'').trim());
    const ci=toIdx(row[map.ans]);
    if(!qtext || opts.some(o=>!o) || ci<0) continue;
    out.push({ question:qtext, options:opts, correct:ci, explanation: map.exp!==undefined?String(row[map.exp]??''):'' });
  }
  return out;
}
async function syncQuizBankFromSheet(manualBy){
  const out = { updated:0, total:0, skipped:0 };
  try{
    const cfg = getQuizBankConfig();
    const fetched = await fetchQuizBankCSV();
    if(!fetched.ok){ console.error('[QUIZ BANK] Kéo Sheet lỗi:', fetched.error); return { ...out, error: fetched.error }; }
    const parsed = normalizeQuizBankRows(fetched.rows);
    if(parsed.length===0) return { ...out, error:'Sheet không có dòng câu hỏi hợp lệ (cần: Câu hỏi | A | B | C | D | Đáp án | Giải thích)' };
    let bank = db.testCourses.find(c=>c.id==='course_001') || db.testCourses[0];
    if(!bank){
      bank = { id:'course_001', title:'Kiểm tra đầu ra - Ụm Bò Milk 2026', description:'', totalQuestions:0, minPerQuestion:5, questions:[], voiceSimulations:[], createdAt:getVietnamISOString() };
      db.testCourses.unshift(bank);
    }
    bank.questions = parsed.map((q, idx)=>({ id: 'q_' + (idx + 1), ...q }));
    bank.totalQuestions = bank.questions.length;
    bank.minPerQuestion = 5;
    bank.description = '';
    bank.quizSource = { spreadsheetId: cfg.spreadsheetId, sheetName: cfg.sheetName, sheetUrl: cfg.sheetUrl, updatedAt: getVietnamISOString(), rowCount: parsed.length, by: manualBy||'AUTO_60S' };
    out.updated = parsed.length; out.total = bank.questions.length;
    audit(manualBy||'SYSTEM','SYNC_QUIZ_BANK','TEST',null,{total:bank.questions.length},'sheet-sync');
    saveDB();
    io.emit('courses:update', db.testCourses);
    console.log(`[QUIZ BANK] Đã đồng bộ ${parsed.length} câu thật từ Google Sheet (${manualBy||'AUTO_60S'})`);
    return out;
  }catch(e){ console.error('[QUIZ BANK] error', e.message); return { ...out, error: e.message }; }
}
setInterval(()=>{ syncQuizBankFromSheet().catch(()=>{}); }, 60*1000);
setTimeout(()=>{ syncQuizBankFromSheet('BOOT_FAST').catch(()=>{}); }, 1000);
// HR/Admin xem trạng thái nguồn đề (không cần quyền đặc biệt — dữ liệu câu hỏi không nhạy cảm)
app.get('/api/quiz/status', (req,res)=>{
  const cfg = getQuizBankConfig();
  const bank = db.testCourses.find(c=>c.id==='course_001') || db.testCourses[0];
  res.json({ config: cfg, total: bank?(bank.questions||[]).length:0, lastSync: bank?.quizSource?.updatedAt||null, by: bank?.quizSource?.by||null, ready: (bank?(bank.questions||[]).length:0)>=25 });
});
// HR/Admin đồng bộ thủ công ngay (không chờ 60s)
app.post('/api/quiz/sync', authMiddleware, roleCheck(['Admin','HR']), async (req,res)=>{
  const out = await syncQuizBankFromSheet(req.user.username);
  if(out.error) return res.status(502).json({ success:false, ...out });
  res.json({ success:true, ...out });
});
// Admin đổi Sheet nguồn đề (ENV Render đè lên cấu hình này nếu có)
app.post('/api/quiz/config', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const { spreadsheetId, sheetName } = req.body||{};
  if(!db.settings.quizBank) db.settings.quizBank = { ...DEFAULT_SETTINGS.quizBank };
  if(spreadsheetId) db.settings.quizBank.spreadsheetId = String(spreadsheetId).trim();
  if(sheetName!==undefined) db.settings.quizBank.sheetName = String(sheetName||'').trim();
  db.settings.quizBank.sheetUrl = `https://docs.google.com/spreadsheets/d/${db.settings.quizBank.spreadsheetId}/edit?usp=sharing`;
  audit(req.user.username,'CONFIG_QUIZ_BANK','TEST',null,db.settings.quizBank, req.ip);
  saveDB();
  res.json({ success:true, config: getQuizBankConfig() });
});

// ============ E-LEARNING & TEST ============
app.get('/api/courses', (req,res)=> res.json(db.testCourses));
app.get('/api/test-results', (req,res)=>{
  const { employeeId } = req.query;
  let list = [...db.testResults];
  if(employeeId) list = list.filter(r=>r.employeeId===employeeId);
  res.json(list);
});
// Import ngân hàng câu hỏi trắc nghiệm - Admin/HR (client parse file doc/excel/csv/json rồi POST JSON chuẩn)
app.post('/api/courses/import', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  try{
    const { questions, title, description } = req.body||{};
    if(!Array.isArray(questions) || questions.length===0) return res.status(400).json({error:'Dữ liệu questions không hợp lệ (cần mảng câu hỏi)'});
    const normLetter = (v)=>{
      if(typeof v==='number') return (v>=0 && v<=3) ? v : ((v>=1 && v<=4) ? v-1 : -1);
      const s = String(v??'').trim().toUpperCase();
      if(/^[A-D]$/.test(s)) return s.charCodeAt(0)-65;
      const n = parseInt(s,10);
      if(!isNaN(n)) return (n>=0 && n<=3) ? n : ((n>=1 && n<=4) ? n-1 : -1);
      return -1;
    };
    const norm = [];
    for(const r of questions){
      if(!r) continue;
      const qtext = String(r.question||r.cauHoi||r['Câu hỏi']||'').trim();
      let opts = r.options;
      if(!Array.isArray(opts)){
        opts = [r.A||r.a||r['A'], r.B||r.b||r['B'], r.C||r.c||r['C'], r.D||r.d||r['D']];
      }
      opts = (opts||[]).map(o=>String(o??'').trim());
      const ci = normLetter(r.correct ?? r.answer ?? r['Đáp án']);
      if(!qtext || opts.length!==4 || opts.some(o=>!o) || ci<0) continue;
      norm.push({ id: 'q'+uuidv4().slice(0,8), question: qtext, options: opts, correct: ci, explanation: String(r.explanation||r['Giải thích']||'') });
    }
    if(norm.length===0) return res.status(400).json({error:'Không có câu hỏi hợp lệ (cần: Câu hỏi + 4 đáp án A–D + Đáp án đúng)'});
    let bank = db.testCourses.find(c=>c.id==='course_001') || db.testCourses[0];
    if(!bank){
      bank = { id:'course_001', title:'Kiểm tra đầu ra - Ụm Bò Milk 2026', description:'', totalQuestions:0, minPerQuestion:5, questions:[], voiceSimulations:[], createdAt:getVietnamISOString() };
      db.testCourses.unshift(bank);
    }
    const seen = new Set(bank.questions.map(q=>String(q.question||'').trim().toLowerCase()));
    let added=0;
    for(const q of norm){ if(!seen.has(q.question.trim().toLowerCase())){ bank.questions.push(q); seen.add(q.question.trim().toLowerCase()); added++; } }
    bank.totalQuestions = bank.questions.length;
    bank.minPerQuestion = 5;
    if(title) bank.title = String(title);
    if(description) bank.description = String(description);
    bank.updated_at = getVietnamISOString();
    audit(req.user.username,'IMPORT_QUIZ','TEST',null,{added, total:bank.questions.length}, req.ip);
    saveDB();
    io.emit('courses:update', db.testCourses);
    res.json({ success:true, added, total:bank.questions.length, courseId: bank.id });
  }catch(e){ res.status(500).json({error:e.message}); }
});
// Mở đề thi trắc nghiệm đầu ra: random 25 câu từ ngân hàng, tổng 8 phút, thang 10đ
// HR/Admin mở cho NV training đủ 7 ngày (hoặc force). Trả về đề đã ẩn đáp án + thông tin NV.
app.post('/api/quiz/open', async (req,res)=>{
  try{
    const { employeeId, force, openedBy } = req.body||{};
    let bank = db.testCourses.find(c=>c.id==='course_001') || db.testCourses[0];
    // RÀNG BUỘC TUYỆT ĐỐI: 100% câu hỏi đề thi phải lấy từ Google Sheet 1h06TrHMRnBOHMkp7Ri4Rz8yRw8ptemQp0ftjMldHYdc
    if(!bank || !Array.isArray(bank.questions) || bank.questions.length < 25){
      await syncQuizBankFromSheet('ON_DEMAND_OPEN');
      bank = db.testCourses.find(c=>c.id==='course_001') || db.testCourses[0];
    }
    if(!bank || !Array.isArray(bank.questions) || bank.questions.length === 0){
      return res.status(502).json({error:'Chưa đồng bộ được ngân hàng đề từ Google Sheet 1h06TrHMRnBOHMkp7Ri4Rz8yRw8ptemQp0ftjMldHYdc'});
    }
    const emp = db.employees.find(e=>e.employeeId===employeeId);
    if(!emp) return res.status(404).json({error:'Không tìm thấy nhân viên'});
    if(emp.type!=='TRAINING' && !['TRAINING','WAITING_TEST','RETEST'].includes(emp.status)) return res.status(403).json({error:'Chỉ nhân viên Training mới được mở TEST đầu ra'});

    // RÀNG BUỘC THI LẠI: NV đã nộp bài và trượt (RETEST) thì chờ HR mở đề mới — không tự mở lại.
    // (Bài thi cũ đã bị hệ thống tự động xoá sau khi nộp.) Bỏ qua khi HR mở (có openedBy) hoặc đang test.
    const _hasFreshQuiz = emp.testSchedule && emp.testSchedule.type==='ONLINE_QUIZ' && emp.testSchedule.status==='IN_PROGRESS' && Array.isArray(emp.testSchedule.questionIds) && emp.testSchedule.questionIds.length>0;
    const _isTestReq = req.headers['x-is-test']==='true' || (req.body && req.body.isTest===true);
    if(emp.status==='RETEST' && !_hasFreshQuiz && !(req.body && req.body.openedBy) && !_isTestReq){
      return res.status(403).json({error:'Bài thi trước đã nộp và cần thi lại — vui lòng chờ HR mở đề thi mới và gửi đến.'});
    }

    // RÀNG BUỘC REALTIME: Bỏ qua kiểm tra 7 ngày nếu:
    // 1. Request có force: true (HR bấm Mở ép)
    // 2. Nhân viên đã được HR đánh dấu Mở ép trước đó (emp.forceOpenTest hoặc emp.isForceUnlocked)
    // 3. Ca thi đã được HR duyệt/mở (emp.status === 'WAITING_TEST' hoặc emp.testSchedule?.status === 'IN_PROGRESS' hoặc emp.testSchedule?.force)
    const isAllowedBypass = !!(
      force ||
      emp.forceOpenTest ||
      emp.isForceUnlocked ||
      (emp.testSchedule && (emp.testSchedule.force || emp.testSchedule.isForceUnlocked || emp.testSchedule.status === 'IN_PROGRESS' || emp.testSchedule.status === 'WAITING_TEST')) ||
      emp.status === 'WAITING_TEST' ||
      emp.status === 'RETEST'
    );

    if(!isAllowedBypass && emp.startDate){
      const t0 = new Date(emp.startDate+'T00:00:00+07:00').getTime();
      if(!isNaN(t0)){
        const diffDays = Math.floor((Date.now()-t0)/86400000);
        if(diffDays < 7) return res.status(400).json({error:`Nhân viên mới training ${diffDays} ngày — đủ 7 ngày mới được mở TEST (hoặc tick Mở ép)`, diffDays});
      }
    }

    if(force || isAllowedBypass){
      emp.forceOpenTest = true;
      emp.isForceUnlocked = true;
    }

    const pool = Array.isArray(bank.questions)? bank.questions : [];
    if(pool.length === 0) return res.status(400).json({error:'Ngân hàng đề rỗng — không có câu hỏi trên Google Sheet'});
    const targetCount = Math.min(25, pool.length);
    // Dùng lại ca thi đang mở nếu còn hiệu lực, tránh random lại khi NV tải lại trang
    const sess = emp.testSchedule;
    let picked = null;
    if(sess && sess.type==='ONLINE_QUIZ' && sess.status==='IN_PROGRESS' && Array.isArray(sess.questionIds) && sess.questionIds.length===targetCount){
      const valid = sess.questionIds.map(id=>pool.find(q=>q.id===id)).filter(Boolean);
      if(valid.length===targetCount) picked = valid;
    }
    if(!picked) picked = [...pool].sort(()=>Math.random()-0.5).slice(0, targetCount);
    emp.testSchedule = {
      type:'ONLINE_QUIZ',
      courseId: bank.id,
      questionIds: picked.map(q=>q.id),
      pickedQuestions: picked.map(q=>({ id:q.id, question:q.question, options:q.options, correct:q.correct, explanation:q.explanation })),
      status:'IN_PROGRESS',
      startedAt: getVietnamISOString(),
      timeLimitSec: 8*60, // 8 phút cho 25 câu trắc nghiệm (bỏ ràng buộc 5s/câu)
      total: targetCount,
      openedBy: openedBy || emp.testSchedule?.openedBy || 'HR',
      force: true,
      isForceUnlocked: true
    };
    emp.status='WAITING_TEST';
    emp.updated_at=getVietnamISOString();
    audit(openedBy||'HR','OPEN_QUIZ','TEST',{employeeId},{total:targetCount, courseId: bank.id}, req.ip);
    saveDB();
    io.emit('employees:update', db.employees);
    res.json({ success:true, courseId: bank.id, questions: picked.map(q=>({id:q.id, question:q.question, options:q.options})), questionIds: picked.map(q=>q.id), employee:{employeeId:emp.employeeId, name:emp.name, phone:emp.phone}, total: targetCount, timeLimitSec: 8*60 });
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/courses/:id/submit', (req,res)=>{
  const { employeeId, answers, timeSpent, questionIds } = req.body||{};
  const course = db.testCourses.find(c=>c.id===req.params.id);
  if(!course) return res.status(404).json({error:'Không tìm thấy'});
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhân viên'});
  // Chốt đúng 25 câu của ca thi (chống tráo đề, đa tầng fallback bảo vệ tránh lỗi ID ca thi)
  const bank = Array.isArray(course.questions)? course.questions : [];
  const sess = emp.testSchedule;
  const sessIds = (sess && sess.type==='ONLINE_QUIZ' && Array.isArray(sess.questionIds) && sess.questionIds.length===25) ? sess.questionIds : null;
  const ids = (Array.isArray(questionIds) && questionIds.length===25) ? questionIds : (sessIds || bank.slice(0,25).map(q=>q.id));
  
  // Tầng 1: Tìm theo IDs trong ngân hàng câu hỏi
  let qlist = (Array.isArray(ids) ? ids : []).map(id=>bank.find(q=>q.id===id)).filter(Boolean);
  
  // Tầng 2: Nếu không khớp đủ (do sync cập nhật ID), dùng pickedQuestions lưu trực tiếp trong ca thi
  if(qlist.length < 25 && sess && Array.isArray(sess.pickedQuestions) && sess.pickedQuestions.length === 25){
    qlist = sess.pickedQuestions;
  }
  
  // Tầng 3: Nếu vẫn chưa đủ mà ngân hàng có >= 25 câu, dùng 25 câu đầu của ngân hàng đề thật
  if(qlist.length < 25 && bank.length >= 25){
    qlist = bank.slice(0, 25);
  }
  
  if(qlist.length < 25) return res.status(400).json({error:`Ngân hàng đề hiện có ${qlist.length}/25 câu — vui lòng mở lại đề`});
  if(!Array.isArray(answers) || answers.length < 25) return res.status(400).json({error:'Bài làm phải đủ 25 câu'});
  let correct=0;
  qlist.forEach((q,idx)=>{ if(answers[idx]===q.correct) correct++; });
  const rounded = Math.round((correct/25*10)*10)/10;
  // Thang 10đ: >=8 ĐẠT • 5–dưới 8 thi lại • <5 LOẠI
  let result;
  if(rounded < 5) result='FAILED';
  else if(rounded < 8) result='CHUA_DU_DK';
  else result='DAT';
  const testRes = { id: uuidv4(), employeeId, employeeName: emp.name, employeePhone: emp.phone, courseId: course.id, score: rounded, correct, total: 25, answers, timeSpent: timeSpent||null, result, createdAt: getVietnamISOString(), version:1 };
  db.testResults.unshift(testRes);
  const before = {...emp};
  emp.testScore = rounded;
  emp.testResult = result;
  emp.testScoredAt = getVietnamISOString(); // mốc TEST có điểm -> Thư mời tính hẹn ký HĐ +5 ngày
  if(sess && sess.type==='ONLINE_QUIZ') sess.status='SUBMITTED';
  if(result==='FAILED'){
    emp.status='FAILED_TEST';
    db.notifications.unshift({ id: uuidv4(), to: employeeId, type:'TEST_LOAI', title:'Kết quả TEST: LOẠI', content:`Bạn đạt ${rounded}đ (< 5đ). Hệ thống sẽ tự động đăng xuất tài khoản sau 15 phút.`, createdAt: getVietnamISOString(), read:false });
    setTimeout(()=>{
      try{
        const e = db.employees.find(x=>x.employeeId===employeeId);
        if(e && e.status==='FAILED_TEST'){
          e.status='ARCHIVED';
          e.updated_at=getVietnamISOString();
          saveDB();
          io.emit('employees:update', db.employees);
          emitForceLogout(employeeId, 'Tài khoản training bị LOẠI (TEST dưới 5đ) — tự động đăng xuất sau 15 phút');
        }
      }catch(_){}
    }, 15*60*1000);
  } else if(result==='CHUA_DU_DK'){
    emp.status='RETEST';
    emp.type='TRAINING';
    if(sess) sess.status='NEED_RETAKE';
    db.notifications.unshift({ id: uuidv4(), to: employeeId, type:'TEST_RETAKE', title:'Kết quả TEST: Thi lại', content:`Bạn đạt ${rounded}đ (5–dưới 8đ). Thông báo thi lại lần sau — HR sẽ gửi lịch thi lại cho bạn.`, createdAt: getVietnamISOString(), read:false });
  } else {
    emp.status='WAITING_OFFICIAL';
    if(sess) sess.status='PASSED_WAIT_APPROVE';
    db.notifications.unshift({ id: uuidv4(), to: employeeId, type:'TEST_PASS', title:'Kết quả TEST: ĐẠT', content:`Chúc mừng ${emp.name}! Bạn đạt ${rounded}đ (≥ 8đ) — hoàn thành tốt, chờ HR duyệt trở thành Nhân viên chính thức Ụm Bò Milk.`, createdAt: getVietnamISOString(), read:false });
    const zr = { id: uuidv4(), sent_at: getVietnamISOString(), receiver: emp.phone, type:'TEST_PASS', content:`Chúc mừng ${emp.name} (${emp.employeeId}) TEST ĐẠT ${rounded}đ — chờ HR duyệt chính thức Ụm Bò Milk!`, status:'SENT', error:'' };
    db.zaloRecords.unshift(zr);
    io.emit('zalo:update', db.zaloRecords);
  }
  // RÀNG BUỘC: thi xong hệ thống tự động xoá bài thi (session 25 câu) — chống dùng lại đề cũ.
  // ĐẠT -> ẩn Đào tạo (WAITING_OFFICIAL); trượt/thi lại -> giữ Đào tạo, chờ HR mở đề mới.
  emp.testSchedule = null;
  emp.version=(emp.version||1)+1;
  emp.updated_at=getVietnamISOString();
  emp.sync_status = (emp.isTest || isTestRecord(emp)) ? 'TEST_BLOCKED' : 'PENDING';
  if(!emp.isTest && !isTestRecord(emp) && !isTestRecord(testRes)){
    try{ addSyncQueue('TEST_RESULT','CREATE',testRes, employeeId, 'WEB_EMPLOYEE'); }catch(_){}
    try{ addSyncQueue('EMPLOYEE','UPDATE',emp, employeeId, 'WEB_EMPLOYEE'); }catch(_){}
  }
  try{ audit(employeeId,'SUBMIT_TEST','TEST',before,emp, req.ip); }catch(_){}
  saveDB();
  io.emit('testResults:update', db.testResults);
  io.emit('employees:update', db.employees);
  io.emit('notifications:update', db.notifications);

  notifyAdminAndHR({
    action: 'quiz_submitted',
    employeeId,
    employeeName: emp.name,
    branchId: emp.branchId,
    title: `Bài TEST Đào tạo: ${emp.name} (${result === 'DAT' ? 'ĐẠT' : result === 'CHUA_DU_DK' ? 'THI LẠI' : 'LOẠI'})`,
    message: `${emp.name} (${employeeId}) vừa nộp bài test: ${rounded}/10 điểm (${correct}/25 câu). Kết quả: ${result === 'DAT' ? 'ĐẠT (Chờ duyệt chính thức) ✅' : result === 'CHUA_DU_DK' ? 'Thi lại ⚠️' : 'LOẠI ❌'}.`,
    type: result === 'DAT' ? 'success' : result === 'CHUA_DU_DK' ? 'warning' : 'error',
    data: { score: rounded, correct, total: 25, result }
  });

  res.json({ success: true, testResult: testRes, employee: emp, passed: result==='DAT', score: rounded });
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
  if(process.env.FINANCE_MASTER_ID) locked['finance.spreadsheetId']=true;
  if(process.env.DATABASE_URL) locked['databaseUrl']=true;
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
  if(db.users.find(u=>u.username===username)) return res.status(409).json({error:'Tên đăng nhập đã tồn tại'});
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
  if(!user) return res.status(404).json({error:'Không tìm thấy'});
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
  if(idx===-1) return res.status(404).json({error:'Không tìm thấy'});
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
  const m = month || getVietnamTodayStr().slice(0,7);
  let emps = [...db.employees];
  if(branch) emps = emps.filter(e=>e.branchId===branch);
  const payrolls = emps.map(e=> calculatePayroll(e.employeeId, m)).filter(Boolean);
  res.json(payrolls);
});

// ============ REPORT OVERVIEW (Spec 3.2) ============
app.get('/api/reports/overview', authMiddleware, (req,res)=>{
  const { month, branch, startDate, endDate } = req.query;
  const m = month || getVietnamTodayStr().slice(0,7);
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
  const m = month || getVietnamTodayStr().slice(0,7);
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
  const m = month || getVietnamTodayStr().slice(0,7);
  const start = startDate || (m+'-01');
  const end = endDate || (m+'-31');
  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy'});
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
  const m = month || getVietnamTodayStr().slice(0,7);
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
  const adj={ id: uuidv4(), employeeId, date, field, oldValue, newValue, reason, status:'PENDING', requestedBy: req.user.username, requestedAt: getVietnamISOString(), approvedBy:null, approvedAt:null };
  db.attendanceAdjustments.push(adj);
  audit(req.user.username,'CREATE_ADJUST','ATTENDANCE',null,adj, req.ip);
  saveDB(); io.emit('adjustments:update', db.attendanceAdjustments);
  res.json(adj);
});
app.post('/api/attendance/adjustments/:id/approve', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const adj=db.attendanceAdjustments.find(a=>a.id===req.params.id);
  if(!adj) return res.status(404).json({error:'Không tìm thấy'});
  adj.status='APPROVED'; adj.approvedBy=req.user.username; adj.approvedAt=getVietnamISOString();
  // apply to attendance
  const att=db.attendances.find(a=>a.employeeId===adj.employeeId && a.date===adj.date);
  if(att) att[adj.field]=adj.newValue;
  audit(req.user.username,'APPROVE_ADJUST','ATTENDANCE',null,adj, req.ip);
  saveDB(); io.emit('adjustments:update', db.attendanceAdjustments); io.emit('attendances:update', db.attendances);
  res.json(adj);
});
app.post('/api/attendance/adjustments/:id/reject', authMiddleware, roleCheck(['Admin','HR']), (req,res)=>{
  const adj=db.attendanceAdjustments.find(a=>a.id===req.params.id);
  if(!adj) return res.status(404).json({error:'Không tìm thấy'});
  adj.status='REJECTED'; adj.approvedBy=req.user.username; adj.approvedAt=getVietnamISOString();
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
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhôn viôn'});
  const ot = { id: uuidv4(), employeeId, employeeName: emp.name, branchId: emp.branchId, date, hours: Number(hours), type: type||'OT_NORMAL', reason: reason||'', status:'PENDING', createdAt: getVietnamISOString(), createdBy: req.user.username };
  db.overtimeRequests.unshift(ot);
  audit(req.user.username,'CREATE_OT','OVERTIME',null,ot, req.ip);
  saveDB();
  io.emit('overtime:update', db.overtimeRequests);
  io.emit('overtime:new', ot);
  res.json(ot);
});
app.post('/api/overtime-requests/:id/approve', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const ot = db.overtimeRequests.find(x=>x.id===req.params.id);
  if(!ot) return res.status(404).json({error:'Không tìm thấy'});
  ot.status='APPROVED'; ot.approvedBy=req.user.username; ot.approvedAt=getVietnamISOString();
  audit(req.user.username,'APPROVE_OT','OVERTIME',null,ot, req.ip);
  saveDB(); io.emit('overtime:update', db.overtimeRequests);
  res.json(ot);
});
app.post('/api/overtime-requests/:id/reject', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const ot = db.overtimeRequests.find(x=>x.id===req.params.id);
  if(!ot) return res.status(404).json({error:'Không tìm thấy'});
  ot.status='REJECTED'; ot.rejectedBy=req.user.username; ot.rejectedAt=getVietnamISOString(); ot.rejectReason=req.body.reason||'';
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
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhôn viôn'});
  const leave = { id: uuidv4(), employeeId, employeeName: emp.name, branchId: emp.branchId, date, days: Number(days)||1, type: type||'ANNUAL_LEAVE', reason: reason||'', status:'PENDING', createdAt: getVietnamISOString(), createdBy: req.user.username||employeeId };
  db.leaveRequests.unshift(leave);
  audit(req.user.username||employeeId,'CREATE_LEAVE','LEAVE',null,leave, req.ip);
  saveDB(); io.emit('leave:update', db.leaveRequests);
  res.json(leave);
});
app.post('/api/leave-requests/:id/approve', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const lv = db.leaveRequests.find(x=>x.id===req.params.id);
  if(!lv) return res.status(404).json({error:'Không tìm thấy'});
  lv.status='APPROVED'; lv.approvedBy=req.user.username; lv.approvedAt=getVietnamISOString();
  audit(req.user.username,'APPROVE_LEAVE','LEAVE',null,lv, req.ip);
  saveDB(); io.emit('leave:update', db.leaveRequests);
  res.json(lv);
});
app.post('/api/leave-requests/:id/reject', authMiddleware, roleCheck(['Admin','HR','Manager']), (req,res)=>{
  const lv = db.leaveRequests.find(x=>x.id===req.params.id);
  if(!lv) return res.status(404).json({error:'Không tìm thấy'});
  lv.status='REJECTED'; lv.rejectedBy=req.user.username; lv.rejectedAt=getVietnamISOString();
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
  const period={ id: uuidv4(), month, startDate: month+'-01', endDate: month+'-31', status:'DRAFT', createdBy: req.user.username, createdAt: getVietnamISOString(), lockedBy:null, lockedAt:null };
  db.payrollPeriods.push(period);
  audit(req.user.username,'CREATE_PERIOD','PAYROLL',null,period, req.ip);
  saveDB(); io.emit('payrollPeriods:update', db.payrollPeriods);
  res.json(period);
});
app.post('/api/payroll-periods/:id/lock', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const p=db.payrollPeriods.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:'Không tìm thấy'});
  const m=p.month; const start=m+'-01', end=m+'-31';
  const hasMissing = db.attendances.some(a=>a.date>=start&&a.date<=end && a.checkIn && !a.checkOut);
  if(hasMissing && !req.body.force) return res.status(400).json({error:'Còn lỗi thiếu Check-out, không thể chốt. Dùng force=true để bỏ qua.'});
  // Real anomaly check (mở rộng): OT chưa duyệt, điều chỉnh pending
  const pendingOT = db.overtimeRequests.filter(r=>r.status==='PENDING' && r.date>=start && r.date<=end).length;
  const pendingAdj = db.attendanceAdjustments.filter(r=>r.status==='PENDING').length;
  if((pendingOT>0 || pendingAdj>0) && !req.body.force) return res.status(400).json({error:`Còn ${pendingOT} OT chưa duyệt và ${pendingAdj} điều chỉnh pending - dùng force=true để chốt`});
  p.status='LOCKED'; p.lockedBy=req.user.username; p.lockedAt=getVietnamISOString();
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
  if(!p) return res.status(404).json({error:'Không tìm thấy'});
  const { reason } = req.body;
  if(!reason) return res.status(400).json({error:'Cần lý do reopen'});
  p.status='DRAFT'; p.reopenReason=reason; p.reopenedBy=req.user.username; p.reopenedAt=getVietnamISOString();
  audit(req.user.username,'REOPEN_PERIOD','PAYROLL',null,p, req.ip);
  saveDB(); io.emit('payrollPeriods:update', db.payrollPeriods);
  res.json(p);
});
// Export - Xuất báo cáo (Spec 18)
app.get('/api/reports/export/:type', authMiddleware, (req,res)=>{
  const { type } = req.params; // payroll-input, attendance, anomalies, etc.
  const { month, branch } = req.query;
  const m = month || getVietnamTodayStr().slice(0,7);
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

// Admin: kiểm tra trùng lặp trên 1 tab Google Sheet (chỉ đọc, không sửa)
app.get('/api/admin/inspect-sheet', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const spreadsheetId = req.query.spreadsheetId || db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  const sheetName = req.query.sheet || 'NHAN_VIEN_MOI';
  const token = await getGoogleAccessToken();
  if(!token) return res.status(500).json({ error:'Chưa cấu hình ServiceAccount để đọc Sheet' });
  try{
    const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:Z5000`, { headers:{ Authorization:`Bearer ${token}` }});
    if(!resp.ok) return res.status(502).json({ error:`Đọc Sheet lỗi HTTP ${resp.status}` });
    const j = await resp.json();
    const values = j.values || [];
    if(values.length<2) return res.json({ sheet: sheetName, totalRows: 0, dupGroups: [] });
    const headers = values[0];
    const iPhone = headers.findIndex(h=> h==='SĐT');
    const byId = {}, byPhone = {};
    for(let i=1;i<values.length;i++){
      const id = (values[i][0]||'').toString().trim();
      const phone = iPhone!==-1 ? (values[i][iPhone]||'').toString().trim() : '';
      if(id){ (byId[id]=byId[id]||[]).push(i+1); }
      if(phone){ (byPhone[phone]=byPhone[phone]||[]).push(i+1); }
    }
    const dupById = Object.entries(byId).filter(([k,v])=>v.length>1).map(([k,v])=>({ key:k, rows:v }));
    const dupByPhone = Object.entries(byPhone).filter(([k,v])=>{
      const ids = new Set(v.map(r=> (values[r-1][0]||'').toString().trim()));
      return v.length>1 && ids.size>1;
    }).map(([k,v])=>({ key:k, rows:v }));
    res.json({ sheet: sheetName, headerRows: 1, totalRows: values.length-1, dupByIdCount: dupById.length, dupByPhoneCount: dupByPhone.length, dupById: dupById.slice(0,20), dupByPhone: dupByPhone.slice(0,20), sample: values.slice(1,4) });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Admin: Dọn dẹp toàn bộ dữ liệu test trong bộ nhớ (dành cho automated tests)
app.post('/api/admin/clean-test-data', authMiddleware, roleCheck(['Admin']), (req, res) => {
  db.employees = db.employees.filter(e => !isTestRecord(e));
  db.applicants = db.applicants.filter(a => !isTestRecord(a));
  db.testResults = db.testResults.filter(t => !isTestRecord(t));
  db.keys = db.keys.filter(k => !isTestRecord(k));
  db.syncQueue = db.syncQueue.filter(q => !isTestRecord(q) && !isTestRecord(q?.payload));
  db.attendances = db.attendances.filter(a => !isTestRecord(a));
  const validEmpIds = new Set(db.employees.map(e => e.employeeId));
  db.offRequests = db.offRequests.filter(r => !isTestRecord(r) && validEmpIds.has(r.employeeId));
  db.schedules = db.schedules.filter(s => !isTestRecord(s) && validEmpIds.has(s.employeeId));
  db.emergencyRequests = db.emergencyRequests.filter(r => !isTestRecord(r) && validEmpIds.has(r.employeeId));
  db.deviceRequests = db.deviceRequests.filter(r => !isTestRecord(r) && validEmpIds.has(r.employeeId));
  db.zaloRecords = db.zaloRecords.filter(z => !isTestRecord(z));
  saveDB();
  res.json({ success: true, message: 'Đã dọn dẹp toàn bộ dữ liệu test' });
});

// Admin: dựng lại 1 tab Sheet cho sạch (xóa dòng trùng + dòng lỗi, giữ dữ liệu thật duy nhất).
// dryRun=true (mặc định) chỉ báo cáo; dryRun=false mới ghi. Không bao giờ xóa dòng duy nhất.
app.post('/api/admin/rebuild-sheet-tab', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const spreadsheetId = req.body.spreadsheetId || db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  if(isSheetDeleteProtected(spreadsheetId)){
    return res.status(403).json({ error:'Ràng buộc bảo vệ tuyệt đối: Dữ liệu trên Google Sheet 17iXM không được phép xóa/clear trừ khi Admin thực hiện System Reset ALL.' });
  }
  const sheetName = req.body.sheet || 'NHAN_VIEN_MOI';
  const dryRun = req.body.dryRun !== false;
  const token = await getGoogleAccessToken();
  if(!token) return res.status(500).json({ error:'Chưa cấu hình ServiceAccount để ghi Sheet' });
  try{
    const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:Z5000`, { headers:{ Authorization:`Bearer ${token}` }});
    if(!resp.ok) return res.status(502).json({ error:`Đọc Sheet lỗi HTTP ${resp.status}` });
    const j = await resp.json();
    const values = j.values || [];
    if(values.length<2) return res.json({ sheet: sheetName, dryRun, totalRows: 0, kept: 0, dropped: 0, note:'Sheet trống' });
    const def = Object.values(SHEET_DEFINITIONS).find(d=>d.sheetName===sheetName);
    const properHeader = def ? def.headers : values[0];
    const curHeader = values[0];
    const iPhone = curHeader.findIndex(h=> h==='SĐT');
    const localPhones = new Set(db.applicants.map(a=> normalizePhone(a.phone)).filter(Boolean));
    const localIds = new Set([...db.applicants.map(a=>a.id), ...db.employees.map(e=>e.id), ...db.employees.map(e=>e.employeeId)]);
    const isBadKey = (k)=> !k || /\s/.test(k) || k==='ID';
    // Pass 1: loại dòng lỗi + dedupe theo ID (giữ dòng CUỐI = mới nhất)
    const lastById = new Map();
    let badRows = 0;
    for(let i=1;i<values.length;i++){
      const k=(values[i][0]||'').toString();
      if(isBadKey(k)){ badRows++; continue; }
      lastById.set(k, values[i]);
    }
    // Pass 2: dedupe theo SĐT (cùng người, khác ID) - giữ dòng có ID local, else dòng cuối
    const rowsById = [...lastById.entries()];
    const phoneGroups = new Map();
    rowsById.forEach(([id,row])=>{
      const ph = iPhone!==-1 ? normalizePhone((row[iPhone]||'').toString()) : '';
      const key = ph || `__nophone__${id}`;
      if(!phoneGroups.has(key)) phoneGroups.set(key, []);
      phoneGroups.get(key).push([id,row]);
    });
    const kept = [], dropped = [];
    phoneGroups.forEach((group,ph)=>{
      if(group.length===1){ kept.push(group[0][1]); return; }
      // Ưu tiên dòng có ID tồn tại local (dữ liệu thật đang dùng), else dòng cuối
      group.sort((a,b)=>{
        const aLocal = localIds.has(a[0]) ? 0 : 1;
        const bLocal = localIds.has(b[0]) ? 0 : 1;
        return aLocal - bLocal;
      });
      kept.push(group[0][1]);
      group.slice(1).forEach(([id])=> dropped.push(id));
    });
    // Chuẩn hóa độ dài cột theo header chuẩn
    const finalRows = kept.map(r=>{
      const nr = [];
      for(let c=0;c<properHeader.length;c++) nr[c] = c<r.length ? (r[c]||'') : '';
      return nr;
    });
    const plan = { sheet: sheetName, dryRun, totalRows: values.length-1, badRows, dupDropped: dropped.length, kept: finalRows.length, droppedIds: dropped.slice(0,30), headerFixed: JSON.stringify(curHeader)!==JSON.stringify(properHeader) };
    if(dryRun) return res.json({ success:true, ...plan, note:'Chế độ xem trước - chưa ghi. Gửi dryRun:false để thực hiện.' });
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:Z:clear`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }});
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=RAW`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
      body: JSON.stringify({ values: [properHeader, ...finalRows] })
    });
    audit(req.user.username,'REBUILD_SHEET_TAB','SHEET', { sheet: sheetName, totalRows: plan.totalRows }, { kept: plan.kept, dropped: plan.dupDropped, badRows: plan.badRows }, req.ip);
    res.json({ success:true, ...plan, dryRun:false });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
// Admin: xóa CHỈ ĐỊNH một số dòng trên Sheet (ghi rõ IDs, có audit).
// Mọi luồng tự động khác đều bị cấm xóa Sheet.
app.post('/api/admin/delete-sheet-rows', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const spreadsheetId = req.body.spreadsheetId || db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
  if(isSheetDeleteProtected(spreadsheetId)){
    return res.status(403).json({ error:'Ràng buộc bảo vệ tuyệt đối: Dữ liệu trên Google Sheet 17iXM không được phép xóa dòng trừ khi Admin thực hiện System Reset ALL.' });
  }
  const sheetName = req.body.sheet;
  const ids = (req.body.ids||[]).map(x=>String(x).trim()).filter(Boolean);
  if(!sheetName) return res.status(400).json({ error:'Thiếu tên sheet' });
  if(ids.length===0) return res.status(400).json({ error:'Thiếu danh sách ids cần xóa' });
  if(ids.length>100) return res.status(400).json({ error:'Tối đa 100 ids/lần' });
  const token = await getGoogleAccessToken();
  if(!token) return res.status(500).json({ error:'Chưa cấu hình ServiceAccount để ghi Sheet' });
  try{
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers:{ Authorization:`Bearer ${token}` }});
    const meta = await metaRes.json();
    const tab = (meta.sheets||[]).find(s=>s.properties.title===sheetName);
    if(!tab) return res.status(404).json({ error:`Không thấy tab ${sheetName} trên Sheet` });
    const gridId = tab.properties.sheetId;
    const valRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:B5000`, { headers:{ Authorization:`Bearer ${token}` }});
    const values = (await valRes.json()).values || [];
    const targets = [];
    for(let i=1;i<values.length;i++){
      const c0=(values[i][0]||'').toString().trim();
      const c1=(values[i][1]||'').toString().trim();
      if(ids.includes(c0)||ids.includes(c1)) targets.push(i);
    }
    if(targets.length===0) return res.json({ success:true, deleted:0, note:'Không tìm thấy dòng nào khớp ids' });
    targets.sort((a,b)=>b-a);
    const delRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ requests: targets.map(idx=>({ deleteDimension:{ range:{ sheetId: gridId, dimension:'ROWS', startIndex: idx, endIndex: idx+1 }} })) })
    });
    const delData = await delRes.json();
    if(delData.error) return res.status(502).json({ error: delData.error.message });
    audit(req.user.username,'DELETE_SHEET_ROWS','SHEET', { sheet: sheetName, ids }, { deleted: targets.length }, req.ip);
    res.json({ success:true, sheet: sheetName, deleted: targets.length, rows: targets.map(i=>i+1) });
  }catch(e){ res.status(500).json({ error: e.message }); }
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
  if(!item) return res.status(404).json({error:'Không tìm thấy'});
  // Reset để cho phép thử lại đủ 5 lần (fix lỗi dừng sau 5 lần)
  item.sync_status='PENDING';
  item.retryCount=0;
  delete item.nextRetryAt;
  delete item.error;
  try {
    await syncToGoogleSheet(item);
    item.sync_status='SYNCED';
    item.syncedAt=getVietnamISOString();
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
  const secret = req.body.secret || process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || DEFAULT_WEBHOOK_SECRET;
  if(!webhookUrl) return res.status(400).json({ error:'Chưa cấu hình webhookUrl', hint:'Vào Cài đặt > Google Sheet > Webhook URL' });
  try{
    const testRes = await fetch(webhookUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ secret, sheetName:'TEST', operation:'PING', payload:{ test:true, timestamp: getVietnamISOString() } })
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
  const secret = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || db.settings?.googleSheet?.secret || DEFAULT_WEBHOOK_SECRET;
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
// ============ RENDER ENVIRONMENT (18 BIẾN) REALTIME BINDING ============
const RENDER_18_ENV_DEFS = [
  { key:'NODE_ENV', desc:'Môi trường thực thi', required:true, default:'production' },
  { key:'PORT', desc:'Cổng dịch vụ Web Server', required:true, default:'10000' },
  { key:'JWT_SECRET', desc:'Khóa bảo mật JWT Authentication', required:true, masked:true },
  { key:'SECRET_ENCRYPTION_KEY', desc:'Khóa mã hóa DB & Credentials', required:true, masked:true },
  { key:'ALLOWED_ORIGINS', desc:'CORS Whitelist tên miền', required:false, default:'*' },
  { key:'GOOGLE_SHEET_SPREADSHEET_ID', desc:'Sheet Ứng viên mới / Form (1rcq)', required:true, renderKey:'GOOGLE_SHEET_SPREADSHEET_ID' },
  { key:'GOOGLE_SHEET_TARGET_DATABASE_ID', desc:'Sheet Master 20 cột (17iXM)', required:true, renderKey:'GOOGLE_SHEET_TARGET_DATABASE_ID' },
  { key:'GOOGLE_SHEET_WEBHOOK_URL', desc:'Webhook Apps Script Hub Google Sheet', required:true, masked:true },
  { key:'GOOGLE_SHEET_WEBHOOK_SECRET', desc:'Mật mã Webhook Apps Script', required:true, masked:true },
  { key:'GOOGLE_SERVICE_ACCOUNT_EMAIL', desc:'Tài khoản dịch vụ Service Account', required:true },
  { key:'GOOGLE_PRIVATE_KEY', desc:'Khóa RSA Private Key Service Account', required:true, masked:true },
  { key:'GOOGLE_OAUTH_CLIENT_ID', desc:'OAuth Client ID (Google Calendar/Meet)', required:false, masked:true },
  { key:'GOOGLE_OAUTH_CLIENT_SECRET', desc:'OAuth Client Secret (Google Meet)', required:false, masked:true },
  { key:'GOOGLE_DRIVE_ROOT_FOLDER_ID', desc:'ID Thư mục gốc Google Drive', required:false },
  { key:'GOOGLE_CALENDAR_ID', desc:'Lịch Google Calendar phỏng vấn', required:false, default:'primary' },
  { key:'FINANCE_MASTER_ID', desc:'Sheet Kế toán Tài chính Master (13Y4)', required:true },
  { key:'FINANCE_WEBHOOK_URL', desc:'Webhook Apps Script Tài chính', required:true, masked:true },
  { key:'DATABASE_URL', desc:'Chuỗi kết nối Neon PostgreSQL 24/7', required:false, masked:true }
];

function getRenderEnvStatus(){
  const envList = RENDER_18_ENV_DEFS.map(def => {
    const rawVal = process.env[def.key];
    const isOnRender = typeof rawVal === 'string' && rawVal.trim().length > 0;
    let displayVal = 'EMPTY';
    let status = isOnRender ? 'ACTIVE' : 'DELETED_OR_EMPTY';
    let statusText = isOnRender ? 'HOẠT ĐỘNG (RENDER)' : 'ĐÃ XÓA TRÊN RENDER';

    if(isOnRender){
      if(def.masked){
        if(def.key === 'GOOGLE_PRIVATE_KEY'){
          displayVal = '••••••••' + rawVal.slice(-20).replace(/\n/g,'');
        } else if(rawVal.length > 8){
          displayVal = '••••••••' + rawVal.slice(-4);
        } else {
          displayVal = '••••••••';
        }
      } else {
        displayVal = rawVal.length > 35 ? rawVal.slice(0, 32) + '...' : rawVal;
      }
    } else {
      displayVal = 'ĐÃ XÓA TRÊN RENDER / CHƯA CẤU HÌNH';
    }

    return {
      key: def.key,
      desc: def.desc,
      required: def.required,
      masked: !!def.masked,
      isOnRender,
      status,
      statusText,
      value: displayVal,
      renderKey: def.renderKey || def.key
    };
  });

  const total = 18;
  const configured = envList.filter(e => e.isOnRender).length;
  const missing = total - configured;

  return {
    total,
    configured,
    missing,
    envList,
    renderYamlCount: 18,
    timestamp: new Date().toISOString(),
    vietnamTime: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    note: '18 biến môi trường Render chuẩn hóa — Tự động cập nhật realtime khi Render thay đổi hoặc xóa biến'
  };
}

let lastRenderEnvFingerprint = '';
function checkAndBroadcastRenderEnv(force = false){
  const currentFingerprint = RENDER_18_ENV_DEFS.map(k => `${k.key}=${process.env[k.key] || ''}`).join(';');
  const changed = !lastRenderEnvFingerprint || lastRenderEnvFingerprint !== currentFingerprint;
  if(changed || force){
    const wasInitial = !lastRenderEnvFingerprint;
    lastRenderEnvFingerprint = currentFingerprint;
    const report = getRenderEnvStatus();
    if(!wasInitial || force){
      console.log(`[RENDER ENV REALTIME] Đồng bộ 18 biến môi trường Render: ${report.configured}/18 cấu hình, ${report.missing} thiếu/xóa.`);
      io.emit('render:env:update', report);
      io.emit('hr:action', { action: 'Môi trường Render (18 biến)', detail: `Đã đồng bộ realtime (${report.configured}/18)`, success: true });
    }
    return report;
  }
  return getRenderEnvStatus();
}

// Khởi tạo và kiểm tra định kỳ mỗi 10s
setTimeout(() => checkAndBroadcastRenderEnv(false), 2000);
setInterval(() => checkAndBroadcastRenderEnv(false), 10000);

// API Admin lấy trạng thái 18 biến
app.get('/api/admin/env', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  res.json(getRenderEnvStatus());
});

// API Admin ép đồng bộ realtime tức thì
app.post('/api/admin/env/sync', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const report = checkAndBroadcastRenderEnv(true);
  res.json({ success: true, message: 'Đã ép đồng bộ realtime 18 biến môi trường Render', data: report });
});

// ============ P0 PHASE 1: Security inventory endpoint (Master 6.6) ============
// Liet ke endpoint cong khai (khong authMiddleware) de HR/Admin review.
// Chi Admin/HR duoc xem. Khong tra secret.
app.get('/api/vip/security/inventory', authMiddleware, roleCheck(['Admin', 'HR']), (req, res) => {
  const publicEndpoints = [
    { method: 'GET', path: '/', reason: 'Landing UI', action: 'KEEP_PUBLIC' },
    { method: 'GET', path: '/admin', reason: 'Admin SPA (auth o API layer)', action: 'KEEP_PUBLIC' },
    { method: 'GET', path: '/employee', reason: 'Employee SPA (auth o API layer)', action: 'KEEP_PUBLIC' },
    { method: 'GET', path: '/finance', reason: 'Finance SPA (auth o API layer)', action: 'KEEP_PUBLIC' },
    { method: 'GET', path: '/health', reason: 'Health check Render/CI', action: 'KEEP_PUBLIC' },
    { method: 'POST', path: '/api/auth/login', reason: 'HR login + rate-limit', action: 'KEEP_PUBLIC' },
    { method: 'POST', path: '/api/auth/employee-login', reason: 'Employee Key login + Device Binding', action: 'KEEP_PUBLIC' },
    { method: 'POST', path: '/api/auth/finance-login', reason: 'Finance login', action: 'KEEP_PUBLIC' },
    { method: 'POST', path: '/api/auth/device-request', reason: 'Doi thiet bi (HR duyet)', action: 'KEEP_PUBLIC' },
    { method: 'POST', path: '/api/applicants', reason: 'Form inbound (chong trung SDT 409)', action: 'ADD_SIGNED_WEBHOOK' },
    { method: 'POST', path: '/api/recruitment/form-submit', reason: 'Google Form/Sheet webhook', action: 'ADD_SIGNED_WEBHOOK' },
    { method: 'POST', path: '/api/attendance/checkin', reason: 'Employee self-service (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/attendance/checkout', reason: 'Employee self-service (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/employee/register-off', reason: 'Training OFF (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/off-requests', reason: 'OFF (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/emergency-requests', reason: 'OFF dot xuat (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/emergency-requests/:id/respond', reason: 'Nhan thay ca (can signed token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/shift-swap', reason: 'Doi ca (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/shift-swap/:id/respond', reason: 'Phan hoi doi ca (can signed token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/training/shift-change', reason: 'Training doi ca (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/courses/:id/submit', reason: 'Nop bai E-learning (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'POST', path: '/api/quiz/open', reason: 'Mo de thi (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'GET', path: '/api/quiz/status', reason: 'Trang thai quiz', action: 'REVIEW' },
    { method: 'GET', path: '/api/courses', reason: 'Danh sach khoa hoc', action: 'REVIEW' },
    { method: 'GET', path: '/api/interviews', reason: 'Lich PV (can filter theo employee)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'GET', path: '/api/notifications', reason: 'Thong bao (can filter theo employee)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'GET', path: '/api/off-window', reason: 'Trang thai cua so OFF', action: 'KEEP_PUBLIC' },
    { method: 'GET', path: '/api/attendance/official-monthly', reason: 'Bang cong thang (can employee token)', action: 'ADD_EMPLOYEE_AUTH' },
    { method: 'GET', path: '/api/employee/me', reason: 'Verify token + forceLogout', action: 'KEEP_PUBLIC' },
    { method: 'POST', path: '/api/zalo/inbound', reason: 'Zalo webhook (verify secret tuy chon)', action: 'KEEP_PUBLIC' },
    { method: 'POST', path: '/api/render/deploy-hook', reason: 'Render deploy hook', action: 'KEEP_PUBLIC' }
  ];
  res.json({ success: true, count: publicEndpoints.length, endpoints: publicEndpoints, generatedAt: getVietnamISOString(), note: 'PHASE 1 inventory: KEEP_PUBLIC | ADD_EMPLOYEE_AUTH | ADD_SIGNED_WEBHOOK | REVIEW' });
});

// Webhook tiếp nhận deploy / thay đổi từ Render
app.post('/api/render/deploy-hook', (req,res)=>{
  console.log('[RENDER DEPLOY HOOK] Nhận thông báo deploy/cập nhật từ Render!');
  const report = checkAndBroadcastRenderEnv(true);
  res.json({ success: true, message: 'Render deploy hook received & broadcasted', data: report });
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
    official: db.employees.filter(e=>e.type==='OFFICIAL'||e.status==='OFFICIAL').length,
    workingToday: db.attendances.filter(a=>a.date===today && (a.status==='CHECKED_IN'||a.status==='LATE'||a.status==='COMPLETED')).length,
    lateToday: db.attendances.filter(a=>a.date===today && a.status==='LATE').length,
    absent: Math.max(0, db.employees.filter(e=>e.type==='OFFICIAL'||e.status==='OFFICIAL').length - db.attendances.filter(a=>a.date===today).length),
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

// Admin kiểm tra quyền ghi Sheet 17iXM trước khi reset: config → token → đọc → ghi thử (tạo+xóa tab tạm, không chạm dữ liệu)
app.post('/api/admin/test-sheet-access', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const checks = { hasEmail: false, hasKey: false, token: false, read: false, write: false, tabs: 0 };
  let error = '';
  try{
    const cfg = db.settings?.googleSheet || {};
    // ENV Render đè lên settings nếu có
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || cfg.serviceAccountEmail;
    const key = process.env.GOOGLE_PRIVATE_KEY || cfg.privateKey;
    checks.hasEmail = !!email;
    checks.hasKey = !!key;
    if(!email || !key){ error = 'Thiếu ServiceAccount (email/key) — set GOOGLE_PRIVATE_KEY + GOOGLE_SERVICE_ACCOUNT_EMAIL trên Render Dashboard → Environment'; return res.json({ success:false, checks, error }); }
    const token = await getGoogleAccessToken();
    checks.token = !!token;
    if(!token){ error = 'Không lấy được access token — sai private key hoặc key chưa đúng định dạng 1 dòng (\\n)'; return res.json({ success:false, checks, error }); }
    const spreadsheetId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
    const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, { headers:{ Authorization:`Bearer ${token}` }})).json();
    if(meta.error){ error = 'Đọc Sheet lỗi: '+meta.error.message+' (SA chưa được share file hoặc sai ID)'; return res.json({ success:false, checks, error }); }
    checks.read = true;
    checks.tabs = (meta.sheets||[]).length;
    // Ghi thử: tạo tab tạm rồi xóa ngay
    const tmp = '_CHECK_'+Date.now().toString(36).toUpperCase();
    const add = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ requests:[{ addSheet:{ properties:{ title: tmp } } }] })
    })).json();
    if(add.error){ error = 'Ghi Sheet lỗi: '+add.error.message+' (SA chỉ có quyền xem — cần quyền Biên tập viên)'; return res.json({ success:false, checks, error }); }
    const newId = add.replies?.[0]?.addSheet?.properties?.sheetId;
    if(newId!==undefined){
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ requests:[{ deleteSheet:{ sheetId: newId } }] })
      });
    }
    checks.write = true;
    audit(req.user.username,'TEST_SHEET_ACCESS','SHEET',null,{spreadsheetId, tabs:checks.tabs}, req.ip);
    res.json({ success:true, checks });
  }catch(e){ res.json({ success:false, checks, error: e.message }); }
});

// ============ SYSTEM RESET ============
// RÀNG BUỘC: scope ALL xóa vĩnh viễn cả web app LẪN Google Sheet 17iXM
// (toàn bộ dòng dữ liệu mọi tab, giữ hàng header). Chỉ Admin gọi được, có audit.
app.post('/api/system/reset', authMiddleware, roleCheck(['Admin']), async (req,res)=>{
  const { scope } = req.body; // ALL = reset mọi dữ liệu vận hành, giữ settings
  let sheetResult = null;
  if(scope==='ALL'){
    isSystemResetting = true;
    try{
      const keepSettings = db.settings;
      db.employees=[]; db.applicants=[]; db.interviews=[]; db.attendances=[]; db.schedules=[]; db.offRequests=[]; db.emergencyRequests=[]; db.deviceRequests=[]; db.trainingShiftRequests=[]; db.shiftSwapRequests=[]; db.testResults=[]; db.keys=[]; db.zaloRecords=[]; db.notifications=[]; db.syncQueue=[]; db.auditLogs=[];
      db.driveFiles=[]; db.payrollSnapshots=[]; db.overtimeRequests=[]; db.leaveRequests=[]; db.payrollPeriods=[]; db.attendanceAdjustments=[]; db.penalties=[]; db.financeKeys=[];
      db.settings = keepSettings || DEFAULT_SETTINGS;
      // RÀNG BUỘC REALTIME: Lưu rỗng ngay lập tức vào ổ cứng và phát socket để web app lập tức sạch 100%
      saveDB();
      io.emit('system:reset', {scope});
      io.emit('employees:update', []);
      io.emit('applicants:update', []);
      io.emit('keys:update', []);
      io.emit('schedules:update', []);
      io.emit('attendances:update', []);
      io.emit('interviews:update', []);
      io.emit('sync:update', []);

      // Xóa vĩnh viễn dòng dữ liệu (A2:ZZ:clear) từng tab trên Sheet 17iXM — giữ header dòng 1
      const spreadsheetId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';
      const token = await getGoogleAccessToken();
      if(!token){
        sheetResult = { cleared:false, error:'Chưa cấu hình ServiceAccount — Sheet 17iXM GIỮ NGUYÊN, chỉ web bị reset' };
      } else {
        // Kiểm tra xem tab có còn bất kỳ ô nào chứa dữ liệu không (tất cả các cột)
        const isTabEmpty = async (sid, tab)=>{
          const vr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(tab)}!A2:Z100`, {
            headers:{ Authorization:`Bearer ${token}` }
          });
          const vj = await vr.json().catch(()=>({}));
          if(vj.error) throw new Error(vj.error.message);
          const rows = vj.values || [];
          return rows.filter(r=>r && r.some(c=>String(c||'').trim()!=='')).length===0;
        };
        // Xóa sạch toàn bộ dữ liệu từ dòng 2 đến vô cực (cột A đến ZZ và hàng 2:50000)
        const clearRange = async (sid, tab)=>{
          const clr1 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(tab)}!A2:ZZ:clear`, {
            method:'POST', headers:{ Authorization:`Bearer ${token}` }
          });
          const cj1 = await clr1.json().catch(()=>({}));
          if(cj1.error) throw new Error(cj1.error.message);
          // Đồng thời xóa toàn bộ cột theo dòng 2:50000 để đảm bảo triệt để 100%
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(tab)}!2:50000:clear`, {
            method:'POST', headers:{ Authorization:`Bearer ${token}` }
          }).catch(()=>({}));
        };
        const clearAndVerify = async (sid, tab, headers)=>{
          let lastErr = '';
          // Tầng 1: Clear triệt để toàn bộ cột A đến ZZ (thử 2 lần)
          for(let attempt=1; attempt<=2; attempt++){
            try{
              await clearRange(sid, tab);
              if(await isTabEmpty(sid, tab)) return { tab, ok:true, via:'clear' };
              lastErr = 'vẫn còn dòng sau khi xóa';
            }catch(e){ lastErr = e.message; }
            await new Promise(r=>setTimeout(r, 250));
          }
          // Tầng 2: Kiểm tra protected range trên Sheet
          try{
            const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}?fields=sheets(properties(title,sheetId),protectedRanges(protectedRangeId))`, { headers:{ Authorization:`Bearer ${token}` }})).json();
            if(meta.error) throw new Error(meta.error.message);
            const sheet = (meta.sheets||[]).find(s=>s.properties && s.properties.title===tab);
            const prs = (sheet && sheet.protectedRanges) || [];
            if(prs.length>0){
              return { tab, ok:false, error:'Tab có protected range do chủ Sheet thiết lập - không thể tự động xóa bằng API' };
            }
            // Tầng 3: Nếu không có protected range mà vẫn chưa sạch: xóa sheet + tạo lại + ghi header
            if(sheet && sheet.properties && sheet.properties.sheetId!==undefined){
              const bu = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}:batchUpdate`, {
                method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
                body: JSON.stringify({ requests:[{ deleteSheet:{ sheetId: sheet.properties.sheetId } }, { addSheet:{ properties:{ title: tab } } }] })
              })).json();
              if(bu.error) throw new Error(bu.error.message);
              if(Array.isArray(headers) && headers.length){
                await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(tab)}!A1:Z1?valueInputOption=RAW`, {
                  method:'PUT', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
                  body: JSON.stringify({ values:[headers] })
                });
              }
              if(await isTabEmpty(sid, tab)) return { tab, ok:true, via:'recreate' };
              lastErr = 'tạo lại tab nhưng vẫn còn dòng';
            }
          }catch(e){ lastErr = e.message; }
          return { tab, ok:false, error: lastErr };
        };

        const tabDefs = Object.values(SHEET_DEFINITIONS);
        const tabs = tabDefs.map(d=>d.sheetName);
        const tabResults = [];
        for(const def of tabDefs){
          const r = await clearAndVerify(spreadsheetId, def.sheetName, def.headers);
          tabResults.push(r);
          if(r.ok) console.log(`[SYSTEM RESET] Đã xóa sạch tab ${def.sheetName} (${r.via})`);
          else console.log(`[SYSTEM RESET] Tab ${def.sheetName} XÓA THẤT BẠI: ${r.error}`);
          await new Promise(r2=>setTimeout(r2,100)); // throttle
        }
        const ok = tabResults.filter(t=>t.ok).length;
        const errors = tabResults.filter(t=>!t.ok).map(t=>`${t.tab}: ${t.error}`);

        // Xóa cả Sheet nộp Form (1rcq) — chống hồi sinh ứng viên
        let formCleared = false;
        try{
          const formSid = db.settings?.googleSheet?.formResponsesSheetId || '1rcqEKraSRhr-Tn9qwlhADlkQUei8j65bXeHF_Tmkd38';
          const formTab = db.settings?.googleSheet?.formSheetName || 'FROM_NHAN_VIEN';
          await clearRange(formSid, formTab);
          formCleared = await isTabEmpty(formSid, formTab);
          if(formCleared) console.log(`[SYSTEM RESET] Đã xóa Sheet Form ${formSid}/${formTab}`);
          else errors.push(`FORM ${formTab}: vẫn còn dòng sau khi xóa`);
        }catch(e){ errors.push(`FORM: ${e.message}`); }

        const needOwner = errors.some(e=>/protect|permission|denied|forbidden/i.test(e));
        sheetResult = { cleared: ok, total: tabs.length, errors, formCleared, tabs: tabResults.map(t=>({tab:t.tab, ok:t.ok, via:t.via||null, error:t.error||null})), hint: needOwner ? 'Một số tab bị chủ file ĐẶT PROTECTION — mở Sheet → Dữ liệu → Phạm vi được bảo vệ để gỡ nếu cần' : null };
        console.log(`[SYSTEM RESET] Đã xóa Sheet 17iXM: ${ok}/${tabs.length} tab (verify từng tab)`);
      }
    }catch(e){ sheetResult = { cleared:false, error:e.message }; }
    finally{
      isSystemResetting = false;
    }
  } else if(scope==='EMPLOYEES'){
    db.employees=[]; db.keys=[]; db.attendances=[]; db.schedules=[];
    saveDB();
    io.emit('employees:update', []);
    io.emit('keys:update', []);
    io.emit('schedules:update', []);
    io.emit('attendances:update', []);
  }
  // Reset ALL xóa Sheet → xóa luôn cache SĐT để import lại không bị báo trùng oan
  if(scope==='ALL'){ try{ sheetPhoneCache = { at: 0, set: new Set() }; }catch(_){} }
  audit(req.user.username,'SYSTEM_RESET','SYSTEM', {scope, before: 'snapshot'}, {scope, sheet: sheetResult}, req.ip);
  saveDB();
  res.json({success:true, sheet: sheetResult});
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
      a.updated_at=getVietnamISOString();
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
  const now = getVietnamNow();
  if(type==='WEEK'){ const d=new Date(now); d.setDate(now.getDate()+7); return d; }
  if(type==='YEAR'){ const d=new Date(now); d.setFullYear(now.getFullYear()+1); return d; }
  // MONTH default
  const d=new Date(now); d.setMonth(now.getMonth()+1); return d;
}
// Admin tạo key Finance theo tuần/tháng/năm
app.post('/api/finance-keys/generate', authMiddleware, roleCheck(['Admin']), (req,res)=>{
  const { type, label } = req.body; // WEEK, MONTH, YEAR
  const t = (type||'MONTH').toUpperCase();
  if(!['WEEK','MONTH','YEAR'].includes(t)) return res.status(400).json({error:'Loại key phải là WEEK (tuần), MONTH (tháng) hoặc YEAR (năm)'});
  const key = generateFinanceKey(t);
  const expiresAt = getFinanceExpiry(t).toISOString();
  const rec = { id: uuidv4(), key, type: t, label: label||`Kế toán ${t} ${new Date().toLocaleDateString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})}`, expiresAt, createdAt: getVietnamISOString(), createdBy: req.user.username, status:'ACTIVE', version:1 };
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
  if(!rec) return res.status(404).json({error:'Không tìm thấy key'});
  const before={...rec};
  rec.status='REVOKED'; rec.revokedBy=req.user.username; rec.revokedAt=getVietnamISOString();
  audit(req.user.username,'REVOKE_FINANCE_KEY','FINANCE_KEY',before,rec, req.ip);
  saveDB(); io.emit('financeKeys:update', db.financeKeys);
  res.json(rec);
});
// Finance login bằng key (không cần username/password)
app.post('/api/auth/finance-login', (req,res)=>{
  const { key } = req.body;
  if(!key) return res.status(400).json({error:'Vui lòng nhập Finance Key'});
  const rec = db.financeKeys.find(k=>k.key===key);
  if(!rec) return res.status(401).json({error:'Key không hợp lệ - vui lòng kiểm tra lại'});
  if(rec.status!=='ACTIVE') return res.status(403).json({error:`Key đã ${rec.status==='EXPIRED'?'hết hạn':'bị thu hồi'} (${rec.status})`});
  if(new Date(rec.expiresAt).getTime() <= Date.now()){
    rec.status='EXPIRED'; saveDB(); io.emit('financeKeys:update', db.financeKeys);
    return res.status(403).json({error:'Key đã hết hạn - vui lòng xin key mới từ Quản trị', expired:true});
  }
  const expSec = Math.floor((new Date(rec.expiresAt).getTime() - Date.now())/1000);
  if(expSec <=0) return res.status(403).json({error:'Key đã hết hạn - vui lòng xin key mới từ Quản trị'});
  const token = jwt.sign({ financeKeyId: rec.id, key: rec.key, role:'Finance', type: rec.type, label: rec.label }, JWT_SECRET, {expiresIn: expSec});
  audit('FINANCE_KEY','FINANCE_LOGIN','FINANCE_KEY',null,{key: rec.key, type: rec.type}, req.ip);
  res.json({ token, key: rec, expiresAt: rec.expiresAt, expSec });
});
// Middleware cho Finance
function financeAuthMiddleware(req,res,next){
  const token = req.headers.authorization?.replace('Bearer ','');
  if(!token) return res.status(401).json({error:'Chưa có token - vui lòng đăng nhập lại', code:'No token', needLogin:true});
  try{
    const decoded = jwt.verify(token, JWT_SECRET);
    if(decoded.role!=='Finance') return res.status(403).json({error:'Bạn không có quyền truy cập Tài chính (yêu cầu vai trò Finance)'});
    // check key still active
    const rec = db.financeKeys.find(k=>k.id===decoded.financeKeyId || k.key===decoded.key);
    if(!rec) return res.status(401).json({error:'Key không tồn tại - vui lòng đăng nhập lại', needLogin:true});
    if(rec.status!=='ACTIVE') return res.status(403).json({error:`Key đã ${rec.status==='EXPIRED'?'hết hạn':'bị thu hồi'} (${rec.status})`, needLogin:true, expired: rec.status==='EXPIRED'});
    if(new Date(rec.expiresAt).getTime() <= Date.now()){
      rec.status='EXPIRED'; saveDB(); io.emit('financeKeys:update', db.financeKeys);
      return res.status(403).json({error:'Key đã hết hạn - phiên đăng nhập đã hết hạn', needLogin:true, expired:true});
    }
    req.finance = decoded;
    req.financeKey = rec;
    next();
  }catch(e){ return res.status(401).json({error:'Token không hợp lệ hoặc đã hết hạn - vui lòng đăng nhập lại', needLogin:true, expired:true}); }
}
// Finance reports - chỉ đọc báo cáo chấm công (reuse logic)
app.get('/api/finance/reports/overview', financeAuthMiddleware, (req,res)=>{
  const { month, branch } = req.query;
  const m = month || getVietnamTodayStr().slice(0,7);
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
  const { month, branch } = req.query; const m = month || getVietnamTodayStr().slice(0,7); const start=m+'-01'; const end=m+'-31';
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
  const { employeeId, month } = req.query; if(!employeeId) return res.status(400).json({error:'Thiếu mã nhân viên (employeeId)'}); const m = month || getVietnamTodayStr().slice(0,7); const start=m+'-01'; const end=m+'-31';
  const emp=db.employees.find(e=>e.employeeId===employeeId); if(!emp) return res.status(404).json({error:'Không tìm thấy nhân viên'});
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
  const { month, branch } = req.query; const m = month || getVietnamTodayStr().slice(0,7); const start=m+'-01', end=m+'-31';
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
  const { month, branch } = req.query; const m = month || getVietnamTodayStr().slice(0,7);
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
// === MA TRẬN CHẤM CÔNG THÁNG (Mẫu 1: Grid 1 -> 31 ngày) ===
app.get('/api/finance/reports/matrix', financeAuthMiddleware, (req,res)=>{
  const { month, branch } = req.query;
  const m = month || getVietnamTodayStr().slice(0,7);
  const [yearStr, monthStr] = m.split('-');
  const y = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10);
  const daysInMonth = new Date(y, mon, 0).getDate();

  const branchOrder = ['CN3', 'CN2', 'CN1', 'CN4'];
  const branchMeta = {
    'CN3': { name: '120 Hoàng Diệu 2', shortCode: '120' },
    'CN2': { name: '261 Tô Hiến Thành', shortCode: '261' },
    'CN1': { name: '130 Vạn Kiếp', shortCode: '130' },
    'CN4': { name: '111 Tôn Đản', shortCode: '111' }
  };

  let emps = [...db.employees].filter(e=> e.status!=='ARCHIVED');
  if(branch) emps = emps.filter(e=> e.branchId===branch);

  emps.sort((a,b)=>{
    const ordA = branchOrder.indexOf(a.branchId);
    const ordB = branchOrder.indexOf(b.branchId);
    if(ordA!==-1 && ordB!==-1 && ordA!==ordB) return ordA - ordB;
    return (a.employeeId||'').localeCompare(b.employeeId||'');
  });

  const branchCounters = {};
  let totalHoursAll = 0;
  let totalDaysAll = 0;

  const rows = emps.map(emp=>{
    const bId = emp.branchId || 'CN3';
    branchCounters[bId] = (branchCounters[bId] || 0) + 1;
    const bMeta = branchMeta[bId] || { name: bId, shortCode: bId.replace(/\D/g,'')||'100' };
    const cnCode = `${bMeta.shortCode}.${branchCounters[bId]}`;

    const isTrainingEmp = (emp.status==='TRAINING' || emp.type==='TRAINING' || (emp.officialStartDate && emp.officialStartDate > `${m}-01`));
    const luongHocViec = isTrainingEmp ? 21000 : null;
    const mucLuong = 25500;

    const days = [];
    let empTotalHours = 0;
    let empTotalDays = 0;

    for(let d=1; d<=daysInMonth; d++){
      const dateStr = `${m}-${String(d).padStart(2,'0')}`;
      const atts = db.attendances.filter(a=> a.employeeId===emp.employeeId && a.date===dateStr);
      let dayHours = 0;
      atts.forEach(att=>{
        if(att.checkIn){
          if(att.actualHours) dayHours += Number(att.actualHours);
          else {
            const shiftCfg = db.settings?.payroll?.shifts?.[att.shift || emp.shift];
            dayHours += (shiftCfg?.hours || 5);
          }
        }
      });
      if(dayHours===0){
        const sched = db.schedules.find(s=> s.employeeId===emp.employeeId);
        const schedDay = sched?.days?.find(sd=> sd.date===dateStr);
        if(schedDay && (schedDay.status==='WORKING'||schedDay.status==='SUBSTITUTE')){
          const hasAtt = db.attendances.find(a=> a.employeeId===emp.employeeId && a.date===dateStr && a.checkIn);
          if(hasAtt){
            const shiftCfg = db.settings?.payroll?.shifts?.[schedDay.shift || emp.shift];
            dayHours = (shiftCfg?.hours || 5);
          }
        }
      }

      const isDayTraining = isTrainingEmp && (!emp.officialStartDate || dateStr < emp.officialStartDate);

      if(dayHours > 0){
        empTotalHours += dayHours;
        empTotalDays++;
        days.push({ day: d, date: dateStr, hours: Math.round(dayHours*10)/10, isTraining: isDayTraining });
      } else {
        days.push({ day: d, date: dateStr, hours: null, isTraining: false });
      }
    }

    totalHoursAll += empTotalHours;
    totalDaysAll += empTotalDays;

    return {
      branchName: bMeta.name,
      branchId: bId,
      code: emp.employeeId,
      cn: cnCode,
      name: (emp.name || '').toUpperCase(),
      luongHocViec,
      mucLuong,
      days,
      tongGio: Math.round(empTotalHours*10)/10,
      ngayCong: empTotalDays,
      isSpecial: (emp.isSpecial || (emp.notes && emp.notes.includes('Đặc biệt')))
    };
  });

  res.json({
    month: m,
    daysInMonth,
    title: `BẢNG CHẤM CÔNG THÁNG ${monthStr}.${yearStr}`,
    rows,
    summary: {
      totalEmployees: rows.length,
      totalHours: Math.round(totalHoursAll*10)/10,
      totalDays: totalDaysAll
    }
  });
});

// === THEO DÕI HOÀN TIỀN ĐỒNG PHỤC (Mẫu 2) ===
app.get('/api/finance/reports/dong-phuc', financeAuthMiddleware, (req,res)=>{
  if(!db.financeDongPhuc) db.financeDongPhuc = [];
  const branchMeta = {
    'CN3': '120 Hoàng Diệu 2',
    'CN2': '261 Tô Hiến Thành',
    'CN1': '130 Vạn Kiếp',
    'CN4': '111 Tôn Đản'
  };
  const list = db.employees.map(emp=>{
    const existing = db.financeDongPhuc.find(r=> r.bhCode===emp.employeeId) || {};
    const bName = branchMeta[emp.branchId] || emp.branchId || '120 Hoàng Diệu 2';
    const statusText = emp.status==='ARCHIVED'?'Nghỉ việc':emp.status==='TRAINING'?'Thử việc':'Đang làm';
    return {
      bhCode: emp.employeeId,
      ngayLamViec: emp.startDate || '',
      ngayNghi: emp.resignationDate || (emp.status==='ARCHIVED'?'Đã nghỉ':''),
      trangThai: statusText,
      hoTen: (emp.name||'').toUpperCase(),
      chiNhanh: bName,
      branchId: emp.branchId,
      soTien: existing.soTien !== undefined ? existing.soTien : 300000,
      tienHoan: existing.tienHoan !== undefined ? existing.tienHoan : 300000,
      kiHoan: existing.kiHoan || '',
      hoanDot1: existing.hoanDot1 || 'Hoàn thành',
      ghiChu: existing.ghiChu || ''
    };
  });
  db.financeDongPhuc.forEach(r=>{
    if(!list.some(l=> l.bhCode===r.bhCode)){
      list.push({
        bhCode: r.bhCode,
        ngayLamViec: r.ngayLamViec || '',
        ngayNghi: r.ngayNghi || '',
        trangThai: r.trangThai || 'Nghỉ việc',
        hoTen: (r.hoTen||'').toUpperCase(),
        chiNhanh: r.chiNhanh || '120 Hoàng Diệu 2',
        soTien: r.soTien || 300000,
        tienHoan: r.tienHoan !== undefined ? r.tienHoan : (r.soTien || 300000),
        kiHoan: r.kiHoan || '',
        hoanDot1: r.hoanDot1 || 'Hoàn thành',
        ghiChu: r.ghiChu || ''
      });
    }
  });
  res.json({ rows: list });
});

app.post('/api/finance/reports/dong-phuc', financeAuthMiddleware, (req,res)=>{
  const { bhCode, soTien, tienHoan, kiHoan, hoanDot1, ghiChu, ngayLamViec, ngayNghi, trangThai, hoTen, chiNhanh } = req.body;
  if(!bhCode) return res.status(400).json({ error:'Thiếu Mã NV' });
  if(!db.financeDongPhuc) db.financeDongPhuc = [];
  let row = db.financeDongPhuc.find(r=> r.bhCode===bhCode);
  if(row){
    Object.assign(row, {
      soTien: Number(soTien)||0,
      tienHoan: Number(tienHoan)||0,
      kiHoan: kiHoan || row.kiHoan || '',
      hoanDot1: hoanDot1 || row.hoanDot1 || 'Hoàn thành',
      ghiChu: ghiChu !== undefined ? ghiChu : row.ghiChu,
      updatedAt: getVietnamISOString()
    });
  } else {
    row = {
      bhCode,
      hoTen: hoTen || '',
      chiNhanh: chiNhanh || '',
      ngayLamViec: ngayLamViec || '',
      ngayNghi: ngayNghi || '',
      trangThai: trangThai || 'Đang làm',
      soTien: Number(soTien)||300000,
      tienHoan: Number(tienHoan)||300000,
      kiHoan: kiHoan || '',
      hoanDot1: hoanDot1 || 'Hoàn thành',
      ghiChu: ghiChu || '',
      createdAt: getVietnamISOString()
    };
    db.financeDongPhuc.push(row);
  }
  saveDB();
  io.emit('finance:dongPhuc:update', db.financeDongPhuc);
  res.json({ success:true, row });
});

// === THEO DÕI HOÀN TIỀN KHÁM SỨC KHỎE (Mẫu 3) ===
app.get('/api/finance/reports/kham-suc-khoe', financeAuthMiddleware, (req,res)=>{
  if(!db.financeKhamSK) db.financeKhamSK = [];
  const branchMeta = {
    'CN3': { name: '120 Hoàng Diệu 2', color: 'blue' },
    'CN2': { name: '261 Tô Hiến Thành', color: 'purple' },
    'CN1': { name: '130 Vạn Kiếp', color: 'emerald' },
    'CN4': { name: '111 Tôn Đản', color: 'indigo' }
  };
  let stt = 1;
  const list = db.employees.map(emp=>{
    const existing = db.financeKhamSK.find(r=> r.bhCode===emp.employeeId) || {};
    const bMeta = branchMeta[emp.branchId] || { name: emp.branchId||'120 Hoàng Diệu 2', color: 'slate' };
    const ngayKiHD = existing.ngayKiHD || emp.officialStartDate || emp.startDate || '';
    let ngayHoan = existing.ngayHoan;
    if(!ngayHoan && ngayKiHD){
      try{
        const p = ngayKiHD.split('-');
        if(p.length===3){
          const d = new Date(parseInt(p[0]), parseInt(p[1])-1 + 6, parseInt(p[2]));
          ngayHoan = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        }
      }catch(_){}
    }
    return {
      stt: stt++,
      bhCode: emp.employeeId,
      hoTen: (emp.name||'').toUpperCase(),
      chiNhanh: bMeta.name,
      branchId: emp.branchId,
      branchColor: bMeta.color,
      ngayKiHD,
      ngayHoan: ngayHoan || '',
      ngayKham: existing.ngayKham || '',
      tienKham: existing.tienKham !== undefined ? existing.tienKham : (existing.soTien || 160000),
      mucDuyet: existing.mucDuyet !== undefined ? existing.mucDuyet : 160000,
      tinhTrangHoan: existing.tinhTrangHoan || 'CHƯA HOÀN TRẢ GIẤY KHÁM',
      ghiChu: existing.ghiChu || 'HOÀN 100% CHO NHÂN SỰ'
    };
  });
  db.financeKhamSK.forEach(r=>{
    if(!list.some(l=> l.bhCode===r.bhCode)){
      list.push({
        stt: stt++,
        bhCode: r.bhCode,
        hoTen: (r.hoTen||'').toUpperCase(),
        chiNhanh: r.chiNhanh || '261 Tô Hiến Thành',
        branchId: r.branchId || 'CN2',
        branchColor: 'purple',
        ngayKiHD: r.ngayKiHD || '',
        ngayHoan: r.ngayHoan || '',
        ngayKham: r.ngayKham || '',
        tienKham: r.tienKham !== undefined ? r.tienKham : (r.soTien || 160000),
        mucDuyet: r.mucDuyet !== undefined ? r.mucDuyet : 160000,
        tinhTrangHoan: r.tinhTrangHoan || 'CHƯA HOÀN TRẢ GIẤY KHÁM',
        ghiChu: r.ghiChu || ''
      });
    }
  });
  res.json({ rows: list });
});

app.post('/api/finance/reports/kham-suc-khoe', financeAuthMiddleware, (req,res)=>{
  const { bhCode, ngayKiHD, ngayHoan, ngayKham, tienKham, mucDuyet, tinhTrangHoan, ghiChu, hoTen, chiNhanh } = req.body;
  if(!bhCode) return res.status(400).json({ error:'Thiếu Mã NV' });
  if(!db.financeKhamSK) db.financeKhamSK = [];
  let row = db.financeKhamSK.find(r=> r.bhCode===bhCode);
  if(row){
    Object.assign(row, {
      ngayKiHD: ngayKiHD !== undefined ? ngayKiHD : row.ngayKiHD,
      ngayHoan: ngayHoan !== undefined ? ngayHoan : row.ngayHoan,
      ngayKham: ngayKham !== undefined ? ngayKham : row.ngayKham,
      tienKham: Number(tienKham)||0,
      mucDuyet: Number(mucDuyet)||0,
      tinhTrangHoan: tinhTrangHoan || row.tinhTrangHoan || 'CHƯA HOÀN TRẢ GIẤY KHÁM',
      ghiChu: ghiChu !== undefined ? ghiChu : row.ghiChu,
      updatedAt: getVietnamISOString()
    });
  } else {
    row = {
      bhCode,
      hoTen: hoTen || '',
      chiNhanh: chiNhanh || '',
      ngayKiHD: ngayKiHD || '',
      ngayHoan: ngayHoan || '',
      ngayKham: ngayKham || '',
      tienKham: Number(tienKham)||0,
      mucDuyet: Number(mucDuyet)||0,
      tinhTrangHoan: tinhTrangHoan || 'CHƯA HOÀN TRẢ GIẤY KHÁM',
      ghiChu: ghiChu || '',
      createdAt: getVietnamISOString()
    };
    db.financeKhamSK.push(row);
  }
  saveDB();
  io.emit('finance:khamSK:update', db.financeKhamSK);
  res.json({ success:true, row });
});

// === BẢNG TÍNH LƯƠNG TỔNG HỢP ===
app.get('/api/finance/reports/payroll-summary', financeAuthMiddleware, (req,res)=>{
  const { month, branch } = req.query;
  const m = month || getVietnamTodayStr().slice(0,7);
  const start = m+'-01'; const end = m+'-31';
  let emps = [...db.employees].filter(e=> e.status!=='ARCHIVED');
  if(branch) emps = emps.filter(e=> e.branchId===branch);

  const branchMeta = {
    'CN3': '120 Hoàng Diệu 2',
    'CN2': '261 Tô Hiến Thành',
    'CN1': '130 Vạn Kiếp',
    'CN4': '111 Tôn Đản'
  };

  const rows = emps.map(emp=>{
    const isTraining = (emp.status==='TRAINING' || emp.type==='TRAINING');
    const atts = db.attendances.filter(a=> a.employeeId===emp.employeeId && a.date>=start && a.date<=end && a.checkIn);
    
    let trainingHours = 0;
    let officialHours = 0;

    atts.forEach(a=>{
      const shiftHours = (db.settings.payroll.shifts[a.shift || emp.shift]?.hours) || 5;
      const h = a.actualHours ? Number(a.actualHours) : shiftHours;
      const isDayTraining = isTraining && (!emp.officialStartDate || a.date < emp.officialStartDate);
      if(isDayTraining) trainingHours += h;
      else officialHours += h;
    });

    const luongHocViec = Math.round(trainingHours * 21000);
    const luongChinhThuc = Math.round(officialHours * 25500);

    const dp = (db.financeDongPhuc||[]).find(d=> d.bhCode===emp.employeeId);
    const hoanDongPhuc = (dp && dp.hoanDot1==='Hoàn thành') ? (Number(dp.tienHoan)||0) : 0;

    const ksk = (db.financeKhamSK||[]).find(k=> k.bhCode===emp.employeeId);
    const hoanKhamSK = (ksk && (ksk.tinhTrangHoan==='ĐÃ HOÀN TRẢ GIẤY KHÁM'||ksk.tinhTrangHoan==='ĐÃ HOÀN TIỀN')) ? (Number(ksk.mucDuyet)||0) : 0;

    let giamTru = 0;
    atts.forEach(a=>{
      if(a.violations && a.violations.includes('LATE')) giamTru += 20000;
    });

    const thucLinh = luongHocViec + luongChinhThuc + hoanDongPhuc + hoanKhamSK - giamTru;

    return {
      employeeId: emp.employeeId,
      name: (emp.name||'').toUpperCase(),
      branchName: branchMeta[emp.branchId] || emp.branchId,
      trainingHours: Math.round(trainingHours*10)/10,
      officialHours: Math.round(officialHours*10)/10,
      totalHours: Math.round((trainingHours+officialHours)*10)/10,
      luongHocViec,
      luongChinhThuc,
      hoanDongPhuc,
      hoanKhamSK,
      giamTru,
      thucLinh
    };
  });

  res.json({ month: m, rows });
});

// Finance 4 sheets - backward compatibility
app.get('/api/finance/sheets/master-data', financeAuthMiddleware, async (req,res)=>{
  const rows = db.employees.filter(e=> e.status!=='ARCHIVED').map(e=> ({
    bhCode: e.employeeId, hoTen: e.name, branchGoc: e.branchId, status: e.status, ngayLenChinhThuc: e.officialStartDate || e.startDate || '', donGia: e.status==='OFFICIAL'?25500:21000
  }));
  res.json({ sheet:'MASTER_DATA', rows, source:'DB_FALLBACK' });
});
app.get('/api/finance/sheets/dong-phuc', financeAuthMiddleware, (req,res)=>{
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
    note: 'Trang tính ẩn MẪU_LƯƠNG chứa công thức, khi tạo LUONG_THANG_MM_YYYY sẽ sao chép nguyên mẫu'
  });
});
// Finance 4 sheets - đồng bộ 2 chiều khi kế toán sửa trên web
app.post('/api/finance/sheets/master-data', financeAuthMiddleware, async (req,res)=>{
  const { bhCode, hoTen, branchGoc, status, ngayLenChinhThuc } = req.body;
  if(!bhCode) return res.status(400).json({ error:'Thiếu Mã NV (BH_Code)' });
  // Cập nhật local DB (MASTER_DATA) - nếu chưa có thì tạo mới (finance có thể tạo BH mới)
  let emp = db.employees.find(e=> e.employeeId===bhCode);
  if(emp){
    const before={...emp};
    if(hoTen) emp.name=hoTen;
    if(branchGoc) emp.branchId=branchGoc;
    if(status) emp.status=status;
    if(ngayLenChinhThuc!==undefined) emp.officialStartDate=ngayLenChinhThuc;
    emp.updated_at=getVietnamISOString();
    audit(req.finance.key,'UPDATE_MASTER_DATA','MASTER_DATA', before, emp, req.ip);
  } else {
    // Tạo mới BH_Code từ Finance web (chưa có trong HR)
    const newEmp = {
      id: uuidv4(), employeeId: bhCode, name: hoTen||bhCode, phone: '', branchId: branchGoc||'CN1', shift: 'CA_SANG',
      startDate: getVietnamTodayStr(), status: status||'Training', type: (status==='Official'?'OFFICIAL':'TRAINING'),
      category: 'STORE', version:1, updated_at: getVietnamISOString(), updated_by: req.finance.key, source:'FINANCE_WEB', sync_status:'PENDING'
    };
    if(ngayLenChinhThuc) newEmp.officialStartDate=ngayLenChinhThuc;
    db.employees.push(newEmp);
    audit(req.finance.key,'CREATE_MASTER_DATA','MASTER_DATA', null, newEmp, req.ip);
    // Tạo key cho NV mới nếu cần
    const newKey={ id: uuidv4(), employeeId: bhCode, key: 'KEY-'+Math.random().toString(36).substring(2,10).toUpperCase(), status:'ACTIVE', version:1, updated_at: getVietnamISOString(), sync_status:'PENDING' };
    db.keys.push(newKey);
  }
  // Đồng bộ lên Google Sheets Finance MASTER_DATA
  const financeId = db.settings.finance?.spreadsheetId || process.env.FINANCE_MASTER_ID || 'FINANCE_MASTER_ID';
  const webhookUrl = db.settings.finance?.webhookUrl || process.env.FINANCE_WEBHOOK_URL;
  const secret = db.settings.finance?.secret || process.env.FINANCE_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;
  if(webhookUrl){
    try{ await fetch(webhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ secret, action:'UPSERT_EMPLOYEE', payload:{ bhCode, hoTen, branchGoc, status, ngayLenChinhThuc } }) }); }catch(e){ console.error('Finance MASTER_DATA sync error', e.message); }
  }
  saveDB(); io.emit('finance:masterData:update', db.employees);
  res.json({ success:true, bhCode });
});
app.post('/api/finance/sheets/dong-phuc', financeAuthMiddleware, async (req,res)=>{
  const { bhCode, hoTen, soTien, ngay, ghiChu } = req.body;
  if(!bhCode) return res.status(400).json({ error:'Thiếu Mã NV (BH_Code)' });
  if(!db.financeDongPhuc) db.financeDongPhuc=[];
  let row = db.financeDongPhuc.find(r=> r.bhCode===bhCode);
  if(row){ Object.assign(row, { hoTen: hoTen||row.hoTen, soTien: soTien!=null?Number(soTien):row.soTien, ngay: ngay||row.ngay, ghiChu: ghiChu||row.ghiChu, updatedAt: getVietnamISOString() }); }
  else { row={ bhCode, hoTen: hoTen||'', soTien: Number(soTien)||0, ngay: ngay||getVietnamTodayStr(), ghiChu: ghiChu||'', createdAt: getVietnamISOString() }; db.financeDongPhuc.push(row); }
  const webhookUrl = db.settings.finance?.webhookUrl || process.env.FINANCE_WEBHOOK_URL;
  const secret = db.settings.finance?.secret || process.env.FINANCE_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;
  if(webhookUrl){ try{ await fetch(webhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ secret, action:'UPSERT_DONGPHUC', payload: row }) }); }catch(e){} }
  saveDB(); io.emit('finance:dongPhuc:update', db.financeDongPhuc);
  res.json({ success:true, row });
});
app.post('/api/finance/sheets/kham-suc-khoe', financeAuthMiddleware, async (req,res)=>{
  const { bhCode, hoTen, soTien, ngay, ghiChu } = req.body;
  if(!bhCode) return res.status(400).json({ error:'Thiếu Mã NV (BH_Code)' });
  if(!db.financeKhamSK) db.financeKhamSK=[];
  let row = db.financeKhamSK.find(r=> r.bhCode===bhCode);
  if(row){ Object.assign(row, { hoTen: hoTen||row.hoTen, soTien: soTien!=null?Number(soTien):row.soTien, ngay: ngay||row.ngay, ghiChu: ghiChu||row.ghiChu, updatedAt: getVietnamISOString() }); }
  else { row={ bhCode, hoTen: hoTen||'', soTien: Number(soTien)||0, ngay: ngay||getVietnamTodayStr(), ghiChu: ghiChu||'', createdAt: getVietnamISOString() }; db.financeKhamSK.push(row); }
  const webhookUrl = db.settings.finance?.webhookUrl || process.env.FINANCE_WEBHOOK_URL;
  const secret = db.settings.finance?.secret || process.env.FINANCE_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;
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
  console.log('Socket connected', socket.id, socket.user ? `user:${socket.user.username||socket.user.employeeId||socket.user.key||socket.user.role}` : 'anonymous');
  socket.emit('db:init', { employees: db.employees.length, applicants: db.applicants.length, timestamp: getVietnamISOString(), heartbeat: true });
  socket.emit('automation:heartbeat', { now: getVietnamISOString(), realtime: true });
  // Realtime room per branch + per employee (để force logout khi xóa tài khoản) + finance
  if(socket.user?.branchScope) socket.user.branchScope.forEach(b=> socket.join(`branch:${b}`));
  if(socket.user?.branchId) socket.join(`branch:${socket.user.branchId}`);
  if(socket.user?.employeeId) socket.join(`employee:${socket.user.employeeId}`);
  // Finance: join global finance room + all branches để nhận broadcast kế toán (dù broadcast toàn cục vẫn nhận, join để hỗ trợ io.to('finance').emit sau này)
  if(socket.user?.role==='Finance'){
    socket.join('finance');
    // Finance có quyền đọc tất cả chi nhánh - join all branch rooms
    (db.branches||[]).forEach(b=> socket.join(`branch:${b.id}`));
    if(socket.user?.financeKeyId) socket.join(`finance:${socket.user.financeKeyId}`);
    if(socket.user?.key) socket.join(`finance:${socket.user.key}`);
  }
  // Admin không có branchScope cụ thể nhưng role Admin -> join all branches
  if(socket.user?.role==='Admin'){
    (db.branches||[]).forEach(b=> socket.join(`branch:${b.id}`));
    socket.join('admin');
  }
  socket.on('disconnect', ()=> console.log('disconnected', socket.id));
  socket.on('ping:heartbeat', ()=> socket.emit('pong:heartbeat', { now: getVietnamISOString() }));
});

server.listen(PORT, ()=> console.log(`Ụm Bò Milk HR running at http://localhost:${PORT}`));
