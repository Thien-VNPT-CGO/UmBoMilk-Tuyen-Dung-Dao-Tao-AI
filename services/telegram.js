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

async function answerTelegramCallbackQuery(botToken, callbackQueryId, text = '') {
  if (!botToken || !callbackQueryId) return { ok: false, skipped: true };
  try {
    const payload = { callback_query_id: String(callbackQueryId) };
    if (text) payload.text = text;
    const j = await tgApi(botToken, 'answerCallbackQuery', payload);
    return { ok: true, result: j.result };
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
    const msg = update.message || update.edited_message || update.callback_query?.message;
    const chatId = msg?.chat?.id;
    const from = update.message?.from || update.edited_message?.from || update.callback_query?.from;
    const text = (update.message?.text || update.edited_message?.text || update.callback_query?.data || '').trim();
    if (!chatId) return actions;
    const webAppUrl = ctx?.webAppUrl || '';
    const role = ctx?.role && START_TEXTS[ctx.role] ? ctx.role : 'employee';

    const photoList = update.message?.photo || update.edited_message?.photo;
    const caption = (update.message?.caption || update.edited_message?.caption || '').trim();
    if (photoList && photoList.length > 0 && !text) {
      text = caption ? `${caption} (Đính kèm ảnh)` : 'Báo cáo sự cố thiết bị (Đính kèm ảnh)';
    }

    if (text.startsWith('/start')) {
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
    } else if (text.startsWith('/menu') || text.toLowerCase() === 'menu' || text.toLowerCase() === 'bảng chức năng') {
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
    } else if (text.startsWith('/doica') || text.includes('Đổi ca') || /^đổi ca$|^doi ca$/i.test(text)) {
      actions.push({
        chatId,
        text: '🔄 <b>YÊU CẦU ĐỔI CA / TRÁO CA LÀM VIỆC</b>\n\n'
          + 'Bạn không cần mở app! Hãy nhắn trực tiếp yêu cầu đổi ca vào khung chat này theo mẫu sau:\n\n'
          + '👉 <i>Mẫu nhắn:</i>\n'
          + '<code>Đổi ca ngày dd/mm/yyyy từ ca [Sáng/Chiều/Tối] sang ca [...] với bạn [Tên hoặc Mã NV]</code>\n\n'
          + '<i>Ví dụ cụ thể:</i>\n'
          + '<code>Đổi ca ngày 20/09 ca Sáng sang ca Tối với bạn Lan</code>\n\n'
          + '🤖 <i>Bot sẽ tự động tiếp nhận và chuyển tiếp yêu cầu đến Quản lý & HR phê duyệt ngay!</i>',
      });
    } else if (text.startsWith('/baohong') || text.includes('Báo hỏng') || /^báo hỏng$|^bao hong$/i.test(text)) {
      actions.push({
        chatId,
        text: '🛠️ <b>Báo hỏng thiết bị & Sự cố cửa hàng (Báo hỏng qua chat)</b>\n\n'
          + 'Bạn không cần mở app! Hãy nhắn trực tiếp mô tả sự cố hoặc gửi kèm ảnh chụp thiết bị hỏng vào đây:\n\n'
          + '👉 <i>Ví dụ:</i>\n'
          + '<code>Máy ép nắp ly quầy bar chi nhánh 1 bị hỏng rơ-le nhiệt</code>\n\n'
          + '📸 <i>Bạn có thể chụp và gửi trực tiếp hình ảnh sự cố vào khung chat này. Bot sẽ tự động ghi nhận và chuyển báo cáo khẩn cấp tới HR và Kỹ thuật!</i>',
      });
    } else if (text.startsWith('/link') || /^(0|\+84|84)?\d{9,10}$/.test(text.replace(/[\s.-]/g, ''))) {
      let phoneArg = '';
      if (text.startsWith('/link')) {
        const parts = text.split(/\s+/).slice(1);
        if (parts.length === 1 && /^\d{9,11}$/.test(parts[0].replace(/\D/g, ''))) {
          phoneArg = parts[0];
        } else if (parts.length >= 2 && ctx?.linkEmployee) {
          const r = await ctx.linkEmployee(String(from?.id), from?.username || '', parts[0], parts[1], chatId);
          actions.push({
            chatId,
            text: r.ok ? `✅ Đã liên kết với <b>${r.label}</b>.` : `⚠️ ${r.error || 'Liên kết thất bại.'}`,
            extra: r.ok ? (role === 'employee' ? employeeMenuKeyboard(webAppUrl) : webAppKeyboard(webAppUrl)) : {},
          });
        } else {
          actions.push({
            chatId,
            text: '🔗 <b>Cú pháp liên kết tài khoản:</b>\n\n'
              + '• <b>Cách 1 (Nhanh nhất):</b> Nhắn <code>/link SĐT</code>\n'
              + '   <i>Ví dụ:</i> <code>/link 0842112530</code> (hoặc chỉ cần nhắn SĐT của bạn)\n\n'
              + '• <b>Cách 2:</b> Dùng Mã NV và Key\n'
              + '   <i>Ví dụ:</i> <code>/link CN130_UBM07092026_NV6432 KEY-WBED02RS</code>\n\n'
              + '• <b>Cách 3:</b> Nhấn nút bên dưới để mở Mini App và tự động kích hoạt.',
            extra: webAppKeyboard(webAppUrl),
          });
        }
      } else {
        phoneArg = text;
      }

      if (phoneArg && ctx?.linkByPhone) {
        const r = await ctx.linkByPhone(String(from?.id), from?.username || '', phoneArg, chatId);
        actions.push({
          chatId,
          text: r.ok
            ? `✅ Đã liên kết thành công với <b>${r.label}</b>!\nBây giờ bạn có thể dùng tất cả cú pháp (nhắn 2 ngày OFF, /diemdanh, /lich, /luong...).`
            : `⚠️ ${r.error || 'Liên kết thất bại.'}\nVui lòng kiểm tra lại SĐT đã đăng ký với HR (hoặc mở Mini App để đăng nhập).`,
          extra: r.ok ? (role === 'employee' ? employeeMenuKeyboard(webAppUrl) : webAppKeyboard(webAppUrl)) : webAppKeyboard(webAppUrl),
        });
      }
    } else if (text.startsWith('/unlink')) {
      if (ctx?.unlink) {
        await ctx.unlink(String(from?.id));
        actions.push({ chatId, text: '✅ Đã hủy liên kết Telegram.' });
      }
    } else if (text.startsWith('/lich') || text.includes('Lịch làm') || /^lịch làm$|^lich lam$|^xem lịch$|^xem lich$/i.test(text)) {
      if (ctx?.getSchedule) {
        const r = await ctx.getSchedule(String(from?.id));
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({ chatId, text: '📅 Chưa thể lấy thông tin lịch lúc này.' });
      }
    } else if (text.startsWith('/diemdanh') || text.includes('Điểm danh') || /^điểm danh$|^diem danh$/i.test(text)) {
      if (ctx?.getTodayStatus) {
        const r = await ctx.getTodayStatus(String(from?.id));
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({ chatId, text: '📍 Chưa thể kiểm tra điểm danh lúc này.' });
      }
    } else if (text.startsWith('/luong') || text.includes('Xem lương') || /^xem lương$|^xem luong$|^lương$|^luong$/i.test(text)) {
      if (ctx?.getSalary) {
        const r = await ctx.getSalary(String(from?.id));
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({ chatId, text: '💰 Chưa thể tính lương lúc này.' });
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
    } else if (text === '/off' || text.includes('Đăng ký OFF') || /^đăng ký off$|^dang ky off$/i.test(text)) {
      actions.push({
        chatId,
        text: '🏖️ <b>Đăng ký lịch OFF (2 ngày/tuần)</b>\n\n'
          + 'Bạn vui lòng nhắn trực tiếp 2 ngày muốn nghỉ vào khung chat này theo định dạng:\n'
          + '👉 <code>dd/mm/yyyy, dd/mm/yyyy</code>\n\n'
          + '<i>Ví dụ:</i> <code>18/09/2026, 22/09/2026</code>\n\n'
          + '🤖 <i>Bot Telegram sẽ tự động ghi nhận 2 ngày OFF này và cập nhật tất cả các ngày còn lại trong tuần là ngày LÀM VIỆC (WORKING) đồng bộ lên Google Sheet ngay lập tức cho bạn!</i>',
      });
    } else if (isOffRegistration(text)) {
      const dates = extractOffDates(text);
      if (dates.length === 0) {
        actions.push({
          chatId,
          text: '📅 <b>Đăng ký lịch OFF (2 ngày/tuần)</b>\nCú pháp: Nhắn đúng 2 ngày theo định dạng <code>dd/mm/yyyy</code>\nVí dụ: <code>18/09/2026, 22/09/2026</code>\n(Bot sẽ tự động ghi nhận ngày OFF và cập nhật những ngày còn lại là ngày làm việc lên Google Sheet).',
        });
      } else if (ctx?.registerOffSchedule) {
        const r = await ctx.registerOffSchedule(String(from?.id), dates, from?.username || '');
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({ chatId, text: '📅 Đăng ký lịch OFF thất bại, vui lòng thử lại.' });
      }
    } else {
      // Bot NV: tin nhắn tự do -> lễ tân AI đọc hiểu + chuyển Bot chủ
      if ((ctx?.role || 'employee') === 'employee' && ctx?.relayEmployeeMessage && text.length > 1) {
        const r = await ctx.relayEmployeeMessage(String(from?.id), from?.username || '', text);
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({
          chatId,
          text: '🤖 <b>Trợ lý Bot Ụm Bò Milk</b>\n\nBạn có thể nhắn trực tiếp với Bot:\n• <code>/diemdanh</code> — Xem trạng thái vào/ra ca hôm nay\n• <code>/lich</code> — Xem lịch 7 ngày tới\n• <code>18/09/2026, 22/09/2026</code> — Đăng ký 2 ngày OFF\n• <code>/luong</code> — Xem tạm tính lương\n• <code>/doica</code> — Hướng dẫn đổi ca\n• <code>/baohong</code> — Báo hỏng thiết bị\n\nHoặc nhắn bất kỳ câu hỏi/yêu cầu nào để Bot chuyển tới HR hỗ trợ bạn nhé!',
          extra: employeeMenuKeyboard(webAppUrl),
        });
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
  answerTelegramCallbackQuery,
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
