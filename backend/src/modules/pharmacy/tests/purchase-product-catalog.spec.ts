import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

describe('Invoice product catalog correctness', () => {
  let service: PharmacyPurchaseInvoiceService;
  let db: any;
  const item = { productName: 'Example Cosmetic Serum', manufacturer: '', packSize: '30ML', packUnitType: 'Pack', hsnCode: '33049990', mrp: 4500, purchaseRate: 3051 };
  beforeEach(() => {
    db = { drug: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn(),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'new-product', ...data })), update: jest.fn() },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(async ({data}) => data) } };
    service = new PharmacyPurchaseInvoiceService(db);
  });
  const create = (catalog?: any) => service.confirmMasterRecord({ action: 'CREATE_NEW', item, catalog } as any, 'branch-1');

  it('creates a cosmetic with unknown clinical fields left null and prescription not required', async () => {
    const result = await create({ productKind: 'COSMETIC' });
    expect(result.drug).toMatchObject({ type: 'cosmetic', category: 'Cosmetic', composition1: null, dosageForm: null, strength: null, requiresPrescription: false });
    expect(db.drug.create.mock.calls[0][0].data.description).not.toContain('pharmacist-confirmed');
  });

  it('requires an explicit product kind instead of defaulting to medicine', async () => {
    await expect(create()).rejects.toThrow(/product kind/i);
    expect(db.drug.create).not.toHaveBeenCalled();
  });

  it('requires actual medicine details instead of accepting inferred or placeholder values', async () => {
    await expect(create({ productKind: 'MEDICINE', category: 'Uncategorized', composition1: item.productName, dosageForm: 'Tablet', strength: 'Review strength', requiresPrescription: true })).rejects.toThrow(/category|strength/i);
    expect(db.drug.create).not.toHaveBeenCalled();
  });

  it('persists explicitly entered medicine details and an OTC choice', async () => {
    const result = await create({ productKind: 'MEDICINE', category: 'Test category', composition1: 'Test ingredient', dosageForm: 'Cream', strength: '1%', requiresPrescription: false });
    expect(result.drug).toMatchObject({ type: 'allopathy', category: 'Test category', composition1: 'Test ingredient', dosageForm: 'Cream', strength: '1%', requiresPrescription: false });
  });

  it('allows cosmetic stock with absent clinical fields and preserves its non-medicine classification', async () => {
    const drug = { id: 'cosmetic', name: item.productName, packSizeLabel: '30ML', type: 'cosmetic', category: 'Cosmetic', requiresPrescription: false, composition1: null, dosageForm: null, strength: null };
    db.drug.findMany.mockResolvedValue([drug]);
    expect(await (service as any).resolvePurchaseLineDrug(db, item, 'branch-1')).toEqual(drug);
    await (service as any).applyPurchaseLineToInventory(db, { distributorName: 'Test supplier' }, { ...item, batchNumber: 'TEST', expiryMonth: 12, expiryYear: 2099, quantityPurchased: 6, freeQuantity: 3 }, drug, 'branch-1');
    expect(db.inventoryItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'CONSUMABLE', requiresPrescription: false, genericName: null, currentStock: 9 }) }));
  });

  it('blocks legacy generated medicine placeholders at the stock-commit boundary', async () => {
    db.drug.findMany.mockResolvedValue([{ id: 'old-generated', name: item.productName, packSizeLabel: '30ML', type: 'allopathy', category: 'Uncategorized', composition1: item.productName, dosageForm: 'Tablet', strength: 'Review strength' }]);
    await expect((service as any).resolvePurchaseLineDrug(db, item, 'branch-1')).rejects.toThrow(/incomplete/);
  });
  it('repairs only an active product in the authenticated branch without writing stock', async () => {
    db.drug.findFirst.mockResolvedValue({ id: 'old', type: 'allopathy' });
    db.drug.update.mockImplementation(async ({data}) => ({ id: 'old', ...data }));
    const result = await service.updateProductCatalog('old', { productKind: 'COSMETIC' }, 'branch-1');
    expect(db.drug.findFirst).toHaveBeenCalledWith({ where: { id: 'old', branchId: 'branch-1', isActive: true, isDiscontinued: false } });
    expect(result).toMatchObject({ type: 'cosmetic', composition1: null, dosageForm: null, strength: null, requiresPrescription: false, catalogIssues: [] });
    expect(db.inventoryItem.create).not.toHaveBeenCalled();
  });
  it('rejects correction of a product outside this branch', async () => {
    await expect(service.updateProductCatalog('elsewhere', { productKind: 'COSMETIC' }, 'branch-1')).rejects.toThrow(/not found/);
    expect(db.drug.update).not.toHaveBeenCalled();
  });
  it('preserves the existing medicine system when correcting verified medicine details', async () => {
    db.drug.findFirst.mockResolvedValue({ id: 'old', type: 'ayurveda' });
    db.drug.update.mockImplementation(async ({data}) => ({ id: 'old', ...data }));
    const result = await service.updateProductCatalog('old', { productKind: 'MEDICINE', composition1: 'Test ingredient', category: 'Test category', dosageForm: 'Cream', strength: '1%', requiresPrescription: false }, 'branch-1');
    expect(result).toMatchObject({ type: 'ayurveda', requiresPrescription: false });
  });
  it('honors an explicit non-prescription choice for a medicine when adding stock', async () => {
    await (service as any).applyPurchaseLineToInventory(db, { distributorName: 'Test supplier' }, { ...item, batchNumber: 'TEST', expiryMonth: 12, expiryYear: 2099, quantityPurchased: 6, freeQuantity: 3 }, { id: 'otc', name: 'Synthetic medicine', type: 'allopathy', category: 'Test category', requiresPrescription: false }, 'branch-1');
    expect(db.inventoryItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'MEDICINE', requiresPrescription: false }) }));
  });

});
