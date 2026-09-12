const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Rang buoc mac dinh gio Viet Nam: moi dinh dang thoi gian phai co timeZone Asia/Ho_Chi_Minh.
const JS = ['admin.js', 'employee.js', 'finance.js'].map(f =>
  ({ f, src: fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8') }));
const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function timeLinesWithoutTZ(src) {
  const bad = [];
  const lines = src.split('\n');
  lines.forEach((l, idx) => {
    if (!/toLocale(Date|Time)String|toLocaleString\('vi-VN',\s*\{[^}]*hour/.test(l)) return;
    if (l.includes('timeZone')) return;
    // toLocaleString cho so (khong co hour/minute/...) thi bo qua
    if (!/hour|minute|second|weekday|day:|month:|year:|TimeString|DateString/.test(l)) return;
    bad.push(`${idx + 1}: ${l.trim().slice(0, 120)}`);
  });
  return bad;
}

describe('Rang buoc gio Viet Nam mac dinh', () => {
  it('1. Helper gio VN ton tai ca 3 web app', () => {
    for (const { f, src } of JS) {
      assert.ok(src.includes("timeZone: 'Asia/Ho_Chi_Minh'"), f + ' thieu TZ VN');
      assert.ok(src.includes('function getVietnamNow'), f + ' thieu getVietnamNow');
      assert.ok(src.includes('function getVietnamTodayStr'), f + ' thieu getVietnamTodayStr');
    }
  });

  it('2. Khong format gio thieu timeZone', () => {
    for (const { f, src } of JS) {
      const bad = timeLinesWithoutTZ(src);
      assert.deepEqual(bad, [], f + ' co format gio thieu TZ: ' + bad.join(' | '));
    }
  });

  it('3. fmtDMY fallback ep TZ VN', () => {
    for (const f of ['admin.js', 'employee.js']) {
      const src = JS.find(x => x.f === f).src;
      assert.ok(src.includes("toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).split('-').reverse()"), f + ' fmtDMY chua ep TZ');
    }
  });

  it('4. Server: getNextMonday dung gio VN', () => {
    assert.ok(SERVER.includes('function getNextMonday(d=getVietnamNow())'), 'getNextMonday chua VN');
  });
});
