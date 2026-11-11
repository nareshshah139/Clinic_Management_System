import { money } from './gst-slabs';
import { entryStamp } from './pharmacy-gst-reports';
import {
  COLLECTION_MODES,
  CORE_MODES,
  MODE_LABEL,
  collectionMode,
  type CollectionMode,
  type DailyCollection,
} from './pharmacy-daily-collection';
import { ReportRow, ReportSection, section } from './pharmacy-report-table';

/**
 * CR-17's Daily Collection is the clinic's whole daily take: consultation and procedure bills
 * (clinic invoices and their payments) beside the pharmacy's collection. The pharmacy cash count
 * stays a reconciliation of the pharmacy drawer only.
 */
export type ClinicBill = {
  id: string;
  number: string;
  /** Clinic day the bill was raised. */
  day: string;
  entryAt: string;
  customer: string | null;
  total: number;
  cancelled: boolean;
  /** Receipts are positive; refunds are negative entries. */
  payments: { mode: string; amount: number; day: string }[];
};

export type ClinicModeLine = { mode: CollectionMode; label: string; received: number; refunds: number; net: number };

export type ClinicCollection = {
  day: string;
  modes: ClinicModeLine[];
  billCount: number;
  billed: number;
  collectedOnTodaysBills: number;
  dueAtDayEnd: number;
  received: number;
  refunds: number;
  net: number;
};

/**
 * @cc [owner:nareshshah139,label:calculation] clinic-daily-collection
 * Billed MUST be the clinic bills raised that day and not cancelled. Received and refunds MUST be
 * the payments and refunds dated that day, in their mode, whichever day their bill is from; net is
 * received less refunds. Due MUST be what those bills still owe at the end of the day.
 */
export function buildClinicCollection(day: string, bills: ClinicBill[]): ClinicCollection {
  const received: Partial<Record<CollectionMode, number>> = {};
  const refunds: Partial<Record<CollectionMode, number>> = {};
  for (const bill of bills)
    for (const payment of bill.payments) {
      if (payment.day !== day) continue;
      const mode = collectionMode(payment.mode);
      const target = payment.amount < 0 ? refunds : received;
      target[mode] = money((target[mode] ?? 0) + Math.abs(payment.amount));
    }
  const todays = bills.filter((bill) => bill.day === day && !bill.cancelled);
  let collectedOnTodaysBills = 0;
  let dueAtDayEnd = 0;
  for (const bill of todays) {
    const paid = money(bill.payments.filter((p) => p.day <= day).reduce((sum, p) => sum + p.amount, 0));
    collectedOnTodaysBills = money(collectedOnTodaysBills + paid);
    dueAtDayEnd = money(dueAtDayEnd + Math.max(0, money(bill.total - paid)));
  }
  const modes = COLLECTION_MODES.filter((mode) => CORE_MODES.includes(mode) || received[mode] || refunds[mode]).map((mode) => ({
    mode,
    label: MODE_LABEL[mode],
    received: received[mode] ?? 0,
    refunds: refunds[mode] ?? 0,
    net: money((received[mode] ?? 0) - (refunds[mode] ?? 0)),
  }));
  const sum = (key: 'received' | 'refunds' | 'net') => money(modes.reduce((total, line) => total + line[key], 0));
  return {
    day,
    modes,
    billCount: todays.length,
    billed: money(todays.reduce((total, bill) => total + bill.total, 0)),
    collectedOnTodaysBills,
    dueAtDayEnd,
    received: sum('received'),
    refunds: sum('refunds'),
    net: sum('net'),
  };
}

export type WholeDayLine = { mode: CollectionMode; label: string; clinic: number; pharmacy: number; total: number };
export type WholeDay = { modes: WholeDayLine[]; clinic: number; pharmacy: number; total: number };

