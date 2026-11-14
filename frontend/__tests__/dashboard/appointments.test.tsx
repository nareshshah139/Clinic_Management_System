import { render, screen, waitFor } from '@testing-library/react';
import { UserRole } from '@cms/shared-types';
import DashboardPage from '@/app/dashboard/page';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    getInventoryItemRequestPendingCount: jest.fn(),
    getSystemAlerts: jest.fn(),
    getDoctorSchedule: jest.fn(),
    getAppointments: jest.fn(),
  },
}));

jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: jest.fn(),
}));

const bookings = [
  { name: 'Asha Rao', slot: '09:00-09:15' },
  { name: 'Bina Shah', slot: '09:15-09:30' },
  { name: 'Charu Patel', slot: '09:30-09:45' },
  { name: 'Dev Mehta', slot: '10:00-10:15' },
  { name: 'Esha Nair', slot: '10:15-10:30' },
  { name: 'Farah Khan', slot: '10:30-10:45' },
];

const appointments = bookings.map((booking, index) => ({
  id: `appointment-${index}`,
  date: '2026-11-05T00:00:00.000Z',
  slot: booking.slot,
  status: 'CONFIRMED',
  patient: { id: `patient-${index}`, name: booking.name },
}));

function renderDashboard(role: UserRole.DOCTOR | UserRole.ADMIN = UserRole.DOCTOR) {
  (useDashboardUser as jest.Mock).mockReturnValue({
    user: { id: 'doctor-1', role },
    loading: false,
  });
  return render(<DashboardPage />);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2026-11-05T06:00:00.000Z'));
  (apiClient.get as jest.Mock).mockResolvedValue({ wholeDay: null, collection: { expectedTotal: 0, modes: [] }, pendingEdits: 0 });
  (apiClient.getInventoryItemRequestPendingCount as jest.Mock).mockResolvedValue({ count: 0 });
  (apiClient.getSystemAlerts as jest.Mock).mockResolvedValue({});
  (apiClient.getDoctorSchedule as jest.Mock).mockResolvedValue({ appointments });
  (apiClient.getAppointments as jest.Mock).mockResolvedValue({ appointments });
});

afterEach(() => {
  jest.useRealTimers();
});

it('displays the canonical patient names for six booked appointments', async () => {
  renderDashboard();
  await screen.findByRole('button', { name: 'View All Appointments' });

  for (const booking of bookings) {
    expect(screen.getByText(booking.name, { exact: true })).toBeVisible();
  }
});

it('shows each booked slot without a clock time derived from its date', async () => {
  renderDashboard();
  await screen.findByRole('button', { name: 'View All Appointments' });

  for (const booking of bookings) {
    expect(screen.getByText(booking.slot, { exact: true })).toBeVisible();
  }
});

it.each([
  ['canonical name', { id: 'p-1', name: 'Asha Rao', firstName: 'Old', lastName: 'Name' }, 'Asha Rao'],
  ['legacy names', { id: 'p-2', firstName: '  Bina ', lastName: ' Shah  ' }, 'Bina Shah'],
  ['patient ID', { id: 'patient-1234' }, 'Patient 1234'],
  ['missing patient', undefined, 'Unknown Patient'],
])('uses the %s patient label', async (_case, patient, expected) => {
  (apiClient.getDoctorSchedule as jest.Mock).mockResolvedValue({
    appointments: [{ ...appointments[0], patient }],
  });

  renderDashboard();
  expect(await screen.findByText(expected, { exact: true })).toBeVisible();
});

describe.each([UserRole.DOCTOR, UserRole.ADMIN] as const)('%s clinic-day queries', (role) => {
  it.each([
    ['2026-11-04T18:29:59.000Z', '2026-11-04'],
    ['2026-11-04T18:30:00.000Z', '2026-11-05'],
    ['2026-11-04T20:00:00.000Z', '2026-11-05'],
  ])('loads bookings for the IST day at %s', async (instant, expectedDate) => {
    jest.setSystemTime(new Date(instant));
    (apiClient.getDoctorSchedule as jest.Mock).mockImplementation(
      (_doctorId: string, date: string) => Promise.resolve({
        appointments: date === expectedDate ? appointments : [],
      }),
    );
    (apiClient.getAppointments as jest.Mock).mockImplementation(
      ({ date }: { date: string }) => Promise.resolve({
        appointments: date === expectedDate ? appointments : [],
      }),
    );

    renderDashboard(role);

    await waitFor(() => {
      if (role === UserRole.DOCTOR) {
        expect(apiClient.getDoctorSchedule).toHaveBeenCalledWith('doctor-1', expectedDate);
      } else {
        expect(apiClient.getAppointments).toHaveBeenCalledWith({
          date: expectedDate,
          limit: 5,
          sortBy: 'slot',
          sortOrder: 'asc',
        });
      }
    });
    expect(await screen.findByRole('button', { name: 'View All Appointments' })).toBeVisible();
    expect(screen.queryByText('No appointments scheduled for today')).not.toBeInTheDocument();
  });
});
