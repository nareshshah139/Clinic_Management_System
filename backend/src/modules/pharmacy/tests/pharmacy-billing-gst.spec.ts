import { DrugService } from '../drug.service';
import { PharmacyPackageService } from '../pharmacy-package.service';

const product = { id: 'drug-1', name: 'Test Cream', price: 100, manufacturerName: 'Test', packSizeLabel: '20g' };
const batch = (gstRate: number | null, extra = {}) => ({
  gstRate, currentStock: 10, heldStock: 0, stockStatus: 'IN_STOCK', expiryDate: null,
  drugs: [{ id: product.id, branchId: 'clinic' }], ...extra,
});
function database(batches = [batch(12)]) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: product.id }]),
    drug: { findMany: jest.fn().mockResolvedValue([product]), count: jest.fn().mockResolvedValue(1) },
    inventoryItem: { findMany: jest.fn().mockImplementation(async ({ where }) => where.metadata ? [] : batches) },
    pharmacyPackage: {
      findMany: jest.fn().mockResolvedValue([{
        id: 'package-1', name: 'Test Package', createdAt: new Date(), updatedAt: new Date(),
        items: [{ id: 'item-1', drugId: product.id, drug: product, quantity: 1 }],
      }]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
}

it.each([5, 12, 0])('pharmacy autocomplete exposes Inventory GST %s%%', async (gstRate) => {
  const db = database([batch(gstRate)]);
  const result = await new DrugService(db as any).autocomplete({ q: 'Test Cream' }, 'clinic');
  expect(result[0]).toMatchObject({ id: product.id, gstRate });
  const gstLookup = db.inventoryItem.findMany.mock.calls.find(([args]) => !args.where.metadata)![0];
  expect(gstLookup.where).toMatchObject({
    branchId: 'clinic', status: 'ACTIVE', drugs: { some: { id: { in: [product.id] }, branchId: 'clinic' } },
  });
});

it.each([
  { name: 'missing', batches: [] },
  { name: 'unknown', batches: [batch(null)] },
  { name: 'conflicting', batches: [batch(5), batch(12)] },
  { name: 'partly unknown', batches: [batch(5), batch(null)] },
  { name: 'invalid', batches: [batch(101)] },
])('does not invent a GST rate for $name inventory', async ({ batches }) => {
  const result = await new DrugService(database(batches) as any).autocomplete({ q: 'Test Cream' }, 'clinic');
  expect(result[0]).toMatchObject({ gstRate: null });
});

it('ignores expired, exhausted and fully held batches when resolving the sale GST', async () => {
  const db = database([
    batch(5), batch(12, { expiryDate: new Date('2000-01-01') }),
    batch(18, { stockStatus: 'EXPIRED' }), batch(null, { currentStock: 0 }),
    batch(18, { heldStock: 10 }),
  ]);
  const result = await new DrugService(db as any).autocomplete({ q: 'Test Cream' }, 'clinic');
  expect(result[0]).toMatchObject({ gstRate: 5 });
});

it('exposes the same GST on the paginated lookup used by prescription prefill', async () => {
  const result = await new DrugService(database() as any).findAll({ search: 'Test Cream' }, 'clinic');
  expect(result.data[0]).toMatchObject({ gstRate: 12 });
});

it('retains a known Inventory rate when the product is temporarily out of stock', async () => {
  const db = database([batch(5, { currentStock: 0 })]);
  const result = await new DrugService(db as any).autocomplete({ q: 'Test Cream' }, 'clinic');
  expect(result[0]).toMatchObject({ gstRate: 5 });
});

it('also enriches an empty-query catalog listing and agrees across multiple batches', async () => {
  const db = database([batch(12), batch(12)]);
  const result = await new DrugService(db as any).autocomplete({ q: '' }, 'clinic');
  expect(result[0]).toMatchObject({ gstRate: 12 });
});

it('includes Inventory GST on package contents', async () => {
  const result = await new PharmacyPackageService(database() as any).findAll({}, 'clinic');
  expect(result.packages[0].items[0].drug).toMatchObject({ gstRate: 12 });
});
