import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RoomsManagement from './RoomsManagement';
import { apiClient } from '@/lib/api';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { role: 'ADMIN' } }) }));
jest.mock('@/lib/api', () => ({ apiClient: { getRooms: jest.fn(), getAllRooms: jest.fn() } }));

const active = { id: 'r1', name: 'Consult 1', type: 'Consultation', capacity: 2, isActive: true };
const inactive = { id: 'r2', name: 'Old Laser Suite', type: 'Procedure', capacity: 1, isActive: false };

beforeEach(() => {
  jest.mocked(apiClient.getRooms).mockReset().mockResolvedValue({ rooms: [active] } as never);
  jest.mocked(apiClient.getAllRooms).mockReset();
});

it('lists inactive rooms so a deactivated room can be reactivated', async () => {
  jest.mocked(apiClient.getAllRooms).mockResolvedValue({ rooms: [active, inactive] } as never);
  render(<RoomsManagement />);
  expect(await screen.findByText('Old Laser Suite')).toBeInTheDocument();
  expect(screen.getByText('Consult 1')).toBeInTheDocument();
  expect(apiClient.getRooms).not.toHaveBeenCalled();
});

it('falls back to the active rooms when the role may not see all rooms', async () => {
  jest.mocked(apiClient.getAllRooms).mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
  render(<RoomsManagement />);
  expect(await screen.findByText('Consult 1')).toBeInTheDocument();
  await waitFor(() => expect(apiClient.getRooms).toHaveBeenCalledTimes(1));
});

it('does not hide a server failure behind the active-only list', async () => {
  jest.mocked(apiClient.getAllRooms).mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
  render(<RoomsManagement />);
  await waitFor(() => expect(apiClient.getAllRooms).toHaveBeenCalled());
  expect(apiClient.getRooms).not.toHaveBeenCalled();
  expect(screen.queryByText('Consult 1')).toBeNull();
});

it('says the rooms could not be loaded, with Retry, instead of an empty clinic', async () => {
  jest.mocked(apiClient.getAllRooms).mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
  render(<RoomsManagement />);
  expect(await screen.findByText('Could not load rooms')).toBeInTheDocument();
  expect(screen.queryByText(/No rooms found/)).toBeNull();
  expect(screen.getByText('Total Rooms').nextElementSibling).toHaveTextContent('—');

  jest.mocked(apiClient.getAllRooms).mockResolvedValue({ rooms: [active, inactive] } as never);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Old Laser Suite')).toBeInTheDocument();
  expect(screen.queryByText('Could not load rooms')).toBeNull();
  expect(screen.getByText('Total Rooms').nextElementSibling).toHaveTextContent('1');
});

it('says there are no rooms yet when the clinic has none', async () => {
  jest.mocked(apiClient.getAllRooms).mockResolvedValue({ rooms: [] } as never);
  render(<RoomsManagement />);
  expect(await screen.findByText(/No rooms found/)).toBeInTheDocument();
  expect(screen.queryByText('Could not load rooms')).toBeNull();
});
