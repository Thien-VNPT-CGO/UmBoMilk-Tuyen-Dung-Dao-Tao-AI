const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Phase 3 check-in/out camera upgrade', () => {
  it('auto lock/window', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(src.includes('attendanceCameraState'));
    assert.ok(src.includes('start-30'));
    const SHIFT = { CA_SANG:{start:420,end:720} };
    function state(scheds, now){
      const y=now.getFullYear(), mo=String(now.getMonth()+1).padStart(2,'0'), da=String(now.getDate()).padStart(2,'0');
      const date=`${y}-${mo}-${da}`;
      const minute=now.getHours()*60+now.getMinutes();
      const days=(scheds||[]).flatMap(s=>s.days||[]);
      const today=days.find(d=>d.date===date);
      const shifts=[];
      if(today && ['WORKING','SUBSTITUTE','WORKING_DOUBLE'].includes(today.status)) [today.shift,...(today.shifts||[])].forEach(s=>{ if(s&&s!=='OFF'&&!shifts.includes(s)) shifts.push(s); });
      const active=shifts.find(s=>SHIFT[s] && minute>=SHIFT[s].start-30 && minute<=SHIFT[s].end);
      if(active) return {open:true};
      return {open:false};
    }
    const toVN=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const sched=[{days:[{date:toVN(new Date()), status:'WORKING', shift:'CA_SANG'}]}];
    const off=[{days:[{date:toVN(new Date()), status:'OFF', shift:'OFF'}]}];
    const start=new Date(); start.setHours(7,0,0,0);
    const before=new Date(); before.setHours(6,29,0,0);
    const edge=new Date(); edge.setHours(6,30,0,0);
    const end=new Date(); end.setHours(12,0,0,0);
    const after=new Date(); after.setHours(12,1,0,0);
    assert.equal(state(sched, edge).open, true);
    assert.equal(state(sched, before).open, false);
    assert.equal(state(sched, end).open, true);
    assert.equal(state(sched, after).open, false);
    assert.equal(state(off, start).open, false);
    assert.equal(state([], start).open, false);
  });
  it('unmirror front capture', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(!src.includes('scale(-1,1)'), 'anh luu khong duoc lat canvas');
    assert.ok(!src.includes('translate(canvas.width'), 'anh luu khong duoc lat canvas');
    assert.ok(src.includes('mirrorPreview'), 'preview phai co ham mirror rieng');
    assert.ok(src.includes('scaleX(-1)'), 'preview cam truoc mirror CSS dung chuan selfie');
  });
  it('retake gate/static guard', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(src.includes('qualityCheckin'));
    assert.ok(src.includes('qualityCheckout'));
    assert.ok(src.includes('uniform') && src.includes('badge'));
    assert.ok(src.includes('Chất lượng ảnh chưa đạt'));
  });
  it('static guard no manual Bat camera and preserved APIs', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'employee.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'employee.js'), 'utf8');
    assert.ok(!html.includes('Bật camera'), 'manual Bật camera must be removed');
    assert.ok(html.includes('uniformCheckin') && html.includes('badgeCheckin'));
    assert.ok(js.includes('/api/attendance/checkin'));
    assert.ok(js.includes('/api/attendance/checkout'));
    assert.ok(js.includes('startCamera') && js.includes('flipCamera'));
    assert.ok(js.includes('getGPS'));
  });
});
