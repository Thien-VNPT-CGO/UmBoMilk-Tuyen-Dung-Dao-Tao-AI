const fs = require('fs');
const path = require('path');

console.log('=== APPLYING ALL PATCHES TO CODEBASE ===\n');

function patchFile(filePath, patches) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  console.log(`Patching ${filePath}...`);
  
  patches.forEach((p, idx) => {
    const { target, replacement, desc } = p;
    if (!content.includes(target)) {
      console.error(`❌ [${filePath}] Patch ${idx + 1} FAILED: Target not found! (${desc})`);
      process.exit(1);
    }
    const count = content.split(target).length - 1;
    if (count > 1) {
      console.error(`❌ [${filePath}] Patch ${idx + 1} FAILED: Multiple occurrences (${count}) found! (${desc})`);
      process.exit(1);
    }
    content = content.replace(target, replacement);
    console.log(`  ✔ Patch ${idx + 1} applied: ${desc}`);
  });
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✔ Saved ${filePath} successfully.\n`);
}

// 1. PATCH admin.js
patchFile('public/js/admin.js', [
  {
    desc: 'Add hr:action socket listener',
    target: `  // Listen for realtime AUTO-PASS event from server poller
  socket.on('interview:auto_pass', (data)=>{
    showToast(\`🎉 [AUTO-PASS REALTIME] Ứng viên "\${data.applicantName}" đã tự động PASS phỏng vấn (Hết giờ Google Meet \${data.timeSlot})\`, 'success');
    safeCall(loadApplicants());
    safeCall(loadInterviews());
  });
}`,
    replacement: `  // Listen for realtime AUTO-PASS event from server poller
  socket.on('interview:auto_pass', (data)=>{
    showToast(\`🎉 [AUTO-PASS REALTIME] Ứng viên "\${data.applicantName}" đã tự động PASS phỏng vấn (Hết giờ Google Meet \${data.timeSlot})\`, 'success');
    safeCall(loadApplicants());
    safeCall(loadInterviews());
  });

  // Yêu cầu #10: Realtime HR action toast & banner
  socket.on('hr:action', (data)=>{
    if(data && data.action){
      hrToast(data.action, true, data.actor ? \`bởi \${data.actor}\` : '');
    }
  });
}`
  },
  {
    desc: 'Define hrToast helper',
    target: `function closeModal(){
  document.getElementById('modal').classList.add('hidden');
}
function showToast(msg, type='success'){`,
    replacement: `function closeModal(){
  document.getElementById('modal').classList.add('hidden');
}
function hrToast(action, success=true, details=''){
  const type = success ? 'success' : 'error';
  const prefix = success ? '⚡ HR Realtime:' : '✖ Lỗi thao tác:';
  showToast(\`\${prefix} \${action}\${details ? \` (\${details})\` : ''}\`, type);
}
function showToast(msg, type='success'){`
  },
  {
    desc: 'Safe guard reportMonth in loadReportAll',
    target: `async function loadReportAll(){
  const m=document.getElementById('reportMonth')?.value || getVietnamTodayStr().slice(0,7);
  if(!document.getElementById('reportMonth')?.value) document.getElementById('reportMonth').value=m;`,
    replacement: `async function loadReportAll(){
  const reportMonthEl = document.getElementById('reportMonth');
  const m = reportMonthEl?.value || getVietnamTodayStr().slice(0,7);
  if(reportMonthEl && !reportMonthEl.value) reportMonthEl.value = m;`
  },
  {
    desc: 'Safe guard anomalyCount and anomalyList in loadAnomalies',
    target: `    const list=await api(\`/api/attendance/anomalies?month=\${month}&branch=\${branch}\`);
    document.getElementById('anomalyCount').textContent=list.length+' lỗi';
    const el=document.getElementById('anomalyList');
    if(list.length===0) return el.innerHTML='<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center text-sm text-emerald-700">✔ Không có sai lệch - đủ điều kiện chốt</div>';`,
    replacement: `    const list=await api(\`/api/attendance/anomalies?month=\${month}&branch=\${branch}\`);
    const cntEl = document.getElementById('anomalyCount');
    if(cntEl) cntEl.textContent = list.length+' lỗi';
    const el=document.getElementById('anomalyList');
    if(!el) return;
    if(list.length===0) return el.innerHTML='<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center text-sm text-emerald-700">✔ Không có sai lệch - đủ điều kiện chốt</div>';`
  }
]);

