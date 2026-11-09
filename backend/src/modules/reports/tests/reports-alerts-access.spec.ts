import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { ReportsController } from '../reports.controller';
import { ReportsService } from '../reports.service';

const allows = (handler: keyof ReportsController, role: string) =>
  new RolesGuard(new Reflector()).canActivate({
    getHandler: () => ReportsController.prototype[handler],
    getClass: () => ReportsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', branchId: 'b', role } }) }),
  } as unknown as ExecutionContext);

const prisma = {
  newInvoice: { findMany: async () => [{ id: 'overdue-1', invoiceNo: 'INV-9', total: 500 }] },
  inventoryItem: {
    findMany: async ({ where }: any) => where.expiryDate
      ? [{ id: 'cream', name: 'Synthetic Cream', expiryDate: new Date(Date.now() + 5 * 86400000 - 1000), currentStock: 4 }]
      : [{ id: 'gel', name: 'Adapalene Gel', currentStock: 0, minStockLevel: 6 }],
  },
  newPayment: { findMany: async () => [{ id: 'pay-1', amount: 100 }] },
  appointment: { findMany: async () => [{ id: 'appt-1', date: new Date(), status: 'SCHEDULED', visitType: 'OPD', patient: { name: 'Kiran Bhatt' }, doctor: { firstName: 'Priya', lastName: 'Menon' } }] },
};

describe('system alerts for the pharmacy', () => {
  it('lets a pharmacist reach alerts but not the other reports', () => {
    expect(['PHARMACIST', 'DOCTOR', 'ADMIN', 'RECEPTION'].map((role) => allows('getSystemAlerts', role))).toEqual([true, true, true, false]);
    expect(allows('getReportsSummary', 'PHARMACIST')).toBe(false);
  });

  it('gives a pharmacist only the stock alerts', async () => {
    const alerts = await new ReportsService(prisma as any).getSystemAlerts('b', 'PHARMACIST');
    expect(alerts).toMatchObject({
      counts: { overdueInvoices: 0, lowStockAlerts: 1, expiryAlerts: 1, pendingPayments: 0, upcomingAppointments: 0 },
      overdueInvoices: [],
      pendingPayments: [],
      upcomingAppointments: [],
      lowStockAlerts: [{ itemId: 'gel', itemName: 'Adapalene Gel', currentStock: 0, reorderLevel: 6 }],
      expiryAlerts: [{ itemId: 'cream', itemName: 'Synthetic Cream', daysUntilExpiry: 5, currentStock: 4 }],
    });
  });

  it('keeps invoices, payments and appointments for a doctor', async () => {
    const alerts = await new ReportsService(prisma as any).getSystemAlerts('b', 'DOCTOR');
    expect(alerts.counts).toEqual({ overdueInvoices: 1, lowStockAlerts: 1, expiryAlerts: 1, pendingPayments: 1, upcomingAppointments: 1 });
    expect(alerts.upcomingAppointments[0]).toMatchObject({ id: 'appt-1', patientName: 'Kiran Bhatt', doctorName: 'Priya Menon' });
  });
});
