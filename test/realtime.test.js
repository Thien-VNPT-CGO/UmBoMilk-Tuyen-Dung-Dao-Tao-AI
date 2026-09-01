const { describe, it, before } = require('node:test');
const assert = require('node:assert');

// Realtime & Automation sanity - chạy khi server đang bật tại 3000
const BASE = process.env.TEST_BASE || 'http://localhost:3000';

async function login(username, password){
  const r = await fetch(`${BASE}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, password})});
  return r.json();
}

describe('Ụm Bò Milk - Realtime & Automation', ()=>{
  let adminToken, managerToken;
  before(async ()=>{
    const a = await login('admin','admin123');
    adminToken = a.token;
    const m = await login('manager','manager123');
    managerToken = m.token;
    assert.ok(adminToken);
    assert.ok(managerToken);
  });
  it('health realtime', async ()=>{
    const r = await fetch(`${BASE}/health`);
    const j = await r.json();
    assert.equal(j.status,'ok');
    assert.ok(j.employees >=0);
  });
  it('branchScope realtime filter', async ()=>{
    const r1 = await fetch(`${BASE}/api/employees`, {headers:{Authorization:`Bearer ${adminToken}`}});
    const adminEmps = await r1.json();
    const r2 = await fetch(`${BASE}/api/employees`, {headers:{Authorization:`Bearer ${managerToken}`}});
    const mgrEmps = await r2.json();
    // manager chỉ thấy CN2
    const adminCount = Array.isArray(adminEmps) ? adminEmps.length : adminEmps.total;
    const mgrCount = Array.isArray(mgrEmps) ? mgrEmps.length : mgrEmps.total;
    assert.ok(adminCount >= mgrCount);
    if(Array.isArray(mgrEmps)) assert.ok(mgrEmps.every(e=>e.branchId==='CN2'));
  });
  it('settings masked - no leak', async ()=>{
    const r = await fetch(`${BASE}/api/settings`, {headers:{Authorization:`Bearer ${adminToken}`}});
    const j = await r.json();
    assert.ok(j.settings);
    assert.ok(!j.settings.googleSheet.privateKey.includes('BEGIN PRIVATE KEY'));
    assert.ok(j.settings.googleSheet.privateKey.includes('•'));
  });
  it('sync status realtime', async ()=>{
    const r = await fetch(`${BASE}/api/sync/status`, {headers:{Authorization:`Bearer ${adminToken}`}});
    const j = await r.json();
    assert.ok('pending' in j);
  });
  it('drive realtime folder', async ()=>{
    const r = await fetch(`${BASE}/api/drive/files`, {headers:{Authorization:`Bearer ${adminToken}`}});
    assert.equal(r.status,200);
  });
});