// 2. PATCH employee.js
patchFile('public/js/employee.js', [
  {
    desc: 'Safe guard loadDevice elements',
    target: `// Device
async function loadDevice(){
  // key info
  try{
    // we stored empKey, but refresh via login? Instead show deviceId and empKey
    document.getElementById('deviceKeyInfo').innerHTML = \`<div>Key: <span class="font-black">\${empKey}</span></div><div>Device ID: <span class="font-bold">\${deviceId}</span></div><div class="text-[11px] text-slate-500">Employee: \${employee.employeeId} • \${employee.name}</div>\`;
    const history = await api('/api/device-requests', {headers:{Authorization:'Bearer '+token}}).catch(()=>[]);
    // Filter mine if possible? device-requests returns all if token not admin? Actually our endpoint doesn't filter by auth, returns all. So filter
    const mine = Array.isArray(history)? history.filter(r=>r.employeeId===employee.employeeId) : [];
    document.getElementById('deviceHistory').innerHTML = mine.map(r=>\`
      <div class="flex justify-between items-center bg-slate-50 border rounded-xl px-3 py-2">
        <div><div class="text-xs font-bold">\${r.reason}</div><div class="text-[11px] text-slate-500">\${fmtDMYTime(r.createdAt)}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full \${r.status==='PENDING'?'bg-pink-100 text-pink-700':r.status==='APPROVED'?'bg-pink-500 text-white':r.status==='EXPIRED'?'bg-slate-400 text-white':'bg-red-100 text-red-700'}">\${getStatusVi(r.status)}</span>
      </div>
    \`).join('') || '<div class="text-xs text-slate-400 text-center py-2">Chưa có yêu cầu</div>';
  }catch(e){}
}`,
    replacement: `// Device
async function loadDevice(){
  // key info
  try{
    const keyInfoEl = document.getElementById('deviceKeyInfo');
    if(keyInfoEl) keyInfoEl.innerHTML = \`<div>Key: <span class="font-black">\${empKey}</span></div><div>Device ID: <span class="font-bold">\${deviceId}</span></div><div class="text-[11px] text-slate-500">Employee: \${employee.employeeId} • \${employee.name}</div>\`;
    const history = await api('/api/device-requests', {headers:{Authorization:'Bearer '+token}}).catch(()=>[]);
    const mine = Array.isArray(history)? history.filter(r=>r.employeeId===employee.employeeId) : [];
    const histEl = document.getElementById('deviceHistory');
    if(histEl) histEl.innerHTML = mine.map(r=>\`
      <div class="flex justify-between items-center bg-slate-50 border rounded-xl px-3 py-2">
        <div><div class="text-xs font-bold">\${r.reason}</div><div class="text-[11px] text-slate-500">\${fmtDMYTime(r.createdAt)}</div></div>
        <span class="text-[11px] font-black px-2 py-1 rounded-full \${r.status==='PENDING'?'bg-pink-100 text-pink-700':r.status==='APPROVED'?'bg-pink-500 text-white':r.status==='EXPIRED'?'bg-slate-400 text-white':'bg-red-100 text-red-700'}">\${getStatusVi(r.status)}</span>
      </div>
    \`).join('') || '<div class="text-xs text-slate-400 text-center py-2">Chưa có yêu cầu</div>';
  }catch(e){}
}`
  },
  {
    desc: 'Restore emergency tab in getVisibleNav',
    target: `  } else {
    // Official: ẩn elearning + notifs + OFF đột xuất (đã bỏ), chỉ hiện đổi ca + OFF theo window
    const offOpen = isOffWindowOpen();
    return NAV.filter(n => {
      if(!baseFilter(n)) return false;
      if(n.id === 'elearning') return false;
      if(n.id === 'emergency') return false; // Bỏ OFF đột xuất cho chính thức
      if(n.id === 'off') return offOpen; // chỉ hiện trong T6 12:00 - T7 15:00
      if(n.id === 'shiftSwap') return true; // Đổi ca luôn hiện cho chính thức
      return true;
    });
  }`,
    replacement: `  } else {
    // Official: ẩn elearning + notifs, hiện đổi ca + OFF đột xuất + OFF theo window
    const offOpen = isOffWindowOpen();
    return NAV.filter(n => {
      if(!baseFilter(n)) return false;
      if(n.id === 'elearning') return false;
      if(n.id === 'emergency') return true; // Mở OFF đột xuất cho chính thức theo Spec 19
      if(n.id === 'off') return offOpen; // chỉ hiện trong T6 12:00 - T7 15:00
      if(n.id === 'shiftSwap') return true; // Đổi ca luôn hiện cho chính thức
      return true;
    });
  }`
  },
  {
    desc: 'Restore emergency tab check in isTabAccessible',
    target: `  const isOfficial = employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL';
  if(TRAINING_HIDDEN_TABS.includes(id) && !isOfficial) return false;
  if(isOfficial && id === 'emergency') return false; // Bỏ OFF đột xuất cho chính thức
  if(isOfficial && id === 'off' && !isOffWindowOpen()) return false;`,
    replacement: `  const isOfficial = employee.status === 'OFFICIAL' || employee.type === 'OFFICIAL';
  if(TRAINING_HIDDEN_TABS.includes(id) && !isOfficial) return false;
  if(isOfficial && id === 'emergency') return true; // Mở OFF đột xuất cho chính thức theo Spec 19
  if(isOfficial && id === 'off' && !isOffWindowOpen()) return false;`
  },
  {
    desc: 'Remove block toast on emergency in switchTab',
    target: `  // Bỏ OFF đột xuất cho chính thức
  if(isOfficial && id === 'emergency'){
    showToast('Chức năng OFF đột xuất đã tắt, vui lòng dùng Đổi ca 🔒','info');
    return;
  }`,
    replacement: `  // OFF đột xuất dành cho nhân viên chính thức (Spec 19)`
  }
]);

