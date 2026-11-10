import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DoctorDayCalendar from './DoctorDayCalendar';
import { apiClient } from '@/lib/api';
import { AppointmentStatus } from '@cms/shared-types';

// Provide a stable toast function so the effect dependencies don't change on every render
const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn().mockResolvedValue({
      appointments: [
        { id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD' },
        { id: 'a2', slot: '10:30-11:00', patient: { name: 'Bob' }, status: 'CANCELLED', calendar: 'SCHEDULED', visitType: 'OPD' },
      ],
    }),
    deleteAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
  },
}));

const scheduled = () => screen.getByRole('region', { name: 'Scheduled' });
const findScheduled = () => screen.findByRole('region', { name: 'Scheduled' });

describe('DoctorDayCalendar', () => {
  it('renders non-cancelled appointments from schedule', async () => {
    render(
      <DoctorDayCalendar
        doctorId="doc-1"
        date="2099-01-01"
        recentBookedSlot=""
        onSelectSlot={jest.fn()}
        onAppointmentUpdate={jest.fn()}
      />
    );

    expect(await screen.findByRole('button', { name: 'Alice, 10:00-10:30, Scheduled' })).toBeInTheDocument();
    expect(scheduled()).toHaveTextContent('Alice');
    expect(screen.queryByText(/Bob/i)).toBeNull();
    expect(screen.queryByRole('region', { name: /patient queue/i })).toBeNull();
  });

  it('does not show the previous date when the new date fails to load', async () => {
    const getSchedule = jest.mocked(apiClient.getDoctorSchedule);
    getSchedule.mockReset()
      .mockResolvedValueOnce({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD' }] } as never)
      .mockRejectedValueOnce(new Error('offline'));
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    expect(await findScheduled()).toHaveTextContent('Alice');
    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" />);
    expect(await screen.findByText('Failed to load schedule')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('ignores an older doctor request that resolves after the current one', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise(resolve => { resolveFirst = resolve; });
    const getSchedule = jest.mocked(apiClient.getDoctorSchedule);
    getSchedule.mockReset()
      .mockReturnValueOnce(first as never)
      .mockResolvedValueOnce({ appointments: [{ id: 'b1', slot: '10:00-10:30', patient: { name: 'Bob' }, status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD' }] } as never);
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    rerender(<DoctorDayCalendar doctorId="doc-2" date="2099-01-01" />);
    expect(await findScheduled()).toHaveTextContent('Bob');
    await act(async () => resolveFirst({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD' }] }));
    expect(scheduled()).toHaveTextContent('Bob');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('does not let an older refresh replace a newer refresh for the same selection', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise(resolve => { resolveFirst = resolve; });
    const getSchedule = jest.mocked(apiClient.getDoctorSchedule);
    getSchedule.mockReset()
      .mockReturnValueOnce(first as never)
      .mockResolvedValueOnce({ appointments: [{ id: 'b1', slot: '10:00-10:30', patient: { name: 'Bob' }, status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD' }] } as never);
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" refreshKey={0} />);
    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" refreshKey={1} />);
    expect(await findScheduled()).toHaveTextContent('Bob');
    await act(async () => resolveFirst({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD' }] }));
    expect(scheduled()).toHaveTextContent('Bob');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('closes patient details when the selected date changes', async () => {
    const getSchedule = jest.mocked(apiClient.getDoctorSchedule);
    getSchedule.mockReset()
      .mockResolvedValueOnce({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD' }] } as never)
      .mockResolvedValueOnce({ appointments: [] } as never);
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    fireEvent.click(await screen.findByRole('button', { name: /^Alice, / }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Alice');
    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(scheduled()).toHaveTextContent('No one left to confirm'));
  });

  it('shows an optimistic appointment only for its originating doctor and date', async () => {
    jest.mocked(apiClient.getDoctorSchedule).mockReset().mockResolvedValue({ appointments: [] } as never);
    const appointment = { id: 'optimistic-1', slot: '10:00-10:30', patient: { id: 'p1', name: 'Alice' }, doctor: { firstName: 'Test', lastName: 'Doctor' }, status: AppointmentStatus.SCHEDULED, calendar: 'SCHEDULED' as const, visitType: 'OPD' as const };
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" optimisticAppointment={{ doctorId: 'doc-1', date: '2099-01-01', appointment }} />);
    expect(await findScheduled()).toHaveTextContent('No one left to confirm');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" optimisticAppointment={{ doctorId: 'doc-1', date: '2099-01-02', appointment }} />);
    expect(scheduled()).toHaveTextContent('Alice');
  });

  it('keeps a different patient booked at the same time as an optimistic appointment', async () => {
    jest.mocked(apiClient.getDoctorSchedule).mockReset().mockResolvedValue({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', calendar: 'SCHEDULED', visitType: 'OPD' }] } as never);
    const appointment = { id: 'optimistic-1', slot: '10:00-10:30', patient: { id: 'p2', name: 'Bob' }, doctor: { firstName: 'Test', lastName: 'Doctor' }, status: AppointmentStatus.SCHEDULED, calendar: 'SCHEDULED' as const, visitType: 'OPD' as const };
    render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" optimisticAppointment={{ doctorId: 'doc-1', date: '2099-01-01', appointment }} />);
    const column = within(await findScheduled());
    expect(column.getByRole('button', { name: 'Alice, 10:00-10:30, Scheduled' })).toBeInTheDocument();
    expect(column.getByRole('button', { name: 'Bob, 10:00-10:30, Scheduled' })).toBeDisabled();
  });
});
