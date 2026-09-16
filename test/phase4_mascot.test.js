const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Phase 4: Mascot Bò Sữa & Voice Jingle Suite', () => {
  it('1. mascot.js exists and renders fixed bottom-right mascot DOM', () => {
    const mascotPath = path.join(__dirname, '..', 'public', 'js', 'mascot.js');
    assert.strictEqual(fs.existsSync(mascotPath), true);
    const content = fs.readFileSync(mascotPath, 'utf8');
    assert.strictEqual(content.includes('umb-mascot-container'), true);
    assert.strictEqual(content.includes('position:fixed;bottom:20px;right:20px'), true);
  });

  it('2. Customizable 5 voices (Nam, Nữ, Adam, Eva, Google) and persistence', () => {
    const mascotPath = path.join(__dirname, '..', 'public', 'js', 'mascot.js');
    const content = fs.readFileSync(mascotPath, 'utf8');
    ['Nam', 'Nữ', 'Adam', 'Eva', 'Google'].forEach(voice => {
      assert.strictEqual(content.includes(voice), true);
    });
    assert.strictEqual(content.includes('mascot_voice'), true);
    assert.strictEqual(content.includes('dblclick'), true);
  });

  it('3. Queue sequential speech without truncation and idle jingle auto-sing', () => {
    const mascotPath = path.join(__dirname, '..', 'public', 'js', 'mascot.js');
    const content = fs.readFileSync(mascotPath, 'utf8');
    assert.strictEqual(content.includes('speechQueue'), true);
    assert.strictEqual(content.includes('singJingle'), true);
    assert.strictEqual(content.includes('resetIdleTimer'), true);
    assert.strictEqual(content.includes('speechSynthesis'), true);
  });

  it('4c. Bo sua doc tho/truyen luc ranh + ton trong tat tieng', () => {
    const mascotPath = path.join(__dirname, '..', 'public', 'js', 'mascot.js');
    const content = fs.readFileSync(mascotPath, 'utf8');
    assert.strictEqual(content.includes('IDLE_LINES'), true);
    assert.strictEqual(content.includes('thanh trùng'), true);
    assert.strictEqual(content.includes('Louis Pasteur'), true);
    assert.strictEqual(content.includes('nextIdleLine'), true);
    assert.strictEqual(content.includes('window._ttsEnabled === false'), true);
    const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    assert.ok(adminJs.includes('if(!_umbAiAvatar){ try{ speakUmb(msg); }catch(e){} return; }'), 'admin phai doc TB dau tien khi avatar da go');
  });

  it('4b. Employee co the keo-tha bo sua (drag, nho vi tri)', () => {
    const mascotPath = path.join(__dirname, '..', 'public', 'js', 'mascot.js');
    const content = fs.readFileSync(mascotPath, 'utf8');
    assert.strictEqual(content.includes('mascot_pos'), true);
    assert.strictEqual(content.includes('pointerdown'), true);
    assert.strictEqual(content.includes('setPointerCapture'), true);
  });

  it('4. chi admin.html include mascot.js (employee da go bo sua)', () => {
    const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    const empHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'employee.html'), 'utf8');
    assert.strictEqual(adminHtml.includes('/js/mascot.js'), true);
    assert.strictEqual(empHtml.includes('/js/mascot.js'), false);
    assert.ok(empHtml.includes('function speakUmb') || fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8').includes('function speakUmb'), 'employee phai co TTS rieng');
  });
});
