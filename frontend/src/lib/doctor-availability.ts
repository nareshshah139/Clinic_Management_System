import { apiClient } from './api';

export type TimeOffKind = 'LEAVE' | 'HOLIDAY' | 'BLOCKED';
export type HoursSource = 'configured' | 'legacy' | 'default';

/** Minutes from midnight in clinic time (IST); `end` is exclusive. */
export interface MinuteInterval {
  start: number;
  end: number;
}

export interface WeeklyShift {
  weekday: number;
  start: string;
  end: string;
}

export interface TimeOff {
  id: string;
  doctorId: string | null;
  kind: TimeOffKind;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface NewTimeOff {
  doctorId?: string;
  kind: TimeOffKind;
  startsAt: string;
  endsAt: string;
  reason?: string;
}

export interface DoctorAvailability {
  doctorId: string;
  source: HoursSource;
  hours: WeeklyShift[];
  timeOff: TimeOff[];
}

export interface DoctorDay {
  date: string;
  weekday: number;
  source: HoursSource;
  working: MinuteInterval[];
  intervals: MinuteInterval[];
  blocked: (MinuteInterval & { id: string; kind: TimeOffKind; reason: string | null })[];
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const TIME_OFF_LABELS: Record<TimeOffKind, string> = {
  LEAVE: 'Leave',
  HOLIDAY: 'Clinic holiday',
  BLOCKED: 'Blocked time',
};

/** Resolves to null when the day cannot be loaded, so callers keep their defaults. */
export async function loadDoctorDay(doctorId: string, date: string): Promise<DoctorDay | null> {
  try {
    const day = await apiClient.getDoctorDay(doctorId, date);
    return day && Array.isArray(day.working) ? day : null;
  } catch {
    return null;
  }
}

/** Whole-hour grid bounds covering the doctor's hours; null keeps the caller's default grid. */
export function gridHoursFor(day: DoctorDay | null): { startHour: number; endHour: number } | null {
  if (!day || day.source === 'default' || day.working.length === 0) return null;
  const start = Math.min(...day.working.map((i) => i.start));
  const end = Math.max(...day.working.map((i) => i.end));
  return { startHour: Math.floor(start / 60), endHour: Math.min(24, Math.ceil(end / 60)) };
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':').map((v) => parseInt(v, 10));
  return h * 60 + m;
}

export function minutesToHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function describeBlock(block: DoctorDay['blocked'][number]): string {
  const span = block.start === 0 && block.end >= 1440 ? 'all day' : `${minutesToHhmm(block.start)}-${minutesToHhmm(block.end)}`;
  return `${TIME_OFF_LABELS[block.kind]} ${span}${block.reason ? ` (${block.reason})` : ''}`;
}

/**
 * `blocked` mirrors the server's 409 for time off; `warning` is advisory only,
 * because booking outside working hours is still allowed.
 */
export function checkSlot(day: DoctorDay | null, slot: string): { blocked?: string; warning?: string } {
  const [s, e] = (slot || '').split('-');
  if (!day || !s || !e) return {};
  const start = hhmmToMinutes(s);
  const end = hhmmToMinutes(e);
  const hit = day.blocked.find((b) => start < b.end && b.start < end);
  if (hit) return { blocked: `Cannot book ${slot}: ${describeBlock(hit)}.` };
  if (day.source === 'default') return {};
  const inside = day.working.some((i) => start >= i.start && end <= i.end);
  if (inside) return {};
  const hours = day.working.length
    ? day.working.map((i) => `${minutesToHhmm(i.start)}-${minutesToHhmm(i.end)}`).join(', ')
    : 'not working this day';
  return { warning: `Warning: selected time ${slot} is outside doctor's working hours (${hours}).` };
}

/** An instant for an IST wall-clock time, as the API expects. */
export function istInstant(date: string, time: string): string {
  return `${date}T${time}:00+05:30`;
}

const IST_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatIst(instant: string): string {
  return IST_FORMAT.format(new Date(instant));
}

export function todayIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
