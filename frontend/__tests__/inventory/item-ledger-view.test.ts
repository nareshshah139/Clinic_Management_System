import fc from 'fast-check';
import { chainBreakNote, clinicDay, filterLedgerRows, type ItemLedgerRow, type LedgerKind } from '@/components/inventory/item-ledger-view';

const KINDS: LedgerKind[] = ['SALE', 'PURCHASE', 'RETURN', 'ADJUSTMENT'];
const START = Date.UTC(2026, 9, 1);
const DAY = 86_400_000;
const dayOf = (offset: number) => new Date(START + offset * DAY).toISOString().slice(0, 10);

const row = (id: string, at: string, kind: LedgerKind, itemClosing: number | null): ItemLedgerRow => ({
  id, at, batchId: 'b', batchNumber: 'B', kind, channel: 'MANUAL', channelLabel: 'Manual entry', reference: null, document: null,
  counterparty: null, actor: null, reason: null, delta: 1, in: 1, out: null, batchClosing: itemClosing, itemClosing, chainBreak: null,
  owner: null, correctionAllowed: true,
});

const rows = fc.array(
  fc.record({ minutes: fc.nat({ max: 60 * 24 * 40 }), kind: fc.constantFrom(...KINDS), closing: fc.option(fc.integer({ min: -50, max: 500 })) }),
  { maxLength: 40 },
).map(list => list
  .map((r, i) => row(`r${i}`, new Date(START + r.minutes * 60_000).toISOString(), r.kind, r.closing))
  .sort((a, b) => a.at.localeCompare(b.at)));
const filters = fc.record({
  from: fc.option(fc.nat({ max: 45 }).map(dayOf), { nil: '' }),
  to: fc.option(fc.nat({ max: 45 }).map(dayOf), { nil: '' }),
  kind: fc.constantFrom<LedgerKind | ''>('', ...KINDS),
});

it('keeps an ordered subsequence of the same rows with their closings, and drops only rows outside the filter', () => {
  fc.assert(fc.property(rows, filters, (all, filter) => {
    const shown = filterLedgerRows(all, filter);
    let cursor = 0;
    for (const kept of shown) {
      while (cursor < all.length && all[cursor] !== kept) cursor++;
      expect(cursor).toBeLessThan(all.length);
      expect(kept.itemClosing).toBe(all[cursor].itemClosing);
      cursor++;
    }
    const inside = (r: ItemLedgerRow) => {
      const day = clinicDay(r.at);
      return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to) && (!filter.kind || r.kind === filter.kind);
    };
    expect(shown.length).toBe(all.filter(inside).length);
    expect(all.filter(r => !shown.includes(r)).every(r => !inside(r))).toBe(true);
  }));
});

it('filters by the Asia/Kolkata calendar day, not the UTC day', () => {
  const lateEvening = row('late', '2026-11-01T19:00:00.000Z', 'SALE', 4);
  expect(filterLedgerRows([lateEvening], { from: '', to: '2026-11-01', kind: '' })).toEqual([]);
  expect(filterLedgerRows([lateEvening], { from: '2026-11-02', to: '2026-11-02', kind: '' })).toEqual([lateEvening]);
});

it('explains a chain break with the recorded and expected balances', () => {
  expect(chainBreakNote({ expected: 3, recorded: 5 })).toBe('Stock was 5 before this entry; the ledger expected 3. 2 units changed without a ledger entry.');
});
