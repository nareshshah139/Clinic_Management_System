export const SALES_REGISTERS = ['sales', 'returns'] as const;
export const SALE_SOURCES = [
  'PHARMACY_BILL',
  'COUNTER_SALE',
  'SALES_RETURN',
] as const;
export const SALE_STATES = ['DRAFT', 'FINAL', 'CANCELLED'] as const;
export const PAYMENT_MODES = [
  'CASH',
  'UPI',
  'CARD',
  'NETBANKING',
  'WALLET',
  'INSURANCE',
  'CREDIT',
  'OTHER',
] as const;
export const SEARCH_FIELDS = ['billNo', 'patient', 'mobile'] as const;
export const SORT_KEYS = [
  'billNo',
  'entryAt',
  'billDate',
  'entryBy',
  'patient',
  'mobile',
  'amount',
] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type SalesRegisterKind = (typeof SALES_REGISTERS)[number];
export type SaleSource = (typeof SALE_SOURCES)[number];
export type SaleState = (typeof SALE_STATES)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type SearchField = (typeof SEARCH_FIELDS)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

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

export type SalesRegisterQuery = {
  register: SalesRegisterKind;
  from: string;
  to: string;
  field?: SearchField;
  q?: string;
  paymentMode?: PaymentMode;
  state?: SaleState;
  source?: SaleSource;
  entryById?: string;
  sortBy: SortKey;
  sortDir: SortDirection;
  page: number;
  limit: number;
};

export type SalesRegisterPage = {
  rows: SalesRegisterRow[];
  total: number;
  page: number;
  limit: number;
  totals: {
    amount: number;
    count: number;
    excluded: { drafts: number; cancelled: number };
  };
  entryByOptions: Person[];
};

export type PharmacyBillRecord = {
  id: string;
  invoiceNumber: string;
  status: string;
  invoiceDate: Date;
  createdAt: Date;
  totalAmount: number;
  paymentMethod: string;
  billingName: string | null;
  billingPhone: string | null;
  patient: { name: string | null; phone: string | null } | null;
  payments: { method: string }[];
};

export type WorkflowSaleRecord = {
  id: string;
  kind: string;
  status: string;
  reference: string;
  createdAt: Date;
  totalAmount: number | { toString(): string };
  payload: unknown;
};

const BILL_STATES: Record<string, SaleState> = {
  DRAFT: 'DRAFT',
  PENDING: 'DRAFT',
  CONFIRMED: 'FINAL',
  DISPENSED: 'FINAL',
  COMPLETED: 'FINAL',
  CANCELLED: 'CANCELLED',
};

const DOCUMENT_STATES: Record<string, SaleState> = {
  DRAFT: 'DRAFT',
  AWAITING_APPROVAL: 'DRAFT',
  APPROVED: 'DRAFT',
  POSTED: 'FINAL',
  RELEASED: 'FINAL',
  REVERSED: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'CANCELLED',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const clinicDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const clinicDay = (instant: Date) => clinicDayFormat.format(instant);

const clinicDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);

export function clinicDayRange(from: string, to: string) {
  return {
    gte: clinicDayStart(from),
    lt: new Date(clinicDayStart(to).getTime() + DAY_MS),
  };
}

const text = (value: unknown) =>
  (typeof value === 'string' && value.trim()) || null;

export const paymentMode = (value: unknown): PaymentMode => {
  const mode = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (PAYMENT_MODES as readonly string[]).includes(mode)
    ? (mode as PaymentMode)
    : 'OTHER';
};

const money = (value: number) => Math.round(value * 100) / 100;

export function billRow(
  bill: PharmacyBillRecord,
  entryBy: Person | null,
): SalesRegisterRow {
  const state = BILL_STATES[bill.status] ?? 'DRAFT';
  const methods = bill.payments.length
    ? bill.payments.map((p) => p.method)
    : [bill.paymentMethod];
  return {
    id: `PHARMACY_BILL:${bill.id}`,
    source: 'PHARMACY_BILL',
    recordId: bill.id,
    billNo: state === 'DRAFT' ? null : bill.invoiceNumber,
    state,
    entryAt: bill.createdAt.toISOString(),
    billDate: clinicDay(bill.invoiceDate),
    entryBy,
    patientName: text(bill.billingName) ?? text(bill.patient?.name),
    mobile: text(bill.billingPhone) ?? text(bill.patient?.phone),
    amount: money(bill.totalAmount),
    paymentModes: [...new Set(methods.map(paymentMode))],
    linkedBillNo: null,
  };
}

