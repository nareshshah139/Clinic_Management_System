import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingService } from '../billing.service';

type Invoice = {
  id: string;
  branchId: string;
  patientId: string;
  total: number;
  received: number;
  balance: number;
};
type Payment = {
  id: string;
  invoiceId: string;
  amount: number;
  mode: string;
  reconStatus: string;
};

function setup(
  seed: {
    invoices?: Invoice[];
    payments?: Payment[];
    patients?: { id: string; branchId: string }[];
  } = {},
) {
  const invoices = [...(seed.invoices ?? [])];
  const payments = [...(seed.payments ?? [])];
  const patients = seed.patients ?? [{ id: 'pat-1', branchId: 'branch-a' }];
  const created: any[] = [];
  const prisma: any = {
    patient: {
      findFirst: jest.fn(
        async ({ where }) =>
          patients.find(
            (p) => p.id === where.id && p.branchId === where.branchId,
          ) ?? null,
      ),
    },
    visit: { findFirst: jest.fn(async () => null) },
    service: { create: jest.fn(async () => ({ id: 'svc' })) },
    newInvoice: {
      create: jest.fn(async ({ data }) => {
        created.push(data);
        return { id: 'inv-new', ...data };
      }),
      findFirst: jest.fn(async ({ where }) => {
        const row = invoices.find(
          (i) =>
            i.id === where.id &&
            (where.branchId === undefined || i.branchId === where.branchId),
        );
        return row ? { ...row, payments: [] } : null;
      }),
      update: jest.fn(async ({ where, data }) =>
        Object.assign(invoices.find((i) => i.id === where.id)!, data),
      ),
    },
    newPayment: {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `pay-${payments.length + 1}`,
          reconStatus: 'PENDING',
          ...data,
        };
        payments.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }) => {
        const row = payments.find((p) => p.id === where.id);
        const invoice = row && invoices.find((i) => i.id === row.invoiceId);
        const branch =
          where.invoice?.patient?.branchId ?? where.invoice?.branchId;
        if (
          !row ||
          !invoice ||
          (branch !== undefined && invoice.branchId !== branch)
        )
          return null;
        return { ...row, invoice };
      }),
    },
  };
  const numbers: any = {
    reserve: jest.fn(async () => ({ sequence: 7, periodKey: '2611' })),
  };
  return {
    service: new BillingService(prisma, numbers),
    prisma,
    invoices,
    payments,
    created,
  };
}

const invoiceOf = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  branchId: 'branch-a',
  patientId: 'pat-1',
  total: 1180,
  received: 0,
  balance: 1180,
  ...over,
});

