import type { LedgerChannel } from './inventory-timeline';

export type LedgerKind = 'SALE' | 'PURCHASE' | 'RETURN' | 'ADJUSTMENT';

export const LEDGER_KIND: Record<LedgerChannel, LedgerKind> = {
  PRESCRIPTION: 'SALE',
  PHARMACY_BILL: 'SALE',
  COUNTER_SALE: 'SALE',
  PARTNER_SALE: 'SALE',
  PURCHASE_INVOICE: 'PURCHASE',
  CUSTOMER_RETURN: 'RETURN',
  SUPPLIER_RETURN: 'RETURN',
  LOSS: 'ADJUSTMENT',
  HOLD: 'ADJUSTMENT',
  STOCK_COUNT: 'ADJUSTMENT',
  CORRECTION: 'ADJUSTMENT',
  OPENING_STOCK: 'ADJUSTMENT',
  APPROVED_EDIT: 'ADJUSTMENT',
  TRANSFER: 'ADJUSTMENT',
  INVENTORY_DOCUMENT: 'ADJUSTMENT',
  MANUAL: 'ADJUSTMENT',
};

export type LedgerBatch = { id: string; currentStock: number };
export type LedgerStep = {
  id: string;
  batchId: string;
  at: Date;
  delta: number | null;
  recordedBefore: number | null;
  recordedAfter: number | null;
};
export type ChainBreak = { expected: number; recorded: number };
export type LedgerStepResult = {
  id: string;
  batchId: string;
  delta: number | null;
  in: number | null;
  out: number | null;
  batchClosing: number | null;
  itemClosing: number | null;
  chainBreak: ChainBreak | null;
};
export type BatchLedgerClose = {
  batchId: string;
  closing: number | null;
  currentStock: number;
  matches: boolean | null;
};
export type ItemLedger = {
  rows: LedgerStepResult[];
  batches: BatchLedgerClose[];
  closing: number | null;
  currentStock: number;
  matches: boolean | null;
};

const sumKnown = (values: (number | null)[]) =>
  values.reduce<number | null>(
    (total, v) => (total === null || v === null ? null : total + v),
    0,
  );

const byTimeThenId = (a: LedgerStep, b: LedgerStep) =>
  a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * @cc [owner:nareshshah139,label:product] item-ledger-running-close
 * The item ledger MUST run every sibling batch from a known opening of zero in (time, id) order,
 * whatever order the movements arrive in. Each row's item closing MUST equal the sum of every
 * batch's latest closing and become unknown when any batch balance is unknown. A recorded
 * before-balance that differs from the batch's running close MUST be reported as a chain break on
 * that movement, so a wrong stock figure traces to the first entry where stock changed outside
 * the ledger. A batch agrees with stock on hand only when its known closing equals its balance;
 * the item agrees only when every batch does, so offsetting batch errors cannot cancel out.
 */
export function runItemLedger(
  batches: LedgerBatch[],
  steps: LedgerStep[],
): ItemLedger {
  const prev = new Map<string, number | null>(batches.map((b) => [b.id, 0]));
  const rows = [...steps].sort(byTimeThenId).map((step): LedgerStepResult => {
    const opening = prev.has(step.batchId) ? prev.get(step.batchId)! : 0;
    const { recordedBefore, recordedAfter } = step;
    const delta =
      step.delta ??
      (recordedBefore !== null && recordedAfter !== null
        ? recordedAfter - recordedBefore
        : null);
    const chainBreak =
      opening !== null && recordedBefore !== null && opening !== recordedBefore
        ? { expected: opening, recorded: recordedBefore }
        : null;
    const start = recordedBefore ?? opening;
    const batchClosing =
      recordedAfter ??
      (start === null || delta === null ? null : start + delta);
    prev.set(step.batchId, batchClosing);
    return {
      id: step.id,
      batchId: step.batchId,
      delta,
      in: delta !== null && delta > 0 ? delta : null,
      out: delta !== null && delta < 0 ? -delta : null,
      batchClosing,
      itemClosing: sumKnown([...prev.values()]),
      chainBreak,
    };
  });
  const closes = batches.map((b): BatchLedgerClose => {
    const closing = prev.get(b.id) ?? null;
    return {
      batchId: b.id,
      closing,
      currentStock: b.currentStock,
      matches: closing === null ? null : closing === b.currentStock,
    };
  });
  const closing = sumKnown(closes.map((b) => b.closing));
  const currentStock = batches.reduce((n, b) => n + b.currentStock, 0);
  return {
    rows,
    batches: closes,
    closing,
    currentStock,
    matches: closing === null ? null : closes.every((b) => b.matches),
  };
}
