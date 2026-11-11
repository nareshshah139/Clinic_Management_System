import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { BulkPaymentDto, PaymentDto } from '../dto/invoice.dto';
import { PaymentSummaryDto, QueryPaymentsDto } from '../dto/query-billing.dto';
import { PaymentQueryDto, RevenueQueryDto } from '../../reports/dto/query-reports.dto';

const CUID = 'cmwaukrck000p7dhsioybuf2v';
const pipe = diagnosticValidationPipe();
const body = (metatype: any, value: object) => pipe.transform(value, { type: 'body', metatype });
const query = (metatype: any, value: object) => pipe.transform(value, { type: 'query', metatype });
const refusal = async (attempt: Promise<unknown>) => {
  const error = await attempt.then(() => null, (e) => e);
  return error instanceof BadRequestException ? [error.getStatus(), (error.getResponse() as any).message] : error;
};

/** The modes the API accepts are the modes the database stores, so a mode it cannot store is a 400, never a 500. */
describe('clinic payment modes at the API boundary', () => {
  it('accepts every mode the database stores for a payment', async () => {
    const accepted = [];
    for (const method of ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'CHEQUE', 'BNPL'])
      accepted.push((await body(PaymentDto, { invoiceId: CUID, amount: 500, method, reference: 'UTR 4521' })).method);
    expect(accepted).toEqual(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'CHEQUE', 'BNPL']);
  });

  it('refuses a mode the database cannot store with a 400 that lists the modes it can', async () => {
    const modes = 'use one of CASH, CARD, UPI, BNPL, NET_BANKING, CHEQUE';
    expect([
      await refusal(body(PaymentDto, { invoiceId: CUID, amount: 500, method: 'NETBANKING' })),
      await refusal(body(BulkPaymentDto, { invoiceIds: [CUID], totalAmount: 500, method: 'BITCOIN' })),
      await refusal(query(QueryPaymentsDto, { method: 'WALLET' })),
      await refusal(query(PaymentSummaryDto, { method: 'NEFT' })),
      await refusal(query(RevenueQueryDto, { paymentMode: 'INSURANCE' })),
      await refusal(query(PaymentQueryDto, { paymentMode: 'cash' })),
    ]).toEqual([
      [400, [`method "NETBANKING" is not a payment mode; ${modes}`]],
      [400, [`method "BITCOIN" is not a payment mode; ${modes}`]],
      [400, [`method "WALLET" is not a payment mode; ${modes}`]],
      [400, [`method "NEFT" is not a payment mode; ${modes}`]],
      [400, [`paymentMode "INSURANCE" is not a payment mode; ${modes}`]],
      [400, [`paymentMode "cash" is not a payment mode; ${modes}`]],
    ]);
  });
});
