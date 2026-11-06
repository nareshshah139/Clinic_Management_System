import { UserRole } from '@cms/shared-types';
import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { formatDisplayDay, parseDisplayDay } from '@/lib/date-ranges';
import { errorMessage, type RegisterQuery, type RegisterQueryConfig } from '@/components/register/register-query';

export const PURCHASE_REGISTERS = ['purchases', 'returns'] as const;
export const PURCHASE_SOURCES = ['MANUAL', 'OCR', 'CSV', 'GMAIL'] as const;
export const INVOICE_STATES = ['DRAFT', 'OCR_REVIEW', 'RECONCILIATION_FAILED', 'REVIEWED', 'POSTED', 'CANCELLED'] as const;
export const INVOICE_STATE_FILTERS = ['DRAFT', 'IN_REVIEW', 'OCR_REVIEW', 'RECONCILIATION_FAILED', 'REVIEWED', 'POSTED', 'CANCELLED'] as const;
export const PAYMENT_FILTERS = ['OUTSTANDING', 'DUE', 'OVERDUE', 'PARTIAL', 'PAID', 'NOT_POSTED'] as const;
export const SETTLE_MODES = ['CASH', 'CHEQUE', 'NEFT', 'UPI', 'CARD'] as const;
export const SEARCH_FIELDS = ['billNo', 'distributor'] as const;
export const SORT_KEYS = ['srNo', 'billNo', 'entryAt', 'billDate', 'distributor', 'amount', 'outstanding'] as const;
export const FILTER_KEYS = ['paymentState', 'distributorGstin', 'invoiceState', 'source', 'entryById'] as const;
export const MORE_FILTERS = ['distributorGstin', 'invoiceState', 'source', 'entryById'] as const satisfies readonly FilterKey[];

export type PurchaseRegisterKind = (typeof PURCHASE_REGISTERS)[number];
export type PurchaseSource = (typeof PURCHASE_SOURCES)[number];
export type InvoiceState = (typeof INVOICE_STATES)[number];
export type InvoiceStateFilter = (typeof INVOICE_STATE_FILTERS)[number];
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];
export type SettleMode = (typeof SETTLE_MODES)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type FilterKey = (typeof FILTER_KEYS)[number];
export type PaymentState = 'NOT_POSTED' | 'DUE' | 'OVERDUE' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type Person = { id: string; name: string };
export type Distributor = { name: string; gstin: string };
export type PurchaseQuery = RegisterQuery<FilterKey, SortKey>;

export type PurchaseDocument = { id: string; fileName: string; mimeType: string };

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
  documents: PurchaseDocument[];
  payment: {
    state: PaymentState;
    paid: number;
    credit: number;
    outstanding: number;
    scheduled: number;
    scheduledOn: string | null;
    payable: number;
    partlyPaid: boolean;
    dueDate: string | null;
    overdueDays: number;
  };
};

export type DistributorPosition = { gstin: string; name: string | null; outstanding: number; creditHeld: number; net: number };

export type PurchaseRegisterResponse = {
  rows: PurchaseRegisterRow[];
  total: number;
  page: number;
  limit: number;
  totals: { amount: number; outstanding: number; count: number; excluded: { notPosted: number; cancelled: number } };
  entryByOptions: Person[];
  distributorOptions: Distributor[];
  creditHeld: Record<string, number>;
  distributorPosition: DistributorPosition | null;
};

export type RecordedPayment = {
  id: string;
  updatedAt: string;
  allocations?: { purchaseInvoiceId: string; outstandingAfter?: number }[];
};

export const PAGE_SIZE = 50;
export const SETTLE_MODE_STORAGE_KEY = 'purchase-register.settle-mode';
export const UNDO_REASON = 'Undone from purchase list';
export const UNDO_WINDOW_MS = 30_000;

