import {
  CashCount,
  CollectionBill,
  CollectionCounterSale,
  CollectionReturn,
  buildDailyCollection,
  collectionStatus,
  dailyCollectionSections,
} from '../pharmacy-daily-collection';

const DAY = '2026-11-05';
const at = (time: string) => `${DAY}T${time}:00.000Z`;

const bill = (
  id: string,
  total: number,
  payments: CollectionBill['payments'],
  extra: Partial<CollectionBill> = {},
): CollectionBill => ({
  id,
  number: `PHI-2026-${id}`,
  day: DAY,
  entryAt: at('04:00'),
  state: 'FINAL',
  customer: 'Meera Shah',
  total,
  payments,
  ...extra,
});
const paid = (mode: string, amount: number, day = DAY) => ({
  mode,
  amount,
  day,
});

const bills: CollectionBill[] = [
  bill('101', 500, [paid('CASH', 500)]),
  bill('102', 1200, [paid('UPI', 1000)]), // 200 still due
  bill('103', 800, [paid('CARD', 300), paid('CASH', 500)]),
  bill('090', 650, [paid('CASH', 650)], { day: '2026-11-03' }), // an older bill settled today
  bill('104', 300, [paid('CASH', 300)], { state: 'CANCELLED' }), // money taken, bill cancelled
];
const counterSales: CollectionCounterSale[] = [
  {
    id: 'cs1',
    number: 'CS-1',
    day: DAY,
    entryAt: at('06:00'),
    customer: 'Walk-in',
    total: 240,
    mode: 'CASH',
  },
  {
    id: 'cs2',
    number: 'CS-2',
    day: DAY,
    entryAt: at('07:00'),
    customer: 'Walk-in',
    total: 150,
    mode: 'CREDIT',
  },
];
const returns: CollectionReturn[] = [
  {
    id: 'r1',
    number: 'RET-1',
    day: DAY,
    entryAt: at('08:00'),
    customer: 'Meera Shah',
    total: 100,
    refundMode: 'CASH',
  },
  {
    id: 'r2',
    number: 'RET-2',
    day: DAY,
    entryAt: at('09:00'),
    customer: 'Ravi',
    total: 60,
    refundMode: 'CREDIT',
  },
];
const count = (sequence: number, counted: CashCount['counted']): CashCount => ({
  id: `c${sequence}`,
  sequence,
  counted,
  note: null,
  countedBy: { id: 'u', name: 'Asha Rao' },
  countedAt: at('13:00'),
});

