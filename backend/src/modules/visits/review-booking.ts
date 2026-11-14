import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus, Prisma, VisitType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { SchedulingUtils } from '../appointments/utils/scheduling.utils';
import { istClock } from '../doctor-availability/availability';

export type ReviewAppointment = { id: string; date: string; slot: string; doctorName: string };

export type ReviewBooking =
  | { status: 'booked'; appointment: ReviewAppointment }
  | { status: 'moved'; appointment: ReviewAppointment; previous: { date: string; slot: string } }
  | { status: 'existing'; appointment: ReviewAppointment }
  | { status: 'already-scheduled'; appointment: ReviewAppointment; kept?: ReviewAppointment }
  | { status: 'full'; date: string; kept?: ReviewAppointment }
  | { status: 'skipped'; reason: 'no-review-date' }
  | { status: 'skipped'; reason: 'past-date' | 'cancelled-by-staff'; date: string }
  | { status: 'failed' };

type DayOutcome = Extract<ReviewBooking, { status: 'booked' | 'already-scheduled' | 'full' }>;
type Booked = Awaited<ReturnType<AppointmentsService['bookInTransaction']>>;
type Decision = { outcome: ReviewBooking; booked?: Booked; cancelledId?: string };

const logger = new Logger('ReviewBooking');
const MOVABLE: AppointmentStatus[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];
const NOT_LIVE: AppointmentStatus[] = [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW];
const withDoctor = { doctor: { select: { firstName: true, lastName: true } } } as const;

class KeepCurrentReview extends Error {
  constructor(readonly outcome: ReviewBooking) {
    super(outcome.status);
  }
}

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const dayRange = (date: string) => ({ gte: new Date(`${date}T00:00:00.000Z`), lte: new Date(`${date}T23:59:59.999Z`) });

function summarize(appointment: { id: string; date: Date; slot: string; doctor: { firstName: string | null; lastName: string | null } }): ReviewAppointment {
  return {
    id: appointment.id,
    date: dayOf(appointment.date),
    slot: appointment.slot,
    doctorName: `${appointment.doctor.firstName ?? ''} ${appointment.doctor.lastName ?? ''}`.trim(),
  };
}

