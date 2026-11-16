import React from 'react';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { AppointmentBillingSummary, appointmentTimelineScale, appointmentTimelineColumns } from '@/components/appointments/DoctorDayCalendar';
import type { AppointmentInSlot } from '@/lib/types';
import { AppointmentStatus } from '@cms/shared-types';
import { generateTimeSlots, hhmmToMinutes } from '@/lib/utils';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const appointment: AppointmentInSlot = {
  id: 'appointment-1', slot: '10:00-10:10', patient: { id: 'patient-1', name: 'Synthetic Patient' },
  doctor: { firstName: 'Synthetic', lastName: 'Doctor' }, visitType: 'OPD',
  status: AppointmentStatus.SCHEDULED,
  billing: { invoices: [
    { id: 'review', invoiceNo: 'INV-R', billType: 'REVIEW', total: 1200, received: 1000, balance: 200, status: 'PARTIAL' },
    { id: 'procedure', invoiceNo: 'INV-P', billType: 'PROCEDURE', total: 300, received: 0, balance: 300, status: 'UNPAID' },
  ] },
};

it('shows explicit bill types and summed amounts while keeping individual invoices in an accessible dialog', () => {
  const appointmentAction = jest.fn();
  render(<div onClick={appointmentAction}><AppointmentBillingSummary appointment={appointment} /></div>);
  const summary = screen.getByRole('button', { name: 'Billing for Synthetic Patient' });
  expect(within(summary).getByText('Review · Procedure')).toBeInTheDocument();
  for (const amount of ['₹1,500.00', '₹1,000.00', '₹500.00']) expect(within(summary).getByText(amount)).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  summary.focus();
  expect(summary).toHaveFocus();
  fireEvent.click(summary);
  expect(appointmentAction).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'Billing for Synthetic Patient' });
  expect(within(dialog).getByRole('heading', { name: 'Review · INV-R' })).toBeInTheDocument();
  expect(within(dialog).getByRole('heading', { name: 'Procedure · INV-P' })).toBeInTheDocument();
  expect(within(dialog).getByText('₹1,200.00')).toBeInTheDocument();
  expect(within(dialog).getByText('PARTIAL')).toBeInTheDocument();
  expect(within(dialog).getByText('UNPAID')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps missing bill types explicit and rounds aggregate amounts in paise', () => {
  render(<AppointmentBillingSummary appointment={{ ...appointment, billing: { invoices: [
    { ...appointment.billing!.invoices[0], billType: null, total: 0.1, received: 0.1, balance: 0 },
    { ...appointment.billing!.invoices[1], billType: null, total: 0.2, received: 0, balance: 0.2 },
  ] } }} />);
  expect(screen.getByText('Bill type not recorded')).toBeInTheDocument();
  expect(screen.getByText('₹0.30')).toBeInTheDocument();
  expect(screen.getByText('₹0.10')).toBeInTheDocument();
  expect(screen.getByText('₹0.20')).toBeInTheDocument();
});

it('returns focus to the billing opener when Escape closes the breakdown', async () => {
  render(<AppointmentBillingSummary appointment={appointment} />);
  const opener = screen.getByRole('button', { name: 'Billing for Synthetic Patient' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Billing for Synthetic Patient' });
  fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});

it('states that no bill is recorded instead of suggesting a paid zero-value bill', () => {
  render(<AppointmentBillingSummary appointment={{ ...appointment, billing: { invoices: [] } }} />);
  expect(screen.getByText('No bill recorded')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it.each([5, 10, 15, 30, 60])('keeps short appointments readable and aligned when the grid interval is %i minutes', step => {
  const scale = appointmentTimelineScale(step, ['10:00-10:05', '10:05-10:15', '10:15-10:45']);
  for (const duration of [5, 10, 30]) expect(duration * scale.pixelsPerMinute).toBeGreaterThanOrEqual(160);
  expect(scale.tileHeight / step).toBe(scale.pixelsPerMinute);
  const firstStart = 60 * scale.pixelsPerMinute;
  const firstEnd = firstStart + 5 * scale.pixelsPerMinute;
  const secondStart = 65 * scale.pixelsPerMinute;
  expect(firstEnd).toBe(secondStart);
  expect(firstStart / scale.tileHeight).toBe(60 / step);
});

it('uses one column width across chained overlaps and reuses a freed column', () => {
  const appointments = [
    { id: 'A', slot: '09:00-10:00' },
    { id: 'B', slot: '09:30-10:30' },
    { id: 'C', slot: '10:15-11:00' },
  ];
  const layout = appointmentTimelineColumns(appointments);
  expect(layout.get('A')).toEqual({ column: 0, count: 2 });
  expect(layout.get('B')).toEqual({ column: 1, count: 2 });
  expect(layout.get('C')).toEqual({ column: 0, count: 2 });
  expect(appointmentTimelineColumns([...appointments].reverse())).toEqual(layout);
  expect(appointments.map(appointment => appointment.id)).toEqual(['A', 'B', 'C']);
});

it('allows disjoint and adjacent appointments to use their full width', () => {
  const layout = appointmentTimelineColumns([
    { id: 'A', slot: '09:00-09:30' },
    { id: 'B', slot: '09:30-10:00' },
    { id: 'C', slot: '11:00-12:00' },
  ]);
  for (const column of layout.values()) expect(column).toEqual({ column: 0, count: 1 });
});

it('keeps a connected group consistently wide when concurrency grows later', () => {
  const layout = appointmentTimelineColumns([
    { id: 'A', slot: '09:00-12:00' },
    { id: 'B', slot: '09:30-10:30' },
    { id: 'C', slot: '10:00-11:00' },
    { id: 'D', slot: '10:30-11:30' },
    { id: 'E', slot: '12:00-12:30' },
  ]);
  expect(layout.get('A')).toEqual({ column: 0, count: 3 });
  expect(layout.get('B')).toEqual({ column: 1, count: 3 });
  expect(layout.get('C')).toEqual({ column: 2, count: 3 });
  expect(layout.get('D')).toEqual({ column: 1, count: 3 });
  expect(layout.get('E')).toEqual({ column: 0, count: 1 });
});

it.each([20, 45, 90])('keeps the final partial day visible without inventing a bookable slot on a %i-minute grid', stepMinutes => {
  const day = { startHour: 9, endHour: 17 };
  const scale = appointmentTimelineScale(stepMinutes, ['16:45-17:00'], day);
  const slots = generateTimeSlots({ ...day, stepMinutes, timezone: 'Asia/Kolkata' });
  const dayMinutes = 480;
  expect(scale.height).toBe(dayMinutes * scale.pixelsPerMinute);
  expect(slots).toHaveLength(Math.floor(dayMinutes / stepMinutes));
  expect(scale.height - slots.length * scale.tileHeight).toBeCloseTo((dayMinutes % stepMinutes) * scale.pixelsPerMinute);
  const finalAppointmentTop = (hhmmToMinutes('16:45') - scale.startMinute) * scale.pixelsPerMinute;
  expect(finalAppointmentTop + 15 * scale.pixelsPerMinute).toBe(scale.height);
  expect(hhmmToMinutes(slots.at(-1)!.split('-')[1])).toBeLessThanOrEqual(scale.endMinute);
});
