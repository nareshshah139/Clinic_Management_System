import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkPaymentDto, PaymentDto, RefundDto } from '../dto/invoice.dto';
import { QueryInvoicesDto, QueryPaymentsDto } from '../dto/query-billing.dto';

const CUID = 'cmwaukrck000p7dhsioybuf2v';
const failures = async (type: any, body: object) =>
  (await validate(plainToInstance(type, body) as object)).map((error) => error.property);

/** Clinic invoices, payments, visits and appointments have CUID ids, so the billing routes must accept them. */
describe('billing request ids', () => {
  it('accepts CUID ids for a payment, a refund, a bulk payment and the list filters', async () => {
    expect({
      payment: await failures(PaymentDto, { invoiceId: CUID, amount: 200, method: 'CASH' }),
      refund: await failures(RefundDto, { paymentId: CUID, amount: 50 }),
      bulk: await failures(BulkPaymentDto, { invoiceIds: [CUID], totalAmount: 200, method: 'UPI' }),
      invoices: await failures(QueryInvoicesDto, { visitId: CUID, appointmentId: CUID }),
      payments: await failures(QueryPaymentsDto, { invoiceId: CUID }),
    }).toEqual({ payment: [], refund: [], bulk: [], invoices: [], payments: [] });
  });

  it('still refuses an id that is neither a UUID nor a CUID', async () => {
    expect(await failures(PaymentDto, { invoiceId: 'INV-20261110-001', amount: 200, method: 'CASH' })).toEqual(['invoiceId']);
  });
});
