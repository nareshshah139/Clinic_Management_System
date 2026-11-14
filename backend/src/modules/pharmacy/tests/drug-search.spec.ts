import { DrugService } from '../drug.service';
import { loadReviewedProductAliases } from '../../../shared/search/drug-search';

describe('Drug Search shared ranking', () => {
  const products = [
    {
      id: 'fuzzy',
      name: 'Tyrobin Cream',
      packSizeLabel: '20g',
      manufacturerName: '',
      strength: null,
    },
    {
      id: 'exact',
      name: 'Tyrodin Cream',
      packSizeLabel: '20g',
      manufacturerName: '',
      strength: null,
    },
  ];
  const database = () => ({
    $queryRaw: jest.fn().mockResolvedValue(products.map((p) => ({ id: p.id }))),
    drug: { findMany: jest.fn().mockResolvedValue(products) },
    inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
  });
  it('uses indexed candidate retrieval and ranks before limiting without writes', async () => {
    const db = database(),
      service = new DrugService(db as any);
    const results = await service.autocomplete(
      { q: 'tyrodin cream', limit: 1 },
      'clinic',
    );
    expect(results.map((r) => r.id)).toEqual(['exact']);
    expect(db.drug.findMany.mock.calls[0][0]).toMatchObject({
      where: { branchId: 'clinic', isActive: true, isDiscontinued: false },
    });
    expect(db.drug.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    const sql = db.$queryRaw.mock.calls[0][0];
    expect(sql.values).toContain('clinic');
    expect(sql.sql).toContain('<->>');
  });
  it('tells the bill form which suggested medicines need a prescription: the medicine\'s own choice, else its stock', async () => {
    const rows = ['marked', 'cleared', 'unset-stock', 'unset-plain'].map((id) => ({ id, name: `Cream ${id}`, packSizeLabel: '1', manufacturerName: '', strength: null }));
    const requirement: Record<string, boolean | null> = { marked: true, cleared: false, 'unset-stock': null, 'unset-plain': null };
    const db = {
      $queryRaw: jest.fn().mockResolvedValue(rows.map((row) => ({ id: row.id }))),
      drug: { findMany: jest.fn().mockResolvedValue(rows.map((row) => ({ ...row, requiresPrescription: requirement[row.id] }))) },
      inventoryItem: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'ACTIVE', currentStock: 1, heldStock: 0, expiryDate: null, requiresPrescription: true, drugs: [{ id: 'cleared' }] },
          { status: 'ACTIVE', currentStock: 1, heldStock: 0, expiryDate: null, requiresPrescription: true, drugs: [{ id: 'unset-stock' }] },
          { status: 'ACTIVE', currentStock: 1, heldStock: 0, expiryDate: null, requiresPrescription: false, drugs: [{ id: 'unset-plain' }] },
        ]),
      },
    };
    const results = await new DrugService(db as any).autocomplete({ q: 'cream', limit: 10 }, 'clinic');
    expect(Object.fromEntries(results.map((r) => [r.id, r.requiresPrescription]))).toEqual({
      marked: true, cleared: false, 'unset-stock': true, 'unset-plain': false,
    });
  });
  it('uses only reviewed, unambiguous, same-branch aliases', async () => {
    const db = database();
    db.inventoryItem.findMany.mockResolvedValue([
      {
        name: 'Canonical',
        metadata: JSON.stringify({
          nameNormalization: { version: 1, aliases: ['Old name'] },
        }),
        drugs: [{ id: 'one', branchId: 'clinic' }],
      },
      {
        name: 'Ambiguous',
        metadata: JSON.stringify({ nameNormalization: { version: 1 } }),
        drugs: [
          { id: 'two', branchId: 'clinic' },
          { id: 'three', branchId: 'clinic' },
        ],
      },
      {
        name: 'Foreign',
        metadata: JSON.stringify({ nameNormalization: { version: 1 } }),
        drugs: [{ id: 'foreign', branchId: 'other' }],
      },
      {
        name: 'Unreviewed',
        metadata: '{}',
        drugs: [{ id: 'four', branchId: 'clinic' }],
      },
    ] as any);
    expect([
      ...(await loadReviewedProductAliases(db as any, 'clinic')),
    ]).toEqual([['one', ['Canonical', 'Old name']]]);
  });
});
