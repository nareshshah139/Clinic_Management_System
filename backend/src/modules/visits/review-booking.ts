import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus, Prisma, VisitType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { procedureRoomIds } from '../appointments/procedure-room';
import { SchedulingUtils } from '../appointments/utils/scheduling.utils';
import { istClock } from '../doctor-availability/availability';

export type ReviewAppointment = { id: string; date: string; slot: string; doctorName: string };

export type ReviewBooking =
  | { status: 'booked'; appointment: ReviewAppointment }
  | { status: 'moved'; appointment: ReviewAppointment; previous: { date: string; slot: string } }
  | { status: 'existing'; appointment: ReviewAppointment; date: string }
  | { status: 'already-scheduled'; appointment: ReviewAppointment; kept?: ReviewAppointment }
  | { status: 'full'; date: string; kept?: ReviewAppointment }
  | { status: 'in-progress'; appointment: ReviewAppointment; date: string }
  | { status: 'missed'; appointment: ReviewAppointment; date: string }
  | { status: 'done'; appointment: ReviewAppointment }
  | { status: 'skipped'; reason: 'no-review-date' }
  | { status: 'skipped'; reason: 'past-date' | 'cancelled-by-staff'; date: string }
  | { status: 'failed' };

type DayOutcome = Extract<ReviewBooking, { status: 'booked' | 'already-scheduled' | 'full' }>;
type Booked = Awaited<ReturnType<AppointmentsService['bookInTransaction']>>;
type Decision = { outcome: ReviewBooking; booked?: Booked; cancelledId?: string; updatedId?: string };
type Review = Prisma.AppointmentGetPayload<{ include: typeof withDoctor }>;

const logger = new Logger('ReviewBooking');
const OPEN: AppointmentStatus[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS];
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
const requestedDay = (review: Review) => dayOf(review.reviewRequestedFor ?? review.date);

export function reviewKind(plan: string | null, visitDay: string): { visitType: VisitType; notes: string; reviewRequestedProcedure: string | null } {
  let parsed: any = null;
  try {
    parsed = plan ? JSON.parse(plan) : null;
  } catch {
    parsed = null;
  }
  const planned = typeof parsed?.procedurePlanned === 'string' ? parsed.procedurePlanned : parsed?.dermatology?.procedurePlanned;
  const procedure = typeof planned === 'string' ? planned.trim() : '';
  return procedure
    ? { visitType: VisitType.PROCEDURE, notes: procedure, reviewRequestedProcedure: procedure }
    : { visitType: VisitType.OPD, notes: `Review after visit on ${visitDay}`, reviewRequestedProcedure: null };
}

function summarize(appointment: { id: string; date: Date; slot: string; doctor: { firstName: string | null; lastName: string | null } }): ReviewAppointment {
  return {
    id: appointment.id,
    date: dayOf(appointment.date),
    slot: appointment.slot,
    doctorName: `${appointment.doctor.firstName ?? ''} ${appointment.doctor.lastName ?? ''}`.trim(),
  };
}

const existing = (review: Review, date: string): ReviewBooking => ({ status: 'existing', appointment: summarize(review), date });

const UNCHANGED_REQUEST: Record<AppointmentStatus, (review: Review, date: string) => ReviewBooking> = {
  SCHEDULED: existing,
  CONFIRMED: existing,
  CHECKED_IN: existing,
  IN_PROGRESS: existing,
  CANCELLED: (_review, date) => ({ status: 'skipped', reason: 'cancelled-by-staff', date }),
  NO_SHOW: (review, date) => ({ status: 'missed', appointment: summarize(review), date }),
  COMPLETED: (review) => ({ status: 'done', appointment: summarize(review) }),
};

