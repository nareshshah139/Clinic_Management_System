import { fireEvent, render, screen, within } from '@testing-library/react';
import DashboardPage from './page';
import { Toaster } from '@/components/ui/toaster';
import { apiClient } from '@/lib/api';

jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
jest.mock('@/components/dashboard/DoctorPatientPanels', () => ({ DoctorPatientPanels: () => null }));
let mockRole = 'RECEPTION';
let mockBillingForAccountant = false;
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'user-1', role: mockRole }, loading: false }),
}));
jest.mock('@/lib/role-capabilities', () => {
  const actual = jest.requireActual('@/lib/role-capabilities');
  return {
    ...actual,
    can: (role: string, capability: string) => (mockBillingForAccountant && role === 'ACCOUNTANT' && capability === 'billing') || actual.can(role, capability),
  };
});
jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    getSystemAlerts: jest.fn(),
    getAppointments: jest.fn(),
    getDoctorSchedule: jest.fn(),
    createDatabaseBackup: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const IT_LABELS = ['Total Users', 'Active Users', 'Total Branches', 'System Status', 'All systems operational', 'Click on any alert to view more details'];
const praneeta = { id: 'd2', firstName: 'Praneeta', lastName: 'Jain' };
const shravya = { id: 'd1', firstName: 'Shravya', lastName: 'Rao' };
const today = [
  { id: 'a1', slot: '09:30-09:45', status: 'SCHEDULED', doctorId: 'd2', doctor: praneeta, patient: { id: 'p1', name: 'Ananya Reddy' } },
  { id: 'a2', slot: '10:00-10:15', status: 'CONFIRMED', doctorId: 'd1', doctor: shravya, patient: { id: 'p2', name: 'Mohammed Irfan Siddiqui' } },
  { id: 'a3', slot: '15:00-15:30', status: 'CHECKED_IN', doctorId: 'd2', doctor: praneeta, patient: { id: 'p3', name: 'Fatima Begum' } },
];
const countsByStatus: Record<string, number> = { SCHEDULED: 1, CHECKED_IN: 1, NO_SHOW: 2 };

const row = (name: RegExp) => screen.getByRole('link', { name });
const linkHrefs = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'));
const expectNoItLabels = () => IT_LABELS.forEach((label) => expect(screen.queryByText(label)).not.toBeInTheDocument());

beforeEach(() => {
  mockRole = 'RECEPTION';
  mockBillingForAccountant = false;
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getAppointments.mockImplementation(async ({ status }: { status?: string }) =>
    status ? { appointments: [], pagination: { total: countsByStatus[status] ?? 0 } } : { appointments: today, pagination: { total: 3 } });
  api.getSystemAlerts.mockResolvedValue({ counts: { overdueInvoices: 0, pendingPayments: 0, upcomingAppointments: 3, lowStockAlerts: 4 } });
  api.getDoctorSchedule.mockResolvedValue({
    appointments: [
      { ...today[1], calendar: 'CONFIRMED', slot: '12:00-12:15', id: 'a5', patient: { id: 'p5', name: 'Sai Teja Goud' }, visit: { id: 'v5' } },
      { ...today[1], calendar: 'CONFIRMED', visit: null },
      { ...today[1], calendar: 'CONFIRMED', id: 'a6', slot: '11:00-11:30', status: 'CANCELLED', patient: { id: 'p6', name: 'Rahul Kumar' } },
      { ...today[0], calendar: 'SCHEDULED', doctorId: 'd1', doctor: shravya, id: 'a7', slot: '09:00-09:15', patient: { id: 'p7', name: 'Lakshmi Devi' }, visit: null },
    ],
  });
  api.get.mockImplementation(async (url: string, params?: { status?: string }) => {
    if (url === '/pharmacy/prescription-queue') return { pagination: { total: params?.status === 'pending' ? 5 : 1 } };
    if (url === '/inventory/workspace/overview') return { lowStock: 4, expiring: 2, pendingEdits: 0 };
    if (url === '/pharmacy/reports/daily-collection') return { headline: { value: 1240 } };
    throw new Error(`unexpected ${url}`);
  });
});

