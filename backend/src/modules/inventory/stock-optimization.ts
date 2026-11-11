import { money } from './inventory-stock';

export const RETURN_WINDOW_DAYS = 365;
export const DEFAULT_OPTIMIZATION_RULES = { nonMovingDays: 90, minimumBatchValue: 1500 };
export type OptimizationRules = typeof DEFAULT_OPTIMIZATION_RULES;

const DAY = 86400000;
const NO_DISTRIBUTOR = '';

export type PurchaseSource = {
  lineId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  distributorGstin: string;
  distributorName: string;
  ptr: number;
  gstRate: number;
  unreturnedPaid: number;
  unreturnedFree: number;
};

export type OpenReturn = { id: string; reference: string; status: string };

export type StockBatch = {
  id: string;
  name: string;
  batchNumber: string | null;
  expiryDate: Date | null;
  unit: string;
  available: number;
  costPrice: number;
  gstRate: number | null;
  receivedAt: Date;
  lastSaleAt: Date | null;
  purchases: PurchaseSource[];
  openReturn: OpenReturn | null;
};

export type OptimizationRow = {
  inventoryId: string;
  name: string;
  batchNumber: string | null;
  expiryDate: string | null;
  shelfLifeDays: number | null;
  unit: string;
  quantity: number;
  freeQuantity: number;
  ptr: number;
  gstRate: number | null;
  value: number;
  idleDays: number;
  lastSaleAt: string | null;
  receivedAt: string;
  source: { lineId: string; invoiceId: string; invoiceNumber: string; invoiceDate: string } | null;
  openReturn: OpenReturn | null;
};

export type DistributorGroup = {
  gstin: string;
  name: string;
  rows: OptimizationRow[];
  value: number;
  belowMinimum: boolean;
};

export type StockClassification = {
  rules: OptimizationRules & { returnWindowDays: number };
  asOf: string;
  scanned: number;
  slow: number;
  returnable: DistributorGroup[];
  nonReturnable: DistributorGroup[];
};

const day = (value: Date) => value.toISOString().slice(0, 10);
const utcDay = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

function row(
  batch: StockBatch,
  now: Date,
  quantity: number,
  freeQuantity: number,
  price: { ptr: number; gstRate: number | null },
  source: PurchaseSource | null,
): OptimizationRow {
  const idleFrom = batch.lastSaleAt && batch.lastSaleAt > batch.receivedAt ? batch.lastSaleAt : batch.receivedAt;
  return {
    inventoryId: batch.id,
    name: batch.name,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate ? day(batch.expiryDate) : null,
    shelfLifeDays: batch.expiryDate ? Math.round((utcDay(batch.expiryDate) - utcDay(now)) / DAY) : null,
    unit: batch.unit,
    quantity,
    freeQuantity,
    ptr: price.ptr,
    gstRate: price.gstRate,
    value: money((quantity - freeQuantity) * price.ptr),
    idleDays: Math.floor((now.getTime() - idleFrom.getTime()) / DAY),
    lastSaleAt: batch.lastSaleAt?.toISOString() ?? null,
    receivedAt: batch.receivedAt.toISOString(),
    source: source && { lineId: source.lineId, invoiceId: source.invoiceId, invoiceNumber: source.invoiceNumber, invoiceDate: day(source.invoiceDate) },
    openReturn: batch.openReturn,
  };
}

const byShelfLife = (a: OptimizationRow, b: OptimizationRow) =>
  (a.shelfLifeDays ?? Infinity) - (b.shelfLifeDays ?? Infinity) || a.name.localeCompare(b.name) || a.inventoryId.localeCompare(b.inventoryId);

