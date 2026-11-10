import { AppointmentStatus, VisitType } from '@prisma/client';

/**
 * CR-17: what the day calendar shows about an appointment's bill. The bill type is decided here,
 * once, from the visit type and the patient's earlier visits; the money comes from the clinic
 * invoices linked to the appointment directly or through its visit.
 */
export const BILL_TYPE_LABEL = {
  FIRST_CONSULTATION: 'First consultation',
  REVIEW: 'Review',
  PROCEDURE: 'Procedure',
} as const;
export type BillType = keyof typeof BILL_TYPE_LABEL;

/**
 * @cc [owner:nareshshah139,label:product] appointment-bill-type
 * A PROCEDURE appointment MUST be a Procedure bill. Any other appointment MUST be a First
 * consultation when the patient has no earlier visit in the branch, and a Review otherwise.
 */
export function billTypeOf(visitType: VisitType, hasEarlierVisit: boolean): BillType {
  if (visitType === VisitType.PROCEDURE) return 'PROCEDURE';
  return hasEarlierVisit ? 'REVIEW' : 'FIRST_CONSULTATION';
}

export type PriorVisit = { appointmentId: string | null; createdAt: Date };

/** The appointment's start in clinic time (India has no DST, so the offset is fixed). */
export function appointmentStart(day: string, slot: string): Date {
  return new Date(`${day}T${slot.split('-')[0]}:00+05:30`);
}

/** An earlier visit is one of the patient's visits that began before this appointment and is not its own. */
export function hadEarlierVisit(appointmentId: string, start: Date, visits: PriorVisit[]): boolean {
  return visits.some((visit) => visit.appointmentId !== appointmentId && visit.createdAt < start);
}

export type LinkedInvoice = {
  id: string;
  invoiceNo: string;
  appointmentId: string | null;
  visitId: string | null;
  total: number;
  received: number;
  balance: number;
};

/**
 * Each invoice goes to exactly one appointment: the one it names, else the one whose visit it
 * names. So a bill linked both ways, or only one way, is found once and never counted twice.
 */
export function invoicesByAppointment(
  appointments: { id: string; visitId: string | null }[],
  invoices: LinkedInvoice[],
): Map<string, LinkedInvoice[]> {
  const ids = new Set(appointments.map((a) => a.id));
  const byVisit = new Map(appointments.filter((a) => a.visitId).map((a) => [a.visitId as string, a.id]));
  const result = new Map<string, LinkedInvoice[]>(appointments.map((a) => [a.id, []]));
  for (const invoice of invoices) {
    const owner =
      (invoice.appointmentId && ids.has(invoice.appointmentId) ? invoice.appointmentId : null) ??
      (invoice.visitId ? byVisit.get(invoice.visitId) : undefined);
    if (owner) result.get(owner)!.push(invoice);
  }
  return result;
}

export type BillingState = 'NOT_BILLED' | 'DUE' | 'PAID';
export type AppointmentBilling = {
  state: BillingState;
  total: number;
  received: number;
  due: number;
  /** Unpaid money, or a finished visit with no bill: the desk should act before the patient leaves. */
  attention: boolean;
  invoices: { id: string; invoiceNo: string; total: number; received: number; due: number }[];
};

const paise = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * @cc [owner:nareshshah139,label:product;calculation] appointment-billing-summary
 * The row's total, received and due MUST be the sums over its live invoices. It is PAID when it
 * has invoices and nothing is due, DUE when anything is due, NOT_BILLED without invoices. It needs
 * attention when something is due, or when a completed visit has no bill.
 */
export function billingSummary(
  status: AppointmentStatus,
  visitStatus: string | null,
  invoices: LinkedInvoice[],
): AppointmentBilling {
  const total = paise(invoices.reduce((sum, i) => sum + i.total, 0));
  const received = paise(invoices.reduce((sum, i) => sum + i.received, 0));
  const due = paise(invoices.reduce((sum, i) => sum + Math.max(0, i.balance), 0));
  const finished = status === AppointmentStatus.COMPLETED || visitStatus === 'COMPLETED';
  const state: BillingState = invoices.length === 0 ? 'NOT_BILLED' : due > 0 ? 'DUE' : 'PAID';
  return {
    state,
    total,
    received,
    due,
    attention: due > 0 || (state === 'NOT_BILLED' && finished),
    invoices: invoices.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, total: i.total, received: i.received, due: Math.max(0, i.balance) })),
  };
}
