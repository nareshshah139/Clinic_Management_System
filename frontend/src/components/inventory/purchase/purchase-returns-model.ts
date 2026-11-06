import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { formatDisplayDay, parseDisplayDay } from '@/lib/date-ranges';
import { errorMessage, type RegisterQuery, type RegisterQueryConfig } from '@/components/register/register-query';

export const RETURN_STATES = ['AWAITED', 'RECEIVED', 'ADJUSTED', 'USED', 'DRAFT', 'CANCELLED'] as const;
export const RETURN_KINDS = ['SUPPLIER_RETURN', 'CREDIT_NOTE'] as const;
export const RETURN_REASONS = ['EXPIRY', 'NEAR_EXPIRY', 'BREAKAGE', 'WRONG_ITEM', 'EXCESS_SUPPLY', 'OTHER'] as const;
export const RETURN_SEARCH_FIELDS = ['creditNoteNo', 'returnRef', 'distributor'] as const;
export const RETURN_SORT_KEYS = ['srNo', 'creditNoteNo', 'entryAt', 'creditNoteDate', 'distributor', 'amount', 'state'] as const;
export const RETURN_FILTER_KEYS = ['state', 'distributorGstin', 'kind', 'reason', 'entryById'] as const;
export const RETURN_MORE_FILTERS = ['distributorGstin', 'kind', 'reason', 'entryById'] as const satisfies readonly ReturnFilterKey[];

export type ReturnCreditState = (typeof RETURN_STATES)[number];
export type ReturnKind = (typeof RETURN_KINDS)[number];
export type ReturnReason = (typeof RETURN_REASONS)[number];
export type ReturnSortKey = (typeof RETURN_SORT_KEYS)[number];
export type ReturnFilterKey = (typeof RETURN_FILTER_KEYS)[number];
export type ReturnsQuery = RegisterQuery<ReturnFilterKey, ReturnSortKey>;

export type PurchaseReturnRow = {
  id: string;
  kind: ReturnKind;
  version: number;
  srNo: number;
  returnRef: string;
  creditNote: { number: string; date: string | null; amount: number } | null;
  entryAt: string;
  returnDate: string;
  entryBy: { id: string; name: string } | null;
  distributor: { name: string; gstin: string };
  sourceBillNo: string | null;
  returnValue: number;
  credit: { id: string; amount: number; applied: number; available: number } | null;
  state: ReturnCreditState;
  reason: ReturnReason | null;
};

export type PurchaseReturnsResponse = {
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
  entryByOptions: { id: string; name: string }[];
  distributorOptions: { name: string; gstin: string }[];
};

export type RecordedCreditNote = {
  credit: { id: string; number: string; date: string; amount: number; applied: number; available: number };
};

export const RETURNS_ENDPOINT = '/pharmacy/purchase-returns-register';
export const RETURNS_PAGE_SIZE = 50;
const MONEY_TOLERANCE = 0.01;

export const RETURNS_QUERY: RegisterQueryConfig<ReturnFilterKey, ReturnSortKey> = {
  searchFields: RETURN_SEARCH_FIELDS,
  filters: {
    state: { param: 'state', values: RETURN_STATES },
    distributorGstin: { param: 'gstin' },
    kind: { param: 'type', values: RETURN_KINDS },
    reason: { param: 'reason', values: RETURN_REASONS },
    entryById: { param: 'by' },
  },
  sorts: RETURN_SORT_KEYS,
  descFirst: ['entryAt', 'creditNoteDate', 'amount'],
  defaultSort: { by: 'entryAt', dir: 'desc' },
};

export const RETURN_SEARCH_OPTIONS = [
  { value: 'creditNoteNo', label: 'Credit note no', placeholder: 'Credit note number' },
  { value: 'returnRef', label: 'Return ref', placeholder: 'Return reference' },
  { value: 'distributor', label: 'Distributor', placeholder: 'Distributor name or GSTIN' },
] as const;

export const RETURN_STATE_LABELS: Record<ReturnCreditState, string> = {
  AWAITED: 'Credit note awaited',
  RECEIVED: 'Received',
  ADJUSTED: 'Adjusted',
  USED: 'Fully used',
  DRAFT: 'Draft',
  CANCELLED: 'Cancelled',
};

export const RETURN_STATE_FILTER_LABELS: Record<ReturnCreditState, string> = { ...RETURN_STATE_LABELS, AWAITED: 'Awaited' };

