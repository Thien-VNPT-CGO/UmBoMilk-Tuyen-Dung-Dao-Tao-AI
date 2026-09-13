// services/vietnamHoliday.js — Lịch lễ Việt Nam cho tính lương NV chính thức.
// Quy tắc (tự động theo lịch + Admin có thể thêm ngày lễ riêng):
// Auto (không cấu hình tay):
//   - Tết Dương lịch 01/01 dương: ×2
//   - Giỗ Tổ Hùng Vương 10/3 âm: ×2
//   - Giải phóng miền Nam 30/4 dương: ×2
//   - Quốc tế Lao động 01/5 dương: ×2
//   - Quốc Khánh 02/9 dương: ×2
//   - Tết Nguyên Đán Mùng 3-5 tháng Giêng âm: ×3
// Custom (Admin thêm trong Settings): db.settings.holidays.custom[]
// Chỉ áp dụng cho NV CHÍNH THỨC đi làm (có check-in).
const { Solar } = require('lunar-javascript');

function getAutoHolidayInfo(dateStr){
  if(!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if(m===1 && d===1) return { name: 'Tết Dương lịch', multiplier: 2, kind: 'LE' };
  if(m===4 && d===30) return { name: 'Giải phóng miền Nam', multiplier: 2, kind: 'LE' };
  if(m===5 && d===1) return { name: 'Quốc tế Lao động', multiplier: 2, kind: 'LE' };
  if(m===9 && d===2) return { name: 'Quốc Khánh', multiplier: 2, kind: 'LE' };
  let lunar;
  try{ lunar = Solar.fromYmd(y, m, d).getLunar(); }
  catch(e){ return null; }
  const lm = lunar.getMonth(), ld = lunar.getDay();
  if(lm===3 && ld===10) return { name: 'Giỗ Tổ Hùng Vương', multiplier: 2, kind: 'LE' };
  if(lm===1 && ld>=3 && ld<=5) return { name: `Mùng ${ld} Tết Nguyên Đán`, multiplier: 3, kind: 'TET' };
  return null;
}

// Kiem tra ngay le tu db.settings.holidays.custom (Admin them)
function getCustomHolidayInfo(dateStr, customHolidays){
  if(!customHolidays || !Array.isArray(customHolidays) || !dateStr) return null;
  return customHolidays.find(h=>h.date===dateStr) || null;
}

// Tong hop: auto + custom, custom ghi de auto neu trung ngay
function getHolidayInfo(dateStr, customHolidays){
  const auto = getAutoHolidayInfo(dateStr);
  const custom = getCustomHolidayInfo(dateStr, customHolidays);
  if(custom) return { ...custom, kind: custom.kind || 'CUSTOM' };
  return auto;
}

// Map ngay le trong khoang [from, to] (YYYY-MM-DD) — hop ca auto + custom
function getHolidaysInRange(from, to, customHolidays){
  const out = {};
  if(!from || !to || from>to) return out;
  const cur = new Date(from); const end = new Date(to);
  for(let d=new Date(cur); d<=end; d.setDate(d.getDate()+1)){
    const y=d.getFullYear(), mo=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
    const ds = `${y}-${mo}-${da}`;
    const info = getHolidayInfo(ds, customHolidays);
    if(info) out[ds] = info;
  }
  return out;
}

// Danh sach tat ca ngay le trong nam cho admin UI (auto + custom)
function getYearHolidays(year, customHolidays){
  const holidays = [];
  const m2=1, d2=1;  holidays.push({ date:`${year}-01-01`, name:'Tết Dương lịch', multiplier:2, kind:'LE', source:'auto' });
  const m4=4, d4=30; holidays.push({ date:`${year}-04-30`, name:'Giải phóng miền Nam', multiplier:2, kind:'LE', source:'auto' });
  const m5=5, d5=1;  holidays.push({ date:`${year}-05-01`, name:'Quốc tế Lao động', multiplier:2, kind:'LE', source:'auto' });
  const m9=9, d9=2;  holidays.push({ date:`${year}-09-02`, name:'Quốc Khánh', multiplier:2, kind:'LE', source:'auto' });
  // Am lich
  try{
    for(let lm=1; lm<=12; lm++){
      for(let ld=1; ld<=30; ld++){
        try{
          const solar = Solar.fromLunar(Solar.fromYmd(year,1,1).getLunar().year, lm, ld, false);
          const sYmd = `${solar.getYear()}-${String(solar.getMonth()).padStart(2,'0')}-${String(solar.getDay()).padStart(2,'0')}`;
          if(sYmd.startsWith(String(year))){
            if(lm===3 && ld===10) holidays.push({ date:sYmd, name:'Giỗ Tổ Hùng Vương', multiplier:2, kind:'LE', source:'auto' });
            if(lm===1 && ld>=3 && ld<=5) holidays.push({ date:sYmd, name:`Mùng ${ld} Tết Nguyên Đán`, multiplier:3, kind:'TET', source:'auto' });
          }
        }catch(e){}
      }
    }
  }catch(e){}
  // Custom holidays — merge (custom ghi de auto neu trung ngay)
  if(Array.isArray(customHolidays)){
    customHolidays.forEach(ch=>{
      const idx = holidays.findIndex(h=>h.date===ch.date);
      if(idx>=0) holidays[idx] = { ...holidays[idx], ...ch, source:'custom' };
      else holidays.push({ ...ch, source:'custom' });
    });
  }
  holidays.sort((a,b)=>a.date.localeCompare(b.date));
  return holidays;
}

module.exports = { getHolidayInfo, getHolidaysInRange, getAutoHolidayInfo, getCustomHolidayInfo, getYearHolidays };
