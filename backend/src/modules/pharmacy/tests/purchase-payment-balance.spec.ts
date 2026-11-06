import { daysPastDue, invoiceSettled } from '../purchase-payment-balance';

describe('purchase payment balance', () => {
  it('counts days past due in clinic days, negative before the due day', () => {
    expect(daysPastDue(new Date('2026-05-05T19:00:00.000Z'), '2026-05-06')).toBe(0);
    expect(daysPastDue(new Date('2026-05-05T18:29:59.000Z'), '2026-05-06')).toBe(1);
    expect(daysPastDue('2026-04-01T00:00:00.000Z', '2026-05-06')).toBe(35);
    expect(daysPastDue('2026-05-10T00:00:00.000Z', '2026-05-06')).toBe(-4);
  });

  it('settles a bill by its payments plus applied credit', () => {
    expect(
      invoiceSettled({ creditApplied: 50, paymentAllocations: [{ amount: 100.1 }, { amount: 0.2 }] }),
    ).toBe(150.3);
    expect(invoiceSettled({ paymentAllocations: [{ amount: 400 }] })).toBe(400);
    expect(invoiceSettled({ creditApplied: 25 })).toBe(25);
  });
});