export function workflowRow(
  document: WorkflowSaleRecord,
  entryBy: Person | null,
  linkedBillNo: string | null,
): SalesRegisterRow {
  const payload = (document.payload ?? {}) as Record<string, unknown>;
  const source: SaleSource =
    document.kind === 'SALES_RETURN' ? 'SALES_RETURN' : 'COUNTER_SALE';
  const state = DOCUMENT_STATES[document.status] ?? 'DRAFT';
  const billDate = text(payload.date);
  return {
    id: `${source}:${document.id}`,
    source,
    recordId: document.id,
    billNo: state === 'DRAFT' ? null : document.reference,
    state,
    entryAt: document.createdAt.toISOString(),
    billDate:
      billDate && /^\d{4}-\d{2}-\d{2}$/.test(billDate)
        ? billDate
        : clinicDay(document.createdAt),
    entryBy,
    patientName: text(payload.customerName),
    mobile: text(payload.customerPhone),
    amount: money(Number(document.totalAmount.toString())),
    paymentModes: [
      paymentMode(
        source === 'SALES_RETURN' ? payload.refundMode : payload.paymentMode,
      ),
    ],
    linkedBillNo,
  };
}

const digits = (value: string) => value.replace(/\D/g, '');

function matchesSearch(row: SalesRegisterRow, field: SearchField, q: string) {
  if (field === 'mobile') {
    const wanted = digits(q);
    return Boolean(wanted) && digits(row.mobile ?? '').includes(wanted);
  }
  const haystack = field === 'billNo' ? row.billNo : row.patientName;
  return (haystack ?? '').toLowerCase().includes(q.toLowerCase());
}

function matches(row: SalesRegisterRow, query: SalesRegisterQuery) {
  const q = query.q?.trim();
  return (
    row.billDate >= query.from &&
    row.billDate <= query.to &&
    (!q || matchesSearch(row, query.field ?? 'billNo', q)) &&
    (!query.paymentMode || row.paymentModes.includes(query.paymentMode)) &&
    (!query.state || row.state === query.state) &&
    (!query.source || row.source === query.source) &&
    (!query.entryById || row.entryBy?.id === query.entryById)
  );
}

const collator = new Intl.Collator('en-IN', {
  numeric: true,
  sensitivity: 'base',
});

const SORT_VALUES: Record<
  SortKey,
  (row: SalesRegisterRow) => string | number | null
> = {
  billNo: (row) => row.billNo,
  entryAt: (row) => row.entryAt,
  billDate: (row) => row.billDate,
  entryBy: (row) => row.entryBy?.name ?? null,
  patient: (row) => row.patientName,
  mobile: (row) => row.mobile,
  amount: (row) => row.amount,
};

function compareValues(a: string | number, b: string | number) {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : collator.compare(String(a), String(b));
}

export function sortRows(
  rows: SalesRegisterRow[],
  sortBy: SortKey,
  sortDir: SortDirection,
) {
  const value = SORT_VALUES[sortBy];
  const direction = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || right === null) {
      if (left !== right) return left === null ? 1 : -1;
    } else {
      const order = compareValues(left, right);
      if (order) return direction * order;
    }
    return b.entryAt.localeCompare(a.entryAt) || a.id.localeCompare(b.id);
  });
}

export function entryByOptions(rows: SalesRegisterRow[]): Person[] {
  const people = new Map(
    rows.flatMap((row) =>
      row.entryBy ? [[row.entryBy.id, row.entryBy] as const] : [],
    ),
  );
  return [...people.values()].sort((a, b) => collator.compare(a.name, b.name));
}

export function salesRegisterPage(
  rows: SalesRegisterRow[],
  query: SalesRegisterQuery,
): SalesRegisterPage {
  const filtered = rows.filter((row) => matches(row, query));
  const final = filtered.filter((row) => row.state === 'FINAL');
  const start = (query.page - 1) * query.limit;
  return {
    rows: sortRows(filtered, query.sortBy, query.sortDir).slice(
      start,
      start + query.limit,
    ),
    total: filtered.length,
    page: query.page,
    limit: query.limit,
    totals: {
      amount: money(final.reduce((sum, row) => sum + row.amount, 0)),
      count: final.length,
      excluded: {
        drafts: filtered.filter((row) => row.state === 'DRAFT').length,
        cancelled: filtered.filter((row) => row.state === 'CANCELLED').length,
      },
    },
    entryByOptions: entryByOptions(
      rows.filter(
        (row) => row.billDate >= query.from && row.billDate <= query.to,
      ),
    ),
  };
}
