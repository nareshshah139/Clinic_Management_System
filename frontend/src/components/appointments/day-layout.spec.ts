import { layoutDay, type DayInterval } from './day-layout';

const GRID_POINTS = 6;
const MAX_INTERVALS = 4;

const overlaps = (a: DayInterval, b: DayInterval) => a.startMin < b.endMin && b.startMin < a.endMin;

function allIntervals(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let s = 0; s < GRID_POINTS; s++) for (let e = s + 1; e < GRID_POINTS; e++) out.push([s, e]);
  return out;
}

function multisets<T>(pool: T[], size: number, from = 0): T[][] {
  if (size === 0) return [[]];
  const out: T[][] = [];
  for (let i = from; i < pool.length; i++) {
    for (const rest of multisets(pool, size - 1, i)) out.push([pool[i], ...rest]);
  }
  return out;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

function clustersOf(items: DayInterval[]): DayInterval[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  items.forEach((a, i) => items.forEach((b, j) => { if (i < j && overlaps(a, b)) parent[find(i)] = find(j); }));
  const groups = new Map<number, DayInterval[]>();
  items.forEach((item, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), item]));
  return [...groups.values()];
}

function peakConcurrency(items: DayInterval[]): number {
  let peak = 0;
  for (let t = 0; t < GRID_POINTS; t++) peak = Math.max(peak, items.filter((i) => i.startMin <= t && t < i.endMin).length);
  return peak;
}

describe('layoutDay', () => {
  it('satisfies the lane invariants for every multiset of up to 4 intervals on a 6-point grid', () => {
    const pool = allIntervals();
    let cases = 0;
    let permutedRuns = 0;
    for (let size = 1; size <= MAX_INTERVALS; size++) {
      for (const set of multisets(pool, size)) {
        const items: DayInterval[] = set.map(([s, e], i) => ({ id: `i${i}`, startMin: s, endMin: e }));
        const layout = layoutDay(items);
        cases++;

        expect(layout.size).toBe(items.length);
        for (const a of items) {
          const pa = layout.get(a.id)!;
          expect(pa.lane).toBeGreaterThanOrEqual(0);
          expect(pa.lane).toBeLessThan(pa.laneCount);
          for (const b of items) {
            if (a !== b && overlaps(a, b)) expect(pa.lane).not.toBe(layout.get(b.id)!.lane);
          }
        }

        for (const cluster of clustersOf(items)) {
          const counts = new Set(cluster.map((i) => layout.get(i.id)!.laneCount));
          expect(counts.size).toBe(1);
          const [laneCount] = [...counts];
          expect(laneCount).toBe(peakConcurrency(cluster));
          const lanesUsed = new Set(cluster.map((i) => layout.get(i.id)!.lane));
          expect([...lanesUsed].sort()).toEqual(Array.from({ length: laneCount }, (_, i) => i));
        }

        const expected = JSON.stringify([...layout].sort());
        for (const perm of permutations(items)) {
          permutedRuns++;
          expect(JSON.stringify([...layoutDay(perm)].sort())).toBe(expected);
        }
      }
    }
    console.log(`layoutDay exhaustive check: ${cases} interval multisets, ${permutedRuns} permuted inputs`);
    expect(cases).toBe(15 + 120 + 680 + 3060);
  });

  it('puts two appointments in the same slot side by side and back-to-back ones in one lane', () => {
    const layout = layoutDay([
      { id: 'b', startMin: 660, endMin: 675 },
      { id: 'a', startMin: 660, endMin: 675 },
      { id: 'c', startMin: 675, endMin: 690 },
    ]);
    expect(layout.get('a')).toEqual({ lane: 0, laneCount: 2 });
    expect(layout.get('b')).toEqual({ lane: 1, laneCount: 2 });
    expect(layout.get('c')).toEqual({ lane: 0, laneCount: 1 });
  });

  it('treats zero and negative length intervals as one minute long', () => {
    const layout = layoutDay([
      { id: 'zero', startMin: 600, endMin: 600 },
      { id: 'negative', startMin: 600, endMin: 590 },
      { id: 'next', startMin: 601, endMin: 610 },
    ]);
    expect(layout.get('zero')).toEqual({ lane: 1, laneCount: 2 });
    expect(layout.get('negative')).toEqual({ lane: 0, laneCount: 2 });
    expect(layout.get('next')).toEqual({ lane: 0, laneCount: 1 });
  });
});
