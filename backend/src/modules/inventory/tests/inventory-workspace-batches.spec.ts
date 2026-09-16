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
  it('displays reviewed names and finds former names without merging units, IDs or batches', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      row('a', 12, { name: 'Tyrodin FSR Tablet', unit: 'PIECES',
        metadata: { nameNormalization: { version: 1, aliases: ['Tyrodin Fsr Tab'] } },
        drugs: [{ id: 'loose', name: 'Tyrodin Fsr Tab (loose tablets)' }] }),
      row('b', 2, { name: 'Tyrodin FSR Tablet', unit: 'STRIPS',
        metadata: { nameNormalization: { version: 1, aliases: ['Tyrodin Fsr Tab'] } },
        drugs: [{ id: 'strip', name: 'Tyrodin Fsr Tab' }] }),
    ]);
    const result = await service.stock(actor, { search: 'fsr tab' });
    expect(result.total).toBe(2);
    expect(result.rows.map(r => [r.id, r.productName, r.currentStock, r.unit, r.drugs[0].id])).toEqual([
      ['a', 'Tyrodin FSR Tablet (loose tablets)', 12, 'PIECES', 'loose'],
      ['b', 'Tyrodin FSR Tablet', 2, 'STRIPS', 'strip'],
    ]);
  });
  it('keeps aliases and pack text from legacy names searchable after normalization', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([
      row('legacy', 0, { name: 'Tricosilk Pro Hair Solution', packSize: null, packUnit: null, drugs: [],
        metadata: { nameNormalization: { version: 1, sourcePackLabel: '60 ml', aliases: ['TRICOSLIK PRO SOLUTION 60ML'] } } }),
    ]);
    const result = await service.stock(actor, { search: 'tricoslik 60ml' });
    expect(result.rows[0].productName).toBe('Tricosilk Pro Hair Solution');
    expect(result.rows[0].packLabel).toBe('60 ml');
    expect(result.rows[0].packSize).toBeNull();
  });
  it('makes subsequent manual name corrections visible, retains old aliases and audits only item metadata', async () => {
    const original = row('a', 12, { name: 'Previous Name', updatedAt: new Date(),
      metadata: JSON.stringify({ sourceItemCode: 'M123', nameNormalization: { version: 1, aliases: ['Original Name'] } }) });
    const tx = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue(original),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...original, ...data })),
      }, auditLog: { create: jest.fn() },
    };
    service = new InventoryWorkspaceService(prisma, {
      permissions: async () => new Set(['inventory:item:update', 'inventory:item:read']),
      transaction: (fn: any) => fn(tx),
    } as any);
    const saved = await service.saveItem(actor, original.id, { updatedAt: original.updatedAt.toISOString(), name: 'Corrected Name' });
    const metadata = JSON.parse(saved.metadata);
    expect(metadata.nameNormalization.aliases).toEqual(['Original Name', 'Previous Name']);
    expect(metadata.sourceItemCode).toBe('M123');
    expect(Object.keys(tx.inventoryItem.update.mock.calls[0][0].data).sort()).toEqual(['metadata', 'name', 'stockStatus']);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    prisma.inventoryItem.findMany.mockResolvedValue([saved]);
    expect((await service.stock(actor, { search: 'original name' })).rows[0].productName).toBe('Corrected Name');
    await expect(service.saveItem(actor, original.id, { updatedAt: 'stale', name: 'Bad Name' })).rejects.toThrow('Batch details changed');
    expect(tx.inventoryItem.update).toHaveBeenCalledTimes(1);
  });
});
