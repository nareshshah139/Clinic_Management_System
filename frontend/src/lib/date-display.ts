type DateValue = string | Date | null | undefined;
type CalendarDate = Readonly<{ year: number; month: number; day?: number }>;
type Instant = Readonly<{ epochMs: number }>;
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clinicParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h12',
});
const pad = (value: number) => String(value).padStart(2, '0');

function validCalendar(year: number, month: number, day?: number): CalendarDate | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null;
  if (day !== undefined) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > days[month - 1]) return null;
  }
  return { year, month, day };
}

function calendar(value: string | null | undefined): CalendarDate | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  return match ? validCalendar(+match[1], +match[2], match[3] === undefined ? undefined : +match[3]) : null;
}

function instant(value: DateValue): Instant | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? { epochMs: value.getTime() } : null;
  }
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !validCalendar(+match[1], +match[2], +match[3])) return null;
  if (+match[4] > 23 || +match[5] > 59 || +(match[6] || 0) > 59) return null;
  if (match[8] !== 'Z' && (+match[8].slice(1, 3) > 23 || +match[8].slice(4) > 59)) return null;
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? { epochMs } : null;
}

function dateText(value: CalendarDate): string {
  return `${value.day === undefined ? '' : `${pad(value.day)} `}${months[value.month - 1]} ${String(value.year).padStart(4, '0')}`;
}

function clinic(value: Instant) {
  const parts = clinicParts.formatToParts(value.epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  return {
    date: dateText({ year: +part('year'), month: +part('month'), day: +part('day') }),
    time: `${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`,
  };
}

/**
 * @cc [owner:nareshshah139,label:product] calendar-display-precision
 * Valid YYYY-MM-DD values MUST display as 05 Nov 2026 and YYYY-MM values as Nov 2026.
 * Impossible dates, timestamps and missing values MUST return the supplied fallback.
 */
export function displayCalendarDate(value: string | null | undefined, fallback = '—'): string {
  const parsed = calendar(value);
  return parsed ? dateText(parsed) : fallback;
}

/**
 * @cc [owner:nareshshah139,label:product] stored-utc-date-display
 * Calendar values MUST retain day or month precision; zoned timestamps and Date values MUST
 * retain their UTC day, including month-end expiry. Invalid or missing values return fallback.
 */
export function displayUtcDate(value: DateValue, fallback = '—'): string {
  const parsed = typeof value === 'string' ? calendar(value) : null;
  if (parsed) return dateText(parsed);
  const event = instant(value);
  if (!event) return fallback;
  const date = new Date(event.epochMs);
  return dateText({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

/**
 * @cc [owner:nareshshah139,label:product] picker-date-display
 * A valid picker Date MUST retain its local selected day in every process timezone.
 * Missing or invalid dates MUST return fallback, never today's date.
 */
export function displayLocalDate(value: Date | null | undefined, fallback = '—'): string {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? dateText({ year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }) : fallback;
}

/**
 * @cc [owner:nareshshah139,label:product] clinic-event-date
 * Zoned timestamps and valid Date values MUST display the Asia/Kolkata date as 05 Nov 2026.
 * Bare dates, unzoned timestamps, invalid and missing values MUST return fallback.
 */
export function displayClinicDate(value: DateValue, fallback = '—'): string {
  const parsed = instant(value);
  return parsed ? clinic(parsed).date : fallback;
}

/**
 * @cc [owner:nareshshah139,label:product] clinic-event-datetime
 * Zoned timestamps and valid Date values MUST display as 05 Nov 2026, 02:30 pm in Asia/Kolkata.
 * Bare dates, unzoned timestamps, invalid and missing values MUST return fallback.
 */
export function displayClinicDateTime(value: DateValue, fallback = '—'): string {
  const parsed = instant(value);
  if (!parsed) return fallback;
  const parts = clinic(parsed);
  return `${parts.date}, ${parts.time}`;
}

/**
 * @cc [owner:nareshshah139,label:product] clinic-event-time
 * Event times MUST use Asia/Kolkata and padded 12-hour time such as 02:30 pm.
 * Bare dates, unzoned timestamps, invalid and missing values MUST return fallback.
 */
export function displayClinicTime(value: DateValue, fallback = '—'): string {
  const parsed = instant(value);
  return parsed ? clinic(parsed).time : fallback;
}

/**
 * @cc [owner:nareshshah139,label:product] picker-date-heading
 * Calendar headings MUST retain the local selected day and use weekday, day, month, year order.
 * Missing or invalid picker dates MUST return fallback.
 */
export function displayLocalDateHeading(value: Date | null | undefined, fallback = '—'): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(value);
}

/**
 * @cc [owner:nareshshah139,label:product] mail-date-display
 * Zoned ISO dates and RFC mail Date headers with numeric offsets or UTC names MUST display
 * as clinic timestamps. Impossible components, unzoned and missing headers return fallback.
 */
export function displayMailDateTime(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  if (instant(value)) return displayClinicDateTime(value, fallback);
  const match = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{4}|UT|UTC|GMT|Z)(?:\s+\([^()]*\))?$/i.exec(value.trim());
  if (!match) return fallback;
  const month = months.findIndex((name) => name.toLowerCase() === match[2].toLowerCase()) + 1;
  const offset = /^[+-]/.test(match[7]) ? `${match[7].slice(0, 3)}:${match[7].slice(3)}` : 'Z';
  return displayClinicDateTime(`${match[3]}-${pad(month)}-${pad(+match[1])}T${match[4]}:${match[5]}:${match[6] || '00'}${offset}`, fallback);
}
