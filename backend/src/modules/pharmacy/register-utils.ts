import { ValidationArguments, registerDecorator } from 'class-validator';
import type { PrismaService } from '../../shared/database/prisma.service';
export { money } from '../inventory/inventory-stock';

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONED_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ZONELESS_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/;
export const MAX_REGISTER_RANGE_DAYS = 400;

const clinicDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const clinicDay = (instant: Date) => clinicDayFormat.format(instant);

export function isCalendarDay(value: string) {
  const match = CALENDAR_DAY.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.toISOString().slice(0, 10) === value;
}

export function clinicDayOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (isCalendarDay(text)) return text;
  if (ZONELESS_TIMESTAMP.test(text) && isCalendarDay(text.slice(0, 10)))
    return text.slice(0, 10);
  if (!ZONED_TIMESTAMP.test(text) || !isCalendarDay(text.slice(0, 10)))
    return null;
  const instant = new Date(text);
  return Number.isFinite(instant.getTime()) ? clinicDay(instant) : null;
}

export const clinicDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);

export function clinicDayRange(from: string, to: string) {
  return {
    gte: clinicDayStart(from),
    lt: new Date(clinicDayStart(to).getTime() + DAY_MS),
  };
}

export function financialYear(day: string) {
  const [year, month] = day.split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

export function registerRangeError(from: string, to: string): string | null {
  if (!isCalendarDay(from) || !isCalendarDay(to)) return null;
  if (from > to) return 'The start date must be on or before the end date';
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  return days > MAX_REGISTER_RANGE_DAYS
    ? `Choose a date range of at most ${MAX_REGISTER_RANGE_DAYS} days`
    : null;
}

export function IsRegisterRange(fromProperty: string) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'registerRange',
      target: target.constructor,
      propertyName,
      validator: {
        validate: (to: unknown, args: ValidationArguments) => {
          const from = (args.object as Record<string, unknown>)[fromProperty];
          return (
            typeof from !== 'string' ||
            typeof to !== 'string' ||
            registerRangeError(from, to) === null
          );
        },
        defaultMessage: (args: ValidationArguments) =>
          registerRangeError(
            String((args.object as Record<string, unknown>)[fromProperty]),
            String(args.value),
          ) ?? '',
      },
    });
}

export const collator = new Intl.Collator('en-IN', {
  numeric: true,
  sensitivity: 'base',
});

export function compareValues(a: string | number, b: string | number) {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : collator.compare(String(a), String(b));
}

export function pageOf<T>(rows: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  return rows.slice(start, start + limit);
}

export function mobileDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  const local =
    digits.length >= 12 && digits.startsWith('0091')
      ? digits.slice(4)
      : digits.length >= 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits.startsWith('0')
          ? digits.slice(1)
          : digits;
  return local.slice(-10);
}

export type RegisterPerson = { id: string; name: string };

export async function peopleById(
  prisma: Pick<PrismaService, 'user'>,
  ids: (string | null)[],
) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!wanted.length) return new Map<string, RegisterPerson>();
  const users = await prisma.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, firstName: true, lastName: true },
  });
  return new Map(
    users.map((user) => [
      user.id,
      { id: user.id, name: `${user.firstName} ${user.lastName}`.trim() },
    ]),
  );
}
