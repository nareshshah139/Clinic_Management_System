import { Logger } from '@nestjs/common';
import { PaymentMode, PrismaClient } from '@prisma/client';
import { gate } from '../../../shared/testing/interleave';
import { localDatabase } from '../../../shared/testing/local-database';
import { InvoiceNumbersService } from '../../../shared/numbering/invoice-numbers.service';
import { BillingService } from '../billing.service';

const databaseTests = process.env.FORMAL_REPLAY_TEST_DATABASE_URL ? describe : describe.skip;

databaseTests('Clinic billing formal replay', () => {
  let fixture: Awaited<ReturnType<typeof localDatabase>>;
  let prisma: PrismaClient;
  let branchId: string;
  let patientId: string;

  const billing = (client: PrismaClient) => new BillingService(client as any, new InvoiceNumbersService(client as any));

  const newBill = async () => {
    const invoice = await billing(prisma).createInvoice(
      { patientId, items: [{ name: 'Consultation', description: 'Consultation', quantity: 1, unitPrice: 400, gstRate: 0 }] } as any,
      branchId,
    );
    return invoice.id as string;
  };

  const pay = (invoiceId: string, amount: number, method: PaymentMode = 'CASH', client = prisma) =>
    billing(client).processPayment({ invoiceId, amount, method } as any, branchId);

  const bill = async (id: string) => {
    const { total, received, balance } = await prisma.newInvoice.findUniqueOrThrow({ where: { id } });
    return { total, received, balance };
  };

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    Logger.overrideLogger(false);
    fixture = await localDatabase(process.env.FORMAL_REPLAY_TEST_DATABASE_URL!);
    prisma = fixture.prisma;
    branchId = (await prisma.branch.create({ data: { name: 'Synthetic billing', address: 'Synthetic' } })).id;
    patientId = (
      await prisma.patient.create({ data: { name: 'Synthetic Patient', gender: 'F', phone: '9000000001', branchId } })
    ).id;
  }, 120_000);

  afterAll(() => fixture?.cleanup());

  async function editRacesPayment(invoiceId: string, amount: number) {
    const g = gate(prisma, 'newInvoice.update', { when: 'before' });
    const edit = billing(g.client).updateInvoice(invoiceId, { discount: 0 }, branchId);
    await g.arrived;
    await pay(invoiceId, amount);
    g.release();
    await edit;
  }

  it('BalanceMatches: an edit saved while a payment lands keeps the balance at total less received', async () => {
    const id = await newBill();
    await editRacesPayment(id, 200);
    expect(await bill(id)).toEqual({ total: 400, received: 200, balance: 200 });
  });

  async function lowerAPaidBill(invoiceId: string) {
    await pay(invoiceId, 200);
    await pay(invoiceId, 200);
    return billing(prisma).updateInvoice(invoiceId, { discount: 50 }, branchId);
  }

  it('ReceivedWithinTotal: a paid bill cannot be edited below what it has received', async () => {
    const id = await newBill();
    await expect(lowerAPaidBill(id)).rejects.toThrow('its total cannot go below');
    expect(await bill(id)).toEqual({ total: 400, received: 400, balance: 0 });
  });

  async function payInFullTwiceAroundAnEdit(invoiceId: string) {
    await editRacesPayment(invoiceId, 400);
    return pay(invoiceId, 400);
  }

  it('ReceivedWithinTotal: after an edit races a full payment, the desk cannot take the full amount again', async () => {
    const id = await newBill();
    await expect(payInFullTwiceAroundAnEdit(id)).rejects.toThrow('already paid in full');
    expect(await bill(id)).toEqual({ total: 400, received: 400, balance: 0 });
  });

  async function refundUpiPaymentTwice(invoiceId: string) {
    const upi = await pay(invoiceId, 200, 'UPI');
    await pay(invoiceId, 200, 'CASH');
    await billing(prisma).processRefund({ paymentId: upi.id, amount: 200 } as any, branchId);
    return billing(prisma).processRefund({ paymentId: upi.id, amount: 200 } as any, branchId);
  }

  const refundModes = async (invoiceId: string) =>
    (await prisma.newPayment.findMany({ where: { invoiceId, amount: { lt: 0 } }, orderBy: { createdAt: 'asc' } })).map(
      (row) => `${row.mode} ${row.amount}`,
    );

  it.failing('RefundsWithinPayment: a 200 UPI payment cannot be refunded twice', async () => {
    const id = await newBill();
    await expect(refundUpiPaymentTwice(id)).rejects.toThrow();
    expect(await refundModes(id)).toEqual(['UPI -200']);
  });

  it('today: a 200 UPI payment is refunded twice, both as UPI', async () => {
    const id = await newBill();
    await refundUpiPaymentTwice(id);
    expect(await refundModes(id)).toEqual(['UPI -200', 'UPI -200']);
    expect(await bill(id)).toEqual({ total: 400, received: 0, balance: 400 });
  });

  async function startCardPayment(invoiceId: string) {
    const payment = await billing(prisma).processPayment(
      { invoiceId, amount: 200, method: 'UPI', gateway: 'razorpay' } as any,
      branchId,
    );
    jest.useFakeTimers();
    jest.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    return (await prisma.newPayment.findUniqueOrThrow({ where: { id: payment.id } })).reconStatus;
  }

  it.failing('GatewayPaymentSettles: a card or UPI payment nobody confirms leaves PENDING by itself', async () => {
    const id = await newBill();
    expect(await startCardPayment(id)).not.toBe('PENDING');
  });

  it('today: a card or UPI payment nobody confirms stays PENDING and the bill stays unpaid', async () => {
    const id = await newBill();
    expect(await startCardPayment(id)).toBe('PENDING');
    expect(await bill(id)).toEqual({ total: 400, received: 0, balance: 400 });
  });
});
