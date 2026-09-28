import { DrugService } from '../drug.service';
import { movementDelta } from '../../inventory/inventory-stock';

function fixture(linked = true) {
  const drug = { id: 'drug', branchId: 'clinic', price: 20 };
  const item = { id: 'batch', branchId: 'clinic', name: 'Clinic medicine', batchNumber: 'B1', sellingPrice: 20, costPrice: 10,
    currentStock: 10, heldStock: 2, unit: 'PACKS', status: 'ACTIVE', updatedAt: new Date('2026-01-01'), drugs: linked ? [drug] : [] };
  const other = { ...item, id: 'other', currentStock: 50 };
  let request: any;
  const movements: any[] = [];
  const db: any = {
    $transaction: jest.fn(async fn => fn(db)),
    inventoryItem: {
      findFirst: jest.fn(async ({ where }) => where.branchId === item.branchId && where.id === item.id ? { ...item, drugs: [...item.drugs] } : null),
      update: jest.fn(async ({ data }) => Object.assign(item, data)),
    },
    drug: { update: jest.fn(async ({ data }) => Object.assign(drug, data)) },
    stockTransaction: { create: jest.fn(async ({ data }) => { movements.push(data); return data; }) },
    drugInventoryChangeRequest: {
      findFirst: jest.fn(async ({ where }) => where.status ? request?.status === 'PENDING' ? request : null : request),
      create: jest.fn(async ({ data }) => request = { id: 'request', status: 'PENDING', drug: linked ? drug : null, ...data }),
      update: jest.fn(async ({ data }) => request = { ...request, ...data }),
    },
  };
  const service = new DrugService(db);
  const submit = (overrides: any = {}, branchId = 'clinic') => service.createInventoryChangeRequests({ changes: [{
    scope: 'BATCH', inventoryItemId: item.id, expectedUpdatedAt: item.updatedAt.toISOString(), proposedStock: 7,
    reason: 'Shelf count B1', ...overrides,
  }] }, branchId, 'pharmacist');
  const approve = () => service.approveInventoryChangeRequest('request', {}, 'clinic', 'doctor');
  return { db, service, item, other, drug, submit, approve, movements, request: () => request };
}

it.each([true, false])('queues a batch count without changing stock, then approves only that batch (linked=%s)', async linked => {
  const f = fixture(linked);
  await f.submit();
  expect(f.item.currentStock).toBe(10);
  expect(f.movements).toHaveLength(0);
  expect(f.request()).toMatchObject({ status: 'PENDING', currentStock: 10, proposedStock: 7, drugId: linked ? 'drug' : null });
  await f.approve();
  expect(f.item.currentStock).toBe(7);
  expect(f.item.heldStock).toBe(2);
  expect(f.other.currentStock).toBe(50);
  expect(movementDelta(f.movements[0])).toBe(-3);
  expect(f.request().status).toBe('APPROVED');
  await expect(f.approve()).rejects.toThrow('pending');
  expect(f.movements).toHaveLength(1);
});

it.each([true, false])('approves selling price and synchronizes only an existing unique drug link (linked=%s)', async linked => {
  const f = fixture(linked);
  await f.submit({ proposedStock: undefined, proposedPrice: 25 });
  expect(f.item.sellingPrice).toBe(20);
  await f.approve();
  expect(f.item.sellingPrice).toBe(25);
  expect(f.drug.price).toBe(linked ? 25 : 20);
  expect(f.movements).toHaveLength(0);
});

it.each(['stock', 'held', 'revision', 'price', 'identity'])('rejects an approval after concurrent %s changes', async change => {
  const f = fixture(); await f.submit();
  if (change === 'stock') f.item.currentStock = 9;
  if (change === 'held') f.item.heldStock = 3;
  if (change === 'revision') f.item.updatedAt = new Date('2026-02-01');
  if (change === 'price') f.drug.price = 21;
  if (change === 'identity') f.item.drugs = [];
  await expect(f.approve()).rejects.toThrow('changed');
  expect(f.movements).toHaveLength(0);
  expect(f.request().status).toBe('PENDING');
});

it('requires a reason, revision, whole nonnegative count and branch ownership', async () => {
  const f = fixture();
  for (const values of [{ reason: ' ' }, { expectedUpdatedAt: 'stale' }, { proposedStock: -1 }, { proposedStock: 1.5 }, { proposedStock: 1 }, { proposedStock: 10 }]) {
    await expect(f.submit(values)).rejects.toThrow();
  }
  await expect(f.submit({}, 'foreign')).rejects.toThrow('not found');
  expect(f.db.drugInventoryChangeRequest.create).not.toHaveBeenCalled();
});

it('blocks duplicate pending edits and ambiguous price links', async () => {
  const f = fixture(); await f.submit();
  await expect(f.submit()).rejects.toThrow('already awaiting');
  const g = fixture(); g.item.drugs.push({ ...g.drug, id: 'another' });
  await expect(g.submit({ proposedPrice: 22 })).rejects.toThrow('ambiguous');
});
