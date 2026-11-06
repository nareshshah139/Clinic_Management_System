import { formatDisplayDay, isDay } from '@/lib/date-ranges';
import { formatRupees, type ClinicIdentity } from '@/lib/pharmacy-invoice-print';
import type { RegisterQuery, RegisterQueryConfig } from '@/components/register/register-query';

export const REGISTERS = ['sales', 'returns'] as const;
export const SALE_SOURCES = ['PHARMACY_BILL', 'COUNTER_SALE', 'SALES_RETURN'] as const;
export const SALE_STATES = ['FINAL', 'DRAFT', 'CANCELLED'] as const;
export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'NETBANKING', 'WALLET', 'INSURANCE', 'CREDIT', 'OTHER'] as const;
export const SEARCH_FIELDS = ['billNo', 'patient', 'mobile'] as const;
export const SORT_KEYS = ['billNo', 'entryAt', 'billDate', 'entryBy', 'patient', 'mobile', 'amount'] as const;
export const FILTER_KEYS = ['paymentMode', 'state', 'source', 'entryById'] as const;

export type Register = (typeof REGISTERS)[number];
export type SaleSource = (typeof SALE_SOURCES)[number];
export type SaleState = (typeof SALE_STATES)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type SearchField = (typeof SEARCH_FIELDS)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Person = { id: string; name: string };
export type SalesQuery = RegisterQuery<FilterKey, SortKey>;

export type SalesRegisterRow = {
  id: string;
  source: SaleSource;
  recordId: string;
  billNo: string | null;
  reservedNo: string | null;
  state: SaleState;
  entryAt: string;
  billDate: string;
  entryBy: Person | null;
  patientName: string | null;
  mobile: string | null;
  amount: number;
  paymentModes: PaymentMode[];
  due: number;
  linkedBillNos: string[];
};

export type SalesRegisterResponse = {
  rows: SalesRegisterRow[];
  total: number;
  page: number;
  limit: number;
  totals: { amount: number; count: number; collected: number | null; excluded: { drafts: number; cancelled: number } };
  entryByOptions: Person[];
  clinic: ClinicIdentity;
};

export const PAGE_SIZE = 50;
export const SALES_PATH = '/dashboard/pharmacy/sales';

export const SALES_QUERY: RegisterQueryConfig<FilterKey, SortKey> = {
  searchFields: SEARCH_FIELDS,
  filters: {
    paymentMode: { param: 'pay', values: PAYMENT_MODES },
    state: { param: 'state', values: SALE_STATES },
    source: { param: 'source', values: ['PHARMACY_BILL', 'COUNTER_SALE'] },
    entryById: { param: 'by' },
  },
  sorts: SORT_KEYS,
  descFirst: ['entryAt', 'billDate', 'amount'],
  defaultSort: { by: 'entryAt', dir: 'desc' },
};

const RETURN_PAYMENT_MODES = PAYMENT_MODES.filter((mode) => mode !== 'CREDIT');

export const REGISTER_QUERY: Record<Register, RegisterQueryConfig<FilterKey, SortKey>> = {
  sales: SALES_QUERY,
  returns: { ...SALES_QUERY, filters: { ...SALES_QUERY.filters, paymentMode: { param: 'pay', values: RETURN_PAYMENT_MODES } } },
};

export const paymentModesFor = (register: Register): readonly PaymentMode[] => (register === 'returns' ? RETURN_PAYMENT_MODES : PAYMENT_MODES);

export const paymentBadgeLabel = (register: Register, mode: PaymentMode) =>
  register === 'returns' && mode === 'CREDIT' ? 'Store credit' : PAYMENT_MODE_LABELS[mode];

export const MORE_FILTERS = ['state', 'source', 'entryById'] as const satisfies readonly FilterKey[];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  NETBANKING: 'Net banking',
  WALLET: 'Wallet',
  INSURANCE: 'Insurance',
  CREDIT: 'Credit',
  OTHER: 'Other',
};

export const PAYMENT_FILTER_LABELS: Record<PaymentMode, string> = { ...PAYMENT_MODE_LABELS, CREDIT: 'Due (unpaid)' };

export const SEARCH_FIELD_OPTIONS = [
  { value: 'billNo', label: 'Bill No', placeholder: 'Bill number' },
  { value: 'patient', label: 'Patient', placeholder: 'Patient name' },
  { value: 'mobile', label: 'Mobile', placeholder: 'Mobile number' },
] as const satisfies readonly { value: SearchField; label: string; placeholder: string }[];

export const STATE_LABELS: Record<SaleState, string> = { FINAL: 'Final', DRAFT: 'Draft', CANCELLED: 'Cancelled' };
export const SOURCE_FILTER_LABELS = { PHARMACY_BILL: 'Pharmacy bills', COUNTER_SALE: 'Counter sales' } as const;

export const REGISTER_COPY: Record<Register, { name: string; one: string; many: string; amount: string; payment: string; newLabel: string; table: string; settled: string }> = {
  sales: { name: 'sales', one: 'bill', many: 'bills', amount: 'Bill Amount', payment: 'Payment', newLabel: 'New sale', table: 'Sales', settled: 'Collected' },
  returns: { name: 'returns', one: 'return', many: 'returns', amount: 'Amount', payment: 'Refund', newLabel: 'New return', table: 'Sales returns', settled: 'Refunded' },
};