describe('billing invoice totals', () => {
  const totalFor = async (items: any[], discount?: number) => {
    const { service, created } = setup();
    await service.createInvoice(
      { patientId: 'pat-1', items, discount } as any,
      'branch-a',
    );
    return created[0];
  };

  it('adds 18 percent GST to a plain line', async () => {
    const data = await totalFor([{ qty: 2, unitPrice: 500, gstRate: 18 }]);
    expect(data.total).toBeCloseTo(1180, 6);
    expect(data.balance).toBeCloseTo(1180, 6);
  });

  it('applies the line discount before GST and the overall discount to the subtotal only', async () => {
    const data = await totalFor(
      [{ qty: 3, unitPrice: 1000, gstRate: 12, discount: 10 }],
      5,
    );
    expect(data.total).toBeCloseTo(2565 + 324, 6);
  });

  it('sums mixed GST rates per line', async () => {
    const data = await totalFor([
      { qty: 1, unitPrice: 500, gstRate: 0 },
      { qty: 1, unitPrice: 8000, gstRate: 18 },
    ]);
    expect(data.total).toBeCloseTo(500 + 8000 + 1440, 6);
  });

  it('keeps fractional paise from non-round amounts', async () => {
    const data = await totalFor([{ qty: 3, unitPrice: 33.33, gstRate: 18 }]);
    expect(data.total).toBeCloseTo(117.9882, 4);
  });

  it('charges GST on the line amounts even when the overall discount is a hundred percent', async () => {
    const data = await totalFor([{ qty: 1, unitPrice: 750, gstRate: 18 }], 100);
    expect(data.total).toBeCloseTo(135, 6);
    expect(data.total).toBeGreaterThanOrEqual(0);
  });

  it('rejects an invoice without items before touching the database', async () => {
    const { service, prisma } = setup();
    await expect(
      service.createInvoice(
        { patientId: 'pat-1', items: [] } as any,
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.newInvoice.create).not.toHaveBeenCalled();
  });
});

describe('billing payment application', () => {
  it('records a partial payment and leaves the remaining balance', async () => {
    const { service, invoices } = setup({ invoices: [invoiceOf()] });
    await service.processPayment(
      { invoiceId: 'inv-1', amount: 500, method: 'CASH' } as any,
      'branch-a',
    );
    expect(invoices[0]).toMatchObject({ received: 500, balance: 680 });
  });

  it('settles the invoice when payments add up to the total', async () => {
    const { service, invoices } = setup({ invoices: [invoiceOf()] });
    await service.processPayment(
      { invoiceId: 'inv-1', amount: 500, method: 'CASH' } as any,
      'branch-a',
    );
    await service.processPayment(
      { invoiceId: 'inv-1', amount: 680, method: 'UPI' } as any,
      'branch-a',
    );
    expect(invoices[0]).toMatchObject({ received: 1180, balance: 0 });
  });

  it('never lets the balance go negative on an overpayment', async () => {
    const { service, invoices } = setup({ invoices: [invoiceOf()] });
    await service.processPayment(
      { invoiceId: 'inv-1', amount: 1500, method: 'CASH' } as any,
      'branch-a',
    );
    expect(invoices[0].balance).toBe(0);
  });

  it('keeps fractional balances exact to the paisa', async () => {
    const { service, invoices } = setup({
      invoices: [invoiceOf({ total: 117.99, balance: 117.99 })],
    });
    await service.processPayment(
      { invoiceId: 'inv-1', amount: 100.5, method: 'CASH' } as any,
      'branch-a',
    );
    expect(invoices[0].balance).toBeCloseTo(17.49, 6);
  });

  it('refuses to apply a payment to another branch invoice', async () => {
    const { service, prisma, invoices } = setup({
      invoices: [invoiceOf({ branchId: 'branch-b' })],
    });
    await expect(
      service.processPayment(
        { invoiceId: 'inv-1', amount: 100, method: 'CASH' } as any,
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.newPayment.create).not.toHaveBeenCalled();
    expect(invoices[0]).toMatchObject({ received: 0, balance: 1180 });
  });
});

describe('billing refunds', () => {
  const paid = (over: Partial<Payment> = {}): Payment => ({
    id: 'pay-1',
    invoiceId: 'inv-1',
    amount: 1000,
    mode: 'CASH',
    reconStatus: 'COMPLETED',
    ...over,
  });
  const paidInvoice = () => invoiceOf({ received: 1000, balance: 180 });

  it('records a partial refund as a negative payment and reopens the balance', async () => {
    const { service, invoices, payments } = setup({
      invoices: [paidInvoice()],
      payments: [paid()],
    });
    const refund = await service.processRefund(
      { paymentId: 'pay-1', amount: 400 } as any,
      'branch-a',
    );
    expect(refund.amount).toBe(-400);
    expect(payments).toHaveLength(2);
    expect(invoices[0]).toMatchObject({ received: 600, balance: 580 });
  });

  it('allows refunding exactly what was paid', async () => {
    const { service, invoices } = setup({
      invoices: [paidInvoice()],
      payments: [paid()],
    });
    await service.processRefund(
      { paymentId: 'pay-1', amount: 1000 } as any,
      'branch-a',
    );
    expect(invoices[0]).toMatchObject({ received: 0, balance: 1180 });
  });

  it.each([1000.01, 5000])(
    'rejects a refund of %s above the paid amount without writing',
    async (amount) => {
      const { service, prisma, invoices } = setup({
        invoices: [paidInvoice()],
        payments: [paid()],
      });
      await expect(
        service.processRefund(
          { paymentId: 'pay-1', amount } as any,
          'branch-a',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.newPayment.create).not.toHaveBeenCalled();
      expect(invoices[0]).toMatchObject({ received: 1000, balance: 180 });
    },
  );

  it.each([0, -50])('rejects a refund amount of %s', async (amount) => {
    const { service, prisma } = setup({
      invoices: [paidInvoice()],
      payments: [paid()],
    });
    await expect(
      service.processRefund({ paymentId: 'pay-1', amount } as any, 'branch-a'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.newPayment.create).not.toHaveBeenCalled();
  });

  it('rejects refunding a payment that is not completed', async () => {
    const { service, prisma } = setup({
      invoices: [paidInvoice()],
      payments: [paid({ reconStatus: 'PENDING' })],
    });
    await expect(
      service.processRefund(
        { paymentId: 'pay-1', amount: 100 } as any,
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.newPayment.create).not.toHaveBeenCalled();
  });

  it('rejects refunding a refund row', async () => {
    const { service } = setup({
      invoices: [paidInvoice()],
      payments: [paid({ amount: -400 })],
    });
    await expect(
      service.processRefund(
        { paymentId: 'pay-1', amount: 100 } as any,
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies a refund on another branch payment', async () => {
    const { service, prisma, invoices } = setup({
      invoices: [{ ...paidInvoice(), branchId: 'branch-b' }],
      payments: [paid()],
    });
    await expect(
      service.processRefund(
        { paymentId: 'pay-1', amount: 100 } as any,
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.newPayment.create).not.toHaveBeenCalled();
    expect(invoices[0].received).toBe(1000);
  });
});