describe('daily collection', () => {
  const collection = buildDailyCollection({
    day: DAY,
    bills,
    counterSales,
    returns,
    history: [],
  });
  const mode = (m: string) => collection.modes.find((line) => line.mode === m)!;

  it('splits what came in by payment mode: today’s bills, earlier bills, counter sales and refunds', () => {
    expect(mode('CASH')).toMatchObject({
      onTodaysBills: 1000,
      onEarlierBills: 950,
      counterSales: 240,
      refunds: 100,
      expected: 2090,
    });
    expect(mode('UPI')).toMatchObject({ onTodaysBills: 1000, expected: 1000 });
    expect(mode('CARD')).toMatchObject({ onTodaysBills: 300, expected: 300 });
    expect(collection.expectedTotal).toBe(3390);
  });

  it('reconciles bills raised: billed = collected against them + still due', () => {
    const b = collection.billing;
    expect(b).toMatchObject({
      billCount: 3,
      billed: 2500,
      collectedOnTodaysBills: 2300,
      dueAtDayEnd: 200,
      paidAboveBill: 0,
    });
    expect(b.collectedOnTodaysBills + b.dueAtDayEnd - b.paidAboveBill).toBe(
      b.billed,
    );
    expect(b).toMatchObject({
      counterSales: 390,
      counterSalesOnCredit: 150,
      totalBilled: 2890,
    });
  });

  it('moves no money for store-credit refunds or credit counter sales, and says so', () => {
    expect(collection.refunds).toEqual({
      count: 2,
      paidOut: 100,
      storeCredit: 60,
    });
    expect(collection.modes.map((line) => line.mode)).not.toContain('OTHER');
  });

  it('counts money received on a bill that is not final where it came in, and flags it', () => {
    expect(collection.outsideBills).toEqual({ count: 1, amount: 300 });
  });

  it('always offers Cash, UPI and Card to count, even on a quiet day', () => {
    const quiet = buildDailyCollection({
      day: DAY,
      bills: [],
      counterSales: [],
      returns: [],
      history: [],
    });
    expect(quiet.modes.map((line) => line.mode)).toEqual([
      'CASH',
      'UPI',
      'CARD',
    ]);
    expect(quiet.status).toBe('NOT_COUNTED');
  });

  it('ignores payments dated other days, and payments made after the day when working out what was due', () => {
    const later = buildDailyCollection({
      day: DAY,
      bills: [
        bill('200', 400, [paid('CASH', 100), paid('CASH', 300, '2026-11-06')]),
      ],
      counterSales: [],
      returns: [],
      history: [],
    });
    expect(later.expectedTotal).toBe(100);
    expect(later.billing.dueAtDayEnd).toBe(300);
  });

  it('compares the latest count with what was expected, per mode and in total', () => {
    const counted = buildDailyCollection({
      day: DAY,
      bills,
      counterSales,
      returns,
      history: [
        count(1, { CASH: 2000, UPI: 1000, CARD: 300 }),
        count(2, { CASH: 2050, UPI: 1000, CARD: 300 }),
      ],
    });
    expect(counted.count!.sequence).toBe(2);
    expect(counted.history.map((c) => c.sequence)).toEqual([2, 1]);
    expect(mode('CASH').expected).toBe(2090);
    expect(counted.modes.find((line) => line.mode === 'CASH')).toMatchObject({
      counted: 2050,
      difference: -40,
    });
    expect(counted).toMatchObject({
      countedTotal: 3350,
      difference: -40,
      status: 'SHORT',
    });
  });

  it('calls a day balanced only to the paisa', () => {
    expect(collectionStatus(0)).toBe('BALANCED');
    expect(collectionStatus(0.004)).toBe('BALANCED');
    expect(collectionStatus(-0.01)).toBe('SHORT');
    expect(collectionStatus(5)).toBe('OVER');
    expect(collectionStatus(null)).toBe('NOT_COUNTED');
  });

  it('shows a counted mode with no expected money, so a stray card slip is not lost', () => {
    const odd = buildDailyCollection({
      day: DAY,
      bills: [],
      counterSales: [],
      returns: [],
      history: [count(1, { WALLET: 50 })],
    });
    expect(odd.modes.find((line) => line.mode === 'WALLET')).toMatchObject({
      expected: 0,
      counted: 50,
      difference: 50,
    });
    expect(odd.status).toBe('OVER');
  });

  it('lays the same figures out as table sections whose totals equal the collection', () => {
    const counted = buildDailyCollection({
      day: DAY,
      bills,
      counterSales,
      returns,
      history: [count(1, { CASH: 2090, UPI: 1000, CARD: 300 })],
    });
    const { sections, tiles } = dailyCollectionSections(counted, {
      bills,
      counterSales,
      returns,
    });
    const modes = sections.find((s) => s.id === 'modes')!;
    expect(modes.totals).toMatchObject({
      mode: 'Total',
      expected: 3390,
      counted: 3390,
      difference: 0,
    });
    expect(tiles.find((t) => t.label === 'Difference')).toMatchObject({
      value: 0,
      tone: 'good',
    });
    const documents = sections.find((s) => s.id === 'documents')!;
    expect(documents.rows.map((r) => r.cells.number)).toEqual([
      'PHI-2026-101',
      'PHI-2026-102',
      'PHI-2026-103',
      'PHI-2026-090',
      'PHI-2026-104',
      'CS-1',
      'CS-2',
      'RET-1',
      'RET-2',
    ]);
    // Received today in the document list equals the money expected in hand, so the two tables agree.
    expect(documents.totals!.paidToday).toBe(counted.expectedTotal);
  });

  it('takes a refund of a revised bill out of the day it was handed back, in its mode', () => {
    const monday = '2026-11-04';
    // Paid 200 cash on Monday; the discount was edited to 150 and 50 handed back in cash today.
    const revised = bill('050', 150, [paid('CASH', 200, monday), paid('CASH', -50)], { day: monday });
    // Paid 200 by UPI today, revised to 180 and 20 refunded by UPI the same day.
    const sameDay = bill('105', 180, [paid('UPI', 200), paid('UPI', -20)]);
    const today = buildDailyCollection({ day: DAY, bills: [revised, sameDay], counterSales: [], returns: [], history: [] });
    const line = (m: string) => today.modes.find((entry) => entry.mode === m)!;
    expect([line('CASH'), line('UPI')].map((entry) => [entry.onTodaysBills, entry.onEarlierBills, entry.refunds, entry.expected])).toEqual([
      [0, 0, 50, -50],
      [200, 0, 20, 180],
    ]);
    expect([today.expectedTotal, today.refunds, today.billing.collectedOnTodaysBills, today.billing.paidAboveBill, today.billing.dueAtDayEnd]).toEqual([
      130,
      { count: 2, paidOut: 70, storeCredit: 0 },
      180,
      0,
      0,
    ]);
    const onMonday = buildDailyCollection({ day: monday, bills: [revised], counterSales: [], returns: [], history: [] });
    expect([onMonday.expectedTotal, onMonday.billing.paidAboveBill]).toEqual([200, 50]);

    const documents = dailyCollectionSections(today, { bills: [revised, sameDay], counterSales: [], returns: [] }).sections.find((s) => s.id === 'documents')!;
    expect(documents.rows.map((r) => [r.cells.number, r.cells.paidToday, r.cells.modes])).toEqual([
      ['PHI-2026-050', -50, 'Refund · Cash'],
      ['PHI-2026-105', 180, 'UPI, Refund · UPI'],
    ]);
    expect(documents.totals!.paidToday).toBe(today.expectedTotal);
  });

  it('hides the Counted and Difference columns until someone counts', () => {
    const { sections, tiles } = dailyCollectionSections(collection, {
      bills,
      counterSales,
      returns,
    });
    expect(sections[0].columns.map((c) => c.key)).not.toContain('counted');
    expect(tiles.find((t) => t.label === 'Difference')!.value).toBe(
      'Not counted',
    );
  });
});
