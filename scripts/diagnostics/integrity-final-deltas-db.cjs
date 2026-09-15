#!/usr/bin/env node
// @cc [owner:nareshshah139,label:validation] isolated-final-delta-fixtures
// Mutating regressions MUST create a new synthetic branch on local :55443 and MUST NOT read guide-session credentials or change guide fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const url = 'postgresql://invoice_review@127.0.0.1:55443/inventory_workflow_acceptance?schema=public';
process.env.DATABASE_URL = url;
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/backend/tsconfig.json' });
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const { InventoryWorkflowService } = require(root + '/backend/src/modules/inventory/inventory-workflow.service');
const { InventoryImportService } = require(root + '/backend/src/modules/inventory/inventory-import.service');
const { InventoryController } = require(root + '/backend/src/modules/inventory/inventory.controller');
const db = new PrismaClient({ datasourceUrl: url });
const wf = new InventoryWorkflowService(db), importer = new InventoryImportService(db);
const results = [];
async function test(name, run) { try { await run(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', error: error.stack }); } }
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const workbook = rows => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.json_to_sheet(rows), 'Opening'); const buffer = XLSX.write(w, { type: 'buffer', bookType: 'xlsx' }); return { buffer, originalname: 'integrity-final-opening.xlsx', size: buffer.length, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }; };
(async () => {
  const branch = await db.branch.create({ data: { name: 'Integrity final deltas ' + randomUUID(), address: 'ISOLATED TEST ONLY' } });
  const user = await db.user.create({ data: { branchId: branch.id, email: randomUUID() + '@example.invalid', firstName: 'Integrity', lastName: 'Final delta', password: 'NO_LOGIN_TEST', role: 'ADMIN' } });
  const actor = { id: user.id, branchId: branch.id, role: 'ADMIN' };
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const day = n => new Date(today.getTime() + n * 86400000);
  const item = (extra = {}) => db.inventoryItem.create({ data: { branchId: branch.id, name: 'Final delta ' + randomUUID(), type: 'MEDICINE', unit: 'PIECES', packSize: 10, packUnit: 'tablets', currentStock: 20, heldStock: 0, costPrice: 10, sellingPrice: 20, mrp: 25, gstRate: 12, expiryDate: day(365), batchNumber: randomUUID(), status: 'ACTIVE', ...extra } });
  const drug = () => db.drug.create({ data: { branchId: branch.id, name: 'Identity ' + randomUUID(), manufacturerName: '', price: 20, packSizeLabel: '10 tablets', type: 'medicine' } });
  const pair = async () => { const identity = await drug(), name = 'FEFO ' + randomUUID(); return { early: await item({ name, expiryDate: day(10), drugs: { connect: { id: identity.id } } }), late: await item({ name, expiryDate: day(30), drugs: { connect: { id: identity.id } } }), identity }; };
  const fresh = i => db.inventoryItem.findUniqueOrThrow({ where: { id: i.id } });
  const save = (kind, lines, payload = {}) => wf.saveDocument(actor, { kind, reference: 'DELTA-' + randomUUID(), requestKey: randomUUID(), payload: { reason: 'Isolated final delta regression', lines, ...payload } });
  const post = d => wf.transition(actor, d.id, { action: 'POST', version: d.version });
  await test('FEFO rejects skipping an available earlier product batch and commits no effects', async () => {
    const { early, late } = await pair(), d = await save('COUNTER_SALE', [{ inventoryId: late.id, quantity: 1 }]);
    await assert.rejects(() => post(d), /earlier-expiry/); assert.equal((await fresh(early)).currentStock, 20); assert.equal((await fresh(late)).currentStock, 20);
    assert.equal((await wf.document(actor, d.id)).status, 'DRAFT'); assert.equal(await db.inventoryWorkflowEffect.count({ where: { documentId: d.id } }), 0);
  });
  await test('A recorded FEFO override permits the selected batch and remains in the posted record', async () => {
    const { early, late } = await pair(), reason = 'Earlier batch reserved for an identified prescription';
    const d = await post(await save('COUNTER_SALE', [{ inventoryId: late.id, quantity: 2, fefoOverrideReason: reason }]));
    assert.equal(d.payload.lines[0].fefoOverrideReason, reason); assert.equal((await fresh(late)).currentStock, 18); assert.equal((await fresh(early)).currentStock, 20);
  });
  await test('One sale can exhaust earlier stock then consume later stock regardless of row order', async () => {
    const { early, late } = await pair(); await post(await save('COUNTER_SALE', [{ inventoryId: late.id, quantity: 2 }, { inventoryId: early.id, quantity: 20 }]));
    assert.equal((await fresh(early)).currentStock, 0); assert.equal((await fresh(late)).currentStock, 18);
  });
  await test('Held, expired, inactive and incompatible-pack batches cannot falsely block FEFO', async () => {
    const { early, late, identity } = await pair(); await db.inventoryItem.update({ where: { id: early.id }, data: { heldStock: 20 } });
    for (const extra of [{ expiryDate: day(-1) }, { expiryDate: day(5), status: 'INACTIVE' }, { expiryDate: day(5), packSize: 20 }]) await item({ name: early.name, drugs: { connect: { id: identity.id } }, ...extra });
    await post(await save('COUNTER_SALE', [{ inventoryId: late.id, quantity: 1 }])); assert.equal((await fresh(late)).currentStock, 19);
  });
  await test('FEFO follows one reliable Drug identity despite different display names', async () => {
    const { early, late } = await pair(); await db.inventoryItem.update({ where: { id: early.id }, data: { name: 'Historical display name ' + randomUUID() } });
    await assert.rejects(async () => post(await save('COUNTER_SALE', [{ inventoryId: late.id, quantity: 1 }])), /earlier-expiry/);
  });
  await test('Different, ambiguous and unmapped identities do not merge by the same display name', async () => {
    const name = 'Ambiguous identity ' + randomUUID(), a = await drug(), b = await drug();
    await item({ name, expiryDate: day(1), drugs: { connect: { id: a.id } } });
    const different = await item({ name, expiryDate: day(30), drugs: { connect: { id: b.id } } });
    const ambiguous = await item({ name, expiryDate: day(30), drugs: { connect: [{ id: a.id }, { id: b.id }] } });
    const unmapped = await item({ name, expiryDate: day(30) });
    for (const i of [different, ambiguous, unmapped]) { await post(await save('COUNTER_SALE', [{ inventoryId: i.id, quantity: 1 }])); assert.equal((await fresh(i)).currentStock, 19); }
  });
  await test('Expiry today is saleable with correct saved stock status; yesterday is blocked atomically', async () => {
    const valid = await item({ expiryDate: today }), expired = await item({ expiryDate: day(-1) });
    await post(await save('COUNTER_SALE', [{ inventoryId: valid.id, quantity: 1 }])); assert.equal((await fresh(valid)).currentStock, 19); assert.equal((await fresh(valid)).stockStatus, 'IN_STOCK');
    await assert.rejects(async () => post(await save('COUNTER_SALE', [{ inventoryId: expired.id, quantity: 1 }])), /expired\/inactive/); assert.equal((await fresh(expired)).currentStock, 20);
  });
  await test('Refunds lock original discount/scheme/GST and recorded cost despite changed item prices and supplied overrides', async () => {
    const i = await item(), sale = await post(await save('COUNTER_SALE', [{ inventoryId: i.id, quantity: 3, freeQuantity: 1, unitPrice: 100, discountPercent: 10, schemeAmount: 2, gstRate: 12 }]));
    assert.equal(Number(sale.totalAmount), 300.16);
    const source = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: sale.id, quantityDelta: { lt: 0 } } });
    await db.inventoryItem.update({ where: { id: i.id }, data: { costPrice: 999, sellingPrice: 999, gstRate: 99 } });
    let refunded = 0;
    for (let n = 0; n < 4; n++) {
      const d = await post(await save('SALES_RETURN', [{ inventoryId: i.id, sourceLineId: source.transactionId, quantity: 1, unitPrice: 7777, discountPercent: 99, schemeAmount: 1000, gstRate: 99, disposition: 'RESTOCK' }], { refundMode: 'CASH' }));
      assert.equal(d.payload.lines[0].unitPrice, 100); assert.equal(d.payload.lines[0].discountPercent, 10); assert.equal(d.payload.lines[0].gstRate, 12);
      const effect = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: d.id, transactionId: { not: null } } });
      const movement = await db.stockTransaction.findUniqueOrThrow({ where: { id: effect.transactionId } });
      assert.equal(JSON.parse(movement.notes).costPerStockUnit, 10); assert.equal(Number(effect.amount), -Number(d.totalAmount)); refunded += Number(d.totalAmount);
    }
    assert.equal(Math.round(refunded * 100), 30016); assert.equal((await fresh(i)).currentStock, 20);
  });
  await test('Split refunds allocate the original final GST cent once, including replacement after reversal', async () => {
    const i = await item(), sale = await post(await save('COUNTER_SALE', [{ inventoryId: i.id, quantity: 3, unitPrice: 0.01, gstRate: 33.33 }]));
    const source = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: sale.id, transactionId: { not: null } } });
    const returned = [];
    const refund = () => save('SALES_RETURN', [{ inventoryId: i.id, sourceLineId: source.transactionId, quantity: 1, disposition: 'RESTOCK' }], { refundMode: 'CASH' }).then(post);
    for (let n = 0; n < 3; n++) returned.push(await refund());
    const cents = rows => Math.round(rows.reduce((n, r) => n + Number(r.totalAmount), 0) * 100);
    assert.equal(cents(returned), Math.round(Number(sale.totalAmount) * 100)); assert.equal(cents(returned), 4);
    await wf.transition(actor, returned[0].id, { action: 'REVERSE', version: returned[0].version, reason: 'Replace first refund' });
    assert.equal(cents([...returned.slice(1), await refund()]), 4);
  });
  const row = { Name: 'Opening final ' + randomUUID(), Pack: '10 tablets', Batch: 'FINAL-OPEN', Expiry: '2032-12-31', Quantity: 10, 'Cost price': 25, 'Selling price': 30, MRP: 40, Location: 'Rack A', GST: 12, 'Min stock': 2, 'Max stock': 20 };
  const original = workbook([row]); let imported, openingItem;
  await test('Opening source is retained and controller download returns byte-identical bytes with branch isolation', async () => {
    imported = await importer.importStarterExcel(original, branch.id, user.id); assert.equal(imported.created, 1); assert.equal(imported.skipped, 0);
    openingItem = await db.inventoryItem.findFirstOrThrow({ where: { branchId: branch.id, name: row.Name } }); assert.equal(openingItem.currentStock, 10);
    const retained = await importer.originalImport(imported.importId, branch.id); assert.equal(hash(retained.data), hash(original.buffer)); assert.equal(retained.sha256, hash(original.buffer));
    await assert.rejects(() => importer.originalImport(imported.importId, 'different-branch'), /not found/);
    const headers = {}; let body;
    await new InventoryController({}, importer).originalImport(imported.importId, { user: actor }, { setHeader: (key, value) => { headers[key] = value; }, send: buffer => { body = buffer; } });
    assert.equal(hash(body), hash(original.buffer)); assert.match(headers['Content-Disposition'], /integrity-final-opening.xlsx/); assert.match(headers['Content-Type'], /spreadsheetml/);
  });
  for (const [field, value] of [['Cost price', 26], ['Pack', '20 tablets'], ['Expiry', '2033-01-31'], ['MRP', 41], ['Selling price', 31]]) {
    await test(`Opening re-import rejects changed ${field} and rolls back inventory, linked Drug and movements`, async () => {
      const before = await fresh(openingItem), beforeDrug = await db.drug.findFirstOrThrow({ where: { branchId: branch.id, name: row.Name } }), beforeMoves = await db.stockTransaction.count({ where: { itemId: openingItem.id } });
      const out = await importer.importStarterExcel(workbook([{ ...row, [field]: value }]), branch.id, user.id);
      assert.equal(out.skipped, 1); assert.equal(out.errors[0].row, 2); assert.match(out.errors[0].message, /cannot replace its pack, expiry or price basis/);
      assert.deepEqual(await fresh(openingItem), before); assert.deepEqual(await db.drug.findUniqueOrThrow({ where: { id: beforeDrug.id } }), beforeDrug); assert.equal(await db.stockTransaction.count({ where: { itemId: openingItem.id } }), beforeMoves);
    });
  }
  await test('Valid opening metadata refresh adds an audit without changing stock or retained originals', async () => {
    const before = await fresh(openingItem); const out = await importer.importStarterExcel(workbook([{ ...row, Location: 'Rack B' }]), branch.id, user.id); assert.equal(out.updated, 1); assert.equal(out.stockAdjusted, 0);
    const after = await fresh(openingItem); assert.equal(after.currentStock, before.currentStock); assert.equal(after.costPrice, before.costPrice); assert.equal(after.packSize, before.packSize); assert.equal(after.storageLocation, 'Rack B');
    assert.equal(await db.auditLog.count({ where: { entityId: openingItem.id, action: 'OPENING_IMPORT_METADATA' } }), 1); assert.equal(hash((await importer.originalImport(imported.importId, branch.id)).data), hash(original.buffer));
  });
  await test('Retrying original workbook after operating sale does not reset stock or add movements', async () => {
    await post(await save('COUNTER_SALE', [{ inventoryId: openingItem.id, quantity: 1 }])); const before = await db.stockTransaction.count({ where: { itemId: openingItem.id } });
    const retry = await importer.importStarterExcel(original, branch.id, user.id); assert.equal(retry.importId, imported.importId); assert.equal((await fresh(openingItem)).currentStock, 9); assert.equal(await db.stockTransaction.count({ where: { itemId: openingItem.id } }), before);
  });
  await test('Opening import uses inclusive expiry-today stock status', async () => {
    const name = 'Opening today ' + randomUUID(); const out = await importer.importStarterExcel(workbook([{ ...row, Name: name, Batch: 'TODAY', Expiry: today.toISOString().slice(0, 10) }]), branch.id, user.id);
    assert.equal(out.skipped, 0); const i = await db.inventoryItem.findFirstOrThrow({ where: { branchId: branch.id, name } }); assert.equal(i.stockStatus, 'IN_STOCK');
  });
  const sourceFiles = ['backend/src/modules/inventory/inventory-workflow.service.ts', 'backend/src/modules/inventory/inventory-import.service.ts', 'backend/src/modules/inventory/inventory-stock.ts', 'backend/src/modules/inventory/inventory.controller.ts'];
  const evidence = { generatedAt: new Date().toISOString(), database: 'isolated local PostgreSQL :55443 inventory_workflow_acceptance', branchId: branch.id, basis: 'Direct services and controller response adapter; this does not prove live HTTP guards or browser behavior.', sourceSha256: Object.fromEntries(sourceFiles.map(file => [file, hash(fs.readFileSync(root + '/' + file))])), passed: results.filter(r => r.status === 'PASS').length, total: results.length, results };
  fs.mkdirSync(root + '/output/diagnostics', { recursive: true }); fs.writeFileSync(root + '/output/diagnostics/integrity-final-deltas-db.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2)); if (evidence.passed !== evidence.total) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