export function requestParams(register: Register, query: SalesQuery) {
  const q = query.q.trim();
  const { paymentMode, state, source, entryById } = query.filters;
  return {
    register,
    from: query.from,
    to: query.to,
    ...(q ? { field: query.field, q } : {}),
    paymentMode: paymentMode || undefined,
    state: state || undefined,
    source: register === 'sales' ? source || undefined : undefined,
    entryById: entryById || undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    page: query.page,
    limit: PAGE_SIZE,
  };
}

export function salesTabHref(register: Register, params: URLSearchParams | string = '') {
  const next = new URLSearchParams(params);
  next.delete('tab');
  const query = [register === 'returns' ? 'tab=returns' : '', next.toString()].filter(Boolean).join('&');
  return query ? `${SALES_PATH}?${query}` : SALES_PATH;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function footerSummary(register: Register, query: SalesQuery, totals: SalesRegisterResponse['totals']) {
  const copy = REGISTER_COPY[register];
  const mode = query.filters.paymentMode as PaymentMode | '';
  const count = plural(totals.count, copy.one, copy.many);
  if (mode && totals.collected !== null) {
    const label = mode === 'CREDIT' ? 'Due (unpaid)' : `${copy.settled} by ${PAYMENT_MODE_LABELS[mode]}`;
    return `${label} ${formatRupees(totals.collected)} · ${count}`;
  }
  return `Total Amount ${formatRupees(totals.amount)} · ${count}`;
}

export function excludedNote({ drafts, cancelled }: { drafts: number; cancelled: number }) {
  const parts = [drafts > 0 && plural(drafts, 'draft', 'drafts'), cancelled > 0 && `${cancelled} cancelled`].filter(Boolean);
  return parts.length ? `${parts.join(' and ')} not included` : '';
}

export { shortName } from '@/components/register/register-query';

export function localMobile(mobile: string | null): string | null {
  let digits = (mobile ?? '').replace(/\D/g, '');
  if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function displayMobile(mobile: string | null): string {
  const local = localMobile(mobile);
  return local ? `${local.slice(0, 5)} ${local.slice(5)}` : mobile || '—';
}

const shortDate = (day: string) => (isDay(day) ? formatDisplayDay(day) : day);

export function whatsappMessage(row: SalesRegisterRow, clinicName: string) {
  const name = row.patientName?.trim() || 'Customer';
  const clinic = clinicName.trim() || 'our pharmacy';
  if (row.source === 'SALES_RETURN') {
    const against = row.linkedBillNos.length ? `against bill ${row.linkedBillNos.join(', ')}` : `for return ${row.billNo}`;
    return `Dear ${name}, ${clinic} has processed a refund of ${formatRupees(row.amount)} ${against} on ${shortDate(row.billDate)}.`;
  }
  const modes = row.paymentModes.map((mode) => PAYMENT_MODE_LABELS[mode]).join(', ');
  const due = row.due > 0 ? ` Balance due ${formatRupees(row.due)}.` : '';
  return `Dear ${name}, thank you for visiting ${clinic}. Your pharmacy bill ${row.billNo} dated ${shortDate(row.billDate)} is ${formatRupees(row.amount)}${modes ? ` (${modes})` : ''}.${due}`;
}

const BLOCKED_REASON: Record<Exclude<SaleState, 'FINAL'>, (one: string) => string> = {
  DRAFT: (one) => `Finish this draft ${one} first`,
  CANCELLED: (one) => `This ${one} is cancelled`,
};

export function whatsappAction(row: SalesRegisterRow, clinicName: string): { href: string } | { reason: string } {
  const one = row.source === 'SALES_RETURN' ? 'return' : 'bill';
  if (row.state !== 'FINAL') return { reason: BLOCKED_REASON[row.state](one) };
  if (!row.mobile) return { reason: 'No mobile number' };
  const mobile = localMobile(row.mobile);
  if (!mobile) return { reason: 'Mobile number is not a valid 10-digit number' };
  return { href: `https://wa.me/91${mobile}?text=${encodeURIComponent(whatsappMessage(row, clinicName))}` };
}

export function printBlockedReason(row: SalesRegisterRow): string | null {
  const one = row.source === 'SALES_RETURN' ? 'return' : 'bill';
  return row.state === 'FINAL' ? null : BLOCKED_REASON[row.state](one);
}

export function openHref(row: SalesRegisterRow, returnTo: string): string | null {
  if (row.source === 'PHARMACY_BILL') {
    if (row.state !== 'DRAFT') return null;
    const search = row.reservedNo ?? row.patientName ?? '';
    return `/dashboard/pharmacy/invoices${search ? `?search=${encodeURIComponent(search)}` : ''}`;
  }
  const view = row.source === 'SALES_RETURN' ? 'SALES_RETURN' : 'COUNTER_SALE';
  return `/dashboard/inventory?area=sales&view=${view}&document=${encodeURIComponent(row.recordId)}&return=${encodeURIComponent(returnTo)}`;
}

export function newEntryHref(register: Register, returnTo: string, key: string) {
  if (register === 'sales') return '/dashboard/pharmacy?section=billing';
  return `/dashboard/inventory?area=sales&view=SALES_RETURN&new=${key}&return=${encodeURIComponent(returnTo)}`;
}
