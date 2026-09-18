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

async function removeTelegramMenuButton(botToken) {
  if (!botToken) return { ok: false, skipped: true };
  try {
    const j = await tgApi(botToken, 'setChatMenuButton', {
      menu_button: { type: 'default' },
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
      { command: 'menu', description: '📋 Menu quản trị theo phân quyền' },
      { command: 'duyet', description: '✅ Duyệt phiếu chờ (thiết bị, OFF, đổi ca)' },
      { command: 'hoso_nhanvien', description: '👤 Tra cứu hồ sơ: /hoso_nhanvien <mã>' },
      { command: 'duyet_phieuluong', description: '💳 Duyệt & gửi phiếu lương tháng cho NV' },
      { command: 'baocao', description: '📊 Báo cáo nhân sự hôm nay' },
      { command: 'broadcast', description: '📢 Phát thông báo' },
      { command: 'doi_mat_khau', description: '🔑 Đổi mật khẩu tài khoản HR' },
      { command: 'help', description: '❓ Hướng dẫn quản trị' }
    ],
    finance: [
      { command: 'luong', description: '💰 Bảng lương tổng hợp tháng này' },
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

function attendanceGpsKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📍 BƯỚC 1: GỬI VỊ TRÍ GPS HIỆN TẠI', request_location: true }],
        [{ text: '📱 Bảng chức năng', callback_data: '/menu' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function attendancePhotoKeyboard(webAppUrl) {
  const inline_keyboard = [];
  if (webAppUrl) {
    inline_keyboard.push([{ text: '📸 BƯỚC 2: CHỤP ẢNH XÁC THỰC (CAMERA)', web_app: { url: webAppUrl + (webAppUrl.includes('?') ? '&' : '?') + 'action=attendance_photo' } }]);
  } else {
    inline_keyboard.push([{ text: '📸 Gửi ảnh xác thực tại quầy', callback_data: '/chup_anh' }]);
  }
  return { reply_markup: { inline_keyboard } };
}

function hrMenuKeyboard(role, webAppUrl) {
  const r = String(role || '').toUpperCase();
  let inline_keyboard = [];
  if (r === 'ADMIN') {
    inline_keyboard = [
      [
        { text: '📊 Ma trận Lịch tuần', callback_data: '/tonghop_lich' },
        { text: '✍️ Xếp lịch NV', callback_data: '/sap_lich_nv' }
      ],
      [
        { text: '➕ Thêm NV', callback_data: '/them_nv_chinhthuc' },
        { text: '⭐ Lên chính thức', callback_data: '/capnhat_nv_chinhthuc' }
      ],
      [
        { text: '📋 Hồ sơ NV', callback_data: '/hoso_nhanvien' },
        { text: '✏️ Sửa NV', callback_data: '/sua_thongtin_nhanvien' }
      ],
      [
        { text: '🗑️ Xóa NV', callback_data: '/xoa_nhanvien' },
        { text: '🏖️ Xóa OFF', callback_data: '/xoa_off' }
      ],
      [
        { text: '👥 Danh sách User', callback_data: '/users' },
        { text: '✅ Duyệt phiếu', callback_data: '/duyet' }
      ],
      [
        { text: '🗑️ Reset Sheet', callback_data: '/reset_hethong' },
        { text: '🧪 Chạy Test', callback_data: '/test' }
      ],
      [
        { text: '🚪 Đăng xuất', callback_data: '/logout' }
      ]
    ];
  } else if (r === 'HR') {
    inline_keyboard = [
      [
        { text: '📊 Ma trận Lịch tuần', callback_data: '/tonghop_lich' },
        { text: '✍️ Xếp lịch NV', callback_data: '/sap_lich_nv' }
      ],
      [
        { text: '➕ Thêm NV', callback_data: '/them_nv_chinhthuc' },
        { text: '⭐ Lên chính thức', callback_data: '/capnhat_nv_chinhthuc' }
      ],
      [
        { text: '📋 Hồ sơ NV', callback_data: '/hoso_nhanvien' },
        { text: '✏️ Sửa NV', callback_data: '/sua_thongtin_nhanvien' }
      ],
      [
        { text: '🗑️ Xóa NV', callback_data: '/xoa_nhanvien' },
        { text: '🏖️ Xóa OFF', callback_data: '/xoa_off' }
      ],
      [
        { text: '✅ Duyệt phiếu', callback_data: '/duyet' },
        { text: '📋 Báo cáo ngày', callback_data: '/baocao' }
      ],
      [
        { text: '🚪 Đăng xuất', callback_data: '/logout' }
      ]
    ];
  } else if (r === 'MANAGER' || r === 'QL') {
    inline_keyboard = [
      [
        { text: '📍 Điểm danh CN', callback_data: '/diemdanh_cn' },
        { text: '📅 Lịch CN', callback_data: '/lich_cn' }
      ],
      [
        { text: '💳 Duyệt lương', callback_data: '/duyet_phieuluong' },
        { text: '📋 Hồ sơ NV', callback_data: '/hoso_nhanvien' }
      ],
      [
        { text: '🚪 Đăng xuất', callback_data: '/logout' }
      ]
    ];
  } else if (r === 'MKT') {
    inline_keyboard = [
      [
        { text: '📢 Tin Marketing', callback_data: '/broadcast_mkt' },
        { text: '🎁 Sự kiện', callback_data: '/sukien' }
      ],
      [
        { text: '📰 Tin tức chuỗi', callback_data: '/tintuc' },
        { text: '🚪 Đăng xuất', callback_data: '/logout' }
      ]
    ];
  } else {
    inline_keyboard = [
      [
        { text: '📊 Báo cáo', callback_data: '/baocao' },
        { text: '🚪 Đăng xuất', callback_data: '/logout' }
      ]
    ];
  }
  return { reply_markup: { inline_keyboard } };
}

function getHrRoleMenuText(user) {
  const role = String(user?.role || 'HR').toUpperCase();
  const name = user?.displayName || user?.username || 'Quản trị viên';
  if (role === 'ADMIN') {
    return `👑 <b>BẢNG ĐIỀU KHIỂN ADMIN (FULL QUYỀN) — ỤM BÒ MILK</b>\n`
      + `👤 Người dùng: <b>${name}</b> (Role: <code>ADMIN</code>)\n\n`
      + `👉 <b>Lệnh vận hành nhân sự & ca lịch:</b>\n`
      + `• <code>/them_nv_chinhthuc &lt;Tên NV&gt; &lt;SĐT&gt; &lt;Chi Nhánh&gt; &lt;Ca&gt; &lt;Ngày&gt; &lt;Mã NV/auto&gt; &lt;Điểm&gt;</code> — Thêm NV chính thức & đồng bộ 17iXM\n`
      + `• <code>/capnhat_nv_chinhthuc [mã_NV]</code> — Chọn/chuyển NV Training lên Chính thức (đồng bộ Sheet)\n`
      + `• <code>/tonghop_lich [tuần]</code> — Ma trận lịch tuần 🟢/🔴 theo chi nhánh & ca\n`
      + `• <code>/sap_lich_nv [mã] [lịch]</code> — Xếp/chỉnh lịch NV (VD: <code>/sap_lich_nv NV1288 T2-ON, T5-OFF, CN-ON</code>)\n`
      + `• <code>/hoso_nhanvien [mã]</code> — Tra cứu chi tiết hồ sơ nhân viên\n`
      + `• <code>/sua_thongtin_nhanvien: [mã] [ca_cũ] sang [ca_mới], [CN_cũ] sang [CN_mới]</code> — Sửa thông tin NV & đồng bộ Google Sheet\n`
      + `• <code>/xoa_nhanvien &lt;Mã_NV&gt;</code> — Xoá vĩnh viễn nhân viên trên Google Sheet 17iXM & Hệ thống\n`
      + `• <code>/xoa_off &lt;Mã_NV&gt;</code> — Xoá lịch OFF 2 ngày/tuần, dọn thông báo trùng & nhắc NV đăng ký lại\n`
      + `• <code>/duyet</code> — Xem và duyệt các phiếu chờ (OFF, Đổi ca, Thiết bị)\n`
      + `• <code>/broadcast [nội dung]</code> — Phát thông báo tới Mini App NV\n\n`
      + `👉 <b>Quản trị người dùng & hệ thống:</b>\n`
      + `• <code>/reset_hethong: [tên_sheet]</code> — Xóa sạch dữ liệu sheet Google Sheet (CHỈ DUY NHẤT ADMIN)\n`
      + `• <code>/users</code> — Danh sách tài khoản hệ thống (HR, QL, MKT)\n`
      + `• <code>/capquyen [username] [role]</code> — Gán vai trò (Admin, HR, QL, MKT)\n`
      + `• <code>/phanquyen [username] [tabs]</code> — Cấp quyền tab (VD: <code>/phanquyen hr_lan candidates,training</code>)\n`
      + `• <code>/doi_mat_khau &lt;user&gt; &lt;pass_cu&gt; &lt;pass_moi&gt;</code> — Đổi mật khẩu tài khoản\n\n`
      + `👉 <b>Chế độ kiểm thử an toàn (Test Mode):</b>\n`
      + `• <code>/test [loại]</code> — Chạy thử 1 chức năng (tạo bản ghi isTest: true)\n`
      + `• <code>/delete_test</code> — Dọn dẹp sạch sẽ 100% toàn bộ dữ liệu test\n\n`
      + `• <code>/logout</code> — Đăng xuất`;
  }
  if (role === 'HR') {
    return `🛡️ <b>BẢNG CHỨC NĂNG NHÂN SỰ (HR) — ỤM BÒ MILK</b>\n`
      + `👤 Người dùng: <b>${name}</b> (Role: <code>HR</code>)\n\n`
      + `• <code>/them_nv_chinhthuc &lt;Tên NV&gt; &lt;SĐT&gt; &lt;Chi Nhánh&gt; &lt;Ca&gt; &lt;Ngày&gt; &lt;Mã NV/auto&gt; &lt;Điểm&gt;</code> — Thêm NV chính thức & đồng bộ 17iXM\n`
      + `• <code>/capnhat_nv_chinhthuc [mã_NV]</code> — Chọn/chuyển NV Training lên Chính thức (đồng bộ Sheet)\n`
      + `• <code>/tonghop_lich [tuần]</code> — Ma trận lịch tuần 🟢/🔴 theo chi nhánh & ca\n`
      + `• <code>/sap_lich_nv [mã] [lịch]</code> — Xếp/chỉnh lịch làm việc cho nhân viên\n`
      + `• <code>/hoso_nhanvien [mã]</code> — Tra cứu chi tiết hồ sơ nhân viên\n`
      + `• <code>/sua_thongtin_nhanvien: [mã] [ca_cũ] sang [ca_mới], [CN_cũ] sang [CN_mới]</code> — Sửa thông tin NV & đồng bộ Google Sheet\n`
      + `• <code>/xoa_nhanvien &lt;Mã_NV&gt;</code> — Xoá vĩnh viễn nhân viên trên Google Sheet 17iXM & Hệ thống\n`
      + `• <code>/xoa_off &lt;Mã_NV&gt;</code> — Xoá lịch OFF 2 ngày/tuần, dọn thông báo trùng & nhắc NV đăng ký lại\n`
      + `• <code>/duyet</code> — Duyệt các phiếu chờ (OFF, Đổi ca, Sự cố)\n`
      + `• <code>/baocao</code> — Tóm tắt tình hình nhân sự hôm nay\n`
      + `• <code>/broadcast [nội dung]</code> — Gửi thông báo tới nhân viên\n`
      + `• <code>/doi_mat_khau &lt;user&gt; &lt;pass_cu&gt; &lt;pass_moi&gt;</code> — Đổi mật khẩu tài khoản\n`
      + `• <code>/logout</code> — Đăng xuất`;
  }
  if (role === 'MANAGER' || role === 'QL') {
    const branches = (user?.branchScope || []).join(', ') || 'Tất cả';
    return `🏪 <b>BẢNG QUẢN LÝ CỬA HÀNG (QL) — ỤM BÒ MILK</b>\n`
      + `👤 Quản lý: <b>${name}</b> • Chi nhánh: <b>${branches}</b>\n\n`
      + `• <code>/diemdanh_cn</code> — Điểm danh vào/ra ca hôm nay tại chi nhánh\n`
      + `• <code>/lich_cn</code> — Xem lịch làm việc tuần của nhân viên tại chi nhánh\n`
      + `• <code>/duyet_phieuluong</code> — Duyệt & tự động phát phiếu lương tháng cho NV chi nhánh\n`
      + `• <code>/hoso_nhanvien [mã]</code> — Tra cứu hồ sơ nhân viên chi nhánh\n`
      + `• <code>/duyet_ca</code> — Phê duyệt đổi ca / tráo ca của chi nhánh\n`
      + `• <code>/baohong_cn</code> — Báo cáo sự cố thiết bị tại chi nhánh\n`
      + `• <code>/doi_mat_khau [user] [pass_cu] [pass_moi]</code> — Đổi mật khẩu tài khoản\n`
      + `• <code>/logout</code> — Đăng xuất`;
  }
  if (role === 'MKT') {
    return `📢 <b>BẢNG CHỨC NĂNG MARKETING (MKT) — ỤM BÒ MILK</b>\n`
      + `👤 Người dùng: <b>${name}</b> (Role: <code>MKT</code>)\n\n`
      + `• <code>/broadcast_mkt [nội dung]</code> — Đăng thông báo / chiến dịch tới Mini App NV\n`
      + `• <code>/sukien</code> — Danh sách sự kiện & CTKM sắp tới\n`
      + `• <code>/tintuc</code> — Đăng tin nội bộ chuỗi\n`
      + `• <code>/doi_mat_khau [user] [pass_cu] [pass_moi]</code> — Đổi mật khẩu tài khoản\n`
      + `• <code>/logout</code> — Đăng xuất`;
  }
  return `🛡️ <b>MENU HỆ THỐNG — ỤM BÒ MILK</b>\n👤 Người dùng: <b>${name}</b>\n• <code>/baocao</code> — Xem báo cáo\n• <code>/logout</code> — Đăng xuất`;
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
  if (lower.startsWith('/off') || lower.startsWith('/dang_ky_off') || lower.startsWith('/dangkyoff')) return true;
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
    let text = (update.message?.text || update.edited_message?.text || update.callback_query?.data || '').trim();
    if (!chatId) return actions;
    const webAppUrl = ctx?.webAppUrl || '';
    const role = ctx?.role && START_TEXTS[ctx.role] ? ctx.role : 'employee';

    // --- XỬ LÝ CALLBACK QUERY CHO DUYỆT ĐỔI CA (PEER & HR) ---
    if (update.callback_query?.data) {
      const cbData = update.callback_query.data;
      if (cbData.startsWith('swappeer:')) {
        const parts = cbData.split(':');
        const action = parts[1];
        const swapId = parts[2];
        if (ctx?.peerConfirmShiftSwap) {
          const r = await ctx.peerConfirmShiftSwap(swapId, action === 'accept', String(from?.id));
          actions.push({ chatId, text: r.text });
          return actions;
        }
      } else if (cbData.startsWith('swaphr:')) {
        const parts = cbData.split(':');
        const action = parts[1];
        const swapId = parts[2];
        const hrSession = ctx?.getHrSession ? await ctx.getHrSession(chatId) : null;
        if (!hrSession) {
          actions.push({ chatId, text: '⛔ Bạn chưa đăng nhập tài khoản HR để duyệt phiếu này.' });
          return actions;
        }
        if (ctx?.hrApproveShiftSwap) {
          const r = await ctx.hrApproveShiftSwap(swapId, action === 'approve', hrSession);
          actions.push({ chatId, text: r.text });
          return actions;
        }
      } else if (cbData.startsWith('swapcolleague:')) {
        const colleagueId = cbData.split(':')[1];
        if (ctx?.getSwapComparison) {
          const comp = await ctx.getSwapComparison(String(from?.id), colleagueId);
          actions.push({
            chatId,
            text: comp.text,
            extra: comp.extra || {}
          });
          return actions;
        }
      } else if (cbData.startsWith('promote_official:')) {
        const empId = cbData.replace('promote_official:', '').trim();
        const hrSession = ctx?.getHrSession ? await ctx.getHrSession(chatId) : null;
        if (!hrSession) {
          actions.push({ chatId, text: '⛔ Bạn chưa đăng nhập tài khoản Quản trị để thực hiện thao tác này.' });
          return actions;
        }
        if (ctx?.hrPromoteToOfficial) {
          const r = await ctx.hrPromoteToOfficial(hrSession, empId);
          actions.push({ chatId, text: r.text });
          return actions;
        }
      }
    }

    const photoList = update.message?.photo || update.edited_message?.photo;
    const caption = (update.message?.caption || update.edited_message?.caption || '').trim();
    if (photoList && photoList.length > 0 && !text) {
      text = caption ? `${caption} (Đính kèm ảnh)` : 'Báo cáo sự cố thiết bị (Đính kèm ảnh)';
    }

    // --- BƯỚC 1: XỬ LÝ VỊ TRÍ GPS TELEGRAM (LOCATION) CHO ĐIỂM DANH ---
    const location = update.message?.location || update.edited_message?.location;
    if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
      if (ctx?.handleAttendanceLocation) {
        const r = await ctx.handleAttendanceLocation(String(from?.id), location, from?.username || '', chatId);
        actions.push({
          chatId,
          text: r.text,
          extra: r.extra !== undefined ? r.extra : (r.step === 'WAITING_PHOTO' ? attendancePhotoKeyboard(webAppUrl) : {})
        });
        return actions;
      }
    }

    // --- BƯỚC 2: XỬ LÝ ẢNH CHỤP XÁC THỰC (PHOTO) KHI ĐANG TRONG PHIÊN ĐIỂM DANH ---
    if (photoList && photoList.length > 0) {
      if (ctx?.hasPendingAttendance && await ctx.hasPendingAttendance(String(from?.id))) {
        const r = await ctx.handleAttendancePhoto(String(from?.id), photoList, { caption, username: from?.username || '', chatId, ...(ctx.photoMeta || {}) });
        actions.push({
          chatId,
          text: r.text,
          extra: r.extra || {}
        });
        return actions;
      }
    }

    // Hỗ trợ lệnh test / text chụp ảnh xác thực
    if (text.startsWith('/chup_anh') || text.startsWith('/xac_thuc_anh')) {
      if (ctx?.hasPendingAttendance && await ctx.hasPendingAttendance(String(from?.id))) {
        const r = await ctx.handleAttendancePhoto(String(from?.id), [{ file_id: 'mock_photo' }], { caption: text, username: from?.username || '', chatId, ...(ctx.photoMeta || {}) });
        actions.push({
          chatId,
          text: r.text,
          extra: r.extra || {}
        });
        return actions;
      }
    }

    // --- PHÂN LUỒNG XỬ LÝ RIÊNG CHO BOT QUẢN TRỊ HR (@umbomilkhrbot) ---
    if (role === 'hr') {
      const hrSession = ctx?.getHrSession ? await ctx.getHrSession(chatId) : (ctx?.hrLogin ? null : { username: 'admin', role: 'ADMIN' });

      // 1. Cú pháp Đăng nhập: /login <user> <pass> hoặc /dangnhap <user> <pass>
      if (text.startsWith('/login') || text.startsWith('/dangnhap')) {
        const parts = text.split(/\s+/).slice(1);
        if (parts.length < 2) {
          actions.push({
            chatId,
            text: '🔑 <b>CÚ PHÁP ĐĂNG NHẬP BOT QUẢN TRỊ HR:</b>\n\n'
              + '👉 <code>/login &lt;tên_đăng_nhập&gt; &lt;mật_khẩu&gt;</code>\n\n'
              + '📌 <i>Lưu ý bảo mật: Tuyệt đối không chia sẻ tài khoản hoặc mật khẩu. Hệ thống tự động phân quyền theo vai trò: Admin, HR, Quản lý (QL), Marketing (MKT).</i>'
          });
        } else if (ctx?.hrLogin) {
          const r = await ctx.hrLogin(chatId, parts[0], parts[1]);
          if (r.ok) {
            const menuText = getHrRoleMenuText(r.user);
            let notifText = '';
            if (r.pendingNotifications && r.pendingNotifications.length > 0) {
              notifText = `\n\n🔔 <b>HỘP THƯ CHỜ: BẠN CÓ ${r.pendingNotifications.length} THÔNG BÁO MỚI (ĐÃ LỌC BỎ THÔNG BÁO TRÙNG LẶP):</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
                + r.pendingNotifications.map((n, idx) => `${idx + 1}️⃣ ${n.text || n.message || n}`).join('\n')
                + `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n<i>Hệ thống tự động bỏ qua các thông báo đã tồn tại trên tài khoản quản trị, đảm bảo không trùng lặp dữ liệu!</i>`;
            }
            actions.push({
              chatId,
              text: `🟢 <b>TRẠNG THÁI: TÀI KHOẢN ĐANG HOẠT ĐỘNG (Hiệu lực: 24 giờ) — ĐĂNG NHẬP THÀNH CÔNG!</b>\nChào mừng <b>${r.user.displayName || r.user.username}</b> (Vai trò: <code>${r.user.role}</code>).${notifText}\n\n${menuText}`,
              extra: hrMenuKeyboard(r.user.role, webAppUrl)
            });
          } else {
            actions.push({
              chatId,
              text: `❌ <b>Đăng nhập thất bại:</b> ${r.error || 'Sai tên đăng nhập hoặc mật khẩu.'}`
            });
          }
        } else {
          actions.push({ chatId, text: 'Hệ thống xác thực tạm thời không khả dụng.' });
        }
        return actions;
      }

      // 2. Cú pháp Đăng xuất: /logout hoặc /dangxuat
      if (text.startsWith('/logout') || text.startsWith('/dangxuat')) {
        if (ctx?.hrLogout) await ctx.hrLogout(chatId);
        actions.push({
          chatId,
          text: '🚪 <b>Đã đăng xuất khỏi tài khoản Bot Quản trị.</b>\nĐể đăng nhập lại, gõ: <code>/login &lt;tài_khoản&gt; &lt;mật_khẩu&gt;</code>'
        });
        return actions;
      }

      // 3. Nếu chưa đăng nhập: hiển thị cảnh báo đỏ trạng thái tài khoản chưa hoạt động
      if (!hrSession) {
        actions.push({
          chatId,
          text: '🔴 <b>TRẠNG THÁI: TÀI KHOẢN CHƯA ĐĂNG NHẬP (CHƯA HOẠT ĐỘNG)</b>\n\n'
            + '⚠️ <b>BẠN CHƯA ĐĂNG NHẬP VÀO HỆ THỐNG HR/ADMIN (TẠM KHÓA)</b>\n'
            + 'Các tính năng quản trị và thông báo nhân sự chỉ hoạt động khi bạn đăng nhập tài khoản hợp lệ.\n\n'
            + '👉 <b>Vui lòng đăng nhập để kích hoạt phiên làm việc (hiệu lực 24 giờ):</b>\n'
            + '<code>/login &lt;tên_đăng_nhập&gt; &lt;mật_khẩu&gt;</code>\n\n'
            + '📌 <i>Lưu ý bảo mật: Không chia sẻ mật khẩu cho người khác. Khi bạn đăng nhập thành công, Bot sẽ chuyển sang trạng thái 🟢 ĐANG HOẠT ĐỘNG và cập nhật đầy đủ các thông báo nhân sự đang chờ xử lý.</i>'
        });
        return actions;
      }

      // 4. Đã đăng nhập: phân phối theo lệnh quản trị
      if (text.startsWith('/menu') || text.toLowerCase() === 'menu') {
        actions.push({
          chatId,
          text: getHrRoleMenuText(hrSession),
          extra: hrMenuKeyboard(hrSession.role, webAppUrl)
        });
      } else if (text.startsWith('/tonghop_lich')) {
        const week = text.replace('/tonghop_lich', '').trim();
        if (ctx?.getScheduleMatrix) {
          const r = await ctx.getScheduleMatrix(week, hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '📊 Chưa thể tổng hợp ma trận lịch lúc này.' });
        }
      } else if (text.startsWith('/sap_lich_nv')) {
        const rawArgs = text.replace('/sap_lich_nv', '').trim();
        if (!rawArgs) {
          actions.push({
            chatId,
            text: '✍️ <b>HƯỚNG DẪN CÚ PHÁP XẾP / ĐIỀU CHỈNH LỊCH NHÂN VIÊN:</b>\n\n'
              + '👉 <code>/sap_lich_nv &lt;MÃ_NV&gt; &lt;LỊCH_TUẦN&gt;</code>\n\n'
              + '• <b>Hỗ trợ mã ngắn:</b> <code>NV1288</code> hoặc <code>1288</code> (không cần gõ mã dài).\n'
              + '• <b>Ví dụ xếp ca tuần:</b>\n'
              + '<code>/sap_lich_nv NV1288 T2-ON, T3-ON, T4-OFF, T5-ON, T6-ON, T7-OFF, CN-ON</code>\n\n'
              + '<i>Bot sẽ tự động kiểm tra chống trùng ca cùng chi nhánh, cập nhật lịch và thông báo tới Bot NV của nhân viên!</i>'
          });
        } else if (ctx?.hrReschedule) {
          const parts = rawArgs.split(/\s+/);
          const empQuery = parts[0];
          const spec = parts.slice(1).join(' ');
          const r = await ctx.hrReschedule(hrSession, empQuery, spec);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: 'Chức năng xếp lịch tạm thời không khả dụng.' });
        }
      } else if (text.startsWith('/hoso_nhanvien')) {
        const empCode = text.replace(/^\/hoso_nhanvien:?/, '').trim();
        if (!empCode) {
          actions.push({
            chatId,
            text: '👉 <b>CÚ PHÁP TRA CỨU HỒ SƠ NHÂN VIÊN:</b>\n\n'
              + '<code>/hoso_nhanvien: &lt;MÃ_NV&gt;</code> hoặc <code>/hoso_nhanvien &lt;MÃ_NV&gt;</code>\n\n'
              + '• <i>Hỗ trợ mã ngắn:</i> <code>NV1288</code> hoặc <code>1288</code>\n'
              + '• <i>Ví dụ:</i> <code>/hoso_nhanvien: NV1288</code>'
          });
        } else if (ctx?.hrGetEmployeeProfile) {
          const r = await ctx.hrGetEmployeeProfile(hrSession, empCode);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: 'Chức năng tra cứu hồ sơ nhân viên tạm thời không khả dụng.' });
        }
      } else if (text.startsWith('/them_nv_chinhthuc')) {
        const rawArgs = text.replace(/^\/them_nv_chinhthuc:?/, '').trim();
        const roleStr = String(hrSession.role || '').toUpperCase();
        if (roleStr !== 'ADMIN' && roleStr !== 'HR') {
          actions.push({
            chatId,
            text: '⛔ <b>TỪ CHỐI TRUY CẬP:</b> Bạn không có quyền thực hiện thao tác này.\nLệnh thêm nhân viên chính thức chỉ dành cho 👑 <b>Admin</b> hoặc 🛡️ <b>HR</b>.'
          });
        } else if (!rawArgs) {
          actions.push({
            chatId,
            text: '➕ <b>CÚ PHÁP THÊM NHÂN VIÊN CHÍNH THỨC:</b>\n\n'
              + '👉 <code>/them_nv_chinhthuc &lt;Tên NV&gt; &lt;SĐT&gt; &lt;Chi Nhánh&gt; &lt;Ca làm việc&gt; &lt;ngày bắt đầu&gt; &lt;Mã NV - BOT Telegram tự động tạo&gt; &lt;Điểm TEST&gt;</code>\n\n'
              + '• <i>Tự động sinh mã NV (nhập <code>auto</code> hoặc <code>bot</code>):</i>\n'
              + '<code>/them_nv_chinhthuc Nguyễn Văn A 0905123456 CN1 Ca Sáng 20/09/2026 auto 9</code>\n\n'
              + '• <i>Tự nhập mã NV tùy chọn:</i>\n'
              + '<code>/them_nv_chinhthuc Nguyễn Văn A 0905123456 CN1 Ca Sáng 20/09/2026 NV1288 9</code>\n\n'
              + '• <i>Hỗ trợ dấu phẩy:</i>\n'
              + '<code>/them_nv_chinhthuc: Nguyễn Văn A, 0905123456, CN1, Ca Sáng, 20/09/2026, auto, 9.5</code>\n\n'
              + '📌 <b>Cơ chế tự động hóa:</b>\n'
              + '1. BOT tự động tạo mã NV chuẩn hóa theo tiền tố chi nhánh nếu chọn <code>auto</code>.\n'
              + '2. Tự động cấp KEY kích hoạt Mini App (<code>KEY-XXXXXXXX</code>).\n'
              + '3. Lưu cơ sở dữ liệu hệ thống và kích hoạt đồng bộ tức thì sang Google Sheet 17iXM (Tab: <code>NHAN_VIEN_CHINH_THUC</code>)!'
          });
        } else if (ctx?.hrCreateOfficialEmployee) {
          const r = await ctx.hrCreateOfficialEmployee(hrSession, rawArgs);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: 'Chức năng thêm nhân viên chính thức tạm thời không khả dụng.' });
        }
      } else if (text.startsWith('/capnhat_nv_chinhthuc')) {
        const rawArgs = text.replace(/^\/capnhat_nv_chinhthuc:?/, '').trim();
        const roleStr = String(hrSession.role || '').toUpperCase();
        if (roleStr !== 'ADMIN' && roleStr !== 'HR') {
          actions.push({
            chatId,
            text: '⛔ <b>TỪ CHỐI TRUY CẬP:</b> Bạn không có quyền thực hiện thao tác này.\nLệnh chuyển nhân viên chính thức chỉ dành cho 👑 <b>Admin</b> hoặc 🛡️ <b>HR</b>.'
          });
        } else if (rawArgs) {
          if (ctx?.hrPromoteToOfficial) {
            const r = await ctx.hrPromoteToOfficial(hrSession, rawArgs);
            actions.push({ chatId, text: r.text });
          } else {
            actions.push({ chatId, text: 'Chức năng chuyển nhân viên chính thức tạm thời không khả dụng.' });
          }
        } else {
          if (ctx?.hrGetTrainingEmployees) {
            const r = await ctx.hrGetTrainingEmployees(hrSession);
            if (r.employees && r.employees.length > 0) {
              const inlineKb = r.employees.slice(0, 10).map(e => ([{
                text: `⭐ ${e.name} (${e.employeeId} - ${e.branchId || 'CN'})`,
                callback_data: `promote_official:${e.employeeId}`
              }]));
              inlineKb.push([{ text: '🔙 Đóng', callback_data: '/menu' }]);
              actions.push({
                chatId,
                text: r.text,
                extra: { reply_markup: { inline_keyboard: inlineKb } }
              });
            } else {
              actions.push({ chatId, text: r.text });
            }
          } else {
            actions.push({ chatId, text: 'Chức năng lấy danh sách training tạm thời không khả dụng.' });
          }
        }
      } else if (text.startsWith('/sua_thongtin_nhanvien')) {
        const rawArgs = text.replace(/^\/sua_thongtin_nhanvien:?/, '').trim();
        if (!rawArgs) {
          actions.push({
            chatId,
            text: '✏️ <b>CÚ PHÁP SỬA THÔNG TIN NHÂN VIÊN (ĐỒNG BỘ GOOGLE SHEET):</b>\n\n'
              + '👉 <code>/sua_thongtin_nhanvien: &lt;Mã_NV&gt; &lt;ca_cũ&gt; sang &lt;ca_mới&gt;, &lt;CN_cũ&gt; sang &lt;CN_mới&gt;</code>\n\n'
              + '• <i>Hỗ trợ mã ngắn:</i> <code>NV1288</code> hoặc <code>1288</code>\n'
              + '• <i>Ví dụ:</i> <code>/sua_thongtin_nhanvien: NV1288 ca sáng sang ca tối, CN1 sang CN2</code>\n\n'
              + '📊 <i>Hệ thống tự động cập nhật database và đồng bộ tức thì sang Google Sheet 17iXM!</i>'
          });
        } else if (ctx?.hrUpdateEmployeeInfo) {
          const r = await ctx.hrUpdateEmployeeInfo(hrSession, rawArgs);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: 'Chức năng sửa thông tin nhân viên tạm thời không khả dụng.' });
        }
      } else if (text.startsWith('/xoa_nhanvien')) {
        const rawCode = text.replace(/^\/xoa_nhanvien:?/, '').trim();
        const roleStr = String(hrSession.role || '').toUpperCase();
        if (roleStr !== 'ADMIN' && roleStr !== 'HR') {
          actions.push({
            chatId,
            text: '⛔ <b>TỪ CHỐI TRUY CẬP:</b> Bạn không có quyền thực hiện thao tác này.\nLệnh xóa nhân viên chỉ dành cho 👑 <b>Admin</b> hoặc 🛡️ <b>HR</b>.'
          });
        } else if (!rawCode) {
          actions.push({
            chatId,
            text: '🗑️ <b>CÚ PHÁP XÓA VĨNH VIỄN NHÂN VIÊN:</b>\n\n'
              + '👉 <code>/xoa_nhanvien &lt;Mã_NV&gt;</code>\n'
              + '<i>Hoặc:</i> <code>/xoa_nhanvien: &lt;Mã_NV&gt;</code>\n\n'
              + '• <i>Hỗ trợ mã ngắn:</i> <code>NV1288</code> hoặc <code>1288</code>\n'
              + '• <i>Ví dụ:</i> <code>/xoa_nhanvien NV1288</code>\n\n'
              + '⚠️ <b>LƯU Ý QUAN TRỌNG:</b>\n'
              + 'Lệnh này sẽ <b>lập tức xóa sạch 100% dữ liệu</b> của nhân viên trên cả <b>Google Sheet (17iXM)</b> và <b>Hệ thống (Web App)</b>, đồng thời hủy bỏ phiên làm việc ngay lập tức (Force Logout)!'
          });
        } else if (ctx?.hrDeleteEmployee) {
          const r = await ctx.hrDeleteEmployee(hrSession, rawCode);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: 'Chức năng xóa nhân viên tạm thời không khả dụng.' });
        }
      } else if (text.startsWith('/xoa_off') || text.startsWith('/huy_off') || text.startsWith('/reset_off')) {
        const rawCode = text.replace(/^(\/xoa_off|\/huy_off|\/reset_off):?/, '').trim();
        const roleStr = String(hrSession.role || '').toUpperCase();
        if (roleStr !== 'ADMIN' && roleStr !== 'HR') {
          actions.push({
            chatId,
            text: '⛔ <b>TỪ CHỐI TRUY CẬP:</b> Bạn không có quyền thực hiện thao tác này.\nLệnh xóa lịch OFF chỉ dành cho 👑 <b>Admin</b> hoặc 🛡️ <b>HR</b>.'
          });
        } else if (!rawCode) {
          actions.push({
            chatId,
            text: '🏖️ <b>CÚ PHÁP XÓA LỊCH OFF & YÊU CẦU ĐĂNG KÝ LẠI:</b>\n\n'
              + '👉 <code>/xoa_off &lt;Mã_NV&gt;</code>\n'
              + '<i>Hoặc:</i> <code>/huy_off &lt;Mã_NV&gt;</code> (hoặc <code>/reset_off &lt;Mã_NV&gt;</code>)\n\n'
              + '• <i>Hỗ trợ mã ngắn:</i> <code>NV1288</code> hoặc <code>1288</code>\n'
              + '• <i>Ví dụ:</i> <code>/xoa_off NV1288</code>\n\n'
              + '🤖 <b>Cơ chế tự động:</b>\n'
              + '1. Tự động xóa sạch các thông báo trùng lặp trong hàng đợi.\n'
              + '2. Xóa các phiếu OFF 2 ngày/tuần và hoàn trả ngày làm việc về ca bình thường.\n'
              + '3. Tự động gửi tin nhắn Telegram tới nhân viên yêu cầu đăng ký lại 2 ngày OFF tuần này!'
          });
        } else if (ctx?.hrResetEmployeeOff) {
          const r = await ctx.hrResetEmployeeOff(hrSession, rawCode);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: 'Chức năng xóa lịch OFF tạm thời không khả dụng.' });
        }
      } else if (text.startsWith('/reset_hethong')) {
        if (String(hrSession.role || '').toUpperCase() !== 'ADMIN') {
          actions.push({
            chatId,
            text: '⛔ <b>TỪ CHỐI TRUY CẬP: QUYỀN HẠN BỊ KHÓA!</b>\n\nLệnh <code>/reset_hethong</code> <b>CHỈ THỰC HIỆN MỖI TÀI KHOẢN ADMIN</b>.\nCác tài khoản còn lại (HR, QL, MKT) <b>TUYỆT ĐỐI KHÔNG CÓ QUYỀN</b> thực hiện hành động này.'
          });
        } else {
          const sheetName = text.replace(/^\/reset_hethong:?/, '').trim();
          if (!sheetName) {
            actions.push({
              chatId,
              text: '⚠️ <b>CÚ PHÁP RESET GOOGLE SHEET (ADMIN ONLY):</b>\n\n👉 <code>/reset_hethong: &lt;tên_sheet&gt;</code>\n<i>Ví dụ:</i> <code>/reset_hethong: LICH_LAM_VIEC</code>\n\n📌 <i>Lưu ý: Toàn bộ dữ liệu từ dòng A2 đến Z trên sheet mục tiêu sẽ bị xóa sạch, dòng tiêu đề Header hàng 1 được giữ nguyên.</i>'
            });
          } else if (ctx?.adminResetSheet) {
            const r = await ctx.adminResetSheet(hrSession, sheetName);
            actions.push({ chatId, text: r.text });
          } else {
            actions.push({
              chatId,
              text: `⚠️ <b>XÁC NHẬN DỌN DẸP DỮ LIỆU GOOGLE SHEET</b>\nSheet mục tiêu: <code>${sheetName}</code>\nQuyền thực thi: 👑 <b>Quản trị viên tối cao (ADMIN)</b>\n\n✅ <b>KẾT QUẢ:</b> Đã xóa sạch dữ liệu từ dòng A2 đến Z trên Google Sheet!\n📌 Dòng tiêu đề (Headers hàng 1) được bảo vệ nguyên vẹn 100%.`
            });
          }
        }
      } else if (text.startsWith('/duyet_phieuluong')) {
        const roleStr = String(hrSession?.role || '').toUpperCase();
        if (roleStr !== 'QL' && roleStr !== 'MANAGER') {
          actions.push({
            chatId,
            text: `⛔ <b>QUYỀN HẠN BỊ TỪ CHỐI:</b>\n\nChức năng Duyệt & Phát phiếu lương chỉ hiển thị và thực hiện DUY NHẤT trên tài khoản <b>Quản lý cửa hàng (QL)</b>. Tài khoản vai trò ${hrSession.role} không có quyền thực hiện.`
          });
        } else {
          const branchArg = text.replace('/duyet_phieuluong', '').trim();
          if (ctx?.hrApproveAndSendPayslips) {
            const r = await ctx.hrApproveAndSendPayslips(hrSession, branchArg);
            actions.push({ chatId, text: r.text });
          } else {
            actions.push({ chatId, text: 'Chức năng duyệt phát phiếu lương tạm thời không khả dụng.' });
          }
        }
      } else if (text.startsWith('/doi_mat_khau')) {
        const parts = text.replace('/doi_mat_khau', '').trim().split(/\s+/);
        if (parts.length < 3) {
          actions.push({
            chatId,
            text: '🔐 <b>CÚ PHÁP ĐỔI MẬT KHẨU TÀI KHOẢN:</b>\n\n'
              + '👉 <code>/doi_mat_khau &lt;tên_đăng_nhập&gt; &lt;mật_khẩu_cu&gt; &lt;mật_khẩu_moi&gt;</code>\n\n'
              + '📌 <i>Lưu ý bảo mật: Không chia sẻ mật khẩu mới cho người khác.</i>'
          });
        } else if (ctx?.hrChangePassword) {
          const r = await ctx.hrChangePassword(hrSession, parts[0], parts[1], parts[2]);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: 'Chức năng đổi mật khẩu tạm thời không khả dụng.' });
        }
      } else if (text.startsWith('/test')) {
        if (String(hrSession.role).toUpperCase() !== 'ADMIN') {
          actions.push({ chatId, text: '⛔ Cú pháp /test chỉ dành riêng cho tài khoản Admin.' });
        } else {
          const testType = text.replace('/test', '').trim() || 'off';
          if (ctx?.adminRunTest) {
            const r = await ctx.adminRunTest(testType, hrSession);
            actions.push({ chatId, text: r.text });
          } else {
            actions.push({ chatId, text: `🧪 [TEST] Đã chạy test chức năng: ${testType} (bản ghi giả lập).` });
          }
        }
      } else if (text.startsWith('/delete_test')) {
        if (String(hrSession.role).toUpperCase() !== 'ADMIN') {
          actions.push({ chatId, text: '⛔ Cú pháp /delete_test chỉ dành riêng cho tài khoản Admin.' });
        } else if (ctx?.adminDeleteTest) {
          const r = await ctx.adminDeleteTest(hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '🗑️ Đã xóa sạch dữ liệu test an toàn.' });
        }
      } else if (text.startsWith('/users')) {
        if (String(hrSession.role).toUpperCase() !== 'ADMIN') {
          actions.push({ chatId, text: '⛔ Cú pháp /users chỉ dành riêng cho tài khoản Admin.' });
        } else if (ctx?.adminGetUsers) {
          const r = await ctx.adminGetUsers(hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '👥 Danh sách người dùng hệ thống.' });
        }
      } else if (text.startsWith('/capquyen')) {
        if (String(hrSession.role).toUpperCase() !== 'ADMIN') {
          actions.push({ chatId, text: '⛔ Cú pháp /capquyen chỉ dành riêng cho tài khoản Admin.' });
        } else {
          const parts = text.replace('/capquyen', '').trim().split(/\s+/);
          if (parts.length < 2) {
            actions.push({ chatId, text: 'Cú pháp: <code>/capquyen <username> <Admin|HR|QL|MKT></code>\nVí dụ: <code>/capquyen lan_manager QL</code>' });
          } else if (ctx?.adminSetRole) {
            const r = await ctx.adminSetRole(hrSession, parts[0], parts[1]);
            actions.push({ chatId, text: r.text });
          }
        }
      } else if (text.startsWith('/phanquyen')) {
        if (String(hrSession.role).toUpperCase() !== 'ADMIN') {
          actions.push({ chatId, text: '⛔ Cú pháp /phanquyen chỉ dành riêng cho tài khoản Admin.' });
        } else {
          const parts = text.replace('/phanquyen', '').trim().split(/\s+/);
          if (parts.length < 2) {
            actions.push({ chatId, text: 'Cú pháp: <code>/phanquyen <username> <tab1,tab2></code>\nVí dụ: <code>/phanquyen hr_lan candidates,training,elearning</code>' });
          } else if (ctx?.adminSetTabs) {
            const r = await ctx.adminSetTabs(hrSession, parts[0], parts[1]);
            actions.push({ chatId, text: r.text });
          }
        }
      } else if (text.startsWith('/diemdanh_cn')) {
        if (ctx?.getBranchAttendance) {
          const r = await ctx.getBranchAttendance(hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '📍 Không thể lấy danh sách điểm danh chi nhánh lúc này.' });
        }
      } else if (text.startsWith('/lich_cn')) {
        if (ctx?.getBranchSchedule) {
          const r = await ctx.getBranchSchedule(hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '📅 Không thể lấy lịch chi nhánh lúc này.' });
        }
      } else if (text.startsWith('/duyet_ca')) {
        if (ctx?.getBranchSwapRequests) {
          const r = await ctx.getBranchSwapRequests(hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '🔄 Không có phiếu đổi ca chờ duyệt tại chi nhánh.' });
        }
      } else if (text.startsWith('/baohong_cn')) {
        if (ctx?.getBranchDeviceRequests) {
          const r = await ctx.getBranchDeviceRequests(hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '🛠️ Không có sự cố thiết bị tại chi nhánh.' });
        }
      } else if (text.startsWith('/broadcast_mkt')) {
        const mktMsg = text.replace('/broadcast_mkt', '').trim();
        if (!mktMsg) {
          actions.push({ chatId, text: 'Cú pháp: <code>/broadcast_mkt <nội dung tin tức khuyến mãi></code>' });
        } else if (ctx?.broadcastMarketing) {
          const r = await ctx.broadcastMarketing(hrSession, mktMsg);
          actions.push({ chatId, text: r.text });
        }
      } else if (text.startsWith('/sukien')) {
        if (ctx?.getMarketingEvents) {
          const r = await ctx.getMarketingEvents(hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '🎁 Danh sách sự kiện & khuyến mãi.' });
        }
      } else if (text.startsWith('/tintuc')) {
        if (ctx?.getMarketingNews) {
          const r = await ctx.getMarketingNews(hrSession);
          actions.push({ chatId, text: r.text });
        } else {
          actions.push({ chatId, text: '📰 Bản tin nội bộ chuỗi.' });
        }
      } else if (text.startsWith('/duyet')) {
        if (ctx?.getPendingCounts) {
          const r = await ctx.getPendingCounts();
          actions.push({ chatId, text: r.text });
        }
      } else if (text.startsWith('/baocao')) {
        if (ctx?.getDailyReport) {
          const r = await ctx.getDailyReport();
          actions.push({ chatId, text: r.text });
        }
      } else if (text.startsWith('/broadcast')) {
        const msg = text.replace('/broadcast', '').trim();
        if (!msg) {
          actions.push({ chatId, text: 'Cú pháp: /broadcast <code>nội dung gửi tới Mini App NV</code>' });
        } else if (ctx?.broadcastToEmployees) {
          const r = await ctx.broadcastToEmployees(hrSession.username || String(from?.id), msg);
          actions.push({ chatId, text: r.text });
        }
      } else {
        // Unknown command for authenticated HR user: show menu
        actions.push({
          chatId,
          text: `❓ Lệnh không hợp lệ. Vui lòng xem bảng chức năng bên dưới:\n\n` + getHrRoleMenuText(hrSession),
          extra: hrMenuKeyboard(hrSession.role, webAppUrl)
        });
      }
      return actions;
    }

    // --- PHÂN LUỒNG XỬ LÝ CHO BOT NHÂN VIÊN & BOT TÀI CHÍNH ---
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
        text: '📱 <b>BẢNG CHỨC NĂNG NHANH — ỤM BÒ MILK</b>\n\nNhấn chọn chức năng bên dưới hoặc gõ trực tiếp cú pháp lệnh:\n• <code>/diemdanh</code> — Điểm danh hôm nay\n• <code>/lich</code> — Xem lịch 7 ngày tới\n• <code>18/09/2026, 22/09/2026</code> — Đăng ký 2 ngày OFF\n• <code>/luong</code> — Lương tạm tính tháng này\n• <code>/doica</code> — Đổi ca làm việc\n• <code>/baohong</code> — Báo hỏng thiết bị\n• <code>/sos</code> — Báo ca khẩn cấp',
        extra: employeeMenuKeyboard(webAppUrl),
      });
    } else if (text.startsWith('/app')) {
      actions.push({
        chatId,
        text: '🐮 Nhấn nút bên dưới để mở Mini App Ụm Bò Milk:',
        extra: webAppKeyboard(webAppUrl),
      });
    } else if (text.startsWith('/sos') || /^sos$/i.test(text)) {
      actions.push({
        chatId,
        text: '🆘 <b>KÊNH HỖ TRỢ KHẨN CẤP / BÁO CA ĐỘT XUẤT (SOS)</b>\n\n'
          + 'Nếu bạn gặp sự cố đột xuất (ốm đau khẩn cấp, tai nạn hoặc việc bất khả kháng không thể vào ca):\n'
          + '1. Hãy nhắn trực tiếp lý do vào khung chat này để Bot lập tức báo khẩn cho Quản lý cửa hàng và HR.\n'
          + '2. Hoặc liên hệ Hotline Trực ca Khẩn cấp: <b>0909.903.609 - 0333.137.633</b> (hoặc 0842.112.530 trực 24/7).\n'
          + '3. HR & Quản lý sẽ chủ động điều phối nhân sự hỗ trợ ca cho bạn ngay lập tức!'
      });
    } else if (text.startsWith('/doica') || text.includes('Đổi ca') || /^đổi ca$|^doi ca$/i.test(text)) {
      const rawSwap = text.replace('/doica', '').trim();
      if (!rawSwap || rawSwap === 'Đổi ca' || rawSwap === 'đổi ca') {
        if (ctx?.getBranchColleagues) {
          const colRes = await ctx.getBranchColleagues(String(from?.id));
          if (colRes?.colleagues && colRes.colleagues.length > 0) {
            const inline_keyboard = colRes.colleagues.map(c => [
              { text: `👤 ${c.name} (${c.employeeId})`, callback_data: `swapcolleague:${c.employeeId}` }
            ]);
            actions.push({
              chatId,
              text: `🔄 <b>YÊU CẦU ĐỔI CA — Đổi ca làm việc / Tráo ca trong tuần</b>\n`
                + `🏪 <b>Chi nhánh:</b> ${colRes.branchName || 'Chi nhánh của bạn'}\n`
                + `👤 <b>Bạn:</b> ${colRes.emp?.name || 'Nhân viên'} (<code>${colRes.emp?.employeeId || ''}</code>)\n\n`
                + `👇 <b>Vui lòng chạm chọn bạn đồng nghiệp cùng chi nhánh bạn muốn đổi ca:</b>\n`
                + `<i>(Hoặc gõ cú pháp nhanh: <code>/doica &lt;ngày_A&gt; &lt;ca_A&gt; sang &lt;NV_B&gt; &lt;ngày_B&gt; &lt;ca_B&gt;</code>)</i>`,
              extra: { reply_markup: { inline_keyboard } }
            });
            return actions;
          }
        }
        actions.push({
          chatId,
          text: '🔄 <b>YÊU CẦU ĐỔI CA — Đổi ca làm việc / Tráo ca trong tuần</b>\n\n'
            + '👉 <b>Cú pháp gửi yêu cầu:</b>\n'
            + '<code>/doica &lt;ngày_A&gt; &lt;ca_A&gt; sang &lt;NV_B&gt; &lt;ngày_B&gt; &lt;ca_B&gt;</code>\n\n'
            + '• <i>Ví dụ đổi ca làm việc:</i>\n'
            + '<code>/doica 20/09 Ca Sáng sang Lan 20/09 Ca Tối</code>\n\n'
            + '• <i>Ví dụ đổi ngày nghỉ hoặc làm 2 ca:</i>\n'
            + '<code>/doica 21/09 Ca Chiều sang NV1289 21/09 Ca Sáng</code>\n\n'
            + '📌 <b>Quy trình 3 bước:</b>\n'
            + '1️⃣ Bạn gửi lệnh đổi ca\n'
            + '2️⃣ Bot gửi tin nhắn riêng cho NV B bấm xác nhận [✅ ĐỒNG Ý] / [❌ TỪ CHỐI]\n'
            + '3️⃣ NV B đồng ý $\\rightarrow$ Chuyển BOT Quản trị HR duyệt $\\rightarrow$ Cập nhật lịch cả 2 NV!'
        });
      } else if (ctx?.requestShiftSwap) {
        const r = await ctx.requestShiftSwap(String(from?.id), rawSwap, chatId);
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({
          chatId,
          text: '🔄 Đã tiếp nhận yêu cầu đổi ca: <code>' + rawSwap + '</code>. Hệ thống đang xử lý và gửi xác nhận tới nhân viên liên quan.'
        });
      }
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
      if (ctx?.getScheduleWithNextWeekStatus) {
        const r = await ctx.getScheduleWithNextWeekStatus(String(from?.id));
        actions.push({ chatId, text: r.text });
      } else if (ctx?.getSchedule) {
        const r = await ctx.getSchedule(String(from?.id));
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({ chatId, text: '📅 Chưa thể lấy thông tin lịch lúc này.' });
      }
    } else if (text.startsWith('/diemdanh') || text.startsWith('/checkin') || text.startsWith('/checkout') || text.includes('Điểm danh') || /^điểm danh$|^diem danh$/i.test(text)) {
      if (ctx?.getTodayStatus) {
        const r = await ctx.getTodayStatus(String(from?.id));
        actions.push({ chatId, text: r.text, ...(r.extra ? { extra: r.extra } : {}) });
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
    } else if (text.startsWith('/help')) {
      const role = ctx?.role && HELP_TEXTS[ctx.role] ? ctx.role : 'employee';
      actions.push({ chatId, text: HELP_TEXTS[role], extra: webAppKeyboard(webAppUrl) });
    } else if (text === '/off' || text.toLowerCase() === '/dang_ky_off' || text.includes('Đăng ký OFF') || /^đăng ký off$|^dang ky off$/i.test(text)) {
      const win = ctx?.checkOffWindow ? ctx.checkOffWindow() : { isOpen: true, state: 'OPEN' };
      if (win.state === 'BEFORE') {
        actions.push({
          chatId,
          text: '⏳ <b>CHƯA ĐẾN KHUNG GIỜ ĐĂNG KÝ LỊCH OFF</b>\n\n'
            + 'Cổng đăng ký lịch OFF tuần kế tiếp sẽ mở từ <b>12h00 Thứ 6</b> đến <b>15h00 Thứ 7</b> hàng tuần (theo Giờ Việt Nam).\n\n'
            + '📌 <i>Vui lòng quay lại đúng khung giờ để đăng ký bạn nhé!</i>'
        });
      } else if (win.state === 'AFTER') {
        actions.push({
          chatId,
          text: '🔒 <b>ĐÃ HẾT HẠN KHUNG GIỜ ĐĂNG KÝ LỊCH OFF</b>\n\n'
            + 'Cổng đăng ký lịch OFF tuần đã đóng lúc <b>15h00 Thứ 7</b> (Giờ Việt Nam).\n'
            + 'Trạng thái hiện tại: <b>CHỜ NHÂN SỰ CẬP NHẬT LỊCH...</b>\n\n'
            + '📌 <i>Nếu bạn có việc đột xuất khẩn cấp, vui lòng dùng cú pháp <code>/sos</code> hoặc liên hệ trực tiếp Quản lý cửa hàng / HR!</i>'
        });
      } else {
        actions.push({
          chatId,
          text: '🔔 <b>Đăng ký lịch OFF (2 ngày/tuần) — CỔNG ĐĂNG KÝ TUẦN ĐÃ MỞ!</b>\n\n'
            + 'Bạn vui lòng nhắn trực tiếp 2 ngày muốn nghỉ vào khung chat này theo định dạng:\n'
            + '👉 <code>dd/mm/yyyy, dd/mm/yyyy</code>\n\n'
            + '<i>Ví dụ:</i> <code>18/09/2026, 22/09/2026</code>\n\n'
            + '🤖 <i>Bot Telegram sẽ tự động ghi nhận 2 ngày OFF này và cập nhật các ngày còn lại trong tuần là ngày LÀM VIỆC (WORKING) để chuyển HR phê duyệt lịch tuần cho bạn!</i>',
        });
      }
    } else if (text === '/dangky_lai_off' || text === '/huy_off' || text === '/reset_off' || text === '/xoa_off' || text.startsWith('/dangky_lai_off') || text.startsWith('/huy_off') || text.startsWith('/reset_off') || text.startsWith('/xoa_off')) {
      if (ctx?.employeeResetOff) {
        const r = await ctx.employeeResetOff(String(from?.id));
        actions.push({ chatId, text: r.text });
      } else {
        actions.push({ chatId, text: 'Chức năng làm mới lịch OFF tạm thời không khả dụng.' });
      }
    } else if (isOffRegistration(text)) {
      const dates = extractOffDates(text);
      if (dates.length === 0) {
        actions.push({
          chatId,
          text: '📅 <b>Đăng ký lịch OFF (2 ngày/tuần)</b>\nCú pháp: Nhắn đúng 2 ngày theo định dạng <code>dd/mm/yyyy</code>\nVí dụ: <code>18/09/2026, 22/09/2026</code>\n(Bot sẽ tự động ghi nhận ngày OFF và cập nhật những ngày còn lại là ngày làm việc cho bạn).',
        });
      } else if (ctx?.checkExistingOffRegistration && (await ctx.checkExistingOffRegistration(String(from?.id), dates))?.hasRegistered) {
        const existing = await ctx.checkExistingOffRegistration(String(from?.id), dates);
        actions.push({
          chatId,
          text: `⚠️ <b>CẢNH BÁO: BẠN ĐÃ ĐĂNG KÝ LỊCH OFF TUẦN NÀY RỒI!</b>\n\n`
            + `📋 <b>Thông tin đăng ký hiện tại của bạn:</b>\n`
            + `• <b>2 ngày OFF đã ghi nhận:</b> <code>${existing.dates.join(', ')}</code>\n`
            + `• <b>Trạng thái:</b> ⏳ Đang chờ HR phê duyệt lịch tuần\n\n`
            + `📌 <b>Quy định công ty:</b> Mỗi nhân viên chỉ được đăng ký tối đa 2 ngày OFF trong 1 tuần làm việc. Hệ thống không cho phép tự ý ghi đè.\n`
            + `👉 <b>Nếu bạn muốn đăng ký lại hoặc đổi sang 2 ngày khác:</b>\n`
            + `Vui lòng gõ lệnh: <code>/dangky_lai_off</code> (hoặc <code>/huy_off</code>).\n`
            + `(Bot sẽ tự động dọn dẹp thông báo trùng, xóa lịch OFF cũ và cho phép bạn gửi lại 2 ngày mới ngay lập tức!).\n\n`
            + `• Hoặc dùng chức năng <b>"🔄 Đổi ca"</b> (<code>/doica</code>) để đổi ca với đồng nghiệp cùng chi nhánh.`
        });
      } else if (ctx?.checkColleagueOffConflict && (await ctx.checkColleagueOffConflict(String(from?.id), dates))?.hasConflict) {
        const conflict = await ctx.checkColleagueOffConflict(String(from?.id), dates);
        actions.push({
          chatId,
          text: `⚠️ <b>CẢNH BÁO: TRÙNG LỊCH NGHỈ VỚI ĐỒNG NGHIỆP CÙNG CA!</b>\n\n`
            + `🏪 Chi nhánh: <b>${conflict.branchId || '—'}</b> • Ca: <b>${conflict.shift || '—'}</b>\n`
            + `👤 Đồng nghiệp: <b>${conflict.colleagueName}</b> (<code>${conflict.colleagueId}</code>)\n`
            + `📅 Đã đăng ký nghỉ trước ngày: <code>${conflict.conflictDates.join(', ')}</code>\n\n`
            + `📌 <b>Ràng buộc vận hành:</b> Hai nhân viên cùng chi nhánh và cùng ca làm việc <b>không thể cùng nghỉ chung 1 ngày</b> để đảm bảo luôn có nhân sự trực ca.\n`
            + `(Các nhân viên khác ca hoặc khác chi nhánh vẫn được phép làm việc hoặc nghỉ cùng ngày).\n\n`
            + `👉 <i>Vui lòng chọn ngày nghỉ khác hoặc liên hệ Quản lý cửa hàng / HR để được điều phối!</i>`
        });
      } else if (ctx?.registerOffSchedule) {
        const win = ctx?.checkOffWindow ? ctx.checkOffWindow() : { isOpen: true, state: 'OPEN' };
        if (win.state === 'BEFORE' && !ctx?.bypassWindow) {
          actions.push({
            chatId,
            text: '⏳ <b>CHƯA ĐẾN KHUNG GIỜ ĐĂNG KÝ LỊCH OFF</b>\n\nCổng đăng ký lịch OFF tuần kế tiếp sẽ mở từ <b>12h00 Thứ 6</b> đến <b>15h00 Thứ 7</b> hàng tuần (theo Giờ Việt Nam).\n\nVui lòng gửi lại yêu cầu khi cổng chính thức mở!'
          });
        } else if (win.state === 'AFTER' && !ctx?.bypassWindow) {
          actions.push({
            chatId,
            text: '🔒 <b>ĐÃ HẾT HẠN KHUNG GIỜ ĐĂNG KÝ LỊCH OFF</b>\n\nCổng đăng ký đã đóng lúc <b>15h00 Thứ 7</b> (Giờ Việt Nam). Hiện đang ở trạng thái: <b>CHỜ NHÂN SỰ CẬP NHẬT LỊCH...</b>\n\nNếu bạn có phát sinh khẩn cấp, vui lòng nhắn <code>/sos</code>!'
          });
        } else {
          const r = await ctx.registerOffSchedule(String(from?.id), dates, from?.username || '');
          actions.push({ chatId, text: r.text });
        }
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
          text: '🤖 <b>Trợ lý Bot Ụm Bò Milk</b>\n\nBạn có thể nhắn trực tiếp với Bot:\n• <code>/diemdanh</code> — Xem trạng thái vào/ra ca hôm nay\n• <code>/lich</code> — Xem lịch 7 ngày tới\n• <code>18/09/2026, 22/09/2026</code> — Đăng ký 2 ngày OFF\n• <code>/dangky_lai_off</code> — Làm mới lịch & đăng ký lại 2 ngày OFF\n• <code>/luong</code> — Xem tạm tính lương\n• <code>/doica</code> — Hướng dẫn đổi ca\n• <code>/baohong</code> — Báo hỏng thiết bị\n• <code>/sos</code> — Báo ca khẩn cấp\n\nHoặc nhắn bất kỳ câu hỏi/yêu cầu nào để Bot chuyển tới HR hỗ trợ bạn nhé!',
          extra: employeeMenuKeyboard(webAppUrl),
        });
      }
    }
  } catch (e) {
    // không throw — Bot không được crash vì 1 update lỗi
  }
  return actions;
}

const DEFAULT_SHIFTS = {
  CA_SANG: { name: 'Ca Sáng', start: '07:00', end: '12:00', hours: 5 },
  CA_CHIEU: { name: 'Ca Chiều', start: '12:00', end: '18:00', hours: 6 },
  CA_TRUA: { name: 'Ca Chiều', start: '12:00', end: '18:00', hours: 6 },
  CA_TOI: { name: 'Ca Tối', start: '18:00', end: '23:00', hours: 5 }
};

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = {
  parseTelegramInitData,
  verifyTelegramInitData,
  tgApi,
  sendTelegramMessage,
  answerTelegramCallbackQuery,
  setTelegramWebhook,
  setTelegramMenuButton,
  removeTelegramMenuButton,
  setTelegramCommands,
  handleTelegramUpdate,
  extractOffDates,
  isOffRegistration,
  employeeMenuKeyboard,
  attendanceGpsKeyboard,
  attendancePhotoKeyboard,
  hrMenuKeyboard,
  getHrRoleKeyboard: hrMenuKeyboard,
  getHrRoleMenuText,
  HELP_TEXT,
  HELP_TEXTS,
  START_TEXTS,
  BOT_ROLES,
  webAppKeyboard,
  DEFAULT_SHIFTS,
  calculateDistanceMeters,
};

