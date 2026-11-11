import { AppointmentStatus, VisitType } from '@prisma/client';
import {
  appointmentStart,
  billTypeOf,
  billingSummary,
  hadEarlierVisit,
  invoicesByAppointment,
  type LinkedInvoice,
} from './appointment-billing';

const invoice = (id: string, total: number, received: number, link: { appointmentId?: string; visitId?: string } = {}): LinkedInvoice => ({
  id,
  invoiceNo: `INV-${id}`,
  appointmentId: link.appointmentId ?? null,
  visitId: link.visitId ?? null,
  total,
  received,
  balance: Math.max(0, total - received),
});

describe('billTypeOf', () => {
  it.each([
    [VisitType.OPD, false, 'FIRST_CONSULTATION'],
    [VisitType.OPD, true, 'REVIEW'],
    [VisitType.TELEMED, false, 'FIRST_CONSULTATION'],
    [VisitType.TELEMED, true, 'REVIEW'],
    [VisitType.PROCEDURE, false, 'PROCEDURE'],
    [VisitType.PROCEDURE, true, 'PROCEDURE'],
  ])('%s with an earlier visit %s is %s', (visitType, earlier, expected) => {
    expect(billTypeOf(visitType, earlier)).toBe(expected);
  });
});

describe('hadEarlierVisit', () => {
  const start = appointmentStart('2026-11-11', '10:30-10:45');

  it('reads the slot start in clinic time', () => {
    expect(start.toISOString()).toBe('2026-11-11T05:00:00.000Z');
  });

  it('counts a visit from an earlier day or earlier the same day, and not the appointment’s own visit or a later one', () => {
    expect(hadEarlierVisit('a1', start, [])).toBe(false);
    expect(hadEarlierVisit('a1', start, [{ appointmentId: 'a1', createdAt: new Date('2026-11-11T04:00:00Z') }])).toBe(false);
    expect(hadEarlierVisit('a1', start, [{ appointmentId: null, createdAt: new Date('2026-11-11T05:30:00Z') }])).toBe(false);
    expect(hadEarlierVisit('a1', start, [{ appointmentId: 'old', createdAt: new Date('2026-10-01T06:00:00Z') }])).toBe(true);
    expect(hadEarlierVisit('a1', start, [{ appointmentId: null, createdAt: new Date('2026-11-11T03:00:00Z') }])).toBe(true);
  });
});

describe('invoicesByAppointment', () => {
  it('finds a bill by its appointment or through the visit, and gives each bill to one appointment only', () => {
    const rows = invoicesByAppointment(
      [
        { id: 'a1', visitId: 'v1' },
        { id: 'a2', visitId: 'v2' },
        { id: 'a3', visitId: null },
      ],
      [
        invoice('both', 500, 500, { appointmentId: 'a1', visitId: 'v1' }),
        invoice('visit-only', 300, 0, { visitId: 'v1' }),
        invoice('appointment-only', 800, 200, { appointmentId: 'a2' }),
        invoice('named-wins', 100, 0, { appointmentId: 'a3', visitId: 'v2' }),
        invoice('stranger', 999, 0, { appointmentId: 'elsewhere', visitId: 'v-elsewhere' }),
      ],
    );
    expect(Object.fromEntries([...rows].map(([id, list]) => [id, list.map((i) => i.id)]))).toEqual({
      a1: ['both', 'visit-only'],
      a2: ['appointment-only'],
      a3: ['named-wins'],
    });
  });
});

describe('billingSummary', () => {
  it('is Not billed with no attention before the visit ends', () => {
    expect(billingSummary(AppointmentStatus.CONFIRMED, null, [])).toEqual({
      state: 'NOT_BILLED', total: 0, received: 0, due: 0, attention: false, invoices: [],
    });
  });

  it('asks for attention when a completed appointment or visit has no bill', () => {
    expect(billingSummary(AppointmentStatus.COMPLETED, null, []).attention).toBe(true);
    expect(billingSummary(AppointmentStatus.IN_PROGRESS, 'COMPLETED', []).attention).toBe(true);
    expect(billingSummary(AppointmentStatus.NO_SHOW, null, []).attention).toBe(false);
  });

  it('is Due with the remainder when partly paid', () => {
    expect(billingSummary(AppointmentStatus.CONFIRMED, null, [invoice('x', 500, 300)])).toEqual({
      state: 'DUE', total: 500, received: 300, due: 200, attention: true,
      invoices: [{ id: 'x', invoiceNo: 'INV-x', total: 500, received: 300, due: 200 }],
    });
  });

  it('is Paid when every bill is settled', () => {
    expect(billingSummary(AppointmentStatus.COMPLETED, 'COMPLETED', [invoice('x', 500, 500)])).toMatchObject({
      state: 'PAID', total: 500, received: 500, due: 0, attention: false,
    });
  });

  it('sums two bills for one appointment', () => {
    expect(billingSummary(AppointmentStatus.COMPLETED, 'COMPLETED', [invoice('x', 500, 500), invoice('y', 1200.5, 1000.25)])).toMatchObject({
      state: 'DUE', total: 1700.5, received: 1500.25, due: 200.25, attention: true,
    });
  });
});
