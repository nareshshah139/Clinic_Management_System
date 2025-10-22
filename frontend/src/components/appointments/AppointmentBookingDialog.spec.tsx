import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppointmentBookingDialog from './AppointmentBookingDialog';

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const baseProps = {
  open: true,
  onOpenChange: jest.fn(),
  doctorId: 'doc-1',
  date: '2099-01-01',
  slot: '10:00-10:30',
  patient: { id: 'p1', name: 'John Doe', phone: '123', email: 'j@d.com' } as any,
  onConfirm: jest.fn().mockResolvedValue(undefined),
  onCancel: jest.fn(),
};

describe('AppointmentBookingDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows validation error when required fields missing', async () => {
    render(<AppointmentBookingDialog {...baseProps} doctorId="" />);

    fireEvent.click(screen.getByText('Confirm Booking'));

    expect(await screen.findByText(/Validation Error/i)).toBeInTheDocument();
  });

  it('calls onConfirm with derived slot and selected room', async () => {
    render(<AppointmentBookingDialog {...baseProps} />);

    // Change duration to 60 → derived slot becomes 10:00-11:00
    fireEvent.mouseDown(screen.getByText('30 minutes'));
    fireEvent.click(screen.getByText('60 minutes'));

    // No rooms are actually loaded (api client is not called in this unit test), but confirm should still pass for OPD
    fireEvent.click(screen.getByText('Confirm Booking'));

    await waitFor(() => expect(baseProps.onConfirm).toHaveBeenCalled());
    expect(baseProps.onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      visitType: 'OPD',
      slot: '10:00-11:00',
    }));
  });
});
