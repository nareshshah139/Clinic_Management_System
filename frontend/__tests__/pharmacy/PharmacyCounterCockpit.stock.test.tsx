import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PharmacyCounterCockpit } from '@/components/pharmacy/PharmacyCounterCockpit';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), patch: jest.fn() } }));
const get = apiClient.get as jest.Mock;
const entry = (id = 'rx-1') => ({
  prescriptionId: id, status: 'pending', createdAt: new Date().toISOString(), pendingHours: 0,
  isOverTwoHours: false, linkedInvoiceIds: [], patient: { id, name: `Patient ${id}` }, doctor: { id: 'd', name: 'Doctor' },
  medications: [{ drugName: 'Medicine A', prescribedQuantity: 2, dispensedQuantity: 0, coverageStatus: 'not_started' }],
});
const stock = (quantity: number) => ({ items: [{
  drugName: 'Medicine A', matchedDrug: { id: 'd', name: 'Medicine A' }, stockStatus: 'IN_STOCK',
  totalNonExpiredStock: quantity, batches: [], lowStock: false, nearExpiry: false,
}] });
let quantity: number;
const props = { onOpenBilling: jest.fn(), onOpenQueue: jest.fn(), onOpenPartnerSync: jest.fn(), onOpenInventoryControl: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks(); quantity = 10;
  get.mockImplementation(async url => url.endsWith('/stock-check') ? stock(quantity) : { data: [entry()], pagination: { total: 1 } });
});

it('Refresh rechecks active stock after Inventory changes', async () => {
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  quantity = 3;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
  await screen.findByText(/3 available/);
  expect(screen.queryByText(/10 available/)).not.toBeInTheDocument();
});

it('shows a retryable error when refreshed stock cannot be read', async () => {
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  get.mockImplementation(async url => {
    if (url.endsWith('/stock-check')) throw new Error('unavailable');
    return { data: [entry()], pagination: { total: 1 } };
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/stock|retry/i);
  expect(screen.queryByText(/10 available/)).not.toBeInTheDocument();
});

it('refreshes when another pharmacy action announces an inventory change', async () => {
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  quantity = 7;
  act(() => window.dispatchEvent(new CustomEvent('pharmacy-invoices-refresh')));
  await screen.findByText(/7 available/);
});

it('ignores a delayed stock response after the selected prescription changes', async () => {
  let resolveFirst: (value: any) => void = () => undefined;
  get.mockImplementation(async url => {
    if (url.includes('rx-1/stock-check')) return new Promise(resolve => { resolveFirst = resolve; });
    if (url.includes('rx-2/stock-check')) return stock(3);
    return { data: [entry(), entry('rx-2')], pagination: { total: 2 } };
  });
  const view = render(<PharmacyCounterCockpit {...props} prefill={{ prescriptionId: 'rx-1' }} />);
  await waitFor(() => expect(get).toHaveBeenCalledWith('/pharmacy/prescription-queue/rx-1/stock-check'));
  view.rerender(<PharmacyCounterCockpit {...props} prefill={{ prescriptionId: 'rx-2' }} />);
  await screen.findByText(/3 available/);
  await act(async () => resolveFirst(stock(99)));
  expect(screen.queryByText(/99 available/)).not.toBeInTheDocument();
  expect(screen.getByText(/3 available/)).toBeInTheDocument();
});