it("shows reception today's full list grouped by doctor, and the bookings left to confirm", async () => {
  render(<DashboardPage />);

  const praneetaDay = within(await screen.findByRole('list', { name: 'Dr. Praneeta Jain today' }));
  expect(screen.getByRole('heading', { name: "Today's appointments" })).toBeInTheDocument();
  expectNoItLabels();
  expect(praneetaDay.getAllByRole('link').map((link) => link.textContent)).toEqual(['09:30-09:45Ananya ReddyScheduled', '15:00-15:30Fatima BegumChecked in']);
  expect(row(/Mohammed Irfan Siddiqui/).getAttribute('href')).toBe('/dashboard/patients/p2');
  expect(row(/Today.s bookings not yet confirmed/).textContent).toBe("1Today's bookings not yet confirmed");
  const day = row(/Today.s bookings not yet confirmed/).getAttribute('href')?.match(/^\/dashboard\/appointments\?date=(\d{4}-\d{2}-\d{2})$/)?.[1];
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(screen.getByRole('link', { name: 'Dr. Praneeta Jain' }).getAttribute('href')).toBe(`/dashboard/appointments?date=${day}&doctorId=d2`);
});

it("puts the doctor's own queue first, in time order, each row starting or reopening the visit", async () => {
  mockRole = 'DOCTOR';
  render(<DashboardPage />);

  const queue = within(await screen.findByRole('list', { name: 'Your appointments today' }));
  expect(screen.getByRole('heading', { name: 'Your queue today' })).toBeInTheDocument();
  expectNoItLabels();
  expect(queue.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['10:00-10:15Mohammed Irfan SiddiquiConfirmedStart visit', '/dashboard/visits?patientId=p2&appointmentId=a2&autoStart=true'],
    ['12:00-12:15Sai Teja GoudConfirmedOpen visit', '/dashboard/visits?patientId=p5&appointmentId=a5&visitId=v5'],
  ]);
  expect(queue.queryByText('Lakshmi Devi')).not.toBeInTheDocument();
  expect(screen.getByText('1 patient not yet confirmed')).toBeInTheDocument();
  const unconfirmed = within(screen.getByRole('list', { name: 'Not yet confirmed', hidden: true }));
  expect(unconfirmed.getAllByRole('link', { hidden: true }).map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['09:00-09:15Lakshmi DeviScheduledStart visit', '/dashboard/visits?patientId=p7&appointmentId=a7&autoStart=true'],
  ]);
});

it('shows a pharmacist the dispensing queue and low stock by the definition Inventory uses, each linking to its page', async () => {
  mockRole = 'PHARMACIST';
  render(<DashboardPage />);

  expect((await screen.findByRole('link', { name: /Prescriptions waiting to dispense/ })).textContent).toBe('5Prescriptions waiting to dispense');
  expect(screen.getByRole('heading', { name: 'Pharmacy queue' })).toBeInTheDocument();
  expectNoItLabels();
  expect(row(/Prescriptions partly dispensed/).textContent).toBe('1Prescriptions partly dispensed');
  expect([row(/Low stock/).textContent, row(/Low stock/).getAttribute('href')])
    .toEqual(['4Low stockat or below minimum stock', '/dashboard/inventory?area=stock&view=list&stock=LOW']);
  expect(api.getAppointments).not.toHaveBeenCalled();
});

it("shows an admin today's appointments, upcoming, no-shows and collections, and no IT counters", async () => {
  mockRole = 'ADMIN';
  render(<DashboardPage />);

  expect(await screen.findByRole('heading', { name: 'Clinic today' })).toBeInTheDocument();
  expectNoItLabels();
  expect([/Appointments today/, /Upcoming appointments/, /No-shows today/, /Collected today/].map((name) => row(name).textContent))
    .toEqual(['3Appointments today', '3Upcoming appointmentsrest of today and later days', '2No-shows today', '₹1,240.00Collected todayClinic and pharmacy, every payment mode']);
  expect(screen.getByRole('heading', { name: 'Database backup' })).toBeInTheDocument();
});

