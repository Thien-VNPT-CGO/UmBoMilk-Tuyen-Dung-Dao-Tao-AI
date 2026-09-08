// scripts/ci-test.js - Chạy test suite trong môi trường cách ly (CI/local)
// 1. Khởi động server với NODE_ENV=test + DISABLE_OUTBOUND_SYNC=true
//    -> rate limit được bỏ qua, KHÔNG đẩy dữ liệu test ra Google Sheet production
// 2. Đợi /health sẵn sàng
// 3. Chạy toàn bộ test/*.test.js + test/verify_force_logout.js
// 4. Tắt server, thoát với exit code tương ứng
// Chạy: npm run test:ci
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || '3000';
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForHealth(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch (e) { /* chưa sẵn sàng */ }
    await sleep(1000);
  }
  return false;
}

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...extraEnv }
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => { console.error('[CI-TEST]', err.message); resolve(1); });
  });
}

(async () => {
  console.log('[CI-TEST] Khởi động server ở chế độ test (NODE_ENV=test, DISABLE_OUTBOUND_SYNC=true)...');
  const server = spawn('node', ['server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DISABLE_OUTBOUND_SYNC: 'true',
      PORT
    }
  });
  server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));
  server.on('error', (err) => { console.error('[CI-TEST] Không khởi động được server:', err.message); process.exit(1); });

  const ready = await waitForHealth();
  if (!ready) {
    console.error('[CI-TEST] Server không sẵn sàng sau 90s — hủy.');
    server.kill();
    process.exit(1);
  }
  console.log('[CI-TEST] Server sẵn sàng. Chạy test suite...');

  const testFiles = fs.readdirSync(path.join(ROOT, 'test'))
    .filter(f => f.endsWith('.test.js'))
    .map(f => path.join('test', f));

  let code = await run('node', ['--test', '--test-concurrency=1', ...testFiles]);
  if (code === 0) {
    console.log('[CI-TEST] Chạy verify_force_logout.js...');
    code = await run('node', [path.join('test', 'verify_force_logout.js')]);
  }

  server.kill();
  await sleep(1000);
  // Đảm bảo không còn tiến trình node con nào giữ port (Windows)
  if (server.exitCode === null) { try { server.kill('SIGKILL'); } catch (e) { /* bỏ qua */ } }

  console.log(code === 0 ? '[CI-TEST] TẤT CẢ PASS ✅' : '[CI-TEST] CÓ LỖI ❌');
  process.exit(code);
})().catch((e) => { console.error('[CI-TEST]', e); process.exit(1); });
