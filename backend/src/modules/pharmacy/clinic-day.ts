import { BadRequestException } from '@nestjs/common';

export const CLINIC_TIME_ZONE = 'Asia/Kolkata';
const CLINIC_OFFSET = '+05:30';
const CLINIC_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export type ClinicPeriod = { startDate: string; endDate: string; start: Date; end: Date; days: string[] };

/** The clinic calendar day of an instant, independent of the server's TZ. India has no DST, so a fixed offset is exact. */
export function clinicDay(value: Date): string {
  return new Date(value.getTime() + CLINIC_OFFSET_MS).toISOString().slice(0, 10);
}

export function clinicPeriod(startDate: string, endDate: string, maxDays?: number): ClinicPeriod {
  const start = new Date(`${startDate}T00:00:00.000${CLINIC_OFFSET}`);
  const end = new Date(`${endDate}T23:59:59.999${CLINIC_OFFSET}`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    clinicDay(start) !== startDate ||
    clinicDay(end) !== endDate ||
    start > end
  ) {
    throw new BadRequestException('Choose a valid date range with the start on or before the end');
  }
  const days: string[] = [];
  for (let t = Date.parse(`${startDate}T00:00:00.000Z`); t <= Date.parse(`${endDate}T00:00:00.000Z`); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  if (maxDays && days.length > maxDays) {
    throw new BadRequestException(`Choose a range of at most ${maxDays} days`);
  }
  return { startDate, endDate, start, end, days };
}
