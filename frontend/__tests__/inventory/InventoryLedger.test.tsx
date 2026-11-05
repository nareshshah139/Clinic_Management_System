import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InventoryLedger } from '@/components/inventory/InventoryLedger';
import { apiClient } from '@/lib/api';
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));

const row = (fields: Record<string, any>) => ({
  id: 'r', at: '2026-11-04T05:00:00.000Z', type: 'SALE', delta: -10, direction: 'OUT', balance: { before: 100, after: 90 },
  unit: 'TABLETS', unitPrice: 2, value: 20, reference: 'INV-PH-1', reason: null, note: null, batchNumber: 'B1',
  item: { id: 'batch', name: 'Cetirizine 10mg' }, actor: { id: 'u1', name: 'Asha Rao' },
  source: { channel: 'PRESCRIPTION', label: 'Prescription dispensed', counterparty: 'Ravi Kumar',
    document: { type: 'PHARMACY_INVOICE', id: 'si1', number: 'PH-1', status: 'PAID', prescriptionId: 'rx-1' } },
  ...fields,
});
const timeline = {
  range: { from: '2026-10-06', to: '2026-11-04' }, truncated: false, scanLimit: 10000,
  totals: [
    { channel: 'PURCHASE_INVOICE', label: 'Purchase invoice', entries: 1, unitsIn: 100, unitsOut: 0, unknown: 0 },
    { channel: 'PRESCRIPTION', label: 'Prescription dispensed', entries: 1, unitsIn: 0, unitsOut: 10, unknown: 0 },
  ],
  rows: [
    row({ id: 'rx' }),
    row({ id: 'purchase', at: '2026-11-03T05:00:00.000Z', type: 'PURCHASE', delta: 100, direction: 'IN', balance: { before: 0, after: 100 }, reference: 'PINV-778',
      source: { channel: 'PURCHASE_INVOICE', label: 'Purchase invoice', counterparty: 'Medline Distributors',
        document: { type: 'PURCHASE_INVOICE', id: 'pi1', number: '778', status: 'POSTED' } } }),
  ],
  pagination: { page: 1, limit: 50, total: 2, pages: 1 },
};
const props = () => ({ query: { ledgerFrom: '2026-10-06', ledgerTo: '2026-11-04' }, navigate: jest.fn(), onDocument: jest.fn(), onInvoice: jest.fn(), onItem: jest.fn() });
beforeEach(() => jest.clearAllMocks());

it('shows each change with its method, document, party, balance and actor', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue(timeline);
  const p = props();
  render(<InventoryLedger {...p} />);
  const rx = (await screen.findByLabelText('Removed 10 tablets')).closest('li')!;
  expect(within(rx).getByText('Prescription dispensed')).toBeInTheDocument();
  expect(within(rx).getByRole('button', { name: 'Rx bill PH-1' })).toBeInTheDocument();
  expect(within(rx).getByText(/Ravi Kumar/)).toBeInTheDocument();
  expect(within(rx).getByLabelText('Balance went from 100 to 90')).toBeInTheDocument();
  expect(within(rx).getByText(/Asha Rao/)).toBeInTheDocument();
  const purchase = screen.getByLabelText('Added 100 tablets').closest('li')!;
  fireEvent.click(within(purchase).getByRole('button', { name: 'Purchase bill 778' }));
  expect(p.onInvoice).toHaveBeenCalledWith('pi1');
  fireEvent.click(within(purchase).getByRole('button', { name: 'Cetirizine 10mg' }));
  expect(p.onItem).toHaveBeenCalledWith('batch');
  expect(screen.getByRole('heading', { name: '04 Nov 2026' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '03 Nov 2026' })).toBeInTheDocument();
});

it('reads the range and filters from the URL and writes filter changes back to it', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue(timeline);
  const p = props();
  render(<InventoryLedger {...p} query={{ ...p.query, ledgerChannel: 'PRESCRIPTION', ledgerDirection: 'OUT', ledgerPage: '2' }} />);
  await screen.findByText('Showing Prescription dispensed.', { exact: false });
  const url = (apiClient.get as jest.Mock).mock.calls[0][0] as string;
  expect(new URLSearchParams(url.split('?')[1])).toEqual(new URLSearchParams({ from: '2026-10-06', to: '2026-11-04', page: '2', limit: '50', channel: 'PRESCRIPTION', direction: 'OUT' }));
  fireEvent.click(screen.getByRole('button', { name: /Purchase invoice/ }));
  expect(p.navigate).toHaveBeenCalledWith({ ledgerChannel: 'PRESCRIPTION,PURCHASE_INVOICE', ledgerPage: '' });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ceti' } });
  await waitFor(() => expect(p.navigate).toHaveBeenCalledWith({ ledgerSearch: 'ceti', ledgerPage: '' }));
});

it('keeps a failed read distinct from an empty ledger and warns when truncated', async () => {
  (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('Ledger offline'));
  const { unmount } = render(<InventoryLedger {...props()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Ledger offline');
  expect(screen.queryByText('No stock changes match these filters')).not.toBeInTheDocument();
  unmount();
  (apiClient.get as jest.Mock).mockResolvedValue({ ...timeline, truncated: true, rows: [], totals: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } });
  render(<InventoryLedger {...props()} />);
  expect(await screen.findByText('No stock changes match these filters')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('more than 10,000 movements');
});
