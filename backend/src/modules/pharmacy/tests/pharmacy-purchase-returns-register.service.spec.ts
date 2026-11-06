import { PharmacyPurchaseReturnsRegisterService } from '../pharmacy-purchase-returns-register.service';

describe('PharmacyPurchaseReturnsRegisterService', () => {
  const now = new Date('2026-11-06T06:00:00.000Z');
  const linae = '36ABCDE1234F1Z5';

  const prisma: any = {
    $queryRaw: jest.fn(async () => []),
    inventoryWorkflowDocument: {
      findMany: jest.fn(async () => [
        {
          id: 'ret-1', kind: 'SUPPLIER_RETURN', status: 'POSTED', reference: 'RET-1', version: 4,
          createdAt: new Date('2026-10-05T05:00:00Z'), createdBy: 'asha', payload: { date: '2026-10-05', returnType: 'NEAR_EXPIRY' },
          totalAmount: '520.00', supplierId: 'sup-1', supplierGstin: linae, purchaseInvoiceId: 'bill-1',
        },
        {
          id: 'cn-2', kind: 'CREDIT_NOTE', status: 'POSTED', reference: 'Rate difference', version: 2,
          createdAt: new Date('2026-10-06T05:00:00Z'), createdBy: 'gmail-intake', payload: { date: '2026-10-06' },
          totalAmount: '40.00', supplierId: null, supplierGstin: linae, purchaseInvoiceId: 'bill-1',
        },
      ]),
    },
    inventorySupplierCredit: {
      findMany: jest.fn(async () => [
        {
          id: 'credit-1', documentId: 'ret-1', supplierGstin: linae, amount: '500.00', applied: '0.00', createdAt: new Date('2026-10-10T05:00:00Z'),
          reversedAt: null, creditNoteNumber: 'CN-1', creditNoteDate: new Date('2026-10-12T00:00:00.000Z'),
          receivedAt: new Date('2026-10-12T06:00:00Z'), allocations: [],
        },
        {
          id: 'credit-2', documentId: 'cn-2', supplierGstin: linae, amount: '40.00', applied: '0.00', createdAt: new Date('2026-10-06T05:00:00Z'),
          reversedAt: null, creditNoteNumber: null, creditNoteDate: null, receivedAt: null, allocations: [],
        },
      ]),
    },
    supplier: { findMany: jest.fn(async () => [{ id: 'sup-1', name: 'Linae Distributors' }]) },
    pharmacyPurchaseInvoice: {
      findMany: jest.fn(async () => [{ id: 'bill-1', invoiceNumber: 'LIN-1', distributorName: 'Linae Pharma (bill name)' }]),
    },
    user: { findMany: jest.fn(async () => [{ id: 'asha', firstName: 'Asha', lastName: 'Rao' }]) },
  };

  it('joins each branch return to its credit, supplier name, source bill and entry person', async () => {
    const page = await new PharmacyPurchaseReturnsRegisterService(prisma).list(
      { from: '2026-04-01', to: '2027-03-31', sortBy: 'srNo', sortDir: 'asc', page: 1, limit: 50 },
      { branchId: 'branch-1' },
      now,
    );
    expect(
      page.rows.map((row) => [row.srNo, row.returnRef, row.distributor.name, row.sourceBillNo, row.entryBy?.name ?? null, row.state, row.creditNote, row.reason]),
    ).toEqual([
      [1, 'RET-1', 'Linae Distributors', 'LIN-1', 'Asha Rao', 'RECEIVED', { number: 'CN-1', date: '2026-10-12', amount: 500 }, 'NEAR_EXPIRY'],
      [2, 'Rate difference', 'Linae Pharma (bill name)', 'LIN-1', null, 'AWAITED', null, null],
    ]);
    expect([page.totals.count, page.totals.excluded]).toEqual([2, { drafts: 0, cancelled: 0 }]);
  });
});
