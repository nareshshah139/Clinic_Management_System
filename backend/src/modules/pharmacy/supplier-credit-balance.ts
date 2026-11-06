import { MONEY_TOLERANCE } from './purchase-payment-balance';
import { money } from './register-utils';

type Instant = Date | string;

export type CreditAllocationRecord = {
  amount: unknown;
  createdAt: Instant;
  reversedAt: Instant | null;
};

export type SupplierCreditRecord = {
  supplierGstin: string;
  amount: unknown;
  createdAt: Instant;
  reversedAt: Instant | null;
  creditNoteNumber: string | null;
  receivedAt: Instant | null;
  allocations: CreditAllocationRecord[];
};

const by = (instant: Instant | null, asOf: Date) =>
  instant !== null && new Date(instant).getTime() <= asOf.getTime();

const inEffect = (allocation: CreditAllocationRecord, asOf: Date) =>
  by(allocation.createdAt, asOf) && !by(allocation.reversedAt, asOf);

export const EVERY_ALLOCATION = new Date(8.64e15);

export function creditBalance(credit: SupplierCreditRecord, asOf: Date) {
  const amount = money(Number(credit.amount));
  const applied = money(
    credit.allocations
      .filter((allocation) => inEffect(allocation, asOf))
      .reduce((sum, allocation) => sum + Number(allocation.amount), 0),
  );
  const left = amount - applied;
  const available = by(credit.reversedAt, asOf) || left <= MONEY_TOLERANCE ? 0 : money(left);
  return { amount, applied, available };
}

export const creditNoteHeld = (credit: SupplierCreditRecord, asOf: Date) =>
  credit.creditNoteNumber !== null && by(credit.receivedAt ?? credit.createdAt, asOf);

export function creditHeldByDistributor(credits: SupplierCreditRecord[], asOf: Date) {
  const held = new Map<string, number>();
  for (const credit of credits) {
    if (!creditNoteHeld(credit, asOf)) continue;
    const key = credit.supplierGstin.trim().toUpperCase();
    held.set(key, money((held.get(key) ?? 0) + creditBalance(credit, asOf).available));
  }
  return held;
}

export const SUPPLIER_CREDIT_BALANCE_SELECT = {
  supplierGstin: true,
  amount: true,
  createdAt: true,
  reversedAt: true,
  creditNoteNumber: true,
  receivedAt: true,
  allocations: { select: { amount: true, createdAt: true, reversedAt: true } },
} as const;
