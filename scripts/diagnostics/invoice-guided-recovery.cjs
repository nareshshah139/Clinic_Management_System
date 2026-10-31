const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', target: 'ES2023', esModuleInterop: true, experimentalDecorators: true, emitDecoratorMetadata: true } });
const { PharmacyPurchaseInvoiceService } = require('../../backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts');
const { purchaseCatalogData } = require('../../backend/src/modules/pharmacy/purchase-product-catalog.ts');
const root = path.resolve(__dirname, '../..');
const output = process.env.INVOICE_PROOF_OUTPUT || '/tmp/cms-invoice-guided-recovery-proof';
const frontendPort = 3117, apiPort = 4017, browserPort = 9317;
const base = `http://127.0.0.1:${frontendPort}`;
const baseline = process.argv.includes('--baseline');
const chrome = process.argv.includes('--chrome');
const staleReview = process.argv.includes('--stale-review');
const user = { id: 'invoice-proof-user', firstName: 'Test', lastName: 'Pharmacist', role: 'OWNER', branchId: 'invoice-proof-branch', isActive: true };
const item = { lineNumber: 1, productName: 'Cosglo New Cream', manufacturer: 'Synthetic manufacturer', packSize: '30 gm', packUnitType: 'Tube', hsnCode: '3304', batchNumber: 'SYNTHETIC', expiryMonth: 12, expiryYear: 2027, quantityPurchased: 1, freeQuantity: 0, mrp: 118, purchaseRate: 100, taxableAmount: 100, cgstPercent: 9, sgstPercent: 9, igstPercent: 0, gstAmount: 18, lineTotal: 118 };
const invoice = { id: 'invoice-proof', invoiceNumber: 'SYNTHETIC-UX-001', distributorName: 'Synthetic supplier', distributorGstin: '36ABCDE1234F1Z5', distributorDlNo: 'SYNTHETIC-DL', invoiceDate: '2026-10-31', goodsReceivedDate: '2026-10-31', billType: 'CASH', status: 'DRAFT', updatedAt: '2026-10-31T08:00:00Z', grossAmount: 100, taxableAmount: 100, totalCgst: 9, totalSgst: 9, totalGst: 18, netPayable: 118, unresolvedOcrFlags: 0, reconciliationIssues: [], items: [item], documents: [] };
const product = { id: 'cosglo-proof', name: item.productName, manufacturerName: item.manufacturer, packSizeLabel: '30 gm', price: 118, type: 'allopathy', composition1: null, category: null, dosageForm: null, strength: null, requiresPrescription: false, aliases: [] };
const initialProduct = { ...product };
const requests = [], writes = [], checks = [], children = [];
let editProduct = true, failChecks = false, failAfterSave = false;
let releaseReview;
const db = {
  $queryRaw: async () => [{ id: product.id }],
  drug: { findMany: async () => [product], findFirst: async () => product },
  inventoryItem: { findMany: async () => [] },
};
const service = new PharmacyPurchaseInvoiceService(db);
let readPurchases = true;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${apiPort}`), route = url.pathname;
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  let status = 200, body = [];
  try {
    const payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    if (route === '/auth/me' || route === `/users/${user.id}`) body = user;
    else if (route === '/pharmacy/purchase-invoices/capabilities') body = { read: readPurchases, create: true, review: true, commit: true, automate: true, catalogDetails: true, editProduct };
    else if (route === '/inventory/workspace/capabilities') body = {};
    else if (route === '/pharmacy/purchase-invoices/invoice-proof' && req.method === 'GET') body = invoice;
    else if (staleReview && route === '/pharmacy/purchase-invoices/drafts/invoice-proof' && req.method === 'PATCH') {
      Object.assign(invoice, payload, { updatedAt: '2026-10-31T09:00:00Z' });
      body = invoice;
      writes.push({ action: 'invoice', invoiceId: invoice.id });
    }
    else if (staleReview && route === '/pharmacy/purchase-invoices/invoice-proof/review') {
      await new Promise(resolve => { releaseReview = resolve; });
      status = 400; body = { code: 'PURCHASE_CATALOG_REVIEW_REQUIRED', message: 'Synthetic delayed catalogue failure' };
    }
    else if (route === '/pharmacy/purchase-invoices' && req.method === 'GET') body = { data: [invoice], total: 1 };
    else if (route === '/pharmacy/purchase-invoices/master-matches') {
      if (failChecks) { status = 503; body = { message: 'Synthetic catalogue check unavailable' }; }
      else body = await service.suggestMasterMatches(payload.items, user.branchId);
    }
    else if (route === '/pharmacy/purchase-invoices/master-products') body = await service.searchMasterProducts(url.searchParams.get('q'), user.branchId);
    else if (route === '/pharmacy/purchase-invoices/master-records/cosglo-proof' && req.method === 'PATCH' && editProduct) {
      Object.assign(product, purchaseCatalogData(payload));
      writes.push({ action: 'product', productId: product.id });
      if (failAfterSave) failChecks = true;
      body = service.masterDrugSummary(product);
    } else if (route.includes('/actions')) body = { permissions: {}, related: [], events: [] };
    else if (req.method !== 'GET') { status = 400; body = { message: `Unexpected mutation ${req.method} ${route}` }; writes.push({ action: 'unexpected', route }); }
  } catch (error) { status = error.getStatus?.() || 500; body = error.getResponse?.() || { message: error.message }; }
  requests.push({ method: req.method, route, status, at: new Date().toISOString() });
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
});
async function assertUnused(port) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
function start(command, args, name, env = {}) {
  const fd = fs.openSync(path.join(output, `${name}.log`), 'w');
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', fd, fd] });
  children.push(child); fs.closeSync(fd); return child;
}
async function waitFor(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Local server exited ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Local server did not start: ${url}`);
}
async function bounded(promise, label) {
  let timeout;
  try { return await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`${label} timed out`)), 20000); })]); }
  finally { clearTimeout(timeout); }
}
async function clickText(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === text && !button.disabled), {}, text);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text).click(), text);
}
/**
 * @cc [owner:nareshshah139,label:testing] invoice-recovery-local-proof
 * Browser proof MUST use only synthetic records and loopback services, reject occupied ports,
 * block off-origin browser requests, and stop only processes it started even when assertions fail.
 */
