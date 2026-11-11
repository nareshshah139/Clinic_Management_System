import type { AppointmentBilling, BillType } from '@/lib/types';

export const BILL_TYPE_LABEL: Record<BillType, string> = {
  FIRST_CONSULTATION: 'First consultation',
  REVIEW: 'Review',
  PROCEDURE: 'Procedure',
};

/** The bill type on a desktop row, where the name and status need the room. */
export const BILL_TYPE_SHORT: Record<BillType, string> = {
  FIRST_CONSULTATION: 'First',
  REVIEW: 'Review',
  PROCEDURE: 'Procedure',
};

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const rupee = (value: number) => rupees.format(value);

export type BillingTone = 'paid' | 'due' | 'unbilled' | 'quiet';

/** Row widths, narrowest first. Each step of a chip's wording starts at one of them and holds until the next step. */
export const CHIP_WIDTHS = ['phone', 'narrow', 'desk', 'full'] as const;
export type ChipWidth = (typeof CHIP_WIDTHS)[number];
export type ChipStep = { from: ChipWidth; text: string };

export type BillingChip = {
  /** The wording at each row width, narrowest first: a phone row says ₹✓ or ₹!, a desktop row the amount to act on. */
  steps: ChipStep[];
  /** The fullest wording: amount, state and bill count. */
  text: string;
  tone: BillingTone;
  /** The full sentence for screen readers and the tooltip. */
  label: string;
};

function chip(byWidth: Record<ChipWidth, string>, tone: BillingTone, label: string): BillingChip {
  const steps = CHIP_WIDTHS.filter((width, i) => i === 0 || byWidth[width] !== byWidth[CHIP_WIDTHS[i - 1]]).map((from) => ({ from, text: byWidth[from] }));
  return { steps, text: byWidth.full, tone, label };
}

/**
 * @cc [owner:nareshshah139,label:product] appointment-billing-chip
 * A desktop row MUST show the bill's state with the amount to act on ("₹500 · Paid", "₹200 due",
 * "Not billed"); a wide row MUST add the bill total once part is paid ("₹1,700 · ₹200 due") and the
 * bill count when there is more than one. The chip MUST mark unpaid money or a finished visit without a bill in
 * words as well as colour, and its label MUST carry the total, the count and the amount due.
 */
export function billingChip(billing: AppointmentBilling, billType?: BillType): BillingChip {
  const count = billing.invoices.length;
  const bills = count > 1 ? ` · ${count} bills` : '';
  const kind = billType ? `${BILL_TYPE_LABEL[billType]} bill` : 'Bill';
  const total = rupee(billing.total);
  if (billing.state === 'NOT_BILLED') {
    const tiny = billing.attention ? '₹!' : '';
    return chip(
      { phone: tiny, narrow: 'Not billed', desk: 'Not billed', full: 'Not billed' },
      billing.attention ? 'unbilled' : 'quiet',
      billing.attention ? `${kind}: not billed yet, visit finished` : `${kind}: not billed yet`,
    );
  }
  if (billing.state === 'PAID') {
    return chip(
      { phone: '₹✓', narrow: 'Paid', desk: `${total} · Paid`, full: `${total} · Paid${bills}` },
      'paid',
      `${kind}: ${total}${count > 1 ? ` in ${count} bills` : ''}, paid`,
    );
  }
  const due = `${rupee(billing.due)} due`;
  const withTotal = billing.received > 0 ? `${total} · ${due}` : due;
  return chip(
    { phone: '₹!', narrow: due, desk: due, full: `${withTotal}${bills}` },
    'due',
    `${kind}: ${total}${count > 1 ? ` in ${count} bills` : ''}, ${rupee(billing.due)} due`,
  );
}

/** The line a new bill starts from, so the desk only types the fee. */
export function defaultBillLine(billType: BillType | undefined, procedure?: string): string {
  if (billType === 'PROCEDURE') return procedure?.trim() ? `Procedure: ${procedure.trim()}` : 'Procedure';
  if (billType === 'REVIEW') return 'Review consultation';
  return 'First consultation';
}