export const RETURN_KIND_LABELS: Record<ReturnKind, string> = { SUPPLIER_RETURN: 'Returns', CREDIT_NOTE: 'Credit notes only' };

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  EXPIRY: 'Expired',
  NEAR_EXPIRY: 'Near expiry',
  BREAKAGE: 'Breakage',
  WRONG_ITEM: 'Wrong item supplied',
  EXCESS_SUPPLY: 'Excess supply',
  OTHER: 'Other',
};

const LEGACY_REASONS: Record<string, ReturnReason> = { DAMAGE: 'BREAKAGE', EXCESS: 'EXCESS_SUPPLY' };

export function returnReasonValue(value: unknown): ReturnReason {
  const text = String(value ?? '').toUpperCase();
  return (RETURN_REASONS as readonly string[]).includes(text) ? (text as ReturnReason) : (LEGACY_REASONS[text] ?? 'OTHER');
}

export function returnsRequestParams(query: ReturnsQuery) {
  const q = query.q.trim();
  const { state, distributorGstin, kind, reason, entryById } = query.filters;
  return {
    from: query.from,
    to: query.to,
    ...(q ? { field: query.field, q } : {}),
    state: state || undefined,
    distributorGstin: distributorGstin || undefined,
    kind: kind || undefined,
    reason: reason || undefined,
    entryById: entryById || undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    page: query.page,
    limit: RETURNS_PAGE_SIZE,
  };
}

export const canRecordCreditNote = (row: PurchaseReturnRow, canWrite: boolean) => canWrite && row.state === 'AWAITED';
export const canSetOff = (row: PurchaseReturnRow, canWrite: boolean) =>
  canWrite && (row.state === 'RECEIVED' || row.state === 'ADJUSTED') && (row.credit?.available ?? 0) > MONEY_TOLERANCE;
export const amountLocked = (row: PurchaseReturnRow) => (row.credit?.applied ?? 0) > MONEY_TOLERANCE;
export const differsFromReturn = (amount: number, row: PurchaseReturnRow) => Math.abs(amount - row.returnValue) > MONEY_TOLERANCE;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
export const returnCount = (count: number) => plural(count, 'return', 'returns');

export function returnsExcludedNote({ drafts, cancelled }: { drafts: number; cancelled: number }) {
  const parts = [drafts > 0 && plural(drafts, 'draft', 'drafts'), cancelled > 0 && `${cancelled} cancelled`].filter(Boolean);
  return parts.length ? `${parts.join(' and ')} not included` : '';
}

export function parseCreditNote(
  input: { number: string; date: string; amount: string },
  today: string,
): { value: { number: string; date: string; amount: number } } | { field: 'number' | 'date' | 'amount'; error: string } {
  const number = input.number.trim().replace(/\s+/g, ' ');
  if (!number) return { field: 'number', error: 'Enter the credit note number from the distributor’s note.' };
  if (number.length > 50) return { field: 'number', error: 'The credit note number can have at most 50 characters.' };
  const date = parseDisplayDay(input.date);
  if (!date) return { field: 'date', error: 'Enter the credit note date as dd/mm/yyyy.' };
  if (date > today) return { field: 'date', error: `The credit note date cannot be after today, ${formatDisplayDay(today)}.` };
  const amount = Number(input.amount.replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return { field: 'amount', error: 'Enter the credit note amount in rupees.' };
  return { value: { number: number.toUpperCase(), date, amount: Math.round(amount * 100) / 100 } };
}

export function differenceNote(amount: number, row: PurchaseReturnRow) {
  const gap = Math.round((amount - row.returnValue) * 100) / 100;
  return `${gap < 0 ? 'Less' : 'More'} than the return value ${formatRupees(row.returnValue)} by ${formatRupees(Math.abs(gap))}.`;
}

export type WriteFailure =
  | { kind: 'stale'; title: string; description: string }
  | { kind: 'field'; field: 'number'; message: string }
  | { kind: 'inline'; message: string };

const codeOf = (error: unknown) => (error as { body?: { code?: unknown } } | null)?.body?.code;

export function creditNoteFailure(error: unknown): WriteFailure {
  const status = (error as { status?: number } | null)?.status;
  if (codeOf(error) === 'CREDIT_NOTE_DUPLICATE') return { kind: 'field', field: 'number', message: errorMessage(error) };
  if (status === 409 || status === 404)
    return { kind: 'stale', title: 'This return changed', description: 'The list now shows its latest status.' };
  return { kind: 'inline', message: errorMessage(error) };
}

export function setOffFailure(error: unknown): WriteFailure {
  const status = (error as { status?: number } | null)?.status;
  if (status === 409 || status === 404)
    return { kind: 'stale', title: 'The balance changed', description: `${errorMessage(error)} The list now shows the latest amounts.` };
  return { kind: 'inline', message: errorMessage(error) };
}
