import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CorrectPharmacyPurchaseSupplierGstinDto } from '../dto/pharmacy-purchase-invoice.dto';
import { PharmacyPurchaseInvoiceService } from '../pharmacy-purchase-invoice.service';

const previous = { id: 'supplier-1', name: 'Synthetic Supplier', gstNumber: '36ABCDE1234F1Z5', updatedAt: new Date('2026-10-01T10:00:00Z') };
const correction = { gstNumber: '36ABCDE1234F2Z5', expectedGstNumber: previous.gstNumber,
  expectedUpdatedAt: previous.updatedAt.toISOString(), reason: 'Checked original invoice', verified: true };

describe('Saved supplier GSTIN corrections', () => {
  let tx: any;
  let db: any;
  let service: PharmacyPurchaseInvoiceService;
  beforeEach(() => {
    tx = { $executeRaw: jest.fn(), supplier: {
      findFirst: jest.fn().mockResolvedValue(previous), findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ ...previous, gstNumber: correction.gstNumber }),
    }, auditLog: { create: jest.fn() } };
    db = { $transaction: jest.fn(async fn => fn(tx)) };
    service = new PharmacyPurchaseInvoiceService(db);
  });
  const correct = (overrides = {}) => service.correctPurchaseSupplierGstin(previous.id, { ...correction, ...overrides }, 'branch-1', 'staff-1');

  it('updates only GSTIN and writes the actor, old/new values and reason inside the same transaction', async () => {
    expect(await correct()).toMatchObject({ gstNumber: correction.gstNumber });
    expect(tx.supplier.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: previous.id, branchId: 'branch-1', isActive: true } }));
    expect(tx.supplier.updateMany).toHaveBeenCalledWith({ where: { id: previous.id, branchId: 'branch-1', isActive: true,
      updatedAt: previous.updatedAt, gstNumber: previous.gstNumber }, data: { gstNumber: correction.gstNumber } });
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ entity: 'Supplier', entityId: previous.id, action: 'GSTIN_CORRECTED', userId: 'staff-1' });
    expect(JSON.parse(audit.oldValues)).toMatchObject({ branchId: 'branch-1', gstNumber: previous.gstNumber });
    expect(JSON.parse(audit.newValues)).toMatchObject({ branchId: 'branch-1', gstNumber: correction.gstNumber, reason: correction.reason, verified: true });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([{ verified: false }, { gstNumber: 'invalid' }, { reason: ' ' }, { expectedUpdatedAt: 'invalid' }, { expectedGstNumber: undefined }])('rejects invalid or unverified input before any database operation: %j', async overrides => {
    await expect(correct(overrides)).rejects.toThrow(/valid GSTIN/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('cannot correct an inactive supplier or a supplier in another branch', async () => {
    tx.supplier.findFirst.mockResolvedValue(null);
    await expect(correct()).rejects.toThrow(/not found in this branch/);
    expect(tx.supplier.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([{ expectedUpdatedAt: '2026-09-01T10:00:00Z' }, { expectedGstNumber: 'different' }])('requires a fresh revision and old value: %j', async overrides => {
    await expect(correct(overrides)).rejects.toThrow(/saved supplier changed/);
    expect(tx.supplier.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a GSTIN already assigned to any other supplier, including inactive records', async () => {
    tx.supplier.findMany.mockResolvedValue([{ gstNumber: correction.gstNumber.toLowerCase() }]);
    await expect(correct()).rejects.toThrow(/Another supplier already uses/);
    expect(tx.supplier.findMany).toHaveBeenCalledWith({ where: { branchId: 'branch-1', id: { not: previous.id } }, select: { gstNumber: true } });
    expect(tx.supplier.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent change at the write boundary without recording a correction', async () => {
    tx.supplier.updateMany.mockResolvedValue({ count: 0 });
    await expect(correct()).rejects.toThrow(/saved supplier changed/);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns an already applied correction after a lost response without writing or auditing twice', async () => {
    tx.supplier.findFirst.mockResolvedValue({ ...previous, gstNumber: correction.gstNumber, updatedAt: new Date() });
    expect(await correct()).toMatchObject({ gstNumber: correction.gstNumber });
    expect(tx.supplier.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates audit failure out of the transaction so the database rolls back', async () => {
    tx.auditLog.create.mockRejectedValue(new Error('Audit unavailable'));
    await expect(correct()).rejects.toThrow('Audit unavailable');
    expect(tx.supplier.findFirstOrThrow).not.toHaveBeenCalled();
  });
});


describe('Supplier correction capability and input validation', () => {
  it.each([
    [['inventory:po:create'], false],
    [['inventory:supplier:update'], false],
    [['inventory:po:create', 'inventory:supplier:update'], true],
  ])('exposes edit capability only with both permissions: %j', async (permissions, expected) => {
    const service = new PharmacyPurchaseInvoiceService({
      user: { findUnique: async () => ({ role: 'RECEPTION', permissions: JSON.stringify(permissions) }) },
      role: { findFirst: async () => ({ permissions: '[]' }) },
    } as any);
    expect(await service.capabilities({ id: 'staff', role: 'RECEPTION' })).toMatchObject({ editSupplier: expected });
  });

  it('normalizes new GSTIN and reason while preserving the exact saved value for conflict detection', async () => {
    const dto = plainToInstance(CorrectPharmacyPurchaseSupplierGstinDto, { ...correction, gstNumber: ' 36abcde1234f2z5 ', reason: ' Original checked ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ gstNumber: correction.gstNumber, reason: 'Original checked', expectedGstNumber: previous.gstNumber });
  });

  it.each([{ verified: 'true' }, { expectedUpdatedAt: '' }, { reason: ' ' }, { gstNumber: 'bad' }])('rejects malformed correction requests: %j', async overrides => {
    expect((await validate(plainToInstance(CorrectPharmacyPurchaseSupplierGstinDto, { ...correction, ...overrides }))).length).toBeGreaterThan(0);
  });
});
