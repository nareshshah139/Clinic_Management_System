import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AppointmentScheduler from '@/components/appointments/AppointmentScheduler';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getUsers: jest.fn().mockResolvedValue({ users: [{ id: 'doc-1', firstName: 'Doc', lastName: 'Tor', role: 'DOCTOR' }] }),
    getAvailableSlots: jest.fn().mockResolvedValue({ availableSlots: ['10:00-10:30'] }),
    getPatients: jest.fn().mockResolvedValue({ patients: [{ id: 'pat-1', firstName: 'Pat', lastName: 'Ient', phone: '9999999999' }] }),
    createAppointment: jest.fn(),
    getDoctorSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
  },
}));

const toastMock = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

jest.mock('@/components/appointments/DoctorDayCalendar', () => function MockDoctorDayCalendar({ onSelectSlot }: { onSelectSlot: (slot: string) => void }) {
  return <button type="button" onClick={() => onSelectSlot('10:00-10:30')}>10:00-10:30</button>;
});

const create = apiClient.createAppointment as jest.Mock;
const overbookOffer = Object.assign(new Error('Scheduling conflict detected'), {
  status: 409, body: { message: 'Scheduling conflict detected', suggestions: [], conflicts: [], overbook: { allowed: true, booked: 2, limit: 3 } },
});

async function confirmBooking() {
  render(<AppointmentScheduler />);
  await waitFor(() => expect(screen.getByText('10:00-10:30')).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('Search patient by name/phone'), { target: { value: 'Pat' } });
  fireEvent.click(await screen.findByText(/Pat Ient/));
  fireEvent.click(screen.getByText('10:00-10:30'));
  fireEvent.click(await screen.findByRole('button', { name: /Confirm Booking/i }));
  return screen.findByRole('dialog', { name: 'Overbook this slot?' });
}

describe('AppointmentScheduler - overbooking confirmation', () => {
  afterEach(() => jest.clearAllMocks());

  it('resends with allowOverbook: true only after the user confirms', async () => {
    create.mockRejectedValueOnce(overbookOffer).mockResolvedValueOnce({ id: 'apt-2', slot: '10:00-10:30' });
    const dialog = await confirmBooking();
    expect(dialog).toHaveTextContent('This slot already has 2 patients. Book anyway? (3 of 3 allowed)');
    expect(create.mock.calls[0][0]).not.toHaveProperty('allowOverbook');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Book anyway' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][0]).toEqual({ ...create.mock.calls[0][0], allowOverbook: true });
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Appointment Booked Successfully' })));
  });

  it('sends nothing more when the user cancels', async () => {
    create.mockRejectedValueOnce(overbookOffer);
    const dialog = await confirmBooking();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Overbook this slot?' })).toBeNull());
    expect(create).toHaveBeenCalledTimes(1);
    expect(toastMock).not.toHaveBeenCalled();
  });
});