it('reports a database backup in the app, not in a browser alert', async () => {
  mockRole = 'ADMIN';
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  api.createDatabaseBackup
    .mockResolvedValueOnce({ success: true, jobId: 'backup-2026-11-14T07-00-00-user-1' })
    .mockRejectedValueOnce(new Error('Disk full'));
  render(<><DashboardPage /><Toaster /></>);

  fireEvent.click(await screen.findByRole('button', { name: 'Create backup' }));
  expect(await screen.findByText('Backup started')).toBeInTheDocument();
  expect(screen.getByText('The server is writing the backup now and keeps it with the earlier ones.')).toBeInTheDocument();

  fireEvent.click(await screen.findByRole('button', { name: 'Create backup' }));
  expect(await screen.findByText('Backup failed')).toBeInTheDocument();
  expect(screen.getByText('Disk full')).toBeInTheDocument();
  expect(alert).not.toHaveBeenCalled();
});

it("says today's appointments failed to load instead of claiming an empty day, keeps the counts, and recovers on retry", async () => {
  let dayFails = true;
  const answer = api.getAppointments.getMockImplementation() as (query: { status?: string }) => Promise<unknown>;
  api.getAppointments.mockImplementation(async (query: { status?: string }) => {
    if (dayFails && !query.status) throw httpError(500);
    return answer(query);
  });
  render(<DashboardPage />);

  expect(await screen.findByText("Couldn't load today's appointments")).toBeInTheDocument();
  expect(screen.queryByText('No appointments scheduled for today.')).not.toBeInTheDocument();
  expect((await screen.findByRole('link', { name: /Today.s bookings not yet confirmed/ })).textContent).toBe("1Today's bookings not yet confirmed");

  dayFails = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Ananya Reddy')).toBeInTheDocument();
  expect(screen.queryByText("Couldn't load today's appointments")).not.toBeInTheDocument();
});

it('tells a role without access to ask an admin, on every widget it was refused', async () => {
  api.getAppointments.mockRejectedValue(httpError(403));
  render(<DashboardPage />);

  expect((await screen.findAllByText(/Ask an admin to check your role permissions/)).length).toBeGreaterThan(0);
  expect(screen.getByText("Couldn't load today's appointments")).toBeInTheDocument();
});

it('still shows a genuinely empty day as empty', async () => {
  api.getAppointments.mockResolvedValue({ appointments: [], pagination: { total: 0 } });
  render(<DashboardPage />);

  expect(await screen.findByText('No appointments scheduled for today.')).toBeInTheDocument();
});

it('never asks an accountant, whose grants hold no appointments, for appointments', async () => {
  mockRole = 'ACCOUNTANT';
  render(<DashboardPage />);

  expect(await screen.findByRole('heading', { name: 'Billing to follow up' })).toBeInTheDocument();
  expect([api.getAppointments.mock.calls.length, screen.queryByText("Today's appointments")]).toEqual([0, null]);
});

it.each(['OWNER', 'ADMIN'])('offers the database backup to %s', async (role) => {
  mockRole = role;
  render(<DashboardPage />);

  expect(await screen.findByRole('button', { name: 'Create backup' })).toBeInTheDocument();
});

it('lands a manager on the clinic overview an admin sees, without the database backup the server refuses it', async () => {
  mockRole = 'MANAGER';
  render(<DashboardPage />);

  expect(await screen.findByRole('heading', { name: 'Clinic today' })).toBeInTheDocument();
  await screen.findByText('₹1,240.00');
  expect([/Appointments today/, /Upcoming appointments/, /No-shows today/, /Collected today/].map((name) => row(name).textContent))
    .toEqual(['3Appointments today', '3Upcoming appointmentsrest of today and later days', '2No-shows today', '₹1,240.00Collected todayClinic and pharmacy, every payment mode']);
  expect(screen.queryByText(/bookings not yet confirmed|bookings to confirm/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Database backup' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create backup' })).not.toBeInTheDocument();
});

it("gives a nurse who is waiting for the doctor and today's list, not reception's bookings to confirm", async () => {
  mockRole = 'NURSE';
  render(<DashboardPage />);

  expect(await screen.findByRole('heading', { name: "Today's appointments" })).toBeInTheDocument();
  expect((await screen.findByRole('link', { name: /Checked in, waiting for the doctor/ })).textContent).toBe('1Checked in, waiting for the doctor');
  expect(screen.getByText('Ananya Reddy')).toBeInTheDocument();
  expect(screen.queryByText(/bookings not yet confirmed|bookings to confirm/)).not.toBeInTheDocument();
  expect(api.getAppointments.mock.calls.map(([query]) => query.status).filter(Boolean)).toEqual(['CHECKED_IN']);
});

