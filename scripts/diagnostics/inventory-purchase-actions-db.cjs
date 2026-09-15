#!/usr/bin/env node
// Creates uniquely named synthetic fixtures only in the dedicated local acceptance database.
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const url = 'postgresql://invoice_review@127.0.0.1:55443/inventory_workflow_acceptance?schema=public';
process.env.DATABASE_URL = url;
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/backend/tsconfig.json' });
const { PrismaClient } = require('@prisma/client');
const { PharmacyPurchaseInvoiceService } = require(root + '/backend/src/modules/pharmacy/pharmacy-purchase-invoice.service');
const { InventoryWorkflowService } = require(root + '/backend/src/modules/inventory/inventory-workflow.service');
const { InventoryPurchaseActionsService } = require(root + '/backend/src/modules/inventory/inventory-purchase-actions.service');
const db = new PrismaClient({ datasourceUrl: url }), purchases = new PharmacyPurchaseInvoiceService(db), workflow = new InventoryWorkflowService(db), actions = new InventoryPurchaseActionsService(db, workflow, purchases);
const output = path.join(root, 'output/diagnostics/purchase-actions');
fs.mkdirSync(output, { recursive: true });
const results = [], token = randomUUID().slice(0, 8);
async function test(name, run) { try { await run(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', error: error.stack }); } }
async function main() {
  const branch = await db.branch.create({ data: { name: `Purchase actions acceptance ${token}`, address: 'ISOLATED SYNTHETIC ACCEPTANCE DATA' } });
  const otherBranch = await db.branch.create({ data: { name: `Purchase boundary ${token}`, address: 'ISOLATED SYNTHETIC ACCEPTANCE DATA' } });
  const user = await db.user.create({ data: { branchId: branch.id, firstName: 'Purchase', lastName: 'Reviewer', role: 'ADMIN', email: `purchase-actions-${token}@example.invalid`, password: 'synthetic-disabled-login' } });
  const reader = await db.user.create({ data: { branchId: branch.id, firstName: 'Purchase', lastName: 'Reader', role: 'RECEPTION', email: `purchase-reader-${token}@example.invalid`, password: 'synthetic-disabled-login', permissions: JSON.stringify(['pharmacy:purchase-invoice:read']) } });
  const actor = { id: user.id, branchId: branch.id, role: user.role }, readActor = { id: reader.id, branchId: branch.id, role: reader.role };
  const supplier = await db.supplier.create({ data: { branchId: branch.id, name: `Purchase fixture supplier ${token}`, gstNumber: '36AAICV6142K1ZY' } });
  const name = `Acceptance serum ${token}`, gstin = supplier.gstNumber;
  const drug = await db.drug.create({ data: { branchId: branch.id, name, price: 1450, manufacturerName: '', packSizeLabel: '60ml', type: 'cosmetic', category: 'Cosmetic', requiresPrescription: false } });
  const inventory = await db.inventoryItem.create({ data: { branchId: branch.id, name, type: 'CONSUMABLE', unit: 'BOTTLES', currentStock: 0, costPrice: 900, sellingPrice: 1450, mrp: 1450, batchNumber: 'WWD0040', expiryDate: new Date('2028-02-29'), gstRate: 18, packSize: 60, packUnit: 'Bottle', status: 'ACTIVE', drugs: { connect: { id: drug.id } } } });
  const dto = (invoiceNumber, overrides = {}) => ({ distributorName: supplier.name, distributorGstin: gstin, distributorDlNo: 'SYNTHETIC-DL', invoiceNumber, invoiceDate: '2026-09-01', goodsReceivedDate: '2026-09-02', billType: 'CASH', doctorNameOrRegNo: 'Synthetic clinic', source: 'MANUAL', grossAmount: 9830.50, taxableAmount: 9830.50, totalCgst: 884.745, totalSgst: 884.745, totalIgst: 0, totalGst: 1769.49, rounding: 0.01, netPayable: 11600,
    items: [{ productName: name, manufacturer: '', packSize: '60ml', packUnitType: 'Bottle', hsnCode: '33049990', batchNumber: 'WWD0040', expiryMonth: 2, expiryYear: 2028, quantityPurchased: 10, freeQuantity: 2, mrp: 1450, purchaseRate: 983.05, discountPercent: 0, specialDiscountPercent: 0, schemeAmount: 0, taxableAmount: 9830.50, cgstPercent: 9, sgstPercent: 9, igstPercent: 0, gstAmount: 1769.49, lineTotal: 11599.99 }], ...overrides });
  let bill, receipt, original, order, gatePass;
  await test('Posted inward challan followed by concurrent bill commits adds stock once and records actual bill prices', async () => {
    order = await workflow.saveDocument(actor, { kind: 'PURCHASE_ORDER', reference: `PO-${token}`, supplierId: supplier.id, requestKey: randomUUID(), payload: { lines: [{ inventoryId: inventory.id, quantity: 10, freeQuantity: 2, unitPrice: 900 }] } });
    order = await workflow.transition(actor, order.id, { version: order.version, action: 'SUBMIT' });
    order = await workflow.transition(actor, order.id, { version: order.version, action: 'APPROVE' });
    gatePass = await workflow.saveDocument(actor, { kind: 'GATE_PASS', reference: `GP-${token}`, supplierId: supplier.id, sourceId: order.id, requestKey: randomUUID(), payload: { lines: [{ inventoryId: inventory.id, quantity: 10, freeQuantity: 2 }] } });
    gatePass = await workflow.transition(actor, gatePass.id, { version: gatePass.version, action: 'POST' });
    receipt = await workflow.saveDocument(actor, { kind: 'INWARD_CHALLAN', reference: `RC-${token}`, supplierId: supplier.id, sourceId: order.id, requestKey: randomUUID(), payload: { lines: [{ inventoryId: inventory.id, quantity: 10, freeQuantity: 2, unitPrice: 900, sourceLineId: order.payload.lines[0].id }] } });
    receipt = await workflow.transition(actor, receipt.id, { version: receipt.version, action: 'POST' });
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } })).currentStock, 12);
    bill = await purchases.createDraft(dto(`SB-26-43742-${token}`, { workflowReceiptId: receipt.id }), branch.id, user.id);
    assert.equal(bill.reconciliationIssues.length, 0);
    bill = await purchases.markReviewed(bill.id, {}, branch.id, user.id);
    const beforeMovements = await db.stockTransaction.count({ where: { branchId: branch.id } });
    const values = await Promise.all([purchases.commitStock(bill.id, branch.id, user.id), purchases.commitStock(bill.id, branch.id, user.id)]);
    assert(values.every(value => value.status === 'STOCK_COMMITTED'));
    const stock = await db.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    assert.equal(stock.currentStock, 12); assert.equal(stock.costPrice, 983.05);
    assert.equal(JSON.parse(stock.metadata).landingCostPerStockUnit, 819.21);
    assert.equal(await db.stockTransaction.count({ where: { branchId: branch.id } }), beforeMovements);
    bill = await purchases.findOne(bill.id, branch.id);
    assert.equal(bill.netPayable, 11600); assert.equal(bill.items[0].inventoryItemId, inventory.id);
    await assert.rejects(() => purchases.createDraft(dto(`DOUBLE-${token}`, { workflowReceiptId: receipt.id }), branch.id, user.id));
  });
  await test('Posted bill cannot be re-reviewed or overwritten as a draft', async () => {
    await assert.rejects(() => purchases.markReviewed(bill.id, {}, branch.id, user.id), /already posted/);
    await assert.rejects(() => purchases.updateDraft(bill.id, dto(bill.invoiceNumber), branch.id, user.id), /no longer an editable draft/);
    assert.equal((await purchases.findOne(bill.id, branch.id)).status, 'STOCK_COMMITTED');
  });
  await test('Supporting originals append after posting, preserve exact bytes, deduplicate and reject cross-purchase reuse', async () => {
    const sharp = require('sharp');
    const bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3b82f6' } }).png().toBuffer();
    const file = { buffer: bytes, size: bytes.length, originalname: 'supporting-original.png', mimetype: 'image/png' };
    original = await actions.attachOriginal(actor, bill.id, file);
    assert.deepEqual(Buffer.from((await purchases.getOriginalDocument(original.id, branch.id)).data), bytes);
    assert.equal((await actions.attachOriginal(actor, bill.id, file)).id, original.id);
    const secondBytes = await sharp({ create: { width: 41, height: 31, channels: 3, background: '#475569' } }).png().toBuffer();
    await actions.attachOriginal(actor, bill.id, { ...file, buffer: secondBytes, size: secondBytes.length, originalname: 'delivery-original.png' });
    const secondBill = await purchases.createDraft(dto(`SOURCE-BOUNDARY-${token}`), branch.id, user.id);
    await assert.rejects(() => actions.attachOriginal(actor, secondBill.id, file), /already attached/);
    assert.equal((await purchases.findOne(bill.id, branch.id)).documents.length, 2);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } })).currentStock, 12);
    await assert.rejects(() => purchases.getOriginalDocument(original.id, otherBranch.id), /not found/);
    await assert.rejects(() => actions.attachOriginal(readActor, bill.id, file), /requires/);
    await assert.rejects(() => actions.attachOriginal(actor, bill.id, { ...file, buffer: Buffer.from('<script>bad</script>') }), /valid photo or PDF/);
  });
  await test('Versioned location and future discount edit preserves stock, bill taxes and financial totals with actor audit', async () => {
    const before = await actions.detail(actor, bill.id);
    const input = { version: before.version, location: 'Shelf P-12', futureSaleDiscountPercent: 7.5, reason: 'Move to reception shelf' };
    await actions.saveMetadata(actor, bill.id, input);
    await assert.rejects(() => actions.saveMetadata(actor, bill.id, input), /changed/);
    await assert.rejects(() => actions.saveMetadata(readActor, bill.id, { ...input, version: input.version + 1 }), /requires/);
    const after = await actions.detail(actor, bill.id), stock = await db.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    assert.equal(stock.storageLocation, 'Shelf P-12'); assert.equal(stock.currentStock, 12);
    for (const key of ['netPayable', 'totalGst', 'rounding', 'status']) assert.equal(after.invoice[key], before.invoice[key]);
    assert.equal(after.events.filter(event => event.action === 'LOCATION_DISCOUNT_METADATA_UPDATED').length, 1);
    assert(after.events.some(event => event.action === 'STOCK_COMMITTED' && event.actorId === actor.id));
    assert(after.related.some(doc => doc.id === receipt.id));
    assert(after.related.some(doc => doc.id === order.id)); assert(after.related.some(doc => doc.id === gatePass.id));
    await db.pharmacyPurchasePayment.create({ data: { branchId: branch.id, distributorGstin: gstin, distributorName: supplier.name, paymentDate: new Date(), mode: 'CASH', paidBy: user.id, amount: 100, allocations: { create: { purchaseInvoiceId: bill.id, amount: 100 } } } });
    assert((await actions.detail(actor, bill.id)).events.some(event => event.action === 'PAYMENT_ALLOCATED'));
    assert(!(await actions.detail(readActor, bill.id)).events.some(event => event.action === 'PAYMENT_ALLOCATED'));
  });
  await test('Stale draft rejects edits and preserves the newer saved line and audit', async () => {
    let draft = await purchases.createDraft(dto(`STALE-${token}`), branch.id, user.id);
    const stale = draft.updatedAt.toISOString();
    draft = await purchases.updateDraft(draft.id, dto(draft.invoiceNumber, { expectedUpdatedAt: stale, handwrittenNotes: 'Latest operator correction' }), branch.id, user.id);
    await assert.rejects(() => purchases.updateDraft(draft.id, dto(draft.invoiceNumber, { expectedUpdatedAt: stale, handwrittenNotes: 'Stale overwrite' }), branch.id, user.id));
    assert.equal((await purchases.findOne(draft.id, branch.id)).handwrittenNotes, 'Latest operator correction');
  });
  await test('Injected final audit failure rolls back invoice state, stock, line links and intermediate mapping logs', async () => {
    let draft = await purchases.createDraft(dto(`ROLLBACK-${token}`), branch.id, user.id);
    draft = await purchases.markReviewed(draft.id, {}, branch.id, user.id);
    const beforeStock = await db.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    const beforeMovements = await db.stockTransaction.count({ where: { branchId: branch.id } });
    const beforeLogs = await db.auditLog.count({ where: { entityId: draft.id } });
    const audit = purchases.purchaseAudit;
    purchases.purchaseAudit = async function (...args) { if (args[4] === 'STOCK_COMMITTED') throw new Error('Synthetic final audit failure'); return audit.apply(this, args); };
    try { await assert.rejects(() => purchases.commitStock(draft.id, branch.id, user.id), /Synthetic final audit failure/); }
    finally { purchases.purchaseAudit = audit; }
    assert.equal((await purchases.findOne(draft.id, branch.id)).status, 'REVIEWED');
    assert.equal((await purchases.findOne(draft.id, branch.id)).items[0].inventoryItemId, null);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } })).currentStock, beforeStock.currentStock);
    assert.equal(await db.stockTransaction.count({ where: { branchId: branch.id } }), beforeMovements);
    assert.equal(await db.auditLog.count({ where: { entityId: draft.id } }), beforeLogs);
  });
  await test('Failed OCR preserves original bytes, uploader and a truthful failure event for draft recovery', async () => {
    const bytes = await require('sharp')({ create: { width: 43, height: 29, channels: 3, background: '#2563eb' } }).png().toBuffer();
    const extract = purchases.extractDocumentDraft;
    purchases.extractDocumentDraft = async () => { throw new Error('Synthetic OCR failure'); };
    try { await assert.rejects(() => purchases.extractDraftFromDocument({ buffer: bytes, size: bytes.length, originalname: 'failed-ocr.png', mimetype: 'image/png' }, branch.id, user.id)); }
    finally { purchases.extractDocumentDraft = extract; }
    const retained = await db.pharmacyPurchaseInvoiceDocument.findFirstOrThrow({ where: { branchId: branch.id, fileName: 'failed-ocr.png' } });
    assert.equal(retained.purchaseInvoiceId, null); assert.equal(retained.uploadedBy, actor.id); assert.deepEqual(Buffer.from(retained.data), bytes);
    const events = await db.auditLog.findMany({ where: { entity: 'PharmacyPurchaseInvoiceDocument', entityId: retained.id } });
    assert(events.some(event => event.action === 'OCR_FAILED' && event.userId === actor.id));
  });
  await test('Full register CSV and Excel preserve every matching bill/line across pages and query filters', async () => {
    for (let index = 0; index < 35; index++) await purchases.createDraft(dto(`ALL-ROWS-${token}-${String(index).padStart(2, '0')}`), branch.id, user.id);
    const query = { search: `ALL-ROWS-${token}`, page: 2, limit: 10, source: 'MANUAL' };
    assert.equal((await purchases.findAll(query, branch.id)).data.length, 10);
    const csv = await actions.export(actor, 'csv', undefined, query), xlsx = await actions.export(actor, 'xlsx', undefined, query), XLSX = require('xlsx');
    fs.writeFileSync(path.join(output, 'purchase-register.csv'), csv.data); fs.writeFileSync(path.join(output, 'purchase-register.xlsx'), xlsx.data);
    const book = XLSX.read(xlsx.data, { type: 'buffer' }), rows = XLSX.utils.sheet_to_json(book.Sheets['All purchase rows']);
    assert.equal(rows.length, 35); assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Bills).length, 35);
    for (const row of rows) { assert.equal(row['Net Payable'], 11600); assert.equal(row['Line Quantity Purchased'], 10); assert.equal(row['Line Free Quantity'], 2); assert.equal(row['Line Scheme Amount'], 0); }
    const csvRows = XLSX.utils.sheet_to_json(XLSX.read(csv.data, { type: 'buffer' }).Sheets.Sheet1); assert.equal(csvRows.length, 35);
    assert.equal((await purchases.findAll({ search: `purchase:${bill.id}` }, branch.id)).data[0].id, bill.id);
  });
  await test('PDF and QR export are complete, nonempty read-only artifacts of the saved posted purchase', async () => {
    const pdf = await actions.export(actor, 'pdf', bill.id), qr = await actions.export(actor, 'qr', bill.id);
    assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-'); assert.equal(qr.data.subarray(0, 5).toString(), '%PDF-');
    fs.writeFileSync(path.join(output, 'purchase.pdf'), pdf.data); fs.writeFileSync(path.join(output, 'purchase-qr.pdf'), qr.data);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } })).currentStock, 12);
    assert.equal((await purchases.findOne(bill.id, branch.id)).netPayable, 11600);
  });
  const report = { at: new Date().toISOString(), database: '127.0.0.1:55443/inventory_workflow_acceptance', branchId: branch.id, userId: user.id, invoiceId: bill?.id, receiptId: receipt?.id, results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
