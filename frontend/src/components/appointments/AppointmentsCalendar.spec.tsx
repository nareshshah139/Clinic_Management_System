import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppointmentsCalendar from './AppointmentsCalendar';

const createAppointment = jest.fn().mockResolvedValue({ id: 'apt-1' });
const getPatients = jest.fn();
const getAppointments = jest.fn();

const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getPatient: jest.fn().mockResolvedValue({ id: 'p1', firstName: 'Synthetic', lastName: 'Patient', phone: '0000000000' }),
    getUsers: jest.fn().mockResolvedValue({ data: [{ id: 'd1', firstName: 'Do', lastName: 'Ctor', role: 'DOCTOR' }] }),
    getPatients: (...args: any[]) => getPatients(...args),
    getAppointments: (...args: any[]) => getAppointments(...args),
    getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
    getRoomSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    createAppointment: (...args: any[]) => createAppointment(...args),
  },
}));

// Mock the booking dialog to bypass internal validation and call onConfirm
jest.mock('./AppointmentBookingDialog', () => ({
  __esModule: true,
  default: (props: any) => (
    <button onClick={() => props.onConfirm({ visitType: 'OPD', slot: props.slot })}>Confirm Booking</button>
  ),
}));

async function bookIn(column: 'Scheduled' | 'Confirmed', slot: string) {
  const user = userEvent.setup();
  render(<AppointmentsCalendar prefillPatientId="p1" controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
  await screen.findByDisplayValue('Synthetic Patient — 0000000000');
  await user.click(await within(await screen.findByRole('region', { name: column })).findByRole('button', { name: `Book ${slot}` }));
  await user.click(await screen.findByText('Confirm Booking'));
}

beforeEach(() => { createAppointment.mockClear(); getPatients.mockReset(); getAppointments.mockReset().mockResolvedValue({ appointments: [] }); });

describe('AppointmentsCalendar booking flow', () => {

  it('books a free time in the Scheduled column into the Scheduled calendar', async () => {
    await bookIn('Scheduled', '10:00-10:30');
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0]).toEqual({
      doctorId: 'd1', patientId: 'p1', date: '2099-01-01', slot: '10:00-10:15', visitType: 'OPD', roomId: undefined, notes: undefined, calendar: 'SCHEDULED',
    });
  });

  it('books a free time in the Confirmed column into the Confirmed calendar and says so', async () => {
    createAppointment.mockResolvedValueOnce({ id: 'apt-2', slot: '14:00-14:15', patient: { name: 'Synthetic Patient' } });
    await bookIn('Confirmed', '14:00-14:30');
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0][0]).toMatchObject({ slot: '14:00-14:15', calendar: 'CONFIRMED' });
    expect(await screen.findByText('Booked: Synthetic Patient, 01 Jan 2099, 14:00-14:15')).toBeInTheDocument();
  });
});

describe('AppointmentsCalendar late booking response', () => {
  it('does not place a booking answered after the date changed in the newly selected day', async () => {
    const user = userEvent.setup();
    let answer!: (value: unknown) => void;
    createAppointment.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const { rerender } = render(<AppointmentsCalendar prefillPatientId="p1" controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
    await screen.findByDisplayValue('Synthetic Patient — 0000000000');
    await user.click(await within(await screen.findByRole('region', { name: 'Confirmed' })).findByRole('button', { name: 'Book 10:00-10:30' }));
    await user.click(await screen.findByText('Confirm Booking'));
    await waitFor(() => expect(createAppointment).toHaveBeenCalled());
    rerender(<AppointmentsCalendar prefillPatientId="p1" controlledDoctorId="d1" controlledDate="2099-01-02" hideHeaderControls />);
    await act(async () => answer({ id: 'late', slot: '10:00-10:15', patient: { name: 'Synthetic Patient' } }));
    expect(screen.queryByRole('button', { name: /Synthetic Patient, 10:00-10:15/ })).toBeNull();
  });
});

describe('AppointmentsCalendar patient search', () => {
  const person = (id: string, firstName: string, phone: string) => ({ id, firstName, lastName: 'Naik', phone });
  const box = () => screen.getByPlaceholderText('Name or phone');

  it('picks the only match and shows their name and phone in the box', async () => {
    getPatients.mockResolvedValue({ data: [person('p9', 'Kavita', '9822011109')] });
    render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
    await userEvent.type(box(), 'Kavita');
    expect(await screen.findByDisplayValue('Kavita Naik — 9822011109')).toBeInTheDocument();
    expect(getPatients).toHaveBeenCalledTimes(1);
    expect(getPatients).toHaveBeenCalledWith({ search: 'Kavita', limit: 10 });
    expect(screen.queryByText('No matching patients found.')).toBeNull();
  });

  it('waits for the user to choose when several patients match', async () => {
    getPatients.mockResolvedValue({ data: [person('p1', 'Kavita', '9822011109'), person('p2', 'Kavya', '9822011110')] });
    render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
    await userEvent.type(box(), 'Kav');
    await userEvent.click(await screen.findByText('Kavya Naik — 9822011110'));
    expect(screen.getByDisplayValue('Kavya Naik — 9822011110')).toBeInTheDocument();
    expect(screen.queryByText('Kavita Naik — 9822011109')).toBeNull();
  });

  it('clears the chosen patient with Clear', async () => {
    getPatients.mockResolvedValue({ data: [person('p9', 'Kavita', '9822011109')] });
    render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
    await userEvent.type(box(), 'Kavita');
    await screen.findByDisplayValue('Kavita Naik — 9822011109');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box()).toHaveValue('');
  });
});

