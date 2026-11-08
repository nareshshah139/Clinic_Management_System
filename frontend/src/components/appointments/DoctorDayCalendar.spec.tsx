import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        { id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', visitType: 'OPD' },
        { id: 'a2', slot: '10:30-11:00', patient: { name: 'Bob' }, status: 'CANCELLED', visitType: 'OPD' },
      ],
    }),
    deleteAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
  },
}));

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

    // Wait for schedule to load and patient name to render in the grid
    expect((await screen.findAllByText(/Alice/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: /patient queue/i })).toHaveTextContent('Alice');
    // Cancelled (Bob) should not render in schedule
    expect(screen.queryByText(/Bob/i)).toBeNull();
  });

  it('does not show the previous date when the new date fails to load', async () => {
    const getSchedule = jest.mocked(apiClient.getDoctorSchedule);
    getSchedule.mockReset()
      .mockResolvedValueOnce({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', visitType: 'OPD' }] } as never)
      .mockRejectedValueOnce(new Error('offline'));
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    expect(await screen.findByRole('region', { name: 'Patient queue' })).toHaveTextContent('Alice');
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
      .mockResolvedValueOnce({ appointments: [{ id: 'b1', slot: '10:00-10:30', patient: { name: 'Bob' }, status: 'SCHEDULED', visitType: 'OPD' }] } as never);
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    rerender(<DoctorDayCalendar doctorId="doc-2" date="2099-01-01" />);
    expect(await screen.findByRole('region', { name: 'Patient queue' })).toHaveTextContent('Bob');
    await act(async () => resolveFirst({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', visitType: 'OPD' }] }));
    expect(screen.getByRole('region', { name: 'Patient queue' })).toHaveTextContent('Bob');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('does not let an older refresh replace a newer refresh for the same selection', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise(resolve => { resolveFirst = resolve; });
    const getSchedule = jest.mocked(apiClient.getDoctorSchedule);
    getSchedule.mockReset()
      .mockReturnValueOnce(first as never)
      .mockResolvedValueOnce({ appointments: [{ id: 'b1', slot: '10:00-10:30', patient: { name: 'Bob' }, status: 'SCHEDULED', visitType: 'OPD' }] } as never);
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" refreshKey={0} />);
    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" refreshKey={1} />);
    expect(await screen.findByRole('region', { name: 'Patient queue' })).toHaveTextContent('Bob');
    await act(async () => resolveFirst({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', visitType: 'OPD' }] }));
    expect(screen.getByRole('region', { name: 'Patient queue' })).toHaveTextContent('Bob');
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('closes patient details when the selected date changes', async () => {
    const getSchedule = jest.mocked(apiClient.getDoctorSchedule);
    getSchedule.mockReset()
      .mockResolvedValueOnce({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', visitType: 'OPD' }] } as never)
      .mockResolvedValueOnce({ appointments: [] } as never);
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
    fireEvent.click(await screen.findByRole('button', { name: 'View appointment for Alice' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Alice');
    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No active appointments for these filters.')).toBeInTheDocument());
  });

  it('shows an optimistic appointment only for its originating doctor and date', async () => {
    jest.mocked(apiClient.getDoctorSchedule).mockReset().mockResolvedValue({ appointments: [] } as never);
    const appointment = { id: 'optimistic-1', slot: '10:00-10:30', patient: { id: 'p1', name: 'Alice' }, doctor: { firstName: 'Test', lastName: 'Doctor' }, status: AppointmentStatus.SCHEDULED, visitType: 'OPD' as const };
    const { rerender } = render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" optimisticAppointment={{ doctorId: 'doc-1', date: '2099-01-01', appointment }} />);
    expect(await screen.findByText('No active appointments for these filters.')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    rerender(<DoctorDayCalendar doctorId="doc-1" date="2099-01-02" optimisticAppointment={{ doctorId: 'doc-1', date: '2099-01-02', appointment }} />);
    expect(screen.getByRole('region', { name: 'Patient queue' })).toHaveTextContent('Alice');
  });

  it('keeps a different patient booked at the same time as an optimistic appointment', async () => {
    jest.mocked(apiClient.getDoctorSchedule).mockReset().mockResolvedValue({ appointments: [{ id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status: 'SCHEDULED', visitType: 'OPD' }] } as never);
    const appointment = { id: 'optimistic-1', slot: '10:00-10:30', patient: { id: 'p2', name: 'Bob' }, doctor: { firstName: 'Test', lastName: 'Doctor' }, status: AppointmentStatus.SCHEDULED, visitType: 'OPD' as const };
    render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" optimisticAppointment={{ doctorId: 'doc-1', date: '2099-01-01', appointment }} />);
    const queue = await screen.findByRole('region', { name: 'Patient queue' });
    expect(queue).toHaveTextContent('Alice');
    expect(queue).toHaveTextContent('Bob');
  });
});
