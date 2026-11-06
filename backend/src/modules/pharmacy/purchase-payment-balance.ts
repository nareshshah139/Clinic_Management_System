import { money } from '../inventory/inventory-stock';
import { clinicDay } from './register-utils';

export type PurchasePaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID';

export const MONEY_TOLERANCE = 0.01;

const DAY_MS = 24 * 60 * 60 * 1000;

export function invoiceOutstanding(invoice: { netPayable: number }, paid: number) {
  return money(Math.max(Number(invoice.netPayable || 0) - paid, 0));
}

export function invoiceSettled(invoice: {
  creditApplied?: number | null;
  paymentAllocations?: { amount: number }[];
}) {
  const paid = (invoice.paymentAllocations || []).reduce(
    (sum, allocation) => sum + Number(allocation.amount || 0),
    0,
  );
  return money(money(paid) + Number(invoice.creditApplied || 0));
}

export function daysPastDue(dueDate: Date | string, asOfDay: string) {
  return Math.round(
    (Date.parse(asOfDay) - Date.parse(clinicDay(new Date(dueDate)))) / DAY_MS,
  );
}

export function paymentStatus(total: number, paid: number): PurchasePaymentStatus {
  if (paid <= MONEY_TOLERANCE) return 'PENDING';
  if (Number(total || 0) - paid <= MONEY_TOLERANCE) return 'PAID';
  return 'PARTIALLY_PAID';
}

export type DatedAllocation = { amount: number; payment?: { paymentDate: Date | string } | null };

export function splitByEffectiveDate<T extends DatedAllocation>(allocations: T[], now: Date) {
  const inEffect: T[] = [];
  const scheduled: T[] = [];
  for (const allocation of allocations) {
    const date = allocation.payment?.paymentDate;
    (date && new Date(date).getTime() > now.getTime() ? scheduled : inEffect).push(allocation);
  }
  return { inEffect, scheduled };
}

export function scheduledPayments(allocations: DatedAllocation[]) {
  const dates = allocations.flatMap((allocation) =>
    allocation.payment ? [new Date(allocation.payment.paymentDate).getTime()] : [],
  );
  return {
    scheduled: invoiceSettled({ paymentAllocations: allocations }),
    scheduledOn: dates.length ? clinicDay(new Date(Math.min(...dates))) : null,
  };
}

export function payableBalance(outstanding: number, scheduled: number) {
  return money(Math.max(outstanding - scheduled, 0));
}