export const PURCHASE_REGISTER_COPY: Record<PurchaseRegisterKind, { tab: string; noun: string; table: string; endpoint: string; exportable: boolean }> = {
  purchases: { tab: 'Purchase', noun: 'purchase bills', table: 'Purchase bills', endpoint: '/pharmacy/purchase-register', exportable: true },
  returns: { tab: 'Returns', noun: 'purchase returns', table: 'Purchase returns', endpoint: '/pharmacy/purchase-returns-register', exportable: false },
};

const LEDGER_WRITER_ROLES: readonly string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR, UserRole.PHARMACIST, UserRole.ACCOUNTANT];

export const canRecordSupplierPayments = (caps: { creditWrite?: boolean } | null | undefined, role: string | undefined) =>
  caps?.creditWrite === true && LEDGER_WRITER_ROLES.includes(role ?? '');

export const PURCHASE_QUERY: RegisterQueryConfig<FilterKey, SortKey> = {
  searchFields: SEARCH_FIELDS,
  filters: {
    paymentState: { param: 'pay', values: PAYMENT_FILTERS },
    distributorGstin: { param: 'gstin' },
    invoiceState: { param: 'state', values: INVOICE_STATE_FILTERS },
    source: { param: 'source', values: PURCHASE_SOURCES },
    entryById: { param: 'by' },
  },
  sorts: SORT_KEYS,
  descFirst: ['entryAt', 'billDate', 'amount', 'outstanding'],
  defaultSort: { by: 'entryAt', dir: 'desc' },
};

export const SEARCH_FIELD_OPTIONS = [
  { value: 'billNo', label: 'Bill No', placeholder: 'Bill number' },
  { value: 'distributor', label: 'Distributor', placeholder: 'Distributor name or GSTIN' },
] as const;

export const PAYMENT_FILTER_LABELS: Record<PaymentFilter, string> = {
  OUTSTANDING: 'Outstanding',
  DUE: 'Due',
  OVERDUE: 'Overdue',
  PARTIAL: 'Part paid',
  PAID: 'Paid',
  NOT_POSTED: 'Not posted',
};

export const INVOICE_STATE_LABELS: Record<InvoiceStateFilter, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'Any review step',
  OCR_REVIEW: 'OCR review required',
  RECONCILIATION_FAILED: 'Reconciliation failed',
  REVIEWED: 'Reviewed',
  POSTED: 'Stock added',
  CANCELLED: 'Cancelled',
};

export const SOURCE_LABELS: Record<PurchaseSource, string> = { MANUAL: 'Typed in', OCR: 'Scanned', CSV: 'CSV import', GMAIL: 'Gmail' };

export const SETTLE_MODE_LABELS: Record<SettleMode, string> = { CASH: 'Cash', CHEQUE: 'Cheque', NEFT: 'NEFT / RTGS', UPI: 'UPI', CARD: 'Card' };

const SETTLEABLE: readonly PaymentState[] = ['DUE', 'OVERDUE', 'PARTIAL'];

const MONEY_TOLERANCE = 0.01;

const owed = ({ payment }: PurchaseRegisterRow) => SETTLEABLE.includes(payment.state) && payment.outstanding > MONEY_TOLERANCE;

export const canMarkPaid = (row: PurchaseRegisterRow, canSettle: boolean) =>
  canSettle && owed(row) && row.payment.payable > MONEY_TOLERANCE;

export const isScheduledOnly = (row: PurchaseRegisterRow) =>
  owed(row) && row.payment.payable <= MONEY_TOLERANCE && row.payment.scheduled > MONEY_TOLERANCE;

export const shortDay = (day: string) => formatDisplayDay(day).slice(0, 5);

export const documentHref = (documentId: string) => `/api/pharmacy/purchase-invoices/documents/${encodeURIComponent(documentId)}`;

