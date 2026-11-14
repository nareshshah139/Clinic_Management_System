const path = require('node:path');
const { execFileSync } = require('node:child_process');
const WT = '/home/user/wt/visit';
const { chromium } = require(require.resolve('playwright', { paths: [WT] }));
const { bootStack } = require(path.join(WT, 'scripts/stack/boot.cjs'));
(async () => {
  const stack = await bootStack({ label: 'visit-fix-diag' });
  try {
    console.log(execFileSync('node', ['-r', path.join(__dirname, 'nosandbox.cjs'), path.join(WT, 'scripts/diagnostics/clinic-ux-browser.cjs')], {
      env: { ...process.env, CLINIC_URL: stack.base, CHROME_PATH: chromium.executablePath() }, encoding: 'utf8', timeout: 900000 }));
  } catch (e) { console.log('diagnostics FAILED\n' + (e.stdout || '') + (e.stderr || e.message)); }
  finally { await stack.stop(); }
})();
