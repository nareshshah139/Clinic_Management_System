const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const frontend = path.resolve(__dirname, '..');
const route = path.join(frontend, 'src/app/supplier-payment-recovery-qa');
const output = path.resolve(frontend, '../output/diagnostics/supplier-payment-recovery');
const chromium = process.argv.includes('--browser=chrome');
const port = 3106;
const cdpPort = 9338;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'supplier-payment-browser-'));
let server, browserProcess, browser;
let routeCreated = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const ready = async url => { for (let count = 0; count < 120; count++) { try { if ((await fetch(url)).ok) return; } catch {} await pause(500); } throw new Error(`Local fixture unavailable: ${url}`); };
const clickText = (page, label) => page.evaluate(text => {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  if (!button || button.disabled) throw new Error(`Unavailable button: ${text}`);
  button.click();
}, label);
const fill = (page, selector, value) => page.$eval(selector, (input, text) => {
  const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

/**
 * @cc [owner:nareshshah139,label:testing] supplier-payment-local-browser-fixture
 * Browser verification MUST use synthetic local data, remove only its temporary route/profile and generated QA types,
 * and assert unchanged retry identity before reporting the recovery flow as verified.
 */
async function run() {
  assert(!fs.existsSync(route), 'QA route must not overwrite existing work');
  fs.mkdirSync(route, { recursive: true });
  routeCreated = true;
  fs.mkdirSync(output, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'fixtures/supplier-payment-recovery-page.tsx'), path.join(route, 'page.tsx'));
  const serverLog = fs.openSync(path.join(output, 'next.log'), 'w');
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: frontend, stdio: ['ignore', serverLog, serverLog] });
  await ready(`http://127.0.0.1:${port}/supplier-payment-recovery-qa`);
  if (chromium) {
    browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: profile, args: ['--no-first-run', '--no-default-browser-check'] });
  } else {
    const obscuraLog = fs.openSync(path.join(output, 'obscura.log'), 'w');
    browserProcess = spawn('/Users/nshah/.local/share/obscura/v0.2.2/obscura', ['serve', '--host', '127.0.0.1', '--port', String(cdpPort), '--storage-dir', profile, '--allow-private-network'], { stdio: ['ignore', obscuraLog, obscuraLog] });
    await ready(`http://127.0.0.1:${cdpPort}/json/version`);
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdpPort}` });
  }
  const page = await browser.newPage();
  const evidence = { browser: chromium ? 'Chrome' : 'Obscura', viewports: [], actions: [] };
  for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewport(viewport);
    await page.goto(`http://127.0.0.1:${port}/supplier-payment-recovery-qa`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('button');
    const buttons = await page.$$eval('button', nodes => nodes.map(node => node.textContent.trim()));
    assert(buttons.includes('Reallocate payment') && buttons.includes('Reverse payment'));
    await clickText(page, 'Reallocate payment');
    await page.waitForSelector('#payment-correction-reason');
    await fill(page, '#payment-allocation-synthetic-a', '0');
    await fill(page, '#payment-allocation-synthetic-b', '100');
    await fill(page, '#payment-correction-reason', 'Wrong invoice selected');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'Recovery form must fit viewport width');
    const file = path.join(output, `${chromium ? 'chrome' : 'obscura'}-${viewport.width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    evidence.viewports.push({ ...viewport, overflow, screenshot: file });
  }
  await clickText(page, 'Confirm reallocation');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('Payment reallocated'));
  const reallocation = await page.evaluate(() => window.__paymentRecoveryCalls[0]);
  assert.deepEqual(reallocation.data.allocations, [{ purchaseInvoiceId: 'synthetic-b', amount: 100 }]);
  evidence.actions.push('same-total reallocation confirmed');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('button');
  await clickText(page, 'Reverse payment');
  await fill(page, '#payment-correction-reason', 'Incorrect amount recorded');
  await clickText(page, 'Confirm reversal');
  await page.waitForSelector('[role="alert"]');
  await clickText(page, 'Confirm reversal');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('Payment reversed'));
  const retry = await page.evaluate(() => window.__paymentRecoveryCalls);
  assert.equal(retry.length, 2);
  assert.deepEqual(retry[0], retry[1], 'Lost-response retry must retain complete command identity');
  evidence.actions.push('lost-response reversal retry retained request key, revision and reason');
  fs.writeFileSync(path.join(output, 'browser-evidence.json'), JSON.stringify(evidence));
  process.stdout.write(JSON.stringify(evidence) + '\n');
}
run().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close().catch(() => {});
  browserProcess?.kill('SIGTERM');
  if (server && server.exitCode === null) {
    await new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); setTimeout(resolve, 2000); });
  }
  if (routeCreated) {
    fs.rmSync(route, { recursive: true, force: true });
    fs.rmSync(path.join(frontend, '.next/types/app/supplier-payment-recovery-qa'), { recursive: true, force: true });
    execFileSync(process.execPath, [require.resolve('next/dist/bin/next'), 'typegen'], { cwd: frontend, stdio: 'ignore' });
  }
  fs.rmSync(profile, { recursive: true, force: true });
});