async function main() {
  fs.mkdirSync(output, { recursive: true });
  let browser, page, passed = false;
  try {
    await Promise.all([frontendPort, apiPort, ...(chrome ? [] : [browserPort])].map(assertUnused));
    await new Promise(resolve => server.listen(apiPort, '127.0.0.1', resolve));
    const next = start(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'frontend', '--hostname', '127.0.0.1', '--port', String(frontendPort)], 'next', { NEXT_PUBLIC_API_PROXY: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_API_URL: '/api', NEXT_TELEMETRY_DISABLED: '1' });
    if (chrome) browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
    else {
      const obscura = start('/Users/nshah/.local/share/obscura/v0.2.2/obscura', ['serve', '--port', String(browserPort), '--host', '127.0.0.1', '--allow-private-network'], 'obscura');
      await waitFor(`http://127.0.0.1:${browserPort}/json/version`, obscura);
      browser = await bounded(puppeteer.connect({ browserURL: `http://127.0.0.1:${browserPort}` }), 'Obscura CDP connection');
    }
    await waitFor(`${base}/login`, next);
    page = await bounded(browser.newPage(), 'Create browser page'); page.setDefaultTimeout(25000);
    await page.setRequestInterception(true);
    page.on('request', request => new URL(request.url()).origin === base || request.url().startsWith('data:') ? request.continue() : request.abort());
    await page.setViewport({ width: 1440, height: 1100 });
    await page.evaluateOnNewDocument(() => {
      window.invoiceProofClipboard = '';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.invoiceProofClipboard = text; } } });
    });
    await page.setCookie({ name: 'auth_token', value: 'synthetic-only', url: base });
    await page.goto(`${base}/dashboard/inventory?area=purchases&view=intake&invoice=invoice-proof`, { waitUntil: 'networkidle2', timeout: 90000 });
    if (baseline) await clickText(page, 'Refresh Matches');
    await page.waitForFunction(() => document.body.innerText.includes('Check or correct saved product details')); 
    fs.writeFileSync(path.join(output, baseline ? 'baseline.txt' : 'initial.txt'), await page.evaluate(() => document.body.innerText));
    await page.screenshot({ path: path.join(output, baseline ? 'baseline.png' : 'initial.png'), fullPage: true });
    if (baseline) {
      assert.equal(writes.length, 0);
      assert.equal(await page.evaluate(() => document.body.innerText.includes('Complete Cosglo New Cream details')), false);
      await page.evaluate(() => document.querySelector('[aria-label="Edit saved product details"]').scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: path.join(output, 'baseline-product.png') });
      checks.push('Existing editor shows missing fields but offers no named product recovery action'); passed = true; return;
    }
    await page.waitForSelector('[aria-label="Invoice product checks"]');
    await page.$eval('[aria-label="Invoice product checks"]', element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'product-blocker-desktop.png') });
    await clickText(page, 'Complete Cosglo New Cream details');
    await page.waitForFunction(() => document.activeElement?.id === 'product-0-edit-composition1');
    checks.push('Automatic product check names Cosglo and opens its exact missing composition field');
    await page.screenshot({ path: path.join(output, 'product-editor-desktop.png') });
    await page.setViewport({ width: 390, height: 844 });
    await page.$eval('[aria-label="Edit saved product details"]', element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'product-editor-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    checks.push('Product editor remains usable at 390px without horizontal page overflow');
    await page.setViewport({ width: 1440, height: 1100 });
    const kind = await page.$('select[id$="-kind"]');
    assert(kind, 'Product type selector is present');
    await kind.select('COSMETIC');
    await clickText(page, 'Save details and recheck invoice');
    await page.waitForFunction(() => document.body.innerText.includes('Product details saved. Invoice products checked again.'));
    assert.equal(await page.$('[aria-label="Invoice product checks"]'), null);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.includes('I verified the invoice against the original.'))?.querySelector('input[type="checkbox"]')?.checked), false);
    assert.equal(writes.filter(write => write.action === 'product').length, 1);
    assert.equal(writes.filter(write => write.action !== 'product').length, 0);
    checks.push('Saving a chosen product type rechecks without posting stock');
    await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.includes('I verified the invoice against the original.')).querySelector('input[type="checkbox"]').click());
    await page.waitForNetworkIdle({ idleTime: 1000 });
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.includes('I verified the invoice against the original.'))?.querySelector('input[type="checkbox"]')?.checked), true);
    assert.equal(writes.length, 1);
    checks.push('Final approval stays checked after requests settle and does not itself add stock');
    if (staleReview) {
      await clickText(page, 'Complete review');
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 10000;
        const check = () => releaseReview ? resolve() : Date.now() > deadline ? reject(new Error('Review was not held')) : setTimeout(check, 25);
        check();
      });
      const batchId = await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.trim() === 'Batch')?.htmlFor);
      assert(batchId, 'Batch correction control exists');
      await page.focus(`[id="${batchId}"]`);
      await page.$eval(`[id="${batchId}"]`, input => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'CORRECTED-BATCH');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForFunction(() => !document.querySelector('[aria-label="Invoice product checks"]'));
      const checksBefore = requests.filter(request => request.route.endsWith('/master-matches')).length;
      await page.focus(`[id="${batchId}"]`);
      assert.equal(await page.evaluate(() => document.activeElement?.id), batchId, 'Correction is focused before the old response arrives');
      releaseReview();
      await page.waitForNetworkIdle({ idleTime: 1000 });
      assert.equal(requests.filter(request => request.route.endsWith('/master-matches')).length, checksBefore, 'Obsolete review rejection must not launch another catalogue check');
      assert.equal(await page.evaluate(() => document.activeElement?.id), batchId, 'Obsolete review cleanup must retain correction focus');
      assert.equal(writes.filter(write => !['product', 'invoice'].includes(write.action)).length, 0);
      await page.screenshot({ path: path.join(output, 'obsolete-review-ignored.png') });
      checks.push('Delayed review rejection cannot recheck or move focus after a newer correction');
      passed = true; return;
    }
    Object.assign(product, initialProduct); failAfterSave = true;
    await page.reload({ waitUntil: 'networkidle2' });
    await clickText(page, 'Complete Cosglo New Cream details');
    await page.select('#product-0-edit-kind', 'COSMETIC');
    await clickText(page, 'Save details and recheck invoice');
    await page.waitForFunction(() => document.body.innerText.includes('Product details saved. Invoice check could not finish.'));
    await page.waitForNetworkIdle({ idleTime: 1000 });
    const writesBeforeRetry = writes.length;
    await page.$eval('[aria-label="Invoice product checks"]', element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'saved-check-failed.png') });
    const savedFailure = await page.$eval('[aria-label="Invoice product checks"]', element => element.textContent);
    assert.match(savedFailure, /Product details saved\. Invoice check could not finish\./);
    failChecks = false; failAfterSave = false;
    await clickText(page, 'Retry product check');
    await page.waitForFunction(() => !document.querySelector('[aria-label="Invoice product checks"]'));
    assert.equal(writes.length, writesBeforeRetry);
    checks.push('Saved/check-failed feedback offers a retry that performs no additional writes');
    Object.assign(product, initialProduct); editProduct = false;
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.body.innerText.includes('A colleague with product-edit permission'));
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Complete Cosglo New Cream details')), false);
    await clickText(page, 'Copy product handoff');
    const handoff = await page.evaluate(() => window.invoiceProofClipboard);
    assert.match(handoff, /SYNTHETIC-UX-001/);
    assert.match(handoff, /Cosglo New Cream/);
    assert.match(handoff, /composition/i);
    assert.match(handoff, /category/i);
    assert.match(handoff, /strength/i);
    await page.$eval('[aria-label="Invoice product checks"]', element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'permission-handoff.png') });
    assert.equal(writes.filter(write => write.action !== 'product').length, 0);
    checks.push('Restricted operator can copy invoice, product and missing fields without editing or posting stock');
    readPurchases = false;
    const attempt = 'ec73be65-0152-4bb1-8be6-399d78901a57';
    const recoveryPath = `/dashboard/inventory?area=purchases&view=intake&attempt=${attempt}&actor=original-operator&sources=source-1%2Csource-2`;
    const writesBeforeHandoff = writes.length;
    await page.goto(`${base}${recoveryPath}`, { waitUntil: 'networkidle2' });
    await clickText(page, 'Copy recovery handoff');
    const importHandoff = await page.evaluate(() => window.invoiceProofClipboard);
    assert.ok(importHandoff.includes(`${base}${recoveryPath}`), 'An interrupted import without an invoice retains its recovery URL');
    assert.match(importHandoff, /open this link to recover the import/);
    assert.doesNotMatch(importHandoff, /Exact invoice:/);
    assert.equal(writes.length, writesBeforeHandoff);
    await page.screenshot({ path: path.join(output, 'import-handoff-without-invoice.png') });
    checks.push('Interrupted import handoff retains its recovery URL before an invoice exists without writing stock');
    passed = true;
  } finally {
    releaseReview?.();
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ browser: chrome ? 'Chrome' : 'Obscura', baseline, passed, checks, writes, requests }, null, 2));
    if (page) await bounded(page.close(), 'Close browser page').catch(() => {});
    if (browser) { if (chrome) await browser.close(); else await browser.disconnect(); }
    await new Promise(resolve => server.close(resolve));
    for (const child of children.reverse()) if (child.exitCode === null) child.kill('SIGTERM');
  }
}
main().then(() => console.log(JSON.stringify({ checks, output }))).catch(error => { console.error(error); process.exitCode = 1; });
