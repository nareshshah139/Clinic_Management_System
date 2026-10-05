import { DrugService } from '../drug.service';
import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';
import { movementDelta } from '../../inventory/inventory-stock';

const branchId = 'branch-1';
const actor = { id: 'reviewer', branchId, role: 'ADMIN' };
const product = { id: 'drug-1', branchId, name: 'Medicine A', price: 20, isActive: true };
const batch = (extra = {}) => ({
  id: 'batch-1', branchId, name: 'Medicine A', batchNumber: 'BATCH',
  status: 'ACTIVE', currentStock: 100, heldStock: 0, costPrice: 10,
  unit: 'PIECES', packSize: 1, packUnit: 'TABLETS', expiryDate: null,
  updatedAt: new Date('2026-01-01'), drugs: [product], ...extra,
});

function approvalFixture(rows = [batch()]) {
  let request: any;
  const movements: any[] = [];
  const db: any = {
    $transaction: jest.fn(async (work: any) => typeof work === 'function' ? work(db) : Promise.all(work)),
    drug: {
      findMany: jest.fn(async () => [{ ...product, inventoryItems: rows }]),
      update: jest.fn(async ({ data }) => ({ ...product, ...data })),
    },
    inventoryItem: {
      findMany: jest.fn(async () => rows),
      findFirst: jest.fn(async ({ where }) => ({ ...rows.find(row => row.id === where.id) })),
      update: jest.fn(async ({ where, data }) => Object.assign(rows.find(row => row.id === where.id)!, data)),
    },
    stockTransaction: { create: jest.fn(async ({ data }) => { movements.push(data); return data; }) },
    drugInventoryChangeRequest: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => request),
      create: jest.fn(async ({ data }) => (request = { id: 'request-1', status: 'PENDING', drug: product, ...data })),
      update: jest.fn(async ({ data }) => (request = { ...request, ...data })),
    },
  };
  const service = new DrugService(db);
  const propose = async (stock: number) => service.createInventoryChangeRequests({
    changes: [{ drugId: product.id, inventoryItemId: rows[0].id, proposedStock: stock, reason: 'Physical count' }],
  }, branchId, 'pharmacist');
  const approve = () => service.approveInventoryChangeRequest('request-1', {}, branchId, actor.id);
  return { db, rows, movements, service, propose, approve, request: () => request };
}

describe('Inventory Updates stock integrity', () => {
  it('rejects a count that would consume held stock', async () => {
    const f = approvalFixture([batch({ heldStock: 30 })]);
    await f.propose(20);
    await expect(f.approve()).rejects.toThrow(/held|available/i);
    expect(f.movements).toHaveLength(0);
    expect(f.rows[0].currentStock).toBe(100);
  });

  it.each([90, 110])('records the signed balance change for count %i', async count => {
    const f = approvalFixture();
    await f.propose(count); await f.approve();
    expect(f.rows[0].currentStock).toBe(count);
    expect(movementDelta(f.movements[0])).toBe(count - 100);
    expect(JSON.parse(f.movements[0].notes)).toMatchObject({ beforeStock: 100, afterStock: count });
    expect(f.db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it.each(['sale', 'hold', 'revision', 'new batch'])('rejects a stale count after %s', async change => {
    const f = approvalFixture();
    await f.propose(90);
    if (change === 'sale') f.rows[0].currentStock = 95;
    if (change === 'hold') f.rows[0].heldStock = 5;
    if (change === 'revision') f.rows[0].updatedAt = new Date('2026-02-01');
    if (change === 'new batch') f.rows.push(batch({ id: 'batch-2', currentStock: 0 }));
    await expect(f.approve()).rejects.toThrow(/changed|stale|resubmit/i);
    expect(f.movements).toHaveLength(0);
  });

  it('rejects aggregate counts across incompatible stock units', async () => {
    const f = approvalFixture([batch(), batch({ id: 'batch-2', unit: 'STRIPS', packSize: 10 })]);
    await expect(f.propose(150)).rejects.toThrow(/unit|pack|batch/i);
  });

  it('requires re-submission of legacy stock requests with no saved snapshot', async () => {
    const f = approvalFixture();
    await f.propose(90); delete f.request().stockSnapshot;
    await expect(f.approve()).rejects.toThrow(/resubmit|snapshot/i);
    expect(f.movements).toHaveLength(0);
  });

  it('does not apply an already approved request twice', async () => {
    const f = approvalFixture();
    await f.propose(90); await f.approve();
    await expect(f.approve()).rejects.toThrow(/pending/i);
    expect(f.movements).toHaveLength(1);
  });
});

describe('Billing queue represents posted stock only', () => {
  it.each(['DRAFT', 'PENDING'])('keeps a prescription pending when its only invoice is %s', async status => {
    const prescription = {
      id: 'rx-1', createdAt: new Date(), items: JSON.stringify([{ drugId: product.id, drugName: product.name, quantity: 10 }]),
      visit: { patient: { id: 'patient-1' }, doctor: { id: actor.id, firstName: 'Test', lastName: 'Doctor' } },
      pharmacyInvoices: [{ id: 'invoice-1', status, items: [{ quantity: 10, drug: product }] }],
    };
    const service = new PharmacyPrescriptionQueueService({ $queryRaw: async () => [{ id: 'rx-1' }], prescription: { findFirst: async () => prescription } } as any, {} as any);
    const entry = await service.findOne(prescription.id, branchId);
    expect(entry.status).toBe('pending');
    expect(entry.medications[0].dispensedQuantity).toBe(0);
    expect(entry.linkedInvoiceIds).toEqual(['invoice-1']);
  });
});


describe('Pharmacy alternative stock availability', () => {
  const candidate = (items: any[]) => ({ ...product, inventoryItems: items });
  const alternatives = (items: any[]) => new DrugService({ drug: {
    findFirst: jest.fn().mockResolvedValue({ ...product, composition1: 'Ingredient', strength: '5mg', dosageForm: 'Tablet' }),
    findMany: jest.fn().mockResolvedValue([candidate(items)]),
  } } as any).getAlternatives('source', branchId);

  it('subtracts holds and retains stock expiring on the current calendar day', async () => {
    const result = await alternatives([batch({ currentStock: 10, heldStock: 8, expiryDate: new Date(new Date().toISOString().slice(0, 10)) })]);
    expect(result).toHaveLength(1);
    expect(result[0].totalStock).toBe(2);
  });

  it('does not recommend completely held or expired stock', async () => {
    expect(await alternatives([batch({ heldStock: 100 }), batch({ id: 'expired', expiryDate: new Date('2020-01-01') })])).toEqual([]);
  });

  it('does not add quantities across incompatible pack units', async () => {
    expect(await alternatives([batch(), batch({ id: 'strip', unit: 'STRIPS', packSize: 10 })])).toEqual([]);
  });
});
