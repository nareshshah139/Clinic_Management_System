import { reportRange } from '../report-range';

const iso = ({ instants, period }: ReturnType<typeof reportRange>) => [instants.gte.toISOString(), instants.lt.toISOString(), period];
/** 00:30 on 12 Nov in the clinic, still 11 Nov in UTC. */
const now = new Date('2026-11-11T19:00:00.000Z');

describe('reportRange', () => {
  it('reads a date-only range as whole clinic days, so today ends at midnight in the clinic', () => {
    expect(iso(reportRange({ startDate: '2026-10-12', endDate: '2026-11-11' }, now))).toEqual([
      '2026-10-11T18:30:00.000Z', '2026-11-11T18:30:00.000Z', '2026-10-12 to 2026-11-11',
    ]);
  });

  it('keeps timestamp bounds as the instants they name', () => {
    expect(iso(reportRange({ startDate: '2026-11-10T00:00:00.000Z', endDate: '2026-11-11T05:00:00.000Z' }, now))).toEqual([
      '2026-11-10T00:00:00.000Z', '2026-11-11T05:00:00.001Z', '2026-11-10 to 2026-11-11',
    ]);
  });

  it('counts periods in clinic days whatever the server clock says', () => {
    const periods = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', undefined] as const;
    expect(periods.map((period) => reportRange({ period }, now).period)).toEqual([
      '2026-11-12 to 2026-11-12',
      '2026-11-08 to 2026-11-14',
      '2026-11-01 to 2026-11-30',
      '2026-10-01 to 2026-12-31',
      '2026-01-01 to 2026-12-31',
      '2026-10-13 to 2026-11-12',
    ]);
    expect(iso(reportRange({ period: 'DAILY' }, now)).slice(0, 2)).toEqual(['2026-11-11T18:30:00.000Z', '2026-11-12T18:30:00.000Z']);
  });
});
