import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DoctorDayCalendar from './DoctorDayCalendar';
import { apiClient } from '@/lib/api';
import { AppointmentStatus } from '@cms/shared-types';

const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn(),
    deleteAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
  },
}));

const appointment = (id: string, slot: string, name: string, status: AppointmentStatus, extra: object = {}) => ({
  id, slot, status, visitType: 'OPD', patient: { name }, ...extra,
});

function renderDay(appointments: object[], onSelectSlot = jest.fn()) {
  (apiClient.getDoctorSchedule as jest.Mock).mockResolvedValue({ appointments });
  render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" onSelectSlot={onSelectSlot} />);
  return onSelectSlot;
}

const blockFor = (name: RegExp) => screen.getByRole('button', { name: new RegExp(`^(?:Token \\d+, )?${name.source}, `, name.flags) }).parentElement as HTMLElement;
const calendarName = { selector: '[data-appointment-block] [data-patient-name]' };

describe('DoctorDayCalendar appointment blocks', () => {
  it('lays two appointments in the same slot side by side, each with its own readable name', async () => {
    renderDay([
      appointment('a1', '11:00-11:15', 'Mohammed Irfan', AppointmentStatus.SCHEDULED, { tokenNumber: 6 }),
      appointment('a2', '11:00-11:15', 'Lakshmi Devi', AppointmentStatus.SCHEDULED, { tokenNumber: 7 }),
    ]);

    expect(await screen.findByText('Mohammed Irfan', calendarName)).toBeInTheDocument();
    expect(screen.getByText('Lakshmi Devi', calendarName)).toBeInTheDocument();

    const first = blockFor(/Mohammed Irfan/);
    const second = blockFor(/Lakshmi Devi/);
    expect(first).not.toBe(second);
    expect(within(first).queryByText('Lakshmi Devi')).toBeNull();
    expect([first.style.left, first.style.width]).toEqual(['0%', '50%']);
    expect([second.style.left, second.style.width]).toEqual(['50%', '50%']);
    expect(within(first).getByText('#6')).toBeInTheDocument();
  });

  it('names each block with token, patient, time and status', async () => {
    renderDay([appointment('a1', '10:00-10:30', 'Ravi Kumar', AppointmentStatus.CHECKED_IN, { tokenNumber: 4 })]);
    expect(await screen.findByRole('button', { name: 'Token 4, Ravi Kumar, 10:00-10:30, Checked in' })).toBeInTheDocument();
  });

  it.each([
    [AppointmentStatus.SCHEDULED, 'Scheduled'],
    [AppointmentStatus.CONFIRMED, 'Confirmed'],
    [AppointmentStatus.CHECKED_IN, 'Checked in'],
    [AppointmentStatus.IN_PROGRESS, 'In progress'],
    [AppointmentStatus.COMPLETED, 'Completed'],
    [AppointmentStatus.NO_SHOW, 'No-show'],
  ])('shows a %s chip on the block', async (status, label) => {
    renderDay([appointment('a1', '10:00-10:30', 'Ravi Kumar', status)]);
    await screen.findByText('Ravi Kumar', calendarName);
    expect(within(blockFor(/Ravi Kumar/)).getByText(label)).toBeInTheDocument();
  });

  it('strikes through the name of a no-show only', async () => {
    renderDay([
      appointment('a1', '10:00-10:30', 'Suresh Babu', AppointmentStatus.NO_SHOW),
      appointment('a2', '12:00-12:30', 'Priya Nair', AppointmentStatus.SCHEDULED),
    ]);
    expect(await screen.findByText('Suresh Babu', calendarName)).toHaveClass('line-through');
    expect(screen.getByText('Priya Nair', calendarName)).not.toHaveClass('line-through');
  });

  it('does not draw cancelled appointments', async () => {
    renderDay([
      appointment('a1', '10:00-10:30', 'Alice', AppointmentStatus.SCHEDULED),
      appointment('a2', '10:30-11:00', 'Bob', AppointmentStatus.CANCELLED),
    ]);
    await screen.findByText('Alice', calendarName);
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('opens appointment details when a block is activated', async () => {
    renderDay([appointment('a1', '10:00-10:30', 'Ravi Kumar', AppointmentStatus.CONFIRMED)]);
    fireEvent.click(await screen.findByRole('button', { name: /^Ravi Kumar, / }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Appointment Details')).toBeInTheDocument();
    expect(within(dialog).getByText('10:00-10:30')).toBeInTheDocument();
  });

  it('reschedules from the details dialog, which narrow blocks rely on', async () => {
    renderDay([appointment('a1', '10:00-10:30', 'Ravi Kumar', AppointmentStatus.CONFIRMED)]);
    fireEvent.click(await screen.findByRole('button', { name: /^Ravi Kumar, / }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));
    expect(await screen.findByText('Rescheduling Ravi Kumar')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not open details for an appointment that is still saving', async () => {
    renderDay([appointment('optimistic-1', '10:00-10:30', 'Ravi Kumar', AppointmentStatus.SCHEDULED)]);
    expect(await screen.findByRole('button', { name: /^Ravi Kumar, / })).toBeDisabled();
  });

  it('still opens details through the INFO control', async () => {
    renderDay([appointment('a1', '10:00-10:30', 'Ravi Kumar', AppointmentStatus.CONFIRMED)]);
    await screen.findByText('Ravi Kumar', calendarName);
    fireEvent.click(screen.getByTitle('View Appointment Details'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Ravi Kumar');
  });

  it('books the clicked empty slot', async () => {
    const onSelectSlot = renderDay([appointment('a1', '10:00-10:30', 'Ravi Kumar', AppointmentStatus.SCHEDULED)]);
    await screen.findByText('Ravi Kumar', calendarName);
    fireEvent.click(screen.getByRole('button', { name: 'Book 14:00-14:30' }));
    expect(onSelectSlot).toHaveBeenCalledWith('14:00-14:15');
  });

  it('books a press-and-release on an empty tile as the whole tile', async () => {
    const onSelectSlot = renderDay([appointment('a1', '10:00-10:30', 'Ravi Kumar', AppointmentStatus.SCHEDULED)]);
    await screen.findByText('Ravi Kumar', calendarName);
    const tile = screen.getByRole('button', { name: 'Book 14:00-14:30' }).parentElement as HTMLElement;
    fireEvent.mouseDown(tile, { button: 0 });
    fireEvent.mouseUp(tile);
    expect(onSelectSlot).toHaveBeenCalledWith('14:00-14:30');
  });
});
