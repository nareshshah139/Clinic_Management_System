import type { TimeOffKind } from '@prisma/client';

/** Minutes from midnight in clinic time (IST). `end` is exclusive. */
export interface MinuteInterval {
  start: number;
  end: number;
}

export interface WeeklyHoursRow {
  /** 0 = Sunday .. 6 = Saturday, in clinic time. */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface TimeOffRow {
  id: string;
  kind: TimeOffKind;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

export interface BlockedInterval extends MinuteInterval {
  id: string;
  kind: TimeOffKind;
  reason: string | null;
}

export type HoursSource = 'configured' | 'legacy' | 'default';

export interface WeeklyHours {
  source: HoursSource;
  hours: WeeklyHoursRow[];
}

export interface DayAvailability {
  date: string;
  weekday: number;
  source: HoursSource;
  /** The doctor's hours for this weekday, before time off. */
  working: MinuteInterval[];
  /** Working hours with time off removed. */
  intervals: MinuteInterval[];
  /** Time off clipped to this day. */
  blocked: BlockedInterval[];
}

export const MINUTES_PER_DAY = 24 * 60;
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 18;
const LEGACY_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * @cc [owner:nareshshah139,label:product] doctor-hours-precedence
 * A doctor's hours MUST resolve as: configured weekly rows when the doctor has any row
 * (a weekday without rows is a day off); otherwise legacy users.metadata.workingHours;
 * otherwise 09:00-18:00 every day. Saving configured hours MUST NOT delete the legacy value.
 */
export function resolveWeeklyHours(
  configured: WeeklyHoursRow[],
  legacyMetadata: unknown,
): WeeklyHours {
  if (configured.length > 0) {
    return { source: 'configured', hours: sortRows(configured) };
  }
  const legacy = legacyWorkingHours(legacyMetadata);
  if (legacy) return { source: 'legacy', hours: legacy };
  return {
    source: 'default',
    hours: LEGACY_DAY_KEYS.map((_, weekday) => ({
      weekday,
      startMinute: DEFAULT_START_HOUR * 60,
      endMinute: DEFAULT_END_HOUR * 60,
    })),
  };
}

export function resolveDayAvailability(
  date: string,
  weekly: WeeklyHours,
  timeOff: TimeOffRow[],
): DayAvailability {
  const weekday = weekdayOf(date);
  const working = weekly.hours
    .filter((row) => row.weekday === weekday)
    .map((row) => ({ start: row.startMinute, end: row.endMinute }));
  const blocked = clipTimeOffToDay(date, timeOff);
  return {
    date,
    weekday,
    source: weekly.source,
    working,
    intervals: subtractIntervals(working, blocked),
    blocked,
  };
}

/**
 * @cc [owner:nareshshah139,label:product] time-off-slot-overlap
 * A slot MUST count as blocked when time off overlaps it by any minute, including time off that
 * starts inside it or covers it whole. Time off ending exactly when the slot starts, or starting
 * exactly when it ends, MUST NOT block it. Booking and the slot list MUST agree on it.
 */
export function timeOffOverlappingSlot(
  date: string,
  slot: string,
  timeOff: TimeOffRow[],
): BlockedInterval | undefined {
  const range = slotToMinutes(slot);
  return clipTimeOffToDay(date, timeOff).find((b) => overlaps(b, range));
}

/**
 * Validates and converts editor input into rows. Returns an error message
 * instead of throwing so callers decide how to surface it.
 */
export function parseWeeklyHoursInput(
  input: { weekday: number; start: string; end: string }[],
): { rows: WeeklyHoursRow[] } | { error: string } {
  const rows: WeeklyHoursRow[] = [];
  for (const item of input) {
    const startMinute = hhmmToMinutes(item.start);
    const endMinute = hhmmToMinutes(item.end);
    if (!Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6) {
      return { error: `Invalid weekday ${item.weekday}` };
    }
    if (startMinute === null || endMinute === null) {
      return { error: `Invalid time ${item.start}-${item.end}; use HH:MM` };
    }
    if (startMinute >= endMinute) {
      return { error: `Shift ${item.start}-${item.end} must end after it starts` };
    }
    rows.push({ weekday: item.weekday, startMinute, endMinute });
  }
  const sorted = sortRows(rows);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.weekday === cur.weekday && cur.startMinute < prev.endMinute) {
      return {
        error: `Shifts ${minutesToHhmm(prev.startMinute)}-${minutesToHhmm(prev.endMinute)} and ${minutesToHhmm(cur.startMinute)}-${minutesToHhmm(cur.endMinute)} overlap on ${LEGACY_DAY_KEYS[cur.weekday]}`,
      };
    }
  }
  return { rows: sorted };
}

