import { Prisma } from '@prisma/client';
import { searchPrescriptionDrugs } from '../prescription-drug-search';
import { PrescriptionsController } from '../prescriptions.controller';
import { PrescriptionsService } from '../prescriptions.service';

const product = {
  id: 'drug', name: 'Tyrodin Cream', price: 100, manufacturerName: 'Manufacturer',
  dosageForm: 'CREAM', strength: null, packSizeLabel: '20g',
  composition1: 'Ingredient A', composition2: 'Ingredient B',
};
function database() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: product.id }]),
    inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
    drug: { findMany: jest.fn().mockResolvedValue([product]) },
  };
}

it('uses valid catalog fields, branch-scoped active retrieval, and maps prescription compatibility fields', async () => {
  const db = database();
  const service = new PrescriptionsService(db as any, {} as any);
  const results = await service.autocompleteDrugs('Tyrodin', 30, 'clinic');
  expect(results[0]).toMatchObject({
    id: 'drug', genericName: 'Ingredient A + Ingredient B',
    form: 'CREAM', dosageForm: 'CREAM', manufacturer: 'Manufacturer', brandNames: [],
  });
  expect(results[0]).not.toHaveProperty('isGeneric');
  const args = db.drug.findMany.mock.calls[0][0];
  expect(args.where).toMatchObject({ branchId: 'clinic', isActive: true, isDiscontinued: false });
  const fields = new Set(Prisma.dmmf.datamodel.models.find(m => m.name === 'Drug')!.fields.map(f => f.name));
  expect(Object.keys(args.select).every(field => fields.has(field))).toBe(true);
  for (const [sql] of db.$queryRaw.mock.calls) {
    expect(sql.values).toContain('clinic');
    expect(sql.sql).toContain('"isActive" = true');
    expect(sql.sql).toContain('"isDiscontinued" = false');
  }
});

it('keeps exact matches ahead of spelling suggestions and limits after ranking', async () => {
  const db = database();
  db.drug.findMany.mockResolvedValue([{ ...product, id: 'fuzzy', name: 'Tyrobin Cream' }, product]);
  const results = await searchPrescriptionDrugs(db as any, 'tyrodin cream', 1, 'clinic');
  expect(results.map(r => r.id)).toEqual(['drug']);
});

it('does not invent ingredient or generic classification data', async () => {
  const db = database();
  db.drug.findMany.mockResolvedValue([{ ...product, composition1: null, composition2: null, dosageForm: null }]);
  const [result] = await searchPrescriptionDrugs(db as any, 'tyrodin', 30, 'clinic');
  expect(result.genericName).toBeNull();
  expect(result.form).toBeNull();
  expect(result).not.toHaveProperty('isGeneric');
});

it('does not query the catalog for whitespace and rejects missing branch context', async () => {
  const db = database();
  expect(await searchPrescriptionDrugs(db as any, '  ', 30, 'clinic')).toEqual([]);
  await expect(searchPrescriptionDrugs(db as any, 'tyrodin', 30, '')).rejects.toThrow('Branch context');
  await expect(searchPrescriptionDrugs(db as any, 'x'.repeat(201), 30, 'clinic')).rejects.toThrow('200 characters');
  expect(db.$queryRaw).not.toHaveBeenCalled();
  expect(db.drug.findMany).not.toHaveBeenCalled();
});

it('passes the authenticated branch to the prescription service', async () => {
  const service = { autocompleteDrugs: jest.fn().mockResolvedValue([]) };
  const controller = new PrescriptionsController(service as any);
  await controller.autocompleteDrugs('tyrodin', { user: { id: 'doctor', branchId: 'clinic', role: 'DOCTOR' } }, 30);
  expect(service.autocompleteDrugs).toHaveBeenCalledWith('tyrodin', 30, 'clinic');
});
