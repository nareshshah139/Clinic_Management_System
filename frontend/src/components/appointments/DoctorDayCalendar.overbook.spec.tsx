import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

const api = apiClient as jest.Mocked<typeof apiClient>;
const appointment = (id: string, slot: string, name: string) => ({
  id, slot, status: AppointmentStatus.SCHEDULED, calendar: 'SCHEDULED', visitType: 'OPD', patient: { name },
});

function renderDay(appointments: object[], maxBookingsPerSlot?: number) {
  const onSelectSlot = jest.fn();
  api.getDoctorSchedule.mockResolvedValue({ appointments } as any);
  render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" onSelectSlot={onSelectSlot} maxBookingsPerSlot={maxBookingsPerSlot} />);
  return onSelectSlot;
}

const scheduled = () => within(screen.getByRole('region', { name: 'Scheduled' }));
const tile = (slot: string) => scheduled().queryByRole('button', { name: new RegExp(`^Book ${slot}`) });
const blockOf = (name: RegExp) => screen.getByText(name, { selector: '[data-appointment-block] [data-patient-name]' }).closest('[data-appointment-block]') as HTMLElement;
const conflict = (overbook: object) => Object.assign(new Error('Scheduling conflict detected'), {
  status: 409, body: { message: 'Scheduling conflict detected', suggestions: [], conflicts: [], overbook },
});

describe('DoctorDayCalendar with a per-doctor overbooking limit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps a slot with one booking bookable for a limit of 2, marks it, and books into it', async () => {
    const onSelectSlot = renderDay([appointment('a1', '11:00-11:30', 'Ravi Kumar')], 2);
    await screen.findByText('Ravi Kumar', { selector: '[data-appointment-block] [data-patient-name]' });

    const partial = tile('11:00-11:30');
    expect(partial).toHaveAccessibleName('Book 11:00-11:30, 1 of 2 booked');
    expect(partial).toHaveTextContent('Overbook 1/2');
    expect(blockOf(/Ravi Kumar/).style.width).toBe('50%');

    fireEvent.click(partial!);
    expect(onSelectSlot).toHaveBeenCalledWith('11:00-11:15', 'SCHEDULED');
  });

  it('closes a slot once it holds as many patients as the limit', async () => {
    renderDay([appointment('a1', '11:00-11:30', 'Ravi Kumar'), appointment('a2', '11:00-11:30', 'Priya Nair')], 2);
    await screen.findByText('Priya Nair', { selector: '[data-appointment-block] [data-patient-name]' });
    expect(tile('11:00-11:30')).toBeNull();
    expect(tile('10:30-11:00')).toHaveAccessibleName('Book 10:30-11:00');
  });

  it.each([undefined, 1])('with limit %p behaves as before overbooking existed', async (limit) => {
    renderDay([appointment('a1', '11:00-11:30', 'Ravi Kumar')], limit);
    await screen.findByText('Ravi Kumar', { selector: '[data-appointment-block] [data-patient-name]' });
    expect(tile('11:00-11:30')).toBeNull();
    expect(screen.queryByText(/Overbook/)).toBeNull();
    expect(tile('10:30-11:00')).toHaveAccessibleName('Book 10:30-11:00');
    expect(blockOf(/Ravi Kumar/).style.width).toBe('100%');
  });

  describe('rescheduling onto a partly booked slot', () => {
    async function startMove(limit: number) {
      renderDay([appointment('a1', '11:00-11:30', 'Ravi Kumar'), appointment('a2', '15:00-15:30', 'Priya Nair')], limit);
      await screen.findByText('Priya Nair', { selector: '[data-appointment-block] [data-patient-name]' });
      fireEvent.click(screen.getByRole('button', { name: 'Reschedule Priya Nair' }));
      fireEvent.click(await scheduled().findByRole('button', { name: /^Move to 11:00-11:30/ }));
    }

    it('asks before overbooking and resends with allowOverbook only after confirmation', async () => {
      api.rescheduleAppointment
        .mockRejectedValueOnce(conflict({ allowed: true, booked: 1, limit: 2 }))
        .mockResolvedValueOnce({ id: 'a2' } as any);
      await startMove(2);

      expect(await screen.findByText('This slot already has 1 patient. Book anyway? (2 of 2 allowed)')).toBeInTheDocument();
      expect(api.rescheduleAppointment).toHaveBeenCalledTimes(1);
      expect(api.rescheduleAppointment.mock.calls[0][1]).not.toHaveProperty('allowOverbook');

      fireEvent.click(screen.getByRole('button', { name: 'Book anyway' }));
      await waitFor(() => expect(api.rescheduleAppointment).toHaveBeenCalledTimes(2));
      expect(api.rescheduleAppointment.mock.calls[1]).toEqual(['a2', { date: '2099-01-01', slot: '11:00-11:30', roomId: undefined, calendar: 'SCHEDULED', allowOverbook: true }]);
    });

    it('sends nothing more when the user cancels', async () => {
      api.rescheduleAppointment.mockRejectedValueOnce(conflict({ allowed: true, booked: 1, limit: 2 }));
      await startMove(2);
      const dialog = await screen.findByRole('dialog', { name: 'Overbook this slot?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByText(/Book anyway\?/)).toBeNull());
      expect(api.rescheduleAppointment).toHaveBeenCalledTimes(1);
      expect(stableToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Failed to reschedule' }));
    });

    it('shows the conflict as before when the slot cannot take another patient', async () => {
      api.rescheduleAppointment.mockRejectedValueOnce(conflict({ allowed: false, booked: 2, limit: 2 }));
      await startMove(2);
      await waitFor(() => expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Failed to reschedule', description: 'Scheduling conflict detected' })));
      expect(screen.queryByText(/Book anyway\?/)).toBeNull();
      expect(api.rescheduleAppointment).toHaveBeenCalledTimes(1);
    });
  });
});
