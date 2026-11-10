export type BillDiscountKind = 'PERCENT' | 'AMOUNT';
export type BillDiscount = { kind: BillDiscountKind; value: number };

export type PricingLine = {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
};

export type PricedLine = {
  gross: number;
  lineDiscount: number;
  billDiscount: number;
  taxable: number;
  tax: number;
  total: number;
};

export type BillPrice = {
  lines: PricedLine[];
  subtotal: number;
  lineDiscount: number;
  billDiscount: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
};

export class BillPricingError extends Error {}

const paise = (rupees: number) => Math.round(Number((rupees * 100).toFixed(6)));
const share = (paiseAmount: number, percent: number) => paise((paiseAmount * percent) / 10000);
const rupees = (amount: number) => amount / 100;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function apportion(amount: number, weights: number[]): number[] {
  const whole = sum(weights);
  if (!amount) return weights.map(() => 0);
  const exact = weights.map((weight) => amount * weight);
  const shares = exact.map((value) => Math.floor(value / whole));
  let left = amount - sum(shares);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value % whole }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    shares[index] += 1;
    left -= 1;
  }
  return shares;
}

function billDiscountPaise(discount: BillDiscount | null | undefined, net: number): number {
  if (!discount || !discount.value) return 0;
  if (!Number.isFinite(discount.value) || discount.value < 0) throw new BillPricingError('Bill discount cannot be negative.');
  if (discount.kind === 'PERCENT') {
    if (discount.value > 100) throw new BillPricingError('Bill discount cannot be more than 100%.');
    return share(net, discount.value);
  }
  const amount = paise(discount.value);
  if (amount > net)
    throw new BillPricingError(
      `Bill discount ₹${rupees(amount).toFixed(2)} is more than the bill after item discounts (₹${rupees(net).toFixed(2)}).`,
    );
  return amount;
}

export function priceBill(lines: PricingLine[], discount?: BillDiscount | null): BillPrice {
  const gross = lines.map((line) => paise(line.quantity * line.unitPrice));
  const lineDiscount = lines.map((line, index) => share(gross[index], line.discountPercent || 0));
  const net = gross.map((value, index) => value - lineDiscount[index]);
  const billDiscount = apportion(billDiscountPaise(discount, sum(net)), net);
  const taxable = net.map((value, index) => value - billDiscount[index]);
  const tax = lines.map((line, index) => share(taxable[index], line.taxPercent || 0));
  const priced = lines.map((_, index) => ({
    gross: rupees(gross[index]),
    lineDiscount: rupees(lineDiscount[index]),
    billDiscount: rupees(billDiscount[index]),
    taxable: rupees(taxable[index]),
    tax: rupees(tax[index]),
    total: rupees(taxable[index] + tax[index]),
  }));
  return {
    lines: priced,
    subtotal: rupees(sum(gross)),
    lineDiscount: rupees(sum(lineDiscount)),
    billDiscount: rupees(sum(billDiscount)),
    discount: rupees(sum(lineDiscount) + sum(billDiscount)),
    taxable: rupees(sum(taxable)),
    tax: rupees(sum(tax)),
    total: rupees(sum(taxable) + sum(tax)),
  };
}
