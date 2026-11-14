import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  default: ({ controlledDate, leadingControls, trailingControls }: { controlledDate: string; leadingControls: React.ReactNode; trailingControls: React.ReactNode }) => (
    <div>
      {leadingControls}
      <div data-testid="calendar">{controlledDate}</div>
      {trailingControls}
    </div>
  ),
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

  it.each(['2026-02-30', '2026-04-31', '2026-13-45', 'garbage', '2026-2-3'])('treats %s like garbage and shows today', async (value) => {
    mockQuery = `date=${value}`;
    render(<AppointmentsPage />);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    expect(await screen.findByTestId('calendar')).toHaveTextContent(today);
    expect(screen.getByLabelText('Date')).toHaveValue(today);
  });

  it('accepts the last day of a leap February', async () => {
    mockQuery = 'date=2028-02-29';
    render(<AppointmentsPage />);
    expect(await screen.findByTestId('calendar')).toHaveTextContent('2028-02-29');
  });

  it('says in the Quick Guide what each role sees for visits', async () => {
    mockQuery = '';
    render(<AppointmentsPage />);
    await screen.findByTestId('calendar');
    fireEvent.click(screen.getByRole('button', { name: 'Quick Guide' }));
    const guide = await screen.findByRole('dialog');
    expect(guide).toHaveTextContent('Doctors, admins and owners also get Start visit (or Continue visit) on the row of a confirmed patient. Nurses get Open visit once the visit has started. Reception has no visit button.');
  });

  it('offers no Slots tab', async () => {
    mockQuery = '';
    render(<AppointmentsPage />);
    await screen.findByTestId('calendar');
    expect(screen.queryByRole('tab', { name: 'Slots' })).toBeNull();
  });
});
