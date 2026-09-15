// Regression proof against isolated localhost only; no production invoices are changed.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const puppeteer = require('/Users/nshah/.agents/skills/browser-tools/node_modules/puppeteer-core');
const root = path.resolve(__dirname, '../..'), out = root + '/output/diagnostics/inventory-production-readiness/unit-fix';
const state = JSON.parse(fs.readFileSync('/tmp/inventory-unit-fix-session.json'));
const fixture = JSON.parse(fs.readFileSync('/tmp/purchase-ocr-originals-manifest.json'))[0];
const db = new PrismaClient({ datasourceUrl: 'postgresql://invoice_review@127.0.0.1:55443/inventory_workflow_acceptance?schema=public' });
const report = { checkedAt: new Date().toISOString(), localOnly: true, invoice: fixture.expected.invoiceNumber, checks: {} };
const stockSnapshot = async () => ({
  items: await db.inventoryItem.findMany({ where: { branchId: state.branchId }, orderBy: { id: 'asc' } }),
  movements: await db.stockTransaction.findMany({ where: { branchId: state.branchId }, orderBy: { id: 'asc' } }),
});
async function main() {
  const invoice = await db.pharmacyPurchaseInvoice.findFirstOrThrow({
    where: { branchId: state.branchId, invoiceNumber: fixture.expected.invoiceNumber },
    include: { items: { orderBy: { lineNumber: 'asc' } }, documents: true },
  });
  assert.equal(invoice.status, 'STOCK_COMMITTED');
  assert.equal(invoice.netPayable, 45602);
  assert.equal(invoice.items.length, 2);
  report.invoiceId = invoice.id;
  report.rows = [];
  for (let n = 0; n < 2; n++) {
    const line = invoice.items[n], expected = fixture.expected.items[n];
    assert.equal(line.packUnitType, 'Pack');
    assert.equal(line.packSize, '30ML');
    for (const key of ['batchNumber', 'quantityPurchased', 'freeQuantity', 'purchaseRate', 'mrp']) assert.equal(line[key], expected[key] || 0);
    const item = await db.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId } });
    assert.equal(item.unit, 'PACKS');
    assert.equal(item.currentStock, n === 0 ? 9 : 7);
    assert.equal(item.expiryDate.toISOString().slice(0, 10), n === 0 ? '2027-07-31' : '2027-09-30');
    report.rows.push({ line: n + 1, batch: item.batchNumber, declaredUnit: line.packUnitType, content: line.packSize, storedUnit: item.unit, stock: item.currentStock });
  }
  report.checks.paidAndFreeQuantitiesInDeclaredPacks = true;
  const original = fs.readFileSync(fixture.path), hash = createHash('sha256').update(original).digest('hex');
  const doc = invoice.documents.find(d => d.sha256 === hash);
  assert(doc && Buffer.from(doc.data).equals(original));
  report.checks.originalByteIdentical = true;
  const initial = await stockSnapshot();
  assert.equal(initial.movements.length, 2);
  const login = await fetch('http://127.0.0.1:4107/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: state.email, password: state.password }) });
  assert(login.ok);
  const token = (await login.json()).access_token;
  const statuses = [];
  for (let n = 0; n < 3; n++) {
    const r = await fetch('http://127.0.0.1:4107/pharmacy/purchase-invoices/' + invoice.id + '/process', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(r.status, 201);
    statuses.push(r.status);
  }
  assert.deepEqual(await stockSnapshot(), initial);
  report.checks.repeatedProcessingAddsNothing = true;
  report.repeatedProcessStatuses = statuses;
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:19431' });
  try {
    const page = (await b.pages()).find(p => p.url().includes('new=unit-fix-0'));
    assert(page);
    await page.bringToFront();
    await page.setViewport({ width: 1440, height: 1080 });
    await page.goto('http://127.0.0.1:3106/dashboard/inventory?area=purchases&view=intake&invoice=' + invoice.id, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('[aria-label="Stock status"]')?.textContent.includes('Stock added'), { timeout: 30000 });
    report.persistedStatusText = await page.$eval('[aria-label="Stock status"]', e => e.textContent);
    await page.screenshot({ path: out + '/screenshots/eucerin-fixed-stock.png' });
    report.checks.uiReloadShowsStockAdded = true;
  } finally { await b.disconnect(); }
  report.status = 'PASS';
  fs.writeFileSync(out + '/unit-fix-proof.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
