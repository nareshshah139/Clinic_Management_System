import { validate } from 'class-validator';
import { InventoryService } from '../inventory.service';
import { InventoryWorkflowService } from '../inventory-workflow.service';
import { UpdateInventoryItemDto } from '../dto/inventory.dto';

function inventoryFixture() {
  let item: any = {
    id: 'batch', branchId: 'branch', name: 'Cream', batchNumber: 'PACK-1',
    currentStock: 10, heldStock: 0, costPrice: 2, sellingPrice: 3,
    minStockLevel: 0, maxStockLevel: 20, expiryDate: new Date('2099-01-01'),
    status: 'ACTIVE', unit: 'PIECES', metadata: null, tags: null,
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  };
  let movement: any;
  const audits: any[] = [];
  const db: any = {
    $transaction: async (run: any) => run(db),
    inventoryStockOperation: { upsert: async ({ create }: any) => create },
    inventoryItem: {
      findFirst: async ({ where }: any) => where.id === item.id && where.branchId === item.branchId ? { ...item } : null,
      update: jest.fn(async ({ data }: any) => (item = { ...item, ...data })),
    },
    stockTransaction: {
      findUnique: async () => movement || null,
      create: jest.fn(async ({ data }: any) => (movement = { id: 'movement', ...data })),
      update: async ({ data }: any) => (movement = { ...movement, ...data }),
    },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
  };
  const service = new InventoryService(db);
  return { db, service, audits, item: () => item };
}

const sale = { operationId: 'sale-1', itemId: 'batch', type: 'SALE', quantity: 1, unitPrice: 3 } as any;