describe('AppointmentsCalendar patient box states', () => {
  const person = (id: string, firstName: string, lastName: string, phone: string) => ({ id, firstName, lastName, phone });
  const kavita = person('p1', 'Kavita', 'Naik', '9822011109');
  const prakash = person('p2', 'Prakash', 'Kale', '9822011112');
  const box = () => screen.getByPlaceholderText('Name or phone');
  const show = () => render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);

  it('starts a new search from the keystroke alone after a patient was picked, and never opens the add dialog by itself', async () => {
    getPatients.mockImplementation(async ({ search }: { search: string }) => ({ data: search === 'Kav' ? [kavita] : [] }));
    show();
    await userEvent.type(box(), 'Kav');
    await screen.findByDisplayValue('Kavita Naik — 9822011109');
    expect(box()).toHaveAttribute('readonly');

    await userEvent.type(box(), 'ita');
    expect(box()).toHaveValue('ita');
    expect(box()).not.toHaveAttribute('readonly');
    expect(screen.queryByText('No matching patients found.')).toBeNull();
    expect(await screen.findByText('No matching patients found.')).toBeInTheDocument();
    expect(getPatients).toHaveBeenLastCalledWith({ search: 'ita', limit: 10 });
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'New patient' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not show "No matching patients found" during the typing pause', async () => {
    getPatients.mockResolvedValue({ data: [] });
    show();
    await userEvent.type(box(), 'Zed');
    expect(screen.queryByText('No matching patients found.')).toBeNull();
    expect(getPatients).not.toHaveBeenCalled();
    expect(await screen.findByText('No matching patients found.')).toBeInTheDocument();
  });

  it('keeps a patient picked by hand when the answer to a later keystroke arrives late', async () => {
    let late!: (value: unknown) => void;
    getPatients
      .mockResolvedValueOnce({ data: [kavita, prakash] })
      .mockReturnValueOnce(new Promise((resolve) => { late = resolve; }));
    show();
    await userEvent.type(box(), 'Ka');
    const row = await screen.findByText('Prakash Kale — 9822011112');
    await userEvent.type(box(), 'v');
    await waitFor(() => expect(getPatients).toHaveBeenCalledTimes(2));
    await userEvent.click(row);
    expect(screen.getByDisplayValue('Prakash Kale — 9822011112')).toBeInTheDocument();
    await act(async () => late({ data: [kavita] }));
    expect(screen.getByDisplayValue('Prakash Kale — 9822011112')).toBeInTheDocument();
  });

  it('cancels a search still waiting for its pause when a patient is picked', async () => {
    getPatients.mockResolvedValueOnce({ data: [kavita, prakash] }).mockResolvedValue({ data: [kavita] });
    show();
    await userEvent.type(box(), 'Ka');
    const row = await screen.findByText('Prakash Kale — 9822011112');
    await userEvent.type(box(), 'v');
    await userEvent.click(row);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getPatients).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('Prakash Kale — 9822011112')).toBeInTheDocument();
  });

  it('does not pick the only match of a one-letter search, it lists it', async () => {
    getPatients.mockResolvedValue({ data: [kavita] });
    show();
    await userEvent.type(box(), 'K');
    expect(await screen.findByText('Kavita Naik — 9822011109')).toBeInTheDocument();
    expect(box()).toHaveValue('K');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    await userEvent.click(screen.getByText('Kavita Naik — 9822011109'));
    expect(screen.getByDisplayValue('Kavita Naik — 9822011109')).toBeInTheDocument();
  });

  it('clears to an empty box and cancels a pending search', async () => {
    getPatients.mockResolvedValue({ data: [kavita] });
    show();
    await userEvent.type(box(), 'Kavita');
    await screen.findByDisplayValue('Kavita Naik — 9822011109');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box()).toHaveValue('');
    expect(box()).not.toHaveAttribute('readonly');
  });
});

