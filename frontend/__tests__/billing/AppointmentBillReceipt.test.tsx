import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppointmentBillDialog } from '@/components/appointments/AppointmentBillDialog';
import type { AppointmentInSlot } from '@/lib/types';

const ACCESS = { read: true, createBill: true, takePayment: true, editFees: false };
const appointment = {
  id: 'appt-1',
  slot: '10:00-10:15',
  status: 'CONFIRMED',
  visitType: 'OPD',
  billType: 'FIRST_CONSULTATION',
  fee: 500,
  patient: { id: 'p1', name: 'Meera Shah', gender: 'F', dob: null, age: 34 },
} as unknown as AppointmentInSlot;
const invoice = {
  id: 'cb9',
  invoiceNo: 'INV-20261125-009',
  total: 500,
  received: 500,
  balance: 0,
  items: [{ id: 'i1', name: 'First consultation', qty: 1, total: 500 }],
  payments: [{ id: 'pay1', amount: 500, mode: 'CASH', createdAt: '2026-11-25T05:00:00.000Z' }],
};
const receipt = {
  bill: {
    id: 'cb9', billNo: 'INV-20261125-009', billedAt: '2026-11-25T05:00:00.000Z', patient: { id: 'p1', name: 'Meera Shah', phone: null },
    doctor: { id: 'd1', name: 'Priya Menon' }, kind: 'CONSULTATION', amount: 500, paid: 500, due: 0, refunded: 0, status: 'PAID', voidReason: null,
  },
  clinic: { name: 'Lakshmi Family Clinic' },
  notes: null,
  items: [{ id: 'i1', name: 'First consultation', qty: 1, unitPrice: 500, discount: 0, gstRate: 0, total: 500 }],
  payments: [{ id: 'pay1', amount: 500, mode: 'CASH', reference: null, paidAt: '2026-11-25T05:00:00.000Z' }],
};

const requests: string[] = [];
const reply = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  requests.length = 0;
  document.querySelectorAll('iframe').forEach((frame) => frame.remove());
  global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input), 'http://clinic.test').pathname;
    requests.push(`${init.method ?? 'GET'} ${path}`);
    if (path === '/api/billing/invoices' && init.method === 'POST') return reply({ id: 'cb9', invoiceNo: 'INV-20261125-009' }, 201);
    if (path === '/api/billing/payments') return reply({ id: 'pay1' }, 201);
    if (path === '/api/billing/invoices/cb9') return reply(invoice);
    if (path === '/api/billing/invoices/cb9/receipt') return reply(receipt);
    return reply({ message: 'Not found' }, 404);
  }) as unknown as typeof fetch;
});

function Calendar() {
  const [current, setCurrent] = useState(appointment);
  const reloadSchedule = () =>
    setCurrent({ ...appointment, billing: { state: 'PAID', total: 500, received: 500, due: 0, attention: false, invoices: [{ id: 'cb9', invoiceNo: 'INV-20261125-009', total: 500, received: 500, due: 0 }] } } as AppointmentInSlot);
  return <AppointmentBillDialog appointment={current} date="2026-11-25" access={ACCESS} onClose={() => {}} onChanged={reloadSchedule} />;
}

it('offers Print receipt and Download PDF once the bill is saved, and prints the saved bill', async () => {
  render(<Calendar />);
  const dialog = await screen.findByRole('dialog', { name: 'Bill for Meera Shah' });
  expect(within(dialog).queryByRole('button', { name: /Print receipt/ })).toBeNull();

  fireEvent.click(await within(dialog).findByRole('button', { name: 'Create bill and record ₹500' }));

  const print = await within(dialog).findByRole('button', { name: 'Print receipt INV-20261125-009' });
  expect(within(dialog).getByRole('button', { name: 'Download PDF INV-20261125-009' })).toBeInTheDocument();
  fireEvent.click(print);

  await waitFor(() => expect(document.querySelector('iframe[data-print-frame]')).not.toBeNull());
  const printed = new DOMParser().parseFromString(document.querySelector('iframe[data-print-frame]')!.getAttribute('srcdoc')!, 'text/html').body.textContent!;
  expect(printed).toContain('Meera Shah');
  expect(printed).toContain('First consultation');
  expect(printed).toContain('Balance due₹0.00');
  expect(requests).toEqual([
    'POST /api/billing/invoices',
    'POST /api/billing/payments',
    'GET /api/billing/invoices/cb9',
    'GET /api/billing/invoices/cb9/receipt',
  ]);
});
