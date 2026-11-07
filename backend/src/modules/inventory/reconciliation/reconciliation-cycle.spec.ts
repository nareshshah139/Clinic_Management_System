import { cycleOn, forecast, parseReconciliationInput, planDay, readReconciliation, type PlanBatch, type ReconciliationSettings } from './reconciliation-cycle';

const settings = (overrides: Partial<ReconciliationSettings> = {}): ReconciliationSettings => ({
  enabled: true,
  cycleDays: 10,
  itemsPerPersonPerDay: 10,
  assigneeIds: ['anil', 'meera'],
  cycleStart: '2026-11-01',
  ...overrides,
});
const batch = (n: number, lastCountedAt: string | null = null): PlanBatch => ({ id: `b${String(n).padStart(2, '0')}`, name: `Item ${String(n).padStart(2, '0')}`, lastCountedAt });
const sixty = Array.from({ length: 60 }, (_, i) => batch(i + 1));

describe('reconciliation settings', () => {
  it('reads the old daily count as one counter with the same batches per day', () => {
    expect(readReconciliation({ auditEnabled: true, auditDailyCount: 15, ownerId: 'owner-1' }, '2026-11-06')).toEqual({
      enabled: true, cycleDays: 10, itemsPerPersonPerDay: 15, assigneeIds: ['owner-1'], cycleStart: '2026-11-06',
    });
    expect(readReconciliation({ auditEnabled: false, auditDailyCount: 900, ownerId: 'owner-1' }, '2026-11-06')).toEqual({
      enabled: false, cycleDays: 10, itemsPerPersonPerDay: 200, assigneeIds: [], cycleStart: '2026-11-06',
    });
  });

  it('prefers saved cycle settings over the old fields and repairs out-of-range values', () => {
    expect(readReconciliation({ auditEnabled: true, auditDailyCount: 15, reconciliation: { enabled: true, cycleDays: 0, itemsPerPersonPerDay: 12, assigneeIds: ['a', 'a', ' b '], cycleStart: '2026-10-30' } }, '2026-11-06')).toEqual({
      enabled: true, cycleDays: 10, itemsPerPersonPerDay: 12, assigneeIds: ['a', 'b'], cycleStart: '2026-10-30',
    });
  });

  it('restarts the cycle today when turned on or when its length changes, and keeps it otherwise', () => {
    const off = settings({ enabled: false, cycleStart: '2026-10-01' });
    expect(parseReconciliationInput({ enabled: true }, off, '2026-11-06').cycleStart).toBe('2026-11-06');
    expect(parseReconciliationInput({ cycleDays: 7 }, settings(), '2026-11-06').cycleStart).toBe('2026-11-06');
    expect(parseReconciliationInput({ itemsPerPersonPerDay: 20 }, settings(), '2026-11-06')).toEqual({ ...settings(), itemsPerPersonPerDay: 20 });
  });

  it.each([
    [{ cycleDays: 61 }, 'Cycle length must be a whole number of days from 1 to 60'],
    [{ cycleDays: 2.5 }, 'Cycle length must be a whole number of days from 1 to 60'],
    [{ itemsPerPersonPerDay: 0 }, 'Items per person per day must be a whole number from 1 to 200'],
    [{ assigneeIds: [] }, 'Choose at least one person to count before turning reconciliation on'],
  ])('refuses %j', (input, message) => {
    expect(() => parseReconciliationInput(input, settings(), '2026-11-06')).toThrow(message);
  });
});

describe('reconciliation cycle', () => {
  it('numbers the days of a 10-day cycle and starts the next on day 11', () => {
    expect(cycleOn(settings(), '2026-11-01')).toEqual({ start: '2026-11-01', end: '2026-11-10', day: 1, days: 10, daysLeft: 10 });
    expect(cycleOn(settings(), '2026-11-10')).toEqual({ start: '2026-11-01', end: '2026-11-10', day: 10, days: 10, daysLeft: 1 });
    expect(cycleOn(settings(), '2026-11-11')).toEqual({ start: '2026-11-11', end: '2026-11-20', day: 1, days: 10, daysLeft: 10 });
  });

  it('works across a month end and before the anchor day', () => {
    expect(cycleOn(settings({ cycleStart: '2026-10-25' }), '2026-11-06')).toEqual({ start: '2026-11-04', end: '2026-11-13', day: 3, days: 10, daysLeft: 8 });
    expect(cycleOn(settings({ cycleStart: '2026-11-10' }), '2026-11-06')).toEqual({ start: '2026-10-31', end: '2026-11-09', day: 7, days: 10, daysLeft: 4 });
  });
});