// 3. PATCH server.js
patchFile('server.js', [
  {
    desc: 'Fix inverted image pruning (slice 0, 50 instead of -50)',
    target: `    try{
      const stats = fs.statSync(DATA_FILE);
      if(stats.size > 5*1024*1024){
        console.warn('[DB] db.json >5MB, pruning oldest attendance images');
        db.attendances.slice(-50).forEach(a=>{ if(a.checkIn?.image && a.checkIn.image.length>50000) a.checkIn.image='[pruned]'; if(a.checkOut?.image && a.checkOut.image.length>50000) a.checkOut.image='[pruned]'; });
      }
    }catch(e){}`,
    replacement: `    try{
      const stats = fs.statSync(DATA_FILE);
      if(stats.size > 5*1024*1024){
        console.warn('[DB] db.json >5MB, pruning oldest attendance images');
        db.attendances.slice(0, 50).forEach(a=>{ if(a.checkIn?.image && a.checkIn.image.length>50000) a.checkIn.image='[pruned]'; if(a.checkOut?.image && a.checkOut.image.length>50000) a.checkOut.image='[pruned]'; });
      }
    }catch(e){}`
  },
  {
    desc: 'Fix typo nhon vion -> nhan vien',
    target: `  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhôn viôn'});`,
    replacement: `  const emp = db.employees.find(e=>e.employeeId===employeeId);
  if(!emp) return res.status(404).json({error:'Không tìm thấy nhân viên'});`
  },
  {
    desc: 'Add Key column to SHEET_DEFINITIONS for TRAINING and OFFICIAL',
    target: `  // Nhân viên cửa hàng - thêm cột Key (yêu cầu #9) – Key đi theo NV đến khi nghỉ
  NHAN_VIEN_TRAINING: { sheetName: 'NHAN_VIEN_TRAINING', headers: ['ID','Mã NV','Họ tên','SĐT','Khóa','Chi nhánh','Ca','Ngày bắt đầu','Ngày kết thúc','Số ngày Thử việc','Trạng thái','Điểm TEST','Kết quả TEST','Loại','Nhóm','Phiên bản','Cập nhật lúc','Đồng bộ'] },
  NHAN_VIEN_CHINH_THUC: { sheetName: 'NHAN_VIEN_CHINH_THUC', headers: ['ID','Mã NV','Họ tên','SĐT','Khóa','Chi nhánh','Ca','Ngày bắt đầu','Trạng thái','Điểm TEST','Loại','Ngày chính thức','Phiên bản','Cập nhật lúc','Đồng bộ'] },`,
    replacement: `  // Nhân viên cửa hàng - thêm cột Key (yêu cầu #9) – Key đi theo NV đến khi nghỉ
  NHAN_VIEN_TRAINING: { sheetName: 'NHAN_VIEN_TRAINING', headers: ['ID','Mã NV','Họ tên','SĐT','Key','Chi nhánh','Ca','Ngày bắt đầu','Ngày kết thúc','Số ngày Thử việc','Trạng thái','Điểm TEST','Kết quả TEST','Loại','Nhóm','Phiên bản','Cập nhật lúc','Đồng bộ'] },
  NHAN_VIEN_CHINH_THUC: { sheetName: 'NHAN_VIEN_CHINH_THUC', headers: ['ID','Mã NV','Họ tên','SĐT','Key','Chi nhánh','Ca','Ngày bắt đầu','Trạng thái','Điểm TEST','Loại','Ngày chính thức','Phiên bản','Cập nhật lúc','Đồng bộ'] },`
  },
  {
    desc: 'Fix spreadsheet ID in /api/admin/sync-from-sheet and emit hr:action',
    target: `  const cleanId = String(employeeId).trim();
  // Nếu đã tồn tại local thì không cần sync
  if(db.employees.find(e=>e.employeeId===cleanId)) return res.status(409).json({error:\`Mã NV \${cleanId} đã tồn tại trong Web App, không cần đồng bộ\`});
  const targetId = db.settings?.googleSheet?.targetDatabaseSpreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';`,
    replacement: `  const cleanId = String(employeeId).trim();
  // Nếu đã tồn tại local thì không cần sync
  if(db.employees.find(e=>e.employeeId===cleanId)) return res.status(409).json({error:\`Mã NV \${cleanId} đã tồn tại trong Web App, không cần đồng bộ\`});
  const targetId = db.settings?.googleSheet?.spreadsheetId || '17iXM0zc1m17aX9AZrFMjOkPRMy2_CwWfjTRZSUPQF2w';`
  },
  {
    desc: 'Add hr:action emit on sync-from-sheet complete',
    target: `    io.emit('employees:update', db.employees);
    io.emit('keys:update', db.keys);
    res.json({ success:true, employee: emp, key: finalKey, sheet: foundSheet });
  }catch(e){`,
    replacement: `    io.emit('employees:update', db.employees);
    io.emit('keys:update', db.keys);
    io.emit('hr:action', { actor: req.user.username, action: \`Khôi phục NV \${cleanId} (\${emp.name}) từ Google Sheet\`, target: cleanId, timestamp: getVietnamISOString() });
    res.json({ success:true, employee: emp, key: finalKey, sheet: foundSheet });
  }catch(e){`
  },
  {
    desc: 'Add hr:action emit on employee create',
    target: `  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  res.json({ employee: emp, key });
});
// Bulk import Official employees`,
    replacement: `  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  io.emit('hr:action', { actor: req.user.username, action: \`Tạo nhân viên \${emp.name} (\${emp.employeeId})\`, target: emp.employeeId, timestamp: getVietnamISOString() });
  res.json({ employee: emp, key });
});
// Bulk import Official employees`
  },
  {
    desc: 'Add hr:action emit on employee delete',
    target: `  if(hard){
    // Hard delete: cascade toàn bộ tabs`,
    replacement: `  io.emit('hr:action', { actor: req.user.username, action: \`Xóa nhân viên \${emp.name} (\${emp.employeeId})\`, target: emp.employeeId, timestamp: getVietnamISOString() });
  if(hard){
    // Hard delete: cascade toàn bộ tabs`
  },
  {
    desc: 'Add hr:action emit on applicant convert',
    target: `  io.emit('applicants:update', db.applicants);
  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  res.json({ success:true, applicant: appRec, employee: emp, key });
});`,
    replacement: `  io.emit('applicants:update', db.applicants);
  io.emit('employees:update', db.employees);
  io.emit('keys:update', db.keys);
  io.emit('hr:action', { actor: req.user.username, action: \`Tiếp nhận \${appRec.name} vào Training (\${emp.employeeId})\`, target: emp.employeeId, timestamp: getVietnamISOString() });
  res.json({ success:true, applicant: appRec, employee: emp, key });
});`
  },
  {
    desc: 'Add hr:action emit on schedule coordinate',
    target: `  const out = coordinateBranchShifts(weekStart, req.user.username);
  res.json({ success:true, ...out });`,
    replacement: `  const out = coordinateBranchShifts(weekStart, req.user.username);
  io.emit('hr:action', { actor: req.user.username, action: \`AI cân lịch tuần \${weekStart}: đã cân bằng \${out.resolved.length} ca\`, target: weekStart, timestamp: getVietnamISOString() });
  res.json({ success:true, ...out });`
  },
  {
    desc: 'Add schedule OFF guard to checkin',
    target: `  let record = db.attendances.find(a=>a.employeeId===employeeId && a.date===today);
  if(record && record.checkIn) return res.status(400).json({error:'Đã Check-in hôm nay'});`,
    replacement: `  // Schedule Guard: kiểm tra nếu hôm nay nhân viên có lịch OFF
  const mySched = db.schedules.find(s=>s.employeeId===employeeId);
  const todayDay = mySched?.days?.find(d=>d.date===today);
  if(todayDay && (todayDay.status==='OFF' || todayDay.shift==='OFF')){
    return res.status(400).json({error:\`Hôm nay (\${today.split('-').reverse().join('/')}) bạn có lịch nghỉ OFF theo lịch làm việc. Không thể Check-in. Nếu bạn đi làm thay ca, vui lòng liên hệ HR/Quản lý.\`});
  }

  let record = db.attendances.find(a=>a.employeeId===employeeId && a.date===today);
  if(record && record.checkIn) return res.status(400).json({error:'Đã Check-in hôm nay'});`
  }
]);

