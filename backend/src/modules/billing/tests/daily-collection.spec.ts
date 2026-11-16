import { BadRequestException, NotFoundException } from '@nestjs/common';
import { collectionDay, collectionTotals, DailyCollectionService } from '../daily-collection.service';
import { appointmentBillingInclude, withAppointmentBilling } from '../../appointments/appointment-billing';
import { BillingService } from '../billing.service';

describe('daily collections and appointment bills', () => {
  it('uses inclusive IST midnight and exclusive next midnight, including leap days', () => {
    expect(collectionDay('2026-10-25')).toEqual({ gte: new Date('2026-10-24T18:30:00Z'), lt: new Date('2026-10-25T18:30:00Z') });
    expect(collectionDay('2024-02-29').lt.toISOString()).toBe('2024-02-29T18:30:00.000Z');
    for (const invalid of ['2026-02-29', '2026-13-01', '2026-10-25T01:00:00Z', '']) expect(() => collectionDay(invalid)).toThrow(BadRequestException);
  });

  it('shows gross receipts, refunds and method totals using currency precision', () => {
    expect(collectionTotals([{ amount: 100, method: 'CASH' }, { amount: -20, method: 'CASH' }, { amount: 0.1, method: 'UPI' }, { amount: 0.2, method: 'UPI' }])).toEqual({
      received: 100.3, refunded: 20, net: 80.3, paymentCount: 4, methods: [{ method: 'CASH', amount: 80 }, { method: 'UPI', amount: 0.3 }],
    });
    expect(collectionTotals([])).toEqual({ received: 0, refunded: 0, net: 0, paymentCount: 0, methods: [] });
  });

  it('queries completed branch payments and reports both sources without ID collision', async () => {
    const clinic = { id: 'same', invoiceId: 'bill', amount: 500, mode: 'CASH', createdAt: new Date('2026-10-25T06:00:00Z'), invoice: { invoiceNo: 'C-1', billType: 'REVIEW', patient: { name: 'Synthetic' } } };
    const pharmacy = { id: 'same', invoiceId: 'pharmacy', amount: 120, method: 'UPI', paymentDate: new Date('2026-10-25T07:00:00Z'), invoice: { invoiceNumber: 'P-1', patient: null } };
    const db = { newPayment: { findMany: jest.fn().mockResolvedValue([clinic]) }, pharmacyPayment: { findMany: jest.fn().mockResolvedValue([pharmacy]) }, $transaction: (queries: Promise<unknown>[]) => Promise.all(queries) };
    const result = await new DailyCollectionService(db as any).read('branch', '2026-10-25');
    expect(result.net).toBe(620);
    expect(result.entries.map(e => [e.id, e.patientName, e.billType])).toEqual([['clinic:same', 'Synthetic', 'REVIEW'], ['pharmacy:same', 'Walk-in', null]]);
    expect(db.newPayment.findMany.mock.calls[0][0].where).toEqual({ invoice: { branchId: 'branch' }, reconStatus: 'COMPLETED', createdAt: collectionDay('2026-10-25') });
    expect(db.pharmacyPayment.findMany.mock.calls[0][0].where).toEqual({ invoice: { branchId: 'branch' }, status: 'COMPLETED', paymentDate: collectionDay('2026-10-25') });
  });

  it('deduplicates explicit appointment/visit links and preserves an unrecorded type', () => {
    const bill = { id: 'bill', invoiceNo: 'C1', billType: null, total: 100, received: 50, balance: 50, status: 'PARTIALLY_PAID' };
    const result = withAppointmentBilling({ newInvoices: [bill], visit: { newInvoices: [bill, { ...bill, id: 'cancelled', status: 'CANCELLED' }] } });
    expect(result.billing.invoices).toEqual([bill]);
    expect(appointmentBillingInclude('branch').visit.select.newInvoices.where.branchId).toBe('branch');
  });

  it('rejects cross-patient appointment links before any invoice or service write', async () => {
    const db = { patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient' }) }, appointment: { findFirst: jest.fn().mockResolvedValue(null) }, service: { create: jest.fn() }, newInvoice: { create: jest.fn() } };
    const billing = new BillingService(db as any, {} as any);
    await expect(billing.createInvoice({ patientId: 'patient', appointmentId: 'other-patient', billType: 'REVIEW', items: [{ name: 'Review', quantity: 1, unitPrice: 100 }] } as any, 'branch')).rejects.toThrow(NotFoundException);
    expect(db.newInvoice.create).not.toHaveBeenCalled();
    expect(db.service.create).not.toHaveBeenCalled();
  });
});
