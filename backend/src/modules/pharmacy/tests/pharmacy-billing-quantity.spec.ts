import { PharmacyPrescriptionQueueService } from '../pharmacy-prescription-queue.service';
import { billingQuantity } from '../pharmacy-billing-quantity';

type Line = Record<string, unknown>;

const inventory: Record<string, Record<string, unknown>> = {
  'inv-serum': { id: 'inv-serum', name: 'Anaboom Pro Advanced Hair Serum', unit: 'BOTTLES', packSize: 60, packUnit: 'ml', sellingPrice: 1450 },
  'inv-foitrax': { id: 'inv-foitrax', name: 'Foitrax 10', unit: 'PIECES', packSize: 1, packUnit: 'tablets', sellingPrice: 12 },
  'inv-tricogro': { id: 'inv-tricogro', name: 'TRICOGRO TABLET', unit: 'STRIPS', packSize: 10, packUnit: 'tablets', sellingPrice: 150 },
  'inv-tricogro-pieces': { id: 'inv-tricogro-pieces', name: 'TRICOGRO TABLET', unit: 'PIECES', packSize: 1, packUnit: 'tablets', sellingPrice: 15 },
  'inv-nopack': { id: 'inv-nopack', name: 'Nopack Tablet', unit: 'STRIPS', packSize: null, packUnit: null, sellingPrice: 100 },
  'inv-folvite': { id: 'inv-folvite', name: 'Folvite 5mg', unit: 'STRIPS', packSize: 10, packUnit: 'tablets', sellingPrice: 30 },
};

const stockCheck = async (lines: Line[]) => {
  const stocked = (id: string) => ({
    ...inventory[id], branchId: 'branch-1', status: 'ACTIVE', currentStock: 100, heldStock: 0,
    expiryDate: new Date('2099-01-01'), stockStatus: 'IN_STOCK', drugs: [],
  });
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'rx-1' }]),
    prescription: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'rx-1', createdAt: new Date(), updatedAt: new Date(), items: JSON.stringify(lines),
        visit: { patient: { id: 'patient-1' }, doctor: { id: 'doctor-1', firstName: 'Test', lastName: 'Doctor' } },
        pharmacyInvoices: [],
      }),
    },
    prescriptionInventoryLink: { findUnique: jest.fn().mockResolvedValue(null) },
    inventoryItem: {
      findFirst: jest.fn(async ({ where }: any) => (inventory[where.id] ? stocked(where.id) : null)),
      findMany: jest.fn(async (args: any) => {
        const anchor = Object.keys(inventory).filter(
          (id) => inventory[id].name === args.where.name?.equals,
        );
        return anchor.length ? [stocked(anchor[0])] : [];
      }),
    },
  };
  const service = new PharmacyPrescriptionQueueService(prisma, {} as any);
  return (await service.stockCheck('rx-1', 'branch-1')).items;
};

const tablet = { dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' };

describe('billing quantity from stockCheck', () => {
  it('fills the four real prescription lines', async () => {
    const items = await stockCheck([
      { drugName: 'ANABOOM PRO ADVANCED HAIR SERUM', inventoryItemId: 'inv-serum', dosage: 2, dosageUnit: 'ML', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS' },
      { drugName: 'Foitrax 10', inventoryItemId: 'inv-foitrax', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 16, durationUnit: 'WEEKS', instructions: 'weekly once- Sunday' },
      { drugName: 'TRICOGRO TABLET', inventoryItemId: 'inv-tricogro', ...tablet },
      { drugName: 'Folvite 5mg', inventoryItemId: 'inv-folvite', dosage: 5, dosageUnit: 'MG', frequency: 'ONCE_DAILY', duration: 30, durationUnit: 'DAYS', quantity: 5 },
    ]);
    expect(items[0].billingQuantity).toMatchObject({ quantity: 1, unit: 'BOTTLES', review: { reason: 'pack_item' } });
    expect(items[1]).toMatchObject({ prescribedQuantity: 16, billingQuantity: { quantity: 16, unit: 'PIECES', review: { reason: 'schedule_conflict' } } });
    expect(items[2].billingQuantity).toEqual({ quantity: 3, unit: 'STRIPS', review: null });
    expect(items[3].billingQuantity).toEqual({ quantity: 5, unit: 'STRIPS', review: null });
  });

  it('bills a countable item in pieces when the inventory sells pieces', async () => {
    const [item] = await stockCheck([{ drugName: 'TRICOGRO TABLET', inventoryItemId: 'inv-tricogro-pieces', ...tablet }]);
    expect(item.billingQuantity).toEqual({ quantity: 30, unit: 'PIECES', review: null });
  });

  it('flags a strip product with no pack size and fills 1', async () => {
    const [item] = await stockCheck([{ drugName: 'Nopack Tablet', inventoryItemId: 'inv-nopack', ...tablet }]);
    expect(item.billingQuantity).toMatchObject({ quantity: 1, unit: 'STRIPS', review: { reason: 'pack_size_unknown' } });
  });

  it('fills 1 and flags a line whose frequency is unknown', async () => {
    const [item] = await stockCheck([{ drugName: 'TRICOGRO TABLET', inventoryItemId: 'inv-tricogro', ...tablet, frequency: 'WHENEVER' }]);
    expect(item.billingQuantity).toMatchObject({ quantity: 1, review: { reason: 'schedule_unknown' } });
  });

  it('counts every alternate day as a schedule conflict', async () => {
    const [item] = await stockCheck([{ drugName: 'Foitrax 10', inventoryItemId: 'inv-foitrax', ...tablet, instructions: 'Take every alternate day' }]);
    expect(item.billingQuantity).toMatchObject({ quantity: 15, unit: 'PIECES', review: { reason: 'schedule_conflict' } });
  });

  it('fills 1 pack with no unit for an unmatched serum', async () => {
    const [item] = await stockCheck([{ drugName: 'Mystery Hair Serum', ...tablet }]);
    expect(item.billingQuantity).toMatchObject({ quantity: 1, unit: null, review: { reason: 'pack_item' } });
  });
});

describe('billingQuantity', () => {
  it('lets an explicit quantity win for a measured item', () => {
    expect(billingQuantity({ quantity: 2 }, { unit: 'BOTTLES', packSize: 60, packUnit: 'ml' }, 'Hair Serum'))
      .toEqual({ quantity: 2, unit: 'BOTTLES', review: null });
  });

  it('reads twice a week from instructions', () => {
    expect(billingQuantity(
      { frequency: 'TWICE_DAILY', duration: 4, durationUnit: 'WEEKS', instructions: 'Twice a week' },
      { unit: 'PIECES', packSize: 1, packUnit: 'tablets' }, 'Tab',
    )).toMatchObject({ quantity: 8, review: { reason: 'schedule_conflict' } });
  });

  it('does not flag instructions that agree with the frequency', () => {
    expect(billingQuantity(
      { frequency: 'WEEKLY', duration: 4, durationUnit: 'WEEKS', instructions: 'once a week' },
      { unit: 'PIECES', packSize: 1, packUnit: 'tablets' }, 'Tab',
    )).toEqual({ quantity: 4, unit: 'PIECES', review: null });
  });
});
