import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DashboardPage from './page';
import { apiClient } from '@/lib/api';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
jest.mock('@/components/dashboard/DoctorPatientPanels', () => ({ DoctorPatientPanels: () => null }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
let mockRole = 'RECEPTION';
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'user-1', role: mockRole, firstName: 'Sunita' }, loading: false }),
}));
jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    getSystemAlerts: jest.fn(),
    getAppointments: jest.fn(),
    getDoctorSchedule: jest.fn(),
    getInventoryItemRequestPendingCount: jest.fn(),
    getInvoiceById: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const paid = { state: 'PAID', total: 500, received: 500, due: 0, attention: false, invoices: [{ id: 'inv-1', invoiceNo: 'INV-1', total: 500, received: 500, due: 0 }] };
const booked = (id: string, slot: string, status: string, name: string, extra: object = {}) => ({ id, slot, status, doctorId: 'doc-1', visitType: 'OPD', patient: { id: `p-${id}`, name }, ...extra });
const day = [
  booked('a1', '09:00-09:15', 'COMPLETED', 'Meera Shah', { billing: paid, visit: { id: 'v1', status: 'COMPLETED' } }),
  booked('a2', '11:30-11:45', 'CONFIRMED', 'Vikram Patil'),
  booked('a3', '10:30-10:45', 'IN_PROGRESS', 'Ananya Joshi', { visit: { id: 'v3', status: 'IN_PROGRESS' } }),
];
const alerts = {
  counts: { billsDue: 2, lowStockAlerts: 4, expiryAlerts: 1 },
  billsDueBalance: 3810,
  billsDue: [
    { id: 'b1', invoiceNo: 'INV-20261108-001', balance: 2360, status: 'OVERDUE', billDate: '2026-11-08', patient: { id: 'p6', name: 'Aditya Bhosale' } },
    { id: 'b2', invoiceNo: 'INV-20261113-002', balance: 1450, status: 'PARTIALLY_PAID', billDate: '2026-11-13', patient: { id: 'p2', name: 'Rohan Kulkarni' } },
  ],
  lowStockAlerts: [{ itemId: 'i1', itemName: 'Clobetasol Cream', currentStock: 0 }, { itemId: 'i2', itemName: 'Tretinoin Cream', currentStock: 3 }],
  expiryAlerts: [{ itemId: 'i3', itemName: 'Fluconazole Tablet', currentStock: 10, daysUntilExpiry: 21 }],
};
const collection = {
  wholeDay: {
    total: 2199, clinic: 2000, pharmacy: 199,
    modes: [{ mode: 'CASH', label: 'Cash', total: 500 }, { mode: 'UPI', label: 'UPI', total: 1699 }, { mode: 'CARD', label: 'Card', total: 0 }, { mode: 'WALLET', label: 'Wallet', total: 0 }],
  },
  collection: { expectedTotal: 199, modes: [] },
};
const queue = {
  data: [{ prescriptionId: 'rx-1', visitId: 'v1', dispensingEligible: true, patient: { id: 'p1', name: 'Meera Shah' }, doctor: { id: 'doc-1', name: 'Priya Menon' }, pendingHours: 0.2, medications: [{}, {}, {}] }],
  pagination: { total: 1 },
};

const text = (el: HTMLElement) => el.textContent;
const line = (wanted: string) => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === wanted);
const hrefOf = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('href');

beforeEach(() => {
  mockRole = 'RECEPTION';
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getSystemAlerts.mockResolvedValue(alerts);
  api.getAppointments.mockResolvedValue({ appointments: day });
  api.getDoctorSchedule.mockResolvedValue({ doctorId: 'doc-1', appointments: day, billingAccess: { read: true, createBill: true, takePayment: true, editFees: false } });
  api.getInventoryItemRequestPendingCount.mockResolvedValue({ count: 1 });
  api.getInvoiceById.mockResolvedValue({ id: 'inv-1', invoiceNo: 'INV-1', total: 500, balance: 0, received: 500, items: [], payments: [] });
  api.get.mockImplementation(async (url: string) => {
    if (url === '/pharmacy/reports/daily-collection') return collection;
    if (url === '/inventory/workspace/overview') return { pendingEdits: 1 };
    if (url === '/pharmacy/prescription-queue') return queue;
    throw new Error(`unexpected ${url}`);
  });
});

