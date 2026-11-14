import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { ReportsController } from '../reports.controller';
import { ReportsService } from '../reports.service';
import { ROLE_PERMISSIONS } from '../../../shared/access/role-permissions';

const allows = (handler: keyof ReportsController, role: string) =>
  new RolesGuard(new Reflector()).canActivate({
    getHandler: () => ReportsController.prototype[handler],
    getClass: () => ReportsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', branchId: 'b', role } }) }),
  } as unknown as ExecutionContext);

const STORED: Record<string, { role: string; permissions: string }> = {
  doctor: { role: 'DOCTOR', permissions: '[]' },
  pharmacist: { role: 'PHARMACIST', permissions: '[]' },
  reception: { role: 'RECEPTION', permissions: JSON.stringify(ROLE_PERMISSIONS.RECEPTION) },
  nurse: { role: 'NURSE', permissions: JSON.stringify(ROLE_PERMISSIONS.NURSE) },
  accountant: { role: 'ACCOUNTANT', permissions: JSON.stringify(ROLE_PERMISSIONS.ACCOUNTANT) },
  manager: { role: 'MANAGER', permissions: JSON.stringify(ROLE_PERMISSIONS.MANAGER) },
  bare: { role: 'NURSE', permissions: '[]' },
};

const prisma = {
  user: { findUnique: async ({ where }: any) => STORED[where.id] ?? null },
  role: { findFirst: async () => null },
  newInvoice: { findMany: async () => [{ id: 'overdue-1', invoiceNo: 'INV-9', total: 500 }] },
  inventoryItem: {
    findMany: async () => [{ id: 'cream', name: 'Synthetic Cream', expiryDate: new Date(Date.now() + 5 * 86400000 - 1000), currentStock: 4 }],
  },
  $queryRaw: async () => [{ id: 'gel', name: 'Adapalene Gel', currentStock: 0, heldStock: 0, minStockLevel: 6, reorderLevel: null, total: BigInt(1) }],
  newPayment: { findMany: async () => [{ id: 'pay-1', amount: 100 }] },
  appointment: {
    findMany: async ({ where }: any) => where.date instanceof Date ? [] : [{ id: 'appt-1', date: new Date(Date.now() + 86400000), slot: '10:00-10:15', status: 'SCHEDULED', visitType: 'OPD', patient: { name: 'Kiran Bhatt' }, doctor: { firstName: 'Priya', lastName: 'Menon' } }],
    count: async () => 1,
  },
};

const alertsFor = (id: string) => new ReportsService(prisma as any).getSystemAlerts('b', { id, role: STORED[id]?.role });

describe('system alerts', () => {
  it('is open to every signed-in role and refuses nobody on page load', () => {
    expect(['PHARMACIST', 'DOCTOR', 'ADMIN', 'RECEPTION', 'NURSE', 'ACCOUNTANT', 'MANAGER'].map((role) => allows('getSystemAlerts', role))).toEqual([true, true, true, true, true, true, true]);
    expect(allows('getReportsSummary', 'PHARMACIST')).toBe(false);
    expect(allows('getReportsSummary', 'RECEPTION')).toBe(false);
  });

  it('gives a pharmacist only the stock alerts', async () => {
    const alerts = await alertsFor('pharmacist');
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
    const alerts = await alertsFor('doctor');
    expect(alerts.counts).toEqual({ overdueInvoices: 1, lowStockAlerts: 1, expiryAlerts: 1, pendingPayments: 1, upcomingAppointments: 1 });
    expect(alerts.upcomingAppointments[0]).toMatchObject({ id: 'appt-1', patientName: 'Kiran Bhatt', doctorName: 'Priya Menon' });
  });

  it('gives reception the appointment and billing sections its grants cover', async () => {
    expect((await alertsFor('reception')).counts).toEqual({ overdueInvoices: 1, lowStockAlerts: 1, expiryAlerts: 1, pendingPayments: 1, upcomingAppointments: 1 });
  });

  it('gives a nurse only the appointments, which it may read', async () => {
    const alerts = await alertsFor('nurse');
    expect(alerts.counts).toEqual({ overdueInvoices: 0, lowStockAlerts: 0, expiryAlerts: 0, pendingPayments: 0, upcomingAppointments: 1 });
    expect([alerts.overdueInvoices, alerts.pendingPayments, alerts.lowStockAlerts, alerts.expiryAlerts]).toEqual([[], [], [], []]);
  });

  it('gives an accountant only the money sections', async () => {
    expect((await alertsFor('accountant')).counts).toEqual({ overdueInvoices: 1, lowStockAlerts: 0, expiryAlerts: 0, pendingPayments: 1, upcomingAppointments: 0 });
  });

  it('gives a manager everything and a user with no grants nothing', async () => {
    expect((await alertsFor('manager')).counts).toEqual({ overdueInvoices: 1, lowStockAlerts: 1, expiryAlerts: 1, pendingPayments: 1, upcomingAppointments: 1 });
    expect((await alertsFor('bare')).counts).toEqual({ overdueInvoices: 0, lowStockAlerts: 0, expiryAlerts: 0, pendingPayments: 0, upcomingAppointments: 0 });
    expect((await alertsFor('missing')).counts).toEqual({ overdueInvoices: 0, lowStockAlerts: 0, expiryAlerts: 0, pendingPayments: 0, upcomingAppointments: 0 });
  });
});