describe('daily plan', () => {
  const run = (today: string, covered: string[], reserved: string[] = [], plannedToday: string[] = [], overrides: Partial<ReconciliationSettings> = {}) =>
    planDay({ settings: settings(overrides), today, batches: sixty, covered: new Set(covered), reserved: new Set(reserved), plannedToday: new Set(plannedToday) });

  it('deals round-robin so the two counters get alternate batches', () => {
    const plan = run('2026-11-01', []);
    expect(plan.assignments.map((a) => [a.assigneeId, a.requestKey, a.batchIds.slice(0, 3)])).toEqual([
      ['anil', 'cycle:2026-11-01:2026-11-01:anil', ['b01', 'b03', 'b05']],
      ['meera', 'cycle:2026-11-01:2026-11-01:meera', ['b02', 'b04', 'b06']],
    ]);
    expect(plan.assignments.map((a) => a.batchIds.length)).toEqual([10, 10]);
  });

  it('covers 60 batches in three days with disjoint daily lists', () => {
    const covered: string[] = [];
    const daily: string[][] = [];
    for (const today of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
      const ids = run(today, covered).assignments.flatMap((a) => a.batchIds);
      daily.push(ids);
      covered.push(...ids);
    }
    expect(daily.map((ids) => ids.length)).toEqual([20, 20, 20, 0]);
    expect(new Set(covered).size).toBe(60);
    expect(daily[1].slice(0, 2)).toEqual(['b21', 'b23']);
  });

  it('adds nothing on a rerun the same day and never re-deals batches on an open count', () => {
    const first = run('2026-11-01', []);
    const reserved = first.assignments.flatMap((a) => a.batchIds);
    expect(run('2026-11-01', [], reserved, ['anil', 'meera']).assignments).toEqual([]);
    const late = run('2026-11-01', [], reserved.filter((id) => first.assignments[0].batchIds.includes(id)), ['anil'], {});
    expect(late.assignments).toEqual([{ assigneeId: 'meera', requestKey: 'cycle:2026-11-01:2026-11-01:meera', batchIds: ['b02', 'b04', 'b06', 'b08', 'b10', 'b12', 'b14', 'b16', 'b18', 'b20'] }]);
  });

  it('starts over on day 11: everything is uncovered for the new cycle', () => {
    const plan = planDay({ settings: settings(), today: '2026-11-11', batches: [batch(1, '2026-11-02T10:00:00.000Z'), batch(2, null), batch(3, '2026-11-01T09:00:00.000Z')], covered: new Set(), reserved: new Set(), plannedToday: new Set() });
    expect(plan.cycle.start).toBe('2026-11-11');
    expect(plan.assignments.map((a) => [a.requestKey, a.batchIds])).toEqual([
      ['cycle:2026-11-11:2026-11-11:anil', ['b02', 'b01']],
      ['cycle:2026-11-11:2026-11-11:meera', ['b03']],
    ]);
  });

  it('never deals more than the daily setting and nothing while switched off', () => {
    expect(run('2026-11-01', [], [], [], { itemsPerPersonPerDay: 3 }).assignments.map((a) => a.batchIds)).toEqual([['b01', 'b03', 'b05'], ['b02', 'b04', 'b06']]);
    expect(run('2026-11-01', [], [], [], { enabled: false }).assignments).toEqual([]);
  });
});

describe('coverage forecast', () => {
  const cycle = cycleOn(settings(), '2026-11-01');

  it('says plainly when capacity falls short', () => {
    expect(forecast(settings(), cycle, 340, 0)).toEqual({
      batches: 340, covered: 0, remaining: 340, people: 2, perDay: 10, capacity: 200, short: true, behind: true,
      message: 'At 10 per person per day with 2 people, a 10-day cycle covers 200 of 340 batches in stock. Raise items per day to 17 or add 2 people.',
    });
    expect(forecast(settings({ assigneeIds: ['anil'] }), cycle, 150, 0).message).toBe(
      'At 10 per person per day with 1 person, a 10-day cycle covers 100 of 150 batches in stock. Raise items per day to 15 or add a person.',
    );
    expect(forecast(settings({ assigneeIds: ['anil'], cycleDays: 1 }), cycleOn(settings({ cycleDays: 1 }), '2026-11-01'), 450, 0).message).toBe(
      'At 10 per person per day with 1 person, a 1-day cycle covers 10 of 450 batches in stock. Add 44 people or lengthen the cycle.',
    );
  });

  it('confirms full coverage and flags a cycle that has fallen behind', () => {
    expect(forecast(settings(), cycle, 60, 0)).toMatchObject({ short: false, behind: false, message: 'At 10 per person per day with 2 people, a 10-day cycle covers all 60 batches in stock.' });
    expect(forecast(settings(), cycleOn(settings(), '2026-11-10'), 60, 30)).toMatchObject({ remaining: 30, short: false, behind: true });
    expect(forecast(settings({ assigneeIds: [] }), cycle, 60, 0).message).toBe('Choose who counts to start the cycle.');
  });
});
