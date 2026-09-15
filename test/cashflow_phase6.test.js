const test = require('node:test');
const assert = require('node:assert');

const BASE_URL = 'http://127.0.0.1:3000';

test('Phase 6: Finance Portal Dual Login & Cashflow 4 Tabs', async (t) => {
  let adminToken = '';
  const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Master@@2027' })
  });
  const adminData = await adminRes.json();
  adminToken = adminData.token;
  assert.ok(adminToken, 'Đăng nhập admin');

  let keyL1 = '', keyL2 = '', keyL3 = '';

  await t.test('Admin grant cashflow keys for 3 emails', async () => {
    const r1 = await fetch(`${BASE_URL}/api/cashflow-keys/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ email: 'thehung.170291@gmail.com', duration: '24h' })
    });
    const d1 = await r1.json();
    assert.ok(d1.key, 'Key L1');
    keyL1 = d1.key;

    const r2 = await fetch(`${BASE_URL}/api/cashflow-keys/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ email: 'thaovo2604@gmail.com', duration: '7d' })
    });
    const d2 = await r2.json();
    assert.ok(d2.key, 'Key L2');
    keyL2 = d2.key;

    const r3 = await fetch(`${BASE_URL}/api/cashflow-keys/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ email: 'umbomilk@gmail.com', duration: '30d' })
    });
    const d3 = await r3.json();
    assert.ok(d3.key, 'Key L3');
    keyL3 = d3.key;
  });

  let tokenL1 = '', tokenL2 = '', tokenL3 = '';

  await t.test('Cashflow login with email + cashflow key', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/cashflow-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'thehung.170291@gmail.com', key: keyL1 })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    tokenL1 = data.token;
    assert.strictEqual(data.key.level, 1);

    const r2 = await fetch(`${BASE_URL}/api/auth/cashflow-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'thaovo2604@gmail.com', key: keyL2 })
    });
    tokenL2 = (await r2.json()).token;

    const r3 = await fetch(`${BASE_URL}/api/auth/cashflow-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'umbomilk@gmail.com', key: keyL3 })
    });
    tokenL3 = (await r3.json()).token;
  });

  await t.test('Gom Quỹ 8 TK into master account', async () => {
    const masterRes = await fetch(`${BASE_URL}/api/cashflow/fund-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL3}` },
      body: JSON.stringify({ name: 'TK Quỹ Tổng Test', type: 'MASTER', balance: 10000000 })
    });
    const masterAcc = await masterRes.json();

    const addRes = await fetch(`${BASE_URL}/api/cashflow/fund-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL3}` },
      body: JSON.stringify({ name: 'TK Cửa Hàng CN1 Test', type: 'STORE', balance: 5000000, branch: 'CN1' })
    });
    assert.strictEqual(addRes.status, 200);
    const acc = await addRes.json();

    const colRes = await fetch(`${BASE_URL}/api/cashflow/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL3}` },
      body: JSON.stringify({ accountId: acc.id, amount: 2000000 })
    });
    assert.strictEqual(colRes.status, 200);
    const colData = await colRes.json();
    assert.strictEqual(colData.account.balance, 3000000);
    assert.ok(colData.master.balance >= 12000000);
  });

  let expSmallId = '', expMedId = '';

  await t.test('Duyệt Chi multi-level approval & anti-double payout 48h hash lock', async () => {
    const req1 = await fetch(`${BASE_URL}/api/cashflow/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL1}` },
      body: JSON.stringify({ amount: 1500000, recipient: `NCC Sữa ${Date.now()}`, content: 'Tiền sữa tươi', date: '2026-09-15', branch: 'CN1' })
    });
    assert.strictEqual(req1.status, 200);
    const d1 = await req1.json();
    expSmallId = d1.id;
    assert.deepStrictEqual(d1.requiredLevels, [1]);

    const dupReq = await fetch(`${BASE_URL}/api/cashflow/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL1}` },
      body: JSON.stringify({ amount: d1.amount, recipient: d1.recipient, content: d1.content, date: d1.date, branch: d1.branch })
    });
    assert.strictEqual(dupReq.status, 409);

    const req2 = await fetch(`${BASE_URL}/api/cashflow/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL1}` },
      body: JSON.stringify({ amount: 5000000, recipient: `Chủ nhà CN2 ${Date.now()}`, content: 'Tiền nhà tháng 9', date: '2026-09-15', branch: 'CN2' })
    });
    expMedId = (await req2.json()).id;

    const app1 = await fetch(`${BASE_URL}/api/cashflow/expenses/${expSmallId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenL1}` }
    });
    assert.strictEqual(app1.status, 200);
    assert.strictEqual((await app1.json()).status, 'APPROVED');

    const app2_l1 = await fetch(`${BASE_URL}/api/cashflow/expenses/${expMedId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenL1}` }
    });
    assert.strictEqual((await app2_l1.json()).status, 'PENDING');

    const app2_l2 = await fetch(`${BASE_URL}/api/cashflow/expenses/${expMedId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenL2}` }
    });
    assert.strictEqual((await app2_l2.json()).status, 'APPROVED');
  });

  await t.test('Lịch Chi Cố Định & Báo Động Số Dư & Báo Cáo Dòng Tiền', async () => {
    const billRes = await fetch(`${BASE_URL}/api/cashflow/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL3}` },
      body: JSON.stringify({ name: 'Tiền điện CN3', amount: 3000000, nextDue: '2026-09-16', branch: 'CN3' })
    });
    assert.strictEqual(billRes.status, 200);

    const dashRes = await fetch(`${BASE_URL}/api/cashflow/dashboard`, {
      headers: { 'Authorization': `Bearer ${tokenL3}` }
    });
    assert.strictEqual(dashRes.status, 200);
    const dash = await dashRes.json();
    assert.ok(dash.due.length > 0);
  });
});
