import { billTaxOnTop, priceBill } from '@/lib/bill-pricing';
import { billTaxOnTop as serverBillTaxOnTop, priceBill as serverPriceBill } from '../../../backend/src/modules/pharmacy/bill-pricing';

const lines = [
  { quantity: 3, unitPrice: 33.33, discountPercent: 0, taxPercent: 5 },
  { quantity: 1, unitPrice: 47.5, discountPercent: 10, taxPercent: 12 },
  { quantity: 2, unitPrice: 18.25, discountPercent: 0, taxPercent: 18 },
];

const cases = [
  [lines, null],
  [lines, { kind: 'PERCENT', value: 10 }],
  [lines, { kind: 'AMOUNT', value: 50 }],
  [lines, { kind: 'PERCENT', value: 12.5 }],
  [[{ quantity: 1, unitPrice: 853.13, discountPercent: 0, taxPercent: 5 }, { quantity: 1, unitPrice: 635, discountPercent: 0, taxPercent: 18 }, { quantity: 1, unitPrice: 1990, discountPercent: 0, taxPercent: 18 }], null],
  [[{ quantity: 1, unitPrice: 0.01, discountPercent: 0, taxPercent: 5 }, { quantity: 7, unitPrice: 9.99, discountPercent: 2.5, taxPercent: 12 }], { kind: 'AMOUNT', value: 3.33 }],
] as const;

it('prices a bill on screen exactly as the server stores it', () => {
  expect(cases.map(([bill, discount]) => priceBill([...bill], discount))).toEqual(
    cases.map(([bill, discount]) => serverPriceBill([...bill], discount)),
  );
  expect(priceBill(lines, { kind: 'PERCENT', value: 10 }).total).toBe(161.32);
  expect(priceBill(lines, { kind: 'AMOUNT', value: 50 }).lines.map((line) => line.billDiscount)).toEqual([27.89, 11.93, 10.18]);
});

it('shows the price of a medicine on screen as its total, with the GST inside it', () => {
  expect(priceBill([{ quantity: 1, unitPrice: 853.13, discountPercent: 0, taxPercent: 5 }], null)).toMatchObject({ taxable: 812.5, tax: 40.63, total: 853.13 });
  expect(priceBill([{ quantity: 1, unitPrice: 635, discountPercent: 0, taxPercent: 18 }], null).total).toBe(635);
  expect(priceBill([{ quantity: 1, unitPrice: 1990, discountPercent: 0, taxPercent: 18 }], null).total).toBe(1990);
});

it('tells a bill charged with GST on top from one priced at MRP exactly as the server does', () => {
  const bills = [
    { subtotal: 1488.13, discountAmount: 148.81, taxAmount: 141.26, totalAmount: 1480.58 },
    { subtotal: 1488.13, discountAmount: 148.81, taxAmount: 123.74, totalAmount: 1339.32 },
    { subtotal: 360, discountAmount: 0, taxAmount: 0, totalAmount: 360 },
    { subtotal: 853.13, discountAmount: 0, taxAmount: 42.66, totalAmount: 895.79 },
    { subtotal: 853.13, discountAmount: 0, taxAmount: 40.63, totalAmount: 853.13 },
  ];
  expect(bills.map(billTaxOnTop)).toEqual([true, false, false, true, false]);
  expect(bills.map(billTaxOnTop)).toEqual(bills.map(serverBillTaxOnTop));
});
