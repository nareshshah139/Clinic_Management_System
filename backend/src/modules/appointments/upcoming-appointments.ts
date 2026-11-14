import { AppointmentStatus, Prisma } from '@prisma/client';
import { istClock, slotToMinutes } from '../doctor-availability/availability';

const CLOSED: AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

/**
 * @cc [owner:nareshshah139,label:product] upcoming-appointment
 * An appointment is upcoming when it is not completed, cancelled or a no-show and it is either on a
 * later clinic (IST) day or today with its slot not yet ended. The upcoming count and a patient's
 * next appointment MUST both use this rule, so a booking later today is never "not scheduled".
 */
export async function readUpcomingAppointments<
  T extends Prisma.AppointmentInclude | undefined,
>(
  db: Pick<Prisma.TransactionClient, 'appointment'>,
  where: Prisma.AppointmentWhereInput,
  take: number,
  include?: T,
) {
  const clock = istClock(new Date());
  const today = new Date(`${clock.date}T00:00:00.000Z`);
  const open = { ...where, status: { notIn: CLOSED } };
  const [todays, laterCount, later] = await Promise.all([
    db.appointment.findMany({
      where: { ...open, date: today },
      orderBy: { slot: 'asc' },
      include,
    }),
    db.appointment.count({ where: { ...open, date: { gt: today } } }),
    db.appointment.findMany({
      where: { ...open, date: { gt: today } },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      take,
      include,
    }),
  ]);
  const rest = todays.filter(
    (appointment) => slotToMinutes(appointment.slot).end > clock.minutes,
  );
  return {
    total: rest.length + laterCount,
    rows: [...rest, ...later].slice(0, take) as Prisma.AppointmentGetPayload<{
      include: T;
    }>[],
  };
}
