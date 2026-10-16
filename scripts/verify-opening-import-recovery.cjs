const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/diagnostics/opening-import-recovery');
const qa = path.join(root, 'frontend/src/app/opening-import-recovery-qa');
const port = 3107;
const origin = `http://127.0.0.1:${port}`;
const browserKind = process.env.OPENING_IMPORT_BROWSER || 'obscura';
let next, obscura, browser;
let createdQa = false;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function start(command, args, options) {
  const child = spawn(command, args, { ...options, detached: true });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', resolve);
  });
  return child;
}
async function stop(child) {
  if (!child?.pid) return;
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try { process.kill(-child.pid, signal); } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    for (let attempt = 0; attempt < 50; attempt++) {
      try { process.kill(-child.pid, 0); } catch (error) {
        if (error.code === 'ESRCH') return;
        throw error;
      }
      await pause(100);
    }
  }
  throw new Error(`Owned process group ${child.pid} did not stop`);
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    assert(child.exitCode === null && child.signalCode === null, `Local verification process exited before ready: ${url}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await pause(500);
  }
  throw new Error(`Local verification server did not start: ${url}`);
}
/**
 * @cc [owner:nareshshah139,label:testing] opening-ui-local-only
 * Verification MUST use a temporary local route and synthetic HTTP responses, and remove only
 * the route and processes created by this run, including when a child cannot start. Cleanup MUST
 * await owned process termination. It MUST NOT call production inventory endpoints.
 */
async function run() {
  assert(!fs.existsSync(qa), 'Temporary verification route already exists');
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(qa);
  createdQa = true;
  fs.writeFileSync(path.join(qa, 'page.tsx'), '"use client";\nimport { PharmacyInventoryStarterImport } from "@/components/pharmacy/PharmacyInventoryStarterImport";\nexport default function Page(){return <main className="mx-auto max-w-3xl p-4"><PharmacyInventoryStarterImport compact /></main>;}\n');
  const log = fs.openSync(path.join(output, 'browser-server.log'), 'w');
  next = await start(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: path.join(root, 'frontend'), stdio: ['ignore', log, log] });
  await ready(origin + '/opening-import-recovery-qa', next);
  if (browserKind === 'obscura') {
    obscura = await start('/Users/nshah/.local/share/obscura/v0.2.2/obscura', ['serve', '--port', '9347', '--host', '127.0.0.1', '--allow-private-network', '--allow-file-access'], { stdio: 'ignore' });
    await ready('http://127.0.0.1:9347/json/version', obscura);
    browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9347' });
  } else {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  }
  const page = await browser.newPage();
  let phase = 'retry';
  let retried = false;
  let retryRequests = 0;
  const failures = { importId: 'synthetic-import', totalRows: 2, created: 1, updated: 0, skipped: 1, drugsCreated: 1, stockAdjusted: 1, retryableRows: 1, errors: [{ row: 3, message: 'Database could not finish saving this row. Retry failed rows.' }] };
  const complete = { ...failures, created: 2, skipped: 0, drugsCreated: 2, stockAdjusted: 2, retryableRows: 0, errors: [] };
  const unknown = { ...failures, created: 0, totalRows: 1, retryableRows: 0, reconciliationRequired: 1, errors: [{ row: 2, message: 'Previous row outcome is uncertain. Reconcile this import before applying stock again.' }] };
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/inventory/items/import-preview') return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [{ sourceRow: 2, name: 'Synthetic cream', currentStock: 4 }] }) });
    if (url.pathname === '/api/inventory/items/import') return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(phase === 'legacy' ? unknown : failures) });
    if (url.pathname.endsWith('/retry-failed-rows')) {
      retryRequests++;
      retried = true;
      if (phase === 'lost-response') return request.abort('failed');
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(complete) });
    }
    if (url.pathname === '/api/inventory/imports/synthetic-import') return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(retried ? complete : failures) });
    return request.continue();
  });
  const click = async label => {
    const buttons = await page.$$('button');
    for (const button of buttons) if ((await button.evaluate(el => el.textContent.trim())) === label) { await button.click(); return; }
    throw new Error(`Missing button ${label}`);
  };
  const visibleText = text => page.waitForFunction(value => document.body.innerText.includes(value), {}, text);
  const inputPath = path.join(output, 'synthetic-opening.xlsx');
  fs.writeFileSync(inputPath, 'Synthetic workbook. Preview and import HTTP responses are fixtures.');
  async function upload(width) {
    await page.setViewport({ width, height: 1000 });
    await page.goto(origin + '/opening-import-recovery-qa', { waitUntil: 'networkidle0' });
    const controls = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(button => button.textContent.trim()));
    assert(controls.includes('Preview import'));
    await (await page.$('input[type=file]')).uploadFile(inputPath);
    await click('Preview import');
    await visibleText('Synthetic cream');
    await click('Confirm opening import');
  }
  await upload(1280);
  await visibleText('Retry failed rows');
  await page.screenshot({ path: path.join(output, 'retry-desktop.png'), fullPage: true });
  await click('Retry failed rows');
  await page.waitForFunction(() => !document.body.innerText.includes('Rows needing review'));
  assert.equal(retryRequests, 1);
  phase = 'lost-response'; retried = false;
  await upload(390);
  await visibleText('Retry failed rows');
  await click('Retry failed rows');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Check import outcome' && !button.disabled));
  assert((await page.evaluate(() => document.body.innerText)).includes('Row 3: Database'));
  await page.screenshot({ path: path.join(output, 'unknown-response-mobile.png'), fullPage: true });
  await click('Check import outcome');
  await page.waitForFunction(() => !document.body.innerText.includes('Rows needing review'));
  phase = 'legacy'; retried = false;
  await upload(390);
  await visibleText('Some earlier row outcomes are unknown');
  assert(!(await page.evaluate(() => document.body.innerText)).includes('Retry failed rows'));
  await page.screenshot({ path: path.join(output, 'legacy-unknown-mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'Importer must not overflow the mobile viewport');
  assert.equal(retryRequests, 2);
  const result = { browser: browserKind, passed: ['retry failed rows', 'lost response retains summary', 'outcome check recovers', 'unknown legacy cannot replay', 'mobile layout'], retryRequests };
  fs.writeFileSync(path.join(output, 'browser-result.json'), JSON.stringify(result));
  console.log(JSON.stringify(result));
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  try {
    if (browser) await browser.close().catch(() => {});
    await Promise.all([stop(obscura), stop(next)]);
  } finally {
    if (createdQa && fs.existsSync(qa)) fs.rmSync(qa, { recursive: true });
  }
}).catch(error => { console.error(error.stack); process.exitCode = 1; });
