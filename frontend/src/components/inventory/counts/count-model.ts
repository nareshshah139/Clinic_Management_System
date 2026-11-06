import { formatRupees } from '@/lib/pharmacy-invoice-print';
import { formatDisplayDay } from '@/lib/date-ranges';
import { displayClinicTime } from '@/lib/date-display';
import { getISTDateString } from '@/lib/utils';
import type { RegisterQuery, RegisterQueryConfig } from '@/components/register/register-query';

export const COUNT_STATES = ['ASSIGNED', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'POSTED_NO_DIFF', 'CANCELLED'] as const;
export type CountState = (typeof COUNT_STATES)[number];

export const COUNT_STATE_LABELS: Record<CountState, string> = {
  ASSIGNED: 'Assigned',
  AWAITING_APPROVAL: 'Signed – awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  POSTED_NO_DIFF: 'Posted (no differences)',
  CANCELLED: 'Cancelled',
};

export const COUNT_STATE_SHORT: Record<CountState, string> = {
  ...COUNT_STATE_LABELS,
  AWAITING_APPROVAL: 'Awaiting approval',
  POSTED_NO_DIFF: 'No differences',
};

export const COUNT_STATE_BADGE: Record<CountState, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
  ASSIGNED: 'info',
  AWAITING_APPROVAL: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  POSTED_NO_DIFF: 'success',
  CANCELLED: 'neutral',
};

export type Person = { id: string; name: string };

export type CountRow = {
  id: string;
  reference: string;
  day: string;
  origin: 'CYCLE' | 'ON_DEMAND';
  assignedTo: Person | null;
  signedBy: Person | null;
  signedAt: string | null;
  decidedBy: Person | null;
  decidedAt: string | null;
  items: number;
  counted: number;
  differences: number;
  netUnits: number;
  netValue: number;
  state: CountState;
};

export type CountLine = {
  id: string;
  inventoryId: string;
  name: string;
  batchNumber: string;
  expiryDate: string;
  unit: string;
  location: string;
  currentStock: number | null;
  systemStock: number | null;
  physicalStock: number | null;
  difference: number | null;
  unitCost: number;
  value: number | null;
  note: string;
  history: string | null;
};

export type CountDetail = CountRow & {
  version: number;
  reason: string;
  signOffNote: string;
  decisionReason: string;
  selfApproval: boolean;
  lines: CountLine[];
  events: { action: string; at: string; by: string; detail: { reason?: string; note?: string; selfApproval?: boolean } }[];
  can: { count: boolean; decide: boolean; decideOwn: boolean };
  approvers: string[];
};

export type ReconciliationSettings = {
  enabled: boolean;
  cycleDays: number;
  itemsPerPersonPerDay: number;
  assigneeIds: string[];
  cycleStart: string;
};

export type Cycle = { start: string; end: string; day: number; days: number; daysLeft: number };

export type Forecast = {
  batches: number;
  covered: number;
  remaining: number;
  people: number;
  perDay: number;
  capacity: number;
  short: boolean;
  behind: boolean;
  message: string;
};

export type AssignedCount = { id: string; reference: string; day: string; origin: 'CYCLE' | 'ON_DEMAND'; version: number; items: number; counted: number };

export type ReconciliationSummary = {
  today: string;
  settings: ReconciliationSettings;
  settingsVersion: number;
  cycle: Cycle;
  forecast: Forecast;
  mine: AssignedCount[];
  approvals: { count: number; netValue: number } | null;
  canCount: boolean;
  canApprove: boolean;
  canConfigure: boolean;
  staff: { id: string; name: string; role: string }[] | null;
};

export type ReconciliationCards = {
  due: { counts: number; items: number } | null;
  approvals: { count: number; netValue: number } | null;
  behind: { remaining: number; message: string } | null;
};

export const COUNT_SORT_KEYS = ['date', 'assignedTo', 'signedAt', 'items', 'differences', 'netValue'] as const;
export type CountSortKey = (typeof COUNT_SORT_KEYS)[number];
export const COUNT_FILTER_KEYS = ['state', 'person'] as const;
export type CountFilterKey = (typeof COUNT_FILTER_KEYS)[number];
export type CountQuery = RegisterQuery<CountFilterKey, CountSortKey>;

export const COUNT_QUERY: RegisterQueryConfig<CountFilterKey, CountSortKey> = {
  searchFields: ['all'],
  filters: { state: { param: 'state', values: COUNT_STATES }, person: { param: 'person' } },
  sorts: COUNT_SORT_KEYS,
  descFirst: ['date', 'signedAt', 'items', 'differences'],
  defaultSort: { by: 'date', dir: 'desc' },
};

