import { addDays, isDay, rangeError, type DayRange } from '@/lib/date-ranges';
import type { ReportTab } from '@/lib/reports-model';

export const REPORT_TABS: ReportTab[] = ['revenue', 'patients', 'doctors', 'appointments', 'inventory', 'payments'];

export type ReportParams = DayRange & { tab: ReportTab };

export const isCompleteRange = (range: DayRange) => isDay(range.from) && isDay(range.to);

export function readReportParams(search: Pick<URLSearchParams, 'get'>, today: string): ReportParams {
  const tab = REPORT_TABS.find((id) => id === search.get('tab')) ?? 'revenue';
  const range = { from: search.get('from') ?? '', to: search.get('to') ?? '' };
  const valid = isCompleteRange(range) && !rangeError(range);
  return { tab, ...(valid ? range : { from: addDays(today, -30), to: today }) };
}

export function reportsHref({ tab, from, to }: ReportParams): string {
  return `/dashboard/reports?${new URLSearchParams({ tab, from, to })}`;
}
