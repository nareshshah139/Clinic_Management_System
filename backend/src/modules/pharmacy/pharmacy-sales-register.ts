import { Logger } from '@nestjs/common';
import {
  clinicDay,
  clinicDayOf,
  collator,
  compareValues,
  mobileDigits,
  money,
  pageOf,
} from './register-utils';
import { issuedBillNumber } from './bill-number';

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
  refundDue: number;
  refunded: number;
  revisedAt: string | null;
  linkedBillNos: string[];
};

export type SaleEntry = {
  row: SalesRegisterRow;
  collected: Partial<Record<PaymentMode, number>>;
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
    collected: number | null;
    excluded: { drafts: number; cancelled: number };
  };
  entryByOptions: Person[];
};

export type ClinicIdentity = {
  name: string;
  address?: string;
  phone?: string;
  gstin?: string;
  drugLicence?: string;
};

export type BranchRecord = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  gstNumber: string | null;
  licenseNumber: string | null;
};

export type PharmacyBillRecord = {
  id: string;
  invoiceNumber: string;
  status: string;
  invoiceDate: Date;
  createdAt: Date;
  totalAmount: number;
  revisedAt: Date | null;
  billingName: string | null;
  billingPhone: string | null;
  patient: { name: string | null; phone: string | null } | null;
  payments: { method: string; amount: number }[];
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

const logger = new Logger('PharmacySalesRegister');
const unmappedStatuses = new Set<string>();

function saleState(
  states: Record<string, SaleState>,
  source: SaleSource,
  status: string,
): SaleState {
  const state = states[status];
  if (state) return state;
  const key = `${source}:${status}`;
  if (!unmappedStatuses.has(key)) {
    unmappedStatuses.add(key);
    logger.warn(`Listing ${source} status ${status} as a draft`);
  }
  return 'DRAFT';
}

const text = (value: unknown) =>
  (typeof value === 'string' && value.trim()) || null;

export const paymentMode = (value: unknown): PaymentMode => {
  const mode = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (PAYMENT_MODES as readonly string[]).includes(mode)
    ? (mode as PaymentMode)
    : 'OTHER';
};

export function clinicIdentity(branch: BranchRecord): ClinicIdentity {
  const address = [branch.address, branch.city, branch.state, branch.pincode]
    .map(text)
    .filter(Boolean)
    .join(', ');
  const fields: [keyof ClinicIdentity, string | null][] = [
    ['address', address || null],
    ['phone', text(branch.phone)],
    ['gstin', text(branch.gstNumber)],
    ['drugLicence', text(branch.licenseNumber)],
  ];
  return {
    name: branch.name,
    ...Object.fromEntries(fields.filter(([, value]) => value)),
  };
}

export function billEntry(
  bill: PharmacyBillRecord,
  entryBy: Person | null,
): SaleEntry {
  const state = saleState(BILL_STATES, 'PHARMACY_BILL', bill.status);
  const collected: Partial<Record<PaymentMode, number>> = {};
  for (const payment of bill.payments) {
    const mode = paymentMode(payment.method);
    collected[mode] = money((collected[mode] ?? 0) + payment.amount);
  }
  const amount = money(bill.totalAmount);
  const paid = money(bill.payments.reduce((sum, p) => sum + p.amount, 0));
  const refunded = money(
    -bill.payments.reduce((sum, p) => sum + Math.min(0, p.amount), 0),
  );
  return {
    row: {
      id: `PHARMACY_BILL:${bill.id}`,
      source: 'PHARMACY_BILL',
      recordId: bill.id,
      billNo: state === 'DRAFT' ? null : issuedBillNumber(bill.invoiceNumber),
      reservedNo:
        state === 'DRAFT' ? issuedBillNumber(bill.invoiceNumber) : null,
      state,
      entryAt: bill.createdAt.toISOString(),
      billDate: clinicDay(bill.invoiceDate),
      entryBy,
      patientName: text(bill.billingName) ?? text(bill.patient?.name),
      mobile: text(bill.billingPhone) ?? text(bill.patient?.phone),
      amount,
      paymentModes: [
        ...new Set(bill.payments.filter((p) => p.amount > 0).map((p) => paymentMode(p.method))),
      ],
      due: state === 'FINAL' ? Math.max(0, money(amount - paid)) : 0,
      refundDue: state === 'FINAL' ? Math.max(0, money(paid - amount)) : 0,
      refunded,
      revisedAt: bill.revisedAt?.toISOString() ?? null,
      linkedBillNos: [],
    },
    collected,
  };
}

export function workflowEntry(
  document: WorkflowSaleRecord,
  entryBy: Person | null,
  linkedBillNos: string[],
): SaleEntry {
  const payload = (document.payload ?? {}) as Record<string, unknown>;
  const source: SaleSource =
    document.kind === 'SALES_RETURN' ? 'SALES_RETURN' : 'COUNTER_SALE';
  const state = saleState(DOCUMENT_STATES, source, document.status);
  const amount = money(Number(document.totalAmount.toString()));
  const mode = paymentMode(
    source === 'SALES_RETURN' ? payload.refundMode : payload.paymentMode,
  );
  return {
    row: {
      id: `${source}:${document.id}`,
      source,
      recordId: document.id,
      billNo: state === 'DRAFT' ? null : document.reference,
      reservedNo: null,
      state,
      entryAt: document.createdAt.toISOString(),
      billDate: clinicDayOf(payload.date) ?? clinicDay(document.createdAt),
      entryBy,
      patientName: text(payload.customerName),
      mobile: text(payload.customerPhone),
      amount,
      paymentModes: [mode],
      due: 0,
      refundDue: 0,
      refunded: 0,
      revisedAt: null,
      linkedBillNos: source === 'SALES_RETURN' ? linkedBillNos : [],
    },
    collected: { [mode]: amount },
  };
}

export function returnSourceLineIds(payload: unknown): string[] {
  const lines = (payload as { lines?: unknown } | null)?.lines;
  return Array.isArray(lines)
    ? lines.flatMap(
        (line: { sourceLineId?: unknown } | null) =>
          text(line?.sourceLineId) ?? [],
      )
    : [];
}

export function billNoOfSaleReference(reference: string | null) {
  const match = /^(?:INV|WF)-(.+)$/.exec(reference ?? '');
  return match ? match[1] : null;
}

export function linkedBillNos(
  invoiceNumber: string | null,
  saleReferences: (string | null)[],
) {
  return [
    ...new Set(
      [invoiceNumber, ...saleReferences.map(billNoOfSaleReference)].filter(
        (billNo): billNo is string => Boolean(billNo),
      ),
    ),
  ];
}

function matchesSearch(row: SalesRegisterRow, field: SearchField, q: string) {
  if (field === 'mobile') {
    const wanted = mobileDigits(q);
    return Boolean(wanted) && mobileDigits(row.mobile ?? '').includes(wanted);
  }
  const haystack =
    field === 'billNo' ? (row.billNo ?? row.reservedNo) : row.patientName;
  return (haystack ?? '').toLowerCase().includes(q.toLowerCase());
}

const paidIn = (row: SalesRegisterRow, mode: PaymentMode) =>
  row.paymentModes.includes(mode) || (mode === 'CREDIT' && row.due > 0);

const collectedIn = (entry: SaleEntry, mode: PaymentMode) =>
  (entry.collected[mode] ?? 0) + (mode === 'CREDIT' ? entry.row.due : 0);

function matches(row: SalesRegisterRow, query: SalesRegisterQuery) {
  const q = query.q?.trim();
  return (
    row.billDate >= query.from &&
    row.billDate <= query.to &&
    (!q || matchesSearch(row, query.field ?? 'billNo', q)) &&
    (!query.paymentMode || paidIn(row, query.paymentMode)) &&
    (!query.state || row.state === query.state) &&
    (!query.source || row.source === query.source) &&
    (!query.entryById || row.entryBy?.id === query.entryById)
  );
}

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
    return (
      direction *
      (a.entryAt.localeCompare(b.entryAt) || a.id.localeCompare(b.id))
    );
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
  entries: SaleEntry[],
  query: SalesRegisterQuery,
): SalesRegisterPage {
  const filtered = entries.filter((entry) => matches(entry.row, query));
  const final = filtered.filter((entry) => entry.row.state === 'FINAL');
  const counted = (state: SaleState) =>
    filtered.filter((entry) => entry.row.state === state).length;
  const mode = query.paymentMode;
  return {
    rows: pageOf(
      sortRows(
        filtered.map((entry) => entry.row),
        query.sortBy,
        query.sortDir,
      ),
      query.page,
      query.limit,
    ),
    total: filtered.length,
    page: query.page,
    limit: query.limit,
    totals: {
      amount: money(final.reduce((sum, entry) => sum + entry.row.amount, 0)),
      count: final.length,
      collected: mode
        ? money(final.reduce((sum, entry) => sum + collectedIn(entry, mode), 0))
        : null,
      excluded: { drafts: counted('DRAFT'), cancelled: counted('CANCELLED') },
    },
    entryByOptions: entryByOptions(
      entries
        .map((entry) => entry.row)
        .filter(
          (row) => row.billDate >= query.from && row.billDate <= query.to,
        ),
    ),
  };
}
