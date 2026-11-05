import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DoctorDayCalendar from './DoctorDayCalendar';
import { apiClient } from '@/lib/api';
import type { AppointmentInSlot } from '@/lib/types';

const stableToast = jest.fn();
const navigate = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: stableToast }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: navigate }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn(),
    getPatient: jest.fn().mockResolvedValue({ age: 42, gender: 'FEMALE' }),
    getPatientVisitHistory: jest.fn().mockResolvedValue([]),
    deleteAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
  },
}));

const appointment = {
  id: 'a1', slot: '10:00-10:15', patient: { id: 'p1', name: 'Alice', phone: '555-0100' },
  status: 'SCHEDULED', visitType: 'PROCEDURE', notes: 'A complete procedure description',
  room: { id: 'r1', name: 'Procedure room', type: 'PROCEDURE' },
};

async function renderCalendar(override: Record<string, unknown> = {}) {
  render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" {...override} />);
  return screen.findByRole('button', { name: /View appointment details for Alice/ });
}

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.getDoctorSchedule as jest.Mock).mockResolvedValue({ appointments: [
    appointment,
    { id: 'a2', slot: '10:30-11:00', patient: { name: 'Bob' }, status: 'CANCELLED', visitType: 'OPD' },
  ] });
});

describe('DoctorDayCalendar', () => {
  it('shows scheduled summaries and excludes cancelled appointments', async () => {
    await renderCalendar();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('opens full details on click, preserves actions and restores summary focus', async () => {
    const user = userEvent.setup();
    const summary = await renderCalendar();
    await user.click(summary);
    const details = screen.getByRole('dialog', { name: 'Appointment Details' });
    expect(within(details).getByText('A complete procedure description')).toBeVisible();
    expect(within(details).getByText('Procedure room (PROCEDURE)')).toBeVisible();
    expect(within(details).getByRole('button', { name: 'Reschedule' })).toBeEnabled();
    expect(within(details).getByRole('button', { name: 'Cancel Appointment' })).toBeEnabled();
    await user.click(within(details).getByRole('button', { name: 'Start Visit' }));
    expect(navigate).toHaveBeenCalledWith('/dashboard/visits?patientId=p1&appointmentId=a1&autoStart=true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it.each(['{Enter}', ' '])('opens details with keyboard activation %p', async key => {
    const user = userEvent.setup();
    await renderCalendar();
    await user.tab();
    await user.keyboard(key);
    expect(screen.getByRole('dialog', { name: 'Appointment Details' })).toBeVisible();
  });

  it('moves focus to rescheduling instructions', async () => {
    const user = userEvent.setup();
    await user.click(await renderCalendar());
    await user.click(screen.getByRole('button', { name: 'Reschedule' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Rescheduling Alice').parentElement?.parentElement).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /View appointment details for Alice/ })).toHaveFocus();
    const preview = await screen.findByRole('tooltip');
    expect(within(preview).getByText('A complete procedure description')).toBeInTheDocument();
  });

  it('returns cancellation confirmation to the existing details and its cancel action', async () => {
    const user = userEvent.setup();
    await user.click(await renderCalendar());
    await user.click(screen.getByRole('button', { name: 'Cancel Appointment' }));
    const confirmation = screen.getByRole('dialog', { name: 'Cancel Appointment' });
    await user.click(within(confirmation).getByRole('button', { name: 'Keep Appointment' }));
    const details = screen.getByRole('dialog', { name: 'Appointment Details' });
    await waitFor(() => expect(within(details).getByRole('button', { name: 'Cancel Appointment' })).toHaveFocus());
    expect(apiClient.deleteAppointment).not.toHaveBeenCalled();
  });

  it('restores calendar focus when cancellation removes the appointment', async () => {
    const user = userEvent.setup();
    const updated = jest.fn();
    await user.click(await renderCalendar({ onAppointmentUpdate: updated }));
    await user.click(screen.getByRole('button', { name: 'Cancel Appointment' }));
    (apiClient.getDoctorSchedule as jest.Mock).mockResolvedValue({ appointments: [] });
    await user.click(screen.getByRole('button', { name: 'Yes, Cancel Appointment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiClient.deleteAppointment).toHaveBeenCalledWith('a1');
    expect(updated).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText('Daily appointment calendar')).toHaveFocus());
  });

  it('continues an existing visit without starting another', async () => {
    const user = userEvent.setup();
    (apiClient.getDoctorSchedule as jest.Mock).mockResolvedValue({ appointments: [{ ...appointment, visit: { id: 'v1' } }] });
    await user.click(await renderCalendar());
    await user.click(screen.getByRole('button', { name: 'Continue Visit' }));
    expect(navigate).toHaveBeenCalledWith('/dashboard/visits?patientId=p1&appointmentId=a1&visitId=v1');
  });

  it('shows pending appointment facts while withholding mutation actions', async () => {
    const user = userEvent.setup();
    const optimistic = { ...appointment, id: 'optimistic-a1', doctor: { firstName: 'Dr.', lastName: 'Lee' } } as AppointmentInSlot;
    await user.click(await renderCalendar({ optimisticAppointment: optimistic }));
    const details = screen.getByRole('dialog', { name: 'Appointment Details' });
    expect(within(details).getByText('A complete procedure description')).toBeVisible();
    expect(within(details).queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: 'Start Visit' })).not.toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: 'Cancel Appointment' })).not.toBeInTheDocument();
  });
});
