import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { PharmacyReportsController } from '../pharmacy-reports.controller';
import { PharmacyReportsService, pharmacyReportRange } from '../pharmacy-reports.service';

describe('pharmacy reports', () => {
  const invoice = { invoiceNumber: 'S-1', createdAt: new Date('2026-11-05T09:00:00Z'), invoiceDate: new Date('2026-11-05T09:00:00Z'), billingName: 'Patient', billingPhone: '123', subtotal: 100, discountAmount: 0, taxAmount: 12, totalAmount: 112, paidAmount: 100, items: [{ inventoryItemId: 'item-1', drug: { name: 'Cream' }, package: null, quantity: 2, taxPercent: 12, taxAmount: 12, totalAmount: 112 }], payments: [{ status: 'COMPLETED', amount: 70 }] };
  const purchase = { invoiceNumber: 'P-1', createdAt: new Date('2026-11-05T09:00:00Z'), invoiceDate: new Date('2026-11-05T00:00:00Z'), distributorName: 'Supplier', grossAmount: 90, tradeDiscount: 0, specialDiscount: 0, cashDiscount: 0, taxableAmount: 90, totalGst: 10.8, totalCgst: 5.4, totalSgst: 5.4, totalIgst: 0, netPayable: 100.8, items: [{ inventoryItemId: 'item-1', productName: 'Cream', quantityPurchased: 2, cgstPercent: 6, sgstPercent: 6, igstPercent: 0, taxableAmount: 90, gstAmount: 10.8, lineTotal: 100.8 }] };
  const doc = (kind: string, status: string, reference: string) => ({ kind, status, reference, supplierId: kind === 'SUPPLIER_RETURN' ? 'supplier-1' : null, totalAmount: 56, createdAt: new Date('2026-11-05T12:00:00Z'), postedAt: new Date('2026-11-05T12:00:00Z'), payload: { customerName: 'Counter', lines: [{ inventoryId: 'item-1', name: 'Cream', quantity: 1, gstRate: 12, taxable: 50, tax: 6, total: 56 }] } });
  const prisma = {
    pharmacyInvoice: { findMany: jest.fn() }, pharmacyPurchaseInvoice: { findMany: jest.fn() },
    inventoryWorkflowDocument: { findMany: jest.fn() }, inventoryWorkflowEvent: { findMany: jest.fn() }, inventoryItem: { findMany: jest.fn() }, pharmacyPayment: { findMany: jest.fn() }, stockTransaction: { findMany: jest.fn() }, supplier: { findMany: jest.fn() },
  };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.supplier.findMany.mockResolvedValue([{ id: 'supplier-1', name: 'Example Supplier' }]);
    prisma.inventoryWorkflowEvent.findMany.mockResolvedValue([{ document: { reference: 'VOID-OLD' } }]);
    prisma.inventoryItem.findMany.mockResolvedValue([{ id: 'item-1', category: 'Cream', manufacturer: 'Maker', unit: 'PIECE', packSize: 1, packUnit: 'piece', currentStock: 9, mrp: 75 }]);
    prisma.stockTransaction.findMany.mockResolvedValue([{ reference: 'INV-S-1', itemId: 'item-1', quantity: 2, notes: JSON.stringify({ costPerStockUnit: 20 }) }]);
    prisma.pharmacyInvoice.findMany.mockResolvedValue([invoice]);
    prisma.pharmacyPurchaseInvoice.findMany.mockResolvedValue([purchase]);
    prisma.inventoryWorkflowDocument.findMany.mockResolvedValue([doc('COUNTER_SALE', 'POSTED', 'C-1'), doc('SALES_RETURN', 'RELEASED', 'R-1'), doc('SUPPLIER_RETURN', 'POSTED', 'PR-1'), doc('COUNTER_SALE', 'REVERSED', 'VOID-1')]);
    prisma.pharmacyPayment.findMany.mockResolvedValue([{ paymentDate: new Date('2026-11-05T14:00:00Z'), amount: 35, method: 'UPI', invoice: { invoiceNumber: 'OLD-1', status: 'COMPLETED', paidAmount: 40, payments: [{status: 'COMPLETED', amount: 35}] } }]);
  });
  it('uses inclusive India-local dates and rejects invalid or excessive ranges', () => {
    expect(pharmacyReportRange('2026-11-05', '2026-11-05')).toEqual({ gte: new Date('2026-11-04T18:30:00Z'), lt: new Date('2026-11-05T18:30:00Z') });
    expect(() => pharmacyReportRange('2026-02-30', '2026-03-01')).toThrow(BadRequestException);
    expect(() => pharmacyReportRange('2026-11-06', '2026-11-05')).toThrow(BadRequestException);
    expect(() => pharmacyReportRange('2025-01-01', '2026-01-02')).toThrow(BadRequestException);
  });
  it('scopes every source to the authenticated branch and distinguishes payment date from bill date', async () => {
    const service = new PharmacyReportsService(prisma as never);
    const result = await service.getReport('branch-a', '2026-11-05', '2026-11-05');
    expect(prisma.pharmacyInvoice.findMany.mock.calls[0][0].where.branchId).toBe('branch-a');
    expect(prisma.pharmacyPurchaseInvoice.findMany.mock.calls[0][0].where.branchId).toBe('branch-a');
    expect(prisma.inventoryWorkflowDocument.findMany.mock.calls[0][0].where.branchId).toBe('branch-a');
    expect(prisma.pharmacyPayment.findMany.mock.calls[0][0].where.invoice.branchId).toBe('branch-a');
    expect(prisma.pharmacyPayment.findMany.mock.calls[0][0].where.paymentDate).toEqual({ gte: new Date('2026-11-04T18:30:00Z'), lt: new Date('2026-11-05T18:30:00Z') });
    expect(result.payments).toEqual([{ date: '2026-11-05', number: 'OLD-1', method: 'UPI', amount: 35, invoiceStatus: 'COMPLETED' }]);
    expect(result.paymentGaps).toEqual(['S-1', 'OLD-1']);
    expect(result.items[0]).toMatchObject({ id: 'item-1', currentStock: 9 });
    expect(prisma.inventoryItem.findMany.mock.calls[0][0].where.branchId).toBe('branch-a');
    expect(prisma.inventoryWorkflowEvent.findMany.mock.calls[0][0].where.branchId).toBe('branch-a');
    await expect(service.getReport('', '2026-11-05', '2026-11-05')).rejects.toThrow('A branch is required');
  });
  it('includes counter sales and signed returns while disclosing reversed documents', async () => {
    const result = await new PharmacyReportsService(prisma as never).getReport('branch-a', '2026-11-05', '2026-11-05');
    expect(result.sales[0].lines[0].cost).toBe(40);
    expect(result.sales[1].lines[0].cost).toBeNull();
    expect(prisma.stockTransaction.findMany.mock.calls[0][0].where.branchId).toBe('branch-a');
    expect(result.sales.map(row => [row.kind, row.total])).toEqual([['Sale', 112], ['Counter sale', 56], ['Sales return', -56]]);
    expect(result.sales[2].lines[0]).toMatchObject({ quantity: -1, taxable: -50, tax: -6, total: -56 });
    expect(result.purchases[0]).toMatchObject({ cgst: 5.4, sgst: 5.4, igst: 0 });
    expect(result.purchases.map(row => [row.kind, row.total])).toEqual([['Purchase', 100.8], ['Supplier return', -56]]);
    expect(result.purchases[1].party).toBe('Example Supplier');
    expect(prisma.supplier.findMany.mock.calls[0][0].where).toEqual({ branchId: 'branch-a', id: { in: ['supplier-1'] } });
    expect(result.reversedDocuments).toEqual(['VOID-1', 'VOID-OLD']);
  });
  it('marks unresolved suppliers as unknown', async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    const result = await new PharmacyReportsService(prisma as never).getReport('branch-a', '2026-11-05', '2026-11-05');
    expect(result.purchases[1].party).toBe('Unknown supplier');
  });
  it('restricts access to owner, admin and doctor', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PharmacyReportsController)).toEqual([UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR]);
    expect(Reflect.getMetadata(GUARDS_METADATA, PharmacyReportsController)).toContain(RolesGuard);
    const guard = new RolesGuard(new Reflector());
    const context = (role: UserRole) => ({ getHandler: () => PharmacyReportsController.prototype.get, getClass: () => PharmacyReportsController, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }) as never;
    expect(guard.canActivate(context(UserRole.OWNER))).toBe(true);
    expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
    expect(guard.canActivate(context(UserRole.DOCTOR))).toBe(true);
    expect(guard.canActivate(context(UserRole.PHARMACIST))).toBe(false);
    expect(guard.canActivate(context(UserRole.RECEPTION))).toBe(false);
  });
});