// 4. PATCH google-apps-script.gs
patchFile('scripts/google-apps-script.gs', [
  {
    desc: 'Add Key to NHAN_VIEN_TRAINING and NHAN_VIEN_CHINH_THUC headers and format',
    target: `    case 'NHAN_VIEN_TRAINING':
    case 'NHAN_VIEN_CHINH_THUC':
      return ['Mã NV', 'Họ tên', 'SĐT', 'Chi nhánh', 'Ca mặc định', 'Trạng thái', 'Ngày vào làm', 'Thời gian cập nhật'];`,
    replacement: `    case 'NHAN_VIEN_TRAINING':
      return ['ID','Mã NV','Họ tên','SĐT','Key','Chi nhánh','Ca','Ngày bắt đầu','Ngày kết thúc','Số ngày Thử việc','Trạng thái','Điểm TEST','Kết quả TEST','Loại','Nhóm','Phiên bản','Cập nhật lúc','Đồng bộ'];
    case 'NHAN_VIEN_CHINH_THUC':
      return ['ID','Mã NV','Họ tên','SĐT','Key','Chi nhánh','Ca','Ngày bắt đầu','Trạng thái','Điểm TEST','Loại','Ngày chính thức','Phiên bản','Cập nhật lúc','Đồng bộ'];`
  },
  {
    desc: 'Update formatPayloadToRow for NHAN_VIEN_TRAINING and NHAN_VIEN_CHINH_THUC',
    target: `    case 'NHAN_VIEN_TRAINING':
    case 'NHAN_VIEN_CHINH_THUC':
      return [payload.employeeId || payload.id || '', payload.name || '', payload.phone || '', payload.branchId || '', payload.shift || '', payload.status || '', payload.startDate || now, now];`,
    replacement: `    case 'NHAN_VIEN_TRAINING':
      return [payload.id || '', payload.employeeId || '', payload.name || '', payload.phone || '', payload.key || '', payload.branchId || '', payload.shift || '', payload.startDate || '', payload.endDate || '', payload.trainingDays || 7, payload.status || 'TRAINING', payload.testScore || '', payload.testResult || '', payload.type || 'TRAINING', payload.category || 'STORE', payload.version || 1, payload.updated_at || now, payload.sync_status || 'SYNCED'];
    case 'NHAN_VIEN_CHINH_THUC':
      return [payload.id || '', payload.employeeId || '', payload.name || '', payload.phone || '', payload.key || '', payload.branchId || '', payload.shift || '', payload.startDate || '', payload.status || 'OFFICIAL', payload.testScore || '', payload.type || 'OFFICIAL', payload.officialStartDate || '', payload.version || 1, payload.updated_at || now, payload.sync_status || 'SYNCED'];`
  }
]);

console.log('=== ALL PATCHES APPLIED SUCCESSFULLY! ===');
