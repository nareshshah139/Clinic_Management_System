import { DrugService } from '../drug.service';

const day = 86400000;
const batch = (over: Record<string, unknown>) => ({
  id: 'batch',
  name: 'Acnosis',
  status: 'ACTIVE',
  currentStock: 20,
  heldStock: 0,
  expiryDate: new Date(Date.now() + 200 * day),
  sellingPrice: 250,
  mrp: 250,
  gstRate: 12,
  stockStatus: 'IN_STOCK',
  drugs: [{ id: 'acnosis' }],
  ...over,
});
const acnosis = {
  id: 'acnosis',
  name: 'Acnosis',
  price: 0,
  packSizeLabel: '10 tablets',
  manufacturerName: 'Lakshmi Pharma',
  strength: '10 mg',
};

function service(batches: unknown[]) {
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'acnosis' }]),
    drug: { findMany: jest.fn().mockResolvedValue([acnosis]), findFirst: jest.fn().mockResolvedValue({ ...acnosis, inventoryItems: [] }) },
    inventoryItem: { findMany: jest.fn().mockResolvedValue(batches) },
  };
  return new DrugService(db as any);
}

describe('A stocked drug carries the price of the stock the bill sells', () => {
  it('autocomplete prices a drug with no catalogue price from its stock', async () => {
    const [found] = await service([batch({ sellingPrice: 250 })]).autocomplete({ q: 'acnosis' }, 'clinic');
    expect(found).toMatchObject({ id: 'acnosis', price: 0, stockPrice: 250 });
  });

  it('prices the batch that sells first, not a later one', async () => {
    const [found] = await service([
      batch({ id: 'late', sellingPrice: 300, expiryDate: new Date(Date.now() + 400 * day) }),
      batch({ id: 'soon', sellingPrice: 275, expiryDate: new Date(Date.now() + 90 * day) }),
    ]).autocomplete({ q: 'acnosis' }, 'clinic');
    expect(found.stockPrice).toBe(275);
  });

  it('skips expired, held-out and sold-out batches', async () => {
    const [found] = await service([
      batch({ id: 'expired', sellingPrice: 100, expiryDate: new Date(Date.now() - day) }),
      batch({ id: 'held', sellingPrice: 110, currentStock: 5, heldStock: 5 }),
      batch({ id: 'empty', sellingPrice: 120, currentStock: 0 }),
      batch({ id: 'good', sellingPrice: 260 }),
    ]).autocomplete({ q: 'acnosis' }, 'clinic');
    expect(found.stockPrice).toBe(260);
  });

  it('falls back to the batch MRP when its selling price was never set', async () => {
    const [found] = await service([batch({ sellingPrice: 0, mrp: 240 })]).autocomplete({ q: 'acnosis' }, 'clinic');
    expect(found.stockPrice).toBe(240);
  });

  it('gives no stock price when nothing is on the shelf or the batch belongs to several products', async () => {
    const none = (await service([batch({ currentStock: 0 })]).autocomplete({ q: 'acnosis' }, 'clinic'))[0];
    const shared = (await service([batch({ drugs: [{ id: 'acnosis' }, { id: 'other' }] })]).autocomplete({ q: 'acnosis' }, 'clinic'))[0];
    expect([none.stockPrice, shared.stockPrice]).toEqual([null, null]);
  });

  it('the single-drug read the bill uses for a prescription line carries it too', async () => {
    const drug = await service([batch({ sellingPrice: 250 })]).findOne('acnosis', 'clinic');
    expect(drug).toMatchObject({ id: 'acnosis', price: 0, stockPrice: 250 });
  });
});
