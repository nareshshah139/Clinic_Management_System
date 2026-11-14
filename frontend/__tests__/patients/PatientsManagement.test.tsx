import { render, screen } from '@testing-library/react';
import PatientsManagement from '@/components/patients/PatientsManagement';
import { apiClient } from '@/lib/api';

let query = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ apiClient: {
  getPatients: jest.fn(),
  getUsers: jest.fn(),
  getRooms: jest.fn(),
} }));

const api = apiClient as jest.Mocked<typeof apiClient>;

beforeEach(() => {
  query = '';
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
});
