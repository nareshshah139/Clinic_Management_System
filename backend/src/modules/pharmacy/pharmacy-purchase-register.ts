import {
  clinicDay,
  collator,
  compareValues,
  money,
  pageOf,
} from './register-utils';
import {
  MONEY_TOLERANCE,
  invoiceOutstanding,
  paymentStatus,
} from './purchase-payment-balance';

export const PURCHASE_SOURCES = ['MANUAL', 'OCR', 'CSV', 'GMAIL'] as const;
export const INVOICE_STATES = ['DRAFT', 'REVIEW', 'POSTED', 'CANCELLED'] as const;
export const PAYMENT_FILTERS = [
  'OUTSTANDING',
  'DUE',
  'OVERDUE',
  'PARTIAL',
  'PAID',
  'NOT_POSTED',
] as const;
export const SEARCH_FIELDS = ['billNo', 'distributor'] as const;
export const SORT_KEYS = [
  'srNo',
  'billNo',
  'entryAt',
  'billDate',
  'distributor',
  'amount',
  'outstanding',
] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type PurchaseSource = (typeof PURCHASE_SOURCES)[number];
export type InvoiceState = (typeof INVOICE_STATES)[number];
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];
export type SearchField = (typeof SEARCH_FIELDS)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type PaymentState =
  | 'NOT_POSTED'
  | 'DUE'
  | 'OVERDUE'
  | 'PARTIAL'
  | 'PAID'
  | 'CANCELLED';

export type Person = { id: string; name: string };
export type Distributor = { name: string; gstin: string };

export type PurchasePayment = {
  state: PaymentState;
  paid: number;
  credit: number;
  outstanding: number;
  dueDate: string | null;
  overdueDays: number;
};

export type PurchaseRegisterRow = {
  id: string;
  srNo: number;
  billNo: string;
  entryAt: string;
  billDate: string;
  entryBy: Person | null;
  source: PurchaseSource;
  distributor: Distributor;
  amount: number;
  invoiceState: InvoiceState;
  payment: PurchasePayment;
};

export type PurchaseEntry = Omit<PurchaseRegisterRow, 'srNo'>;

export type PurchaseRegisterQuery = {
  from: string;
  to: string;
  field?: SearchField;
  q?: string;
  distributorGstin?: string;
  paymentState?: PaymentFilter;
  invoiceState?: InvoiceState;
  source?: PurchaseSource;
  entryById?: string;
  sortBy: SortKey;
  sortDir: SortDirection;
  page: number;
  limit: number;
};

export type PurchaseRegisterPage = {
  rows: PurchaseRegisterRow[];
  total: number;
  page: number;
  limit: number;
  totals: {
    amount: number;
    outstanding: number;
    count: number;
    excluded: { cancelled: number };
  };
  entryByOptions: Person[];
  distributorOptions: Distributor[];
};

export type PurchaseInvoiceRecord = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  createdAt: Date;
  source: string;
  status: string;
  distributorName: string;
  distributorGstin: string;
  netPayable: number;
  creditApplied: number;
  paymentAllocations: { amount: number }[];
};

const INVOICE_STATE_OF: Record<string, InvoiceState> = {
  DRAFT: 'DRAFT',
  OCR_REVIEW_REQUIRED: 'REVIEW',
  RECONCILIATION_FAILED: 'REVIEW',
  REVIEWED: 'REVIEW',
  STOCK_COMMITTED: 'POSTED',
  CANCELLED: 'CANCELLED',
};

const OUTSTANDING_STATES: readonly PaymentState[] = ['DUE', 'OVERDUE', 'PARTIAL'];
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const purchaseSource = (value: string): PurchaseSource =>
  (PURCHASE_SOURCES as readonly string[]).includes(value)
    ? (value as PurchaseSource)
    : 'MANUAL';

export function purchasePayment(
  invoice: PurchaseInvoiceRecord,
  today: string,
): PurchasePayment {
  const paid = money(
    invoice.paymentAllocations.reduce((sum, row) => sum + Number(row.amount), 0),
  );
  const credit = money(Number(invoice.creditApplied || 0));
  const settled = money(paid + credit);
  const dueDate = invoice.dueDate ? clinicDay(invoice.dueDate) : null;
  const closed = (state: PaymentState): PurchasePayment => ({
    state,
    paid,
    credit,
    outstanding: 0,
    dueDate,
    overdueDays: 0,
  });
  if (invoice.status === 'CANCELLED') return closed('CANCELLED');
  if (invoice.status !== 'STOCK_COMMITTED') return closed('NOT_POSTED');

  const balance = invoiceOutstanding(invoice, settled);
  if (balance <= MONEY_TOLERANCE) return closed('PAID');
  const overdueDays = dueDate && dueDate < today ? daysBetween(dueDate, today) : 0;
  const state: PaymentState =
    paymentStatus(invoice.netPayable, settled) === 'PARTIALLY_PAID'
      ? 'PARTIAL'
      : overdueDays > 0
        ? 'OVERDUE'
        : 'DUE';
  return { state, paid, credit, outstanding: balance, dueDate, overdueDays };
}

