import { BillPricingError, priceBill } from '../bill-pricing';

const lines = [
  { quantity: 3, unitPrice: 33.33, discountPercent: 0, taxPercent: 5 },
  { quantity: 1, unitPrice: 47.5, discountPercent: 10, taxPercent: 12 },
  { quantity: 2, unitPrice: 18.25, discountPercent: 0, taxPercent: 18 },
];

describe('priceBill', () => {
  it('splits a 10% bill discount by largest remainder and taxes each line on its discounted value', () => {
    expect(priceBill(lines, { kind: 'PERCENT', value: 10 })).toEqual({
      lines: [
        { gross: 99.99, lineDiscount: 0, billDiscount: 10, taxable: 89.99, tax: 4.5, total: 94.49 },
        { gross: 47.5, lineDiscount: 4.75, billDiscount: 4.27, taxable: 38.48, tax: 4.62, total: 43.1 },
        { gross: 36.5, lineDiscount: 0, billDiscount: 3.65, taxable: 32.85, tax: 5.91, total: 38.76 },
      ],
      subtotal: 183.99,
      lineDiscount: 4.75,
      billDiscount: 17.92,
      discount: 22.67,
      taxable: 161.32,
      tax: 15.03,
      total: 176.35,
    });
  });

  it('splits a rupee bill discount to the paisa', () => {
    const priced = priceBill(lines, { kind: 'AMOUNT', value: 50 });
    expect(priced.lines.map((line) => line.billDiscount)).toEqual([27.89, 11.93, 10.18]);
    expect([priced.billDiscount, priced.taxable, priced.tax, priced.total]).toEqual([50, 129.24, 12.05, 141.29]);
  });

  it('prices a bill without a bill discount from its own line discounts', () => {
    expect(priceBill(lines, null)).toMatchObject({ billDiscount: 0, discount: 4.75, tax: 16.7, total: 195.94 });
  });

  it('refuses a rupee discount larger than the bill and a percentage over 100', () => {
    expect(() => priceBill(lines, { kind: 'AMOUNT', value: 179.25 })).toThrow(
      new BillPricingError('Bill discount ₹179.25 is more than the bill after item discounts (₹179.24).'),
    );
    expect(() => priceBill(lines, { kind: 'PERCENT', value: 101 })).toThrow('Bill discount cannot be more than 100%.');
    expect(priceBill(lines, { kind: 'AMOUNT', value: 179.24 }).total).toBe(0);
  });
});
