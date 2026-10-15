import { PharmacyPartnerSalesService } from '../pharmacy-partner-sales.service';

const actor = { id: 'staff-1', branchId: 'branch-1', role: 'PHARMACIST' };

function fixture() {
  const item: any = {
    id: 'line-1',
    medicineName: 'Synthetic Cream',
    batchNumber: 'B-1',
    quantitySold: 7,
    committedQuantity: 5,
    matchedInventoryItemId: 'stock-1',
    matchedDrugId: 'drug-1',
    mrp: 10,
    discountGiven: 0,
    discrepancyFlag: 'INSUFFICIENT_STOCK',
  };
  const sale: any = {
    id: 'sale-1',
    branchId: actor.branchId,
    partnerOrganizationId: 'partner-1',
    partnerOrganizationName: 'Synthetic Partner',
    source: 'MANUAL',
    status: 'PARTIAL_STOCK_COMMITTED',
    version: 0,
    stockCommittedAt: new Date('2026-01-01'),
    discrepancyFlags: JSON.stringify(['INSUFFICIENT_STOCK']),
    items: [item],
  };
  const stock: any = {
    id: 'stock-1',
    branchId: actor.branchId,
    name: 'Synthetic Cream',
    batchNumber: 'B-1',
    currentStock: 5,
    heldStock: 1,
    costPrice: 5,
    status: 'ACTIVE',
    drugs: [{ id: 'drug-1', name: 'Synthetic Cream' }],
  };
  const movements: any[] = [];
  const tx: any = {
    partnerDailySale: {
      findFirst: jest.fn(async () => structuredClone(sale)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.version !== undefined && where.version !== sale.version)
          return { count: 0 };
        Object.assign(sale, data, {
          version: data.version?.increment
            ? sale.version + data.version.increment
            : sale.version,
        });
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(sale, data);
        return structuredClone(sale);
      }),
    },
    partnerDailySaleItem: {
      update: jest.fn(async ({ data }: any) => {
        Object.assign(item, data);
        return structuredClone(item);
      }),
    },
    inventoryItem: {
      findMany: jest.fn(async () => [structuredClone(stock)]),
      findFirst: jest.fn(async () => structuredClone(stock)),
      findUnique: jest.fn(async () => structuredClone(stock)),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(stock, data);
        return structuredClone(stock);
      }),
      updateMany: jest.fn(async ({ data }: any) => {
        stock.currentStock -= data.currentStock.decrement;
        return { count: 1 };
      }),
    },
    stockTransaction: {
      update: jest.fn(async ({ where, data }: any) => {
        const row = movements.find((row) => row.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `movement-${movements.length + 1}`, ...data };
        movements.push(row);
        return row;
      }),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const service = new PharmacyPartnerSalesService({
    $transaction: async (run: any) => run(tx),
  } as any);
  return { service, sale, item, stock, movements, tx };
}

describe('Partner outstanding stock recovery', () => {
  it('retries a legacy partial commit without deducting its five previously committed units', async () => {
    const { service, stock, movements } = fixture();
    const result = await (service as any).commitStock('sale-1', actor, {
      expectedVersion: 0,
    });
    expect({
      status: result.status,
      committed: result.items[0].committedQuantity,
      remainingStock: stock.currentStock,
      newDeductions: movements.reduce((sum, row) => sum + row.quantity, 0),
    }).toEqual({
      status: 'STOCK_COMMITTED',
      committed: 7,
      remainingStock: 3,
      newDeductions: 2,
    });
  });
  it('preserves held units and retries only the remainder after replenishment', async () => {
    const { service, stock, sale, movements } = fixture();
    stock.heldStock = 4;
    const first = await service.commitStock('sale-1', actor, {
      expectedVersion: 0,
    });
    expect([
      first.items[0].committedQuantity,
      stock.currentStock,
      stock.heldStock,
      first.status,
    ]).toEqual([6, 4, 4, 'PARTIAL_STOCK_COMMITTED']);
    await expect(
      service.commitStock('sale-1', actor, { expectedVersion: 0 }),
    ).rejects.toThrow('Refresh');
    stock.currentStock = 7;
    const second = await service.commitStock('sale-1', actor, {
      expectedVersion: sale.version,
    });
    expect([
      second.items[0].committedQuantity,
      stock.currentStock,
      stock.heldStock,
      second.status,
    ]).toEqual([7, 6, 4, 'STOCK_COMMITTED']);
    expect(movements.map((row) => row.quantityDelta)).toEqual([-1, -1]);
    expect(second.discrepancyFlags).toEqual([]);
    expect(second.items[0].discrepancyFlag).toBeNull();
  });

  it('returns the existing completed outcome when the response is lost and the request is repeated', async () => {
    const { service, stock, movements } = fixture();
    await service.commitStock('sale-1', actor, { expectedVersion: 0 });
    const repeated = await service.commitStock('sale-1', actor, {
      expectedVersion: 0,
    });
    expect([
      repeated.items[0].committedQuantity,
      stock.currentStock,
      movements.length,
    ]).toEqual([7, 3, 1]);
  });

  it('audits an explicit correction without changing sold snapshots, prior match or stock', async () => {
    const { service, sale, item, stock, movements, tx } = fixture();
    const original = {
      name: item.medicineName,
      quantity: item.quantitySold,
      committed: item.committedQuantity,
      matched: item.matchedInventoryItemId,
    };
    stock.id = 'corrected-batch';
    const result = await service.reconcileLine(
      'sale-1',
      'line-1',
      {
        expectedVersion: 0,
        inventoryItemId: stock.id,
        reason: 'Corrected product lookup',
      },
      actor,
    );
    expect({
      name: item.medicineName,
      quantity: item.quantitySold,
      committed: item.committedQuantity,
      matched: item.matchedInventoryItemId,
    }).toEqual(original);
    expect([
      result.items[0].recoveryInventoryItemId,
      sale.version,
      stock.currentStock,
      movements.length,
    ]).toEqual(['corrected-batch', 1, 5, 0]);
    expect(
      JSON.parse(tx.auditLog.create.mock.calls[0][0].data.newValues).reason,
    ).toBe('Corrected product lookup');
  });

  it('rejects stale corrections, completed lines and nonstaff correction attempts', async () => {
    const { service, item, movements, tx } = fixture();
    const correction = {
      expectedVersion: 1,
      inventoryItemId: 'stock-1',
      reason: 'Corrected product lookup',
    };
    await expect(
      service.reconcileLine('sale-1', 'line-1', correction, actor),
    ).rejects.toThrow('Refresh');
    item.committedQuantity = item.quantitySold;
    await expect(
      service.reconcileLine(
        'sale-1',
        'line-1',
        { ...correction, expectedVersion: 0 },
        actor,
      ),
    ).rejects.toThrow('outstanding');
    await expect(
      service.reconcileLine('sale-1', 'line-1', correction, {
        ...actor,
        role: 'PATIENT',
      }),
    ).rejects.toThrow('staff');
    expect([movements.length, tx.auditLog.create.mock.calls.length]).toEqual([
      0, 0,
    ]);
  });
});