@Injectable()
export class ReviewBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
  ) {}

  /**
   * @cc [owner:nareshshah139,label:product] review-auto-booking
   * Every completion call for a visit with a review date MUST make that visit's review appointments
   * match the review date, in a transaction of its own that runs after the completion commits and holds the visit
   * row lock, so concurrent completions of one visit act one at a time. A booking failure MUST NOT fail the completion.
   * A visit MUST have at most one review appointment that is not CANCELLED; a database index enforces it, and a
   * NO_SHOW review counts as that one. Against the visit's reviews, newest first:
   * - a review that is not CANCELLED on the review date is reported as existing;
   * - a SCHEDULED or CONFIRMED review on another date MUST be cancelled and the review date booked, reported as moved
   *   with the previous date and slot; when the review date cannot be booked, the earlier review MUST stay and is
   *   reported as kept, so the system cancels a review only when it books the replacement in the same transaction;
   * - a CHECKED_IN, IN_PROGRESS, COMPLETED or NO_SHOW review on another date stays and is reported as existing;
   * - when no review is live and the newest one is CANCELLED on the review date, staff cancelled it, and it MUST NOT
   *   be booked again.
   * Otherwise, a live appointment that is not CANCELLED or NO_SHOW for the patient with the same doctor that day,
   * other than the visit's own appointment, is reported as already-scheduled and nothing is booked; appointments with
   * other doctors do not count. Otherwise every free SCHEDULED-calendar slot of the doctor that IST day that does not
   * overlap the patient's other appointments is tried in order until one books, and full means no such slot was left.
   * A past review date books nothing.
   */
  async book(visitId: string, branchId: string, callerUserId?: string): Promise<ReviewBooking> {
    try {
      const decision = await this.prisma.$transaction((tx) => this.decide(tx, visitId, branchId), { timeout: 15_000 });
      if (decision.cancelledId) this.appointments.notifyCancelled(decision.cancelledId, callerUserId);
      if (decision.booked) {
        await this.appointments.notifyBooked(decision.booked, branchId, callerUserId).catch((error) => this.log(error));
      }
      return decision.outcome;
    } catch (error) {
      if (error instanceof KeepCurrentReview) return error.outcome;
      this.log(error);
      return { status: 'failed' };
    }
  }

  private async decide(tx: Prisma.TransactionClient, visitId: string, branchId: string): Promise<Decision> {
    await tx.$queryRaw`SELECT id FROM visits WHERE id = ${visitId} FOR UPDATE`;
    const visit = await tx.visit.findFirstOrThrow({
      where: { id: visitId, deletedAt: null },
      select: { id: true, patientId: true, doctorId: true, appointmentId: true, followUp: true },
    });
    if (!visit.followUp) return { outcome: { status: 'skipped', reason: 'no-review-date' } };
    const date = istClock(visit.followUp).date;
    const today = istClock(new Date()).date;
    if (date < today) return { outcome: { status: 'skipped', reason: 'past-date', date } };

    const reviews = await tx.appointment.findMany({
      where: { reviewOfVisitId: visit.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: withDoctor,
    });
    const live = reviews.find((review) => review.status !== AppointmentStatus.CANCELLED);
    if (live && (dayOf(live.date) === date || !MOVABLE.includes(live.status))) {
      return { outcome: { status: 'existing', appointment: summarize(live) } };
    }
    if (!live && reviews[0] && dayOf(reviews[0].date) === date) {
      return { outcome: { status: 'skipped', reason: 'cancelled-by-staff', date } };
    }
    if (live) {
      const cancelled = await tx.appointment.updateMany({
        where: { id: live.id, status: live.status },
        data: { status: AppointmentStatus.CANCELLED },
      });
      if (cancelled.count !== 1) throw new ConflictException('Review appointment changed while moving it');
    }

    const day = await this.bookDay(tx, visit, date, branchId, today);
    if (!live) return { outcome: day.outcome, booked: day.booked };
    if (day.outcome.status !== 'booked') throw new KeepCurrentReview({ ...day.outcome, kept: summarize(live) });
    return {
      outcome: { status: 'moved', appointment: day.outcome.appointment, previous: { date: dayOf(live.date), slot: live.slot } },
      booked: day.booked,
      cancelledId: live.id,
    };
  }

  private async bookDay(
    tx: Prisma.TransactionClient,
    visit: { id: string; patientId: string; doctorId: string; appointmentId: string | null },
    date: string,
    branchId: string,
    today: string,
  ): Promise<{ outcome: DayOutcome; booked?: Booked }> {
    const patientDay = await tx.appointment.findMany({
      where: {
        branchId,
        patientId: visit.patientId,
        date: dayRange(date),
        status: { notIn: NOT_LIVE },
        ...(visit.appointmentId ? { id: { not: visit.appointmentId } } : {}),
      },
      orderBy: { slot: 'asc' },
      include: withDoctor,
    });
    const sameDoctor = patientDay.find((appointment) => appointment.doctorId === visit.doctorId);
    if (sameDoctor) return { outcome: { status: 'already-scheduled', appointment: summarize(sameDoctor) } };

    const { availableSlots } = await this.appointments.getAvailableSlots({ doctorId: visit.doctorId, date, calendar: 'SCHEDULED' }, branchId);
    const patientFree = availableSlots.filter((slot) => patientDay.every((other) => !SchedulingUtils.doTimeSlotsOverlap(slot, other.slot)));
    for (const slot of patientFree) {
      try {
        const booked = await this.appointments.bookInTransaction(tx, {
          patientId: visit.patientId,
          doctorId: visit.doctorId,
          date,
          slot,
          visitType: VisitType.OPD,
          source: 'review',
          notes: `Review after visit on ${today}`,
          calendar: 'SCHEDULED',
          reviewOfVisitId: visit.id,
        }, branchId);
        return { outcome: { status: 'booked', appointment: summarize(booked) }, booked };
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    return { outcome: { status: 'full', date } };
  }

  private log(error: unknown) {
    logger.error(`Review booking failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}
