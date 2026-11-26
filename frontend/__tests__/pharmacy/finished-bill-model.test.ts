import { paymentAmount, previewDiscount, revisionRequest, settlementOf, type FinishedBill } from '@/components/pharmacy/sales/finished-bill-model';

const line = (id: string, quantity: number, unitPrice: number, discountPercent: number, taxPercent: number) => ({
  id, itemType: 'DRUG' as const, quantity, unitPrice, discountPercent, taxPercent,
  discountAmount: 0, billDiscountAmount: 0, taxAmount: 0, totalAmount: 0, drug: { name: id }, package: null,
});

const bill = (overrides: Partial<FinishedBill> = {}): FinishedBill => ({
  id: 'inv-1', invoiceNumber: 'PHI-2026-001', status: 'CONFIRMED', mutationVersion: 4, invoiceDate: '2026-11-09T05:00:00.000Z', revisedAt: null,
  billingName: 'Meera Shah', billingPhone: '9876543210', patient: null, doctor: null,
  subtotal: 330, discountAmount: 45, billDiscountKind: 'AMOUNT', billDiscountValue: 25, billDiscountAmount: 25, taxAmount: 36.82, totalAmount: 285,
  items: [line('Cream', 2, 50, 10, 12), line('Tablet', 1, 30, 0, 5), line('Shampoo', 1, 200, 5, 18)],
  payments: [{ id: 'p1', amount: 285, method: 'CASH', status: 'COMPLETED', paymentDate: '2026-11-09T05:00:00.000Z' }],
  revisions: [],
  ...overrides,
});

it('previews a 20% bill discount on a paid bill as a refund due', () => {
  const edit = { billDiscount: { kind: 'PERCENT' as const, value: 20 }, lineDiscounts: { Tablet: 10 } };
  const preview = previewDiscount(bill(), edit);
  expect(preview.ok && [preview.price.total, preview.changed, preview.settlement]).toEqual([245.6, true, { paid: 285, due: 0, refundDue: 39.4 }]);
  expect(revisionRequest(bill(), edit, '  Senior citizen  ')).toEqual({
    expectedVersion: 4,
    billDiscount: { kind: 'PERCENT', value: 20 },
    lines: [
      { id: 'Cream', discountPercent: 10 },
      { id: 'Tablet', discountPercent: 10 },
      { id: 'Shampoo', discountPercent: 5 },
    ],
    reason: 'Senior citizen',
  });
});

it('says when nothing changed and refuses impossible discounts in plain words', () => {
  const same = previewDiscount(bill(), { billDiscount: { kind: 'AMOUNT', value: 25 }, lineDiscounts: {} });
  expect(same.ok && [same.changed, same.price.total]).toEqual([false, 285]);
  expect(previewDiscount(bill(), { billDiscount: null, lineDiscounts: { Cream: 120 } })).toEqual({
    ok: false,
    problem: 'Discount for Cream must be between 0 and 100%.',
  });
  expect(previewDiscount(bill(), { billDiscount: { kind: 'AMOUNT', value: 400 }, lineDiscounts: {} })).toEqual({
    ok: false,
    problem: 'Bill discount ₹400.00 is more than the bill after item discounts (₹310.00).',
  });
});

it('reads paid, due and refund due from the ledger, refunds included', () => {
  const refunded = bill({
    totalAmount: 245.6,
    payments: [...bill().payments, { id: 'r1', amount: -39.4, method: 'CASH', status: 'REFUNDED', paymentDate: '2026-11-09T06:00:00.000Z' }],
  });
  expect([settlementOf(bill({ totalAmount: 245.6 })), settlementOf(refunded), settlementOf(bill({ payments: [] }))]).toEqual([
    { paid: 285, due: 0, refundDue: 39.4 },
    { paid: 245.6, due: 0, refundDue: 0 },
    { paid: 0, due: 285, refundDue: 0 },
  ]);
});

it('takes a full or part payment up to the balance due, in paise at most', () => {
  expect(['490', '150.5', '0', '', '12.345', '490.01'].map((text) => paymentAmount(text, 490))).toEqual([
    { ok: true, amount: 490 },
    { ok: true, amount: 150.5 },
    { ok: false, problem: 'Enter an amount above ₹0.' },
    { ok: false, problem: 'Enter an amount above ₹0.' },
    { ok: false, problem: 'Use at most two decimal places.' },
    { ok: false, problem: 'Only ₹490.00 is due on this bill.' },
  ]);
});
