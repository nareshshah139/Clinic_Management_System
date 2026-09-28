// Local synthetic acceptance only. No environment-provided database URL is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '../..');
const databaseUrl = 'postgresql://nshah@127.0.0.1:5432/cr12_inventory_acceptance_20260928';
process.env.DATABASE_URL = databaseUrl;
require('ts-node').register({ transpileOnly: true, project: root + '/backend/tsconfig.json' });
const { PrismaClient } = require('@prisma/client');
const { DrugService } = require('../../backend/src/modules/pharmacy/drug.service');
const { InventoryWorkspaceService } = require('../../backend/src/modules/inventory/inventory-workspace.service');
const { InventoryWorkflowService } = require('../../backend/src/modules/inventory/inventory-workflow.service');
const { PharmacyPrescriptionQueueService } = require('../../backend/src/modules/pharmacy/pharmacy-prescription-queue.service');
const { searchPrescriptionDrugs } = require('../../backend/src/modules/prescriptions/prescription-drug-search');
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const workflow = new InventoryWorkflowService(db), workspace = new InventoryWorkspaceService(db, workflow), drugs = new DrugService(db);
const pharmacy = new PharmacyPrescriptionQueueService(db, drugs);
const output = path.join(root, 'output/cr12'); fs.mkdirSync(output, { recursive: true });
const checks = [], requests = [];
let user, branch, server;
const base = 'http://127.0.0.1:3112';
(async () => {
  branch = await db.branch.create({ data: { name: `CR12 synthetic ${randomUUID()}`, address: 'Local test only' } });
  const staff = await db.user.create({ data: { branchId: branch.id, email: `${randomUUID()}@example.invalid`, password: 'not-a-login', firstName: 'Synthetic', lastName: 'Pharmacist', role: 'PHARMACIST', permissions: JSON.stringify(['inventory:item:read','pharmacy:drug:inventory-change:read','pharmacy:drug:inventory-change:create']) } });
  const doctor = await db.user.create({ data: { branchId: branch.id, email: `${randomUUID()}@example.invalid`, password: 'not-a-login', firstName: 'Synthetic', lastName: 'Doctor', role: 'DOCTOR' } });
  user = staff;
  const itemData = { branchId: branch.id, name: 'CR12 Clinic Cream', type: 'MEDICINE', unit: 'PACKS', sellingPrice: 20, costPrice: 10, mrp: 30, gstRate: 5, packSize: 50, packUnit: 'G', currentStock: 10, heldStock: 2, batchNumber: 'B1', expiryDate: new Date('2029-01-31'), status: 'ACTIVE' };
  const item = await db.inventoryItem.create({ data: { ...itemData, id: `a-${randomUUID()}` } });
  const other = await db.inventoryItem.create({ data: { ...itemData, id: `b-${randomUUID()}`, currentStock: 4, heldStock: 0, batchNumber: 'B2' } });
  const unlinked = await db.inventoryItem.create({ data: { ...itemData, name: 'CR12 Clinic Cotton', currentStock: 6, heldStock: 0 } });
  const product = await db.drug.create({ data: { branchId: branch.id, name: item.name, price: 20, manufacturerName: 'Synthetic maker', packSizeLabel: '50 G', inventoryItems: { connect: [{ id: item.id }, { id: other.id }] } } });
  await db.drug.create({ data: { branchId: branch.id, name: 'CATALOG ONLY DO NOT SHOW', price: 25, manufacturerName: 'Synthetic', packSizeLabel: '50 G' } });
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:4012'), p = url.pathname;
    let status = 200, result = [];
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const actor = { id: user.id, branchId: branch.id, role: user.role };
    try {
      if (p === '/auth/me' || p.startsWith('/users/')) result = { ...user, password: undefined };
      else if (p === '/inventory/workspace/capabilities') result = await workflow.capabilities(actor);
      else if (p === '/inventory/workspace/overview') result = await workspace.overview(actor);
      else if (p === '/inventory/workspace/stock') result = await workspace.stock(actor, Object.fromEntries(url.searchParams));
      else if (p.startsWith('/inventory/workspace/stock/')) result = await workspace.item(actor, p.split('/').pop());
      else if (p === '/drugs/inventory-change-requests' && req.method === 'POST') result = await drugs.createInventoryChangeRequests(body, branch.id, user.id);
      else if (p === '/drugs/inventory-change-requests') result = await drugs.findInventoryChangeRequests({ status: 'PENDING', page: Number(url.searchParams.get('page')) || 1, limit: Number(url.searchParams.get('limit')) || 20 }, branch.id);
      else if (/\/inventory-change-requests\/[^/]+\/approve$/.test(p)) {
        assert.equal(user.role, 'DOCTOR'); result = await drugs.approveInventoryChangeRequest(p.split('/').at(-2), body, branch.id, user.id);
      } else if (/\/inventory-change-requests\/[^/]+\/reject$/.test(p)) {
        assert.equal(user.role, 'DOCTOR'); result = await drugs.rejectInventoryChangeRequest(p.split('/').at(-2), body, branch.id, user.id);
      }
    } catch (error) { status = error.getStatus?.() || 500; result = error.getResponse?.() || { message: error.message }; }
    requests.push({ method: req.method, path: p, status });
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(4012, '127.0.0.1', resolve));
  const browser = process.env.CR12_CHROME === '1'
    ? await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] })
    : await puppeteer.connect({ browserURL: 'http://127.0.0.1:9312' });
  const page = await browser.newPage(); page.setDefaultTimeout(20000);
  const button = async text => {
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === text), {}, text);
    await page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text).click(), text);
  };
  const text = value => page.waitForFunction(value => document.body.innerText.includes(value), {}, value);
  const edit = async (action, value) => {
    await page.evaluate(({ id, action }) => {
      const row = document.querySelector(`input[aria-label="Select CR12 Clinic Cream B1"]`).closest('tr');
      [...row.querySelectorAll('button')].find(b => b.textContent.trim() === action).click();
    }, { id: item.id, action });
    await page.waitForSelector('[role="dialog"] input[type="number"]');
    await page.click('[role="dialog"] input[type="number"]', { clickCount: 3 });
    await page.keyboard.press('Backspace'); await page.type('[role="dialog"] input[type="number"]', value);
    await page.type('[role="dialog"] textarea', 'Invoice INV-12 / shelf count B1');
  };
  try {
    await page.setViewport({ width: 1550, height: 1050 });
    await page.setCookie({ name: 'auth_token', value: 'synthetic-only', url: base });
    await page.goto(base + '/dashboard/inventory?area=stock', { waitUntil: 'networkidle2', timeout: 60000 });
    await text('CR12 Clinic Cream');
    const menu = await page.evaluate(() => [...document.querySelectorAll('a')].map(a => a.textContent.trim()));
    assert.equal(menu.filter(n => n === 'Inventory').length, 1); assert(!menu.includes('Inventory Updates')); assert(!menu.includes('Reorder targets'));
    assert(!(await page.evaluate(() => document.body.innerText)).includes('CATALOG ONLY'));
    checks.push('One Inventory menu; clinic-only searchable stock, with linked and unlinked items and both batches.');
    await page.evaluate(() => document.querySelector('input[aria-label="Select CR12 Clinic Cream B1"]').closest('table').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'stock-desktop.png') });
    await edit('Edit price', '25'); await button('Submit for approval'); await text('Submitted for doctor or admin approval.');
    assert.equal((await db.inventoryItem.findUnique({ where: { id: item.id } })).sellingPrice, 20);
    await button('Today'); await text('Price/stock edits awaiting approval (1)');
    await page.screenshot({ path: path.join(output, 'today-desktop.png') });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Price/stock edits awaiting approval (1)')).click());
    await text('Price / stock approval queue'); await text('INV-12');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Approve').length), 0);
    user = doctor; await page.reload({ waitUntil: 'networkidle2' }); await text('Price / stock approval queue');
    await page.screenshot({ path: path.join(output, 'approval-desktop.png'), fullPage: true });
    await button('Approve'); await page.waitForSelector('[role="dialog"]');
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'Approve').click());
    await text('No pending price or stock edits.');
    assert.equal((await db.inventoryItem.findUnique({ where: { id: item.id } })).sellingPrice, 25);
    assert.equal((await drugs.findOne(product.id, branch.id)).price, 25);
    checks.push('Price waits for approval, Today links to the queue, pharmacist cannot review, and doctor or admin approval updates stock selling price and billing drug price.');
    user = staff; await page.goto(base + '/dashboard/inventory?area=stock', { waitUntil: 'networkidle2' }); await text('CR12 Clinic Cream');
    await page.setViewport({ width: 390, height: 844 });
    await edit('Edit stock', '17');
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[role="dialog"]')).opacity) === 1);
    await page.screenshot({ path: path.join(output, 'stock-edit-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await button('Submit for approval'); await text('Submitted for doctor or admin approval.');
    assert.equal((await db.inventoryItem.findUnique({ where: { id: item.id } })).currentStock, 10);
    user = doctor;
    await page.goto(base + '/dashboard/inventory-updates', { waitUntil: 'networkidle2' });
    await text('Price / stock approval queue'); assert(page.url().includes('view=approvals'));
    await button('Approve'); await page.waitForSelector('[role="dialog"]');
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'Approve').click());
    await text('No pending price or stock edits.');
    const stored = await db.inventoryItem.findUnique({ where: { id: item.id } });
    const list = await workspace.stock({ id: doctor.id, branchId: branch.id, role: 'DOCTOR' });
    assert.equal(list.rows.find(row => row.id === item.id).currentStock, 17);
    assert.equal(list.rows.find(row => row.id === other.id).currentStock, 4);
    assert.equal(stored.heldStock, 2);
    const billingStock = await pharmacy.inventoryStock(item.id, branch.id);
    const picker = await searchPrescriptionDrugs(db, 'cr12 clinic cream', 20, branch.id);
    assert.equal(billingStock.totalNonExpiredStock, 19); assert.equal(picker[0].totalStock, 19);
    assert.equal((await drugs.findAll({ search: 'cr12 clinic cream', limit: 20 }, branch.id)).data[0].totalStock, 21);
    assert.equal(await db.stockTransaction.count({ where: { itemId: item.id } }), 1);
    checks.push('Batch count 10 → 17 commits once; second batch stays 4 and holds stay 2; Stock shows 17, Billing and Rx picker both show 19 available across batches (21 physical minus 2 held).');
    checks.push('Old Inventory Updates bookmark redirects into approvals; mobile edit has no horizontal page overflow.');
    const unlinkedNow = await db.inventoryItem.findUnique({ where: { id: unlinked.id } });
    const unlinkedRequest = await drugs.createInventoryChangeRequests({ changes: [{ scope: 'BATCH', inventoryItemId: unlinked.id, expectedUpdatedAt: unlinkedNow.updatedAt.toISOString(), proposedStock: 8, reason: 'Unlinked shelf count' }] }, branch.id, staff.id);
    assert.equal(unlinkedRequest.data[0].drugId, null);
    await drugs.approveInventoryChangeRequest(unlinkedRequest.data[0].id, {}, branch.id, doctor.id);
    assert.equal((await searchPrescriptionDrugs(db, 'cr12 clinic cotton', 20, branch.id))[0].totalStock, 8);
    checks.push('Unlinked clinic item count also approves and appears in the Rx picker without creating a catalog identity.');
    const snapshot = await db.inventoryItem.findUnique({ where: { id: item.id } });
    const proposal = { changes: [{ scope: 'BATCH', inventoryItemId: item.id, expectedUpdatedAt: snapshot.updatedAt.toISOString(), proposedStock: 18, reason: 'Concurrent request check' }] };
    const concurrent = await Promise.allSettled([drugs.createInventoryChangeRequests(proposal, branch.id, staff.id), drugs.createInventoryChangeRequests(proposal, branch.id, staff.id)]);
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    const pending = concurrent.find(r => r.status === 'fulfilled').value.data[0];
    await db.inventoryItem.update({ where: { id: item.id }, data: { currentStock: 16 } });
    await assert.rejects(() => drugs.approveInventoryChangeRequest(pending.id, {}, branch.id, doctor.id), /changed/);
    assert.equal((await db.inventoryItem.findUnique({ where: { id: item.id } })).currentStock, 16);
    assert.equal(await db.stockTransaction.count({ where: { itemId: item.id } }), 1);
    await drugs.rejectInventoryChangeRequest(pending.id, { reviewNote: 'Stale synthetic count' }, branch.id, doctor.id);
    checks.push('Concurrent duplicate proposals create one request; a stale approval creates no stock movement and can be rejected.');
    assert(!requests.some(r => r.path === '/drugs'));
    const failed = requests.filter(r => r.status >= 400); assert.deepEqual(failed, []);
    fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify({ browser: process.env.CR12_CHROME ? 'Chrome' : 'Obscura', synthetic: true, database: 'cr12_inventory_acceptance_20260928', checks, requests }, null, 2));
    console.log(JSON.stringify({ checks, requests: requests.length }, null, 2));
  } catch (error) {
    console.error('Browser state:', await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => 'unavailable'));
    console.error('Failed API requests:', requests.filter(r => r.status >= 400));
    throw error;
  } finally { await page.close(); if (process.env.CR12_CHROME) await browser.close(); else await browser.disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { server?.close(); await db.$disconnect(); });
