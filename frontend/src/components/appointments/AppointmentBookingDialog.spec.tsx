import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppointmentBookingDialog from './AppointmentBookingDialog';

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// Mock api client used inside the dialog to avoid async effects touching network
jest.mock('@/lib/api', () => ({
  apiClient: {
    getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
    getRoomSchedule: jest.fn().mockResolvedValue({ appointments: [] }),
    getUser: jest.fn().mockResolvedValue({ id: 'doc-1', metadata: {} }),
  },
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
    // Inline validation panel should render with specific error
    expect(await screen.findByText('Please fix the following errors:')).toBeInTheDocument();
    expect(screen.getByText('Doctor information is missing')).toBeInTheDocument();
  });

  it('calls onConfirm with default derived slot when confirming', async () => {
    render(<AppointmentBookingDialog {...baseProps} />);

    // Confirm directly (OPD, no room required)
    fireEvent.click(screen.getByText('Confirm Booking'));

    await waitFor(() => expect(baseProps.onConfirm).toHaveBeenCalled());
    expect(baseProps.onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      visitType: 'OPD',
      slot: '10:00-10:30',
    }));
  });
});
