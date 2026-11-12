/**
 * The ways the front desk takes a clinic payment, in the order the bill offers them. Each value is
 * one the server stores (Prisma PaymentMode); a bank transfer or cheque asks for its reference.
 */
export const DESK_PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'NET_BANKING', label: 'Net banking / NEFT', reference: 'Bank reference / UTR' },
  { value: 'CHEQUE', label: 'Cheque', reference: 'Cheque number' },
] as const;

export type DeskPaymentMode = (typeof DESK_PAYMENT_MODES)[number]['value'];

const LABEL: Record<string, string> = {
  ...Object.fromEntries(DESK_PAYMENT_MODES.map((mode) => [mode.value, mode.label])),
  BNPL: 'Pay later',
};

export const paymentModeLabel = (mode: string) => LABEL[mode] ?? mode;
