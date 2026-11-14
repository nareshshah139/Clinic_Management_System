import { ConflictException, Logger } from '@nestjs/common';
import { VisitType } from '@prisma/client';
import type { CreateAppointmentDto } from '../appointments/dto/create-appointment.dto';
import { istClock } from '../doctor-availability/availability';

const logger = new Logger('ReviewBooking');
const MAX_SLOT_ATTEMPTS = 3;
const NOT_LIVE_STATUSES = ['CANCELLED', 'NO_SHOW'] as const;

export type ReviewAppointment = { id: string; date: string; slot: string; doctorName: string };

export type ReviewBooking =
  | { status: 'booked'; appointment: ReviewAppointment }
  | { status: 'existing'; appointment: ReviewAppointment }
  | { status: 'full'; date: string }
  | { status: 'skipped'; reason: 'no-review-date' | 'past-date' }
  | { status: 'failed' };

export interface ReviewBookingDeps {
  prisma: {
    appointment: { findFirst(args: unknown): Promise<any> };
  };
  appointments: {
    getAvailableSlots(query: { doctorId: string; date: string; calendar: 'SCHEDULED' }, branchId: string): Promise<{ availableSlots: string[] }>;
    create(dto: CreateAppointmentDto, branchId: string, callerUserId?: string): Promise<any>;
  };
}

export interface ReviewBookingVisit {
  patientId: string;
  doctorId: string | null;
  appointmentId: string | null;
  followUp: Date | string | null;
}

const doctorNameOf = (doctor?: { firstName?: string | null; lastName?: string | null } | null) =>
  `${doctor?.firstName ?? ''} ${doctor?.lastName ?? ''}`.trim();

const summarize = (appointment: any): ReviewAppointment => ({
  id: appointment.id,
  date: new Date(appointment.date).toISOString().slice(0, 10),
  slot: appointment.slot,
  doctorName: doctorNameOf(appointment.doctor),
});

/**
 * @cc [owner:nareshshah139,label:product] review-auto-booking
 * Completing a visit that has a review date and a doctor MUST try to book that patient with that doctor
 * in the first free SCHEDULED-calendar slot on that clinic (IST) day, on every completion call. It MUST NOT
 * book a patient who already has an appointment that day that is not CANCELLED or NO_SHOW, MUST NOT book a
 * past day, and MUST report a day with no free slot as full. A booking failure MUST NOT fail the completion.
 */
export async function bookReviewAppointment(
  deps: ReviewBookingDeps,
  visit: ReviewBookingVisit,
  branchId: string,
  callerUserId?: string,
  now: Date = new Date(),
): Promise<ReviewBooking> {
  if (!visit.followUp || !visit.doctorId) return { status: 'skipped', reason: 'no-review-date' };
  const date = istClock(new Date(visit.followUp)).date;
  if (date < istClock(now).date) return { status: 'skipped', reason: 'past-date' };
  try {
    const existing = await deps.prisma.appointment.findFirst({
      where: {
        patientId: visit.patientId,
        branchId,
        date: { gte: new Date(`${date}T00:00:00.000Z`), lte: new Date(`${date}T23:59:59.999Z`) },
        status: { notIn: [...NOT_LIVE_STATUSES] },
        ...(visit.appointmentId ? { id: { not: visit.appointmentId } } : {}),
      },
      include: { doctor: { select: { firstName: true, lastName: true } } },
      orderBy: { slot: 'asc' },
    });
    if (existing) return { status: 'existing', appointment: summarize(existing) };

    const { availableSlots } = await deps.appointments.getAvailableSlots(
      { doctorId: visit.doctorId, date, calendar: 'SCHEDULED' },
      branchId,
    );
    for (const slot of availableSlots.slice(0, MAX_SLOT_ATTEMPTS)) {
      try {
        const booked = await deps.appointments.create(
          {
            patientId: visit.patientId,
            doctorId: visit.doctorId,
            date,
            slot,
            visitType: VisitType.OPD,
            source: 'review',
            notes: `Review after visit on ${istClock(now).date}`,
            calendar: 'SCHEDULED',
          },
          branchId,
          callerUserId,
        );
        return { status: 'booked', appointment: summarize(booked) };
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    return { status: 'full', date };
  } catch (error) {
    logger.error(`Review booking failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    return { status: 'failed' };
  }
}
