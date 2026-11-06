import { BadRequestException } from '@nestjs/common';
import { collator, isCalendarDay } from '../../pharmacy/register-utils';

export type ReconciliationSettings = {
  enabled: boolean;
  cycleDays: number;
  itemsPerPersonPerDay: number;
  assigneeIds: string[];
  cycleStart: string;
};

export const CYCLE_DAYS = { min: 1, max: 60, fallback: 10 } as const;
export const ITEMS_PER_DAY = { min: 1, max: 200, fallback: 10 } as const;

type Range = { min: number; max: number; fallback: number };
const DAY_MS = 86400000;

const withinRange = (value: unknown, range: Range) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= range.min && n <= range.max ? n : null;
};
const ids = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()))] : [];

export const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * Settings saved before CR-31 kept a daily count (auditEnabled, auditDailyCount) run by the automation owner.
 * Reading them yields the cycle settings that owner would have had: one counter, the same batches per day.
 */
export function readReconciliation(stored: Record<string, any>, anchor: string): ReconciliationSettings {
  const saved = stored.reconciliation;
  if (saved && typeof saved === 'object' && !Array.isArray(saved))
    return {
      enabled: saved.enabled === true,
      cycleDays: withinRange(saved.cycleDays, CYCLE_DAYS) ?? CYCLE_DAYS.fallback,
      itemsPerPersonPerDay: withinRange(saved.itemsPerPersonPerDay, ITEMS_PER_DAY) ?? ITEMS_PER_DAY.fallback,
      assigneeIds: ids(saved.assigneeIds),
      cycleStart: typeof saved.cycleStart === 'string' && isCalendarDay(saved.cycleStart) ? saved.cycleStart : anchor,
    };
  const daily = Number(stored.auditDailyCount);
  const enabled = stored.auditEnabled === true;
  return {
    enabled,
    cycleDays: CYCLE_DAYS.fallback,
    itemsPerPersonPerDay: Number.isSafeInteger(daily) && daily >= 1 ? Math.min(daily, ITEMS_PER_DAY.max) : ITEMS_PER_DAY.fallback,
    assigneeIds: enabled ? ids([stored.ownerId]) : [],
    cycleStart: anchor,
  };
}

export function parseReconciliationInput(input: unknown, current: ReconciliationSettings, today: string): ReconciliationSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Send the reconciliation settings as an object');
  const value = input as Record<string, unknown>;
  const enabled = value.enabled === undefined ? current.enabled : value.enabled === true;
  const cycleDays = value.cycleDays === undefined ? current.cycleDays : withinRange(value.cycleDays, CYCLE_DAYS);
  if (cycleDays === null) throw new BadRequestException(`Cycle length must be a whole number of days from ${CYCLE_DAYS.min} to ${CYCLE_DAYS.max}`);
  const perDay = value.itemsPerPersonPerDay === undefined ? current.itemsPerPersonPerDay : withinRange(value.itemsPerPersonPerDay, ITEMS_PER_DAY);
  if (perDay === null) throw new BadRequestException(`Items per person per day must be a whole number from ${ITEMS_PER_DAY.min} to ${ITEMS_PER_DAY.max}`);
  const assigneeIds = value.assigneeIds === undefined ? current.assigneeIds : ids(value.assigneeIds);
  if (enabled && !assigneeIds.length) throw new BadRequestException('Choose at least one person to count before turning reconciliation on');
  const restart = (enabled && !current.enabled) || cycleDays !== current.cycleDays;
  return { enabled, cycleDays, itemsPerPersonPerDay: perDay, assigneeIds, cycleStart: restart ? today : current.cycleStart };
}

export type Cycle = { start: string; end: string; day: number; days: number; daysLeft: number };

export function cycleOn(settings: Pick<ReconciliationSettings, 'cycleDays' | 'cycleStart'>, today: string): Cycle {
  const index = Math.floor(daysBetween(settings.cycleStart, today) / settings.cycleDays);
  const start = addDays(settings.cycleStart, index * settings.cycleDays);
  const day = daysBetween(start, today) + 1;
  return { start, end: addDays(start, settings.cycleDays - 1), day, days: settings.cycleDays, daysLeft: settings.cycleDays - day + 1 };
}

export type PlanBatch = { id: string; name: string; lastSignedAt: string | null };
export type Assignment = { assigneeId: string; requestKey: string; batchIds: string[] };

export const cycleRequestKey = (cycle: Cycle, today: string, assigneeId: string) => `cycle:${cycle.start}:${today}:${assigneeId}`;

const byNeed = (a: PlanBatch, b: PlanBatch) =>
  (a.lastSignedAt === null ? 0 : 1) - (b.lastSignedAt === null ? 0 : 1) ||
  (a.lastSignedAt ?? '').localeCompare(b.lastSignedAt ?? '') ||
  collator.compare(a.name, b.name) ||
  a.id.localeCompare(b.id);

/**
 * Deals the batches nobody has counted this cycle, least recently counted first, one at a time to each
 * assignee who has no count for today yet, until each holds itemsPerPersonPerDay. Batches already signed
 * this cycle or waiting on an open cycle count are skipped, so reruns on the same day add nothing.
 */
export function planDay(input: {
  settings: ReconciliationSettings;
  today: string;
  batches: readonly PlanBatch[];
  covered: ReadonlySet<string>;
  reserved: ReadonlySet<string>;
  plannedToday: ReadonlySet<string>;
}): { cycle: Cycle; assignments: Assignment[] } {
  const { settings, today } = input;
  const cycle = cycleOn(settings, today);
  if (!settings.enabled) return { cycle, assignments: [] };
  const pool = input.batches.filter((b) => !input.covered.has(b.id) && !input.reserved.has(b.id)).sort(byNeed);
  const assignments = settings.assigneeIds
    .filter((id) => !input.plannedToday.has(id))
    .map((assigneeId) => ({ assigneeId, requestKey: cycleRequestKey(cycle, today, assigneeId), batchIds: [] as string[] }));
  const capacity = assignments.length * settings.itemsPerPersonPerDay;
  pool.slice(0, capacity).forEach((batch, index) => assignments[index % assignments.length].batchIds.push(batch.id));
  return { cycle, assignments: assignments.filter((a) => a.batchIds.length) };
}

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

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

export function forecast(settings: ReconciliationSettings, cycle: Cycle, batches: number, covered: number): Forecast {
  const perDay = settings.itemsPerPersonPerDay;
  const staff = settings.assigneeIds.length;
  const capacity = cycle.days * perDay * staff;
  const remaining = Math.max(0, batches - covered);
  const short = capacity < batches;
  const behind = remaining > cycle.daysLeft * perDay * staff;
  const base = { batches, covered, remaining, people: staff, perDay, capacity, short, behind };
  if (!staff) return { ...base, message: 'Choose who counts to start the cycle.' };
  const lead = `At ${perDay} per person per day with ${people(staff)}, a ${cycle.days}-day cycle covers`;
  if (!short) return { ...base, message: `${lead} all ${batches} batches in stock.` };
  const neededPerDay = Math.ceil(batches / (cycle.days * staff));
  const neededPeople = Math.ceil(batches / (cycle.days * perDay));
  const more = neededPeople - staff;
  const addPeople = more === 1 ? 'add a person' : `add ${more} people`;
  const fix = neededPerDay <= ITEMS_PER_DAY.max ? `Raise items per day to ${neededPerDay} or ${addPeople}.` : `${addPeople[0].toUpperCase()}${addPeople.slice(1)} or lengthen the cycle.`;
  return { ...base, message: `${lead} ${capacity} of ${batches} batches in stock. ${fix}` };
}
