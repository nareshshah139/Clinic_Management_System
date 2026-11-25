import type { Prisma } from '@prisma/client';
import { money } from '../pharmacy/register-utils';
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

export const STATUS_FILTERS = ['outstanding', 'paid', 'void'] as const;
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

/** Bill money is compared and changed in whole paise; the columns hold rupees as floats. */
export const paise = (rupees: number) => Math.round(rupees * 100);
export const rupees = (paise: number) => paise / 100;

/** What a payment brought in less the refunds linked to it, in paise. */
export const leftToRefund = (
  payment: { amount: number },
  refunds: { amount: number }[],
) =>
  refunds.reduce(
    (left, refund) => left + paise(refund.amount),
    paise(payment.amount),
  );

/** What the desk may still refund on a payment: what is left of it, at most what the bill holds. */
export const refundableOf = (
  payment: { id: string; amount: number },
  payments: { amount: number; refundOfId: string | null }[],
  received: number,
) => {
  const refunds = payments.filter((p) => p.refundOfId === payment.id);
  return rupees(
    Math.max(0, Math.min(leftToRefund(payment, refunds), paise(received))),
  );
};

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

export const STATUS_WHERE: Record<StatusFilter, Prisma.NewInvoiceWhereInput> = {
  outstanding: { status: { not: VOID }, balance: { gte: SETTLED } },
  paid: { status: { not: VOID }, balance: { lt: SETTLED } },
  void: { status: VOID },
};

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
