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

// ---- Bot command logic (thuần, dễ test) ----
const HELP_TEXT = [
  '🐮 <b>ỤM BÒ MILK — Trợ lý Telegram</b>',
  '',
  '/start — Mở Mini App (Admin / Nhân viên / Tài chính)',
  '/link <code>MÃ_NV KEY</code> — Liên kết Telegram với tài khoản (VD: <code>/link CN261_UBM28082026_NV4100 KEY-WBED02RS</code>)',
  '/unlink — Hủy liên kết',
  '/lich — Xem lịch làm việc 7 ngày tới',
  '/help — Hướng dẫn này',
].join('\n');

function webAppKeyboard(webAppUrl) {
  if (!webAppUrl) return {};
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '🐮 Mở Ụm Bò Milk App', web_app: { url: webAppUrl } }]],
    },
  };
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
      const payload = text.replace('/start', '').trim();
      if (payload && ctx?.linkByStartPayload) {
        const r = await ctx.linkByStartPayload(String(from?.id), payload);
        actions.push({
          chatId,
          text: r.ok
            ? `✅ Đã liên kết Telegram với <b>${r.label}</b>.\nNhấn nút bên dưới để mở Mini App.`
            : `⚠️ ${r.error || 'Mã liên kết không hợp lệ.'}\nDùng /link <code>MÃ_NV KEY</code> để liên kết thủ công.`,
          extra: webAppKeyboard(webAppUrl),
        });
      } else {
        actions.push({
          chatId,
          text: '🐮 <b>Chào mừng đến Ụm Bò Milk!</b>\nNhấn nút bên dưới để mở Mini App (Admin / Nhân viên / Tài chính).\nNếu là nhân viên, dùng /link để liên kết tài khoản trước.',
          extra: webAppKeyboard(webAppUrl),
        });
      }
    } else if (text.startsWith('/link')) {
      const parts = text.split(/\s+/).slice(1);
      if (parts.length < 2) {
        actions.push({ chatId, text: 'Cú pháp: /link <code>MÃ_NV KEY</code>' });
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
    } else if (text.startsWith('/help')) {
      actions.push({ chatId, text: HELP_TEXT, extra: webAppKeyboard(webAppUrl) });
    } else {
      actions.push({ chatId, text: 'Nhấn nút bên dưới để mở Mini App Ụm Bò Milk 👇', extra: webAppKeyboard(webAppUrl) });
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
  handleTelegramUpdate,
  HELP_TEXT,
  webAppKeyboard,
};
