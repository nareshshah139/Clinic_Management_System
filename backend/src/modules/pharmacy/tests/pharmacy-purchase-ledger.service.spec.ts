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
    status: overrides.status || 'REVIEWED',
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
      pharmacyPurchasePayment: {
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
});
