const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const frontend = path.resolve(__dirname, '..');
const route = path.join(frontend, 'src/app/stock-recovery-qa');
const output = path.resolve(frontend, '../output/diagnostics/stock-recovery');
const port = 3105;
let server, browser, created = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const clickText = (page, text) => page.evaluate(label => {
  const button = Array.from(document.querySelectorAll('button')).find(node => node.textContent.trim() === label);
  if (!button || button.disabled) throw Error(`Unavailable action: ${label}`);
  button.click();
}, text);

/**
 * @cc [owner:nareshshah139,label:testing] stock-recovery-local-browser
 * This browser probe MUST use a synthetic localhost route and remove only the route it creates.
 */
async function run() {
  assert(!fs.existsSync(route), 'The synthetic route must not overwrite existing work');
  fs.mkdirSync(route, { recursive: true }); created = true;
  fs.mkdirSync(output, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'fixtures/stock-recovery-page.tsx'), path.join(route, 'page.tsx'));
  const fd = fs.openSync(path.join(output, 'next.log'), 'w');
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: frontend, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  let ready = false;
  for (let count = 0; count < 100; count++) {
    if (server.exitCode !== null) throw Error('Local Next server exited');
    try { if ((await fetch(`http://127.0.0.1:${port}/stock-recovery-qa`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await pause(500);
  }
  assert(ready, 'Local synthetic preview did not start');
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run', '--no-default-browser-check'] });
  const page = await browser.newPage();
  const evidence = [];
  for (const viewport of [{ width: 1280, height: 1100 }, { width: 390, height: 844 }]) {
    await page.setViewport(viewport);
    await page.goto(`http://127.0.0.1:${port}/stock-recovery-qa`, { waitUntil: 'networkidle0' });
    for (const [id, value] of [['a', '12'], ['b', '13']]) await page.type(`input[aria-label="Physical count for Synthetic stock ${id}"]`, value);
    await page.type('textarea[placeholder^="Reason required"]', 'Verified synthetic count');
    await clickText(page, 'Post corrections');
    await page.waitForFunction(() => document.body.innerText.includes('Retry corrections'));
    assert(await page.$$eval('input[aria-label^="Physical count"]', nodes => nodes.every(node => node.disabled)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await (await page.$('section:last-child')).screenshot({ path: path.join(output, `controls-${viewport.width}.png`) });
    await clickText(page, 'Retry corrections');
    await page.waitForFunction(() => !document.body.innerText.includes('Retry corrections'));
    assert(await page.$$eval('input[aria-label^="Physical count"]', nodes => nodes.every(node => !node.disabled && node.value === '')));
    evidence.push({ width: viewport.width, unconfirmedFieldsRetained: true, recovered: true, overflow: false });
  }
  fs.writeFileSync(path.join(output, 'browser-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('PASS stock recovery browser: desktop, mobile, lost-response retry');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  if (created) {
    fs.rmSync(route, { recursive: true, force: true });
    fs.rmSync(path.join(frontend, '.next/types/app/stock-recovery-qa'), { recursive: true, force: true });
  }
});
