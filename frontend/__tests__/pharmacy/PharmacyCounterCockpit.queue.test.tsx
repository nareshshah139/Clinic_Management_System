import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PharmacyCounterCockpit } from '@/components/pharmacy/PharmacyCounterCockpit';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const get = apiClient.get as jest.Mock;

const totals: Record<string, number> = { all: 130, pending: 84, partial: 4, expired: 2, dispensed: 40 };
const entry = (id: string, status: string) => ({
  prescriptionId: id, status, createdAt: new Date().toISOString(), pendingHours: 30, isOverTwoHours: true, linkedInvoiceIds: [],
  patient: { id: `patient-${id}`, name: `Patient ${id}` }, doctor: { id: 'd', name: 'Doctor' },
  medications: [{ drugName: 'Medicine A', prescribedQuantity: 1, dispensedQuantity: 0, coverageStatus: 'not_started' }],
});
const queueCalls = () => get.mock.calls.filter(([url]) => url === '/pharmacy/prescription-queue').map(([, params]) => params);
const rows = () => within(screen.getByRole('list', { name: 'Prescription queue' })).getAllByRole('listitem');
const chips = () => screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }))
  .map((chip) => chip.textContent).sort();

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation(async (url: string, params: { page: number; limit: number; status?: string }) => {
    if (url.endsWith('/stock-check')) return { items: [] };
    const key = params.status ?? 'all';
    const start = (params.page - 1) * params.limit;
    const count = Math.max(0, Math.min(params.limit, totals[key] - start));
    return {
      data: Array.from({ length: count }, (_, index) => entry(`${key}-${start + index}`, key === 'all' ? 'pending' : key)),
      pagination: { page: params.page, limit: params.limit, total: totals[key] },
      counts: { pending: totals.pending, partial: totals.partial, expired: totals.expired, dispensed: totals.dispensed },
    };
  });
});

const props = { onOpenBilling: jest.fn(), onOpenPartnerSync: jest.fn(), onOpenInventoryControl: jest.fn() };

it('counts every chip on the server, across all prescriptions rather than the loaded rows', async () => {
  render(<PharmacyCounterCockpit {...props} />);
  await waitFor(() => expect(chips()).toEqual(['All 130', 'Done 40', 'Partial 4', 'Paused 2', 'Waiting 84']));
  expect(rows()).toHaveLength(25);
  expect(queueCalls()).toEqual([{ page: 1, limit: 25, status: undefined }]);
  expect(screen.getByText('Newest 25 of 130')).toBeInTheDocument();
});

it('asks the server for the chosen status and pages within it', async () => {
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText('Newest 25 of 130');

  fireEvent.click(screen.getByRole('button', { name: /^Partial/ }));
  await waitFor(() => expect(rows().map((row) => within(row).getByText(/^Patient/).textContent)).toEqual([
    'Patient partial-0', 'Patient partial-1', 'Patient partial-2', 'Patient partial-3',
  ]));
  expect(queueCalls().at(-1)).toEqual({ page: 1, limit: 25, status: 'partial' });
  expect(screen.getByRole('button', { name: /^Partial/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Done/ }));
  await screen.findByText('Newest 25 of 40');
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  await waitFor(() => expect(rows()).toHaveLength(40));
  expect(queueCalls().slice(-2)).toEqual([
    { page: 1, limit: 25, status: 'dispensed' },
    { page: 2, limit: 25, status: 'dispensed' },
  ]);
  expect(screen.getByText('Newest first')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
});

it('reaches the oldest prescriptions beyond the first hundred', async () => {
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByText('Newest 25 of 130');
  for (const loaded of [50, 75, 100, 125, 130]) {
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(rows()).toHaveLength(loaded));
  }
  expect(within(rows()[129]).getByText('Patient all-129')).toBeInTheDocument();
}, 30000);

it('shows bare chip labels rather than guessing counts when the server sends none', async () => {
  get.mockImplementation(async (url: string) => url.endsWith('/stock-check')
    ? { items: [] }
    : { data: [entry('rx-1', 'pending')], pagination: { page: 1, limit: 25, total: 1 } });
  render(<PharmacyCounterCockpit {...props} />);
  await screen.findByRole('list', { name: 'Prescription queue' });
  expect(chips()).toEqual(['All', 'Done', 'Partial', 'Paused', 'Waiting']);
});
