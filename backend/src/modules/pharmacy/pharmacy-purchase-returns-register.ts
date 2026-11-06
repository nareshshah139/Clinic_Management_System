import { RETURN_REASONS, RETURN_REASON_LABELS, supplierReturnReason, type ReturnReason } from '../inventory/supplier-return';
import { clinicDay, clinicDayOf, collator, compareValues, money, pageOf } from './register-utils';
import { clinicTime } from './pharmacy-purchase-register';
import { creditBalance, type SupplierCreditRecord } from './supplier-credit-balance';
import { MONEY_TOLERANCE } from './purchase-payment-balance';

export { RETURN_REASONS };
export const RETURN_KINDS = ['SUPPLIER_RETURN', 'CREDIT_NOTE'] as const;
export const RETURN_STATES = ['DRAFT', 'AWAITED', 'RECEIVED', 'ADJUSTED', 'USED', 'CANCELLED'] as const;
export const RETURN_SEARCH_FIELDS = ['creditNoteNo', 'returnRef', 'distributor'] as const;
export const RETURN_SORT_KEYS = [
  'srNo',
  'creditNoteNo',
  'entryAt',
  'creditNoteDate',
  'distributor',
  'amount',
  'state',
] as const;

export type ReturnKind = (typeof RETURN_KINDS)[number];
export type ReturnCreditState = (typeof RETURN_STATES)[number];
export type ReturnSearchField = (typeof RETURN_SEARCH_FIELDS)[number];
export type ReturnSortKey = (typeof RETURN_SORT_KEYS)[number];
export type { ReturnReason };

type Person = { id: string; name: string };
type Distributor = { name: string; gstin: string };

export type PurchaseReturnRow = {
  id: string;
  kind: ReturnKind;
  version: number;
  srNo: number;
  returnRef: string;
  creditNote: { number: string; date: string | null; amount: number } | null;
  entryAt: string;
  returnDate: string;
  entryBy: Person | null;
  distributor: Distributor;
  sourceBillNo: string | null;
  returnValue: number;
  credit: { id: string; amount: number; applied: number; available: number } | null;
  state: ReturnCreditState;
  reason: ReturnReason | null;
  awaitedSince: string | null;
};

export type PurchaseReturnEntry = Omit<PurchaseReturnRow, 'srNo'>;

export type PurchaseReturnsQuery = {
  from: string;
  to: string;
  field?: ReturnSearchField;
  q?: string;
  state?: ReturnCreditState;
  distributorGstin?: string;
  kind?: ReturnKind;
  reason?: ReturnReason;
  entryById?: string;
  sortBy: ReturnSortKey;
  sortDir: 'asc' | 'desc';
  page: number;
  limit: number;
};

export type PurchaseReturnsPage = {
  rows: PurchaseReturnRow[];
  total: number;
  page: number;
  limit: number;
  totals: {
    held: number;
    awaited: { amount: number; count: number };
    count: number;
    excluded: { drafts: number; cancelled: number };
  };
  entryByOptions: Person[];
  distributorOptions: Distributor[];
};

export type ReturnCreditRecord = SupplierCreditRecord & {
  id: string;
  creditNoteDate: Date | null;
};

export type ReturnDocumentRecord = {
  id: string;
  kind: string;
  status: string;
  reference: string;
  version: number;
  createdAt: Date;
  payload: unknown;
  totalAmount: unknown;
  supplierGstin: string | null;
  distributorName: string | null;
  sourceBillNo: string | null;
  credit: ReturnCreditRecord | null;
};

export const DRAFT_STATUSES = ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED'];
const CLOSED_STATUSES = ['CANCELLED', 'REVERSED', 'REJECTED'];

export function returnCreditState(
  status: string,
  credit: { number: string | null; amount: number; applied: number } | null,
): ReturnCreditState {
  if (CLOSED_STATUSES.includes(status)) return 'CANCELLED';
  if (status === 'CHALLAN') return 'AWAITED';
  if (status !== 'POSTED') return 'DRAFT';
  if (credit && credit.applied > MONEY_TOLERANCE) return credit.amount - credit.applied <= MONEY_TOLERANCE ? 'USED' : 'ADJUSTED';
  return credit?.number ? 'RECEIVED' : 'AWAITED';
}

const payloadOf = (payload: unknown) =>
  payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

export function purchaseReturnEntry(
  doc: ReturnDocumentRecord,
  entryBy: Person | null,
  now: Date,
): PurchaseReturnEntry {
  const payload = payloadOf(doc.payload);
  const balance = doc.credit ? creditBalance(doc.credit, now) : null;
  const number = doc.credit?.creditNoteNumber ?? null;
  const gstin = (doc.supplierGstin ?? '').toUpperCase();
  const state = returnCreditState(doc.status, balance ? { number, ...balance } : null);
  const returnDate = clinicDayOf(payload.date) ?? clinicDay(doc.createdAt);
  return {
    id: doc.id,
    kind: doc.kind as ReturnKind,
    version: doc.version,
    returnRef: doc.reference,
    creditNote:
      number && balance
        ? {
            number,
            date: doc.credit!.creditNoteDate ? doc.credit!.creditNoteDate.toISOString().slice(0, 10) : null,
            amount: balance.amount,
          }
        : null,
    entryAt: doc.createdAt.toISOString(),
    returnDate,
    entryBy,
    distributor: { name: doc.distributorName ?? gstin, gstin },
    sourceBillNo: doc.sourceBillNo,
    returnValue: money(Number(doc.totalAmount ?? 0)),
    credit: doc.credit && balance ? { id: doc.credit.id, ...balance } : null,
    state,
    reason: doc.kind === 'SUPPLIER_RETURN' ? supplierReturnReason(payload) : null,
    awaitedSince: state === 'AWAITED' ? returnDate : null,
  };
}

