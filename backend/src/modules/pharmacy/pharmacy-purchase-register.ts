import type { PharmacyPurchaseInvoiceStatus } from '@prisma/client';
import {
  clinicDay,
  collator,
  compareValues,
  money,
  pageOf,
} from './register-utils';
import {
  MONEY_TOLERANCE,
  daysPastDue,
  invoiceOutstanding,
  invoiceSettled,
  paymentStatus,
} from './purchase-payment-balance';

export const PURCHASE_SOURCES = ['MANUAL', 'OCR', 'CSV', 'GMAIL'] as const;
export const INVOICE_STATES = [
  'DRAFT',
  'OCR_REVIEW',
  'RECONCILIATION_FAILED',
  'REVIEWED',
  'POSTED',
  'CANCELLED',
] as const;
export const INVOICE_STATE_FILTERS = [...INVOICE_STATES, 'IN_REVIEW'] as const;
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
export type InvoiceStateFilter = (typeof INVOICE_STATE_FILTERS)[number];
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
  partlyPaid: boolean;
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
  invoiceState?: InvoiceStateFilter;
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
    excluded: { notPosted: number; cancelled: number };
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
  status: PharmacyPurchaseInvoiceStatus;
  distributorName: string;
  distributorGstin: string;
  netPayable: number;
  creditApplied: number;
  paymentAllocations: { amount: number }[];
};

const INVOICE_STATE_OF: Record<PharmacyPurchaseInvoiceStatus, InvoiceState> = {
  DRAFT: 'DRAFT',
  OCR_REVIEW_REQUIRED: 'OCR_REVIEW',
  RECONCILIATION_FAILED: 'RECONCILIATION_FAILED',
  REVIEWED: 'REVIEWED',
  STOCK_COMMITTED: 'POSTED',
  CANCELLED: 'CANCELLED',
};

const REVIEW_STATES: readonly InvoiceState[] = [
  'OCR_REVIEW',
  'RECONCILIATION_FAILED',
  'REVIEWED',
];
const OUTSTANDING_STATES: readonly PaymentState[] = ['DUE', 'OVERDUE', 'PARTIAL'];

const purchaseSource = (value: string): PurchaseSource =>
  (PURCHASE_SOURCES as readonly string[]).includes(value)
    ? (value as PurchaseSource)
    : 'MANUAL';

export function purchasePayment(
  invoice: PurchaseInvoiceRecord,
  today: string,
): PurchasePayment {
  const paid = invoiceSettled({ paymentAllocations: invoice.paymentAllocations });
  const credit = money(Number(invoice.creditApplied || 0));
  const settled = invoiceSettled(invoice);
  const dueDate = invoice.dueDate ? clinicDay(invoice.dueDate) : null;
  const closed = (state: PaymentState): PurchasePayment => ({
    state,
    paid,
    credit,
    outstanding: 0,
    dueDate,
    overdueDays: 0,
    partlyPaid: false,
  });
  if (invoice.status === 'CANCELLED') return closed('CANCELLED');
  if (invoice.status !== 'STOCK_COMMITTED') return closed('NOT_POSTED');

  const balance = invoiceOutstanding(invoice, settled);
  if (balance <= MONEY_TOLERANCE) return closed('PAID');
  const overdueDays = invoice.dueDate
    ? Math.max(0, daysPastDue(invoice.dueDate, today))
    : 0;
  const partlyPaid =
    paymentStatus(invoice.netPayable, settled) === 'PARTIALLY_PAID';
  const state: PaymentState =
    overdueDays > 0 ? 'OVERDUE' : partlyPaid ? 'PARTIAL' : 'DUE';
  return {
    state,
    paid,
    credit,
    outstanding: balance,
    dueDate,
    overdueDays,
    partlyPaid,
  };
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
    invoiceState: INVOICE_STATE_OF[invoice.status],
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

function matchesInvoiceState(state: InvoiceState, filter: InvoiceStateFilter) {
  return filter === 'IN_REVIEW' ? REVIEW_STATES.includes(state) : state === filter;
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
    (!query.invoiceState ||
      matchesInvoiceState(row.invoiceState, query.invoiceState)) &&
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

function sortRows(
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

export function purchaseRegisterRows(
  entries: PurchaseEntry[],
  query: PurchaseRegisterQuery,
): PurchaseRegisterRow[] {
  const numbered = entries
    .filter((row) => matches(row, query))
    .sort(entryOrder)
    .map((row, index) => ({ ...row, srNo: index + 1 }));
  return sortRows(numbered, query.sortBy, query.sortDir);
}

export function purchaseRegisterPage(
  entries: PurchaseEntry[],
  query: PurchaseRegisterQuery,
): PurchaseRegisterPage {
  const rows = purchaseRegisterRows(entries, query);
  const posted = rows.filter((row) => row.invoiceState === 'POSTED');
  const cancelled = rows.filter((row) => row.invoiceState === 'CANCELLED').length;
  const sum = (values: number[]) => money(values.reduce((total, value) => total + value, 0));
  const ranged = entries.filter((row) => inRange(row, query));
  return {
    rows: pageOf(rows, query.page, query.limit),
    total: rows.length,
    page: query.page,
    limit: query.limit,
    totals: {
      amount: sum(posted.map((row) => row.amount)),
      outstanding: sum(posted.map((row) => row.payment.outstanding)),
      count: posted.length,
      excluded: {
        notPosted: rows.length - posted.length - cancelled,
        cancelled,
      },
    },
    entryByOptions: entryByOptions(ranged),
    distributorOptions: distributorOptions(ranged),
  };
}

const PAYMENT_LABEL: Record<PaymentState, string> = {
  NOT_POSTED: 'Not posted',
  DUE: 'Due',
  OVERDUE: 'Overdue',
  PARTIAL: 'Part paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

const clinicTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function paymentLabel(payment: PurchasePayment) {
  if (payment.state !== 'OVERDUE') return PAYMENT_LABEL[payment.state];
  const days = `${payment.overdueDays} day${payment.overdueDays === 1 ? '' : 's'}`;
  return [PAYMENT_LABEL.OVERDUE, days, ...(payment.partlyPaid ? ['part paid'] : [])].join(' · ');
}

export function purchaseRegisterSheet(rows: PurchaseRegisterRow[]) {
  return rows.map((row) => {
    const entryAt = new Date(row.entryAt);
    return {
      'Sr No': row.srNo,
      'Bill No': row.billNo,
      'Entry Date': `${clinicDay(entryAt)} ${clinicTime.format(entryAt)}`,
      'Bill Date': row.billDate,
      'Entry By': row.entryBy?.name ?? '',
      Distributor: row.distributor.name,
      GSTIN: row.distributor.gstin,
      'Bill Amount': row.amount,
      Payment: paymentLabel(row.payment),
      Outstanding: row.payment.outstanding,
    };
  });
}
