import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DoctorDayCalendar from './DoctorDayCalendar';
import { apiClient } from '@/lib/api';

const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: stableToast }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn(),
    updateAppointment: jest.fn().mockResolvedValue({}),
  },
}));

const appointment = (status: string) => ({
  id: 'a1', slot: '10:00-10:30', patient: { name: 'Alice' }, status, calendar: 'SCHEDULED', visitType: 'OPD',
});

async function openDetails(status: string) {
  jest.mocked(apiClient.getDoctorSchedule).mockResolvedValue({ appointments: [appointment(status)] } as never);
  render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: new RegExp(`^Alice, 10:00-10:30`) }));
  return user;
}

describe('DoctorDayCalendar check-in and no-show', () => {
  beforeEach(() => jest.mocked(apiClient.updateAppointment).mockClear());

  it('checks a scheduled patient in', async () => {
    const user = await openDetails('SCHEDULED');
    await user.click(screen.getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(apiClient.updateAppointment).toHaveBeenCalledWith('a1', { status: 'CHECKED_IN' }));
  });

  it('marks a confirmed patient as no-show', async () => {
    const user = await openDetails('CONFIRMED');
    await user.click(screen.getByRole('button', { name: 'Mark no-show' }));
    await waitFor(() => expect(apiClient.updateAppointment).toHaveBeenCalledWith('a1', { status: 'NO_SHOW' }));
  });

  it('lets a no-show patient who arrives late be checked in, but not marked no-show again', async () => {
    await openDetails('NO_SHOW');
    expect(screen.getByRole('button', { name: 'Check in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark no-show' })).toBeNull();
  });

  it('offers neither once the patient is checked in', async () => {
    await openDetails('CHECKED_IN');
    expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark no-show' })).toBeNull();
  });
});
