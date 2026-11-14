import React from 'react';
import { render, screen } from '@testing-library/react';
import AppointmentsPage from './page';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import type { User } from '@/lib/types';
import { UserRole } from '@cms/shared-types';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getUsers: jest.fn().mockResolvedValue({
      users: [
        { id: 'd-praneeta', firstName: 'Praneeta', lastName: 'Jain', role: 'DOCTOR' },
        { id: 'd-shravya', firstName: 'Shravya', lastName: 'Dermatologist', role: 'DOCTOR' },
      ],
    }),
  },
}));
jest.mock('@/components/appointments/AppointmentsCalendar', () => ({
  __esModule: true,
  default: ({ controlledDoctorId }: { controlledDoctorId?: string }) => <p>Calendar for {controlledDoctorId || 'nobody'}</p>,
}));
jest.mock('@/components/appointments/AppointmentScheduler', () => ({ __esModule: true, default: () => null }));

function renderAs(user: Partial<User>) {
  render(
    <DashboardUserProvider value={{ user: user as User, loading: false, refresh: jest.fn(), logout: jest.fn() }}>
      <AppointmentsPage />
    </DashboardUserProvider>,
  );
}

describe('Appointments page default doctor', () => {
  beforeEach(() => localStorage.clear());

  it('opens a signed-in doctor on their own calendar, even over a stored choice', async () => {
    localStorage.setItem('appointments.doctorId', 'd-praneeta');
    renderAs({ id: 'd-shravya', role: UserRole.DOCTOR });
    expect(await screen.findByText('Calendar for d-shravya')).toBeInTheDocument();
  });

  it('opens reception on the stored doctor', async () => {
    localStorage.setItem('appointments.doctorId', 'd-shravya');
    renderAs({ id: 'r-1', role: UserRole.RECEPTION });
    expect(await screen.findByText('Calendar for d-shravya')).toBeInTheDocument();
  });

  it('falls back to the first listed doctor when nothing is stored', async () => {
    renderAs({ id: 'r-1', role: UserRole.RECEPTION });
    expect(await screen.findByText('Calendar for d-praneeta')).toBeInTheDocument();
  });
});
