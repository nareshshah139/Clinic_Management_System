import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import { apiClient } from '@/lib/api';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/common/QuickGuide', () => ({ QuickGuide: () => null }));
jest.mock('@/components/dashboard/DoctorPatientPanels', () => ({ DoctorPatientPanels: () => null }));
let mockRole = 'RECEPTION';
jest.mock('@/components/layout/dashboard-user-context', () => ({
  useDashboardUser: () => ({ user: { id: 'user-1', role: mockRole }, loading: false }),
}));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getSystemStatistics: jest.fn(),
    getSystemAlerts: jest.fn(),
    getAppointments: jest.fn(),
    getDoctorSchedule: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const appointment = { id: 'a1', slot: '10:00-10:30', status: 'SCHEDULED', patient: { name: 'Aarav Reddy' } };

beforeEach(() => {
  mockRole = 'RECEPTION';
  jest.resetAllMocks();
  api.getSystemStatistics.mockRejectedValue(httpError(403));
  api.getSystemAlerts.mockResolvedValue({});
  api.getAppointments.mockResolvedValue({ appointments: [appointment] });
});

it('says the appointments failed to load instead of claiming an empty day, and recovers on retry', async () => {
  api.getAppointments.mockRejectedValueOnce(httpError(500));
  render(<DashboardPage />);

  expect(await screen.findByText("Couldn't load today's appointments")).toBeInTheDocument();
  expect(screen.queryByText('No appointments scheduled for today')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Aarav Reddy')).toBeInTheDocument();
  expect(screen.queryByText("Couldn't load today's appointments")).not.toBeInTheDocument();
});

it('tells a role without access to ask an admin', async () => {
  api.getAppointments.mockRejectedValue(httpError(403));
  render(<DashboardPage />);

  expect(await screen.findByText(/Ask an admin to check your role permissions/)).toBeInTheDocument();
});

it('does not report all systems operational when alerts fail to load', async () => {
  api.getSystemAlerts.mockRejectedValue(httpError(500));
  render(<DashboardPage />);

  expect(await screen.findByText("Couldn't load clinic alerts")).toBeInTheDocument();
  expect(screen.queryByText('All systems operational')).not.toBeInTheDocument();
});

it('still shows a genuinely empty day as empty', async () => {
  api.getAppointments.mockResolvedValue({ appointments: [] });
  render(<DashboardPage />);

  expect(await screen.findByText('No appointments scheduled for today')).toBeInTheDocument();
});

it.each(['PHARMACIST', 'ACCOUNTANT'])('never asks for appointments for %s, whose grants hold none, and shows no appointments card', async (role) => {
  mockRole = role;
  render(<DashboardPage />);

  await waitFor(() => expect(api.getSystemAlerts.mock.calls.length).toBe(1));
  expect([screen.getByText('System Alerts').textContent, api.getAppointments.mock.calls.length, screen.queryByText("Today's Appointments")]).toEqual(['System Alerts', 0, null]);
});

it("shows a manager today's appointments", async () => {
  mockRole = 'MANAGER';
  render(<DashboardPage />);

  expect(await screen.findByText('Aarav Reddy')).toBeInTheDocument();
});
