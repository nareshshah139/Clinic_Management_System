import { BillPricingError, billTaxOnTop, priceBill, storedLineValue } from '../bill-pricing';

const lines = [
  { quantity: 3, unitPrice: 33.33, discountPercent: 0, taxPercent: 5 },
  { quantity: 1, unitPrice: 47.5, discountPercent: 10, taxPercent: 12 },
  { quantity: 2, unitPrice: 18.25, discountPercent: 0, taxPercent: 18 },
];

describe('priceBill', () => {
  it('splits a 10% bill discount by largest remainder and finds each line\'s GST inside what it is charged', () => {
    expect(priceBill(lines, { kind: 'PERCENT', value: 10 })).toEqual({
      lines: [
        { gross: 99.99, lineDiscount: 0, billDiscount: 10, taxable: 85.7, tax: 4.29, total: 89.99 },
        { gross: 47.5, lineDiscount: 4.75, billDiscount: 4.27, taxable: 34.36, tax: 4.12, total: 38.48 },
        { gross: 36.5, lineDiscount: 0, billDiscount: 3.65, taxable: 27.84, tax: 5.01, total: 32.85 },
      ],
      subtotal: 183.99,
      lineDiscount: 4.75,
      billDiscount: 17.92,
      discount: 22.67,
      taxable: 147.9,
      tax: 13.42,
      total: 161.32,
    });
  });

  it('splits a rupee bill discount to the paisa', () => {
    const priced = priceBill(lines, { kind: 'AMOUNT', value: 50 });
    expect(priced.lines.map((line) => line.billDiscount)).toEqual([27.89, 11.93, 10.18]);
    expect([priced.billDiscount, priced.taxable, priced.tax, priced.total]).toEqual([50, 118.5, 10.74, 129.24]);
  });

  it('prices a bill without a bill discount from its own line discounts', () => {
    expect(priceBill(lines, null)).toMatchObject({ billDiscount: 0, discount: 4.75, tax: 14.91, total: 179.24 });
  });

  it('refuses a rupee discount larger than the bill and a percentage over 100', () => {
    expect(() => priceBill(lines, { kind: 'AMOUNT', value: 179.25 })).toThrow(
      new BillPricingError('Bill discount ₹179.25 is more than the bill after item discounts (₹179.24).'),
    );
    expect(() => priceBill(lines, { kind: 'PERCENT', value: 101 })).toThrow('Bill discount cannot be more than 100%.');
    expect(priceBill(lines, { kind: 'AMOUNT', value: 179.24 }).total).toBe(0);
  });
});

describe('priceBill on a price that already includes GST (MRP)', () => {
  const one = (unitPrice: number, taxPercent: number, quantity = 1, discountPercent = 0) => ({
    quantity,
    unitPrice,
    discountPercent,
    taxPercent,
  });

  it('totals a line at MRP 853.13 with 5% GST at 853.13, not 895.79', () => {
    expect(priceBill([one(853.13, 5)], null)).toEqual({
      lines: [{ gross: 853.13, lineDiscount: 0, billDiscount: 0, taxable: 812.5, tax: 40.63, total: 853.13 }],
      subtotal: 853.13,
      lineDiscount: 0,
      billDiscount: 0,
      discount: 0,
      taxable: 812.5,
      tax: 40.63,
      total: 853.13,
    });
  });

  it('shows the GST contained in an 18% MRP instead of adding it', () => {
    expect(priceBill([one(635, 18)], null)).toMatchObject({ taxable: 538.14, tax: 96.86, total: 635 });
    expect(priceBill([one(1990, 18)], null)).toMatchObject({ taxable: 1686.44, tax: 303.56, total: 1990 });
  });

  it('takes a line discount off the MRP and finds the GST in what is left', () => {
    expect(priceBill([one(853.13, 5, 2, 10)], null).lines[0]).toEqual({
      gross: 1706.26,
      lineDiscount: 170.63,
      billDiscount: 0,
      taxable: 1462.5,
      tax: 73.13,
      total: 1535.63,
    });
  });

  it('takes a rupee bill discount off MRP x quantity, whatever the GST rates are', () => {
    const bill = [one(635, 18), one(1990, 18), one(853.13, 5), one(120, 0, 3)];
    const priced = priceBill(bill, { kind: 'AMOUNT', value: 50 });
    expect([priced.subtotal, priced.discount, priced.total]).toEqual([3838.13, 50, 3788.13]);
    for (const line of priced.lines) expect(line.taxable + line.tax).toBeCloseTo(line.total, 2);
    expect(priced.taxable + priced.tax).toBeCloseTo(priced.total, 2);
  });

  it('charges a zero-rated line its MRP with no GST', () => {
    expect(priceBill([one(120, 0, 3)], null)).toMatchObject({ taxable: 360, tax: 0, total: 360 });
  });
});

