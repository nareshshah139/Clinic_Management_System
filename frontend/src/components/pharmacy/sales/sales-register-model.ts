import { displayCalendarDate } from '@/lib/date-display';
import { fmtMoney } from '@/components/inventory/workspace-model';

export type Register = 'sales' | 'returns';
export type SaleSource = 'PHARMACY_BILL' | 'COUNTER_SALE' | 'SALES_RETURN';
export type SaleState = 'DRAFT' | 'FINAL' | 'CANCELLED';
export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'INSURANCE' | 'CREDIT' | 'OTHER';
export type SearchField = 'billNo' | 'patient' | 'mobile';
export type SortKey = 'billNo' | 'entryAt' | 'billDate' | 'entryBy' | 'patient' | 'mobile' | 'amount';
export type SortDirection = 'asc' | 'desc';
export type Person = { id: string; name: string };

export type SalesRegisterRow = {
  id: string;
  source: SaleSource;
  recordId: string;
  billNo: string | null;
  state: SaleState;
  entryAt: string;
  billDate: string;
  entryBy: Person | null;
  patientName: string | null;
  mobile: string | null;
  amount: number;
  paymentModes: PaymentMode[];
  linkedBillNo: string | null;
};

export type SalesRegisterResponse = {
  rows: SalesRegisterRow[];
  total: number;
  page: number;
  limit: number;
  totals: { amount: number; count: number; excluded: { drafts: number; cancelled: number } };
  entryByOptions: Person[];
  clinicName: string;
};

export type RegisterState = {
  field: SearchField;
  q: string;
  from: string;
  to: string;
  paymentMode: PaymentMode | '';
  state: SaleState | '';
  source: SaleSource | '';
  entryById: string;
  sortBy: SortKey;
  sortDir: SortDirection;
  page: number;
};

export const PAGE_SIZE = 50;

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

export const PAYMENT_MODE_BADGES: Partial<Record<PaymentMode, string>> = {
  CASH: 'border-success-border bg-success-soft text-success-text',
  UPI: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
  CARD: 'border-info-border bg-info-soft text-info-text',
};

export const SEARCH_FIELDS: { value: SearchField; label: string; placeholder: string }[] = [
  { value: 'billNo', label: 'Bill No', placeholder: 'Search bill number' },
  { value: 'patient', label: 'Patient', placeholder: 'Search patient name' },
  { value: 'mobile', label: 'Mobile', placeholder: 'Search mobile number' },
];

export const STATE_LABELS: Record<SaleState, string> = { FINAL: 'Final', DRAFT: 'Draft', CANCELLED: 'Cancelled' };
export const SOURCE_LABELS: Partial<Record<SaleSource, string>> = { PHARMACY_BILL: 'Pharmacy bills', COUNTER_SALE: 'Counter sales' };

export const REGISTER_COPY: Record<Register, { name: string; one: string; many: string; amount: string; payment: string; newLabel: string }> = {
  sales: { name: 'sales', one: 'bill', many: 'bills', amount: 'Bill Amount', payment: 'Payment', newLabel: 'New sale' },
  returns: { name: 'returns', one: 'return', many: 'returns', amount: 'Amount', payment: 'Refund', newLabel: 'New return' },
};

const pad = (n: number) => String(n).padStart(2, '0');
const clinicDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

export const clinicToday = (now: Date = new Date()) => clinicDayFormat.format(now);

