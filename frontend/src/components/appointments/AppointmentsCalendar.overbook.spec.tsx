import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppointmentsCalendar from './AppointmentsCalendar';

const createAppointment = jest.fn();
const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn().mockResolvedValue({
      appointments: [{ id: 'a1', slot: '11:00-11:30', status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD', patient: { name: 'Ravi Kumar' } }],
    }),
    getDoctorDay: jest.fn().mockResolvedValue({
      date: '2099-01-01', weekday: 4, source: 'configured', working: [{ start: 540, end: 1080 }],
      intervals: [{ start: 540, end: 1080 }], blocked: [], maxBookingsPerSlot: 2,
    }),
    getUsers: jest.fn().mockResolvedValue({ data: [{ id: 'd1', firstName: 'Do', lastName: 'Ctor', role: 'DOCTOR' }] }),
    getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
    getRoomSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getPatient: jest.fn().mockResolvedValue({ id: 'p1', name: 'Asha Rao' }),
    createAppointment: (...args: unknown[]) => createAppointment(...args),
  },
}));

jest.mock('./AppointmentBookingDialog', () => ({
  __esModule: true,
  default: (props: any) => (
    <button onClick={() => props.onConfirm({ visitType: 'OPD', slot: props.slot })}>Confirm Booking</button>
  ),
}));

const conflict = (overbook: object) => Object.assign(new Error('Scheduling conflict detected'), {
  status: 409, body: { message: 'Scheduling conflict detected', suggestions: ['12:00-12:30'], conflicts: [], overbook },
});

async function bookIntoOccupiedSlot() {
  const user = userEvent.setup();
  render(<AppointmentsCalendar prefillPatientId="p1" controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
  const scheduled = within(await screen.findByRole('region', { name: 'Scheduled' }));
  await user.click(await scheduled.findByRole('button', { name: 'Book 11:00-11:30, 1 of 2 booked' }));
  await user.click(await screen.findByText('Confirm Booking'));
  return user;
}

describe('AppointmentsCalendar booking into a slot that allows overbooking', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks first, then resends with allowOverbook: true only after "Book anyway"', async () => {
    createAppointment.mockRejectedValueOnce(conflict({ allowed: true, booked: 1, limit: 2 })).mockResolvedValueOnce({ id: 'a2', slot: '11:00-11:15' });
    const user = await bookIntoOccupiedSlot();

    const dialog = await screen.findByRole('dialog', { name: 'Overbook this slot?' });
    expect(dialog).toHaveTextContent('This slot already has 1 patient. Book anyway? (2 of 2 allowed)');
    expect(createAppointment).toHaveBeenCalledTimes(1);
    expect(createAppointment.mock.calls[0][0]).not.toHaveProperty('allowOverbook');

    await user.click(within(dialog).getByRole('button', { name: 'Book anyway' }));
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(2));
    expect(createAppointment.mock.calls[1][0]).toEqual({ ...createAppointment.mock.calls[0][0], allowOverbook: true });
    expect(await screen.findByText('Booked: Asha Rao, 01 Jan 2099, 11:00-11:15')).toBeInTheDocument();
  });

  it('sends nothing more when the user cancels', async () => {
    createAppointment.mockRejectedValueOnce(conflict({ allowed: true, booked: 1, limit: 2 }));
    const user = await bookIntoOccupiedSlot();
    const dialog = await screen.findByRole('dialog', { name: 'Overbook this slot?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Overbook this slot?' })).toBeNull());
    expect(createAppointment).toHaveBeenCalledTimes(1);
    expect(stableToast).not.toHaveBeenCalled();
  });

  it('keeps today\'s conflict message when the server does not offer to overbook', async () => {
    createAppointment.mockRejectedValueOnce(conflict({ allowed: false, booked: 2, limit: 2 }));
    await bookIntoOccupiedSlot();

    await waitFor(() => expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Scheduling Conflict',
      description: 'Scheduling conflict detected — Try: 12:00-12:30',
    })));
    expect(screen.queryByRole('dialog', { name: 'Overbook this slot?' })).toBeNull();
    expect(createAppointment).toHaveBeenCalledTimes(1);
  });
});