export function purchaseEntry(
  invoice: PurchaseInvoiceRecord,
  entryBy: Person | null,
  today: string,
): PurchaseEntry {
  return {
    id: invoice.id,
    billNo: invoice.invoiceNumber,
    entryAt: invoice.createdAt.toISOString(),
    billDate: clinicDay(invoice.invoiceDate),
    entryBy,
    source: purchaseSource(invoice.source),
    distributor: {
      name: invoice.distributorName,
      gstin: invoice.distributorGstin,
    },
    amount: money(invoice.netPayable),
    invoiceState: INVOICE_STATE_OF[invoice.status] ?? 'REVIEW',
    payment: purchasePayment(invoice, today),
  };
}

function matchesSearch(row: PurchaseEntry, field: SearchField, q: string) {
  const wanted = q.toLowerCase();
  if (field === 'billNo') return row.billNo.toLowerCase().includes(wanted);
  return (
    row.distributor.name.toLowerCase().includes(wanted) ||
    row.distributor.gstin.toLowerCase().includes(wanted)
  );
}

function matchesPayment(state: PaymentState, filter: PaymentFilter) {
  return filter === 'OUTSTANDING'
    ? OUTSTANDING_STATES.includes(state)
    : state === filter;
}

const inRange = (row: PurchaseEntry, query: PurchaseRegisterQuery) =>
  row.billDate >= query.from && row.billDate <= query.to;

function matches(row: PurchaseEntry, query: PurchaseRegisterQuery) {
  const q = query.q?.trim();
  return (
    inRange(row, query) &&
    (!q || matchesSearch(row, query.field ?? 'billNo', q)) &&
    (!query.distributorGstin ||
      row.distributor.gstin.toUpperCase() ===
        query.distributorGstin.trim().toUpperCase()) &&
    (!query.paymentState ||
      matchesPayment(row.payment.state, query.paymentState)) &&
    (!query.invoiceState || row.invoiceState === query.invoiceState) &&
    (!query.source || row.source === query.source) &&
    (!query.entryById || row.entryBy?.id === query.entryById)
  );
}

const entryOrder = (a: PurchaseEntry, b: PurchaseEntry) =>
  a.entryAt.localeCompare(b.entryAt) || a.id.localeCompare(b.id);

const SORT_VALUES: Record<SortKey, (row: PurchaseRegisterRow) => string | number> = {
  srNo: (row) => row.srNo,
  billNo: (row) => row.billNo,
  entryAt: (row) => row.entryAt,
  billDate: (row) => row.billDate,
  distributor: (row) => row.distributor.name,
  amount: (row) => row.amount,
  outstanding: (row) => row.payment.outstanding,
};

export function sortRows(
  rows: PurchaseRegisterRow[],
  sortBy: SortKey,
  sortDir: SortDirection,
) {
  const value = SORT_VALUES[sortBy];
  const direction = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) => direction * (compareValues(value(a), value(b)) || a.srNo - b.srNo),
  );
}

function entryByOptions(rows: PurchaseEntry[]): Person[] {
  const people = new Map(
    rows.flatMap((row) => (row.entryBy ? [[row.entryBy.id, row.entryBy] as const] : [])),
  );
  return [...people.values()].sort((a, b) => collator.compare(a.name, b.name));
}

function distributorOptions(rows: PurchaseEntry[]): Distributor[] {
  const distributors = new Map(
    rows.map((row) => [row.distributor.gstin.toUpperCase(), row.distributor] as const),
  );
  return [...distributors.values()].sort(
    (a, b) => collator.compare(a.name, b.name) || a.gstin.localeCompare(b.gstin),
  );
}

export function purchaseRegisterPage(
  entries: PurchaseEntry[],
  query: PurchaseRegisterQuery,
): PurchaseRegisterPage {
  const numbered = entries
    .filter((row) => matches(row, query))
    .sort(entryOrder)
    .map((row, index) => ({ ...row, srNo: index + 1 }));
  const counted = numbered.filter((row) => row.invoiceState !== 'CANCELLED');
  const sum = (values: number[]) => money(values.reduce((total, value) => total + value, 0));
  const ranged = entries.filter((row) => inRange(row, query));
  return {
    rows: pageOf(sortRows(numbered, query.sortBy, query.sortDir), query.page, query.limit),
    total: numbered.length,
    page: query.page,
    limit: query.limit,
    totals: {
      amount: sum(counted.map((row) => row.amount)),
      outstanding: sum(counted.map((row) => row.payment.outstanding)),
      count: counted.length,
      excluded: { cancelled: numbered.length - counted.length },
    },
    entryByOptions: entryByOptions(ranged),
    distributorOptions: distributorOptions(ranged),
  };
}

export function canSettlePurchases(role: string, permissions: readonly string[]) {
  if (['OWNER', 'ADMIN', 'DOCTOR'].includes(role)) return true;
  return (
    ['PHARMACIST', 'ACCOUNTANT'].includes(role) &&
    permissions.includes('pharmacy:purchase-ledger:write')
  );
}
