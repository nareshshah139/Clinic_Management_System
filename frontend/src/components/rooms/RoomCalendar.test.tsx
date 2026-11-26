import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const booking = {
  id: 'a1', slot: '10:00-10:30', visitType: 'OPD', status: 'CONFIRMED',
  patient: { id: 'p1', name: 'Asha Rao' }, doctor: { id: 'd1', firstName: 'Meera', lastName: 'Shah' },
};

it('opens a dialog with the booking details and a link to the appointment from a click', async () => {
  jest.mocked(apiClient.getRoomSchedule).mockResolvedValue({ appointments: [booking] } as never);
  render(<RoomCalendar />);
  fireEvent.click((await screen.findAllByRole('button', { name: /Asha Rao, 10:00-10:30/ }))[0]);
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Asha Rao');
  expect(dialog).toHaveTextContent('Dr. Meera Shah');
  expect(dialog).toHaveTextContent('10:00-10:30');
  expect(dialog).toHaveTextContent('Confirmed');
  expect(within(dialog).getByRole('link', { name: 'Open in Appointments' })).toHaveAttribute('href', expect.stringMatching(/^\/dashboard\/appointments\?date=\d{4}-\d{2}-\d{2}&doctorId=d1$/));
});

it('opens the booking dialog from the keyboard', async () => {
  jest.mocked(apiClient.getRoomSchedule).mockResolvedValue({ appointments: [booking] } as never);
  render(<RoomCalendar />);
  const block = (await screen.findAllByRole('button', { name: /Asha Rao, 10:00-10:30/ }))[0];
  block.focus();
  await userEvent.keyboard('{Enter}');
  expect(await screen.findByRole('dialog')).toHaveTextContent('Asha Rao');
});

it('fetches the picked date and ignores a slower earlier response', async () => {
  const slow = { appointments: [{ ...booking, id: 'old', patient: { id: 'p2', name: 'Stale Patient' } }] };
  const fresh = { appointments: [{ ...booking, id: 'new', patient: { id: 'p3', name: 'Fresh Patient' } }] };
  const slowResolvers: Array<(v: unknown) => void> = [];
  jest.mocked(apiClient.getRoomSchedule).mockImplementation(((_room: string, date: string) =>
    date === '2031-03-04' ? new Promise((resolve) => { slowResolvers.push(resolve); }) :
    date === '2031-03-05' ? Promise.resolve(fresh) : Promise.resolve({ appointments: [] })) as never);
  render(<RoomCalendar />);
  const picker = await screen.findByLabelText('Date');

  fireEvent.change(picker, { target: { value: '2031-03-04' } });
  await waitFor(() => expect(apiClient.getRoomSchedule).toHaveBeenCalledWith('r0', '2031-03-04'));
  fireEvent.change(picker, { target: { value: '2031-03-05' } });
  await waitFor(() => expect(apiClient.getRoomSchedule).toHaveBeenCalledWith('r0', '2031-03-05'));
  expect((await screen.findAllByText('Fresh Patient')).length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Wednesday, 5 March 2031');

  await act(async () => slowResolvers.forEach((release) => release(slow)));
  expect(screen.queryByText('Stale Patient')).toBeNull();
  expect(screen.getAllByText('Fresh Patient').length).toBeGreaterThan(0);
});

const statValue = (label: string) => screen.getAllByText(label)[0].nextElementSibling?.textContent;

it('says the rooms could not be loaded, with Retry, instead of showing 0 rooms', async () => {
  jest.mocked(apiClient.getRooms).mockRejectedValue(new Error('down'));
  jest.mocked(apiClient.getAllRooms).mockRejectedValue(new Error('down'));
  render(<RoomCalendar />);
  expect(await screen.findByText('Could not load rooms')).toBeInTheDocument();
  expect(screen.queryByText('Total Rooms')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Room occupancy by time' })).toBeNull();

  jest.mocked(apiClient.getRooms).mockResolvedValue({ rooms } as never);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('region', { name: 'Room occupancy by time' })).toHaveTextContent('Laser Suite');
  expect(screen.queryByText('Could not load rooms')).toBeNull();
  expect(statValue('Total Rooms')).toBe('3');
});

it('still says there are no rooms when the clinic has none', async () => {
  jest.mocked(apiClient.getRooms).mockResolvedValue({ rooms: [] } as never);
  render(<RoomCalendar />);
  await screen.findByText('Total Rooms');
  expect(statValue('Total Rooms')).toBe('0');
  expect(screen.queryByText('Could not load rooms')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not count a room whose schedule failed to load as free', async () => {
  jest.mocked(apiClient.getRoomSchedule).mockImplementation(((roomId: string) =>
    roomId === 'r2' ? Promise.reject(new Error('down')) : Promise.resolve({ appointments: [] })) as never);
  render(<RoomCalendar />);
  await screen.findByRole('alert');
  expect(statValue('Available')).toBe('—');
  expect(statValue('Occupied')).toBe('—');
  expect(statValue('Appointments')).toBe('—');
  expect(screen.getAllByText('Not loaded')).toHaveLength(1);
});