describe('AppointmentsCalendar same-day note', () => {
  const booking = (id: string, slot: string, status: string, doctor: { id: string; firstName: string; lastName: string }) => ({ id, slot, status, doctor, date: '2099-01-01T00:00:00.000Z' });
  const mine = { id: 'd1', firstName: 'Do', lastName: 'Ctor' };
  const rao = { id: 'd2', firstName: 'Anil', lastName: 'Rao' };
  const show = () => render(<AppointmentsCalendar prefillPatientId="p1" controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);

  it('names the other doctor when the patient already has a time that day with them, asking for that patient and day', async () => {
    getAppointments.mockResolvedValue({ appointments: [booking('x1', '10:00-10:15', 'CONFIRMED', rao)] });
    show();
    expect(await screen.findByText('Synthetic Patient already has 10:00 with Dr. Anil Rao on 01 Jan 2099')).toBeInTheDocument();
    expect(getAppointments).toHaveBeenCalledWith({ patientId: 'p1', date: '2099-01-01', limit: 20 });
  });

  it('does not name the doctor when the time is with the doctor on screen, and lists every time', async () => {
    getAppointments.mockResolvedValue({ appointments: [booking('x2', '11:30-11:45', 'SCHEDULED', mine), booking('x1', '10:00-10:15', 'CONFIRMED', mine)] });
    show();
    expect(await screen.findByText('Synthetic Patient already has 10:00, 11:30 on 01 Jan 2099')).toBeInTheDocument();
  });

  it('gives no note for a cancelled appointment or for a day with nothing', async () => {
    getAppointments.mockResolvedValue({ appointments: [booking('x1', '10:00-10:15', 'CANCELLED', rao)] });
    show();
    await screen.findByDisplayValue('Synthetic Patient — 0000000000');
    await waitFor(() => expect(getAppointments).toHaveBeenCalled());
    expect(screen.queryByText(/already has/)).toBeNull();
  });

  it('never blocks booking: a free time still opens the booking dialog while the note shows', async () => {
    getAppointments.mockResolvedValue({ appointments: [booking('x1', '10:00-10:15', 'CONFIRMED', rao)] });
    show();
    await screen.findByText(/already has 10:00 with Dr. Anil Rao/);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Confirmed' })).findByRole('button', { name: 'Book 14:00-14:30' }));
    expect(await screen.findByText('Confirm Booking')).toBeInTheDocument();
  });
});

describe('AppointmentsCalendar toolbar', () => {
  it('opens the legend and the filters only on request, and the legend still explains both calendars', async () => {
    render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls />);
    await screen.findByRole('region', { name: 'Confirmed' });
    expect(screen.queryByText(/Open a scheduled patient and press/)).toBeNull();
    expect(screen.queryByText('Grid', { selector: 'label' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Legend' }));
    expect(screen.getByText(/Open a scheduled patient and press/)).toHaveTextContent('Open a scheduled patient and press Confirm to move them to Confirmed at the same time.');
    expect(screen.getByText('Scheduled:')).toBeInTheDocument();
    expect(['Consultation', 'Procedure', 'Video call', 'Completed', 'Past consultation', 'Past procedure'].map((label) => screen.queryByText(label))).not.toContain(null);
    expect(screen.queryByText(/OPD|Telemedicine/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText('Grid', { selector: 'label' })).toBeInTheDocument();
  });
});

describe('AppointmentsCalendar room filter', () => {
  const roomFilterShown = async (readsRooms: boolean) => {
    const { unmount } = render(<AppointmentsCalendar controlledDoctorId="d1" controlledDate="2099-01-01" hideHeaderControls readsRooms={readsRooms} />);
    await screen.findByRole('region', { name: 'Confirmed' });
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const shown = screen.queryByText('Room', { selector: 'label' }) !== null;
    unmount();
    return shown;
  };

  it('offers the room filter only to a role that may read rooms', async () => {
    expect([await roomFilterShown(true), await roomFilterShown(false)]).toEqual([true, false]);
  });
});
