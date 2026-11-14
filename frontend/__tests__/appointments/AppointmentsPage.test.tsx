import { render, screen } from '@testing-library/react';
import AppointmentsPage from '@/app/dashboard/appointments/page';

let mockQuery = '';
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockQuery),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { role: 'RECEPTION' } }) }));
jest.mock('@/lib/api', () => ({ apiClient: { getUsers: jest.fn().mockResolvedValue({ users: [] }) } }));
jest.mock('@/components/appointments/AppointmentsCalendar', () => ({
  __esModule: true,
  default: ({ controlledDate }: { controlledDate: string }) => <div data-testid="calendar">{controlledDate}</div>,
}));

beforeEach(() => localStorage.clear());

describe('Appointments page day', () => {
  it('shows the day named in the address', async () => {
    mockQuery = 'date=2026-11-20';
    render(<AppointmentsPage />);
    expect(await screen.findByTestId('calendar')).toHaveTextContent('2026-11-20');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-20');
  });

  it('ignores an address date that is not a day and shows today', async () => {
    mockQuery = 'date=2026-13-45';
    render(<AppointmentsPage />);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    expect(await screen.findByTestId('calendar')).toHaveTextContent(today);
  });

  it('offers no Slots tab', async () => {
    mockQuery = '';
    render(<AppointmentsPage />);
    await screen.findByTestId('calendar');
    expect(screen.queryByRole('tab', { name: 'Slots' })).toBeNull();
  });
});
