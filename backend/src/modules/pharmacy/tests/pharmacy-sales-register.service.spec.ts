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
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          name: 'Skin Care Clinic',
          address: '12 MG Road',
          city: 'Pune',
          state: null,
          pincode: '411001',
          phone: '020 1234 5678',
          gstNumber: null,
          licenseNumber: 'MH-PUN-20B-1234',
        }),
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

  it('lists patient bills with counter sales, naming each creator, with payments, dues and the clinic identity', async () => {
    prisma.pharmacyInvoice.findMany.mockResolvedValue([
      bill({
        id: 'paid',
        invoiceNumber: 'PHI-2026-3',
        createdById: 'user-asha',
        totalAmount: 300,
        payments: [
          { method: 'UPI', amount: 200 },
          { method: 'CASH', amount: 100 },
        ],
      }),
      bill({
        id: 'unknown',
        invoiceNumber: 'PHI-2026-1',
        totalAmount: 100,
      }),
      bill({
        id: 'draft',
        invoiceNumber: 'PHI-2026-4',
        status: 'DRAFT',
        createdById: 'user-asha',
        totalAmount: 999,
      }),
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
        salesInvoiceId: 'inv-quoted',
      },
    ]);

    const result = await service.list(query(), branchId);

    expect(
      result.rows.map((r) => [
        r.billNo,
        r.reservedNo,
        r.source,
        r.entryBy?.name ?? null,
        r.paymentModes,
        r.due,
        r.linkedBillNos,
      ]),
    ).toEqual([
      ['CS-9', null, 'COUNTER_SALE', 'Ravi Kumar', ['UPI'], 0, []],
      ['PHI-2026-1', null, 'PHARMACY_BILL', null, [], 100, []],
      ['PHI-2026-3', null, 'PHARMACY_BILL', 'Asha Rao', ['UPI', 'CASH'], 0, []],
      [null, 'PHI-2026-4', 'PHARMACY_BILL', 'Asha Rao', [], 0, []],
    ]);
    expect([result.totals, result.clinic, result.entryByOptions]).toEqual([
      {
        amount: 445.5,
        count: 3,
        collected: null,
        excluded: { drafts: 1, cancelled: 0 },
      },
      {
        name: 'Skin Care Clinic',
        address: '12 MG Road, Pune, 411001',
        phone: '020 1234 5678',
        drugLicence: 'MH-PUN-20B-1234',
      },
      [
        { id: 'user-asha', name: 'Asha Rao' },
        { id: 'user-ravi', name: 'Ravi Kumar' },
      ],
    ]);
    expect(prisma.stockTransaction.findMany).not.toHaveBeenCalled();
  });

  it('collects by UPI across bills and counter sales and lists unpaid balances as credit', async () => {
    prisma.pharmacyInvoice.findMany.mockResolvedValue([
      bill({
        id: 'split',
        invoiceNumber: 'PHI-2026-1',
        totalAmount: 300,
        payments: [
          { method: 'UPI', amount: 120.5 },
          { method: 'CASH', amount: 100 },
          { method: 'UPI', amount: 29.5 },
        ],
      }),
      bill({ id: 'unpaid', invoiceNumber: 'PHI-2026-2', totalAmount: 75 }),
    ]);
    prisma.inventoryWorkflowDocument.findMany.mockResolvedValue([
      {
        id: 'cs-1',
        kind: 'COUNTER_SALE',
        status: 'POSTED',
        reference: 'CS-1',
        createdAt: new Date('2026-06-02T06:00:00.000Z'),
        totalAmount: 40,
        payload: { date: '2026-06-02', paymentMode: 'UPI' },
        createdBy: 'user-ravi',
        salesInvoiceId: null,
      },
    ]);

    const upi = await service.list(query({ paymentMode: 'UPI' }), branchId);
    const credit = await service.list(
      query({ paymentMode: 'CREDIT' }),
      branchId,
    );

    expect([
      upi.rows.map((r) => r.billNo),
      upi.totals.collected,
      credit.rows.map((r) => r.billNo),
      credit.totals.collected,
    ]).toEqual([
      ['CS-1', 'PHI-2026-1'],
      190,
      ['PHI-2026-1', 'PHI-2026-2'],
      125,
    ]);
  });

  it('reads only this branch within the Kolkata day bounds', async () => {
    prisma.pharmacyInvoice.findMany.mockResolvedValue([]);
    prisma.inventoryWorkflowDocument.findMany.mockResolvedValue([]);

    await service.list(
      query({ from: '2026-04-01', to: '2026-04-01' }),
      branchId,
    );

    const bounds = {
      gte: new Date('2026-03-31T18:30:00.000Z'),
      lt: new Date('2026-04-01T18:30:00.000Z'),
    };
    expect([
      prisma.pharmacyInvoice.findMany.mock.calls[0][0].where,
      prisma.inventoryWorkflowDocument.findMany.mock.calls[0][0].where,
      prisma.branch.findUniqueOrThrow.mock.calls[0][0].where,
    ]).toEqual([
      { branchId, invoiceDate: bounds },
      {
        branchId,
        kind: 'COUNTER_SALE',
        OR: [
          { createdAt: bounds },
          {
            payload: { path: ['date'], gte: '2026-04-01', lte: '2026-04-01' },
          },
        ],
      },
      { id: branchId },
    ]);
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
      },
    ]);

    const result = await service.list(
      query({ from: '2026-04-01', to: '2026-04-30' }),
      branchId,
    );

    expect([result.total, result.totals.amount]).toEqual([0, 0]);
  });

  it('lists returns only, with every bill each return was raised against', async () => {
    prisma.pharmacyInvoice.findMany.mockResolvedValue([
      { id: 'inv-7', invoiceNumber: 'PHI-2026-7' },
    ]);
    prisma.stockTransaction.findMany.mockResolvedValue([
      { id: 'tx-bill', reference: 'INV-PHI-2026-7' },
      { id: 'tx-other-bill', reference: 'INV-PHI-2026-8' },
      { id: 'tx-counter', reference: 'WF-CS-9' },
    ]);
    prisma.inventoryWorkflowDocument.findMany.mockResolvedValue([
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
          lines: [
            { sourceLineId: 'tx-bill' },
            { sourceLineId: 'tx-other-bill' },
          ],
        },
        createdBy: 'user-asha',
        salesInvoiceId: 'inv-7',
      },
      {
        id: 'ret-2',
        kind: 'SALES_RETURN',
        status: 'DRAFT',
        reference: 'SR-2',
        createdAt: new Date('2026-06-04T06:00:00.000Z'),
        totalAmount: 20,
        payload: {
          date: '2026-06-04',
          refundMode: 'CREDIT',
          lines: [{ sourceLineId: 'tx-counter' }],
        },
        createdBy: 'user-asha',
        salesInvoiceId: null,
      },
    ]);

    const result = await service.list(query({ register: 'returns' }), branchId);

    expect(
      result.rows.map((r) => [r.billNo, r.linkedBillNos, r.paymentModes]),
    ).toEqual([
      ['SR-1', ['PHI-2026-7', 'PHI-2026-8'], ['CASH']],
      [null, ['CS-9'], ['CREDIT']],
    ]);
    expect(result.totals).toEqual({
      amount: 30,
      count: 1,
      collected: null,
      excluded: { drafts: 1, cancelled: 0 },
    });
    expect([
      prisma.pharmacyInvoice.findMany.mock.calls.map(
        (call: any[]) => call[0].where,
      ),
      prisma.stockTransaction.findMany.mock.calls[0][0].where,
    ]).toEqual([
      [{ branchId, id: { in: ['inv-7'] } }],
      {
        branchId,
        type: 'SALE',
        id: { in: ['tx-bill', 'tx-other-bill', 'tx-counter'] },
      },
    ]);
  });
});