const shownAmount = (row: PurchaseReturnEntry) => row.creditNote?.amount ?? row.returnValue;

function matchesSearch(row: PurchaseReturnEntry, field: ReturnSearchField, q: string) {
  const wanted = q.toLowerCase();
  if (field === 'creditNoteNo') return (row.creditNote?.number ?? '').toLowerCase().includes(wanted);
  if (field === 'returnRef') return row.returnRef.toLowerCase().includes(wanted);
  return row.distributor.name.toLowerCase().includes(wanted) || row.distributor.gstin.toLowerCase().includes(wanted);
}

const inRange = (row: PurchaseReturnEntry, query: PurchaseReturnsQuery) =>
  row.returnDate >= query.from && row.returnDate <= query.to;

function matches(row: PurchaseReturnEntry, query: PurchaseReturnsQuery) {
  const q = query.q?.trim();
  return (
    inRange(row, query) &&
    (!q || matchesSearch(row, query.field ?? 'creditNoteNo', q)) &&
    (!query.state || row.state === query.state) &&
    (!query.distributorGstin || row.distributor.gstin === query.distributorGstin.trim().toUpperCase()) &&
    (!query.kind || row.kind === query.kind) &&
    (!query.reason || row.reason === query.reason) &&
    (!query.entryById || row.entryBy?.id === query.entryById)
  );
}

const SORT_VALUES: Record<ReturnSortKey, (row: PurchaseReturnRow) => string | number> = {
  srNo: (row) => row.srNo,
  creditNoteNo: (row) => row.creditNote?.number ?? '',
  entryAt: (row) => row.entryAt,
  creditNoteDate: (row) => row.creditNote?.date ?? '',
  distributor: (row) => row.distributor.name,
  amount: shownAmount,
  state: (row) => RETURN_STATES.indexOf(row.state),
};

export function purchaseReturnRows(entries: PurchaseReturnEntry[], query: PurchaseReturnsQuery) {
  const value = SORT_VALUES[query.sortBy];
  const direction = query.sortDir === 'asc' ? 1 : -1;
  return entries
    .filter((row) => matches(row, query))
    .sort((a, b) => a.entryAt.localeCompare(b.entryAt) || a.id.localeCompare(b.id))
    .map((row, index): PurchaseReturnRow => ({ ...row, srNo: index + 1 }))
    .sort((a, b) => direction * (compareValues(value(a), value(b)) || a.srNo - b.srNo));
}

function options(rows: PurchaseReturnEntry[]) {
  const people = new Map(rows.flatMap((row) => (row.entryBy ? [[row.entryBy.id, row.entryBy] as const] : [])));
  const distributors = new Map(rows.map((row) => [row.distributor.gstin, row.distributor] as const));
  return {
    entryByOptions: [...people.values()].sort((a, b) => collator.compare(a.name, b.name)),
    distributorOptions: [...distributors.values()].sort(
      (a, b) => collator.compare(a.name, b.name) || a.gstin.localeCompare(b.gstin),
    ),
  };
}

export type StandingCredit = { held: number; awaited: { amount: number; count: number } };

export function purchaseReturnsPage(
  entries: PurchaseReturnEntry[],
  query: PurchaseReturnsQuery,
  standing: StandingCredit,
): PurchaseReturnsPage {
  const rows = purchaseReturnRows(entries, query);
  const of = (...states: ReturnCreditState[]) => rows.filter((row) => states.includes(row.state));
  const drafts = of('DRAFT').length;
  const cancelled = of('CANCELLED').length;
  return {
    rows: pageOf(rows, query.page, query.limit),
    total: rows.length,
    page: query.page,
    limit: query.limit,
    totals: {
      held: standing.held,
      awaited: standing.awaited,
      count: rows.length - drafts - cancelled,
      excluded: { drafts, cancelled },
    },
    ...options(entries.filter((row) => inRange(row, query))),
  };
}

const STATE_LABELS: Record<ReturnCreditState, string> = {
  DRAFT: 'Draft',
  AWAITED: 'Credit note awaited',
  RECEIVED: 'Received',
  ADJUSTED: 'Adjusted',
  USED: 'Fully used',
  CANCELLED: 'Cancelled',
};

export function purchaseReturnsSheet(rows: PurchaseReturnRow[]) {
  return rows.map((row) => {
    const entryAt = new Date(row.entryAt);
    return {
      'Sr No': row.srNo,
      'Credit Note No.': row.creditNote?.number ?? '',
      'Return Ref': row.returnRef,
      Type: row.kind === 'CREDIT_NOTE' ? 'Credit note' : 'Return',
      'Entry Date': `${clinicDay(entryAt)} ${clinicTime.format(entryAt)}`,
      'Return Date': row.returnDate,
      'Credit Note Date': row.creditNote?.date ?? '',
      'Entry By': row.entryBy?.name ?? '',
      Distributor: row.distributor.name,
      GSTIN: row.distributor.gstin,
      'Against Bill': row.sourceBillNo ?? '',
      Reason: row.reason ? RETURN_REASON_LABELS[row.reason] : '',
      'Return Value': row.returnValue,
      'Credit Note Amount': row.creditNote?.amount ?? '',
      'Set Off': row.credit?.applied ?? 0,
      Available: row.credit?.available ?? 0,
      Status: STATE_LABELS[row.state],
    };
  });
}
