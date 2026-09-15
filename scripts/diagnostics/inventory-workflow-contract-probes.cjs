#!/usr/bin/env node
// Read-only acceptance probes: real service methods against in-memory fakes.
// No PrismaClient, database connection, application login, or network request is created.
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
require(require.resolve('ts-node', { paths: [path.join(root, 'backend')] })).register({
  transpileOnly: true,
  project: path.join(root, 'backend/tsconfig.json'),
});
const { InventoryService } = require('../../backend/src/modules/inventory/inventory.service.ts');
const { PharmacyPurchaseLedgerService } = require('../../backend/src/modules/pharmacy/pharmacy-purchase-ledger.service.ts');
const { PharmacyComplianceService } = require('../../backend/src/modules/pharmacy/pharmacy-compliance.service.ts');
const { PharmacyInvoiceService } = require('../../backend/src/modules/pharmacy/pharmacy-invoice.service.ts');

function inventoryFixture() {
  const state = { stock: 10, entries: [], failStockUpdate: false };
  const item = () => ({ id: 'item', branchId: 'branch', name: 'Fixture', currentStock: state.stock, costPrice: 25, reorderLevel: 2 });
  const prisma = {
    inventoryItem: {
      findFirst: async () => item(), findUnique: async () => item(),
      update: async ({ data }) => { if (state.failStockUpdate) throw new Error('Injected stock failure'); state.stock = data.currentStock; return item(); },
    },
    stockTransaction: {
      create: async ({ data }) => { const row = { id: 'movement', ...data }; state.entries.push(row); return row; },
      findFirst: async () => state.entries[0],
      update: async ({ data }) => Object.assign(state.entries[0], data),
      delete: async () => state.entries.pop(),
    },
    purchaseOrder: { create: async ({ data }) => ({ id: 'po', ...data }) },
  };
  // Model rollback when the implementation uses its transaction boundary.
  prisma.$transaction = async (callback) => {
    const before = structuredClone(state);
    try { return await callback(prisma); } catch (error) { Object.assign(state, before); throw error; }
  };
  return { state, prisma, service: new InventoryService(prisma) };
}

const results = [];
async function probe(contract, name, run) {
  try { const evidence = await run(); results.push({ contract, name, status: 'PASS', evidence }); }
  catch (error) { results.push({ contract, name, status: 'FAIL', evidence: error.message }); }
}

