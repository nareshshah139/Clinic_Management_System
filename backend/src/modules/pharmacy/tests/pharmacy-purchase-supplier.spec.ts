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
});
