const MEASURE_WORDS = new Set(['ml', 'l', 'ltr', 'litre', 'litres', 'g', 'gm', 'gms', 'gram', 'grams', 'kg']);

const UNITS_PER_STOCK_UNIT: Partial<Record<string, (packs: number, units: number) => number | undefined>> = {
  STRIPS: (packs, units) => (units === 1 && packs > 1 ? undefined : units),
  BOXES: (packs, units) => packs * units,
  PACKS: (packs, units) => packs * units,
};

const MULTIPLIER = /(\d+)\s*[x×*]\s*(\d+)((?:\s*[x×*]\s*\d+)*)\s*([a-z]+)?/i;

/**
 * @cc [owner:nareshshah139,label:product] pack-multiplier-contents
 * A pack written "AxB" is A inner packs of B units. A strip stock unit MUST count B units, and a box or pack
 * stock unit MUST count A times B. A multiplier that holds a measure (ml, gm), has three parts, or reads two
 * ways for the stock unit MUST give no count, so the line bills 1 and is flagged instead of billed at a wrong count.
 * A stock unit that is not a pack MUST NOT be read here, and a label without a multiplier MUST NOT be read here.
 */
export function readPackMultiplier(label: string, stockUnit: string): { unitsPerStockUnit: number | undefined } | undefined {
  const unitsFor = UNITS_PER_STOCK_UNIT[stockUnit];
  const match = unitsFor && MULTIPLIER.exec(label);
  if (!match) return undefined;
  const [, packs, units, moreParts, word] = match;
  if (moreParts || (word && MEASURE_WORDS.has(word.toLowerCase()))) return { unitsPerStockUnit: undefined };
  return { unitsPerStockUnit: unitsFor(Number(packs), Number(units)) || undefined };
}
