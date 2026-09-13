// services/vietnamHoliday.js — Lịch lễ Việt Nam cho tính lương NV chính thức.
// Quy tắc (tự động theo lịch, không cấu hình tay từng năm):
// - Tết Dương lịch 01/01 dương: ×2 (1 ngày)
// - Giỗ Tổ Hùng Vương mùng 10/3 âm: ×2 (1 ngày)
// - Giải phóng miền Nam 30/4 dương: ×2 (1 ngày)
// - Quốc tế Lao động 01/5 dương: ×2 (1 ngày)
// - Quốc Khánh 02/9 dương: ×2 (1 ngày)
// - Tết Nguyên Đán: Mùng 3 → Mùng 5 tháng Giêng âm: ×3
// Chỉ áp dụng cho NV CHÍNH THỨC đi làm (có check-in) vào đúng ngày lễ.
const { Solar } = require('lunar-javascript');

function getHolidayInfo(dateStr){
  if(!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  // Lễ dương lịch cố định — ×2
  if(m===1 && d===1) return { name: 'Tết Dương lịch', multiplier: 2, kind: 'LE' };
  if(m===4 && d===30) return { name: 'Giải phóng miền Nam', multiplier: 2, kind: 'LE' };
  if(m===5 && d===1) return { name: 'Quốc tế Lao động', multiplier: 2, kind: 'LE' };
  if(m===9 && d===2) return { name: 'Quốc Khánh', multiplier: 2, kind: 'LE' };
  // Lễ âm lịch — cần đổi ngày
  let lunar;
  try{ lunar = Solar.fromYmd(y, m, d).getLunar(); }
  catch(e){ return null; }
  const lm = lunar.getMonth(), ld = lunar.getDay();
  if(lm===3 && ld===10) return { name: 'Giỗ Tổ Hùng Vương', multiplier: 2, kind: 'LE' };
  if(lm===1 && ld>=3 && ld<=5) return { name: `Mùng ${ld} Tết Nguyên Đán`, multiplier: 3, kind: 'TET' };
  return null;
}

// Map ngày lễ trong khoảng [from, to] (YYYY-MM-DD) cho web app hiển thị realtime
function getHolidaysInRange(from, to){
  const out = {};
  if(!from || !to || from>to) return out;
  const cur = new Date(from); const end = new Date(to);
  for(let d=new Date(cur); d<=end; d.setDate(d.getDate()+1)){
    const y=d.getFullYear(), mo=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
    const ds = `${y}-${mo}-${da}`;
    const info = getHolidayInfo(ds);
    if(info) out[ds] = info;
  }
  return out;
}

module.exports = { getHolidayInfo, getHolidaysInRange };
