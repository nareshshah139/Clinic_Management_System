import { BadRequestException } from '@nestjs/common';
import { PharmacyPurchaseLedgerService } from '../pharmacy-purchase-ledger.service';
import { PharmacyPurchasePaymentModeDto } from '../dto/pharmacy-purchase-ledger.dto';

describe('PharmacyPurchaseLedgerService', () => {
  let service: PharmacyPurchaseLedgerService;
  let prisma: any;

  const branchId = 'branch-1';
  const userId = 'user-1';
  const gstin = '36ABCDE1234F1Z5';

  const invoice = (overrides: any = {}) => ({
    id: overrides.id || 'purchase-1',
    branchId,
    distributorName: 'Linae Distributors',
    distributorGstin: overrides.distributorGstin || gstin,
    invoiceNumber: overrides.invoiceNumber || 'LD-001',
    invoiceDate: overrides.invoiceDate || new Date('2026-04-01T00:00:00.000Z'),
    dueDate: overrides.dueDate ?? new Date('2026-05-01T00:00:00.000Z'),
    status: overrides.status || 'STOCK_COMMITTED',
    netPayable: overrides.netPayable ?? 1000,
    tcsAmount: overrides.tcsAmount ?? 0,
    paymentAllocations: overrides.paymentAllocations || [],
  });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: any) => callback(prisma)),
      pharmacyPurchaseInvoice: {
        findMany: jest.fn(),
      },
      inventoryCreditAllocation: {findMany:jest.fn().mockResolvedValue([])},
      pharmacyPurchasePayment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new PharmacyPurchaseLedgerService(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('records one payment allocated across multiple purchase invoices', async () => {
    const first = invoice({
      id: 'purchase-1',
      netPayable: 1000,
      paymentAllocations: [{ amount: 400 }],
    });
    const second = invoice({
      id: 'purchase-2',
      invoiceNumber: 'LD-002',
      netPayable: 500,
    });
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([first, second]);
    prisma.pharmacyPurchasePayment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'payment-1',
        ...data,
        allocations: data.allocations.create.map(
          (allocation: any, index: number) => ({
            id: `allocation-${index + 1}`,
            paymentId: 'payment-1',
            ...allocation,
            purchaseInvoice:
              allocation.purchaseInvoiceId === 'purchase-1' ? first : second,
          }),
        ),
      }),
    );

    const result = await service.createPayment(
      {
        requestKey: 'payment-fixture',
        distributorGstin: gstin,
        distributorName: 'Linae Distributors',
        paymentDate: '2026-05-06',
        mode: PharmacyPurchasePaymentModeDto.NEFT,
        amount: 800,
        referenceNo: 'UTR-1',
        allocations: [
          { purchaseInvoiceId: 'purchase-1', amount: 300 },
          { purchaseInvoiceId: 'purchase-2', amount: 500 },
        ],
      },
      branchId,
      userId,
    );

    expect(prisma.pharmacyPurchasePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          requestKey: 'payment-fixture',
        distributorGstin: gstin,
          paidBy: userId,
          amount: 800,
          allocations: {
            create: [
              { purchaseInvoiceId: 'purchase-1', amount: 300 },
              { purchaseInvoiceId: 'purchase-2', amount: 500 },
            ],
          },
        }),
      }),
    );
    expect(result.allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purchaseInvoiceId: 'purchase-1',
          paidAfter: 700,
          outstandingAfter: 300,
          paymentStatus: 'PARTIALLY_PAID',
        }),
        expect.objectContaining({
          purchaseInvoiceId: 'purchase-2',
          paidAfter: 500,
          outstandingAfter: 0,
          paymentStatus: 'PAID',
        }),
      ]),
    );
  });

  it('rejects allocation beyond the invoice outstanding balance', async () => {
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([
      invoice({
        netPayable: 1000,
        paymentAllocations: [{ amount: 900 }],
      }),
    ]);

    await expect(
      service.createPayment(
        {
          requestKey: 'payment-fixture',
        distributorGstin: gstin,
          distributorName: 'Linae Distributors',
          paymentDate: '2026-05-06',
          mode: PharmacyPurchasePaymentModeDto.UPI,
          amount: 200,
          allocations: [{ purchaseInvoiceId: 'purchase-1', amount: 200 }],
        },
        branchId,
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.pharmacyPurchasePayment.create).not.toHaveBeenCalled();
  });

  it('rejects invoice allocations for a different distributor GSTIN', async () => {
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([
      invoice({ distributorGstin: '36ABCDE1234F1Z6' }),
    ]);

    await expect(
      service.createPayment(
        {
          requestKey: 'payment-fixture',
        distributorGstin: gstin,
          distributorName: 'Linae Distributors',
          paymentDate: '2026-05-06',
          mode: PharmacyPurchasePaymentModeDto.CHEQUE,
          amount: 100,
          allocations: [{ purchaseInvoiceId: 'purchase-1', amount: 100 }],
        },
        branchId,
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.pharmacyPurchasePayment.create).not.toHaveBeenCalled();
  });

  it('derives distributor summary counts, overdue amounts, and TCS threshold state', async () => {
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([
      invoice({
        id: 'purchase-1',
        netPayable: 3000000,
        dueDate: new Date('2026-04-20T00:00:00.000Z'),
      }),
      invoice({
        id: 'purchase-2',
        invoiceNumber: 'LD-002',
        netPayable: 1700000,
        dueDate: new Date('2026-05-09T00:00:00.000Z'),
        paymentAllocations: [
          {
            amount: 700000,
            payment: {
              id: 'payment-1',
              paymentDate: new Date('2026-05-03T00:00:00.000Z'),
            },
          },
        ],
      }),
      invoice({
        id: 'purchase-3',
        invoiceNumber: 'LD-003',
        netPayable: 300000,
        dueDate: new Date('2026-05-15T00:00:00.000Z'),
        paymentAllocations: [
          {
            amount: 300000,
            payment: {
              id: 'payment-2',
              paymentDate: new Date('2026-05-04T00:00:00.000Z'),
            },
          },
        ],
      }),
    ]);

    const result = await service.getDistributorSummaries(
      branchId,
      new Date('2026-05-06T00:00:00.000Z'),
    );

    expect(result.distributors[0]).toEqual(
      expect.objectContaining({
        invoiceTotal: 5000000,
        paid: 1000000,
        outstanding: 4000000,
        counts: {
          pending: 1,
          partial: 1,
          paid: 1,
        },
        overdue: {
          count: 1,
          amount: 3000000,
        },
        annualPurchaseTotal: 5000000,
        tcsApproaching: true,
        tcsRemaining: 0,
      }),
    );
  });

  it('returns aging buckets and due alerts from outstanding invoices', async () => {
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([
      invoice({
        id: 'overdue',
        invoiceNumber: 'LD-001',
        dueDate: new Date('2026-04-01T00:00:00.000Z'),
        netPayable: 1000,
      }),
      invoice({
        id: 'due-today',
        invoiceNumber: 'LD-002',
        dueDate: new Date('2026-05-06T00:00:00.000Z'),
        netPayable: 500,
      }),
      invoice({
        id: 'due-soon',
        invoiceNumber: 'LD-003',
        dueDate: new Date('2026-05-10T00:00:00.000Z'),
        netPayable: 700,
      }),
    ]);

    const asOfDate = new Date('2026-05-06T00:00:00.000Z');
    const aging = await service.getAging(branchId, asOfDate);
    const alerts = await service.getAlerts(branchId, asOfDate);

    expect(aging.totalOutstanding).toBe(2200);
    expect(aging.buckets[0]).toEqual(
      expect.objectContaining({ label: '0-30', count: 2, amount: 1200 }),
    );
    expect(aging.buckets[1]).toEqual(
      expect.objectContaining({ label: '31-60', count: 1, amount: 1000 }),
    );
    expect(alerts.counts).toEqual({
      dueIn7Days: 1,
      dueToday: 1,
      overdue: 1,
      tcsApproaching: 0,
    });
  });

  it('stores a calendar-day payment date as the start of that clinic day', async () => {
    const first = invoice({ id: 'purchase-1', netPayable: 1000 });
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([first]);
    prisma.pharmacyPurchasePayment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'payment-1',
        ...data,
        allocations: data.allocations.create.map((allocation: any) => ({ id: 'allocation-1', ...allocation, purchaseInvoice: first })),
      }),
    );
    const pay = (requestKey: string, paymentDate: string) =>
      service.createPayment(
        {
          requestKey,
          distributorGstin: gstin,
          distributorName: 'Linae Distributors',
          paymentDate,
          mode: PharmacyPurchasePaymentModeDto.UPI,
          amount: 100,
          allocations: [{ purchaseInvoiceId: 'purchase-1', amount: 100 }],
        },
        branchId,
        userId,
      );

    expect((await pay('day', '2026-05-06')).paymentDate).toEqual(new Date('2026-05-05T18:30:00.000Z'));
    expect((await pay('instant', '2026-05-06T15:45:00+05:30')).paymentDate).toEqual(new Date('2026-05-06T10:15:00.000Z'));
  });

  it('does not count a future-dated payment until its payment date', async () => {
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([
      invoice({
        netPayable: 1000,
        paymentAllocations: [
          {
            amount: 400,
            createdAt: new Date('2026-05-06T04:00:00.000Z'),
            payment: {
              id: 'payment-1',
              paymentDate: new Date('2026-05-09T18:30:00.000Z'),
              createdAt: new Date('2026-05-06T04:00:00.000Z'),
              amount: 400,
              mode: 'NEFT',
            },
          },
        ],
      }),
    ]);

    const outstanding = async (asOf: string) =>
      (await service.getDistributorSummaries(branchId, new Date(asOf))).distributors[0].outstanding;
    expect(await outstanding('2026-05-06T06:00:00.000Z')).toBe(1000);
    expect(await outstanding('2026-05-09T18:30:00.000Z')).toBe(600);
  });

  it('ages and alerts by clinic day, so a bill due today in the clinic is not yet overdue', async () => {
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([
      invoice({ id: 'due-today', dueDate: new Date('2026-05-05T19:00:00.000Z'), netPayable: 500 }),
      invoice({ id: 'late', invoiceNumber: 'LD-002', dueDate: new Date('2026-05-05T18:29:00.000Z'), netPayable: 300 }),
    ]);
    const asOfDate = new Date('2026-05-06T10:00:00.000Z');

    const aging = await service.getAging(branchId, asOfDate);
    expect(aging.buckets[0].invoices.map((row: any) => [row.id, row.daysPastDue])).toEqual([
      ['due-today', 0],
      ['late', 1],
    ]);
    const alerts = await service.getAlerts(branchId, asOfDate);
    expect([alerts.dueToday.map((row) => row.id), alerts.overdue.map((row) => row.id)]).toEqual([['due-today'], ['late']]);
    prisma.pharmacyPurchasePayment.findMany.mockResolvedValue([]);
    const ledger = await service.getDistributorLedger(branchId, gstin, asOfDate);
    expect(ledger.invoices.map((row) => [row.id, row.daysPastDue])).toEqual([
      ['due-today', 0],
      ['late', 1],
    ]);
    const summary = (await service.getDistributorSummaries(branchId, asOfDate)).distributors[0];
    expect([summary.overdue, summary.dueSoon]).toEqual([
      { count: 1, amount: 300 },
      { count: 1, amount: 500 },
    ]);
  });
});
