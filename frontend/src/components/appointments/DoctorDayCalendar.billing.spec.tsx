import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DoctorDayCalendar from './DoctorDayCalendar';
import { apiClient } from '@/lib/api';

const stableToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    getDoctorSchedule: jest.fn(),
    getInvoiceById: jest.fn(),
    createInvoice: jest.fn(),
    processPayment: jest.fn(),
    deleteAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;
const ALL = { read: true, createBill: true, takePayment: true };
const bill = (state: string, total: number, received: number, attention: boolean, invoices = state === 'NOT_BILLED' ? [] : [{ id: 'cinv1', invoiceNo: 'INV-1', total, received, due: total - received }]) =>
  ({ state, total, received, due: total - received, attention, invoices });
const row = (id: string, slot: string, name: string, extra: object) => ({
  id, slot, status: 'CONFIRMED', calendar: 'CONFIRMED', visitType: 'OPD', patient: { id: `p-${id}`, name, gender: 'F', dob: null, age: 34 }, ...extra,
});

function renderDay(appointments: object[], billingAccess = ALL) {
  api.getDoctorSchedule.mockResolvedValue({ appointments, billingAccess });
  render(<DoctorDayCalendar doctorId="doc-1" date="2099-01-01" />);
}

const confirmed = () => within(screen.getByRole('region', { name: 'Confirmed' }));

