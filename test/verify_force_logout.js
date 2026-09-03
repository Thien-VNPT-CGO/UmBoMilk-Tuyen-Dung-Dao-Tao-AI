const BASE = process.env.TEST_BASE || 'http://localhost:3000';
async function loginAdmin(){
  const r = await fetch(`${BASE}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'admin', password:'admin123'})});
  const j = await r.json();
  if(!j.token) throw new Error('admin login failed: '+JSON.stringify(j));
  return j.token;
}
async function fetchJSON(path, opts={}){
  const res = await fetch(BASE+path, opts);
  const data = await res.json().catch(()=>({}));
  return { res, data };
}
async function run(){
  console.log('=== Realtime ForceLogout Verification ===');
  const adminToken = await loginAdmin();
  console.log('✔ Admin login OK');

  // Tạo nhân viên mới
  const createRes = await fetchJSON('/api/employees', {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:'Bearer '+adminToken},
    body: JSON.stringify({ name:'Test ForceLogout', phone:'0909990001', branchId:'CN2', shift:'CA_SANG', category:'STORE'})
  });
  if(createRes.res.status!==200) throw new Error('Create employee failed: '+JSON.stringify(createRes.data));
  const emp = createRes.data.employee;
  const key = createRes.data.key;
  console.log(`✔ Created employee ${emp.employeeId} key=${key.key} status=${emp.status}`);

  // Employee login
  const empLogin = await fetchJSON('/api/auth/employee-login', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ employeeId: emp.employeeId, key: key.key, deviceId: 'test_device_123' })
  });
  if(empLogin.res.status!==200) throw new Error('Employee login failed: '+JSON.stringify(empLogin.data));
  const empToken = empLogin.data.token;
  console.log(`✔ Employee login OK token=${empToken.slice(0,12)}...`);

  // Verify /api/employee/me valid
  const me1 = await fetchJSON('/api/employee/me', { headers:{ Authorization:'Bearer '+empToken }});
  if(me1.res.status!==200 || !me1.data.valid) throw new Error('me valid failed: '+JSON.stringify(me1.data));
  console.log('✔ /api/employee/me VALID before delete');

  // --- TEST 1: Soft delete (ARCHIVED) ---
  const delSoft = await fetchJSON(`/api/employees/${emp.employeeId}`, { method:'DELETE', headers:{ Authorization:'Bearer '+adminToken }});
  if(delSoft.res.status!==200) throw new Error('soft delete failed '+JSON.stringify(delSoft.data));
  console.log('✔ Soft delete ARCHIVED OK', delSoft.data);

  const meAfterSoft = await fetchJSON('/api/employee/me', { headers:{ Authorization:'Bearer '+empToken }});
  console.log(`   /api/employee/me after soft delete: status=${meAfterSoft.res.status} forceLogout=${meAfterSoft.data.forceLogout} reason=${meAfterSoft.data.reason||meAfterSoft.data.error}`);
  if(meAfterSoft.res.status!==401 || !meAfterSoft.data.forceLogout) {
    console.error('❌ FAIL: Soft delete should cause 401 forceLogout');
    process.exit(1);
  }
  console.log('✅ TEST 1 PASSED: Soft delete => forceLogout true (HR xóa -> nhân viên bị thoát)');

  // Tạo nhân viên thứ 2 để test hard delete
  const create2 = await fetchJSON('/api/employees', {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:'Bearer '+adminToken},
    body: JSON.stringify({ name:'Test HardDelete', phone:'0909990002', branchId:'CN2', shift:'CA_CHIEU', category:'STORE'})
  });
  const emp2 = create2.data.employee;
  const key2 = create2.data.key;
  console.log(`\n✔ Created employee2 ${emp2.employeeId} key=${key2.key}`);

  const empLogin2 = await fetchJSON('/api/auth/employee-login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ employeeId: emp2.employeeId, key: key2.key, deviceId: 'test_device_456' })
  });
  const empToken2 = empLogin2.data.token;
  console.log('✔ Employee2 login OK');

  const me2Before = await fetchJSON('/api/employee/me', { headers:{ Authorization:'Bearer '+empToken2 }});
  console.log(`   /api/employee/me valid before hard delete: ${me2Before.res.status}`);

  // --- TEST 2: Hard delete ---
  const delHard = await fetchJSON(`/api/employees/${emp2.employeeId}?hard=true`, { method:'DELETE', headers:{ Authorization:'Bearer '+adminToken }});
  if(delHard.res.status!==200) throw new Error('hard delete failed '+JSON.stringify(delHard.data));
  console.log('✔ Hard delete OK', delHard.data);

  const meAfterHard = await fetchJSON('/api/employee/me', { headers:{ Authorization:'Bearer '+empToken2 }});
  console.log(`   /api/employee/me after hard delete: status=${meAfterHard.res.status} forceLogout=${meAfterHard.data.forceLogout} reason=${meAfterHard.data.reason||meAfterHard.data.error}`);
  if(meAfterHard.res.status!==401 || !meAfterHard.data.forceLogout) {
    console.error('❌ FAIL: Hard delete should cause 401 forceLogout');
    process.exit(1);
  }
  console.log('✅ TEST 2 PASSED: Hard delete => forceLogout true');

  // Tạo nhân viên thứ 3 để test PUT ARCHIVED
  const create3 = await fetchJSON('/api/employees', {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:'Bearer '+adminToken},
    body: JSON.stringify({ name:'Test PUT Archived', phone:'0909990003', branchId:'CN1', shift:'CA_TOI', category:'STORE'})
  });
  const emp3 = create3.data.employee;
  const key3 = create3.data.key;
  const empLogin3 = await fetchJSON('/api/auth/employee-login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ employeeId: emp3.employeeId, key: key3.key, deviceId: 'test_device_789' })
  });
  const empToken3 = empLogin3.data.token;
  console.log(`\n✔ Created employee3 ${emp3.employeeId}`);

  // PUT update status to ARCHIVED
  const putArchived = await fetchJSON(`/api/employees/${emp3.employeeId}`, {
    method:'PUT',
    headers:{'Content-Type':'application/json', Authorization:'Bearer '+adminToken},
    body: JSON.stringify({ status:'ARCHIVED' })
  });
  if(putArchived.res.status!==200) throw new Error('PUT archived failed '+JSON.stringify(putArchived.data));
  console.log('✔ PUT status ARCHIVED OK');

  const meAfterPut = await fetchJSON('/api/employee/me', { headers:{ Authorization:'Bearer '+empToken3 }});
  console.log(`   /api/employee/me after PUT ARCHIVED: status=${meAfterPut.res.status} forceLogout=${meAfterPut.data.forceLogout}`);
  if(meAfterPut.res.status!==401 || !meAfterPut.data.forceLogout) {
    console.error('❌ FAIL: PUT ARCHIVED should cause 401 forceLogout');
    process.exit(1);
  }
  console.log('✅ TEST 3 PASSED: PUT ARCHIVED => forceLogout true');

  // TEST 4: Token không tồn tại / DB không tồn tại nhân viên (giả lập xóa trực tiếp)
  const create4 = await fetchJSON('/api/employees', {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:'Bearer '+adminToken},
    body: JSON.stringify({ name:'Test NotExist', phone:'0909990004', branchId:'CN2', shift:'CA_SANG', category:'STORE'})
  });
  const emp4 = create4.data.employee;
  const key4 = create4.data.key;
  const empLogin4 = await fetchJSON('/api/auth/employee-login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ employeeId: emp4.employeeId, key: key4.key, deviceId: 'test_device_999' })
  });
  const empToken4 = empLogin4.data.token;
  console.log(`\n✔ Created employee4 ${emp4.employeeId}`);
  // hard delete để giả lập "HR xóa" sau đó token vẫn còn nhưng DB không tồn tại
  await fetchJSON(`/api/employees/${emp4.employeeId}?hard=true`, { method:'DELETE', headers:{ Authorization:'Bearer '+adminToken }});
  const meAfterNotExist = await fetchJSON('/api/employee/me', { headers:{ Authorization:'Bearer '+empToken4 }});
  console.log(`   /api/employee/me after not exist: status=${meAfterNotExist.res.status} forceLogout=${meAfterNotExist.data.forceLogout} error=${meAfterNotExist.data.error}`);
  if(meAfterNotExist.res.status!==401 || !meAfterNotExist.data.forceLogout) {
    console.error('❌ FAIL: Not exist should cause 401 forceLogout');
    process.exit(1);
  }
  console.log('✅ TEST 4 PASSED: DB không tồn tại nhân viên => forceLogout true');

  // TEST 5: Socket realtime (nếu có socket.io-client)
  try{
    const { io } = require('socket.io-client');
    console.log('\n--- TEST 5: Socket realtime forceLogout ---');
    const create5 = await fetchJSON('/api/employees', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+adminToken},
      body: JSON.stringify({ name:'Test Socket', phone:'0909990005', branchId:'CN2', shift:'CA_SANG', category:'STORE'})
    });
    const emp5 = create5.data.employee;
    const key5 = create5.data.key;
    const empLogin5 = await fetchJSON('/api/auth/employee-login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ employeeId: emp5.employeeId, key: key5.key, deviceId: 'test_device_socket' })
    });
    const empToken5 = empLogin5.data.token;
    console.log(`✔ Created employee5 ${emp5.employeeId} for socket test`);
    const socket = io(BASE, { auth:{ token: empToken5 }, transports:['websocket'] });
    let forceLogoutReceived = false;
    let receivedPayload = null;
    await new Promise((resolve, reject)=>{
      socket.on('connect', ()=>{ console.log('   socket connected', socket.id); resolve(); });
      socket.on('connect_error', reject);
      setTimeout(()=> reject(new Error('socket connect timeout')), 5000);
    });
    socket.on('employee:forceLogout', (data)=>{
      console.log('   ⚡ socket employee:forceLogout received', data);
      if(data.employeeId===emp5.employeeId) { forceLogoutReceived=true; receivedPayload=data; }
    });
    // Xóa nhân viên -> server sẽ emit forceLogout
    await new Promise(r=> setTimeout(r, 500));
    await fetchJSON(`/api/employees/${emp5.employeeId}`, { method:'DELETE', headers:{ Authorization:'Bearer '+adminToken }});
    console.log('   -> DELETE sent, waiting for socket event...');
    await new Promise(r=> setTimeout(r, 1500));
    if(forceLogoutReceived){
      console.log('✅ TEST 5 PASSED: Socket realtime forceLogout received ngay lập tức');
    } else {
      console.error('❌ FAIL: Socket forceLogout not received');
      console.log('   Note: broadcast fallback should still work, check server emits');
      process.exit(1);
    }
    socket.disconnect();
  }catch(e){
    if(e.code==='MODULE_NOT_FOUND'){
      console.log('\n⚠️ TEST 5 SKIPPED: socket.io-client not installed (npm i socket.io-client)');
    } else {
      console.error('TEST 5 error', e);
      process.exit(1);
    }
  }

  console.log('\n========== ALL TESTS PASSED ==========');
  console.log('Ràng buộc realtime: HR xóa/tồn tại false -> nhân viên bị thoát ngay (401 forceLogout + socket)');
}
run().catch(e=>{ console.error('Test failed', e); process.exit(1); });