@Injectable()
export class ReviewBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
  ) {}

  /**
   * @cc [owner:nareshshah139,label:product] review-auto-booking
   * Every completion call for a visit with a review date MUST act on that visit's review appointments in a
   * transaction of its own that runs after the completion commits and holds the visit row lock, so concurrent
   * completions of one visit act one at a time. A booking failure MUST NOT fail the completion. A past review date
   * books nothing.
   * Every review appointment MUST record the review date it was booked for (reviewRequestedFor). A visit MUST have at
   * most one pending (SCHEDULED or CONFIRMED) review; a database index enforces it, so CHECKED_IN, IN_PROGRESS,
   * CANCELLED, NO_SHOW and COMPLETED reviews never block a new one, and the desk can still start a visit from a missed
   * review or delete a review visit.
   * The doctor's request is unchanged when the newest review was booked for the visit's review date (a legacy review
   * without a recorded date counts as booked for its own date). Then nothing is moved or booked, whatever the desk did
   * since: the open review is reported as existing on its actual date and slot, noting a move at the desk when that
   * date differs; with no open review, a CANCELLED newest review is reported as cancelled-by-staff, a NO_SHOW one as
   * missed, and a COMPLETED one as done.
   * Otherwise the doctor set a new review date:
   * - an open review already on the new date is reported as existing and records the new date as its request;
   * - a SCHEDULED or CONFIRMED review MUST be cancelled and the new date booked in the same transaction, reported as
   *   moved with the previous date and slot; when the new date cannot be booked the review MUST stay and is reported
   *   as kept beside full or already-scheduled;
   * - a CHECKED_IN or IN_PROGRESS review stays and is reported as in-progress, with nothing booked;
   * - with no open review the new date is booked.
   * Booking a date: a live appointment that is not CANCELLED or NO_SHOW for the patient with the same doctor that day,
   * other than the visit's own appointment, is reported as already-scheduled and nothing is booked; appointments with
   * other doctors do not count. Otherwise every free SCHEDULED-calendar slot of the doctor that IST day that does not
   * overlap the patient's other appointments is tried in order until one books, and full means no such slot was left.
   * The booked appointment is a PROCEDURE appointment whose note is the trimmed "Procedure planned" text when the visit
   * has any, and otherwise an OPD one whose note names the visit's IST date. A booking records that procedure text, or
   * none, as reviewRequestedProcedure. A SCHEDULED or CONFIRMED review reported as existing MUST be rewritten to the
   * visit's current procedure (type, note and reviewRequestedProcedure) in the same transaction when that differs from
   * the recorded one, null counting as none; when it is the same the desk's edits stay, and a CHECKED_IN or
   * IN_PROGRESS review is never rewritten, including one checked in after it was read. A rewritten review's calendar
   * event MUST be synced after the transaction commits.
   * A PROCEDURE review is booked into a procedure room (an active room of the branch whose type contains procedure,
   * operation or surgery): slot by slot in that order it tries the rooms by name, then id, and takes the first free
   * pair; when no slot has a free room it books the first free slot without one. A rewrite to a procedure review also
   * takes the first free procedure room at the review's date and slot (none when none is free) unless it already holds
   * one, a rewrite back to OPD clears the room, and a renamed procedure keeps its room. A room is written only while
   * the review keeps the status and room it was checked with.
   */
  async book(visitId: string, branchId: string, callerUserId?: string): Promise<ReviewBooking> {
    try {
      const decision = await this.prisma.$transaction((tx) => this.decide(tx, visitId, branchId), { timeout: 15_000 });
      if (decision.cancelledId) this.appointments.notifyCancelled(decision.cancelledId, callerUserId);
      if (decision.updatedId) this.appointments.notifyUpdated(decision.updatedId, callerUserId);
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
      select: { id: true, patientId: true, doctorId: true, appointmentId: true, followUp: true, createdAt: true, plan: true },
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
    const open = reviews.find((review) => OPEN.includes(review.status));
    const newest = reviews[0];
    if (newest && requestedDay(newest) === date) {
      const current = open ?? newest;
      const updatedId = open ? await this.followPlan(tx, open, visit, branchId) : undefined;
      return { outcome: UNCHANGED_REQUEST[current.status](current, date), updatedId };
    }
    if (open && dayOf(open.date) === date) {
      await tx.appointment.update({ where: { id: open.id }, data: { reviewRequestedFor: new Date(date) } });
      return { outcome: existing(open, date), updatedId: await this.followPlan(tx, open, visit, branchId) };
    }
    if (open && !MOVABLE.includes(open.status)) {
      return { outcome: { status: 'in-progress', appointment: summarize(open), date } };
    }
    if (open) {
      const cancelled = await tx.appointment.updateMany({
        where: { id: open.id, status: open.status },
        data: { status: AppointmentStatus.CANCELLED },
      });
      if (cancelled.count !== 1) throw new ConflictException('Review appointment changed while moving it');
    }

    const day = await this.bookDay(tx, visit, date, branchId);
    if (!open) return { outcome: day.outcome, booked: day.booked };
    if (day.outcome.status !== 'booked') throw new KeepCurrentReview({ ...day.outcome, kept: summarize(open) });
    return {
      outcome: { status: 'moved', appointment: day.outcome.appointment, previous: { date: dayOf(open.date), slot: open.slot } },
      booked: day.booked,
      cancelledId: open.id,
    };
  }

  private async followPlan(tx: Prisma.TransactionClient, review: Review, visit: { plan: string | null; createdAt: Date }, branchId: string) {
    const kind = reviewKind(visit.plan, istClock(visit.createdAt).date);
    if (review.reviewRequestedProcedure === kind.reviewRequestedProcedure) return undefined;
    let roomId: string | null | undefined;
    if (kind.visitType === VisitType.OPD) roomId = null;
    else if (review.reviewRequestedProcedure === null) {
      const rooms = await procedureRoomIds(tx, branchId);
      if (!review.roomId || !rooms.includes(review.roomId)) roomId = await this.appointments.firstFreeRoom(tx, review, rooms, branchId);
    }
    const unchanged = roomId ? { status: review.status, roomId: review.roomId } : { status: { in: MOVABLE } };
    const rewritten = await tx.appointment.updateMany({ where: { id: review.id, ...unchanged }, data: { ...kind, roomId } });
    return rewritten.count === 1 ? review.id : undefined;
  }

  private async bookDay(
    tx: Prisma.TransactionClient,
    visit: { id: string; patientId: string; doctorId: string; appointmentId: string | null; createdAt: Date; plan: string | null },
    date: string,
    branchId: string,
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
    const kind = reviewKind(visit.plan, istClock(visit.createdAt).date);
    const rooms = kind.visitType === VisitType.PROCEDURE ? await procedureRoomIds(tx, branchId) : [];
    const attempts = [
      ...patientFree.flatMap((slot) => rooms.map((roomId) => ({ slot, roomId }))),
      ...patientFree.map((slot) => ({ slot, roomId: undefined })),
    ];
    for (const { slot, roomId } of attempts) {
      try {
        const booked = await this.appointments.bookInTransaction(tx, {
          patientId: visit.patientId,
          doctorId: visit.doctorId,
          date,
          slot,
          roomId,
          ...kind,
          source: 'review',
          calendar: 'SCHEDULED',
          reviewOfVisitId: visit.id,
          reviewRequestedFor: date,
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
