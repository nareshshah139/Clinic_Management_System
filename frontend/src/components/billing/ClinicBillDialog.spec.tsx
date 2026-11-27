import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ClinicBillDialog } from './ClinicBillDialog';
import { apiClient } from '@/lib/api';

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn(), useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ apiClient: { getClinicReceipt: jest.fn(), collectClinicPayment: jest.fn() } }));

const api = apiClient as unknown as Record<string, jest.Mock>;
const NOT_THE_DATE = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'nextTick', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] as const;
const OPENED = new Date('2026-11-26T18:25:00.000Z');
const PAST_MIDNIGHT = new Date('2026-11-26T18:35:00.000Z');

const receipt = {
  bill: { id: 'inv1', billNo: 'INV-1', billedAt: '2026-11-26T10:00:00.000Z', patient: { id: 'p1', name: 'Ravi Kumar', phone: null }, doctor: null, kind: 'CONSULTATION', amount: 500, paid: 300, due: 200, refunded: 0, status: 'PARTIALLY_PAID', voidReason: null },
  clinic: {},
  notes: null,
  items: [{ id: 'i1', name: 'Review consultation', qty: 1, unitPrice: 500, discount: 0, gstRate: 0, total: 500 }],
  payments: [],
};

async function openDialog() {
  api.getClinicReceipt.mockResolvedValue(receipt);
  api.collectClinicPayment.mockResolvedValue({ id: 'pay1' });
  render(<ClinicBillDialog billId="inv1" actions={{ collect: true, void: false, refund: false }} onClose={jest.fn()} onChanged={jest.fn()} />);
  return screen.findByRole('dialog', { name: /Bill INV-1/ });
}

describe('ClinicBillDialog Received on across midnight', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: OPENED, doNotFake: [...NOT_THE_DATE] });
  });
  afterEach(() => jest.useRealTimers());

  it('sends no Received on when the day was never chosen, even if midnight passed while the dialog was open', async () => {
    const dialog = await openDialog();
    expect(await within(dialog).findByText(/Received today/)).toBeInTheDocument();

    jest.setSystemTime(PAST_MIDNIGHT);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record ₹200 payment' }));

    await waitFor(() => expect(api.collectClinicPayment).toHaveBeenCalled());
    expect(api.collectClinicPayment.mock.calls[0][0]).toEqual({ invoiceId: 'inv1', amount: 200, method: 'CASH' });
  });

  it('sends the day staff chose, even when it is submitted after midnight', async () => {
    const dialog = await openDialog();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Change the day the money was received' }));
    fireEvent.change(within(dialog).getByLabelText('Received on'), { target: { value: '2026-11-25' } });

    jest.setSystemTime(PAST_MIDNIGHT);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record ₹200 payment' }));

    await waitFor(() => expect(api.collectClinicPayment).toHaveBeenCalled());
    expect(api.collectClinicPayment.mock.calls[0][0]).toEqual({ invoiceId: 'inv1', amount: 200, method: 'CASH', receivedOn: '2026-11-25' });
  });

  it('sends the opening day when staff chose it, even when it is submitted after midnight', async () => {
    const dialog = await openDialog();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Change the day the money was received' }));
    fireEvent.change(within(dialog).getByLabelText('Received on'), { target: { value: '2026-11-26' } });

    jest.setSystemTime(PAST_MIDNIGHT);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record ₹200 payment' }));

    await waitFor(() => expect(api.collectClinicPayment).toHaveBeenCalled());
    expect(api.collectClinicPayment.mock.calls[0][0]).toEqual({ invoiceId: 'inv1', amount: 200, method: 'CASH', receivedOn: '2026-11-26' });
  });

  it('treats a cleared date as received today and still lets staff record the payment', async () => {
    const dialog = await openDialog();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Change the day the money was received' }));
    const field = within(dialog).getByLabelText('Received on');
    fireEvent.change(field, { target: { value: '2026-11-25' } });
    fireEvent.change(field, { target: { value: '' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Record ₹200 payment' }));

    await waitFor(() => expect(api.collectClinicPayment).toHaveBeenCalled());
    expect(api.collectClinicPayment.mock.calls[0][0]).toEqual({ invoiceId: 'inv1', amount: 200, method: 'CASH' });
  });
});
