const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../..');
const resolve = createRequire(path.join(root, 'backend/package.json'));
const target = 'postgresql://report_test@127.0.0.1:55492/clinic_report_synthetic';
if (process.env.DATABASE_URL !== target) throw new Error('Refusing any database except the isolated synthetic test database');
resolve('ts-node').register({ project: path.join(root, 'backend/tsconfig.json'), transpileOnly: true });
const { PrismaClient } = resolve('@prisma/client');
const { PharmacyReportsService } = require(path.join(root, 'backend/src/modules/reports/pharmacy-reports.service.ts'));
const db = new PrismaClient();

async function verify() {
  const run = randomUUID();
  const a = `a-${run}`, b = `b-${run}`, pa = `pa-${run}`, pb = `pb-${run}`;
  const saleA = `sale-a-${run}`, saleB = `sale-b-${run}`;
  const rollback = new Error('ROLLBACK_SYNTHETIC_FIXTURES');
  try {
    await db.$transaction(async tx => {
      await tx.branch.createMany({ data: [{ id: a, name: 'Synthetic A', address: 'Synthetic' }, { id: b, name: 'Synthetic B', address: 'Synthetic' }] });
      await tx.patient.createMany({ data: [{ id: pa, branchId: a, name: 'Patient A', gender: 'Unknown', phone: '000' }, { id: pb, branchId: b, name: 'Patient B', gender: 'Unknown', phone: '001' }] });
      await tx.supplier.create({ data: { id: `supplier-${run}`, branchId: a, name: 'Synthetic Supplier' } });
      const invoice = (id, branchId, patientId, date, total) => ({ id, branchId, patientId, invoiceNumber: id, subtotal: total, discountAmount: 0, taxAmount: 0, totalAmount: total, paidAmount: 60, balanceAmount: total - 60, paymentMethod: 'CASH', billingName: patientId, billingPhone: '000', status: 'CONFIRMED', invoiceDate: new Date(date) });
      await tx.pharmacyInvoice.createMany({ data: [invoice(saleA, a, pa, '2026-11-05T08:00:00Z', 100), invoice(saleB, b, pb, '2026-11-06T08:00:00Z', 900)] });
      await tx.pharmacyPayment.create({ data: { invoiceId: saleA, amount: 60, method: 'UPI', status: 'COMPLETED', paymentDate: new Date('2026-11-06T04:00:00Z') } });
      const line = { id: 'line', inventoryId: '', name: 'Sample', quantity: 1, gstRate: 0, taxable: 40, tax: 0, total: 40 };
      await tx.inventoryWorkflowDocument.createMany({ data: [
        { id: `counter-${run}`, branchId: a, kind: 'COUNTER_SALE', status: 'POSTED', reference: 'COUNTER-A', payload: { lines: [line] }, totalAmount: 40, requestKey: `counter-${run}`, createdBy: 'synthetic', postedAt: new Date('2026-11-06T05:00:00Z') },
        { id: `return-${run}`, branchId: a, kind: 'SALES_RETURN', status: 'RELEASED', reference: 'RETURN-A', payload: { lines: [line] }, totalAmount: 40, requestKey: `return-${run}`, createdBy: 'synthetic', postedAt: new Date('2026-11-06T06:00:00Z') },
        { id: `supplier-return-${run}`, branchId: a, kind: 'SUPPLIER_RETURN', status: 'POSTED', reference: 'SUPPLIER-RETURN-A', supplierId: `supplier-${run}`, payload: { lines: [line] }, totalAmount: 40, requestKey: `supplier-return-${run}`, createdBy: 'synthetic', postedAt: new Date('2026-11-06T07:00:00Z') },
      ] });
      const service = new PharmacyReportsService(tx);
      const today = await service.getReport(a, '2026-11-06', '2026-11-06');
      assert.deepEqual(today.sales.map(row => [row.kind, row.total]), [['Counter sale', 40], ['Sales return', -40]]);
      assert.deepEqual(today.payments.map(row => [row.number, row.method, row.amount]), [[saleA, 'UPI', 60]]);
      assert.deepEqual(today.paymentGaps, []);
      assert.deepEqual(today.purchases.map(row => [row.kind, row.party, row.total]), [['Supplier return', 'Synthetic Supplier', -40]]);
      const yesterday = await service.getReport(a, '2026-11-05', '2026-11-05');
      assert.deepEqual(yesterday.sales.map(row => row.number), [saleA]);
      assert.deepEqual(yesterday.payments, []);
      const other = await service.getReport(b, '2026-11-06', '2026-11-06');
      assert.deepEqual(other.sales.map(row => row.number), [saleB]);
      assert.deepEqual(other.payments, []);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  console.log('PASS: synthetic PostgreSQL branch isolation, signed returns, and separate invoice/payment dates');
}
verify().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
