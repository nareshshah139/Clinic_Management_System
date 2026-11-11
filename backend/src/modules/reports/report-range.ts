import { addDays, clinicDay, clinicInstants } from '../pharmacy/register-utils';
import type { ReportPeriod } from './dto/reports.dto';

export type ReportRange = { instants: { gte: Date; lt: Date }; period: string };

/** The clinic days a named period covers on a given clinic day; weeks run Sunday to Saturday. */
function periodDays(period: `${ReportPeriod}` | undefined, today: string): { from: string; to: string } {
  const [year, month] = today.split('-').map(Number);
  const monthEnd = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  switch (period) {
    case 'DAILY':
      return { from: today, to: today };
    case 'WEEKLY': {
      const sunday = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
      return { from: sunday, to: addDays(sunday, 6) };
    }
    case 'MONTHLY':
      return { from: `${today.slice(0, 7)}-01`, to: monthEnd(year, month) };
    case 'QUARTERLY': {
      const first = Math.floor((month - 1) / 3) * 3 + 1;
      return { from: `${year}-${String(first).padStart(2, '0')}-01`, to: monthEnd(year, first + 2) };
    }
    case 'YEARLY':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    default:
      return { from: addDays(today, -30), to: today };
  }
}

/**
 * @cc [owner:nareshshah139,label:calculation] report-range-clinic-days
 * A report range MUST cover whole clinic days in Asia/Kolkata: dates given as days run from 00:00 IST
 * on the first to 00:00 IST after the last; without both dates the named period is counted from the
 * clinic's today, whatever zone the server runs in. Timestamps given as bounds are kept as instants.
 */
export function reportRange(
  query: { startDate?: string; endDate?: string; period?: `${ReportPeriod}` },
  now = new Date(),
): ReportRange {
  const days = query.startDate && query.endDate ? { from: query.startDate, to: query.endDate } : periodDays(query.period, clinicDay(now));
  const { gte, lt } = clinicInstants(days.from, days.to) as { gte: Date; lt: Date };
  return { instants: { gte, lt }, period: `${clinicDay(gte)} to ${clinicDay(new Date(lt.getTime() - 1))}` };
}
