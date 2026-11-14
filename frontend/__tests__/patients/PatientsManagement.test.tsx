import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import PatientsManagement from '@/components/patients/PatientsManagement';
import { apiClient } from '@/lib/api';

let query = '';
let role = 'DOCTOR';
const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(query),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ apiClient: {
  getPatients: jest.fn(),
  getUsers: jest.fn(),
  getRooms: jest.fn(),
} }));

const api = apiClient as jest.Mocked<typeof apiClient>;

const render = (ui: React.ReactElement) => rtlRender(
  <DashboardUserProvider value={{ user: { id: 'u1', role, firstName: 'A', lastName: 'B', email: 'a@example.test', phone: '1' } as never, loading: false, refresh: jest.fn(), logout: jest.fn() }}>{ui}</DashboardUserProvider>,
);

beforeEach(() => {
  query = '';
  role = 'DOCTOR';
  push.mockClear();
  replace.mockClear();
  api.getPatients.mockResolvedValue({ data: [{ id: 'p1', name: 'Rohan Kulkarni', phone: '9822011102', gender: 'MALE', age: 38 }], meta: { total: 1, totalPages: 1 } } as never);
  api.getUsers.mockResolvedValue({ data: [{ id: 'doc-1', firstName: 'Priya', lastName: 'Menon' }] } as never);
  api.getRooms.mockResolvedValue({ rooms: [] } as never);
});

describe('patients list', () => {
  it('focuses the search box on arrival', async () => {
    render(<PatientsManagement />);
    await screen.findByText('Rohan Kulkarni');
    expect(screen.getByPlaceholderText('Search name or phone')).toHaveFocus();
  });

  it('does not open the new patient dialog by itself', async () => {
    render(<PatientsManagement />);
    await screen.findByText('Rohan Kulkarni');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the walk-in dialog straight away for ?new=walkin', async () => {
    query = 'new=walkin';
    render(<PatientsManagement />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Register and book' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Name *')).toHaveFocus();
  });

  it('names the button New patient and lists View, Start visit and More for each row', async () => {
    render(<PatientsManagement />);
    await screen.findByText('Rohan Kulkarni');
    expect(screen.getByRole('button', { name: 'New patient' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start visit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /More actions for Rohan Kulkarni/ })).toBeInTheDocument();
  });

  it('removes ?new=walkin from the address once the dialog has opened', async () => {
    query = 'new=walkin';
    render(<PatientsManagement />);
    await screen.findByRole('dialog');
    expect(replace).toHaveBeenCalledWith('/dashboard/patients');
  });

  it('offers Book appointment instead of Start visit to a role that cannot start visits', async () => {
    const user = userEvent.setup();
    role = 'RECEPTION';
    render(<PatientsManagement />);
    await screen.findByText('Rohan Kulkarni');
    expect(screen.queryByRole('button', { name: 'Start visit' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Book appointment for Rohan Kulkarni' }));
    expect(push).toHaveBeenCalledWith('/dashboard/appointments?patientId=p1');
  });
});
