import type { Prisma } from '@prisma/client';
import { clinicDay, clinicDayStart, money } from '../pharmacy/register-utils';
import {
  clinicIdentity,
  type BranchRecord,
  type ClinicIdentity,
} from '../pharmacy/pharmacy-sales-register';
import type { ClinicBillActions } from './billing-access';

/**
 * The states a clinic bill can be in, named after the InvoiceStatus values they correspond to.
 * Only CANCELLED is stored; the rest follow from the bill's money. DRAFT is absent because a
 * saved clinic bill is issued at once (the column default is never a real state).
 */
export const CLINIC_BILL_STATUSES = [
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'REFUNDED',
  'CANCELLED',
] as const;
export type ClinicBillStatus = (typeof CLINIC_BILL_STATUSES)[number];

export const STATUS_FILTERS = [
  'outstanding',
  'overdue',
  'paid',
  'void',
] as const;
export const SEARCH_FIELDS = ['patient', 'mobile', 'billNo'] as const;
export const SORT_KEYS = ['billedAt', 'patient', 'amount', 'due'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type SearchField = (typeof SEARCH_FIELDS)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type BillKind = 'CONSULTATION' | 'PROCEDURE';

export type ClinicBillQuery = {
  from: string;
  to: string;
  field?: SearchField;
  q?: string;
  status?: StatusFilter;
  sortBy: SortKey;
  sortDir: SortDirection;
  page: number;
  limit: number;
};

export type ClinicBillRow = {
  id: string;
  billNo: string;
  billedAt: string;
  patient: { id: string; name: string; phone: string | null };
  doctor: { id: string; name: string } | null;
  kind: BillKind | null;
  amount: number;
  paid: number;
  due: number;
  refunded: number;
  status: ClinicBillStatus;
  voidReason: string | null;
};

export type ClinicBillRegister = {
  rows: ClinicBillRow[];
  total: number;
  page: number;
  limit: number;
  totals: {
    count: number;
    billed: number;
    collected: number;
    outstanding: number;
    voided: number;
  };
  actions: ClinicBillActions;
};

export type ClinicReceipt = {
  bill: ClinicBillRow;
  clinic: ClinicIdentity;
  notes: string | null;
  items: {
    id: string;
    name: string;
    qty: number;
    unitPrice: number;
    discount: number;
    gstRate: number;
    total: number;
  }[];
  payments: {
    id: string;
    amount: number;
    mode: string;
    reference: string | null;
    paidAt: string;
    refundable: number;
  }[];
};

export const VOID = 'CANCELLED';
/** Below one paisa: float balances that should read as settled. */
const SETTLED = 0.005;

/**
 * Bill money is compared and changed in whole paise; the columns hold rupees as floats. A half paisa
 * rounds away from zero, as Postgres ROUND does, which 264.025 * 100 = 26402.4999… would otherwise miss.
 */
export const paise = (rupees: number) => {
  const whole = Math.round(Math.abs(Number((rupees * 100).toPrecision(15))));
  return rupees < 0 && whole ? -whole : whole;
};
export const rupees = (paise: number) => paise / 100;
/** Whole paise a payment can give back: an old payment of 264.025 holds 26402, never 26403. */
export const heldPaise = (rupees: number) =>
  Math.max(0, Math.floor(Number((rupees * 100).toPrecision(15))));

type BillPayment = {
  id: string;
  amount: number;
  mode: string;
  refundOfId: string | null;
  createdAt: Date;
};

/**
 * Paise already refunded from each completed payment of one bill, given in the order they were made.
 * A refund linked by refundOfId counts against its payment. A refund stored before that link existed
 * was taken from one payment no smaller than it, so it counts against the oldest earlier payment of
 * its mode that can still hold all of it; only a refund no single payment can hold is spread.
 */
export const refundedByPayment = (payments: BillPayment[]) => {
  const refunded = new Map<string, number>();
  const used = (p: BillPayment) => refunded.get(p.id) ?? 0;
  const take = (p: BillPayment, amount: number) =>
    refunded.set(p.id, used(p) + amount);
  const paid = payments.filter((p) => paise(p.amount) > 0);
  for (const p of payments) {
    const source = p.refundOfId && paid.find((q) => q.id === p.refundOfId);
    if (source) take(source, -paise(p.amount));
  }
  for (const legacy of payments.filter(
    (p) => paise(p.amount) < 0 && !p.refundOfId,
  )) {
    let unplaced = -paise(legacy.amount);
    const sources = paid.filter(
      (p) => p.mode === legacy.mode && p.createdAt <= legacy.createdAt,
    );
    const whole = sources.find(
      (p) => heldPaise(p.amount) - used(p) >= unplaced,
    );
    for (const p of whole ? [whole] : sources) {
      const taken = Math.min(
        unplaced,
        Math.max(0, heldPaise(p.amount) - used(p)),
      );
      take(p, taken);
      unplaced -= taken;
    }
  }
  return refunded;
};

/** The whole paise a payment brought in less what has been refunded from it. */
export const leftToRefund = (
  payment: { id: string; amount: number },
  refunded: Map<string, number>,
) => heldPaise(payment.amount) - (refunded.get(payment.id) ?? 0);

/** What the desk may still refund on a payment: what is left of it, at most what the bill holds. */
export const refundableOf = (
  payment: { id: string; amount: number },
  payments: BillPayment[],
  received: number,
) =>
  rupees(
    Math.max(
      0,
      Math.min(
        leftToRefund(payment, refundedByPayment(payments)),
        paise(received),
      ),
    ),
  );

const person = {
  select: { id: true, firstName: true, lastName: true },
} as const;

export const BILL_ROW_INCLUDE = {
  patient: { select: { id: true, name: true, phone: true } },
  appointment: { select: { visitType: true, doctor: person } },
  visit: { select: { doctor: person } },
} as const;

type Person = { id: string; firstName: string; lastName: string };
export type BillRecord = {
  id: string;
  invoiceNo: string;
  createdAt: Date;
  status: string;
  total: number;
  received: number;
  balance: number;
  metadata: string | null;
  patient: { id: string; name: string; phone: string | null };
  appointment: { visitType: string; doctor: Person } | null;
  visit: { doctor: Person } | null;
  payments: { amount: number }[];
};

export function billStatus(
  bill: { status: string; received: number; balance: number },
  refunded: number,
): ClinicBillStatus {
  if (bill.status === VOID) return 'CANCELLED';
  if (bill.balance < SETTLED) return 'PAID';
  if (bill.received >= SETTLED) return 'PARTIALLY_PAID';
  return refunded > 0 ? 'REFUNDED' : 'PENDING';
}

export function metadataOf(raw: string | null): Record<string, unknown> {
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function voidReason(metadata: string | null): string | null {
  const record = metadataOf(metadata).void as { reason?: unknown } | undefined;
  return typeof record?.reason === 'string' ? record.reason : null;
}

export function billRow(bill: BillRecord): ClinicBillRow {
  const refunded = money(
    -bill.payments.reduce((sum, p) => sum + Math.min(0, p.amount), 0),
  );
  const status = billStatus(bill, refunded);
  const doctor = bill.appointment?.doctor ?? bill.visit?.doctor ?? null;
  return {
    id: bill.id,
    billNo: bill.invoiceNo,
    billedAt: bill.createdAt.toISOString(),
    patient: bill.patient,
    doctor: doctor && {
      id: doctor.id,
      name: `${doctor.firstName} ${doctor.lastName}`.trim(),
    },
    kind: !bill.appointment
      ? null
      : bill.appointment.visitType === 'PROCEDURE'
        ? 'PROCEDURE'
        : 'CONSULTATION',
    amount: money(bill.total),
    paid: money(bill.received),
    due: status === 'CANCELLED' ? 0 : money(Math.max(0, bill.balance)),
    refunded,
    status,
    voidReason: status === 'CANCELLED' ? voidReason(bill.metadata) : null,
  };
}

const OUTSTANDING = { status: { not: VOID }, balance: { gte: SETTLED } };

export const statusWhere = (
  now: Date,
): Record<StatusFilter, Prisma.NewInvoiceWhereInput> => ({
  outstanding: OUTSTANDING,
  // A due date is a clinic calendar day, so a bill is overdue only once its due day has ended.
  overdue: { ...OUTSTANDING, dueDate: { lt: clinicDayStart(clinicDay(now)) } },
  paid: { status: { not: VOID }, balance: { lt: SETTLED } },
  void: { status: VOID },
});

export function searchWhere(
  field: SearchField | undefined,
  q: string | undefined,
): Prisma.NewInvoiceWhereInput {
  const text = q?.trim();
  if (!text) return {};
  if (field === 'billNo')
    return { invoiceNo: { contains: text, mode: 'insensitive' } };
  if (field === 'mobile')
    return {
      patient: { phone: { contains: text.replace(/\D/g, '').slice(-10) } },
    };
  return { patient: { name: { contains: text, mode: 'insensitive' } } };
}

export function orderBy({
  sortBy,
  sortDir,
}: Pick<
  ClinicBillQuery,
  'sortBy' | 'sortDir'
>): Prisma.NewInvoiceOrderByWithRelationInput[] {
  const key: Record<SortKey, Prisma.NewInvoiceOrderByWithRelationInput> = {
    billedAt: { createdAt: sortDir },
    patient: { patient: { name: sortDir } },
    amount: { total: sortDir },
    due: { balance: sortDir },
  };
  return [key[sortBy], { createdAt: 'desc' }, { id: 'asc' }];
}

export function receiptClinic(branch: BranchRecord): ClinicIdentity {
  const clinic = clinicIdentity(branch);
  delete clinic.drugLicence;
  return clinic;
}
