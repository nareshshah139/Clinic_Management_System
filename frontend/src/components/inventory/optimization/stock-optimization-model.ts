export type GapKey = 'LOCATION' | 'CATEGORY' | 'HSN' | 'MIN_MAX' | 'UNMAPPED';
export type GapCounts = Record<GapKey, number>;

/** Red gaps stop a correct GST bill or a stock match; amber gaps are housekeeping. */
export const GAPS: { key: GapKey; label: string; tone: 'red' | 'amber'; why: string }[] = [
  { key: 'LOCATION', label: 'Missing location', tone: 'amber', why: 'no rack or shelf' },
  { key: 'CATEGORY', label: 'Missing category', tone: 'amber', why: 'no category' },
  { key: 'HSN', label: 'Missing HSN code', tone: 'red', why: 'GST needs it' },
  { key: 'MIN_MAX', label: 'Missing min/max', tone: 'amber', why: 'no reorder levels' },
  { key: 'UNMAPPED', label: 'Unmapped', tone: 'red', why: 'not linked to a product' },
];

export const gapLabel = (key: string) => GAPS.find((gap) => gap.key === key)?.label ?? key;

export type OpenReturn = { id: string; reference: string; status: string };
export type OptimizationRow = {
  inventoryId: string;
  name: string;
  batchNumber: string | null;
  expiryDate: string | null;
  shelfLifeDays: number | null;
  unit: string;
  quantity: number;
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
  supplier?: { id: string; name: string } | null;
  openReturns?: OpenReturn[];
  draftable?: boolean;
  blocker?: string | null;
};
export type OptimizationRun = {
  rules: { nonMovingDays: number; minimumBatchValue: number; returnWindowDays: number };
  asOf: string;
  scanned: number;
  slow: number;
  returnable: DistributorGroup[];
  nonReturnable: DistributorGroup[];
  totals: { returnable: number; nonReturnable: number };
};
export type OptimizationRules = { nonMovingDays: number; minimumBatchValue: number; version: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Shelf life left as a person reads it: days when short, months beyond two months. */
export function shelfLifeText(days: number | null) {
  if (days === null) return 'Expiry not recorded';
  if (days < 0) return `Expired ${plural(-days, 'day')} ago`;
  if (days === 0) return 'Expires today';
  if (days < 60) return plural(days, 'day');
  return `${plural(Math.floor(days / 30.44), 'month')} (${days} days)`;
}

export const shelfLifeTone = (days: number | null) =>
  days === null ? 'text-muted-foreground' : days < 0 ? 'text-red-700 dark:text-red-400' : days < 90 ? 'text-amber-800 dark:text-amber-300' : '';

export const lastSoldText = (row: Pick<OptimizationRow, 'lastSaleAt' | 'idleDays'>) =>
  row.lastSaleAt ? `Last sold ${plural(row.idleDays, 'day')} ago` : `Never sold · in stock ${plural(row.idleDays, 'day')}`;

export const ddmmyyyy = (day: string | null) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '—');
