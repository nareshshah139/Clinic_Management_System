import fc from 'fast-check';
import { LEDGER_CHANNELS } from './inventory-timeline';
import {
  LEDGER_KIND,
  LedgerBatch,
  LedgerStep,
  runItemLedger,
} from './inventory-item-ledger';

type Draft = {
  id: string;
  batch: number;
  t: number;
  delta: number;
  dropDelta: boolean;
};

const drafts = fc.uniqueArray(
  fc.record({
    id: fc.stringMatching(/^[a-z0-9]{1,6}$/),
    batch: fc.nat({ max: 3 }),
    t: fc.nat({ max: 20 }),
    delta: fc.integer({ min: -50, max: 50 }).filter((d) => d !== 0),
    dropDelta: fc.boolean(),
  }),
  { selector: (d) => d.id, maxLength: 30 },
);

const at = (t: number) => new Date(Date.UTC(2026, 0, 1) + t * 60_000);
const ordered = (list: Draft[]) =>
  [...list].sort(
    (a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

/** Simulates a consistent recorded history: each batch starts at 0 and every recorded balance follows the prior one. */
function consistent(list: Draft[]) {
  const stock = [0, 0, 0, 0];
  const steps: LedgerStep[] = ordered(list).map((d) => {
    const before = stock[d.batch];
    stock[d.batch] += d.delta;
    return {
      id: d.id,
      batchId: `b${d.batch}`,
      at: at(d.t),
      delta: d.dropDelta ? null : d.delta,
      recordedBefore: before,
      recordedAfter: stock[d.batch],
    };
  });
  const batches: LedgerBatch[] = stock.map((currentStock, i) => ({
    id: `b${i}`,
    currentStock,
  }));
  return { steps, batches };
}

describe('runItemLedger', () => {
  it('maps every ledger channel to a kind', () => {
    for (const channel of Object.keys(LEDGER_CHANNELS))
      expect(['SALE', 'PURCHASE', 'RETURN', 'ADJUSTMENT']).toContain(
        LEDGER_KIND[channel as keyof typeof LEDGER_CHANNELS],
      );
  });

  it('traces stock added outside the ledger to the sale that revealed it', () => {
    const result = runItemLedger(
      [
        { id: 'A', currentStock: 7 },
        { id: 'B', currentStock: 3 },
      ],
      [
        {
          id: '3',
          batchId: 'B',
          at: at(2),
          delta: -2,
          recordedBefore: 5,
          recordedAfter: 3,
        },
        {
          id: '1',
          batchId: 'A',
          at: at(0),
          delta: 10,
          recordedBefore: 0,
          recordedAfter: 10,
        },
        {
          id: '2',
          batchId: 'A',
          at: at(1),
          delta: -3,
          recordedBefore: 10,
          recordedAfter: 7,
        },
      ],
    );
    expect(
      result.rows.map((r) => [
        r.id,
        r.in,
        r.out,
        r.batchClosing,
        r.itemClosing,
        r.chainBreak,
      ]),
    ).toEqual([
      ['1', 10, null, 10, 10, null],
      ['2', null, 3, 7, 7, null],
      ['3', null, 2, 3, 10, { expected: 0, recorded: 5 }],
    ]);
    expect(result).toMatchObject({
      closing: 10,
      currentStock: 10,
      matches: true,
    });
  });

  it('P1: a consistent history has no breaks, matches stock and nets receipts against issues', () => {
    fc.assert(
      fc.property(drafts, (list) => {
        const { steps, batches } = consistent(list);
        const result = runItemLedger(batches, steps);
        const total = batches.reduce((n, b) => n + b.currentStock, 0);
        expect(result.rows.every((r) => r.chainBreak === null)).toBe(true);
        expect(result.batches.every((b) => b.matches === true)).toBe(true);
        expect(result.matches).toBe(true);
        expect(result.closing).toBe(total);
        if (result.rows.length)
          expect(result.rows[result.rows.length - 1].itemClosing).toBe(total);
        const net = result.rows.reduce(
          (n, r) => n + (r.in ?? 0) - (r.out ?? 0),
          0,
        );
        expect(net).toBe(result.closing);
      }),
    );
  });

  it('P2: every row closes the item at the sum of each batch latest closing', () => {
    const arbitrary = fc.array(
      fc.record({
        id: fc.uuid(),
        batch: fc.nat({ max: 3 }),
        t: fc.nat({ max: 20 }),
        delta: fc.option(fc.integer({ min: -50, max: 50 })),
        recordedBefore: fc.option(fc.integer({ min: -20, max: 100 })),
        recordedAfter: fc.option(fc.integer({ min: -20, max: 100 })),
      }),
      { maxLength: 30 },
    );
    fc.assert(
      fc.property(arbitrary, (list) => {
        const batches = [0, 1, 2, 3].map((i) => ({
          id: `b${i}`,
          currentStock: 0,
        }));
        const result = runItemLedger(
          batches,
          list.map((s) => ({ ...s, batchId: `b${s.batch}`, at: at(s.t) })),
        );
        const latest = new Map<string, number | null>(
          batches.map((b) => [b.id, 0]),
        );
        for (const row of result.rows) {
          latest.set(row.batchId, row.batchClosing);
          const values = [...latest.values()];
          if (values.every((v) => v !== null))
            expect(row.itemClosing).toBe(values.reduce((n, v) => n + v, 0));
          else expect(row.itemClosing).toBeNull();
        }
      }),
    );
  });

  it('P3: a stock change outside the ledger shows as exactly one chain break on the next movement', () => {
    const scenario = drafts
      .filter((list) => list.length > 0)
      .chain((list) =>
        fc.record({
          list: fc.constant(list),
          pick: fc.nat({ max: list.length - 1 }),
          d: fc.integer({ min: -30, max: 30 }).filter((d) => d !== 0),
        }),
      );
    fc.assert(
      fc.property(scenario, ({ list, pick, d }) => {
        const { steps, batches } = consistent(list);
        const target = steps[pick];
        const shifted = steps.map((s, i) =>
          s.batchId === target.batchId && i >= pick
            ? {
                ...s,
                recordedBefore: s.recordedBefore! + d,
                recordedAfter: s.recordedAfter! + d,
              }
            : s,
        );
        const adjusted = batches.map((b) =>
          b.id === target.batchId
            ? { ...b, currentStock: b.currentStock + d }
            : b,
        );
        const result = runItemLedger(adjusted, shifted);
        const breaks = result.rows.filter((r) => r.chainBreak);
        expect(breaks.map((r) => r.id)).toEqual([target.id]);
        expect(
          breaks[0].chainBreak!.recorded - breaks[0].chainBreak!.expected,
        ).toBe(d);
        expect(
          result.batches.find((b) => b.batchId === target.batchId)!.matches,
        ).toBe(true);
      }),
    );
  });

  it('P4: the result does not depend on the order movements arrive in', () => {
    const scenario = drafts.chain((list) => {
      const { steps, batches } = consistent(list);
      return fc.record({
        steps: fc.constant(steps),
        batches: fc.constant(batches),
        shuffled: fc.shuffledSubarray(steps, { minLength: steps.length }),
      });
    });
    fc.assert(
      fc.property(scenario, ({ steps, batches, shuffled }) => {
        expect(runItemLedger(batches, shuffled)).toEqual(
          runItemLedger(batches, steps),
        );
      }),
    );
  });

  it('P5: an unknown change with no recorded balance leaves the batch and item closing unknown from then on', () => {
    const scenario = drafts
      .filter((list) => list.some((d) => d.batch === 0))
      .chain((list) =>
        fc.record({
          list: fc.constant(list),
          unknownAt: fc.nat({
            max: list.filter((d) => d.batch === 0).length - 1,
          }),
        }),
      );
    fc.assert(
      fc.property(scenario, ({ list, unknownAt }) => {
        const { steps, batches } = consistent(list);
        const batch0 = steps.filter((s) => s.batchId === 'b0');
        const unknownId = batch0[unknownAt].id;
        const blind = steps.map((s) =>
          s.batchId !== 'b0'
            ? s
            : {
                ...s,
                recordedBefore: null,
                recordedAfter: null,
                delta:
                  s.id === unknownId
                    ? null
                    : s.recordedAfter! - s.recordedBefore!,
              },
        );
        const result = runItemLedger(batches, blind);
        const from = result.rows.findIndex((r) => r.id === unknownId);
        result.rows.forEach((row, i) => {
          if (i < from) return;
          expect(row.itemClosing).toBeNull();
          if (row.batchId === 'b0') expect(row.batchClosing).toBeNull();
        });
        expect(result.batches[0]).toMatchObject({
          closing: null,
          matches: null,
        });
        expect(result).toMatchObject({ closing: null, matches: null });
      }),
    );
  });

  it('reports the item as unmatched when batch errors offset each other', () => {
    const result = runItemLedger(
      [
        { id: 'A', currentStock: 12 },
        { id: 'B', currentStock: 8 },
      ],
      [
        {
          id: '1',
          batchId: 'A',
          at: at(0),
          delta: 10,
          recordedBefore: 0,
          recordedAfter: 10,
        },
        {
          id: '2',
          batchId: 'B',
          at: at(0),
          delta: 10,
          recordedBefore: 0,
          recordedAfter: 10,
        },
      ],
    );
    expect(result.closing).toBe(result.currentStock);
    expect(result.batches.map((b) => b.matches)).toEqual([false, false]);
    expect(result.matches).toBe(false);
  });
});