/** The UTC instant at which an IST calendar day starts. */
export function istDayStart(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - IST_OFFSET_MINUTES * 60_000);
}

export function istDayEnd(date: string): Date {
  return new Date(istDayStart(date).getTime() + MINUTES_PER_DAY * 60_000);
}

/** India observes no DST, so a fixed offset is exact. */
export function istClock(now: Date): { date: string; minutes: number } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (Number(match[2]) > 59 || minutes > MINUTES_PER_DAY) return null;
  return minutes;
}

export function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Generated slots may end past midnight (e.g. "23:30-24:30"), so this does not cap at 24:00. */
export function slotToMinutes(slot: string): MinuteInterval {
  const [start, end] = slot.split('-').map((part) => {
    const [h, m] = part.split(':').map(Number);
    return h * 60 + m;
  });
  return { start, end };
}

export function overlaps(a: MinuteInterval, b: MinuteInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

function clipTimeOffToDay(date: string, timeOff: TimeOffRow[]): BlockedInterval[] {
  const dayStart = istDayStart(date).getTime();
  const dayEnd = dayStart + MINUTES_PER_DAY * 60_000;
  const blocked: BlockedInterval[] = [];
  for (const row of timeOff) {
    const start = Math.max(row.startsAt.getTime(), dayStart);
    const end = Math.min(row.endsAt.getTime(), dayEnd);
    if (start >= end) continue;
    blocked.push({
      id: row.id,
      kind: row.kind,
      reason: row.reason,
      start: Math.floor((start - dayStart) / 60_000),
      end: Math.ceil((end - dayStart) / 60_000),
    });
  }
  return blocked.sort((a, b) => a.start - b.start);
}

function subtractIntervals(
  from: MinuteInterval[],
  remove: MinuteInterval[],
): MinuteInterval[] {
  let result = from.map((i) => ({ ...i }));
  for (const cut of remove) {
    result = result.flatMap((i) => {
      if (!overlaps(i, cut)) return [i];
      const pieces: MinuteInterval[] = [];
      if (i.start < cut.start) pieces.push({ start: i.start, end: cut.start });
      if (cut.end < i.end) pieces.push({ start: cut.end, end: i.end });
      return pieces;
    });
  }
  return result;
}

function sortRows(rows: WeeklyHoursRow[]): WeeklyHoursRow[] {
  return [...rows].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
  );
}

/**
 * Mirrors how getAvailableSlots read `{ startHour, endHour, byDay: { mon: {...} } }`
 * before configured hours existed, so doctors who never re-save see the same day.
 */
function legacyWorkingHours(metadata: unknown): WeeklyHoursRow[] | null {
  const hours = parseRecord(metadata)?.workingHours;
  if (!hours || typeof hours !== 'object') return null;
  const wh = hours as {
    startHour?: unknown;
    endHour?: unknown;
    byDay?: Record<string, { startHour?: unknown; endHour?: unknown } | undefined>;
  };
  let anySet = false;
  const rows = LEGACY_DAY_KEYS.map((key, weekday) => {
    const byDay = wh.byDay && typeof wh.byDay === 'object' ? wh.byDay[key] : undefined;
    const start = integerOr(byDay?.startHour, integerOr(wh.startHour, undefined));
    const end = integerOr(byDay?.endHour, integerOr(wh.endHour, undefined));
    if (start !== undefined || end !== undefined) anySet = true;
    const startHour = Math.max(0, Math.min(23, start ?? DEFAULT_START_HOUR));
    const endHour = Math.max(startHour + 1, Math.min(24, end ?? DEFAULT_END_HOUR));
    return { weekday, startMinute: startHour * 60, endMinute: endHour * 60 };
  });
  return anySet ? rows : null;
}

function integerOr<T>(value: unknown, fallback: T): number | T {
  return Number.isInteger(value) ? (value as number) : fallback;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}
