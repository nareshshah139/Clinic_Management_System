#!/usr/bin/env node
// @cc [owner:nareshshah139,label:validation] guide-proof-read-only
// Guide fixtures MUST only be read in a PostgreSQL READ ONLY transaction on local :55443.
// Evidence MUST omit authentication material and distinguish stored initial fixture drafts from live records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const url = 'postgresql://invoice_review@127.0.0.1:55443/inventory_workflow_acceptance?schema=public';
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasourceUrl: url });
const fixtureBytes = fs.readFileSync('/tmp/inventory-guide-fixtures.json');
const f = JSON.parse(fixtureBytes);
const keys = ['opening', 'hold', 'loss', 'supplier-return', 'quotation', 'sale', 'customer-return', 'count', 'supplier-credit'];
const results = [];
function test(name, fn) { try { fn(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', error: error.message }); } }
const sum = (rows, key) => rows.reduce((n, row) => n + Number(row[key] || 0), 0);
(async () => {
  const snapshot = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const mode = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    assert.equal(mode[0].transaction_read_only, 'on');
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: f.item.id }, select: { id: true, branchId: true, name: true, unit: true, currentStock: true, heldStock: true, costPrice: true, sellingPrice: true, mrp: true, packSize: true, packUnit: true, updatedAt: true } });
    const documents = await tx.inventoryWorkflowDocument.findMany({ where: { id: { in: keys.map(k => f[k].id) } }, include: { effects: { orderBy: { createdAt: 'asc' } }, events: { orderBy: { version: 'asc' } } } });
    const movements = await tx.stockTransaction.findMany({ where: { itemId: item.id }, orderBy: { createdAt: 'asc' }, select: { id: true, branchId: true, type: true, quantity: true, quantityDelta: true, unitPrice: true, totalAmount: true, reference: true, createdAt: true } });
    const credits = await tx.inventorySupplierCredit.findMany({ where: { documentId: { in: documents.map(d => d.id) } }, include: { allocations: true } });
    return { readOnly: mode[0].transaction_read_only, item, documents, movements, credits };
  }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
  const by = Object.fromEntries(keys.map(k => [k, snapshot.documents.find(d => d.id === f[k].id)]));
  test('Every named guide source is present in the original guide branch', () => { assert.equal(snapshot.documents.length, keys.length); assert.equal(snapshot.item.branchId, f.item.branchId); assert(snapshot.documents.every(d => d.branchId === f.item.branchId)); assert(snapshot.movements.every(m => m.branchId === f.item.branchId)); });
  test('Final document states include released holds, converted quotation and posted effects', () => {
    const expected = { opening: 'POSTED', hold: 'RELEASED', loss: 'POSTED', 'supplier-return': 'POSTED', quotation: 'CONVERTED', sale: 'POSTED', 'customer-return': 'RELEASED', count: 'POSTED', 'supplier-credit': 'POSTED' };
    for (const [key, status] of Object.entries(expected)) assert.equal(by[key]?.status, status, key);
  });
  test('Count snapshot follows the independently derived 25-unit pre-count balance', () => {
    const line = by.count.payload.lines.find(l => l.inventoryId === f.item.id);
    const beforeCount = f.item.currentStock + 30 - 1 - 2 - 3 + 1;
    assert.equal(beforeCount, 25); assert.equal(line.systemStock, beforeCount);
    assert(Number.isInteger(line.physicalStock)); assert.equal(snapshot.item.currentStock, line.physicalStock);
    assert.equal(sum(by.count.effects, 'quantityDelta'), line.physicalStock - beforeCount);
  });
  test('Per-document stock and held effects match declared stock units exactly once', () => {
    const deltas = { opening: 30, hold: 0, loss: -1, 'supplier-return': -2, quotation: 0, sale: -3, 'customer-return': 1, 'supplier-credit': 0 };
    for (const [key, delta] of Object.entries(deltas)) assert.equal(sum(by[key].effects, 'quantityDelta'), delta, key);
    assert.equal(sum(by.hold.effects, 'heldDelta'), 1); // Four held, one disposed, three released.
    assert.equal(sum(by.loss.effects, 'heldDelta'), -1);
    assert.equal(sum(by['customer-return'].effects, 'heldDelta'), 0);
    assert.equal(sum(snapshot.documents.flatMap(d => d.effects), 'heldDelta'), 0);
    assert.equal(snapshot.item.heldStock, 0);
    assert.equal(snapshot.item.unit, f.item.unit); assert.equal(snapshot.item.packSize, f.item.packSize); assert.equal(snapshot.item.packUnit, f.item.packUnit);
  });
  test('Movement ledger independently reconciles physical balance and all workflow movement owners', () => {
    assert(snapshot.movements.every(m => Number.isInteger(m.quantityDelta)));
    assert.equal(f.item.currentStock + sum(snapshot.movements, 'quantityDelta'), snapshot.item.currentStock);
    const effects = snapshot.documents.flatMap(d => d.effects).filter(e => e.transactionId);
    assert.equal(effects.length, snapshot.movements.length);
    assert.equal(new Set(effects.map(e => e.transactionId)).size, effects.length);
    for (const effect of effects) { const movement = snapshot.movements.find(m => m.id === effect.transactionId); assert(movement); assert.equal(movement.quantityDelta, effect.quantityDelta); }
    assert.equal(by['supplier-return'].effects.filter(e => e.quantityDelta !== 0).length, 1);
  });
  test('Sale, return and hold disposal retain the intended original source links and refund terms', () => {
    assert.equal(by.loss.payload.sourceHoldId, by.hold.id); assert.equal(by.sale.sourceId, by.quotation.id);
    const saleMovement = by.sale.effects.find(e => e.transactionId).transactionId;
    assert.equal(by['customer-return'].payload.lines[0].sourceLineId, saleMovement);
    assert.equal(by['customer-return'].payload.lines[0].disposition, 'QUARANTINE');
    assert.equal(by['customer-return'].payload.refundMode, 'CASH');
    assert.equal(Number(by.sale.totalAmount), 336); assert.equal(Number(by['customer-return'].totalAmount), 112);
    assert.equal(sum(by['customer-return'].effects, 'amount'), -112);
  });
  test('Supplier return and amount-only note each create one correct independent credit', () => {
    assert.equal(snapshot.credits.length, 2);
    for (const [key, amount] of [['supplier-return', 112], ['supplier-credit', 20]]) {
      const credit = snapshot.credits.find(c => c.documentId === by[key].id); assert(credit); assert.equal(Number(credit.amount), amount);
      assert.equal(credit.supplierGstin, f.supplier.gstNumber); assert.equal(credit.branchId, f.item.branchId); assert.equal(credit.reversedAt, null);
      assert.equal(Number(credit.applied), sum(credit.allocations.filter(a => !a.reversedAt), 'amount'));
    }
    assert.equal(sum(snapshot.credits, 'amount'), 132);
  });
  test('Saved revisions retain ordered audit events matching the final status', () => {
    for (const d of snapshot.documents) { assert(d.events.length > 0); assert.equal(d.events.at(-1).version, d.version); assert.equal(d.events.at(-1).toStatus, d.status); assert.equal(new Set(d.events.map(e => e.version)).size, d.events.length); }
  });
  const evidence = {
    generatedAt: new Date().toISOString(), database: 'local PostgreSQL :55443 inventory_workflow_acceptance', transactionReadOnly: snapshot.readOnly,
    basis: 'Independent read-only database reconciliation of the guide IDs; fixture JSON retains initial draft values. No records were seeded or altered by this script.',
    fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'), branchId: f.item.branchId,
    passed: results.filter(r => r.status === 'PASS').length, total: results.length, results, item: snapshot.item,
    documents: snapshot.documents.map(d => ({ id: d.id, kind: d.kind, reference: d.reference, status: d.status, version: d.version, sourceId: d.sourceId, totalAmount: Number(d.totalAmount), lines: d.payload.lines.map(l => ({ inventoryId: l.inventoryId, quantity: l.quantity, freeQuantity: l.freeQuantity, systemStock: l.systemStock, physicalStock: l.physicalStock, sourceLineId: l.sourceLineId, disposition: l.disposition, total: l.total })), effects: d.effects.map(e => ({ id: e.id, transactionId: e.transactionId, sourceLineId: e.sourceLineId, quantityDelta: e.quantityDelta, sourceQuantity: e.sourceQuantity, heldDelta: e.heldDelta, amount: Number(e.amount) })), events: d.events.map(e => ({ action: e.action, fromStatus: e.fromStatus, toStatus: e.toStatus, version: e.version })) })),
    movements: snapshot.movements,
    credits: snapshot.credits.map(c => ({ id: c.id, documentId: c.documentId, amount: Number(c.amount), applied: Number(c.applied), reversedAt: c.reversedAt, allocations: c.allocations.map(a => ({ id: a.id, purchaseInvoiceId: a.purchaseInvoiceId, amount: Number(a.amount), reversedAt: a.reversedAt })) }))
  };
  fs.mkdirSync(root + '/output/diagnostics/inventory-workflow', { recursive: true });
  fs.writeFileSync(root + '/output/diagnostics/inventory-workflow/workflow-db-proof.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: evidence.passed, total: evidence.total, results, item: snapshot.item }, null, 2));
  if (evidence.passed !== evidence.total) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
