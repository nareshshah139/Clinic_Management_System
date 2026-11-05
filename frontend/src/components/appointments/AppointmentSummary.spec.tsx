import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentStatus } from '@cms/shared-types';
import AppointmentSummary from './AppointmentSummary';
import type { AppointmentInSlot } from '@/lib/types';

const appointment: AppointmentInSlot = {
  id: 'a1', slot: '10:00-10:15',
  patient: { id: 'p1', name: 'Alice a patient with a long name', age: 42, gender: 'FEMALE', phone: '555-0100' },
  doctor: { firstName: 'Dr.', lastName: 'Lee' },
  status: AppointmentStatus.SCHEDULED, visitType: 'PROCEDURE',
  notes: 'A full procedure note that cannot fit in a compact calendar entry',
  room: { id: 'r1', name: 'North procedure room', type: 'PROCEDURE' },
  isFollowUp: true,
};

describe('AppointmentSummary', () => {
  it('reveals complete read-only facts on hover and dismisses them with Escape', async () => {
    const user = userEvent.setup();
    const openDetails = jest.fn();
    render(<AppointmentSummary appointment={appointment} onOpenDetails={openDetails} />);
    const summary = screen.getByRole('button', { name: /View appointment details for Alice/ });
    await user.hover(summary);
    const preview = await screen.findByRole('tooltip');
    expect(within(preview).getByText('A full procedure note that cannot fit in a compact calendar entry')).toBeInTheDocument();
    expect(within(preview).getByText('North procedure room (PROCEDURE)')).toBeInTheDocument();
    expect(within(preview).getByText('42 years')).toBeInTheDocument();
    expect(within(preview).getByText('Existing patient')).toBeInTheDocument();
    expect(within(preview).queryByRole('button')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(openDetails).not.toHaveBeenCalled();
  });

  it('reveals full facts on keyboard focus and opens details on Enter', async () => {
    const user = userEvent.setup();
    const openDetails = jest.fn();
    render(<AppointmentSummary appointment={appointment} onOpenDetails={openDetails} />);
    await user.tab();
    const preview = await screen.findByRole('tooltip');
    expect(within(preview).getByText('A full procedure note that cannot fit in a compact calendar entry')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(openDetails).toHaveBeenCalledWith(appointment, expect.any(Function));
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('opens details from a touch tap without needing a preview', async () => {
    const user = userEvent.setup();
    const openDetails = jest.fn();
    render(<AppointmentSummary appointment={appointment} onOpenDetails={openDetails} />);
    const summary = screen.getByRole('button');
    await user.pointer([{ keys: '[TouchA>]', target: summary }, { keys: '[/TouchA]', target: summary }]);
    expect(openDetails).toHaveBeenCalledWith(appointment, expect.any(Function));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