function grouped(entries: { gstin: string; name: string; row: OptimizationRow }[], minimum: number | null): DistributorGroup[] {
  const groups = new Map<string, DistributorGroup>();
  for (const { gstin, name, row } of entries) {
    const group = groups.get(gstin) ?? { gstin, name, rows: [], value: 0, belowMinimum: false };
    group.rows.push(row);
    group.value = money(group.value + row.value);
    groups.set(gstin, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, rows: group.rows.sort(byShelfLife), belowMinimum: minimum !== null && group.value < minimum }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/**
 * Of `quantity` units going back to one purchase line, how many are its free goods. Units go back in the line's
 * remaining paid-to-free ratio, rounding toward free, so a claim never exceeds what was paid for the units returned.
 */
const freeShare = (quantity: number, source: PurchaseSource) =>
  Math.min(source.unreturnedFree, Math.ceil((quantity * source.unreturnedFree) / (source.unreturnedPaid + source.unreturnedFree)));

/**
 * A batch is slow when its product has not sold for the non-moving days and the batch itself was received before them.
 * Its quantity goes back first to the newest purchase lines still inside the return window, up to what each line has not
 * already returned; whatever is left cannot be returned and is grouped under the distributor it was last bought from.
 * Free goods go back at no value, so group values and the minimum count only paid units.
 */
export function classifyStock(batches: StockBatch[], rules: OptimizationRules, now: Date): StockClassification {
  const idleCutoff = now.getTime() - rules.nonMovingDays * DAY;
  const windowCutoff = now.getTime() - RETURN_WINDOW_DAYS * DAY;
  const returnable: { gstin: string; name: string; row: OptimizationRow }[] = [];
  const kept: { gstin: string; name: string; row: OptimizationRow }[] = [];
  let slow = 0;
  for (const batch of batches) {
    if (batch.available <= 0) continue;
    if (batch.receivedAt.getTime() >= idleCutoff) continue;
    if (batch.lastSaleAt && batch.lastSaleAt.getTime() >= idleCutoff) continue;
    slow++;
    const newestFirst = [...batch.purchases].sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime() || a.lineId.localeCompare(b.lineId));
    let left = batch.available;
    for (const source of newestFirst) {
      const unreturned = source.unreturnedPaid + source.unreturnedFree;
      if (left === 0 || source.invoiceDate.getTime() < windowCutoff || unreturned <= 0) continue;
      const quantity = Math.min(left, unreturned);
      returnable.push({ gstin: source.distributorGstin, name: source.distributorName, row: row(batch, now, quantity, freeShare(quantity, source), source, source) });
      left -= quantity;
    }
    if (left > 0) {
      const last = newestFirst[0];
      kept.push({
        gstin: last?.distributorGstin ?? NO_DISTRIBUTOR,
        name: last?.distributorName ?? 'No purchase on record',
        row: row(batch, now, left, 0, { ptr: batch.costPrice, gstRate: batch.gstRate }, null),
      });
    }
  }
  return {
    rules: { ...rules, returnWindowDays: RETURN_WINDOW_DAYS },
    asOf: now.toISOString(),
    scanned: batches.filter((batch) => batch.available > 0).length,
    slow,
    returnable: grouped(returnable, rules.minimumBatchValue),
    nonReturnable: grouped(kept, null),
  };
}

export type ReturnDraftLine = { inventoryId: string; quantity: number; freeQuantity: number; unitPrice: number; gstRate: number; sourceLineId: string };

/** The lines a new return draft for this group carries: none below the minimum, else every row not already on an open return. */
export function draftLines(group: DistributorGroup): ReturnDraftLine[] {
  if (group.belowMinimum) return [];
  return group.rows
    .filter((r) => !r.openReturn && r.source)
    .map((r) => ({
      inventoryId: r.inventoryId,
      quantity: r.quantity - r.freeQuantity,
      freeQuantity: r.freeQuantity,
      unitPrice: r.ptr,
      gstRate: r.gstRate ?? 0,
      sourceLineId: r.source!.lineId,
    }));
}

export function parseOptimizationRules(input: Record<string, unknown>, previous: OptimizationRules): OptimizationRules {
  const next = { ...previous };
  if (input.nonMovingDays !== undefined) {
    const days = Number(input.nonMovingDays);
    if (input.nonMovingDays === '' || !Number.isSafeInteger(days) || days < 1 || days > 730)
      throw new RangeError('Non-moving days must be a whole number from 1 to 730');
    next.nonMovingDays = days;
  }
  if (input.minimumBatchValue !== undefined) {
    const value = Number(input.minimumBatchValue);
    if (input.minimumBatchValue === '' || !Number.isFinite(value) || value < 0 || value > 1000000)
      throw new RangeError('Minimum batch value must be an amount from ₹0 to ₹10,00,000');
    next.minimumBatchValue = money(value);
  }
  return next;
}

export function storedOptimizationRules(stored: unknown): OptimizationRules {
  try {
    return parseOptimizationRules((stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>, DEFAULT_OPTIMIZATION_RULES);
  } catch {
    return { ...DEFAULT_OPTIMIZATION_RULES };
  }
}
