import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

describe('Verified supplier save from invoice review', () => {
  let db: any;
  let service: PharmacyPurchaseInvoiceService;
  const dto = { name: 'Example Supplies', gstNumber: '36ABCDE1234F1Z5', verified: true };
  beforeEach(() => {
    db = { $executeRaw: jest.fn(), supplier: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'supplier-1', ...data })) } };
    db.$transaction = jest.fn(async callback => callback(db));
    service = new PharmacyPurchaseInvoiceService(db);
  });

  it('saves only a verified, active supplier in the authenticated branch', async () => {
    await service.savePurchaseSupplier({ ...dto, name: ' Example Supplies ', gstNumber: dto.gstNumber.toLowerCase() }, 'branch-1');
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.supplier.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { branchId: 'branch-1' } }));
    expect(db.supplier.create).toHaveBeenCalledWith(expect.objectContaining({ data: { name: dto.name, gstNumber: dto.gstNumber, branchId: 'branch-1', isActive: true } }));
  });

  it('returns the same matching supplier on retry without creating or overwriting it', async () => {
    db.supplier.findMany.mockResolvedValue([{ id: 'existing', ...dto, isActive: true }]);
    expect(await service.savePurchaseSupplier({ ...dto, name: 'EXAMPLE SUPPLIES' }, 'branch-1')).toEqual({ id: 'existing', name: dto.name, gstNumber: dto.gstNumber });
    expect(db.supplier.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...dto, id: 'inactive', isActive: false }],
    [{ ...dto, id: 'different-name', name: 'Other Supplies', isActive: true }],
    [{ ...dto, id: 'different-gst', gstNumber: '36ABCDE1234F2Z5', isActive: true }],
    [{ ...dto, id: 'duplicate-1', isActive: true }, { ...dto, id: 'duplicate-2', isActive: true }],
  ])('rejects conflicting or inactive records without changing them', async (...rows) => {
    db.supplier.findMany.mockResolvedValue(rows);
    await expect(service.savePurchaseSupplier(dto, 'branch-1')).rejects.toThrow('already exists');
    expect(db.supplier.create).not.toHaveBeenCalled();
  });

  it.each([{ ...dto, verified: false }, { ...dto, gstNumber: 'invalid' }, { ...dto, name: '  ' }])('requires valid identity and explicit verification', async invalid => {
    await expect(service.savePurchaseSupplier(invalid, 'branch-1')).rejects.toThrow('confirm both');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('requires supplier creation permission in addition to invoice creation capability', async () => {
    db.user = { findUnique: jest.fn().mockResolvedValue({ role: 'RECEPTION', permissions: '["inventory:po:create"]' }) };
    db.role = { findFirst: jest.fn().mockResolvedValue({ permissions: '[]' }) };
    expect(await service.capabilities({ id: 'staff-1', role: 'RECEPTION' })).toMatchObject({ create: true, saveSupplier: false });
    db.role.findFirst.mockResolvedValue({ permissions: '["inventory:supplier:create"]' });
    expect(await service.capabilities({ id: 'staff-1', role: 'RECEPTION' })).toMatchObject({ create: true, saveSupplier: true });
  });

  it('offers each supplier saved and last-bill drug license from branch-scoped, non-cancelled bills', async () => {
    db.supplier.findMany.mockResolvedValue([
      { id: 's1', name: 'Apex', gstNumber: '36AAAAA1111A1Z5', drugLicenseNo: 'SAVED-DL', updatedAt: new Date() },
      { id: 's2', name: 'Shree', gstNumber: '27AABCS1234F1Z5', drugLicenseNo: null, updatedAt: new Date() },
      { id: 's3', name: 'New', gstNumber: null, drugLicenseNo: null, updatedAt: new Date() },
    ]);
    db.pharmacyPurchaseInvoice = { findMany: jest.fn().mockResolvedValue([{ distributorGstin: '27AABCS1234F1Z5', distributorDlNo: 'MH-PUN-SLV' }]) };
    const rows = await service.purchaseSuppliers('branch-1');
    expect(db.supplier.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { branchId: 'branch-1', isActive: true },
      select: expect.objectContaining({ drugLicenseNo: true }) }));
    expect(db.pharmacyPurchaseInvoice.findMany).toHaveBeenCalledWith({
      where: { branchId: 'branch-1', distributorGstin: { in: ['36AAAAA1111A1Z5', '27AABCS1234F1Z5'] }, distributorDlNo: { not: '' }, status: { not: 'CANCELLED' } },
      distinct: ['distributorGstin'], orderBy: [{ distributorGstin: 'asc' }, { createdAt: 'desc' }],
      select: { distributorGstin: true, distributorDlNo: true },
    });
    expect(rows.map(r => [r.id, r.drugLicenseNo, r.lastBillDrugLicenseNo])).toEqual([
      ['s1', 'SAVED-DL', null], ['s2', null, 'MH-PUN-SLV'], ['s3', null, null]]);
  });

  it('skips the bill query when no supplier has a GSTIN', async () => {
    db.supplier.findMany.mockResolvedValue([{ id: 's3', name: 'New', gstNumber: null, drugLicenseNo: null, updatedAt: new Date() }]);
    db.pharmacyPurchaseInvoice = { findMany: jest.fn() };
    const rows = await service.purchaseSuppliers('branch-1');
    expect(db.pharmacyPurchaseInvoice.findMany).not.toHaveBeenCalled();
    expect(rows[0].lastBillDrugLicenseNo).toBeNull();
  });
});
