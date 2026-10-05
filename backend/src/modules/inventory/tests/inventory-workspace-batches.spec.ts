import { InventoryWorkspaceService } from '../inventory-workspace.service';

describe('stock batch identity and name corrections', () => {
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
    expect((service as any).present(saved).productName).toBe('Corrected Name');
    await expect(service.saveItem(actor, original.id, { updatedAt: 'stale', name: 'Bad Name' })).rejects.toThrow('Batch details changed');
    expect(tx.inventoryItem.update).toHaveBeenCalledTimes(1);
  });
});
