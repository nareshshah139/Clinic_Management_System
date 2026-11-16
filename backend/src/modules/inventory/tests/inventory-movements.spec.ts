import { InventoryWorkspaceService } from '../inventory-workspace.service';
import { inventoryMovementQuery } from '../inventory-movements';

describe('Inventory movement history', () => {
  const actor = { id: 'staff', branchId: 'clinic-a', role: 'PHARMACIST' };
  const movement = {
    id: 'move-1',
    itemId: 'batch-1',
    type: 'PURCHASE',
    quantity: 12,
    quantityDelta: null,
    notes: null,
    reason: null,
    reference: 'BILL-1',
    batchNumber: 'A-1',
    createdAt: new Date('2026-11-05T10:00:00.000Z'),
    item: { name: 'Example cream', batchNumber: 'A-1', unit: 'TUBES' },
    user: { firstName: 'Clinic', lastName: 'Staff' },
  };
  let prisma: any, service: InventoryWorkspaceService;
  beforeEach(() => {
    prisma = {
      stockTransaction: {
        findMany: jest.fn().mockResolvedValue([movement]),
        count: jest.fn().mockResolvedValue(31),
      },
    };
    service = new InventoryWorkspaceService(prisma, {
      permissions: async () => new Set(['inventory:item:read']),
    } as any);
  });

  it('returns a stable branch-scoped page of recorded movements without inferred balances or private fields', async () => {
    const result = await service.movements(actor, {
      page: '2',
      limit: '30',
      search: 'cream',
    });
    expect(result).toEqual({
      rows: [
        {
          id: 'move-1',
          itemId: 'batch-1',
          type: 'PURCHASE',
          quantity: 12,
          delta: 12,
          reference: 'BILL-1',
          reason: null,
          batchNumber: 'A-1',
          createdAt: movement.createdAt,
          itemName: 'Example cream',
          unit: 'TUBES',
          actorName: 'Clinic Staff',
        },
      ],
      page: 2,
      limit: 30,
      total: 31,
      totalPages: 2,
    });
    const query = prisma.stockTransaction.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      branchId: 'clinic-a',
      item: { branchId: 'clinic-a' },
      OR: [
        { item: { name: { contains: 'cream', mode: 'insensitive' } } },
        { item: { batchNumber: { contains: 'cream', mode: 'insensitive' } } },
        { batchNumber: { contains: 'cream', mode: 'insensitive' } },
        { reference: { contains: 'cream', mode: 'insensitive' } },
      ],
    });
    expect(query.skip).toBe(30);
    expect(query.take).toBe(30);
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(prisma.stockTransaction.count).toHaveBeenCalledWith({
      where: query.where,
    });
  });

  it('preserves unknown legacy adjustments and signed corrections', async () => {
    prisma.stockTransaction.findMany.mockResolvedValue([
      { ...movement, type: 'ADJUSTMENT', quantity: 7 },
      {
        ...movement,
        id: 'move-2',
        type: 'ADJUSTMENT',
        quantity: 2,
        quantityDelta: -2,
      },
      { ...movement, id: 'move-3', type: 'SALE', quantity: 3 },
    ]);
    expect(
      (await service.movements(actor, {})).rows.map((row) => row.delta),
    ).toEqual([null, -2, -3]);
  });

  it('rejects missing permission before reading any movement', async () => {
    service = new InventoryWorkspaceService(prisma, {
      permissions: async () => new Set(),
    } as any);
    await expect(service.movements(actor, {})).rejects.toThrow(
      'inventory:item:read',
    );
    expect(prisma.stockTransaction.findMany).not.toHaveBeenCalled();
  });

  it('keeps branch scope with batch, type and inclusive timestamp bounds', () => {
    expect(
      inventoryMovementQuery('clinic-a', {
        itemId: 'batch-from-another-branch',
        type: 'SALE',
        dateFrom: '2026-11-04T18:30:00.000Z',
        dateTo: '2026-11-05T18:29:59.999Z',
      }),
    ).toEqual({
      page: 1,
      limit: 30,
      where: {
        branchId: 'clinic-a',
        item: { branchId: 'clinic-a' },
        itemId: 'batch-from-another-branch',
        type: 'SALE',
        createdAt: {
          gte: new Date('2026-11-04T18:30:00.000Z'),
          lte: new Date('2026-11-05T18:29:59.999Z'),
        },
      },
    });
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { limit: '101' },
    { limit: 'NaN' },
    { type: 'OPENING' },
    { dateFrom: '2026-11-05' },
    { dateFrom: '2026-02-30T00:00:00.000Z' },
    {
      dateFrom: '2026-11-06T00:00:00.000Z',
      dateTo: '2026-11-05T00:00:00.000Z',
    },
    { search: 'x'.repeat(201) },
    { search: ['cream'] },
  ])('rejects invalid filters before a database read: %j', async (query) => {
    await expect(service.movements(actor, query as any)).rejects.toThrow();
    expect(prisma.stockTransaction.findMany).not.toHaveBeenCalled();
  });

  it('rejects an absent branch instead of removing tenant scope', () => {
    expect(() => inventoryMovementQuery(undefined as any, {})).toThrow(
      'active branch',
    );
  });
});
