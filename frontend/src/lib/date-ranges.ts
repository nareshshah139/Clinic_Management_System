export type DayRange = { from: string; to: string };
export type RangePreset = { id: string; label: string; range: DayRange };

export const MIN_YEAR = 2000;
export const MAX_RANGE_DAYS = 400;

const pad = (value: number) => String(value).padStart(2, '0');

function dayFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return !!match && dayFromParts(+match[1], +match[2], +match[3]) === value;
}

export function parseDisplayDay(text: string): string | null {
  const value = text.trim();
  const separated = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(value);
  const match = separated ?? compact;
  return match ? dayFromParts(+match[3], +match[2], +match[1]) : null;
}

export function formatDisplayDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function financialYear(day: string, offset = 0): DayRange {
  const [year, month] = day.split('-').map(Number);
  const start = (month >= 4 ? year : year - 1) + offset;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

const financialYearLabel = (range: DayRange) => `FY ${range.from.slice(0, 4)}-${range.to.slice(2, 4)}`;

function monthOf(day: string): DayRange {
  const [year, month] = day.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

export function rangePresets(today: string): RangePreset[] {
  const yesterday = addDays(today, -1);
  const thisYear = financialYear(today);
  const lastYear = financialYear(today, -1);
  return [
    { id: 'today', label: 'Today', range: { from: today, to: today } },
    { id: 'yesterday', label: 'Yesterday', range: { from: yesterday, to: yesterday } },
    { id: 'last-7-days', label: 'Last 7 days', range: { from: addDays(today, -6), to: today } },
    { id: 'this-month', label: 'This month', range: monthOf(today) },
    { id: 'this-fy', label: financialYearLabel(thisYear), range: thisYear },
    { id: 'last-fy', label: financialYearLabel(lastYear), range: lastYear },
  ];
}

export function rangeError({ from, to }: DayRange): string | null {
  if (from > to) return 'The From date is after the To date.';
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return span > MAX_RANGE_DAYS ? `Pick at most ${MAX_RANGE_DAYS} days at a time.` : null;
}