it('says the appointments failed to load instead of claiming an empty day, and recovers on retry', async () => {
  api.getAppointments.mockRejectedValueOnce(httpError(500));
  render(<DashboardPage />);

  expect(await screen.findByText("Couldn't load today's appointments")).toBeInTheDocument();
  expect(screen.queryByText('No appointments scheduled for today')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Vikram Patil')).toBeInTheDocument();
  expect(screen.queryByText("Couldn't load today's appointments")).not.toBeInTheDocument();
});

it('tells a role without access to ask an admin', async () => {
  api.getAppointments.mockRejectedValue(httpError(403));
  render(<DashboardPage />);

  expect(await screen.findByText(/Ask an admin to check your role permissions/)).toBeInTheDocument();
});

it('says the bills failed to load and never reports all systems operational', async () => {
  api.getSystemAlerts.mockRejectedValue(httpError(500));
  render(<DashboardPage />);

  expect(await screen.findByText("Couldn't load bills due")).toBeInTheDocument();
  expect(screen.queryByText('All systems operational')).not.toBeInTheDocument();
});

it('still shows a genuinely empty day as empty', async () => {
  api.getAppointments.mockResolvedValue({ appointments: [] });
  render(<DashboardPage />);

  expect(await screen.findByText('No appointments scheduled for today')).toBeInTheDocument();
});

it('gives reception the two front-desk buttons, the day with the next patient first, and the bills to collect', async () => {
  render(<DashboardPage />);

  const rows = within(await screen.findByRole('list', { name: "Today's appointments" })).getAllByRole('listitem');
  expect(rows.map(text)).toEqual([
    '10:30-10:45Ananya JoshiIn progress',
    '11:30-11:45Vikram PatilConfirmed',
    '09:00-09:15Meera ShahCompleted₹500 · Paid',
  ]);
  expect([hrefOf(/Book appointment/), hrefOf(/New patient/)]).toEqual(['/dashboard/appointments', '/dashboard/patients?new=walkin']);
  const bills = within(await screen.findByRole('list', { name: 'Bills to collect' })).getAllByRole('link');
  expect(bills.map((link) => [text(link), link.getAttribute('href')])).toEqual([
    ['Aditya Bhosale₹2,360.00', '/dashboard/appointments?date=2026-11-08'],
    ['Rohan Kulkarni₹1,450.00', '/dashboard/appointments?date=2026-11-13'],
  ]);
});

it("opens an appointment's bill from its chip on the landing page", async () => {
  render(<DashboardPage />);

  fireEvent.click(await screen.findByRole('button', { name: /paid/ }));
  expect(await screen.findByRole('heading', { name: 'Bill for Meera Shah' })).toBeInTheDocument();
});

it("lists a doctor's own patients with the visit to start or continue, and asks for no alerts", async () => {
  mockRole = 'DOCTOR';
  render(<DashboardPage />);

  await screen.findByText("Today's patients");
  expect([
    ['Continue visit', hrefOf(/Continue visit/)],
    ['Start visit', hrefOf(/Start visit/)],
    ['Open visit', hrefOf(/Open visit/)],
    api.getDoctorSchedule.mock.calls[0][0],
    api.getSystemAlerts.mock.calls.length,
  ]).toEqual([
    ['Continue visit', '/dashboard/visits?patientId=p-a3&appointmentId=a3&visitId=v3'],
    ['Start visit', '/dashboard/visits?patientId=p-a2&appointmentId=a2&autoStart=true'],
    ['Open visit', '/dashboard/visits?patientId=p-a1&appointmentId=a1&visitId=v1'],
    'user-1',
    0,
  ]);
});

it("shows the owner today's collection, who owes what, approvals and the low items by name", async () => {
  mockRole = 'OWNER';
  render(<DashboardPage />);

  expect(await screen.findByText('₹2,199.00')).toBeInTheDocument();
  expect(line('Clinic ₹2,000.00 · Pharmacy ₹199.00')).toBeInTheDocument();
  expect(line('Cash ₹500.00 · UPI ₹1,699.00 · Card ₹0.00')).toBeInTheDocument();
  expect(screen.getByText('₹3,810.00')).toBeInTheDocument();
  expect(await screen.findByText('2')).toBeInTheDocument();
  expect([hrefOf("Today's collection"), hrefOf('Waiting for approval'), hrefOf('Low stock (4)'), hrefOf('Expiring in 3 months (1)')]).toEqual([
    '/dashboard/pharmacy/reports?report=daily-collection',
    '/dashboard/inventory?area=stock&view=approvals',
    '/dashboard/inventory?area=stock&view=list&stock=LOW',
    '/dashboard/inventory?area=stock&view=list&expiryMonths=3',
  ]);
  expect(within(screen.getByRole('list', { name: 'Low stock (4)' })).getAllByRole('listitem').map(text)).toEqual(['Clobetasol Cream0 left', 'Tretinoin Cream3 left']);
  expect(screen.getByRole('button', { name: /Create Backup/ })).toBeInTheDocument();
});

it('never asks a manager for the new-item approvals it would be refused, and shows no approvals figure', async () => {
  mockRole = 'MANAGER';
  api.get.mockImplementation(async (url: string) => (url === '/inventory/workspace/overview' ? { pendingEdits: null } : collection));
  render(<DashboardPage />);

  expect(await screen.findByText('₹2,199.00')).toBeInTheDocument();
  await waitFor(() => expect(api.get.mock.calls.map((call) => call[0])).toContain('/inventory/workspace/overview'));
  expect([screen.queryByText('Waiting for approval'), api.getInventoryItemRequestPendingCount.mock.calls.length, screen.queryByRole('button', { name: /Create Backup/ })]).toEqual([null, 0, null]);
  expect(await screen.findByText('Vikram Patil')).toBeInTheDocument();
});

it('gives a pharmacist the waiting prescription with its bill, a new sale and the stock lists', async () => {
  mockRole = 'PHARMACIST';
  render(<DashboardPage />);

  expect(await screen.findByText('Prescriptions waiting (1)')).toBeInTheDocument();
  expect(screen.getByText('3 medicines · Dr. Priya Menon · 12 min')).toBeInTheDocument();
  expect([hrefOf('Bill'), hrefOf('New sale'), await screen.findByRole('link', { name: 'Low stock (4)' }).then((a) => a.getAttribute('href'))]).toEqual([
    '/dashboard/pharmacy/sales/bill?patientId=p1&prescriptionId=rx-1&doctorId=doc-1&visitId=v1',
    '/dashboard/pharmacy/sales/bill',
    '/dashboard/inventory?area=stock&view=list&stock=LOW',
  ]);
});

it.each(['PHARMACIST', 'ACCOUNTANT'])('never asks for appointments for %s, whose grants hold none', async (role) => {
  mockRole = role;
  render(<DashboardPage />);

  await screen.findByText(role === 'PHARMACIST' ? 'Prescriptions waiting (1)' : '₹2,199.00');
  expect([api.getAppointments.mock.calls.length, api.getDoctorSchedule.mock.calls.length, screen.queryByText("Today's appointments")]).toEqual([0, 0, null]);
});
