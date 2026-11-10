import { PharmacyPaymentStatus } from '@prisma/client';
import { money } from './gst-slabs';

/**
 * A pharmacy bill's money ledger: receipts are COMPLETED entries and refunds are REFUNDED entries of minus
 * the amount handed back. What was paid is the sum of both, so every reader that adds payments up uses these.
 */
export const LEDGER_STATUSES: PharmacyPaymentStatus[] = ['COMPLETED', 'REFUNDED'];

export const isLedgerEntry = (payment: { status: string }) =>
  (LEDGER_STATUSES as string[]).includes(payment.status);

export const ledgerPaid = (payments: { status: string; amount: number }[]) =>
  money(payments.filter(isLedgerEntry).reduce((sum, payment) => sum + payment.amount, 0));

export const isRefund = (entry: { amount: number }) => entry.amount < 0;
