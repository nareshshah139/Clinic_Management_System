import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';

describe('CR-10 prescription stock identity', () => {
  it('uses the saved inventory identity even when the prescribed name differs', async () => {
    const batch = { id: 'inventory-1', branchId: 'branch-1', name: 'Sebium Gel Moussant', currentStock: 24, heldStock: 0, unit: 'BOTTLE', minStockLevel: 2, status: 'ACTIVE', stockStatus: 'IN_STOCK', expiryDate: null, drugs: [{ id: 'drug-1', name: 'Sebium Gel Moussant', branchId: 'branch-1', isActive: true, isDiscontinued: false, minStockLevel: 2 }] };
    const prisma: any = {
      prescription: { findFirst: jest.fn().mockResolvedValue({ id: 'rx-1', createdAt: new Date(), items: JSON.stringify([{ drugName: 'SEBIUM gel moussant cleanser', inventoryItemId: batch.id, drugId: 'drug-1', quantity: 1 }]), visit: { patient: { id: 'p1', name: 'Patient' }, doctor: { id: 'd1', firstName: 'Doctor', lastName: '' } }, pharmacyInvoices: [] }) },
      drug: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      inventoryItem: { findFirst: jest.fn().mockResolvedValue(batch), findMany: jest.fn().mockResolvedValue([batch]) },
      prescriptionInventoryLink: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new PharmacyPrescriptionQueueService(prisma, { getAlternatives: jest.fn().mockResolvedValue([]) } as any);
    const result = await service.stockCheck('rx-1', 'branch-1');
    expect(result.items[0]).toMatchObject({ stockStatus: 'IN_STOCK', totalNonExpiredStock: 24 });
  });
});

import { availableStock, resolvePrescriptionInventory, searchClinicInventory } from '../pharmacy-stock-identity';

it('honors expiry through its UTC calendar day and subtracts held units regardless of stale status', () => {
  const item = { status: 'ACTIVE', currentStock: 14, heldStock: 4, expiryDate: new Date('2026-09-27'), stockStatus: 'EXPIRED' };
  expect(availableStock(item, new Date('2026-09-27T23:59:59Z'))).toBe(10);
  expect(availableStock(item, new Date('2026-09-28T00:00:00Z'))).toBe(0);
});
it('does not replace an invalid explicit inventory ID with a same-name item', async () => {
  const prisma: any = { inventoryItem: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() }, prescriptionInventoryLink: { findUnique: jest.fn() } };
  expect(await resolvePrescriptionInventory(prisma, { inventoryItemId: 'foreign-id', drugName: 'Cream' }, 'clinic')).toBeNull();
  expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-id', branchId: 'clinic', status: 'ACTIVE' } }));
  expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
});
it('rejects same-name products with different identities instead of taking the first', async () => {
  const prisma: any = { prescriptionInventoryLink: { findUnique: jest.fn().mockResolvedValue(null) }, inventoryItem: { findMany: jest.fn().mockResolvedValue([{ id: 'a', drugs: [{ id: 'one' }] }, { id: 'b', drugs: [{ id: 'two' }] }]) } };
  expect(await resolvePrescriptionInventory(prisma, { drugName: 'Cream' }, 'clinic')).toBeNull();
});
it('sums sibling batches even when only one name matches the search query', async () => {
  const d = { id: 'd', name: 'Old product label', branchId: 'clinic', isActive: true };
  const batch = { id: 'a', name: 'New cream label', unit: 'TUBES', packSize: 10, status: 'ACTIVE', currentStock: 5, drugs: [d] };
  const prisma: any = { inventoryItem: { findMany: jest.fn().mockResolvedValue([batch, { ...batch, id: 'b', name: 'Old product label', currentStock: 7 }]) } };
  expect((await searchClinicInventory(prisma, 'New cream label', 'clinic'))[0].totalStock).toBe(12);
});

it('counts billed quantities by saved identity when the prescription display name is different', async () => {
  const prisma: any = { prescription: { findFirst: jest.fn().mockResolvedValue({ id: 'rx', createdAt: new Date(), items: JSON.stringify([{ drugName: 'A custom display name', drugId: 'drug', inventoryItemId: 'batch', quantity: 3 }]), visit: { patient: { id: 'patient', name: 'Synthetic' }, doctor: { id: 'doctor', firstName: 'Synthetic', lastName: 'Doctor' } }, pharmacyInvoices: [{ id: 'bill', status: 'CONFIRMED', items: [{ inventoryItemId: 'batch', drug: { id: 'drug', name: 'Catalog name' }, quantity: 3 }] }] }) } };
  const result = await new PharmacyPrescriptionQueueService(prisma, {} as any).findOne('rx', 'clinic');
  expect(result.medications[0].dispensedQuantity).toBe(3);
  expect(result.status).toBe('dispensed');
});
