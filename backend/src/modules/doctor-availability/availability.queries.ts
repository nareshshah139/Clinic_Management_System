import type { PrismaService } from '../../shared/database/prisma.service';
import {
  DayAvailability,
  TimeOffRow,
  WeeklyHours,
  istDayEnd,
  istDayStart,
  resolveDayAvailability,
  resolveWeeklyHours,
} from './availability';

type Db = Pick<PrismaService, 'doctorWorkingHours' | 'doctorTimeOff'>;

export async function loadWeeklyHours(
  db: Db,
  branchId: string,
  doctor: { id: string; metadata: unknown },
): Promise<WeeklyHours> {
  const rows = await db.doctorWorkingHours.findMany({
    where: { branchId, doctorId: doctor.id },
    select: { weekday: true, startMinute: true, endMinute: true },
  });
  return resolveWeeklyHours(rows, doctor.metadata);
}

/**
 * @cc [owner:nareshshah139,label:product] time-off-scope-and-boundaries
 * Slot listing, the day view and booking (see time-off-blocks-booking in the appointments
 * service) MUST all read time off here, so a slot listed as free is never refused for time off.
 * It MUST return only the named doctor's leave and blocked time plus that branch's holidays,
 * never another doctor's or another branch's, and only rows overlapping [from, to); time off
 * ending exactly at from MUST NOT be returned.
 */
export function loadTimeOff(
  db: Db,
  branchId: string,
  doctorId: string,
  from: Date,
  to?: Date,
): Promise<TimeOffRow[]> {
  return db.doctorTimeOff.findMany({
    where: {
      branchId,
      OR: [{ doctorId }, { doctorId: null }],
      endsAt: { gt: from },
      ...(to ? { startsAt: { lt: to } } : {}),
    },
    orderBy: { startsAt: 'asc' },
  });
}

export async function loadDayAvailability(
  db: Db,
  branchId: string,
  doctor: { id: string; metadata: unknown },
  date: string,
): Promise<DayAvailability> {
  const [weekly, timeOff] = await Promise.all([
    loadWeeklyHours(db, branchId, doctor),
    loadTimeOff(db, branchId, doctor.id, istDayStart(date), istDayEnd(date)),
  ]);
  return resolveDayAvailability(date, weekly, timeOff);
}
