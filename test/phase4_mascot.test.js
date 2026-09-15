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

  it('4. admin.html and employee.html include mascot.js script tag', () => {
    const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    const empHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'employee.html'), 'utf8');
    assert.strictEqual(adminHtml.includes('/js/mascot.js'), true);
    assert.strictEqual(empHtml.includes('/js/mascot.js'), true);
  });
});
