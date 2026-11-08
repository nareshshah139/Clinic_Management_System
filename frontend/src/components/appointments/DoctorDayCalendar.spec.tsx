import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DoctorDayCalendar from './DoctorDayCalendar';

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
        { id: 'a3', slot: '18:30-19:00', patient: { name: 'Chitra' }, status: 'SCHEDULED', visitType: 'OPD' },
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

  it('draws a booking that falls after working hours and says how many are outside them', async () => {
    render(
      <DoctorDayCalendar
        doctorId="doc-1"
        date="2099-01-01"
        recentBookedSlot=""
        onSelectSlot={jest.fn()}
        onAppointmentUpdate={jest.fn()}
        timeSlotConfig={{ startHour: 9, endHour: 18, stepMinutes: 30, timezone: 'Asia/Kolkata' }}
      />
    );

    expect(await screen.findByText(/Chitra/)).toBeInTheDocument();
    expect(screen.getByText('1 outside working hours')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
  });
});
