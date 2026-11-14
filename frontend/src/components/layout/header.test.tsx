import { fireEvent, render, screen } from '@testing-library/react';
import { Header } from './header';
import { apiClient } from '@/lib/api';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/components/tours/ReceptionistTour', () => ({ ReceptionistTour: () => null }));
jest.mock('@/components/users/DoctorSignatureSettings', () => ({ DoctorSignatureSettings: () => null }));
jest.mock('@/components/users/DoctorLetterheadSettings', () => ({ DoctorLetterheadSettings: () => null }));
jest.mock('@/components/users/DoctorAvailabilitySettings', () => ({ DoctorAvailabilitySettings: () => null }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
let mockRole = 'RECEPTION';
jest.mock('./dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'u1', role: mockRole, firstName: 'Sunita', lastName: 'Patil' }, loading: false, refresh: jest.fn() }),
}));
jest.mock('@/lib/api', () => ({
  apiClient: { getSystemAlerts: jest.fn(), getPatients: jest.fn(), getAppointments: jest.fn(), getUsers: jest.fn(), getWhatsAppTemplates: jest.fn() },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const alerts = {
  canTakePayment: true,
  counts: { billsDue: 1, lowStockAlerts: 2, expiryAlerts: 1, pendingPayments: 0, upcomingAppointments: 1 },
  billsDue: [{ id: 'b1', invoiceNo: 'INV-20261108-001', balance: 2360, status: 'OVERDUE', billDate: '2026-11-08', patient: { id: 'p6', name: 'Aditya Bhosale' } }],
  lowStockAlerts: [{ itemId: 'i1', itemName: 'Adapalene Gel', currentStock: 13, available: 13, availableInAll: 34, reorderLevel: 14 }],
  expiryAlerts: [{ itemId: 'i2', itemName: 'Fluconazole Tablet', daysUntilExpiry: 21, currentStock: 10 }],
  pendingPayments: [],
  upcomingAppointments: [{ id: 'a1', time: '2026-11-14T00:00:00.000Z', status: 'CONFIRMED', visitType: 'OPD', patientId: 'p9', patientName: 'Kavita Naik', doctorName: 'Priya Menon' }],
};

const openBell = async () => {
  fireEvent.keyDown(await screen.findByRole('button', { name: 'Notifications' }), { key: 'Enter' });
  return screen.findAllByRole('menuitem');
};
const follow = async (name: string | RegExp) => {
  if (!screen.queryByRole('menu')) await openBell();
  fireEvent.click(screen.getByRole('menuitem', { name }));
  return push.mock.calls.at(-1)?.[0];
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  push.mockReset();
  mockRole = 'RECEPTION';
  api.getSystemAlerts.mockResolvedValue(alerts);
  api.getPatients.mockResolvedValue({ data: [] });
  api.getAppointments.mockResolvedValue({ appointments: [] });
  api.getWhatsAppTemplates.mockResolvedValue([]);
});

it('opens a found patient on their own page, and finds no staff', async () => {
  api.getPatients.mockResolvedValue({ data: [{ id: 'p2', name: 'Rohan Kulkarni', phone: '9822000002', gender: 'M' }] });
  render(<Header />);
  fireEvent.change(screen.getByPlaceholderText('Find a patient'), { target: { value: 'Rohan' } });
  fireEvent.click(await screen.findByText('Rohan Kulkarni'));
  expect([push.mock.calls.at(-1)?.[0], api.getUsers.mock.calls.length]).toEqual(['/dashboard/patients/p2', 0]);
});

it('sends reception appointment rows to their calendar day and bill rows to the landing page, and offers no reports link', async () => {
  render(<Header />);
  const rows = await openBell();
  expect(rows.map((row) => row.textContent)).toEqual([
    'Kavita Naik on 14 Nov 2026OPD • Dr. Priya Menon',
    'Aditya Bhosale owes ₹2,360.00Bill INV-20261108-001',
  ]);
  expect([await follow(/Kavita Naik/), await follow(/Aditya Bhosale/)]).toEqual(['/dashboard/appointments?date=2026-11-14', '/dashboard']);
});

it('sends a bill row to the landing page only for a role that can take the payment', async () => {
  mockRole = 'ACCOUNTANT';
  api.getSystemAlerts.mockResolvedValue({ ...alerts, canTakePayment: false });
  render(<Header />);
  expect(await follow(/Aditya Bhosale/)).toBe('/dashboard/pharmacy/reports?report=daily-collection');
});

it('searches only what the role can read', async () => {
  mockRole = 'PHARMACIST';
  const { unmount } = render(<Header />);
  fireEvent.change(screen.getByPlaceholderText('Find a patient'), { target: { value: 'Rohan' } });
  await screen.findByText('No results found for "Rohan"');
  expect([api.getPatients.mock.calls.length, api.getAppointments.mock.calls.length]).toEqual([1, 0]);
  unmount();
  mockRole = 'LAB_TECH';
  render(<Header />);
  await screen.findByRole('button', { name: 'Notifications' });
  expect(screen.queryByPlaceholderText('Find a patient')).toBeNull();
});

it("opens a doctor's bell row on that patient's visit", async () => {
  mockRole = 'DOCTOR';
  render(<Header />);
  await openBell();
  expect(await follow(/Kavita Naik/)).toBe('/dashboard/visits?patientId=p9&appointmentId=a1');
});

it('sends stock rows to the Inventory lists they count', async () => {
  mockRole = 'PHARMACIST';
  render(<Header />);
  await openBell();
  expect(screen.getByRole('menuitem', { name: /Low stock: Adapalene/ }).textContent).toBe('Low stock: Adapalene Gel13 in one batch (34 in all) • Minimum 14');
  expect([await follow(/Low stock: Adapalene/), await follow(/Expiring in 3 months: Fluconazole/)]).toEqual([
    '/dashboard/inventory?area=stock&view=list&stock=LOW',
    '/dashboard/inventory?area=stock&view=list&expiryMonths=3',
  ]);
});

it('gives the owner the reports link and the counts Inventory shows', async () => {
  mockRole = 'OWNER';
  render(<Header />);
  const rows = await openBell();
  expect(rows.map((row) => row.textContent)).toEqual([
    'Aditya Bhosale owes ₹2,360.00Bill INV-20261108-001',
    'Low stock (2)',
    'Expiring in 3 months (1)',
    '1 upcoming appointment',
    'View reports & alerts',
  ]);
});

it('shows the settings gear only to a doctor, whose dialog has settings, and no Branded switch', async () => {
  const { unmount } = render(<Header />);
  await screen.findByRole('button', { name: 'Notifications' });
  expect([screen.queryByRole('button', { name: 'Open settings' }), screen.queryByText('Branded')]).toEqual([null, null]);
  unmount();
  mockRole = 'DOCTOR';
  render(<Header />);
  expect(await screen.findByRole('button', { name: 'Open settings' })).toBeInTheDocument();
});
