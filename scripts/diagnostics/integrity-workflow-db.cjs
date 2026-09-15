#!/usr/bin/env node
// Isolated regression fixtures only. No resets, migrations, production data or outgoing messages.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const url = 'postgresql://invoice_review@127.0.0.1:55443/inventory_workflow_acceptance?schema=public';
process.env.DATABASE_URL = url;
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/backend/tsconfig.json' });
const { PrismaClient } = require('@prisma/client');
const { InventoryWorkflowService } = require(root + '/backend/src/modules/inventory/inventory-workflow.service');
const { InventoryReplenishmentService } = require(root + '/backend/src/modules/inventory/inventory-replenishment.service');
const { InventoryWorkspaceService } = require(root + '/backend/src/modules/inventory/inventory-workspace.service');
const { PharmacyPurchaseLedgerService } = require(root + '/backend/src/modules/pharmacy/pharmacy-purchase-ledger.service');
const { PharmacyComplianceService } = require(root + '/backend/src/modules/pharmacy/pharmacy-compliance.service');
const db = new PrismaClient({ datasourceUrl: url });
const wf = new InventoryWorkflowService(db), ws = new InventoryWorkspaceService(db, wf), ledger = new PharmacyPurchaseLedgerService(db), reports = new PharmacyComplianceService(db);
const results = [];
async function test(name, run) { try { await run(); results.push({ name, status: 'PASS' }); } catch (e) { results.push({ name, status: 'FAIL', error: e.stack }); } }
(async () => {
  const branch = await db.branch.create({ data: { name: 'Integrity isolated ' + randomUUID(), address: 'TEST FIXTURES ONLY' } });
  const user = await db.user.create({ data: { branchId: branch.id, email: 'integrity-' + randomUUID() + '@example.invalid', firstName: 'Local', lastName: 'Integrity', role: 'ADMIN', password: 'no-login-fixture', status: 'ACTIVE' } });
  const actor = { id: user.id, branchId: branch.id, role: 'ADMIN' };
  const supplier = await db.supplier.create({ data: { branchId: branch.id, name: 'Integrity supplier', gstNumber: '36AAICV6142K1ZY' } });
  const item = () => db.inventoryItem.create({ data: { branchId: branch.id, name: 'Integrity ' + randomUUID(), type: 'MEDICINE', unit: 'PIECES', currentStock: 100, heldStock: 0, costPrice: 10, sellingPrice: 20, mrp: 25, gstRate: 18, expiryDate: new Date('2030-12-31'), batchNumber: randomUUID(), status: 'ACTIVE', stockStatus: 'IN_STOCK' } });
  const fresh = i => db.inventoryItem.findUniqueOrThrow({ where: { id: i.id } });
  const draft = (kind, i, quantity = 5, extra = {}) => wf.saveDocument(actor, { kind, reference: kind + '-' + randomUUID(), requestKey: randomUUID(), supplierId: supplier.id, ...extra, payload: { reason: 'Isolated integrity regression', lines: [{ inventoryId: i.id, quantity }], ...extra.payload } });
  const go = (d, action) => wf.transition(actor, d.id, { action, version: d.version, reason: 'Integrity regression correction' });
  const bill = (i, qty = 10, net = 100) => db.pharmacyPurchaseInvoice.create({ data: { branchId: branch.id, distributorName: supplier.name, distributorGstin: supplier.gstNumber, distributorDlNo: 'TEST', invoiceNumber: randomUUID(), invoiceDate: new Date(), billType: 'CREDIT', doctorNameOrRegNo: 'TEST', grossAmount: net, taxableAmount: net, totalGst: 0, netPayable: net, status: 'STOCK_COMMITTED', items: { create: [{ inventoryItemId: i.id, lineNumber: 1, productName: i.name, manufacturer: '', packSize: '1', packUnitType: i.unit, hsnCode: '3004', batchNumber: i.batchNumber, expiryMonth: 12, expiryYear: 2030, quantityPurchased: qty, freeQuantity: 0, mrp: 25, discountPercent: 0, purchaseRate: 10, taxableAmount: net, gstAmount: 0, lineTotal: net }] } }, include: { items: true } });
  await test('Specific hold disposal rejects borrowing from another hold and preserves release balance', async () => {
    const i = await item(); let a = await go(await draft('HOLD', i, 4), 'POST'), b = await go(await draft('HOLD', i, 10), 'POST');
    const oversized = await draft('LOSS', i, 5, { payload: { sourceHoldId: a.id } });
    await assert.rejects(() => go(oversized, 'POST'), /source hold/);
    const loss = await go(await draft('LOSS', i, 3, { payload: { sourceHoldId: a.id } }), 'POST');
    assert.equal((await fresh(i)).currentStock, 97); assert.equal((await fresh(i)).heldStock, 11);
    await assert.rejects(() => go(a, 'REVERSE'), /linked hold/);
    a = await go(a, 'RELEASE'); assert.equal((await fresh(i)).heldStock, 10);
    await assert.rejects(() => go(loss, 'REVERSE'), /active hold/);
    await go(b, 'RELEASE'); assert.equal((await fresh(i)).heldStock, 0);
  });
  await test('Quarantined customer return can release its own units while an unrelated hold remains', async () => {
    const i = await item(); const h = await go(await draft('HOLD', i, 6), 'POST');
    const sale = await go(await draft('COUNTER_SALE', i, 5), 'POST');
    const source = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: sale.id } });
    let r = await go(await draft('SALES_RETURN', i, 3, { payload: { lines: [{ inventoryId: i.id, quantity: 3, sourceLineId: source.transactionId, disposition: 'QUARANTINE' }] } }), 'POST');
    assert.equal((await fresh(i)).heldStock, 9); r = await go(r, 'RELEASE'); assert.equal((await fresh(i)).heldStock, 6);
    await go(r, 'REVERSE'); assert.equal((await fresh(i)).currentStock, 95); assert.equal((await fresh(i)).heldStock, 6);
    await go(h, 'RELEASE');
  });
  await test('Supplier-return duplicate lines and challan edits cannot exceed original purchased stock', async () => {
    const i = await item(), purchase = await bill(i), line = { inventoryId: i.id, sourceLineId: purchase.items[0].id, quantity: 6 };
    const d = await draft('SUPPLIER_RETURN', i, 6, { purchaseInvoiceId: purchase.id, payload: { lines: [line, line] } });
    await assert.rejects(() => go(d, 'CHALLAN'), /unreturned purchase/); assert.equal((await fresh(i)).currentStock, 100);
    const c = await go(await draft('SUPPLIER_RETURN', i, 4, { purchaseInvoiceId: purchase.id, payload: { lines: [{ ...line, quantity: 4 }] } }), 'CHALLAN');
    await assert.rejects(() => wf.saveDocument(actor, { ...c, payload: { ...c.payload, lines: c.payload.lines.map(l => ({ ...l, quantity: 11 })) } }, c.id), /unreturned purchase/);
    assert.equal((await fresh(i)).currentStock, 96); assert.equal((await wf.document(actor, c.id)).version, c.version);
  });
  await test('Held supplier challan edits, finalisation and reversal retain source ownership and credit exactly once', async () => {
    const i = await item(); const h = await go(await draft('HOLD', i, 10), 'POST');
    let c = await go(await draft('SUPPLIER_RETURN', i, 4, { payload: { sourceHoldId: h.id } }), 'CHALLAN');
    c = await wf.saveDocument(actor, { ...c, payload: { ...c.payload, lines: c.payload.lines.map(l => ({ ...l, quantity: 7 })) } }, c.id);
    assert.equal((await fresh(i)).currentStock, 93); assert.equal((await fresh(i)).heldStock, 3);
    c = await go(c, 'POST'); assert.equal(await db.inventorySupplierCredit.count({ where: { documentId: c.id } }), 1);
    await go(c, 'REVERSE'); assert.equal((await fresh(i)).currentStock, 100); assert.equal((await fresh(i)).heldStock, 10);
  });
  await test('Sale reversal rejects active returns; reversing return restores remaining return capacity', async () => {
    const i = await item(), sale = await go(await draft('COUNTER_SALE', i, 4), 'POST');
    const e = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: sale.id } });
    const returnDraft = n => draft('SALES_RETURN', i, n, { payload: { lines: [{ inventoryId: i.id, quantity: n, sourceLineId: e.transactionId, disposition: 'RESTOCK' }] } });
    const r = await go(await returnDraft(2), 'POST'); await assert.rejects(() => go(sale, 'REVERSE'), /customer returns/);
    await go(r, 'REVERSE'); const replacement = await go(await returnDraft(4), 'POST'); await go(replacement, 'REVERSE');
    await go(sale, 'REVERSE'); await assert.rejects(async () => go(await returnDraft(1), 'POST'), /original sale was reversed/);
    assert.equal((await fresh(i)).currentStock, 100);
  });
  await test('Receipt reversal recomputes PO status and a cancelled remainder never accepts new receipts', async () => {
    const i = await item(); let po = await go(await draft('PURCHASE_ORDER', i, 10), 'SUBMIT'); po = await go(po, 'APPROVE');
    const receive = q => draft('INWARD_CHALLAN', i, q, { sourceId: po.id, payload: { lines: [{ inventoryId: i.id, quantity: q, sourceLineId: po.payload.lines[0].id }] } });
    const r = await go(await receive(10), 'POST'); assert.equal((await wf.document(actor, po.id)).status, 'RECEIVED');
    await go(r, 'REVERSE'); assert.equal((await wf.document(actor, po.id)).status, 'APPROVED');
    const r2 = await go(await receive(4), 'POST');
    const before = await fresh(i); await new InventoryReplenishmentService(db,wf).cancelRemaining(actor,po.id,{version:(await wf.document(actor,po.id)).version,reason:'Cancel unreceived remainder'});
    await assert.rejects(async () => go(await receive(1), 'POST'), /approved purchase order/); assert.equal((await fresh(i)).currentStock, before.currentStock);
    await go(r2, 'REVERSE'); assert.equal((await wf.document(actor, po.id)).status, 'CANCELLED');
  });
  await test('Raw movement correction cannot bypass workflow accounting', async () => {
    const i = await item(), d = await go(await draft('LOSS', i, 3), 'POST'), effect = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: d.id } });
    await assert.rejects(() => ws.correctMovement(actor, { transactionId: effect.transactionId, correctDelta: 0, requestKey: randomUUID(), reason: 'Correction' }), /source workflow or invoice/);
    assert.equal((await fresh(i)).currentStock, 97);
  });
  await test('Concurrent payment retries create one allocation; payment versus credit cannot overpay', async () => {
    const i = await item(), p = await bill(i), key = randomUUID();
    const payment = (amount, requestKey) => ledger.createPayment({ distributorGstin: supplier.gstNumber, distributorName: supplier.name, paymentDate: new Date().toISOString(), mode: 'CASH', amount, requestKey, allocations: [{ purchaseInvoiceId: p.id, amount }] }, branch.id, user.id);
    const duplicates = await Promise.all([payment(20, key), payment(20, key)]); assert.equal(duplicates[0].id, duplicates[1].id);
    const creditDoc = await go(await draft('CREDIT_NOTE', i, 10, { payload: { lines: [{ inventoryId: i.id, quantity: 10, unitPrice: 10, gstRate: 0 }] } }), 'POST');
    const credit = await db.inventorySupplierCredit.findUniqueOrThrow({ where: { documentId: creditDoc.id } });
    const race = await Promise.allSettled([payment(70, randomUUID()), ws.allocateCredit(actor, { creditId: credit.id, purchaseInvoiceId: p.id, amount: 70, requestKey: randomUUID() })]);
    assert.equal(race.filter(x => x.status === 'fulfilled').length, 1);
    const balance = (await ws.credits(actor)).invoices.find(x => x.id === p.id); assert.equal(balance.outstanding, 10);
  });
  await test('Credit ledger allocation and reversal events reconcile cash and outstanding', async () => {
    const i = await item(), p = await bill(i), c = await go(await draft('CREDIT_NOTE', i, 5, { payload: { lines: [{ inventoryId: i.id, quantity: 5, unitPrice: 10, gstRate: 0 }] } }), 'POST');
    const credit = await db.inventorySupplierCredit.findUniqueOrThrow({ where: { documentId: c.id } });
    const a = await ws.allocateCredit(actor, { creditId: credit.id, purchaseInvoiceId: p.id, amount: 40, requestKey: randomUUID() });
    await assert.rejects(() => go(c, 'REVERSE'), /allocations/);
    const account = await ledger.getDistributorLedger(branch.id, supplier.gstNumber);
    assert.equal(account.invoices.find(x => x.id === p.id).outstanding, 60);
    assert.equal(account.invoices.find(x => x.id === p.id).paid, 0);
    assert(account.runningLedger.some(e => e.type === 'CREDIT_ALLOCATION' && e.allocationId === a.id));
    await ws.reverseAllocation(actor, a.id, 'Wrong application');
    const reversed = await ledger.getDistributorLedger(branch.id, supplier.gstNumber); assert(reversed.runningLedger.some(e => e.type === 'CREDIT_REVERSAL' && e.allocationId === a.id));
    assert.equal(reversed.invoices.find(x => x.id === p.id).outstanding, 100);
    assert.equal(reversed.runningLedger.at(-1).runningBalance, reversed.invoices.reduce((n,x)=>n+x.outstanding,0));
    await go(c, 'REVERSE');
  });
  await test('Posted returns use original sale terms and historical costs after item cost changes', async () => {
    const i = await item(), sale = await go(await draft('COUNTER_SALE', i, 4, { payload: { lines: [{ inventoryId: i.id, quantity: 4, unitPrice: 20, gstRate: 18 }] } }), 'POST');
    const e = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: sale.id } });
    await db.inventoryItem.update({ where: { id: i.id }, data: { costPrice: 999, sellingPrice: 2000 } });
    const r = await go(await draft('SALES_RETURN', i, 2, { payload: { lines: [{ inventoryId: i.id, quantity: 2, unitPrice: 7777, gstRate: 99, sourceLineId: e.transactionId, disposition: 'RESTOCK' }] } }), 'POST');
    assert.equal(r.totalAmount, 47.2);
    const effect = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: r.id } });
    const movement = await db.stockTransaction.findUniqueOrThrow({ where: { id: effect.transactionId } }); assert.equal(JSON.parse(movement.notes).costPerStockUnit, 10);
    const rows = await db.stockTransaction.findMany({ where: { itemId: i.id } });
    assert.equal(rows.reduce((n,m)=>n-(m.quantityDelta||0)*JSON.parse(m.notes).costPerStockUnit,0),20);
    const report = await reports.getMonthlyReport({month:new Date().toISOString().slice(0,7)},branch.id); assert.equal(report.profitAndLoss.unknownCostMovementCount,0);
  });
  await test('Concurrent returns cannot exceed sale source even with duplicate lines', async () => {
    const i = await item(), sale = await go(await draft('COUNTER_SALE', i, 5), 'POST');
    const e = await db.inventoryWorkflowEffect.findFirstOrThrow({ where: { documentId: sale.id } });
    const line = { inventoryId: i.id, quantity: 3, sourceLineId: e.transactionId, disposition: 'RESTOCK' };
    const dup = await draft('SALES_RETURN',i,3,{payload:{lines:[line,line]}}); await assert.rejects(()=>go(dup,'POST'),/unreturned quantity/);
    const a = await draft('SALES_RETURN',i,3,{payload:{lines:[line]}}), b = await draft('SALES_RETURN',i,3,{payload:{lines:[line]}});
    const race = await Promise.allSettled([go(a,'POST'),go(b,'POST')]); assert.equal(race.filter(r=>r.status==='fulfilled').length,1); assert.equal((await fresh(i)).currentStock,98);
  });
  await test('Failure after stock write rolls back the document, movement and physical balance', async () => {
    const i=await item(), d=await draft('LOSS',i,3);
    const fault = new Proxy(db, {get(target,key){if(key==='$transaction')return (run,opts)=>target.$transaction(tx=>run(new Proxy(tx,{get(t,k){if(k==='inventoryWorkflowEffect')return {...t[k],create:async()=>{throw new Error('INJECTED_EFFECT_FAILURE')}};return t[k]}})),opts);const v=target[key];return typeof v==='function'?v.bind(target):v;}});
    await assert.rejects(()=>new InventoryWorkflowService(fault).transition(actor,d.id,{version:d.version,action:'POST'}),/INJECTED_EFFECT_FAILURE/);
    assert.equal((await fresh(i)).currentStock,100);assert.equal((await wf.document(actor,d.id)).status,'DRAFT');assert.equal(await db.stockTransaction.count({where:{itemId:i.id}}),0);
  });
  await test('Bulk locations compare all revisions and preserve stock; stock filters use full matching population', async () => {
    const a=await item(),b=await item();
    await assert.rejects(()=>ws.bulkLocations(actor,{items:[{id:a.id,updatedAt:a.updatedAt.toISOString()},{id:b.id,updatedAt:'stale'}],location:'Shelf Z',reason:'Move fixtures'}),/changed/);
    assert.equal((await fresh(a)).storageLocation,null);
    await ws.bulkLocations(actor,{items:[{id:a.id,updatedAt:a.updatedAt.toISOString()},{id:b.id,updatedAt:b.updatedAt.toISOString()}],location:'Shelf Z',reason:'Move fixtures'});
    assert.equal((await fresh(a)).currentStock,100);
    const list=await ws.stock(actor,{storageLocation:'Shelf Z',stock:'POSITIVE',minPrice:9,maxPrice:11,priceBasis:'PTR',sortBy:'currentStock',sortOrder:'desc',limit:1});
    assert.equal(list.total,2);assert.equal(list.rows.length,1);assert.equal(list.valuation.current.PTR,2000);assert(list.filterScope.expiryBoundary.includes('UTC'));
    assert.equal(await db.auditLog.count({where:{userId:user.id,action:'INVENTORY_BULK_LOCATION'}}),2);
  });
  await test('Held challan can finalize its credit after remaining source hold is released', async () => {
    const i=await item(),h=await go(await draft('HOLD',i,10),'POST');
    const c=await go(await draft('SUPPLIER_RETURN',i,4,{payload:{sourceHoldId:h.id}}),'CHALLAN');
    await go(h,'RELEASE');const before=await fresh(i);await go(c,'POST');
    assert.equal((await fresh(i)).currentStock,before.currentStock);assert.equal((await fresh(i)).heldStock,0);
    assert.equal(await db.inventorySupplierCredit.count({where:{documentId:c.id}}),1);
  });
  await test('Split refunds allocate the final GST cent once and retain signed monetary effects', async () => {
    const i=await item(),sale=await go(await draft('COUNTER_SALE',i,3,{payload:{lines:[{inventoryId:i.id,quantity:3,unitPrice:0.01,gstRate:33.33}]}}),'POST');
    const e=await db.inventoryWorkflowEffect.findFirstOrThrow({where:{documentId:sale.id}});let refunded=0;const returned=[];
    for(let n=0;n<3;n++){const r=await go(await draft('SALES_RETURN',i,1,{payload:{lines:[{inventoryId:i.id,quantity:1,sourceLineId:e.transactionId,disposition:'RESTOCK'}]}}),'POST');refunded+=r.totalAmount;returned.push(r);const effect=await db.inventoryWorkflowEffect.findFirstOrThrow({where:{documentId:r.id}});assert.equal(Number(effect.amount),-r.totalAmount);}
    assert.equal(Math.round(refunded*100),Math.round(sale.totalAmount*100));
    await go(returned[0],'REVERSE');const replacement=await go(await draft('SALES_RETURN',i,1,{payload:{lines:[{inventoryId:i.id,quantity:1,sourceLineId:e.transactionId,disposition:'RESTOCK'}]}}),'POST');
    assert.equal(Math.round((refunded-returned[0].totalAmount+replacement.totalAmount)*100),Math.round(sale.totalAmount*100));
  });
  fs.writeFileSync('/tmp/integrity-workflow-db-results.json',JSON.stringify({database:'isolated local inventory_workflow_acceptance',branchId:branch.id,results},null,2));
  console.log(JSON.stringify(results,null,2)); if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