/** The day's money by mode: the clinic's net receipts plus what the pharmacy expects in hand. */
export function buildWholeDay(clinic: ClinicCollection, pharmacy: DailyCollection): WholeDay {
  const clinicBy = new Map(clinic.modes.map((line) => [line.mode, line.net]));
  const pharmacyBy = new Map(pharmacy.modes.map((line) => [line.mode, line.expected]));
  const modes = COLLECTION_MODES.filter((mode) => clinicBy.has(mode) || pharmacyBy.has(mode)).map((mode) => {
    const c = clinicBy.get(mode) ?? 0;
    const p = pharmacyBy.get(mode) ?? 0;
    return { mode, label: MODE_LABEL[mode], clinic: c, pharmacy: p, total: money(c + p) };
  });
  return { modes, clinic: clinic.net, pharmacy: pharmacy.expectedTotal, total: money(clinic.net + pharmacy.expectedTotal) };
}

export function clinicCollectionSections(
  clinic: ClinicCollection,
  whole: WholeDay,
  bills: ClinicBill[],
): ReportSection[] {
  const day = clinic.day;
  const billRows: ReportRow[] = bills
    .filter((bill) => (bill.day === day && !bill.cancelled) || bill.payments.some((p) => p.day === day))
    .sort((a, b) => a.entryAt.localeCompare(b.entryAt))
    .map((bill) => {
      const today = bill.payments.filter((p) => p.day === day);
      const paid = money(bill.payments.filter((p) => p.day <= day).reduce((sum, p) => sum + p.amount, 0));
      const raisedToday = bill.day === day && !bill.cancelled;
      return {
        key: `clinic:${bill.id}`,
        tone: bill.cancelled ? ('muted' as const) : undefined,
        cells: {
          number: bill.number,
          type: bill.cancelled ? 'Bill (cancelled)' : raisedToday ? 'Bill' : `Bill of ${bill.day.split('-').reverse().join('/')}`,
          entryAt: entryStamp(bill.entryAt),
          customer: bill.customer,
          amount: raisedToday ? bill.total : 0,
          paidToday: money(today.reduce((sum, p) => sum + p.amount, 0)),
          modes:
            Array.from(new Set(today.map((p) => `${p.amount < 0 ? 'Refund · ' : ''}${MODE_LABEL[collectionMode(p.mode)]}`))).join(', ') || '—',
          due: raisedToday ? Math.max(0, money(bill.total - paid)) : 0,
        },
      };
    });
  return [
      section({
        id: 'whole-day',
        title: 'Whole day by payment mode',
        columns: [
          { key: 'mode', label: 'Payment mode', kind: 'text', frozen: true },
          { key: 'clinic', label: 'Clinic', kind: 'money' },
          { key: 'pharmacy', label: 'Pharmacy', kind: 'money' },
          { key: 'total', label: 'Total', kind: 'money' },
        ],
        rows: whole.modes.map((line) => ({ key: line.mode, cells: { mode: line.label, clinic: line.clinic, pharmacy: line.pharmacy, total: line.total } })),
      }),
      section({
        id: 'clinic-modes',
        title: 'Clinic: consultations and procedures by payment mode',
        columns: [
          { key: 'mode', label: 'Payment mode', kind: 'text', frozen: true },
          { key: 'received', label: 'Received', kind: 'money' },
          { key: 'refunds', label: 'Refunds', kind: 'money' },
          { key: 'net', label: 'Net', kind: 'money' },
        ],
        rows: clinic.modes.map((line) => ({ key: line.mode, cells: { mode: line.label, received: line.received, refunds: line.refunds, net: line.net } })),
      }),
      section({
        id: 'clinic-bills',
        title: 'Clinic bills',
        columns: [
          { key: 'number', label: 'Bill No.', kind: 'text', frozen: true },
          { key: 'type', label: 'Type', kind: 'text' },
          { key: 'entryAt', label: 'Entry', kind: 'text' },
          { key: 'customer', label: 'Patient', kind: 'text' },
          { key: 'amount', label: 'Amount', kind: 'money' },
          { key: 'paidToday', label: 'Received today', kind: 'money' },
          { key: 'modes', label: 'Paid by', kind: 'text' },
          { key: 'due', label: 'Due', kind: 'money' },
        ],
        rows: billRows,
        emptyText: 'No consultation or procedure bills were raised or paid on this day.',
      }),
  ];
}