describe('stock movement sale eligibility', () => {
  it.each([
    { expiryDate: new Date('2020-01-01') },
    { status: 'INACTIVE' },
    { status: 'DISCONTINUED' },
  ])('rejects an unsaleable batch through the generic API: %p', async override => {
    const f = inventoryFixture(); Object.assign(f.item(), override);
    await expect(f.service.createStockTransaction(sale, 'branch', 'operator')).rejects.toThrow('cannot be sold');
    expect(f.item().currentStock).toBe(10);
    expect(f.db.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects an expired bulk sale row without changing its balance', async () => {
    const f = inventoryFixture(); f.item().expiryDate = new Date('2020-01-01');
    const result = await f.service.bulkStockUpdate({ operationId: 'bulk-1', transactions: [{ ...sale, rowId: 'row-1' }] }, 'branch', 'operator');
    expect(result.results[0]).toMatchObject({ rowId: 'row-1', success: false });
    expect(result.results[0].error).toContain('cannot be sold');
    expect(f.item().currentStock).toBe(10);
  });

  it('allows sale through the expiry UTC day and replays the committed movement once', async () => {
    const f = inventoryFixture(); f.item().expiryDate = new Date(new Date().toISOString().slice(0, 10));
    const first = await f.service.createStockTransaction(sale, 'branch', 'operator');
    const replay = await f.service.createStockTransaction(sale, 'branch', 'operator');
    expect(first.id).toBe('movement'); expect(replay.id).toBe('movement');
    expect(f.item().currentStock).toBe(9);
  });

  it.each([['RETURN', 11], ['EXPIRED', 9], ['DAMAGED', 9]])('retains legitimate %s of expired inactive stock', async (type, balance) => {
    const f = inventoryFixture(); Object.assign(f.item(), { expiryDate: new Date('2020-01-01'), status: 'INACTIVE' });
    await f.service.createStockTransaction({ ...sale, type }, 'branch', 'operator');
    expect(f.item().currentStock).toBe(balance);
  });
});

describe('legacy item metadata command', () => {
  it('requires a revision at DTO validation', async () => {
    const errors = await validate(Object.assign(new UpdateInventoryItemDto(), { batchNumber: 'CORRECTED' }));
    expect(errors.map(error => error.property)).toContain('updatedAt');
  });

  it.each([
    [{ batchNumber: 'CORRECTED' }, 'changed'],
    [{ updatedAt: '2020-01-01T00:00:00.000Z', batchNumber: 'CORRECTED', reason: 'Pack checked' }, 'changed'],
    [{ batchNumber: 'CORRECTED', updatedAt: '2026-11-01T00:00:00.000Z' }, 'reason'],
    [{ expiryDate: '2027-02-29', updatedAt: '2026-11-01T00:00:00.000Z', reason: 'Pack checked' }, 'valid expiry'],
    [{ status: 'INACTIVE', updatedAt: '2026-11-01T00:00:00.000Z' }, 'remaining stock'],
    [{ minStockLevel: 30, maxStockLevel: 5, updatedAt: '2026-11-01T00:00:00.000Z', reason: 'Targets checked' }, 'Minimum'],
    [{ minStockLevel: 5, updatedAt: '2026-11-01T00:00:00.000Z' }, 'reason'],
    [{ costPrice: 10, updatedAt: '2026-11-01T00:00:00.000Z' }, 'purchase cost'],
  ])('rejects unsafe correction %p', async (input, message) => {
    const f = inventoryFixture();
    await expect((f.service.updateInventoryItem as any)('batch', input, 'branch', 'operator')).rejects.toThrow(message as string);
    expect(f.item().batchNumber).toBe('PACK-1'); expect(f.item().status).toBe('ACTIVE');
    expect(f.item().currentStock).toBe(10); expect(f.audits).toEqual([]);
    expect(f.db.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('audits a valid correction with operator, revision, reason and unchanged stock', async () => {
    const f = inventoryFixture();
    const result = await (f.service.updateInventoryItem as any)('batch', {
      updatedAt: f.item().updatedAt.toISOString(), batchNumber: 'CORRECTED', expiryDate: '2028-02-29',
      reason: ' Checked printed pack ', storageLocation: 'Shelf A', sellingPrice: 4,
    }, 'branch', 'operator');
    expect(result).toMatchObject({ batchNumber: 'CORRECTED', storageLocation: 'Shelf A', currentStock: 10, costPrice: 2, sellingPrice: 4 });
    expect(f.item().expiryDate.toISOString()).toBe('2028-02-29T23:59:59.999Z');
    expect(f.audits).toHaveLength(1); expect(f.audits[0].userId).toBe('operator');
    expect(JSON.parse(f.audits[0].oldValues).batchNumber).toBe('PACK-1');
    expect(JSON.parse(f.audits[0].newValues)).toMatchObject({ batchNumber: 'CORRECTED', reason: 'Checked printed pack' });
  });
});

describe('workflow save replay authorization', () => {
  const actor = { id: 'operator', branchId: 'branch', role: 'RECEPTION' } as any;
  function fixture(kind: string, permissions: string[]) {
    const doc = { id: 'saved', branchId: 'branch', kind, status: 'POSTED', version: 1, totalAmount: 5000, requestKey: 'known-key', payload: { lines: [] } };
    const db: any = {
      user: { findFirst: async () => ({ role: 'RECEPTION', permissions }) },
      role: { findFirst: async () => ({ permissions: [] }) },
      inventoryWorkflowDocument: { findUnique: async () => doc },
      $transaction: async (run: any) => run(db),
    };
    return new InventoryWorkflowService(db);
  }
  const dto = { kind: 'LOSS', requestKey: 'known-key', reference: 'probe', payload: { lines: [] } } as any;

  it('does not disclose a stored financial document to a movement-only actor', async () => {
    const service = fixture('CREDIT_NOTE', ['inventory:transaction:create', 'inventory:item:read']);
    await expect(service.saveDocument(actor, dto)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a request key bound to another kind even when both kinds are authorized', async () => {
    const service = fixture('CREDIT_NOTE', ['inventory:transaction:create', 'pharmacy:purchase-ledger:read']);
    await expect(service.saveDocument(actor, dto)).rejects.toMatchObject({ status: 409 });
  });
  it('does not use write access as read access for a replay', async () => {
    const service = fixture('LOSS', ['inventory:transaction:create']);
    await expect(service.saveDocument(actor, dto)).rejects.toMatchObject({ status: 403 });
  });
  it('returns the original document on an authorized same-kind replay', async () => {
    const service = fixture('LOSS', ['inventory:transaction:create', 'inventory:item:read']);
    expect(await service.saveDocument(actor, dto)).toMatchObject({ id: 'saved', kind: 'LOSS', status: 'POSTED', totalAmount: 5000 });
  });
});