(async () => {
  await probe('inventory-movement-atomic', 'A failed stock update rolls back its movement', async () => {
    const { service, state } = inventoryFixture(); state.failStockUpdate = true;
    await assert.rejects(() => service.createStockTransaction({ itemId: 'item', type: 'PURCHASE', quantity: 5 }, 'branch', 'user'));
    assert.equal(state.entries.length, 0, 'A failed operation left a persisted PURCHASE movement');
    assert.equal(state.stock, 10); return 'No movement or balance changed after failure';
  });
  await probe('inventory-adjustment-direction', 'Negative adjustments retain their signed stock effect', async () => {
    const { service, state } = inventoryFixture();
    const row = await service.adjustStock({ itemId: 'item', adjustmentQuantity: -3, reason: 'Physical count' }, 'branch', 'user');
    const metadata = (() => { try { return JSON.parse(row.notes || '{}'); } catch { return {}; } })();
    const effect = row.delta ?? row.signedQuantity ?? metadata.delta ?? (row.direction === 'OUT' ? -row.quantity : row.quantity);
    assert.equal(effect, -3, `Movement encodes ${effect} while stock changed from 10 to ${state.stock}`);
    assert.equal(state.stock, 7); return 'Signed movement equals balance delta';
  });
  await probe('inventory-posted-movement-immutable', 'Posted movement quantities cannot be edited in place', async () => {
    const { service, state } = inventoryFixture();
    await service.createStockTransaction({ itemId: 'item', type: 'PURCHASE', quantity: 5 }, 'branch', 'user');
    await assert.rejects(() => service.updateStockTransaction('movement', { quantity: 9 }, 'branch'), 'Posted movement edit succeeded without a reversal');
    assert.equal(state.stock, 15); return 'Edit rejected; original movement retained';
  });
  await probe('inventory-outbound-no-clamping', 'Insufficient stock rejects the whole outbound operation', async () => {
    const { service, state } = inventoryFixture();
    await assert.rejects(() => service.createStockTransaction({ itemId: 'item', type: 'SALE', quantity: 15 }, 'branch', 'user'), 'Sale of 15 from stock 10 succeeded');
    assert.equal(state.stock, 10); assert.equal(state.entries.length, 0); return 'No stock or movement change';
  });
  await probe('inventory-po-no-stock', 'Creating a purchase order does not receive stock', async () => {
    const { service, state } = inventoryFixture();
    const order = await service.createPurchaseOrder({ orderNumber: 'PO-fixture', supplier: 'Fixture supplier', items: [{ itemId: 'item', quantity: 5, unitPrice: 25 }] }, 'branch', 'user');
    assert.equal(state.stock, 10); assert.equal(state.entries.length, 0); assert.equal(order.totalAmount, 125);
    return 'Order saved with total 125; stock 10 and no movements';
  });
  await probe('purchase-payables-posted-only', 'OCR drafts do not create supplier dues', async () => {
    const draft = { id: 'draft', branchId: 'branch', distributorGstin: '36ABCDE1234F1Z5', distributorName: 'Fixture', invoiceNumber: 'DRAFT', invoiceDate: new Date('2026-09-01'), dueDate: new Date('2026-09-10'), status: 'OCR_REVIEW_REQUIRED', netPayable: 1000, tcsAmount: 0, paymentAllocations: [] };
    const service = new PharmacyPurchaseLedgerService({ pharmacyPurchaseInvoice: { findMany: async ({ where }) => {
      const filter = where.status;
      const eligible = !filter || (typeof filter === 'string' ? draft.status === filter : (!filter.not || draft.status !== filter.not) && (!filter.in || filter.in.includes(draft.status)));
      return eligible ? [draft] : [];
    } } });
    const output = await service.getDistributorSummaries('branch', new Date('2026-09-14'));
    const due = output.distributors.reduce((sum, row) => sum + row.outstanding, 0);
    assert.equal(due, 0, `Unposted OCR draft contributes ${due} to supplier outstanding`); return 'Draft excluded';
  });
  await probe('inventory-audit-approval-before-post', 'An adjustment requiring approval does not immediately change stock', async () => {
    let stock = 10;
    const item = { id: 'item', name: 'Fixture', currentStock: stock, costPrice: 25 };
    const audit = { id: 'audit-row', itemId: 'item', status: 'PENDING', item };
    const prisma = {
      inventoryAudit: { findMany: async () => [audit], update: async ({ data }) => ({ ...audit, ...data }) },
      inventoryItem: { findMany: async () => [item], update: async ({ data }) => { stock = data.currentStock; return { ...item, ...data }; } },
      stockAdjustment: { create: async ({ data }) => ({ id: 'adjustment', ...data }) },
      stockTransaction: { create: async ({ data }) => ({ id: 'movement', ...data }) },
    };
    prisma.$transaction = async (callback) => callback(prisma);
    const service = new PharmacyComplianceService(prisma);
    const result = await service.applyAuditAdjustments('audit', { reason: 'Counted fewer', counts: [{ inventoryId: 'item', physicalStock: 7 }] }, 'branch', 'user', 'PHARMACIST');
    assert.equal(stock, 10, `Stock became ${stock} although approvalRequired=${result.adjustments[0]?.approvalRequired}`);
    return 'Adjustment queued without changing stock';
  });
  await probe('inventory-statistics-money', 'Inventory total value is money, not a count of units', async () => {
    const service = new InventoryService({ inventoryItem: { count: async () => 1, aggregate: async () => ({ _sum: { currentStock: 10 } }), groupBy: async () => [], findMany: async () => [{ currentStock: 10, costPrice: 25 }] } });
    const result = await service.getInventoryStatistics({}, 'branch');
    assert.equal(result.totalValue, 250, `10 units at 25 each were valued as ${result.totalValue}`); return 'Value 250';
  });
  await probe('sales-pending-confirmation-stock', 'Confirming a pending sale cannot skip its stock effect', async () => {
    let deductions = 0;
    const invoice = { id: 'sale', invoiceNumber: 'SALE-fixture', status: 'PENDING', items: [{ drugId: 'drug', drug: { id: 'drug', name: 'Fixture' }, itemType: 'DRUG', quantity: 3, unitPrice: 25 }] };
    const prisma = {
      pharmacyInvoice: { findFirst: async () => invoice, update: async ({ data }) => ({ ...invoice, ...data, mutationVersion: 1 }) },
      inventoryItem: {
        findFirst: async () => ({id:'item',currentStock:10,heldStock:0}),
        findMany: async () => [{ id: 'item', name: 'Fixture', currentStock: 10, costPrice: 25, expiryDate: new Date('2030-01-01'), batchNumber: 'B1' }],
        updateMany: async () => { deductions++; return { count: 1 }; },
        findUnique: async () => ({ id: 'item', currentStock: 7 }), update: async () => ({}),
      },
      stockTransaction: { create: async ({ data }) => ({ id: 'sale-movement', ...data }) },
    };
    prisma.$transaction = async (callback) => callback(prisma);
    const result = await new PharmacyInvoiceService(prisma, {}).updateStatus('sale', 'CONFIRMED', 'branch', 'user');
    assert.equal(deductions, 1, `Result status is ${result.status}, but no batch was decremented`);
    return 'Pending-to-confirmed sale deducted its allocated batch';
  });
  const output = { generatedAt: new Date().toISOString(), environment: 'In-memory service probes; no database or network', passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results };
  if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(output, null, 2) + '\n');
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  // Nonzero is deliberate: these are target acceptance assertions, not tests of expected bugs.
  process.exitCode = output.failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 2; });
