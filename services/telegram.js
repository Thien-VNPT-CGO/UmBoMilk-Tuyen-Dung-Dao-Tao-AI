// services/telegram.js — Tích hợp Telegram Bot + Mini App (WebApp) cho Ụm Bò Milk
// Giữ nguyên 100% logic cũ: module độc lập, không đụng Zalo/Sheet/DB thật.
// Dùng Telegram Bot HTTP API thuần qua fetch (không thêm dependency mới).
// Tôn trọng DISABLE_OUTBOUND_SYNC / NODE_ENV=test: không gọi mạng khi test.
const crypto = require('crypto');

const OUTBOUND_DISABLED = () =>
  process.env.DISABLE_OUTBOUND_SYNC === 'true' || process.env.NODE_ENV === 'test';

// ---- Telegram WebApp initData verification (đúng spec Telegram) ----
// initData: query string từ Telegram.WebApp.initData
// secret = HMAC_SHA256(botToken, key="WebAppData") -> hash check
function parseTelegramInitData(initData) {
  const params = new URLSearchParams(initData || '');
  const data = {};
  for (const [k, v] of params.entries()) data[k] = v;
  return data;
}

function verifyTelegramInitData(initData, botToken, maxAgeSec = 86400) {
  try {
    if (!initData || !botToken) return { ok: false, error: 'Thiếu initData/botToken' };
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { ok: false, error: 'Thiếu hash' };
    params.delete('hash');
    const keys = [...params.keys()].sort();
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calc !== hash) return { ok: false, error: 'Sai chữ ký initData' };
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (authDate && Date.now() / 1000 - authDate > maxAgeSec) {
      return { ok: false, error: 'initData hết hạn' };
    }
    let user = null;
    try { user = JSON.parse(params.get('user') || 'null'); } catch (e) { user = null; }
    return { ok: true, user, authDate };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---- Bot HTTP API (fetch thuần) ----
async function tgApi(botToken, method, payload = {}) {
  if (!botToken) throw new Error('Chưa cấu hình TELEGRAM_BOT_TOKEN');
  if (OUTBOUND_DISABLED()) return { ok: true, disabled: true, result: null };
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram API lỗi ${method}`);
  return j;
}

async function sendTelegramMessage(botToken, chatId, text, extra = {}) {
  if (!botToken || !chatId || !text) return { ok: false, skipped: true };
  try {
    const j = await tgApi(botToken, 'sendMessage', {
      chat_id: chatId, text: String(text).slice(0, 4000), parse_mode: 'HTML', ...extra,
    });
    return { ok: true, result: j.result || null, disabled: !!j.disabled };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function setTelegramWebhook(botToken, webhookUrl) {
  if (!botToken || !webhookUrl) return { ok: false, skipped: true };
  try {
    const j = await tgApi(botToken, 'setWebhook', { url: webhookUrl });
    return { ok: true, result: j.result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function setTelegramMenuButton(botToken, webAppUrl) {
  if (!botToken || !webAppUrl) return { ok: false, skipped: true };
  try {
    const j = await tgApi(botToken, 'setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Mở Ụm Bò Milk', web_app: { url: webAppUrl } },
    });
    return { ok: true, result: j.result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function setTelegramCommands(botToken, role = 'employee') {
  if (!botToken) return { ok: false, skipped: true };
  const commandsByRole = {
    employee: [
      { command: 'menu', description: '📱 Bảng chức năng thao tác nhanh' },
      { command: 'diemdanh', description: '📍 Điểm danh Check-in/Check-out GPS' },
      { command: 'lich', description: '📅 Xem lịch làm việc 7 ngày tới' },
      { command: 'off', description: '🏖️ Đăng ký lịch OFF 2 ngày/tuần' },
      { command: 'luong', description: '💰 Xem lương tạm tính tháng này' },
      { command: 'doica', description: '🔄 Đổi ca làm việc / Tráo ca' },
      { command: 'baohong', description: '🛠️ Báo hỏng thiết bị cửa hàng' },
      { command: 'app', description: '🐮 Mở Mini App Ụm Bò Milk' },
      { command: 'link', description: '🔗 Liên kết tài khoản (nhập SĐT)' },
      { command: 'help', description: '❓ Hướng dẫn sử dụng bot' }
    ],
    hr: [
      { command: 'duyet', description: '✅ Duyệt phiếu chờ (thiết bị, OFF, đổi ca)' },
      { command: 'baocao', description: '📊 Tóm tắt nhân sự hôm nay' },
      { command: 'broadcast', description: '📢 Phát thông báo tới toàn bộ NV' },
      { command: 'app', description: '🛡️ Mở Mini App Quản trị' },
      { command: 'help', description: '❓ Hướng dẫn quản trị' }
    ],
    finance: [
      { command: 'luong', description: '💰 Bảng lương tổng hợp tháng này' },
      { command: 'app', description: '💵 Mở Mini App Tài chính' },
      { command: 'help', description: '❓ Hướng dẫn kế toán' }
    ]
  };
  const cmds = commandsByRole[role] || commandsByRole.employee;
  try {
    const j = await tgApi(botToken, 'setMyCommands', { commands: cmds });
    return { ok: true, result: j.result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---- Bot command logic (thuần, dễ test) — 3 bot theo vai trò ----
const BOT_ROLES = ['hr', 'employee', 'finance'];
const HELP_TEXTS = {
  hr: [
    '🛡️ <b>ỤM BÒ MILK — Bot Quản trị HR</b>',
    '',
    '/start — Mở Mini App Quản trị',
    '/duyet — Số phiếu chờ duyệt (thiết bị, OFF, đổi ca)',
    '/baocao — Tóm tắt nhân sự hôm nay',
    '/broadcast <code>nội dung</code> — Gửi Ed Mini App NV (quản lý Bot NV)',
    '/help — Hướng dẫn này',
  ].join('\n'),
  employee: [
    '🧑‍🍳 <b>ỤM BÒ MILK — Bot Nhân viên</b>',
    '',
    '/start — Mở Mini App Nhân viên',
    '/link <code>MÃ_NV KEY</code> — Liên kết tài khoản (VD: <code>/link CN261_UBM28082026_NV4100 KEY-WBED02RS</code> hoặc <code>/link SĐT</code>)',
    '/unlink — Hủy liên kết',
    '/off <code>dd/mm/yyyy, dd/mm/yyyy</code> — Đăng ký lịch OFF 2 ngày/tuần (hoặc nhắn 2 ngày nghỉ)',
    '/lich — Lịch 7 ngày tới',
    '/diemdanh — Trạng thái chấm công hôm nay',
    '/luong — Lương tạm tính tháng này',
    '/help — Hướng dẫn này',
  ].join('\n'),
  finance: [
    '💰 <b>ỤM BÒ MILK — Bot Kế toán</b>',
    '',
    '/start — Mở Mini App Tài chính',
    '/luong — Bảng lương tổng hợp tháng này',
    '/help — Hướng dẫn này',
  ].join('\n'),
};
const HELP_TEXT = HELP_TEXTS.employee;
const START_TEXTS = {
  hr: '🛡️ <b>Chào mừng đến Mini App Quản trị HR!</b>\nNhấn nút bên dưới để mở app và đăng nhập tài khoản Admin/HR/Manager.',
  employee: '🧑‍🍳 <b>Chào mừng đến Mini App Nhân viên!</b>\nNhấn nút bên dưới để mở app.\nDùng /link <code>MÃ_NV KEY</code> để liên kết tài khoản trước (1 lần duy nhất).',
  finance: '💰 <b>Chào mừng đến Mini App Tài chính!</b>\nNhấn nút bên dưới để mở app và đăng nhập bằng khóa FIN-KEY.',
};

function webAppKeyboard(webAppUrl) {
  if (!webAppUrl) return {};
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '🐮 Mở Ụm Bò Milk App', web_app: { url: webAppUrl } }]],
    },
  };
}

function employeeMenuKeyboard(webAppUrl) {
  const url = webAppUrl || '';
  const inline_keyboard = [
    [
      { text: '📍 Điểm danh', callback_data: '/diemdanh' },
      { text: '📅 Lịch làm', callback_data: '/lich' }
    ],
    [
      { text: '🏖️ Đăng ký OFF', callback_data: '/off' },
      { text: '💰 Xem lương', callback_data: '/luong' }
    ],
    [
      { text: '🔄 Đổi ca', callback_data: '/doica' },
      { text: '🛠️ Báo hỏng', callback_data: '/baohong' }
    ]
  ];
  if (url) {
    inline_keyboard.push([{ text: '🐮 Mở Mini App', web_app: { url } }]);
  }
  return { reply_markup: { inline_keyboard } };
}

function extractOffDates(text) {
  if (!text) return [];
  const regex = /\b(\d{1,2})[/\-.](\d{1,2})[/\-](\d{4})\b/g;
  const list = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!list.includes(iso)) list.push(iso);
    }
  }
  return list;
}

function isOffRegistration(text) {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  if (lower.startsWith('/off')) return true;
  const dates = extractOffDates(text);
  if (dates.length === 0) return false;
  if (lower.includes('off') || lower.includes('nghỉ') || lower.includes('đăng ký') || lower.includes('dang ky')) return true;
  const stripped = lower.replace(/\b\d{1,2}[/\-.]\d{1,2}[/\-]\d{4}\b/g, '').replace(/[\s,;.\-–—vàva]+/g, '').trim();
  if (stripped.length === 0) return true;
  return false;
}

// Xử lý 1 update Telegram -> trả về danh sách action {chatId, text, extra} để gửi.
// Tách logic thuần khỏi DB/network để dễ unit-test; DB callbacks truyền qua ctx.
async function handleTelegramUpdate(update, ctx) {
  const actions = [];
  try {
    const msg = update.message || update.callback_query?.message;
    const chatId = msg?.chat?.id;
    const from = update.message?.from || update.callback_query?.from;
    const text = (update.message?.text || '').trim();
    if (!chatId) return actions;
    const webAppUrl = ctx?.webAppUrl || '';

    if (text.startsWith('/start')) {
      const role = ctx?.role && START_TEXTS[ctx.role] ? ctx.role : 'employee';
      const payload = text.replace('/start', '').trim();
      if (payload && ctx?.linkByStartPayload) {
        const r = await ctx.linkByStartPayload(String(from?.id), payload);
        actions.push({
          chatId,
          text: r.ok
            ? `✅ Đã liên kết Telegram với <b>${r.label}</b>.\nNhấn nút bên dưới để mở Mini App.`
            : `⚠️ ${r.error || 'Mã liên kết không hợp lệ.'}\nDùng /link <code>MÃ_NV KEY</code> hoặc /link <code>SĐT</code> để liên kết.`,
          extra: role === 'employee' ? employeeMenuKeyboard(webAppUrl) : webAppKeyboard(webAppUrl),
        });
      } else {
        actions.push({
          chatId,
          text: START_TEXTS[role],
          extra: role === 'employee' ? employeeMenuKeyboard(webAppUrl) : webAppKeyboard(webAppUrl),
        });
      }
    } else if (text.startsWith('/menu')) {
      actions.push({
        chatId,
        text: '📱 <b>BẢNG CHỨC NĂNG NHANH — ỤM BÒ MILK</b>\n\nNhấn chọn chức năng bên dưới hoặc gõ trực tiếp cú pháp lệnh:\n• <code>/diemdanh</code> — Điểm danh hôm nay\n• <code>/lich</code> — Xem lịch 7 ngày tới\n• <code>18/09/2026, 22/09/2026</code> — Đăng ký 2 ngày OFF\n• <code>/luong</code> — Lương tạm tính tháng này\n• <code>/doica</code> — Đổi ca làm việc\n• <code>/baohong</code> — Báo hỏng thiết bị',
        extra: employeeMenuKeyboard(webAppUrl),
      });
    } else if (text.startsWith('/app')) {
      actions.push({
        chatId,
        text: '🐮 Nhấn nút bên dưới để mở Mini App Ụm Bò Milk:',
        extra: webAppKeyboard(webAppUrl),
      });
    } else if (text.startsWith('/doica')) {
      actions.push({
        chatId,
        text: '🔄 <b>Đổi ca & Tráo ca làm việc</b>\n\nĐể đổi ca hoặc tìm người thế ca khẩn cấp, vui lòng mở Mini App bên dưới để chọn ca và người thay thế thuận tiện nhất:',
        extra: webAppKeyboard(webAppUrl),
      });
    } else if (text.startsWith('/baohong')) {
      actions.push({
        chatId,
        text: '🛠️ <b>Báo hỏng thiết bị & Sự cố cửa hàng</b>\n\nĐể gửi hình ảnh và mô tả hỏng hóc thiết bị, vui lòng mở Mini App bên dưới (chức năng Báo hỏng):',
        extra: webAppKeyboard(webAppUrl),
      });
    } else if (text.startsWith('/link')) {
      const parts = text.split(/\s+/).slice(1);
      if (parts.length === 1 && ctx?.linkByPhone && /^\d{9,11}$/.test(parts[0].replace(/\D/g, ''))) {
        const r = await ctx.linkByPhone(String(from?.id), from?.username || '', parts[0], chatId);
        actions.push({
          chatId,
          text: r.ok ? `✅ Đã liên kết với <b>${r.label}</b>.` : `⚠️ ${r.error || 'Liên kết thất bại.'}`,
          extra: r.ok ? webAppKeyboard(webAppUrl) : {},
        });
      } else if (parts.length < 2) {
        actions.push({ chatId, text: 'Cú pháp: /link <code>MÃ_NV KEY</code> hoặc /link <code>SĐT</code>' });
      } else if (ctx?.linkEmployee) {
        const r = await ctx.linkEmployee(String(from?.id), from?.username || '', parts[0], parts[1], chatId);
        actions.push({
          chatId,
          text: r.ok ? `✅ Đã liên kết với <b>${r.label}</b>.` : `⚠️ ${r.error || 'Liên kết thất bại.'}`,
          extra: r.ok ? webAppKeyboard(webAppUrl) : {},
        });
      }
    } else if (text.startsWith('/unlink')) {
      if (ctx?.unlink) {
        await ctx.unlink(String(from?.id));
        actions.push({ chatId, text: '✅ Đã hủy liên kết Telegram.' });
      }
    } else if (text.startsWith('/lich')) {
      if (ctx?.getSchedule) {
        const r = await ctx.getSchedule(String(from?.id));
        actions.push({ chatId, text: r.text, extra: webAppKeyboard(webAppUrl) });
      } else {
        actions.push({ chatId, text: 'Mở Mini App để xem lịch làm việc.', extra: webAppKeyboard(webAppUrl) });
      }
    } else if (text.startsWith('/diemdanh')) {
      if (ctx?.getTodayStatus) {
        const r = await ctx.getTodayStatus(String(from?.id));
        actions.push({ chatId, text: r.text, extra: webAppKeyboard(webAppUrl) });
      } else {
        actions.push({ chatId, text: 'Mở Mini App để điểm danh.', extra: webAppKeyboard(webAppUrl) });
      }
    } else if (text.startsWith('/luong')) {
      if (ctx?.getSalary) {
        const r = await ctx.getSalary(String(from?.id));
        actions.push({ chatId, text: r.text, extra: webAppKeyboard(webAppUrl) });
      } else {
        actions.push({ chatId, text: 'Mở Mini App Tài chính để xem lương.', extra: webAppKeyboard(webAppUrl) });
      }
    } else if (text.startsWith('/duyet')) {
      if (ctx?.getPendingCounts) {
        const r = await ctx.getPendingCounts();
        actions.push({ chatId, text: r.text, extra: webAppKeyboard(webAppUrl) });
      } else {
        actions.push({ chatId, text: 'Mở Mini App Quản trị để duyệt phiếu.', extra: webAppKeyboard(webAppUrl) });
      }
    } else if (text.startsWith('/baocao')) {
      if (ctx?.getDailyReport) {
        const r = await ctx.getDailyReport();
        actions.push({ chatId, text: r.text, extra: webAppKeyboard(webAppUrl) });
      } else {
        actions.push({ chatId, text: 'Mở Mini App Quản trị để xem báo cáo.', extra: webAppKeyboard(webAppUrl) });
      }
    } else if (text.startsWith('/broadcast')) {
      const msg = text.replace('/broadcast', '').trim();
      if (!msg) {
        actions.push({ chatId, text: 'Cú pháp: /broadcast <code>nội dung gửi tới Mini App NV</code>' });
      } else if (ctx?.broadcastToEmployees) {
        const r = await ctx.broadcastToEmployees(String(from?.id), msg);
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({ chatId, text: 'Dùng Mini App Quản trị → Telegram → Broadcast để gửi.' });
      }
    } else if (text.startsWith('/help')) {
      const role = ctx?.role && HELP_TEXTS[ctx.role] ? ctx.role : 'employee';
      actions.push({ chatId, text: HELP_TEXTS[role], extra: webAppKeyboard(webAppUrl) });
    } else if (text.startsWith('/off') || isOffRegistration(text)) {
      const dates = extractOffDates(text);
      if (dates.length === 0) {
        actions.push({
          chatId,
          text: '📅 <b>Đăng ký lịch OFF (2 ngày/tuần)</b>\nCú pháp: Nhắn đúng 2 ngày theo định dạng <code>dd/mm/yyyy</code>\nVí dụ: <code>18/09/2026, 22/09/2026</code>\n(Bot sẽ tự động ghi nhận ngày OFF và cập nhật những ngày còn lại là ngày làm việc lên Google Sheet).',
          extra: webAppKeyboard(webAppUrl),
        });
      } else if (ctx?.registerOffSchedule) {
        const r = await ctx.registerOffSchedule(String(from?.id), dates, from?.username || '');
        actions.push({ chatId, text: r.text, extra: webAppKeyboard(webAppUrl) });
      } else {
        actions.push({ chatId, text: 'Mở Mini App để đăng ký lịch OFF.', extra: webAppKeyboard(webAppUrl) });
      }
    } else {
      // Bot NV: tin nhắn tự do -> lễ tân AI đọc hiểu + chuyển Bot chủ
      if ((ctx?.role || 'employee') === 'employee' && ctx?.relayEmployeeMessage && text.length > 1) {
        const r = await ctx.relayEmployeeMessage(String(from?.id), from?.username || '', text);
        actions.push({ chatId, text: r.text, extra: webAppKeyboard(webAppUrl) });
      } else {
        actions.push({ chatId, text: 'Nhấn nút bên dưới để mở Mini App Ụm Bò Milk 👇', extra: webAppKeyboard(webAppUrl) });
      }
    }
  } catch (e) {
    // không throw — Bot không được crash vì 1 update lỗi
  }
  return actions;
}

module.exports = {
  parseTelegramInitData,
  verifyTelegramInitData,
  tgApi,
  sendTelegramMessage,
  setTelegramWebhook,
  setTelegramMenuButton,
  setTelegramCommands,
  handleTelegramUpdate,
  extractOffDates,
  isOffRegistration,
  employeeMenuKeyboard,
  HELP_TEXT,
  HELP_TEXTS,
  START_TEXTS,
  BOT_ROLES,
  webAppKeyboard,
};
