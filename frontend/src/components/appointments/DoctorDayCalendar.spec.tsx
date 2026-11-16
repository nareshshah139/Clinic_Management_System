import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DoctorDayCalendar from './DoctorDayCalendar';
import { apiClient } from '@/lib/api';

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
    expect(await screen.findByText(/Alice/i)).toBeInTheDocument();
    // Cancelled (Bob) should not render in schedule
    expect(screen.queryByText(/Bob/i)).toBeNull();
  });

  it('shows appointments outside working hours without adding bookable slots there', async () => {
    jest.mocked(apiClient.getDoctorSchedule).mockResolvedValueOnce({ appointments: [
      { id: 'early', slot: '08:00-08:30', patient: { name: 'Early Patient' }, status: 'SCHEDULED', visitType: 'OPD' },
      { id: 'late', slot: '18:30-19:00', patient: { name: 'Late Patient' }, status: 'SCHEDULED', visitType: 'OPD' },
    ] } as any);
    render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" onSelectSlot={jest.fn()}
      timeSlotConfig={{ startHour: 9, endHour: 18, stepMinutes: 30, timezone: 'Asia/Kolkata' }} />);

    expect(await screen.findByText(/Early Patient/)).toBeInTheDocument();
    expect(screen.getByText(/Late Patient/)).toBeInTheDocument();
    expect(document.querySelector('[data-calendar-grid]')).toHaveStyle({ paddingTop: '320px' });
    expect(screen.queryByRole('button', { name: /Book 08:00/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Book 18:30/i })).not.toBeInTheDocument();
  });
});
