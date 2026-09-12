// services/fairPick.js — Chon NV cong bang cho 1 ngay lam viec.
// Quy tac: it ngay nhat truoc; hoa thi nguoi lau nhat chua lam; tiep thi dau danh sach.
// Dam bao: nhom 2 nguoi cung CN+ca chia 7 ngay = 3/4 (thay vi lech 5/2 khi thu tu xau),
// nhom N nguoi chenh lech toi da 1 ngay. Khong dung LLM — deterministic.
// workCount: {id: soNgayDaLam} | lastDay: {id: chi so ngay gan nhat da lam, -1 = chua lam} |
// dayIdx: chi so ngay hien tai (tang dan).
function pickFair(availableIds, workCount, lastDay, dayIdx){
  if(!Array.isArray(availableIds) || availableIds.length===0) return null;
  let chosen = availableIds[0];
  let bestCount = workCount[chosen] ?? 0;
  let bestLast = lastDay[chosen] ?? -1;
  let bestPos = 0;
  for(let i=1;i<availableIds.length;i++){
    const id = availableIds[i];
    const c = workCount[id] ?? 0;
    const l = lastDay[id] ?? -1;
    if(c < bestCount || (c===bestCount && (l < bestLast || (l===bestLast && i < bestPos)))){
      chosen = id; bestCount = c; bestLast = l; bestPos = i;
    }
  }
  return chosen;
}

module.exports = { pickFair };
