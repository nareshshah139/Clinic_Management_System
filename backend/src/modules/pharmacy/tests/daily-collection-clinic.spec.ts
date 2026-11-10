import { buildClinicCollection, buildWholeDay, clinicCollectionSections, type ClinicBill } from '../daily-collection-clinic';
import { buildDailyCollection } from '../pharmacy-daily-collection';

const DAY = '2026-11-11';
const bill = (id: string, day: string, total: number, payments: ClinicBill['payments'], cancelled = false): ClinicBill => ({
  id, number: `INV-${id}`, day, entryAt: `${day}T04:00:00.000Z`, customer: `Patient ${id}`, total, cancelled, payments,
});

const bills: ClinicBill[] = [
  bill('first', DAY, 500, [{ mode: 'CASH', amount: 500, day: DAY }]),
  bill('partly', DAY, 800, [{ mode: 'UPI', amount: 300, day: DAY }]),
  bill('earlier', '2026-11-10', 1200, [
    { mode: 'CARD', amount: 200, day: '2026-11-10' },
    { mode: 'CARD', amount: 1000, day: DAY },
  ]),
  bill('refunded', '2026-11-09', 400, [
    { mode: 'CASH', amount: 400, day: '2026-11-09' },
    { mode: 'CASH', amount: -100, day: DAY },
  ]),
  bill('loan', DAY, 600, [{ mode: 'BNPL', amount: 600, day: DAY }]),
  bill('cancelled', DAY, 900, [], true),
  bill('tomorrow', '2026-11-12', 700, [{ mode: 'CASH', amount: 700, day: '2026-11-12' }]),
];

describe('buildClinicCollection', () => {
  it('counts the day’s receipts and refunds by mode, and the bills raised that day', () => {
    const clinic = buildClinicCollection(DAY, bills);
    expect(clinic.modes.map((m) => [m.label, m.received, m.refunds, m.net])).toEqual([
      ['Cash', 500, 100, 400],
      ['UPI', 300, 0, 300],
      ['Card', 1000, 0, 1000],
      ['Other', 600, 0, 600],
    ]);
    expect([clinic.billCount, clinic.billed, clinic.collectedOnTodaysBills, clinic.dueAtDayEnd]).toEqual([3, 1900, 1400, 500]);
    expect([clinic.received, clinic.refunds, clinic.net]).toEqual([2400, 100, 2300]);
  });

  it('shows Cash, UPI and Card even on a day with no clinic money', () => {
    expect(buildClinicCollection(DAY, []).modes.map((m) => [m.label, m.net])).toEqual([['Cash', 0], ['UPI', 0], ['Card', 0]]);
  });
});

describe('buildWholeDay', () => {
  it('adds the clinic’s net receipts to what the pharmacy expects in hand, mode by mode', () => {
    const pharmacy = buildDailyCollection({
      day: DAY,
      bills: [{ id: 'p1', number: 'PH-1', day: DAY, entryAt: `${DAY}T05:00:00.000Z`, state: 'FINAL', customer: null, total: 224, payments: [{ mode: 'CASH', amount: 224, day: DAY }] }],
      counterSales: [{ id: 'c1', number: 'CS-1', day: DAY, entryAt: `${DAY}T06:00:00.000Z`, customer: null, total: 112, mode: 'UPI' }],
      returns: [],
      history: [],
    });
    const whole = buildWholeDay(buildClinicCollection(DAY, bills), pharmacy);
    expect(whole.modes.map((m) => [m.label, m.clinic, m.pharmacy, m.total])).toEqual([
      ['Cash', 400, 224, 624],
      ['UPI', 300, 112, 412],
      ['Card', 1000, 0, 1000],
      ['Other', 600, 0, 600],
    ]);
    expect([whole.clinic, whole.pharmacy, whole.total]).toEqual([2300, 336, 2636]);
  });
});

describe('clinicCollectionSections', () => {
  it('lists the day’s clinic bills with what was received on them and what is still due', () => {
    const clinic = buildClinicCollection(DAY, bills);
    const sections = clinicCollectionSections(clinic, buildWholeDay(clinic, buildDailyCollection({ day: DAY, bills: [], counterSales: [], returns: [], history: [] })), bills);
    expect(sections.map((s) => s.title)).toEqual(['Whole day by payment mode', 'Clinic: consultations and procedures by payment mode', 'Clinic bills']);
    const rows = sections[2].rows.map((r) => [r.cells.number, r.cells.type, r.cells.amount, r.cells.paidToday, r.cells.modes, r.cells.due]);
    expect(rows).toEqual([
      ['INV-refunded', 'Bill of 09/11/2026', 0, -100, 'Refund · Cash', 0],
      ['INV-earlier', 'Bill of 10/11/2026', 0, 1000, 'Card', 0],
      ['INV-first', 'Bill', 500, 500, 'Cash', 0],
      ['INV-partly', 'Bill', 800, 300, 'UPI', 500],
      ['INV-loan', 'Bill', 600, 600, 'Other', 0],
    ]);
    expect(sections[0].totals).toMatchObject({ mode: 'Total', clinic: 2300, pharmacy: 0, total: 2300 });
  });
});
