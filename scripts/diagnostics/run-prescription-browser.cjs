const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const url = process.env.RX_FRONTEND_URL || 'http://localhost:3000';
let frontend;
async function ready() {
  try { return (await fetch(url + '/login', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}
(async () => {
  if (!await ready()) {
    if (process.env.RX_FRONTEND_URL) throw new Error('Start the frontend at RX_FRONTEND_URL before testing');
    frontend = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--port', '3000'], { cwd: path.join(root, 'frontend'), stdio: 'inherit' });
    const deadline = Date.now() + 90000;
    while (!await ready()) {
      if (frontend.exitCode !== null || Date.now() > deadline) throw new Error('Frontend did not start');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  const code = await new Promise((resolve, reject) => {
    const tests = spawn('npm', ['run', 'test:prescription-pipeline'], { cwd: root, env: { ...process.env, RX_BROWSER_TEST: '1', RX_FRONTEND_URL: url }, stdio: 'inherit' });
    tests.on('error', reject);
    tests.on('exit', resolve);
  });
  process.exitCode = code === 0 ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { frontend?.kill('SIGTERM'); });
