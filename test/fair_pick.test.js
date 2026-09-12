const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pickFair } = require('../services/fairPick');

// Dieu kien lich tuan: toi thieu 2 ban cung CN+ca -> chia 3/4 (khong lech 5/2).
// Toi thieu 12 ngay lam/thang giu nguyen (canh bao khi duyet, khong chan).
function simulate(ids, offMap, days = 7) {
  const work = {}, last = {};
  ids.forEach(id => { work[id] = 0; last[id] = -1; });
  for (let di = 0; di < days; di++) {
    const avail = ids.filter(id => !(offMap[id] || []).includes(di));
    if (avail.length === 0) continue;
    let chosen;
    if (avail.length === 1) { chosen = avail[0]; }
    else chosen = pickFair(avail, work, last, di);
    work[chosen]++;
    last[chosen] = di;
  }
  return work;
}

describe('Chia ca cong bang 3/4 (pickFair)', () => {
  it('1. Nhom 2 nguoi chia 7 ngay = 3/4 moi thu tu', () => {
    for (const ids of [['A', 'B'], ['B', 'A'], ['X', 'Y']]) {
      const w = simulate(ids, {});
      const loads = Object.values(w).sort((a, b) => a - b);
      assert.deepEqual(loads, [3, 4], ids.join(',') + ' -> ' + JSON.stringify(w));
    }
  });

  it('2. Mot nguoi OFF 2 ngay -> van 3/4', () => {
    const w = simulate(['P', 'T'], { P: [2, 3] });
    assert.deepEqual(Object.values(w).sort((a, b) => a - b), [3, 4], JSON.stringify(w));
    const w2 = simulate(['T', 'P'], { P: [2, 3] });
    assert.deepEqual(Object.values(w2).sort((a, b) => a - b), [3, 4], JSON.stringify(w2));
  });

  it('3. Nhom 3 nguoi chenh lech toi da 1', () => {
    const w = simulate(['A', 'B', 'C'], {});
    const v = Object.values(w);
    assert.ok(Math.max(...v) - Math.min(...v) <= 1, JSON.stringify(w));
    assert.equal(v.reduce((a, b) => a + b, 0), 7);
  });

  it('4. Server dung pickFair o ca 2 diem can lich', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(src.includes("require('./services/fairPick')"), 'thieu require fairPick');
    assert.ok(src.includes('pickFair(group.map'), 'chua dung o auto-create');
    assert.ok(src.includes('pickFair(available.map'), 'chua dung o draft tuan sau');
  });

  it('5. Xoa lich PV: confirm 2 lop + audit luu full backup', () => {
    const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    assert.ok(admin.includes('CHỐT XÓA?'), 'nut Xoa tat ca thieu confirm lan 2');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(src.includes('backupList'), 'audit xoa lich phai luu full backup');
  });
});