export type CountPage = {
  rows: CountRow[];
  total: number;
  page: number;
  limit: number;
  personOptions: Person[];
  totals: { counts: number; differences: number; netValue: number };
};

export const RECONCILIATION = '/inventory/workspace/reconciliation';
export const countPath = (id: string) => `${RECONCILIATION}/counts/${encodeURIComponent(id)}`;

export const countRequestParams = (query: CountQuery, view: 'history' | 'approvals') => ({
  view,
  from: query.from,
  to: query.to,
  q: query.q.trim() || undefined,
  state: query.filters.state || undefined,
  person: query.filters.person || undefined,
  sortBy: query.sortBy,
  sortDir: query.sortDir,
  page: query.page,
  limit: 50,
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const itemCount = (n: number) => plural(n, 'item');
export const batchCount = (n: number) => plural(n, 'batch', 'batches');
export const people = (n: number) => plural(n, 'person', 'people');

export const signedUnits = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
export const signedRupees = (n: number) => (n > 0 ? `+${formatRupees(n)}` : n < 0 ? `−${formatRupees(-n)}` : formatRupees(0));

export const clinicStamp = (instant: string) => `${formatDisplayDay(getISTDateString(new Date(instant)))}, ${displayClinicTime(instant)}`;

export function parseCount(text: string): number | null | 'invalid' {
  const value = text.trim();
  if (value === '') return null;
  return /^\d{1,6}$/.test(value) ? Number(value) : 'invalid';
}

export function countSummary(lines: readonly Pick<CountLine, 'systemStock' | 'physicalStock' | 'unitCost'>[]) {
  const counted = lines.filter((line) => line.physicalStock !== null);
  const differing = counted.filter((line) => line.physicalStock !== line.systemStock);
  const delta = (line: (typeof lines)[number]) => (line.physicalStock ?? 0) - (line.systemStock ?? 0);
  const netUnits = differing.reduce((n, line) => n + delta(line), 0);
  const netValue = Math.round(differing.reduce((n, line) => n + delta(line) * line.unitCost, 0) * 100) / 100;
  return { items: lines.length, counted: counted.length, differences: differing.length, netUnits, netValue };
}

export function summarySentence(figures: ReturnType<typeof countSummary>) {
  if (!figures.differences) return `${itemCount(figures.items)}, all match the system.`;
  return `${itemCount(figures.items)}, ${figures.differences} differ: net ${signedUnits(figures.netUnits)} ${figures.netUnits === 1 || figures.netUnits === -1 ? 'unit' : 'units'}, ${signedRupees(figures.netValue)}.`;
}

const ITEMS_PER_DAY_MAX = 200;

export function forecastMessage(settings: Pick<ReconciliationSettings, 'cycleDays' | 'itemsPerPersonPerDay' | 'assigneeIds'>, batches: number) {
  const perDay = settings.itemsPerPersonPerDay;
  const staff = settings.assigneeIds.length;
  if (!staff) return { short: false, message: 'Choose who counts to start the cycle.' };
  const capacity = settings.cycleDays * perDay * staff;
  const lead = `At ${perDay} per person per day with ${people(staff)}, a ${settings.cycleDays}-day cycle covers`;
  if (capacity >= batches) return { short: false, message: `${lead} all ${batches} batches in stock.` };
  const neededPerDay = Math.ceil(batches / (settings.cycleDays * staff));
  const more = Math.ceil(batches / (settings.cycleDays * perDay)) - staff;
  const addPeople = more === 1 ? 'add a person' : `add ${more} people`;
  const fix =
    neededPerDay <= ITEMS_PER_DAY_MAX ? `Raise items per day to ${neededPerDay} or ${addPeople}.` : `${addPeople[0].toUpperCase()}${addPeople.slice(1)} or lengthen the cycle.`;
  return { short: true, message: `${lead} ${capacity} of ${batches} batches in stock. ${fix}` };
}

export type WriteFailure = { status?: number; body?: { code?: string; message?: string; lineIds?: string[] } | null; message?: string };
export const failureOf = (error: unknown) => (error ?? {}) as WriteFailure;
export function failureMessage(error: unknown) {
  const failure = failureOf(error);
  const message = failure.body?.message ?? failure.message;
  return typeof message === 'string' && message ? message : 'Something went wrong. Try again.';
}
