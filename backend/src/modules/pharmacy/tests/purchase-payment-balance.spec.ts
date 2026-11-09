import { daysPastDue, invoiceSettled, payableBalance, scheduledPayments, splitByEffectiveDate } from '../purchase-payment-balance';

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

  it('splits allocations by whether their payment date has arrived', () => {
    const now = new Date('2026-11-06T06:00:00.000Z');
    const today = { amount: 100, payment: { paymentDate: new Date('2026-11-05T18:30:00.000Z') } };
    const tomorrow = { amount: 400, payment: { paymentDate: new Date('2026-11-06T18:30:00.000Z') } };
    const later = { amount: 50, payment: { paymentDate: '2099-01-14T18:30:00.000Z' } };
    const split = splitByEffectiveDate([later, today, tomorrow], now);
    expect(split.inEffect).toEqual([today]);
    expect(split.scheduled).toEqual([later, tomorrow]);
    expect(scheduledPayments(split.scheduled)).toEqual({ scheduled: 450, scheduledOn: '2026-11-07' });
    expect(scheduledPayments([])).toEqual({ scheduled: 0, scheduledOn: null });
  });

  it('offers only what is outstanding now and not already scheduled', () => {
    expect(payableBalance(1000, 400)).toBe(600);
    expect(payableBalance(1000, 1000)).toBe(0);
    expect(payableBalance(400, 600)).toBe(0);
    expect(payableBalance(150.1, 0.2)).toBe(149.9);
  });
});
