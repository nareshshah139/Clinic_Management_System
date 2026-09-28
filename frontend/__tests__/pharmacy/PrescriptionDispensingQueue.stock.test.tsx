import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PrescriptionDispensingQueue } from '@/components/pharmacy/PrescriptionDispensingQueue';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
const get = apiClient.get as jest.Mock, post = apiClient.post as jest.Mock;
const names = ['Sebium gel moussant', 'Cream two', 'Cream three', 'Cream four', 'Unlinked cream'];
let quantity: number, linked: boolean;
const entries = ['Patient A', 'Patient B'].map((name, i) => ({ prescriptionId: `rx-${i}`, patient: { id: `p-${i}`, name }, doctor: { id: 'doc', name: 'Doctor' }, createdAt: new Date().toISOString(), pendingHours: 1, isOverTwoHours: false, medications: names.map(drugName => ({ drugName, prescribedQuantity: 1, dispensedQuantity: 0 })), status: 'pending', linkedInvoiceIds: [] }));
beforeEach(() => {
  quantity = 24; linked = false; jest.clearAllMocks();
  get.mockImplementation(async (url: string) => {
    if (url === '/pharmacy/prescription-queue') return { data: entries, pagination: { page: 1, limit: 20, total: 2, pages: 1 } };
    if (url.endsWith('inventory-suggestions')) return [{ inventoryItemId: 'i-1', name: 'Correct cream', unit: 'TUBES', totalStock: 24 }];
    if (url.endsWith('/stock-check')) return { items: names.map((drugName, i) => ({ drugName, prescriptionVersion: 'revision', stockStatus: i === 4 && !linked ? 'UNMATCHED' : 'IN_STOCK', totalNonExpiredStock: quantity, matchedDrug: i === 4 && !linked ? null : { id: 'd-1' }, unit: 'TUBES', alternatives: [] })) };
    return {};
  });
  post.mockImplementation(async url => { if (url.endsWith('/link-inventory')) linked = true; return {}; });
});
it('shows every line, including the fourth healthy item and unknown quantity for unlinked items', async () => {
  render(<PrescriptionDispensingQueue />);
  await waitFor(() => expect(screen.getAllByText('In stock')).toHaveLength(8));
  for (const entry of entries) {
    const row = screen.getByText(entry.patient.name).closest('tr')!;
    expect(within(row).getByText('Cream four (24 tubes)')).toBeInTheDocument();
    expect(within(row).getByText('Unlinked cream (—)')).toBeInTheDocument();
    expect(within(row).queryByText('Unlinked cream (0)')).not.toBeInTheDocument();
  }
});
it('refreshes stock and matching to show updated quantities', async () => {
  render(<PrescriptionDispensingQueue />);
  await screen.findAllByText('Sebium gel moussant (24 tubes)');
  quantity = 19;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh stock for Patient A' }));
  await waitFor(() => expect(screen.getAllByText('Sebium gel moussant (19 tubes)')).toHaveLength(2));
  expect(post).toHaveBeenCalledWith('/pharmacy/prescription-queue/rx-0/pull', {});
});
it('remembers an explicit choice and refreshes the same medicine for both patients', async () => {
  render(<PrescriptionDispensingQueue />);
  const buttons = await screen.findAllByRole('button', { name: 'Link inventory for Unlinked cream' });
  fireEvent.click(buttons[0]);
  fireEvent.click(await screen.findByRole('radio'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and remember match' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/pharmacy/prescription-queue/rx-0/link-inventory', { lineIndex: 4, inventoryItemId: 'i-1', prescriptionVersion: 'revision' }));
  await waitFor(() => expect(screen.getAllByText('Unlinked cream (24 tubes)')).toHaveLength(2));
});
it('reports failed stock reads without presenting zeros or perpetual Checking', async () => {
  const original = get.getMockImplementation()!;
  get.mockImplementation((url: string) => url.endsWith('/stock-check') ? Promise.reject(new Error('offline')) : original(url));
  render(<PrescriptionDispensingQueue />);
  await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
  expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
});