export function financialYear(day: string, offset = 0) {
  const [year, month] = day.split('-').map(Number);
  const start = (month >= 4 ? year : year - 1) + offset;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

function month(day: string) {
  const [year, m] = day.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { from: `${year}-${pad(m)}-01`, to: `${year}-${pad(m)}-${pad(last)}` };
}

export function periodPresets(today: string) {
  return [
    { id: 'today', label: 'Today', range: { from: today, to: today } },
    { id: 'month', label: 'This month', range: month(today) },
    { id: 'fy', label: 'This financial year', range: financialYear(today) },
    { id: 'last-fy', label: 'Last financial year', range: financialYear(today, -1) },
  ];
}

export function defaultState(today: string): RegisterState {
  return { field: 'billNo', q: '', ...financialYear(today), paymentMode: '', state: '', source: '', entryById: '', sortBy: 'entryAt', sortDir: 'desc', page: 1 };
}

const PARAM_NAMES: Record<keyof RegisterState, string> = {
  field: 'field', q: 'q', from: 'from', to: 'to', paymentMode: 'pay', state: 'state', source: 'source',
  entryById: 'by', sortBy: 'sort', sortDir: 'dir', page: 'page',
};

const ALLOWED: Partial<Record<keyof RegisterState, readonly string[]>> = {
  field: ['billNo', 'patient', 'mobile'],
  paymentMode: Object.keys(PAYMENT_MODE_LABELS),
  state: ['DRAFT', 'FINAL', 'CANCELLED'],
  source: ['PHARMACY_BILL', 'COUNTER_SALE'],
  sortBy: ['billNo', 'entryAt', 'billDate', 'entryBy', 'patient', 'mobile', 'amount'],
  sortDir: ['asc', 'desc'],
};

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && displayCalendarDate(value, '') !== '';

export function parseState(params: Pick<URLSearchParams, 'get'>, today: string): RegisterState {
  const state = defaultState(today);
  const read = (key: keyof RegisterState) => params.get(PARAM_NAMES[key])?.trim() ?? '';
  for (const key of ['field', 'paymentMode', 'state', 'source', 'sortBy', 'sortDir'] as const) {
    const value = read(key);
    if (ALLOWED[key]!.includes(value)) Object.assign(state, { [key]: value });
  }
  state.q = read('q');
  state.entryById = read('entryById');
  const from = read('from');
  const to = read('to');
  if (isDay(from) && isDay(to) && from <= to) Object.assign(state, { from, to });
  const page = Number(read('page'));
  if (Number.isSafeInteger(page) && page > 1) state.page = page;
  return state;
}

export function stateParams(state: RegisterState, today: string) {
  const defaults = defaultState(today);
  const params = new URLSearchParams();
  for (const key of Object.keys(PARAM_NAMES) as (keyof RegisterState)[]) {
    if (state[key] !== defaults[key]) params.set(PARAM_NAMES[key], String(state[key]));
  }
  return params;
}

export function requestParams(register: Register, state: RegisterState) {
  const q = state.q.trim();
  return {
    register,
    from: state.from,
    to: state.to,
    ...(q ? { field: state.field, q } : {}),
    paymentMode: state.paymentMode || undefined,
    state: state.state || undefined,
    source: register === 'sales' ? state.source || undefined : undefined,
    entryById: state.entryById || undefined,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    page: state.page,
    limit: PAGE_SIZE,
  };
}

export const moreFilterCount = (state: RegisterState) => [state.state, state.source, state.entryById].filter(Boolean).length;

export function hasActiveFilters(state: RegisterState, today: string) {
  const defaults = defaultState(today);
  return (
    state.q.trim() !== '' ||
    state.paymentMode !== '' ||
    moreFilterCount(state) > 0 ||
    state.from !== defaults.from ||
    state.to !== defaults.to
  );
}

export type RegisterAction =
  | { type: 'search'; field?: SearchField; q?: string }
  | { type: 'range'; from: string; to: string }
  | { type: 'filter'; key: 'paymentMode' | 'state' | 'source' | 'entryById'; value: string }
  | { type: 'sort'; key: SortKey }
  | { type: 'page'; page: number }
  | { type: 'clear'; today: string };

export function registerReducer(state: RegisterState, action: RegisterAction): RegisterState {
  switch (action.type) {
    case 'search':
      return { ...state, field: action.field ?? state.field, q: action.q ?? state.q, page: 1 };
    case 'range':
      return { ...state, from: action.from, to: action.to, page: 1 };
    case 'filter':
      return { ...state, [action.key]: action.value, page: 1 };
    case 'sort':
      return {
        ...state,
        sortBy: action.key,
        sortDir: state.sortBy === action.key && state.sortDir === 'asc' ? 'desc' : 'asc',
        page: 1,
      };
    case 'page':
      return { ...state, page: action.page };
    case 'clear':
      return { ...defaultState(action.today), sortBy: state.sortBy, sortDir: state.sortDir };
  }
}

export function whatsappMobile(mobile: string | null) {
  const digits = (mobile ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

export function whatsappAction(row: SalesRegisterRow, clinicName: string): { href: string } | { reason: string } {
  if (row.state === 'DRAFT') return { reason: 'Finish this draft before sending it' };
  if (!row.mobile) return { reason: 'No mobile number' };
  const mobile = whatsappMobile(row.mobile);
  if (!mobile) return { reason: 'Mobile number is not a valid 10-digit number' };
  const label = row.source === 'SALES_RETURN' ? 'Return' : 'Bill';
  const text = [
    clinicName,
    `${label} No: ${row.billNo}`,
    `${label} Date: ${displayCalendarDate(row.billDate)}`,
    `Amount: ${fmtMoney(row.amount)}`,
  ].filter(Boolean).join('\n');
  return { href: `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}` };
}

export function workspaceDocumentHref(row: SalesRegisterRow) {
  const view = row.source === 'SALES_RETURN' ? 'SALES_RETURN' : 'COUNTER_SALE';
  return `/dashboard/inventory?area=sales&view=${view}&document=${encodeURIComponent(row.recordId)}`;
}
