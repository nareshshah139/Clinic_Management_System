import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DoctorAvailabilitySettings } from '@/components/users/DoctorAvailabilitySettings';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorAvailability: jest.fn(),
    setDoctorBookingLimit: jest.fn(),
    replaceDoctorHours: jest.fn(),
    createTimeOff: jest.fn(),
    deleteTimeOff: jest.fn(),
  },
}));

// Radix Select relies on pointer capture and scrolling that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

const api = apiClient as jest.Mocked<typeof apiClient>;
const availability = (maxBookingsPerSlot: unknown) => ({
  doctorId: 'doc-1',
  source: 'configured' as const,
  hours: [{ weekday: 1, start: '09:00', end: '13:00' }],
  timeOff: [],
  maxBookingsPerSlot,
}) as any;

async function renderWithLimit(limit: unknown) {
  api.getDoctorAvailability.mockResolvedValue(availability(limit));
  render(<DoctorAvailabilitySettings doctorId="doc-1" />);
  return screen.findByRole('switch', { name: 'Allow overbooking' });
}

describe('Doctor overbooking setting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts off for a doctor with the default limit and saves the chosen number of patients per slot', async () => {
    const toggle = await renderWithLimit(1);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('combobox', { name: 'Patients per slot' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save overbooking' })).toBeDisabled();

    fireEvent.click(toggle);
    const count = screen.getByRole('combobox', { name: 'Patients per slot' });
    expect(count).toHaveTextContent('2');
    fireEvent.keyDown(count, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '3' }));
    expect(count).toHaveTextContent('3');

    api.setDoctorBookingLimit.mockResolvedValue(availability(3));
    fireEvent.click(screen.getByRole('button', { name: 'Save overbooking' }));
    await waitFor(() => expect(api.setDoctorBookingLimit).toHaveBeenCalledWith('doc-1', 3));
    expect(await screen.findByText('Saved: up to 3 patients per slot.')).toBeInTheDocument();
  });

  it('saves 1 when overbooking is switched off', async () => {
    const toggle = await renderWithLimit(4);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox', { name: 'Patients per slot' })).toHaveTextContent('4');

    fireEvent.click(toggle);
    api.setDoctorBookingLimit.mockResolvedValue(availability(1));
    fireEvent.click(screen.getByRole('button', { name: 'Save overbooking' }));
    await waitFor(() => expect(api.setDoctorBookingLimit).toHaveBeenCalledWith('doc-1', 1));
    expect(await screen.findByText('Saved: one patient per slot.')).toBeInTheDocument();
  });

  it.each([undefined, 0, 9, 2.5, '3'])('treats a stored limit of %p as overbooking off', async (stored) => {
    expect(await renderWithLimit(stored)).toHaveAttribute('aria-checked', 'false');
  });
});
