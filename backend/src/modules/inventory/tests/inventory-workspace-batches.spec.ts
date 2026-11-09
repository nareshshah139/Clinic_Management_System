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
    service = new InventoryWorkspaceService(prisma, { permissions: async () => new Set(['inventory:item:read']) } as any, {} as any);
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
    service = new InventoryWorkspaceService(prisma, { permissions: async () => new Set(['inventory:item:read']), capabilities: async () => ({ kinds: {} }) } as any, {} as any);
    const result = await service.item(actor, 'new');
    expect(result.batches.map(r => r.id)).toEqual(['old', 'new']);
    expect(prisma.inventoryItem.findMany.mock.calls[0][0].where).toEqual({
      branchId: 'clinic', drugs: { some: { id: 'cream' }, every: { id: 'cream' } }, unit: 'PACKS', packSize: 100, packUnit: 'g',
    });
  });
  it('keeps a manual movement correctable when its reference matches a supplier bill number', async () => {
    const item = row('new', 17);
    const movement = (id: string, type: string, delta: number, reference: string) => ({
      id, branchId: 'clinic', itemId: 'new', type, quantity: Math.abs(delta), quantityDelta: delta, reference, notes: null,
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
    });
    prisma.inventoryItem.findFirst = jest.fn().mockResolvedValue(item);
    prisma.inventoryItem.findMany.mockResolvedValue([item]);
    prisma.stockTransaction = { findMany: jest.fn().mockResolvedValue([
      movement('typed-loss', 'DAMAGED', -2, '4512'),
      movement('legacy-receipt', 'PURCHASE', 5, '4512'),
      movement('commit', 'PURCHASE', 10, 'PINV-4512-abcd1234'),
    ]) };
    prisma.inventoryWorkflowEffect = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.pharmacyInvoice = { findMany: jest.fn().mockResolvedValue([]) };
    const bill = { id: 'bill', invoiceNumber: '4512', stockCommitReference: 'PINV-4512-abcd1234', status: 'DRAFT', documents: [], items: [] };
    prisma.pharmacyPurchaseInvoice = { findMany: jest.fn().mockResolvedValue([bill]) };
    service = new InventoryWorkspaceService(prisma, { permissions: async () => new Set(['inventory:item:read']), capabilities: async () => ({ kinds: {} }) } as any);
    const { itemLedger } = await service.item(actor, 'new');
    const byId = Object.fromEntries(itemLedger.rows.map((m: any) => [m.id, m]));
    expect(byId['typed-loss']).toMatchObject({ owner: null, correctionAllowed: true });
    expect(byId['legacy-receipt'].owner).toMatchObject({ type: 'purchase', id: 'bill' });
    expect(byId.commit.owner).toMatchObject({ type: 'purchase', id: 'bill' });
  });
  it('runs one ledger across every sibling batch and explains which batches can be deleted', async () => {
    const opened = row('new', 7, { heldStock: 1 });
    const empty = row('empty', 0);
    const earlier = row('old', 3);
    const stamp = (minute: number) => new Date(Date.UTC(2026, 10, 1, 4, minute));
    const movement = (id: string, itemId: string, minute: number, type: string, delta: number, before: number, reference: string | null) => ({
      id, branchId: 'clinic', itemId, type, quantity: Math.abs(delta), quantityDelta: delta, reference, reason: null, supplier: null, customer: null,
      batchNumber: itemId, createdAt: stamp(minute), notes: JSON.stringify({ delta, beforeStock: before, afterStock: before + delta }),
      user: { id: 'u1', firstName: 'Asha', lastName: 'Rao' },
    });
    const movements = [
      movement('m1', 'old', 0, 'PURCHASE', 5, 0, 'PINV-77-abc'),
      movement('m2', 'new', 1, 'PURCHASE', 10, 0, 'PINV-78-def'),
      movement('m3', 'new', 2, 'SALE', -3, 10, 'INV-S1'),
      movement('m4', 'old', 3, 'SALE', -2, 5, 'INV-S2'),
    ];
    const bill = (id: string, number: string, commit: string, invoiceDate: string, lines: any[]) => ({
      id, invoiceNumber: number, stockCommitReference: commit, status: 'STOCK_COMMITTED', distributorName: `Distributor ${number}`,
      invoiceDate: new Date(invoiceDate), documents: [], items: lines,
    });
    const line = (inventoryItemId: string, discountPercent: number, createdAt: string) => ({ inventoryItemId, discountPercent, createdAt: new Date(createdAt) });
    const bills = [
      bill('b78', '78', 'PINV-78-def', '2026-10-30', [line('new', 12.5, '2026-10-30')]),
      bill('b77', '77', 'PINV-77-abc', '2026-09-01', [line('old', 5, '2026-09-01'), line('new', 2, '2026-09-01')]),
    ];
    prisma.inventoryItem.findFirst = jest.fn().mockResolvedValue(opened);
    prisma.inventoryItem.findMany.mockResolvedValue([earlier, opened, empty]);
    prisma.stockTransaction = { findMany: jest.fn().mockResolvedValue(movements) };
    prisma.inventoryWorkflowEffect = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.inventoryWorkflowDocument = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.pharmacyPurchaseInvoice = { findMany: jest.fn().mockResolvedValue(bills) };
    prisma.pharmacyInvoice = { findMany: jest.fn().mockResolvedValue([
      { id: 'sale1', invoiceNumber: 'S1', status: 'PAID', prescriptionId: 'rx1', billingName: 'Patient One' },
      { id: 'sale2', invoiceNumber: 'S2', status: 'PAID', prescriptionId: null, billingName: 'Walk-in' },
    ]) };
    service = new InventoryWorkspaceService(prisma, { permissions: async () => new Set(['inventory:item:read']), capabilities: async () => ({ kinds: {} }) } as any, {} as any);

    const result = await service.item(actor, 'new');

    expect(prisma.stockTransaction.findMany.mock.calls[0][0].where).toEqual({ branchId: 'clinic', itemId: { in: ['old', 'new', 'empty'] } });
    expect(result.itemLedger.rows.map((r: any) => [r.id, r.batchNumber, r.kind, r.in, r.out, r.batchClosing, r.itemClosing, r.counterparty, r.actor?.name])).toEqual([
      ['m1', 'old', 'PURCHASE', 5, null, 5, 5, 'Distributor 77', 'Asha Rao'],
      ['m2', 'new', 'PURCHASE', 10, null, 10, 15, 'Distributor 78', 'Asha Rao'],
      ['m3', 'new', 'SALE', null, 3, 7, 12, 'Patient One', 'Asha Rao'],
      ['m4', 'old', 'SALE', null, 2, 3, 10, 'Walk-in', 'Asha Rao'],
    ]);
    expect(result.itemLedger.rows.map((r: any) => r.channel)).toEqual(['PURCHASE_INVOICE', 'PURCHASE_INVOICE', 'PRESCRIPTION', 'PHARMACY_BILL']);
    expect(result.itemLedger).toMatchObject({ closing: 10, currentStock: 10, matches: true });
    expect(result.product).toEqual({ batchIds: ['old', 'new', 'empty'], physical: 10, held: 1, available: 9 });
    expect(result.batches.map((b: any) => [b.id, b.purchaseDiscountPercent, b.deletable, b.deleteBlockedReason])).toEqual([
      ['old', 5, false, 'Dispose or return remaining stock before deleting a batch'],
      ['new', 12.5, false, 'Dispose or return remaining stock before deleting a batch'],
      ['empty', null, true, null],
    ]);
  });

  it('blocks deleting an empty batch that still has stock movements', async () => {
    const opened = row('new', 0);
    prisma.inventoryItem.findFirst = jest.fn().mockResolvedValue(opened);
    prisma.inventoryItem.findMany.mockResolvedValue([opened]);
    prisma.stockTransaction = { findMany: jest.fn().mockResolvedValue([{
      id: 'm1', branchId: 'clinic', itemId: 'new', type: 'SALE', quantity: 1, quantityDelta: -1, reference: null, reason: null, notes: null,
      supplier: null, customer: null, batchNumber: 'new', createdAt: new Date('2026-11-01T00:00:00Z'), user: null,
    }]) };
    prisma.inventoryWorkflowEffect = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.pharmacyPurchaseInvoice = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.pharmacyInvoice = { findMany: jest.fn().mockResolvedValue([]) };
    service = new InventoryWorkspaceService(prisma, { permissions: async () => new Set(['inventory:item:read']), capabilities: async () => ({ kinds: {} }) } as any, {} as any);
    const { batches } = await service.item(actor, 'new');
    expect(batches[0]).toMatchObject({ deletable: false, deleteBlockedReason: 'Cannot delete item with existing stock transactions' });
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
