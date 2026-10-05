import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PharmacyCounterCockpit } from '@/components/pharmacy/PharmacyCounterCockpit';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
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

const preparedEntry = () => ({ ...entry(), dispenseTaskId: 'task-1', dispenseStatus: 'QUEUED', medications: [{ ...entry().medications[0], lineId: 'line-1', action: 'pending' }] });

it('creates a task before saving review on the automatically selected prescription', async () => {
  let finishPull: (response: any) => void = () => undefined;
  (apiClient.post as jest.Mock).mockImplementation(() => new Promise(resolve => { finishPull = resolve; }));
  (apiClient.patch as jest.Mock).mockImplementation(async (url, body) => ({
    ...preparedEntry(), dispenseStatus: 'READY_TO_BILL', medications: [{ ...preparedEntry().medications[0], action: body.action.toLowerCase() }],
  }));
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  expect(apiClient.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Accept', exact: true }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/pharmacy/prescription-queue/rx-1/pull', {}));
  expect(apiClient.patch).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Ready', exact: true })).toBeDisabled();
  await act(async () => finishPull({ data: preparedEntry() }));
  await screen.findByText('1/1 lines reviewed');
  expect(screen.getByRole('button', { name: 'Ready', exact: true })).toBeEnabled();
  expect(apiClient.patch).toHaveBeenCalledWith('/pharmacy/dispense-tasks/task-1/lines/line-1', { action: 'ACCEPTED', reasonType: undefined, reasonNote: undefined });
});

it('keeps an unsuccessful review pending and exposes a retryable save error', async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ data: preparedEntry() });
  (apiClient.patch as jest.Mock).mockRejectedValue(new Error('save failed'));
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  fireEvent.click(screen.getByRole('button', { name: 'Accept', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save medicine review');
  expect(screen.getByText('0/1 lines reviewed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ready', exact: true })).toBeDisabled();
});

it('creates a task before applying an explicit status action', async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ data: preparedEntry() });
  (apiClient.patch as jest.Mock).mockResolvedValue({ ...preparedEntry(), dispenseStatus: 'PAUSED', status: 'expired' });
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  fireEvent.click(screen.getByRole('button', { name: 'Pause', exact: true }));
  await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/pharmacy/dispense-tasks/task-1/status', expect.objectContaining({ status: 'PAUSED' })));
  expect(screen.getByRole('button', { name: /Patient rx-1/ })).toHaveTextContent('Paused');
});

it('starts review through explicit pull when staff select a prescription without a task', async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ data: preparedEntry() });
  (apiClient.patch as jest.Mock).mockResolvedValue({ ...preparedEntry(), dispenseStatus: 'IN_REVIEW' });
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  fireEvent.click(screen.getByRole('button', { name: /Patient rx-1/ }));
  await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/pharmacy/dispense-tasks/task-1/status', { status: 'IN_REVIEW' }));
  expect(screen.getByRole('button', { name: /Patient rx-1/ })).toHaveTextContent('Review');
});

it('refreshes invoice coverage after checkout without creating a task during refresh', async () => {
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  get.mockImplementation(async url => url.endsWith('/stock-check') ? stock(8) : { data: [{ ...entry(), status: 'dispensed', dispenseStatus: 'DISPENSED', linkedInvoiceIds: ['paid-invoice'] }], pagination: { total: 1 } });
  act(() => window.dispatchEvent(new CustomEvent('pharmacy-invoices-refresh')));
  await screen.findByText(/8 available/);
  expect(screen.getByRole('button', { name: /Patient rx-1/ })).toHaveTextContent('Done');
  expect(apiClient.post).not.toHaveBeenCalled();
});

it('keeps inactive prescriptions viewable without offering dispense mutations', async () => {
  get.mockImplementation(async url => url.endsWith('/stock-check') ? stock(10) : { data: [{ ...entry(), dispensingEligible: false, status: 'expired', dispenseStatus: 'PAUSED' }], pagination: { total: 1 } });
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText(/10 available/);
  expect(screen.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Dispense', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Patient rx-1/ }));
  expect(apiClient.post).not.toHaveBeenCalled();
  expect(apiClient.patch).not.toHaveBeenCalled();
});
