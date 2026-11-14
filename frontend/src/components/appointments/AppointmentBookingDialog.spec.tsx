import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppointmentBookingDialog from './AppointmentBookingDialog';
import { apiClient } from '@/lib/api';

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

    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    // Inline validation panel should render with specific error
    expect(await screen.findByText('Please fix the following errors:')).toBeInTheDocument();
    expect(screen.getByText('Doctor information is missing')).toBeInTheDocument();
  });

  it('calls onConfirm with default derived slot when confirming', async () => {
    render(<AppointmentBookingDialog {...baseProps} />);

    // Confirm directly (OPD, no room required)
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));

    await waitFor(() => expect(baseProps.onConfirm).toHaveBeenCalled());
    expect(baseProps.onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      visitType: 'OPD',
      slot: '10:00-10:30',
    }));
  });

  it('offers a room as an optional choice for a consultation and books without one', async () => {
    jest.mocked(apiClient.getRooms).mockResolvedValueOnce({ rooms: [{ id: 'r1', name: 'Consultation Room 1', type: 'Consultation', capacity: 3, isActive: true }] } as never);
    render(<AppointmentBookingDialog {...baseProps} />);

    expect(await screen.findByText('Room (optional)')).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Room' })).toHaveTextContent('No room');
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));

    await waitFor(() => expect(baseProps.onConfirm).toHaveBeenCalledWith({ visitType: 'OPD', roomId: undefined, slot: '10:00-10:30', notes: undefined }));
  });

  it('carries no helper sentences, capacity lines or Confirm Booking button', async () => {
    render(<AppointmentBookingDialog {...baseProps} />);
    await screen.findByRole('button', { name: 'Book' });
    for (const gone of [/Adjusts end time/, /Regular outpatient consultation/, /Room selection is optional/, /Capacity/, /Confirm Booking/]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });
});
