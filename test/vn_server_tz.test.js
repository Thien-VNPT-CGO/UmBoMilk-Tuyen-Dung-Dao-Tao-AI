const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Rang buoc gio VN phia server: ep TZ ngay dong dau + tzdata trong image.
// Loi cu: container UTC -> getVietnamNow + format TZ = double-shift (+7h).
const ROOT = path.join(__dirname, '..');
const SERVER_HEAD = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
  .split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).slice(0, 3).join('\n');
const DOCKER = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');

describe('Rang buoc TZ server Asia/Ho_Chi_Minh', () => {
  it('1. server.js ep TZ dong dau tien', () => {
    assert.ok(SERVER_HEAD.includes("process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh'"),
      'server.js phai ep TZ VN truoc moi new Date');
  });

  it('2. Dockerfile co tzdata + TZ, render.yaml co TZ', () => {
    assert.ok(DOCKER.includes('tzdata'), 'Alpine thieu tzdata -> TZ roi ve UTC');
    assert.ok(DOCKER.includes('TZ=Asia/Ho_Chi_Minh'), 'thieu ENV TZ');
    const RENDER = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
    assert.ok(RENDER.includes('Asia/Ho_Chi_Minh'), 'render.yaml thieu TZ');
  });

  it('3. May chu UTC + ENV TZ (mo phong Render sau fix) ra gio VN dung', () => {
    // ENV truyen truoc khi node start (Dockerfile ENV / render.yaml) moi co tac dung
    // cross-platform. Gan process.env.TZ trong runtime khong tin cay tren Windows.
    const script = `
      const s = new Date().toLocaleString('en-US', {timeZone:'Asia/Ho_Chi_Minh'});
      const vn = new Date(s);
      const wall = new Date(Date.now() + 7*3600*1000);
      const dh = Math.abs(vn.getHours() - wall.getUTCHours());
      const dm = Math.abs(vn.getMinutes() - wall.getUTCMinutes());
      const sameHM = (dh === 0 && dm <= 1) || (dh === 1 && dm >= 59) || (dh === 23 && dm >= 59);
      const fmt = vn.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'});
      console.log(JSON.stringify({sameHM, fmt, wall: wall.toISOString()}));
    `;
    const out = execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, TZ: 'Asia/Ho_Chi_Minh' }, encoding: 'utf8', timeout: 30000
    });
    const r = JSON.parse(out.trim());
    assert.ok(r.sameHM, 'gio VN lech: ' + out);
    // fmt "HH:MM" phai trung gio VN that (sai so 1 phut qua cham)
    const [fh, fm] = r.fmt.split(':').map(Number);
    const [wh, wm] = r.wall.slice(11, 16).split(':').map(Number);
    const diff = Math.abs((fh * 60 + fm) - (wh * 60 + wm));
    assert.ok(diff <= 1 || diff >= 1439, 'format phai ra gio VN: ' + out);
  });
});
