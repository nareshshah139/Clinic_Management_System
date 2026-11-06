import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { formatDisplayDay, parseDisplayDay } from '@/lib/date-ranges';
import type { RegisterQuery, RegisterQueryConfig } from '@/components/register/register-query';

export const PURCHASE_SOURCES = ['MANUAL', 'OCR', 'CSV', 'GMAIL'] as const;
export const INVOICE_STATES = ['DRAFT', 'REVIEW', 'POSTED', 'CANCELLED'] as const;
export const PAYMENT_FILTERS = ['OUTSTANDING', 'DUE', 'OVERDUE', 'PARTIAL', 'PAID', 'NOT_POSTED'] as const;
export const SETTLE_MODES = ['CASH', 'CHEQUE', 'NEFT', 'UPI', 'CARD'] as const;
export const SEARCH_FIELDS = ['billNo', 'distributor'] as const;
export const SORT_KEYS = ['srNo', 'billNo', 'entryAt', 'billDate', 'distributor', 'amount', 'outstanding'] as const;
export const FILTER_KEYS = ['paymentState', 'distributorGstin', 'invoiceState', 'source', 'entryById'] as const;
export const MORE_FILTERS = ['distributorGstin', 'invoiceState', 'source', 'entryById'] as const satisfies readonly FilterKey[];

export type PurchaseSource = (typeof PURCHASE_SOURCES)[number];
export type InvoiceState = (typeof INVOICE_STATES)[number];
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];
export type SettleMode = (typeof SETTLE_MODES)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type FilterKey = (typeof FILTER_KEYS)[number];
export type PaymentState = 'NOT_POSTED' | 'DUE' | 'OVERDUE' | 'PARTIAL' | 'PAID' | 'CANCELLED';
export type Person = { id: string; name: string };
export type Distributor = { name: string; gstin: string };
export type PurchaseQuery = RegisterQuery<FilterKey, SortKey>;

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
  payment: { state: PaymentState; paid: number; credit: number; outstanding: number; dueDate: string | null; overdueDays: number };
};

export type PurchaseRegisterResponse = {
  rows: PurchaseRegisterRow[];
  total: number;
  page: number;
  limit: number;
  totals: { amount: number; outstanding: number; count: number; excluded: { cancelled: number } };
  entryByOptions: Person[];
  distributorOptions: Distributor[];
  canSettle: boolean;
};

export type RecordedPayment = { id: string; updatedAt: string };

export const PAGE_SIZE = 50;
export const SETTLE_MODE_STORAGE_KEY = 'purchase-register.settle-mode';
export const UNDO_REASON = 'Undone from purchase list';

export const PURCHASE_QUERY: RegisterQueryConfig<FilterKey, SortKey> = {
  searchFields: SEARCH_FIELDS,
  filters: {
    paymentState: { param: 'pay', values: PAYMENT_FILTERS },
    distributorGstin: { param: 'gstin' },
    invoiceState: { param: 'state', values: INVOICE_STATES },
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

export const INVOICE_STATE_LABELS: Record<InvoiceState, string> = {
  DRAFT: 'Draft',
  REVIEW: 'In review',
  POSTED: 'Stock posted',
  CANCELLED: 'Cancelled',
};

export const SOURCE_LABELS: Record<PurchaseSource, string> = { MANUAL: 'Typed in', OCR: 'Scanned', CSV: 'CSV import', GMAIL: 'Gmail' };

export const SETTLE_MODE_LABELS: Record<SettleMode, string> = { CASH: 'Cash', CHEQUE: 'Cheque', NEFT: 'NEFT / RTGS', UPI: 'UPI', CARD: 'Card' };

const SETTLEABLE: readonly PaymentState[] = ['DUE', 'OVERDUE', 'PARTIAL'];

export const canMarkPaid = (row: PurchaseRegisterRow, canSettle: boolean) =>
  canSettle && SETTLEABLE.includes(row.payment.state) && row.payment.outstanding > 0;

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

const EXPORT_STATUS: Partial<Record<InvoiceState, string>> = { DRAFT: 'DRAFT', POSTED: 'STOCK_COMMITTED', CANCELLED: 'CANCELLED' };
const EXPORT_IGNORES: { key: FilterKey; label: string }[] = [
  { key: 'paymentState', label: 'payment status' },
  { key: 'entryById', label: 'entry by' },
];

export function exportRequest(query: PurchaseQuery) {
  const q = query.q.trim();
  const { distributorGstin, invoiceState, source } = query.filters;
  const status = EXPORT_STATUS[invoiceState as InvoiceState];
  const params = new URLSearchParams({
    format: 'xlsx',
    startDate: query.from,
    endDate: query.to,
    ...(q ? { search: q } : {}),
    ...(distributorGstin ? { distributorGstin } : {}),
    ...(source ? { source } : {}),
    ...(status ? { status } : {}),
  });
  const ignored = [
    ...EXPORT_IGNORES.filter(({ key }) => query.filters[key]).map(({ label }) => label),
    ...(invoiceState === 'REVIEW' ? ['bill status'] : []),
  ];
  return { href: `/api/inventory/workspace/purchases/export?${params}`, ignored };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function footerSummary(totals: PurchaseRegisterResponse['totals']) {
  return `Bills ${formatRupees(totals.amount)} · Outstanding ${formatRupees(totals.outstanding)} · ${plural(totals.count, 'bill', 'bills')}`;
}

export const excludedNote = ({ cancelled }: { cancelled: number }) => (cancelled > 0 ? `${cancelled} cancelled not included` : '');

export function settleDateError(text: string, today: string): { day: string } | { error: string } {
  const day = parseDisplayDay(text);
  if (!day) return { error: 'Enter the payment date as dd/mm/yyyy.' };
  if (day > today) return { error: `The payment date cannot be after today, ${formatDisplayDay(today)}.` };
  return { day };
}

export function readSettleMode(storage: Pick<Storage, 'getItem'> | null): SettleMode {
  try {
    const saved = storage?.getItem(SETTLE_MODE_STORAGE_KEY);
    return (SETTLE_MODES as readonly string[]).includes(saved ?? '') ? (saved as SettleMode) : 'NEFT';
  } catch {
    return 'NEFT';
  }
}

export function rememberSettleMode(storage: Pick<Storage, 'setItem'> | null, mode: SettleMode) {
  try {
    storage?.setItem(SETTLE_MODE_STORAGE_KEY, mode);
  } catch {
    return;
  }
}
