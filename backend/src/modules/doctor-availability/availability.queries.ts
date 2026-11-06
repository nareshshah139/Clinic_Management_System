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

/** The doctor's own time off plus branch-wide holidays overlapping [from, to). */
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
