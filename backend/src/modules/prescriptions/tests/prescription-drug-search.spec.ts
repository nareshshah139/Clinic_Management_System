import { searchPrescriptionDrugs } from '../prescription-drug-search';
import { PrescriptionsController } from '../prescriptions.controller';

const drug = { id: 'drug', isActive: true, isDiscontinued: false, name: 'Tyrodin Cream', branchId: 'clinic', manufacturerName: 'Manufacturer', dosageForm: 'CREAM', packSizeLabel: '20g', composition1: 'Ingredient A', composition2: 'Ingredient B' };
const item = { id: 'inventory', name: 'Tyrodin Cream', branchId: 'clinic', currentStock: 12, heldStock: 2, status: 'ACTIVE', unit: 'TUBES', packSize: 20, packUnit: 'g', sellingPrice: 100, drugs: [drug] };
function database(rows = [item]) { return { inventoryItem: { findMany: jest.fn().mockResolvedValue(rows) }, drug: { findMany: jest.fn() }, $queryRaw: jest.fn() }; }

it('uses clinic inventory, carries its stable ID, and excludes held stock', async () => {
  const db = database();
  expect((await searchPrescriptionDrugs(db as any, 'Tyrodin', 30, 'clinic'))[0]).toMatchObject({ id: 'drug', inventoryItemId: 'inventory', totalStock: 10, genericName: 'Ingredient A + Ingredient B', form: 'CREAM', manufacturer: 'Manufacturer' });
  expect(db.inventoryItem.findMany.mock.calls[0][0].where).toEqual({ branchId: 'clinic', status: 'ACTIVE' });
  expect(db.drug.findMany).not.toHaveBeenCalled();
  expect(db.$queryRaw).not.toHaveBeenCalled();
});
it('ranks before limiting and keeps duplicate products separate for review', async () => {
  const db = database([{ ...item, id: 'fuzzy', name: 'Tyrobin Cream', drugs: [{ ...drug, id: 'fuzzy', name: 'Tyrobin Cream' }] }, item]);
  expect((await searchPrescriptionDrugs(db as any, 'tyrodin cream', 1, 'clinic')).map(r => r.inventoryItemId)).toEqual(['inventory']);
});
it('sums sibling batches once but does not combine packs or units', async () => {
  const db = database([item, { ...item, id: 'batch-2' }, { ...item, id: 'large', packSize: 40 }]);
  const rows = await searchPrescriptionDrugs(db as any, 'tyrodin', 30, 'clinic');
  expect(rows.map(r => r.totalStock).sort()).toEqual([10, 20]);
});
it('never falls back to the full catalog for a missing medicine', async () => {
  const db = database([]);
  expect(await searchPrescriptionDrugs(db as any, 'Tyrodin', 30, 'clinic')).toEqual([]);
  expect(db.drug.findMany).not.toHaveBeenCalled();
});
it('handles blank queries and rejects invalid scope/input', async () => {
  const db = database();
  expect(await searchPrescriptionDrugs(db as any, ' ', 30, 'clinic')).toEqual([]);
  await expect(searchPrescriptionDrugs(db as any, 'tyrodin', 30, '')).rejects.toThrow('Branch context');
  await expect(searchPrescriptionDrugs(db as any, 'x'.repeat(201), 30, 'clinic')).rejects.toThrow('200 characters');
  expect(db.inventoryItem.findMany).not.toHaveBeenCalled();
});
it('passes the authenticated branch to the prescription service', async () => {
  const service = { autocompleteDrugs: jest.fn().mockResolvedValue([]) };
  await new PrescriptionsController(service as any).autocompleteDrugs('tyrodin', { user: { id: 'doctor', branchId: 'clinic', role: 'DOCTOR' } }, 30);
  expect(service.autocompleteDrugs).toHaveBeenCalledWith('tyrodin', 30, 'clinic');
});
