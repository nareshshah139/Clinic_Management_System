import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './header';

const push = jest.fn();
const getSystemAlerts = jest.fn();
let signedIn: { user: { id: string; role: string; firstName: string; lastName: string }; loading: boolean; refresh: jest.Mock };

jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('./dashboard-user-context', () => ({ useDashboardUser: () => signedIn }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/issue-report/ReportIssueButton', () => ({ ReportIssueButton: () => null }));
jest.mock('@/components/tours/ReceptionistTour', () => ({ ReceptionistTour: () => <button>Start tour</button> }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getSystemAlerts: (...args: unknown[]) => getSystemAlerts(...args),
    getPatients: jest.fn().mockResolvedValue({ data: [{ id: 'p-rahul', firstName: 'Rahul', lastName: 'Kumar', phone: '9848010411', gender: 'MALE', age: 19 }] }),
    getAppointments: jest.fn().mockResolvedValue({ appointments: [] }),
    getUsers: jest.fn().mockResolvedValue({ users: [] }),
  },
}));

const as = (role: string) => {
  signedIn = { user: { id: 'u1', role, firstName: 'Sunita', lastName: 'Patil' }, loading: false, refresh: jest.fn() };
  getSystemAlerts.mockResolvedValue({});
};

beforeEach(() => {
  push.mockReset();
  getSystemAlerts.mockReset();
});

describe('Header on a phone', () => {
  it('offers search, notifications and settings next to the navigation button', async () => {
    as('DOCTOR');
    render(<Header leading={<button>Open clinic navigation</button>} />);
    for (const name of ['Open clinic navigation', 'Search', 'Notifications', 'Open settings']) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('asks for alerts once, not once per layout', async () => {
    as('DOCTOR');
    render(<Header />);
    await screen.findByRole('button', { name: 'Notifications' });
    expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Open settings' })).toHaveLength(1);
    expect(getSystemAlerts).toHaveBeenCalledTimes(1);
  });

  it('finds a patient from the phone search and opens the profile', async () => {
    as('RECEPTION');
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const boxes = screen.getAllByRole('combobox', { hidden: true, name: 'Search patients, appointments, doctors' });
    const phoneBox = boxes[boxes.length - 1];
    expect(phoneBox).toHaveFocus();
    await user.type(phoneBox, 'ra');
    await user.click(await screen.findByRole('option', { name: /Rahul Kumar/ }));
    expect(push).toHaveBeenCalledWith('/dashboard/patients/p-rahul');
    expect(screen.queryByRole('button', { name: 'Close search' })).toBeNull();
  });

  it('closes the phone search without searching', async () => {
    as('DOCTOR');
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByRole('button', { name: 'Close search' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  it('keeps the tour launcher in the bar for reception only', async () => {
    as('RECEPTION');
    const { unmount } = render(<Header />);
    expect(await screen.findByRole('button', { name: 'Start tour' })).toBeInTheDocument();
    unmount();
    as('DOCTOR');
    render(<Header />);
    await screen.findByRole('button', { name: 'Notifications' });
    expect(screen.queryByRole('button', { name: 'Start tour' })).toBeNull();
  });
});