export function requestParams(query: PurchaseQuery) {
  const q = query.q.trim();
  const { paymentState, distributorGstin, invoiceState, source, entryById } = query.filters;
  return {
    from: query.from,
    to: query.to,
    ...(q ? { field: query.field, q } : {}),
    paymentState: paymentState || undefined,
    distributorGstin: distributorGstin || undefined,
    invoiceState: invoiceState || undefined,
    source: source || undefined,
    entryById: entryById || undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    page: query.page,
    limit: PAGE_SIZE,
  };
}

export function exportHref(endpoint: string, query: PurchaseQuery) {
  const params = new URLSearchParams({ format: 'xlsx' });
  for (const [key, value] of Object.entries(requestParams(query))) if (value !== undefined) params.set(key, String(value));
  return `/api${endpoint}?${params}`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const billCount = (count: number) => plural(count, 'bill', 'bills');

export function excludedNote({ notPosted, cancelled }: { notPosted: number; cancelled: number }) {
  const parts = [notPosted > 0 && `${notPosted} not posted`, cancelled > 0 && `${cancelled} cancelled`].filter(Boolean);
  return parts.length ? `${parts.join(' and ')} not included` : '';
}

export const daysText = (days: number) => plural(days, 'day', 'days');

export function scheduledNote({ payment }: PurchaseRegisterRow) {
  return payment.scheduled > MONEY_TOLERANCE && payment.scheduledOn
    ? `${formatRupees(payment.scheduled)} scheduled ${shortDay(payment.scheduledOn)}`
    : null;
}

export function paymentText(row: PurchaseRegisterRow) {
  const { payment } = row;
  const due = formatRupees(payment.outstanding);
  if (isScheduledOnly(row)) return `Payment scheduled for ${formatDisplayDay(payment.scheduledOn!)}`;
  const scheduled = scheduledNote(row);
  const text = baseText(row, due);
  return scheduled && owed(row) ? `${text}, ${scheduled}` : text;
}

function baseText({ payment }: PurchaseRegisterRow, due: string) {
  switch (payment.state) {
    case 'PAID':
      return 'Paid';
    case 'DUE':
      return `Due ${due}`;
    case 'OVERDUE':
      return `${due} overdue by ${daysText(payment.overdueDays)}`;
    case 'PARTIAL':
      return `${due} due, part paid`;
    case 'NOT_POSTED':
      return 'Not posted';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function parseSettleDate(text: string, today: string, billDate: string): { day: string } | { error: string } {
  const day = parseDisplayDay(text);
  if (!day) return { error: 'Enter the payment date as dd/mm/yyyy.' };
  if (day > today) return { error: `The payment date cannot be after today, ${formatDisplayDay(today)}.` };
  if (day < billDate) return { error: `The payment date cannot be before the bill date, ${formatDisplayDay(billDate)}.` };
  return { day };
}

export type SettleFailure = { kind: 'stale'; title: string; description: string } | { kind: 'inline'; message: string };

export function settleFailure(error: unknown): SettleFailure {
  const status = (error as { status?: number } | null)?.status;
  const message = errorMessage(error);
  if (status === 409) {
    return { kind: 'stale', title: 'This payment was already recorded', description: 'The list now shows the bill’s latest balance.' };
  }
  if ((status === 400 || status === 404) && /outstanding|posted|not found/i.test(message)) {
    return { kind: 'stale', title: 'This bill’s balance changed', description: 'Check the new amount before recording a payment.' };
  }
  return { kind: 'inline', message };
}

function withStorage<T>(run: (storage: Storage) => T, fallback: T): T {
  try {
    return run(window.localStorage);
  } catch {
    return fallback;
  }
}

export const readSettleMode = (): SettleMode =>
  withStorage((storage) => {
    const saved = storage.getItem(SETTLE_MODE_STORAGE_KEY) ?? '';
    return (SETTLE_MODES as readonly string[]).includes(saved) ? (saved as SettleMode) : 'NEFT';
  }, 'NEFT');

export const rememberSettleMode = (mode: SettleMode) => withStorage((storage) => storage.setItem(SETTLE_MODE_STORAGE_KEY, mode), undefined);
