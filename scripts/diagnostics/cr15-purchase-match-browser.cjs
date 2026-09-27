// Local-only browser regression: real purchase matching service, synthetic in-memory catalogue.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', target: 'ES2023', esModuleInterop: true, experimentalDecorators: true, emitDecoratorMetadata: true } });
const { PharmacyPurchaseInvoiceService } = require('../../backend/src/modules/pharmacy/pharmacy-purchase-invoice.service.ts');
const output = path.resolve(__dirname, '../../output/cr15'); fs.mkdirSync(output, { recursive: true });
const base = 'http://127.0.0.1:3115';
const user = { id: 'cr15-user', firstName: 'Test', lastName: 'Reviewer', role: 'OWNER', branchId: 'cr15-branch', isActive: true };
const item = { lineNumber: 1, productName: 'Moisturex Hydra Gel Cream', manufacturer: 'Sun Pharmaceutical Industries Ltd', packSize: '50 ml', packUnitType: 'Tube', hsnCode: '3304', batchNumber: 'SGD0183', expiryMonth: 12, expiryYear: 2027, quantityPurchased: 10, freeQuantity: 0, mrp: 429, purchaseRate: 290.85, taxableAmount: 2908.5, cgstPercent: 9, sgstPercent: 9, igstPercent: 0, gstAmount: 523.53, lineTotal: 3432.03 };
const invoice = { id: 'cr15-invoice', invoiceNumber: 'SB-26-45503-FIXTURE', distributorName: 'Synthetic supplier', distributorGstin: '36ABCDE1234F1Z5', invoiceDate: '2026-09-01', goodsReceivedDate: '2026-09-02', billType: 'CASH', status: 'DRAFT', updatedAt: '2026-09-27T08:00:00Z', grossAmount: 2908.5, taxableAmount: 2908.5, totalCgst: 261.765, totalSgst: 261.765, totalGst: 523.53, netPayable: 3432.03, unresolvedOcrFlags: 0, reconciliationIssues: [], items: [item], documents: [] };
const drug = { id: 'abzorb', name: 'Abzorb 1% Cream', manufacturerName: item.manufacturer, packSizeLabel: 'tube of 15 gm Cream', price: 429, type: 'allopathy', composition1: 'Clotrimazole (1% w/w)', category: 'Antifungal', dosageForm: 'Cream', strength: '1%', requiresPrescription: false, aliases: [] };
const writes = [], requests = [], warnings = [], checks = [];
const db = {
  $queryRaw: async () => [{ id: drug.id }],
  drug: { findMany: async () => [drug], findFirst: async () => drug, update: async value => { writes.push(value); return drug; } },
  inventoryItem: { findMany: async () => [] },
  auditLog: { create: async value => { writes.push(value); return {}; } },
  $transaction: async callback => callback(db),
};
const service = new PharmacyPurchaseInvoiceService(db);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4015'), p = url.pathname;
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  let status = 200, body = [];
  try {
    if (p === '/auth/me' || p === `/users/${user.id}`) body = user;
    else if (p === '/pharmacy/purchase-invoices/capabilities') body = { read: true, create: true, review: true, commit: true, automate: true, catalogDetails: true, editProduct: true };
    else if (p === '/inventory/workspace/capabilities') body = {};
    else if (p === '/pharmacy/purchase-invoices/cr15-invoice') body = invoice;
    else if (p === '/pharmacy/purchase-invoices') body = { data: [invoice], total: 1 };
    else if (p === '/pharmacy/purchase-invoices/master-matches') body = await service.suggestMasterMatches(payload.items, user.branchId);
    else if (p === '/pharmacy/purchase-invoices/master-products') body = await service.searchMasterProducts(url.searchParams.get('q'), user.branchId);
    else if (p === '/pharmacy/purchase-invoices/master-confirmations') body = await service.confirmMasterRecord(payload, user.branchId, user.id);
    else if (p.includes('/actions')) body = { permissions: {}, related: [], events: [] };
    else if (p === '/notifications/system-alerts') body = [];
  } catch (error) { status = error.getStatus?.() || 500; body = error.getResponse?.() || { message: error.message }; }
  requests.push({ method: req.method, path: p, status });
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
});
(async () => {
  await new Promise(resolve => server.listen(4015, '127.0.0.1', resolve));
  const browser = process.env.CR15_CHROME === '1'
    ? await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] })
    : await puppeteer.connect({ browserURL: 'http://127.0.0.1:9315' });
  const page = await browser.newPage(); page.setDefaultTimeout(15000);
  page.on('dialog', async dialog => { warnings.push(dialog.message()); await dialog.dismiss(); });
  try {
    await page.setViewport({ width: 1440, height: 1100 });
    await page.setCookie({ name: 'auth_token', value: 'synthetic-only', url: base });
    await page.goto(`${base}/dashboard/inventory?area=purchases&view=intake&invoice=cr15-invoice`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Refresh Matches'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Refresh Matches').click());
    await page.waitForFunction(() => document.body.innerText.includes('Not in inventory'));
    const text = await page.evaluate(() => document.body.innerText);
    assert(!text.includes('Abzorb 1% Cream')); assert(!text.includes('Confirm Match')); assert(text.includes('Create new item'));
    checks.push('No Abzorb suggestion; Not in inventory and Create new item shown');
    await page.evaluate(() => document.querySelector('[aria-label="New product details"]').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'no-match-desktop.png') });
    const search = '#purchase-product-search-1';
    await page.type(search, 'Abzorb');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Match Abzorb 1% Cream'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Match Abzorb 1% Cream').click());
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Match Abzorb 1% Cream')?.disabled);
    assert(warnings.some(message => message.startsWith('These look like different products. Confirm anyway?')));
    assert.equal(writes.length, 0); checks.push('Manual mismatch warning cancelled; zero catalogue, audit or stock writes');
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelector('[aria-label="Manual product matching for line 1"]').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'manual-match-mobile.png') });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false); checks.push('Manual selection remains reachable at 390px with no horizontal page overflow');
    fs.writeFileSync(path.join(output, 'browser-check.json'), JSON.stringify({ browser: process.env.CR15_CHROME ? 'Chrome' : 'Obscura', synthetic: true, checks, warnings, writes, requests }, null, 2));
    console.log(JSON.stringify({ checks, warnings, writes: writes.length }, null, 2));
  } finally { await page.close(); if (process.env.CR15_CHROME) await browser.close(); else await browser.disconnect(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