describe('DoctorDayCalendar billing on each row', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows amount and state with the bill type, and marks unpaid rows in words', async () => {
    renderDay([
      row('a1', '09:00-09:15', 'Meera Shah', { billType: 'FIRST_CONSULTATION', billing: bill('PAID', 500, 500, false) }),
      row('a2', '09:15-09:30', 'Ravi Kumar', { billType: 'REVIEW', billing: bill('DUE', 500, 300, true) }),
      row('a3', '09:30-09:45', 'Lakshmi Devi', { billType: 'PROCEDURE', visitType: 'PROCEDURE', notes: 'Chemical peel', billing: bill('NOT_BILLED', 0, 0, false) }),
      row('a4', '09:45-10:00', 'Suresh Babu', { status: 'COMPLETED', billType: 'REVIEW', billing: bill('NOT_BILLED', 0, 0, true) }),
      row('a5', '10:00-10:15', 'Priya Nair', {
        billType: 'REVIEW',
        billing: { state: 'DUE', total: 1700, received: 1500, due: 200, attention: true, invoices: [{ id: 'x', invoiceNo: 'INV-2', total: 500, received: 500, due: 0 }, { id: 'y', invoiceNo: 'INV-3', total: 1200, received: 1000, due: 200 }] },
      }),
    ]);

    const paid = await screen.findByRole('button', { name: 'First consultation bill: ₹500, paid' });
    expect(within(paid).getByText('₹500 · Paid')).toBeInTheDocument();
    expect(paid).not.toHaveAttribute('data-attention');

    const due = screen.getByRole('button', { name: 'Review bill: ₹500, ₹200 due' });
    expect(within(due).getByText('₹500 · ₹200 due')).toBeInTheDocument();
    expect(within(due).getByText('₹200 due')).toBeInTheDocument();
    expect(due).toHaveAttribute('data-attention', 'true');

    expect(screen.getByRole('button', { name: 'Procedure bill: not billed yet' })).not.toHaveAttribute('data-attention');
    expect(screen.getByRole('button', { name: 'Review bill: not billed yet, visit finished' })).toHaveAttribute('data-attention', 'true');

    const two = screen.getByRole('button', { name: 'Review bill: ₹1,700 in 2 bills, ₹200 due' });
    expect(within(two).getByText('₹1,700 · ₹200 due')).toBeInTheDocument();
    expect(within(two).getByText('₹1,700 · ₹200 due · 2 bills')).toBeInTheDocument();

    const types = Array.from(document.querySelectorAll('[data-bill-type]')).map((n) => n.textContent);
    expect(types).toEqual(['First consultation', 'Review', 'Procedure', 'Review', 'Review']);
    expect(confirmed().getByRole('button', { name: 'Meera Shah, 09:00-09:15, Confirmed' })).toHaveTextContent('34y');
  });

  it('keeps the time range, full name and a named status on every row', async () => {
    renderDay([
      row('a1', '09:00-09:15', 'Venkata Subramanian', { tokenNumber: 5, billType: 'FIRST_CONSULTATION', billing: bill('DUE', 1700, 0, true) }),
      row('a2', '09:15-09:30', 'Priya Nair', { status: 'IN_PROGRESS', billType: 'REVIEW', billing: bill('PAID', 500, 500, false) }),
    ]);
    const first = await screen.findByRole('button', { name: 'Token 5, Venkata Subramanian, 09:00-09:15, Confirmed' });
    expect(first).toHaveAttribute('title', 'Token 5, Venkata Subramanian, 09:00-09:15, Confirmed');
    expect(first.querySelector('[data-appointment-time]')).toHaveTextContent('09:00-09:15');
    expect(first.querySelector('[data-patient-name]')).toHaveTextContent('Venkata Subramanian');
    expect(first.querySelector('[data-bill-type]')).toHaveTextContent('First consultation');
    expect(first.querySelector('[data-appointment-status]')).toHaveAttribute('title', 'Confirmed');
    expect(first.querySelector('[data-appointment-status]')).toHaveTextContent('Confirmed');
    const second = screen.getByRole('button', { name: 'Priya Nair, 09:15-09:30, In progress' });
    expect(second.querySelector('[data-appointment-status]')).toHaveAttribute('title', 'In progress');
    expect(second.querySelector('[data-appointment-time]')).toHaveTextContent('09:15-09:30');
  });

  it('records a payment from the row and shows Paid after the schedule reloads', async () => {
    renderDay([row('a2', '09:15-09:30', 'Ravi Kumar', { billType: 'REVIEW', billing: bill('DUE', 500, 300, true) })]);
    api.getInvoiceById.mockResolvedValue({
      id: 'cinv1', invoiceNo: 'INV-1', total: 500, received: 300, balance: 200,
      items: [{ id: 'i1', name: 'Review consultation', qty: 1, total: 500 }],
      payments: [{ id: 'pay1', amount: 300, mode: 'CASH', createdAt: '2099-01-01T04:00:00.000Z' }],
    });
    api.processPayment.mockResolvedValue({ id: 'pay2' });

    fireEvent.click(await screen.findByRole('button', { name: 'Review bill: ₹500, ₹200 due' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bill for Ravi Kumar' });
    expect(await within(dialog).findByText('Review consultation')).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'Bill INV-1' })).toHaveTextContent('Total₹500Received₹300Due₹200');
    expect(within(dialog).getByRole('textbox', { name: 'Amount received' })).toHaveValue('200');

    api.getDoctorSchedule.mockResolvedValue({ appointments: [row('a2', '09:15-09:30', 'Ravi Kumar', { billType: 'REVIEW', billing: bill('PAID', 500, 500, false) })], billingAccess: ALL });
    api.getInvoiceById.mockResolvedValue({
      id: 'cinv1', invoiceNo: 'INV-1', total: 500, received: 500, balance: 0,
      items: [{ id: 'i1', name: 'Review consultation', qty: 1, total: 500 }],
      payments: [],
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'UPI' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record ₹200 payment' }));

    await waitFor(() => expect(api.processPayment).toHaveBeenCalledWith({ invoiceId: 'cinv1', amount: 200, method: 'UPI' }));
    expect(stableToast).toHaveBeenCalledWith({ variant: 'success', title: '₹200 UPI recorded on INV-1' });
    await waitFor(() => expect(within(dialog).getByRole('region', { name: 'Bill INV-1' })).toHaveTextContent('Paid'));
    expect(within(dialog).queryByRole('button', { name: /Record/ })).toBeNull();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Review bill: ₹500, paid' })).toBeInTheDocument();
  });

  it('creates a bill for the appointment, prefilled from its bill type, and takes the payment with it', async () => {
    renderDay([row('a3', '09:30-09:45', 'Lakshmi Devi', { billType: 'PROCEDURE', visitType: 'PROCEDURE', notes: 'Chemical peel', visit: { id: 'v3', status: 'COMPLETED' }, billing: bill('NOT_BILLED', 0, 0, true) })]);
    api.createInvoice.mockResolvedValue({ id: 'cinv9', invoiceNo: 'INV-9' });
    api.processPayment.mockResolvedValue({ id: 'pay9' });

    fireEvent.click(await screen.findByRole('button', { name: 'Procedure bill: not billed yet, visit finished' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bill for Lakshmi Devi' });
    expect(within(dialog).getByRole('textbox', { name: 'Bill line' })).toHaveValue('Procedure: Chemical peel');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Fee' }), { target: { value: '2,500' } });
    expect(within(dialog).getByRole('textbox', { name: 'Paid now' })).toHaveValue('2,500');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Paid now' }), { target: { value: '1000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create bill and record ₹1,000' }));

    await waitFor(() => expect(api.processPayment).toHaveBeenCalledWith({ invoiceId: 'cinv9', amount: 1000, method: 'CASH' }));
    expect(api.createInvoice).toHaveBeenCalledWith({
      patientId: 'p-a3',
      appointmentId: 'a3',
      visitId: 'v3',
      items: [{ name: 'Procedure: Chemical peel', description: 'Procedure: Chemical peel', quantity: 1, unitPrice: 2500, gstRate: 0, discount: 0 }],
    });
    expect(stableToast).toHaveBeenCalledWith({ variant: 'success', title: 'Bill INV-9 created and ₹1,000 Cash recorded' });
  });

  it('refuses a payment above what is due without calling the server', async () => {
    renderDay([row('a2', '09:15-09:30', 'Ravi Kumar', { billType: 'REVIEW', billing: bill('DUE', 500, 300, true) })]);
    api.getInvoiceById.mockResolvedValue({ id: 'cinv1', invoiceNo: 'INV-1', total: 500, received: 300, balance: 200, items: [], payments: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Review bill: ₹500, ₹200 due' }));
    const dialog = await screen.findByRole('dialog');
    const amount = await within(dialog).findByRole('textbox', { name: 'Amount received' });
    fireEvent.change(amount, { target: { value: '250' } });
    expect(within(dialog).getByText('Enter an amount above 0 and up to the ₹200 due.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Record payment' })).toBeDisabled();
    expect(api.processPayment).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal and the bill as it now stands when the payment was already taken elsewhere', async () => {
    renderDay([row('a2', '09:15-09:30', 'Ravi Kumar', { billType: 'REVIEW', billing: bill('DUE', 500, 300, true) })]);
    api.getInvoiceById.mockResolvedValue({ id: 'cinv1', invoiceNo: 'INV-1', total: 500, received: 300, balance: 200, items: [], payments: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Review bill: ₹500, ₹200 due' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bill for Ravi Kumar' });
    await within(dialog).findByRole('textbox', { name: 'Amount received' });

    api.processPayment.mockRejectedValue({ status: 400, body: { message: 'Bill INV-1 is already paid in full, so ₹200 cannot be recorded.' } });
    api.getInvoiceById.mockResolvedValue({ id: 'cinv1', invoiceNo: 'INV-1', total: 500, received: 500, balance: 0, items: [], payments: [] });
    api.getDoctorSchedule.mockResolvedValue({ appointments: [row('a2', '09:15-09:30', 'Ravi Kumar', { billType: 'REVIEW', billing: bill('PAID', 500, 500, false) })], billingAccess: ALL });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record ₹200 payment' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bill INV-1 is already paid in full, so ₹200 cannot be recorded. Nothing was saved.');
    await waitFor(() => expect(within(dialog).getByRole('region', { name: 'Bill INV-1' })).toHaveTextContent('Total₹500Received₹500Due₹0'));
    expect(within(dialog).queryByRole('button', { name: /Record/ })).toBeNull();
    expect(stableToast).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Review bill: ₹500, paid' })).toBeInTheDocument();
  });

  it('shows the bill type but no money to a viewer who cannot read bills', async () => {
    renderDay([row('a1', '09:00-09:15', 'Meera Shah', { billType: 'FIRST_CONSULTATION' })], { read: false, createBill: false, takePayment: false });
    await screen.findByRole('button', { name: 'Meera Shah, 09:00-09:15, Confirmed' });
    expect(document.querySelector('[data-bill-type]')?.textContent).toBe('First consultation');
    expect(document.querySelector('[data-appointment-billing]')).toBeNull();
  });
});
