import type { RegisterQuery, RegisterQueryConfig } from '@/components/register/register-query';
import type { ClinicIdentity } from '@/lib/pharmacy-invoice-print';
import { rupee } from '@/components/appointments/appointment-billing-view';

/** Mirrors backend/src/modules/billing/clinic-bill-register.ts: the server derives the status, the client only names it. */
export const CLINIC_BILL_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'CANCELLED'] as const;
export type ClinicBillStatus = (typeof CLINIC_BILL_STATUSES)[number];
export type BillKind = 'CONSULTATION' | 'PROCEDURE';

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

export type ClinicBillActions = { collect: boolean; void: boolean; refund: boolean };

export type ClinicBillRegister = {
  rows: ClinicBillRow[];
  total: number;
  page: number;
  limit: number;
  totals: { count: number; billed: number; collected: number; outstanding: number; voided: number };
  actions: ClinicBillActions;
};

export type ClinicReceipt = {
  bill: ClinicBillRow;
  clinic: ClinicIdentity;
  notes: string | null;
  items: { id: string; name: string; qty: number; unitPrice: number; discount: number; gstRate: number; total: number }[];
  payments: { id: string; amount: number; mode: string; reference: string | null; paidAt: string }[];
};

export const BILLING_PATH = '/dashboard/billing';

export const STATUS_VIEW: Record<ClinicBillStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'neutral' | 'danger' }> = {
  PENDING: { label: 'Unpaid', variant: 'warning' },
  PARTIALLY_PAID: { label: 'Part paid', variant: 'info' },
  PAID: { label: 'Paid', variant: 'success' },
  REFUNDED: { label: 'Refunded', variant: 'danger' },
  CANCELLED: { label: 'Void', variant: 'neutral' },
};

export const KIND_LABEL: Record<BillKind, string> = { CONSULTATION: 'Consultation', PROCEDURE: 'Procedure' };

const STATUS_FILTERS = ['outstanding', 'paid', 'void'] as const;
export const STATUS_FILTER_OPTIONS = [
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
] as const satisfies readonly { value: (typeof STATUS_FILTERS)[number]; label: string }[];

const SEARCH_FIELDS = ['patient', 'mobile', 'billNo'] as const;
export const SEARCH_FIELD_OPTIONS = [
  { value: 'patient', label: 'Patient', placeholder: 'Patient name' },
  { value: 'mobile', label: 'Mobile', placeholder: 'Mobile number' },
  { value: 'billNo', label: 'Bill No', placeholder: 'Bill number' },
] as const satisfies readonly { value: (typeof SEARCH_FIELDS)[number]; label: string; placeholder: string }[];

const SORT_KEYS = ['billedAt', 'patient', 'amount', 'due'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type FilterKey = 'status';
export type BillQuery = RegisterQuery<FilterKey, SortKey>;

export const BILL_QUERY: RegisterQueryConfig<FilterKey, SortKey> = {
  searchFields: SEARCH_FIELDS,
  filters: { status: { param: 'status', values: STATUS_FILTERS } },
  sorts: SORT_KEYS,
  descFirst: ['billedAt', 'amount', 'due'],
  defaultSort: { by: 'billedAt', dir: 'desc' },
};

export function requestParams(query: BillQuery) {
  const q = query.q.trim();
  return {
    from: query.from,
    to: query.to,
    ...(q ? { field: query.field, q } : {}),
    status: query.filters.status || undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    page: query.page,
    limit: 50,
  };
}

export function footerSummary(totals: ClinicBillRegister['totals']): string {
  return `Billed ${rupee(totals.billed)} · Collected ${rupee(totals.collected)} · Outstanding ${rupee(totals.outstanding)}`;
}

export function footerNote(totals: ClinicBillRegister['totals']): string {
  const bills = `${totals.count} ${totals.count === 1 ? 'bill' : 'bills'}`;
  if (!totals.voided) return bills;
  return `${bills}; ${totals.voided} void ${totals.voided === 1 ? 'bill' : 'bills'} not counted`;
}

export function voidBlockedReason(bill: ClinicBillRow): string | null {
  if (bill.status === 'CANCELLED') return 'Already void';
  return bill.paid > 0 ? `Refund the ${rupee(bill.paid)} received before voiding` : null;
}
