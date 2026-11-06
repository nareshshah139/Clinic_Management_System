import { money } from '../inventory/inventory-stock';

export type PurchasePaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID';

export const MONEY_TOLERANCE = 0.01;

export function invoiceOutstanding(invoice: { netPayable: number }, paid: number) {
  return money(Math.max(Number(invoice.netPayable || 0) - paid, 0));
}

export function paymentStatus(total: number, paid: number): PurchasePaymentStatus {
  if (paid <= MONEY_TOLERANCE) return 'PENDING';
  if (Number(total || 0) - paid <= MONEY_TOLERANCE) return 'PAID';
  return 'PARTIALLY_PAID';
}
