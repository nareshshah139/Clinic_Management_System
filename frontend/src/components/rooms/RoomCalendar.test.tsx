import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RoomCalendar from './RoomCalendar';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getRooms: jest.fn(), getAllRooms: jest.fn(), getRoomSchedule: jest.fn() } }));

const rooms = ['Consultation Room 1', 'Procedure Room A', 'Laser Suite'].map((name, i) => ({ id: `r${i}`, name, type: 'CONSULTATION', capacity: 2, isActive: true }));

beforeEach(() => {
  jest.mocked(apiClient.getRooms).mockResolvedValue({ rooms } as never);
  jest.mocked(apiClient.getRoomSchedule).mockResolvedValue({ appointments: [] } as never);
});

function sizeGrid(region: HTMLElement, scrollWidth: number, clientWidth: number, scrollLeft = 0) {
  Object.defineProperties(region, {
    scrollWidth: { configurable: true, value: scrollWidth },
    clientWidth: { configurable: true, value: clientWidth },
    scrollLeft: { configurable: true, value: scrollLeft },
  });
  fireEvent.scroll(region);
}

it('says more rooms are to the right only while some are out of view', async () => {
  render(<RoomCalendar />);
  const region = await screen.findByRole('region', { name: 'Room occupancy by time' });
  expect(screen.queryByText('Scroll sideways for more rooms')).toBeNull();

  act(() => sizeGrid(region, 1168, 926));
  expect(screen.getByText('Scroll sideways for more rooms')).toBeInTheDocument();

  act(() => sizeGrid(region, 1168, 926, 242));
  expect(screen.queryByText('Scroll sideways for more rooms')).toBeNull();
});

it('shows an error with Retry instead of rooms that look free when a schedule fails to load', async () => {
  jest.mocked(apiClient.getRoomSchedule).mockRejectedValue(new Error('down'));
  render(<RoomCalendar />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the room schedule');

  jest.mocked(apiClient.getRoomSchedule).mockResolvedValue({ appointments: [] } as never);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

it('extends the visible hours to show bookings outside 09:00-18:00', async () => {
  jest.mocked(apiClient.getRoomSchedule).mockResolvedValue({
    appointments: [{ id: 'a1', slot: '19:00-19:30', visitType: 'OPD', patient: { name: 'Late Patient' } }],
  } as never);
  render(<RoomCalendar />);
  expect((await screen.findAllByText('Late Patient')).length).toBeGreaterThan(0);
  expect(screen.getByText('19:30')).toBeInTheDocument();
});
