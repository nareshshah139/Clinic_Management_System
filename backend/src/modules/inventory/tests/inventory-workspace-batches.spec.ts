import { InventoryWorkspaceService } from '../inventory-workspace.service';

describe('stock batch views and name lookup', () => {
  const actor = { branchId: 'clinic', id: 'reviewer' } as any;
  const row = (id: string, stock: number, overrides: any = {}) => ({
    id, branchId: 'clinic', name: 'Max Rich Yu Cream', unit: 'PACKS', packSize: 100,
    packUnit: 'g', batchNumber: id, currentStock: stock, heldStock: 0,
    status: 'ACTIVE', expiryDate: new Date('2028-05-31T23:59:59.999Z'),
    costPrice: 10, mrp: 20, metadata: {}, drugs: [{ id: 'cream', name: 'Max Rich Yu Cream' }],
    ...overrides,
  });
  let prisma: any, service: InventoryWorkspaceService;
  beforeEach(() => {
    prisma = { inventoryItem: { findMany: jest.fn().mockResolvedValue([
      row('old', 0), row('new', 17), row('also-current', 2), row('expired', 1, { expiryDate: new Date('2020-01-31') }),
    ]) } };
    service = new InventoryWorkspaceService(prisma, { permissions: async () => new Set(['inventory:item:read']) } as any);
  });
  it('filters the complete population before pagination and values only the selected scope', async () => {
    const result = await service.stock(actor, { batchView: 'ON_HAND', page: '2', limit: '1' });
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].currentStock).toBeGreaterThan(0);
    expect(result.valuation.current.PTR).toBe(190);
    expect(result.valuation.expired.PTR).toBe(10);
    expect(prisma.inventoryItem.findMany.mock.calls[0][0].where).toEqual({ branchId: 'clinic' });
  });
  it('keeps empty batches accessible and does not silently narrow existing API consumers', async () => {
    expect((await service.stock(actor, { batchView: 'EMPTY' })).rows.map(r => r.id)).toEqual(['old']);
    expect((await service.stock(actor)).total).toBe(4);
    await expect(service.stock(actor, { batchView: 'LATEST' })).rejects.toThrow('Unknown batch view');
  });
  it('finds reordered words, punctuation variants, linked catalog names and source codes without merging rows', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      row('a', 2, { name: 'T-Bact Ointment', metadata: { sourceItemCode: 'M12345' }, drugs: [{ id: 'd1', name: 'T Bact Ointment' }] }),
      row('b', 3, { name: 'T Bact Ointment', drugs: [{ id: 'd2', name: 'T Bact Ointment' }] }),
      row('c', 4),
    ]);
    expect((await service.stock(actor, { search: 'ointment t bact' })).total).toBe(2);
    expect((await service.stock(actor, { search: 'M12345' })).rows.map(r => r.id)).toEqual(['a']);
    expect((await service.stock(actor, { search: 'inventory:b' })).rows.map(r => r.id)).toEqual(['b']);
    expect((await service.stock(actor, { search: 't bact absentword' })).total).toBe(0);
  });
  it('includes earlier batches of the same verified product and pack despite legacy category differences', async () => {
    const item = row('new', 17, { type: 'CONSUMABLE' });
    prisma.inventoryItem.findFirst = jest.fn().mockResolvedValue(item);
    prisma.stockTransaction = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.inventoryWorkflowEffect = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.pharmacyPurchaseInvoice = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.pharmacyInvoice = { findMany: jest.fn().mockResolvedValue([]) };
    const earlier = row('old', 0, { type: 'MEDICINE' });
    prisma.inventoryItem.findMany.mockImplementation(async ({ where }: any) => where.type ? [item] : [earlier, item]);
    service = new InventoryWorkspaceService(prisma, { permissions: async () => new Set(['inventory:item:read']), capabilities: async () => ({ kinds: {} }) } as any);
    const result = await service.item(actor, 'new');
    expect(result.batches.map(r => r.id)).toEqual(['old', 'new']);
    expect(prisma.inventoryItem.findMany.mock.calls[0][0].where).toEqual({
      branchId: 'clinic', drugs: { some: { id: 'cream' }, every: { id: 'cream' } }, unit: 'PACKS', packSize: 100, packUnit: 'g',
    });
  });
});
