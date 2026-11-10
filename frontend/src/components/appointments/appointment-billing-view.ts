import type { AppointmentBilling, BillType } from '@/lib/types';

export const BILL_TYPE_LABEL: Record<BillType, string> = {
  FIRST_CONSULTATION: 'First consultation',
  REVIEW: 'Review',
  PROCEDURE: 'Procedure',
};

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const rupee = (value: number) => rupees.format(value);

export type BillingTone = 'paid' | 'due' | 'unbilled' | 'quiet';

export type BillingChip = {
  /** Shown when the row has room: amount and state together. */
  text: string;
  /** Shown on a narrow row: the state, with the amount still due. */
  short: string;
  /** Shown on a phone-width row: ₹ with a tick when paid, or with ! when money is to be collected. */
  tiny: string;
  tone: BillingTone;
  /** The full sentence for screen readers and the tooltip. */
  label: string;
};

/**
 * @cc [owner:nareshshah139,label:product] appointment-billing-chip
 * The row MUST show the bill's amount and state together ("₹500 · Paid", "₹500 · Due ₹200",
 * "Not billed"), with the bill count when there is more than one, and MUST mark unpaid money or a
 * finished visit without a bill in words as well as colour.
 */
export function billingChip(billing: AppointmentBilling, billType?: BillType): BillingChip {
  const count = billing.invoices.length;
  const bills = count > 1 ? ` · ${count} bills` : '';
  const kind = billType ? `${BILL_TYPE_LABEL[billType]} bill` : 'Bill';
  if (billing.state === 'NOT_BILLED') {
    return {
      text: 'Not billed',
      short: 'Not billed',
      tiny: billing.attention ? '₹!' : '',
      tone: billing.attention ? 'unbilled' : 'quiet',
      label: billing.attention ? `${kind}: not billed yet, visit finished` : `${kind}: not billed yet`,
    };
  }
  if (billing.state === 'PAID') {
    return {
      text: `${rupee(billing.total)} · Paid${bills}`,
      short: 'Paid',
      tiny: '₹✓',
      tone: 'paid',
      label: `${kind}: ${rupee(billing.total)}${count > 1 ? ` in ${count} bills` : ''}, paid`,
    };
  }
  return {
    text: `${rupee(billing.total)} · Due ${rupee(billing.due)}${bills}`,
    short: `Due ${rupee(billing.due)}`,
    tiny: '₹!',
    tone: 'due',
    label: `${kind}: ${rupee(billing.total)}${count > 1 ? ` in ${count} bills` : ''}, ${rupee(billing.due)} due`,
  };
}

/** The line a new bill starts from, so the desk only types the fee. */
export function defaultBillLine(billType: BillType | undefined, procedure?: string): string {
  if (billType === 'PROCEDURE') return procedure?.trim() ? `Procedure: ${procedure.trim()}` : 'Procedure';
  if (billType === 'REVIEW') return 'Review consultation';
  return 'First consultation';
}
