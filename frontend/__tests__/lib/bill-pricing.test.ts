import { priceBill } from '@/lib/bill-pricing';
import { priceBill as serverPriceBill } from '../../../backend/src/modules/pharmacy/bill-pricing';

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
  [[{ quantity: 1, unitPrice: 0.01, discountPercent: 0, taxPercent: 5 }, { quantity: 7, unitPrice: 9.99, discountPercent: 2.5, taxPercent: 12 }], { kind: 'AMOUNT', value: 3.33 }],
] as const;

it('prices a bill on screen exactly as the server stores it', () => {
  expect(cases.map(([bill, discount]) => priceBill([...bill], discount))).toEqual(
    cases.map(([bill, discount]) => serverPriceBill([...bill], discount)),
  );
  expect(priceBill(lines, { kind: 'PERCENT', value: 10 }).total).toBe(176.35);
  expect(priceBill(lines, { kind: 'AMOUNT', value: 50 }).lines.map((line) => line.billDiscount)).toEqual([27.89, 11.93, 10.18]);
});