describe('an accountant, whom the sales register and the billing page refuse', () => {
  beforeEach(() => {
    mockRole = 'ACCOUNTANT';
    api.getSystemAlerts.mockResolvedValue({ counts: { overdueInvoices: 3, pendingPayments: 2, upcomingAppointments: 0 } });
  });

  it('shows the dues as counts and links only the collection report, which the accountant can open', async () => {
    render(<DashboardPage />);

    expect((await screen.findByText('Overdue clinic bills')).closest('li')).toHaveTextContent('3Overdue clinic billsunpaid past their due date');
    expect(screen.getByText('Payments awaiting reconciliation').closest('li')).toHaveTextContent('2Payments awaiting reconciliation');
    expect(linkHrefs()).toEqual(['/dashboard/pharmacy/reports?report=daily-collection']);
  });

  it('links overdue bills to the unpaid clinic bills once the role can open Billing, and leaves payments unlinked', async () => {
    mockBillingForAccountant = true;
    render(<DashboardPage />);

    expect((await screen.findByRole('link', { name: /Overdue clinic bills/ })).getAttribute('href')).toBe('/dashboard/billing?status=overdue');
    expect(screen.queryByRole('link', { name: /Payments awaiting reconciliation/ })).toBeNull();
    expect(linkHrefs()).toEqual(['/dashboard/pharmacy/reports?report=daily-collection', '/dashboard/billing?status=overdue']);
  });
});

describe('one widget failing', () => {
  it('leaves the other admin counts and the day list showing, and retries only the failed count', async () => {
    mockRole = 'ADMIN';
    let collectionFails = true;
    api.get.mockImplementation(async (url: string) => {
      if (url !== '/pharmacy/reports/daily-collection') throw new Error(`unexpected ${url}`);
      if (collectionFails) throw httpError(500);
      return { headline: { value: 1240 } };
    });
    render(<DashboardPage />);

    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Collected today');
    expect(failed).toHaveTextContent("Couldn't load this count. It is not zero.");
    expect([/Appointments today/, /Upcoming appointments/, /No-shows today/].map((name) => row(name).textContent))
      .toEqual(['3Appointments today', '3Upcoming appointmentsrest of today and later days', '2No-shows today']);
    expect(screen.getByText('Ananya Reddy')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Database backup' })).toBeInTheDocument();

    collectionFails = false;
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('₹1,240.00')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect([api.getAppointments.mock.calls.length, api.getSystemAlerts.mock.calls.length]).toEqual([2, 1]);
  });

  it("keeps a pharmacist's prescription counts when the stock overview fails", async () => {
    mockRole = 'PHARMACIST';
    api.get.mockImplementation(async (url: string, params?: { status?: string }) => {
      if (url === '/inventory/workspace/overview') throw httpError(500);
      if (url === '/pharmacy/prescription-queue') return { pagination: { total: params?.status === 'pending' ? 5 : 1 } };
      throw new Error(`unexpected ${url}`);
    });
    render(<DashboardPage />);

    expect((await screen.findByRole('link', { name: /Prescriptions waiting to dispense/ })).textContent).toBe('5Prescriptions waiting to dispense');
    expect(row(/Prescriptions partly dispensed/).textContent).toBe('1Prescriptions partly dispensed');
    const failedRows = await screen.findAllByRole('alert');
    expect(failedRows.map((alert) => alert.querySelector('strong')?.textContent)).toEqual(['Low stock', 'Expiring in the next 3 months']);
  });

  it("tells an accountant who is refused the collection report to ask an admin, and still shows the dues", async () => {
    mockRole = 'ACCOUNTANT';
    api.getSystemAlerts.mockResolvedValue({ counts: { overdueInvoices: 3, pendingPayments: 2, upcomingAppointments: 0 } });
    api.get.mockRejectedValue(httpError(403));
    render(<DashboardPage />);

    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Collected today');
    expect(failed).toHaveTextContent('Ask an admin to check your role permissions');
    expect((await screen.findByText('Overdue clinic bills')).closest('li')).toHaveTextContent('3Overdue clinic bills');
  });
});
