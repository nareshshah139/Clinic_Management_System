import { PharmacySalesRegisterService } from '../pharmacy-sales-register.service';
import type { SalesRegisterQuery } from '../pharmacy-sales-register';

describe('PharmacySalesRegisterService', () => {
  const branchId = 'branch-1';
  let prisma: any;
  let service: PharmacySalesRegisterService;

  const bill = (overrides: Record<string, unknown>) => ({
    status: 'CONFIRMED',
    invoiceDate: new Date('2026-06-01T06:00:00.000Z'),
    createdAt: new Date('2026-06-01T06:00:00.000Z'),
    totalAmount: 100,
    paymentMethod: 'CASH',
    billingName: 'Meera Shah',
    billingPhone: '9876543210',
    createdById: null,
    patient: { name: 'Meera Shah', phone: '9876543210' },
    payments: [],
    ...overrides,
  });

  const query = (
    overrides: Partial<SalesRegisterQuery> = {},
  ): SalesRegisterQuery => ({
    register: 'sales',
    from: '2026-04-01',
    to: '2027-03-31',
    sortBy: 'billNo',
    sortDir: 'asc',
    page: 1,
    limit: 50,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      pharmacyInvoice: { findMany: jest.fn() },
      inventoryWorkflowDocument: { findMany: jest.fn() },
      branch: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Skin Care Clinic' }),
      },
      stockTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findMany: jest.fn(async ({ where }) =>
          [
            { id: 'user-asha', firstName: 'Asha', lastName: 'Rao' },
            { id: 'user-ravi', firstName: 'Ravi', lastName: 'Kumar' },
          ].filter((user) => where.id.in.includes(user.id)),
        ),
      },
    };
    service = new PharmacySalesRegisterService(prisma);
  });

  it('lists patient bills with counter sales, naming the creator or the first seller of a legacy bill', async () => {
    prisma.pharmacyInvoice.findMany.mockResolvedValue([
      bill({
        id: 'new',
        invoiceNumber: 'PHI-2026-3',
        createdById: 'user-asha',
        totalAmount: 300,
      }),
      bill({ id: 'legacy', invoiceNumber: 'PHI-2026-2', totalAmount: 200 }),
      bill({ id: 'unknown', invoiceNumber: 'PHI-2026-1', totalAmount: 100 }),
      bill({
        id: 'draft',
        invoiceNumber: 'PHI-2026-4',
        status: 'DRAFT',
        createdById: 'user-asha',
        totalAmount: 999,
      }),
    ]);
    prisma.stockTransaction.findMany.mockResolvedValue([
      { reference: 'INV-PHI-2026-2', userId: 'user-ravi' },
      { reference: 'INV-PHI-2026-2', userId: 'user-asha' },
    ]);
    prisma.inventoryWorkflowDocument.findMany.mockResolvedValue([
      {
        id: 'cs-1',
        kind: 'COUNTER_SALE',
        status: 'POSTED',
        reference: 'CS-9',
        createdAt: new Date('2026-06-02T06:00:00.000Z'),
        totalAmount: { toString: () => '45.50' },
        payload: {
          date: '2026-06-02',
          customerName: 'Walk-in',
          customerPhone: '',
          paymentMode: 'UPI',
        },
        createdBy: 'user-ravi',
        salesInvoiceId: null,
        sourceId: null,
      },
    ]);

    const result = await service.list(query(), branchId);

    expect(
      result.rows.map((r) => [
        r.billNo,
        r.source,
        r.entryBy?.name ?? null,
        r.mobile,
      ]),
    ).toEqual([
      ['CS-9', 'COUNTER_SALE', 'Ravi Kumar', null],
      ['PHI-2026-1', 'PHARMACY_BILL', null, '9876543210'],
      ['PHI-2026-2', 'PHARMACY_BILL', 'Ravi Kumar', '9876543210'],
      ['PHI-2026-3', 'PHARMACY_BILL', 'Asha Rao', '9876543210'],
      [null, 'PHARMACY_BILL', 'Asha Rao', '9876543210'],
    ]);
    expect([result.totals, result.clinicName, result.entryByOptions]).toEqual([
      { amount: 645.5, count: 4, excluded: { drafts: 1, cancelled: 0 } },
      'Skin Care Clinic',
      [
        { id: 'user-asha', name: 'Asha Rao' },
        { id: 'user-ravi', name: 'Ravi Kumar' },
      ],
    ]);
  });

  it('reads only this branch within the Kolkata day bounds and looks up legacy sellers by bill reference', async () => {
    prisma.pharmacyInvoice.findMany.mockResolvedValue([
      bill({ id: 'legacy', invoiceNumber: 'PHI-2026-2' }),
    ]);
    prisma.inventoryWorkflowDocument.findMany.mockResolvedValue([]);

    await service.list(
      query({ from: '2026-04-01', to: '2026-04-01' }),
      branchId,
    );

    const bounds = {
      gte: new Date('2026-03-31T18:30:00.000Z'),
      lt: new Date('2026-04-01T18:30:00.000Z'),
    };
    expect(prisma.pharmacyInvoice.findMany.mock.calls[0][0].where).toEqual({
      branchId,
      invoiceDate: bounds,
    });
    expect(
      prisma.inventoryWorkflowDocument.findMany.mock.calls[0][0].where,
    ).toEqual({
      branchId,
      kind: 'COUNTER_SALE',
      OR: [
        { createdAt: bounds },
        { payload: { path: ['date'], gte: '2026-04-01', lte: '2026-04-01' } },
      ],
    });
    expect(prisma.stockTransaction.findMany.mock.calls[0][0].where).toEqual({
      branchId,
      type: 'SALE',
      reference: { in: ['INV-PHI-2026-2'] },
    });
  });

  it('drops a backdated counter sale whose bill date falls outside the range though it was entered inside it', async () => {
    prisma.pharmacyInvoice.findMany.mockResolvedValue([]);
    prisma.inventoryWorkflowDocument.findMany.mockResolvedValue([
      {
        id: 'cs-old',
        kind: 'COUNTER_SALE',
        status: 'POSTED',
        reference: 'CS-1',
        createdAt: new Date('2026-04-05T06:00:00.000Z'),
        totalAmount: 10,
        payload: { date: '2026-03-30' },
        createdBy: 'user-ravi',
        salesInvoiceId: null,
        sourceId: null,
      },
    ]);

    const result = await service.list(
      query({ from: '2026-04-01', to: '2026-04-30' }),
      branchId,
    );

    expect([result.total, result.totals.amount]).toEqual([0, 0]);
  });

  it('lists returns only, with the bill each return was raised against', async () => {
    prisma.pharmacyInvoice.findMany.mockResolvedValue([
      { id: 'inv-7', invoiceNumber: 'PHI-2026-7' },
    ]);
    prisma.inventoryWorkflowDocument.findMany
      .mockResolvedValueOnce([
        {
          id: 'ret-1',
          kind: 'SALES_RETURN',
          status: 'POSTED',
          reference: 'SR-1',
          createdAt: new Date('2026-06-03T06:00:00.000Z'),
          totalAmount: 30,
          payload: {
            date: '2026-06-03',
            customerName: 'Meera Shah',
            customerPhone: '9876543210',
            refundMode: 'CASH',
          },
          createdBy: 'user-asha',
          salesInvoiceId: 'inv-7',
          sourceId: null,
        },
        {
          id: 'ret-2',
          kind: 'SALES_RETURN',
          status: 'DRAFT',
          reference: 'SR-2',
          createdAt: new Date('2026-06-04T06:00:00.000Z'),
          totalAmount: 20,
          payload: { date: '2026-06-04', refundMode: 'CREDIT' },
          createdBy: 'user-asha',
          salesInvoiceId: null,
          sourceId: 'cs-1',
        },
      ])
      .mockResolvedValueOnce([{ id: 'cs-1', reference: 'CS-9' }]);

    const result = await service.list(query({ register: 'returns' }), branchId);

    expect(
      result.rows.map((r) => [r.billNo, r.linkedBillNo, r.paymentModes]),
    ).toEqual([
      ['SR-1', 'PHI-2026-7', ['CASH']],
      [null, 'CS-9', ['CREDIT']],
    ]);
    expect(result.totals).toEqual({
      amount: 30,
      count: 1,
      excluded: { drafts: 1, cancelled: 0 },
    });
    expect(
      prisma.pharmacyInvoice.findMany.mock.calls.map(
        (call: any[]) => call[0].where,
      ),
    ).toEqual([{ branchId, id: { in: ['inv-7'] } }]);
  });
});
