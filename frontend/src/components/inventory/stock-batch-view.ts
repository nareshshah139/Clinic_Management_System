/**
 * @cc [owner:nareshshah139,label:product] stock-page-default-scope
 * The stock page MUST show all batches by default, including depleted history. Explicit
 * filters MUST retain their scope. List, export and count requests MUST use the same filters.
 */
export function stockPageQuery(query: Record<string, string>) {
  return { ...query, batchView: query.batchView || 'ALL' };
}

/**
 * @cc [owner:nareshshah139,label:product] batch-state-physical-not-recency
 * Positive physical stock MUST remain on hand even when held or expired. Zero MUST mean empty,
 * not a claim that a receipt was superseded. Expiry MUST use the same UTC day as the backend;
 * missing expiry MUST remain explicit. No batch can be called current solely by creation date.
 */
export function batchState(item: any, now = new Date()) {
  if (item.currentStock < 0) return 'Negative stock — count needed';
  if (item.currentStock === 0) return 'Previous / depleted';
  const expiry = item.expiryDate ? new Date(item.expiryDate) : null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (expiry && expiry.getTime() < today) return 'Expired, on hand';
  if (item.status && item.status !== 'ACTIVE') return 'Inactive, on hand';
  if (!expiry || Number.isNaN(expiry.getTime())) return 'On hand, expiry unverified';
  if (item.heldStock >= item.currentStock) return 'Held, on hand';
  return 'Current / on hand';
}

/**
 * @cc [owner:nareshshah139,label:product] batch-color-has-label
 * Depleted rows MUST remain readable and distinct from positive-stock rows. Expired
 * or negative stock MUST use error treatment; held, inactive or unverified stock MUST use review
 * treatment. Only available current stock MAY use success treatment. Consumers MUST display batchState alongside color so color is never the only cue.
 */
export function batchRowClass(item: any, now = new Date()) {
  const tone = batchReviewTone(item, now);
  if (tone === 'neutral') return 'bg-muted/60 text-foreground [&_.text-muted-foreground]:text-foreground/80';
  if (tone === 'error') return 'bg-red-50 dark:bg-red-950/30';
  if (tone === 'warning') return 'bg-amber-50 dark:bg-amber-950/30';
  return 'bg-emerald-50 dark:bg-emerald-950/30';
}

/**
 * @cc [owner:nareshshah139,label:product] stock-expiry-calendar-date
 * Stock expiry MUST display its stored UTC calendar date in every browser timezone, including
 * month-end timestamps. Missing or invalid dates MUST display as unverified.
 */
export function fmtStockExpiry(value: string | Date | null | undefined) {
  if (!value) return 'Unverified';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unverified' : date.toLocaleDateString('en-IN', { timeZone: 'UTC' });
}

/**
 * @cc [owner:nareshshah139,label:product] batch-review-evidence
 * Expired or negative on-hand stock MUST be red; held, inactive or unverified stock MUST be
 * amber. Depleted stock MUST be neutral. Green means current stock on hand, not human verification.
 */
export function batchReviewTone(item: any, now = new Date()): 'error' | 'warning' | 'success' | 'neutral' {
  const state = batchState(item, now);
  if (state === 'Previous / depleted') return 'neutral';
  if (state === 'Negative stock — count needed' || state === 'Expired, on hand') return 'error';
  return state === 'Current / on hand' ? 'success' : 'warning';
}
