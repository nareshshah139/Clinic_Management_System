import { InventoryWorkspaceService } from '../inventory-workspace.service';

describe('saved batch corrections', () => {
  const actor = { id: 'reviewer', branchId: 'clinic' } as any;
  const item = {
    id: 'batch',
    branchId: 'clinic',
    batchNumber: 'WRONG',
    expiryDate: new Date('2027-01-31T23:59:59.999Z'),
    updatedAt: new Date('2026-10-01'),
    currentStock: 10,
    heldStock: 2,
    costPrice: 40,
    sellingPrice: 60,
    metadata: null,
  };
  let tx: any, service: InventoryWorkspaceService;
  beforeEach(() => {
    tx = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue(item),
        update: jest
          .fn()
          .mockImplementation(async ({ data }) => ({ ...item, ...data })),
      },
      auditLog: { create: jest.fn() },
    };
    service = new InventoryWorkspaceService(
      {} as any,
      {
        permissions: async () => new Set(['inventory:item:update']),
        transaction: (run: any) => run(tx),
      } as any,
    );
  });
  it('saves a verified batch/expiry with the actor, reason and old values, without moving stock', async () => {
    const saved = await service.saveItem(actor, item.id, {
      updatedAt: item.updatedAt.toISOString(),
      batchNumber: 'RIGHT',
      expiryDate: '2028-02-29',
      reason: 'Checked printed pack',
    });
    expect(saved.expiryDate.toISOString()).toBe('2028-02-29T23:59:59.999Z');
    expect(saved.currentStock).toBe(10);
    expect(saved.heldStock).toBe(2);
    const update = tx.inventoryItem.update.mock.calls[0][0];
    expect(update.where).toEqual({
      id: item.id,
      branchId: 'clinic',
      updatedAt: item.updatedAt,
    });
    expect(update.data).not.toHaveProperty('currentStock');
    expect(update.data).not.toHaveProperty('costPrice');
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.userId).toBe(actor.id);
    expect(JSON.parse(audit.oldValues)).toMatchObject({
      batchNumber: 'WRONG',
      expiryDate: item.expiryDate.toISOString(),
    });
    expect(JSON.parse(audit.newValues)).toMatchObject({
      batchNumber: 'RIGHT',
      reason: 'Checked printed pack',
    });
  });
  it.each([
    '2027-02-29',
    '2026-04-31',
    'not-a-date',
    '',
    '2028-01-01T00:00:00Z',
  ])('rejects invalid dates without writing: %s', async (expiryDate) => {
    await expect(
      service.saveItem(actor, item.id, {
        updatedAt: item.updatedAt.toISOString(),
        expiryDate,
        reason: 'Check',
      }),
    ).rejects.toThrow('valid expiry date');
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('rejects missing reasons and stale records', async () => {
    await expect(
      service.saveItem(actor, item.id, {
        updatedAt: item.updatedAt.toISOString(),
        batchNumber: 'RIGHT',
      }),
    ).rejects.toThrow('reason');
    await expect(
      service.saveItem(actor, item.id, {
        updatedAt: 'stale',
        expiryDate: '2028-12-31',
        reason: 'Check',
      }),
    ).rejects.toThrow('changed');
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });
  it('does not rewrite the timestamp when the saved calendar day is unchanged', async () => {
    await service.saveItem(actor, item.id, {
      updatedAt: item.updatedAt.toISOString(),
      expiryDate: '2027-01-31',
    });
    expect(tx.inventoryItem.update.mock.calls[0][0].data).not.toHaveProperty(
      'expiryDate',
    );
  });
  it('rejects a correction without item-write permission', async () => {
    service = new InventoryWorkspaceService(
      {} as any,
      { permissions: async () => new Set() } as any,
    );
    await expect(
      service.saveItem(actor, item.id, {
        updatedAt: item.updatedAt.toISOString(),
        expiryDate: '2028-12-31',
        reason: 'Check',
      }),
    ).rejects.toThrow('requires inventory:item:update');
    expect(tx.inventoryItem.findFirst).not.toHaveBeenCalled();
  });
});
