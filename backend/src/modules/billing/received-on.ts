import { BadRequestException } from '@nestjs/common';
import { displayCalendarDate } from '../../common/date-display';
import { addDays, clinicDay, isCalendarDay } from '../pharmacy/register-utils';

/** How far back the desk may date a catch-up payment, in clinic days before today. */
export const RECEIVED_ON_DAYS_BACK = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @cc [owner:nareshshah139,label:calculation] payment-received-on
 * A clinic payment MUST be stored with the instant its money was received. With no receivedOn, or
 * receivedOn equal to today's clinic day (Asia/Kolkata), that is now. An earlier receivedOn MUST
 * give the same clinic clock time on that day, so the payment lands on that day in every report.
 * receivedOn MUST be a real calendar day, not after today and at most RECEIVED_ON_DAYS_BACK days
 * before it; anything else MUST be refused before anything is written.
 */
export function receivedAtFor(receivedOn: string | undefined, now: Date): Date {
  const today = clinicDay(now);
  const day = receivedOn?.trim();
  if (!day || day === today) return now;
  if (!isCalendarDay(day)) throw new BadRequestException('Received on must be a real calendar day, for example 2026-11-24.');
  if (day > today) throw new BadRequestException(`Received on cannot be a future day. Today is ${displayCalendarDate(today)}.`);
  const earliest = addDays(today, -RECEIVED_ON_DAYS_BACK);
  if (day < earliest) {
    throw new BadRequestException(
      `Received on can go up to ${RECEIVED_ON_DAYS_BACK} days back, to ${displayCalendarDate(earliest)}. Ask an admin to record older money.`,
    );
  }
  // Asia/Kolkata has no daylight saving, so whole days back keep the clinic clock time.
  const daysBack = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);
  return new Date(now.getTime() - daysBack * DAY_MS);
}
