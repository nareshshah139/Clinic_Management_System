import fc from 'fast-check';
import {
  buildItemMarginReport,
  MARGIN_COST_STATUSES,
  MARGIN_ITEM_TYPES,
  MARGIN_SEARCH_FIELDS,
  MARGIN_TYPES,
  MarginFilters,
  MarginLine,
  MarginProduct,
  parseTags,
} from './pharmacy-item-margin';

const words = ['Acne', 'Sun', 'Itch', 'Derma', 'Galderma', 'gel', 'Cream'];
const word = fc.constantFrom(...words);
const optionalText = fc.option(
  fc.array(word, { minLength: 1, maxLength: 2 }).map((w) => w.join(' ')),
  { nil: null },
);

const productArb = (index: number): fc.Arbitrary<MarginProduct> =>
  fc.record({
    key: fc.constant(`p${index}`),
    name: fc
      .array(word, { minLength: 1, maxLength: 3 })
      .map((w) => w.join(' ')),
    category: optionalText,
    unitLabel: fc.constant('15 g'),
    manufacturer: optionalText,
    stock: fc.nat(50),
    mrp: fc.option(fc.integer({ min: 1, max: 900 }), { nil: null }),
    itemId: fc.constant(`i${index}`),
    tags: fc.array(word, { maxLength: 3 }),
    itemType: fc.option(fc.constantFrom(...MARGIN_ITEM_TYPES), { nil: null }),
  });

const lineArb = (productCount: number): fc.Arbitrary<MarginLine> =>
  fc
    .record({
      productKey: fc
        .integer({ min: 0, max: productCount - 1 })
        .map((i) => `p${i}`),
      kind: fc.constantFrom<'SALE' | 'RETURN'>('SALE', 'RETURN'),
      quantity: fc.integer({ min: 1, max: 9 }),
      salesAmount: fc.integer({ min: 10, max: 5000 }),
      outputGst: fc.integer({ min: 0, max: 600 }),
      cost: fc.option(
        fc.record({
          perUnit: fc.integer({ min: 1, max: 400 }),
          gstRate: fc.constantFrom(0, 5, 12, 18),
        }),
        { nil: null },
      ),
    })
    .map((line) =>
      line.kind === 'RETURN'
        ? {
            ...line,
            quantity: -line.quantity,
            salesAmount: -line.salesAmount,
            outputGst: -line.outputGst,
          }
        : line,
    );

const worldArb = fc.integer({ min: 1, max: 6 }).chain((count) =>
  fc.record({
    products: fc.tuple(
      ...Array.from({ length: count }, (_, i) => productArb(i)),
    ),
    lines: fc.array(lineArb(count), { maxLength: 24 }),
  }),
);

const filtersArb: fc.Arbitrary<MarginFilters> = fc.record({
  type: fc.constantFrom(...MARGIN_TYPES),
  search: fc.option(word, { nil: undefined }),
  searchField: fc.constantFrom(...MARGIN_SEARCH_FIELDS),
  tag: fc.option(word, { nil: undefined }),
  category: fc.option(word, { nil: undefined }),
  manufacturer: fc.option(word, { nil: undefined }),
  itemType: fc.option(fc.constantFrom(...MARGIN_ITEM_TYPES), {
    nil: undefined,
  }),
  costStatus: fc.constantFrom(...MARGIN_COST_STATUSES),
});

const build = (
  world: { products: MarginProduct[]; lines: MarginLine[] },
  filters: Partial<MarginFilters> = {},
) =>
  buildItemMarginReport({
    lines: world.lines,
    catalog: new Map(world.products.map((p) => [p.key, p])),
    fallbackProducts: new Map(),
    filters,
  });

const cents = (n: number) => Math.round(n * 100);

describe('item margin filters (properties)', () => {
  it('totals equal the sum of the returned rows for any filter combination', () => {
    fc.assert(
      fc.property(worldArb, filtersArb, (world, filters) => {
        const { rows, totals } = build(world, filters);
        expect(totals.itemCount).toBe(rows.length);
        expect(cents(totals.salesAmount)).toBe(
          cents(rows.reduce((s, r) => s + r.salesAmount, 0)),
        );
        expect(cents(totals.profit)).toBe(
          cents(rows.reduce((s, r) => s + (r.profit ?? 0), 0)),
        );
        expect(cents(totals.purchase)).toBe(
          cents(rows.reduce((s, r) => s + (r.purchase ?? 0), 0)),
        );
        expect(totals.unknownCost.lineCount).toBe(
          rows.reduce((s, r) => s + r.unknownCost.lineCount, 0),
        );
      }),
    );
  });

  it('row filters only ever return a subset of the unfiltered rows, unchanged', () => {
    fc.assert(
      fc.property(worldArb, filtersArb, (world, filters) => {
        const unfiltered = build(world, { type: filters.type }).rows;
        const byKey = new Map(unfiltered.map((row) => [row.key, row]));
        for (const row of build(world, filters).rows)
          expect(byKey.get(row.key)).toEqual(row);
      }),
    );
  });

  it('net quantity per product is its sales quantity plus its returns quantity', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const quantity = (type: MarginFilters['type']) =>
          new Map(
            build(world, { type }).rows.map((row) => [
              row.key,
              row.saleQuantity,
            ]),
          );
        const [net, sales, returns] = [
          quantity('NET'),
          quantity('SALES'),
          quantity('RETURNS'),
        ];
        const keys = new Set([
          ...net.keys(),
          ...sales.keys(),
          ...returns.keys(),
        ]);
        for (const key of keys)
          expect(net.get(key) ?? 0).toBe(
            (sales.get(key) ?? 0) + (returns.get(key) ?? 0),
          );
      }),
    );
  });

  it('every offered option, applied alone, returns at least one row', () => {
    fc.assert(
      fc.property(worldArb, fc.constantFrom(...MARGIN_TYPES), (world, type) => {
        const { options } = build(world, { type });
        const alone = (filters: Partial<MarginFilters>) =>
          build(world, { type, ...filters }).rows.length;
        for (const tag of options.tags)
          expect(alone({ tag })).toBeGreaterThan(0);
        for (const category of options.categories)
          expect(alone({ category })).toBeGreaterThan(0);
        for (const manufacturer of options.manufacturers)
          expect(alone({ manufacturer })).toBeGreaterThan(0);
        for (const itemType of options.itemTypes)
          expect(
            alone({ itemType: itemType as MarginFilters['itemType'] }),
          ).toBeGreaterThan(0);
      }),
    );
  });

  it('options do not depend on the row filters', () => {
    fc.assert(
      fc.property(worldArb, filtersArb, (world, filters) => {
        expect(build(world, filters).options).toEqual(
          build(world, { type: filters.type }).options,
        );
      }),
    );
  });
});

describe('item tags', () => {
  it('reads a JSON array and falls back to a comma separated list', () => {
    expect(parseTags('["Acne"," Sun "]')).toEqual(['Acne', 'Sun']);
    expect(parseTags('Acne, Sun,')).toEqual(['Acne', 'Sun']);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('{"a":1}')).toEqual([]);
  });
});
