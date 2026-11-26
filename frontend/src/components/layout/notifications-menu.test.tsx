import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsMenu } from './notifications-menu';

const push = jest.fn();
const getSystemAlerts = jest.fn();
let signedIn: { user: { id: string; role: string }; loading: boolean };

jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('./dashboard-user-context', () => ({ useDashboardUser: () => signedIn }));
jest.mock('@/lib/api', () => ({ apiClient: { getSystemAlerts: (...args: unknown[]) => getSystemAlerts(...args) } }));

const alerts = {
  counts: { overdueInvoices: 1, expiryAlerts: 1 },
  lowStockAlerts: [{ itemId: 'm2', itemName: 'Paracetamol 650', currentStock: 3, reorderLevel: 20 }],
  pendingPayments: [{ id: 'pay1', amount: 500, mode: 'UPI', createdAt: new Date().toISOString(), invoice: { invoiceNo: 'INV-7' } }],
  overdueInvoices: [{ id: 'i1', invoiceNo: 'INV-7', dueDate: '2026-11-01T00:00:00.000Z', patient: { name: 'Rahul Kumar' } }],
  upcomingAppointments: [{ id: 'a1', time: '2026-11-26T00:00:00.000Z', slot: '10:30-11:00', status: 'CONFIRMED', visitType: 'OPD', patientName: 'Meera Kapoor' }],
};

async function openMenu(role: string) {
  signedIn = { user: { id: 'u1', role }, loading: false };
  getSystemAlerts.mockResolvedValue(alerts);
  const user = userEvent.setup();
  render(<NotificationsMenu />);
  await user.click(await screen.findByRole('button', { name: 'Notifications' }));
  return user;
}

beforeEach(() => push.mockReset());

describe('NotificationsMenu', () => {
  it('opens the unpaid clinic bills from an overdue bill alert', async () => {
    const user = await openMenu('RECEPTION');
    await user.click(await screen.findByRole('menuitem', { name: /Overdue bill INV-7/ }));
    expect(push).toHaveBeenCalledWith('/dashboard/billing?status=overdue');
  });

  it('goes nowhere from a dues alert whose page the role cannot open', async () => {
    const user = await openMenu('ACCOUNTANT');
    await user.click(await screen.findByRole('menuitem', { name: /Overdue bill INV-7/ }));
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByRole('menuitem', { name: /Pending ₹500.00 \(UPI\)/ }));
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a doctor the appointment time and opens that visit', async () => {
    const user = await openMenu('DOCTOR');
    await user.click(await screen.findByRole('menuitem', { name: /Meera Kapoor on 26 Nov 2026, 10:30-11:00/ }));
    expect(push).toHaveBeenCalledWith('/dashboard/visits?appointmentId=a1');
  });

  it('offers the reports page to an owner', async () => {
    const user = await openMenu('OWNER');
    await user.click(await screen.findByRole('menuitem', { name: 'View reports & alerts' }));
    expect(push).toHaveBeenCalledWith('/dashboard/reports');
  });

  it.each(['DOCTOR', 'RECEPTION', 'PHARMACIST', 'ACCOUNTANT'])('does not send %s to a reports page that refuses them', async (role) => {
    await openMenu(role);
    await screen.findAllByRole('menuitem');
    expect(screen.queryByRole('menuitem', { name: 'View reports & alerts' })).toBeNull();
  });
});