describe('storedLineValue', () => {
  it('reads a bill line charged at MRP: the total is MRP x quantity and the GST sits inside it', () => {
    expect(
      storedLineValue({ quantity: 1, unitPrice: 853.13, discountAmount: 0, billDiscountAmount: 0, taxPercent: 5, taxAmount: 40.63, totalAmount: 853.13 }),
    ).toMatchObject({ gross: 853.13, taxable: 812.5, tax: 40.63, total: 853.13 });
  });

  it('keeps a line saved before MRP pricing at what it was charged, GST added on top', () => {
    expect(
      storedLineValue({ quantity: 1, unitPrice: 853.13, discountAmount: 0, billDiscountAmount: 0, taxPercent: 5, taxAmount: 42.66, totalAmount: 895.79 }),
    ).toMatchObject({ gross: 853.13, taxable: 853.13, tax: 42.66, total: 895.79 });
  });

  it('keeps a tax-free line the same on either basis', () => {
    expect(
      storedLineValue({ quantity: 3, unitPrice: 120, discountAmount: 0, billDiscountAmount: 0, taxPercent: 0, taxAmount: 0, totalAmount: 360 }),
    ).toMatchObject({ taxable: 360, tax: 0, total: 360 });
  });
});

describe('billTaxOnTop', () => {
  it('tells a bill saved with GST added on top from one priced at MRP', () => {
    expect(billTaxOnTop({ subtotal: 1488.13, discountAmount: 148.81, taxAmount: 141.26, totalAmount: 1480.58 })).toBe(true);
    expect(billTaxOnTop({ subtotal: 1488.13, discountAmount: 148.81, taxAmount: 123.74, totalAmount: 1339.32 })).toBe(false);
  });

  it('reads a bill with no GST the same on either basis', () => {
    expect(billTaxOnTop({ subtotal: 360, discountAmount: 0, taxAmount: 0, totalAmount: 360 })).toBe(false);
  });

  it('classifies every bill of a seeded sweep, whichever way it was charged', () => {
    let seed = 188;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const rates = [0, 5, 12, 18, 28];
    for (let round = 0; round < 500; round++) {
      const bill = Array.from({ length: 1 + Math.floor(next() * 4) }, () => ({
        quantity: 1 + Math.floor(next() * 5),
        unitPrice: Math.round(next() * 200000) / 100,
        discountPercent: Math.floor(next() * 4) * 5,
        taxPercent: rates[Math.floor(next() * rates.length)],
      }));
      const discount = next() < 0.5 ? null : { kind: 'PERCENT' as const, value: Math.floor(next() * 3) * 5 };
      const priced = priceBill(bill, discount);
      const onMrp = { subtotal: priced.subtotal, discountAmount: priced.discount, taxAmount: priced.tax, totalAmount: priced.total };
      const addedOnTop = {
        ...onMrp,
        totalAmount: Math.round((priced.total + priced.tax) * 100) / 100,
      };
      expect(billTaxOnTop(onMrp)).toBe(false);
      expect(billTaxOnTop(addedOnTop)).toBe(priced.tax >= 0.01);
    }
  });
});
