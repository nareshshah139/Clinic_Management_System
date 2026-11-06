import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CountSheet } from '@/components/inventory/counts/CountSheet';
import { CountRecord } from '@/components/inventory/counts/CountRecord';
import { StockCounts } from '@/components/inventory/counts/StockCounts';
import { ReconciliationSettingsPanel } from '@/components/inventory/counts/ReconciliationSettingsPanel';
import { forecastMessage, parseCount, summarySentence, countSummary, type CountDetail, type ReconciliationSummary } from '@/components/inventory/counts/count-model';
import { reconciliationRows } from '@/components/inventory/InventoryWorkspace';
import { apiClient } from '@/lib/api';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard/inventory', useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }), useSearchParams: () => new URLSearchParams() }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'anil', branchId: 'branch', role: 'PHARMACIST', firstName: 'Anil', lastName: 'Deshmukh' } }) }));

const line = (id: string, name: string, extra: Partial<CountDetail['lines'][number]> = {}) => ({
  id, inventoryId: `item-${id}`, name, batchNumber: `B-${id}`, expiryDate: '2027-06-30T00:00:00.000Z', unit: 'STRIPS', location: 'Rack A2',
  currentStock: 10, systemStock: 10, physicalStock: null, difference: null, unitCost: 12.5, value: null, note: '', history: null, ...extra,
});
const detail = (overrides: Partial<CountDetail> = {}): CountDetail => ({
  id: 'count-1', reference: 'Stock count 06/11/2026 · Anil Deshmukh', day: '2026-11-06', origin: 'CYCLE', assignedTo: { id: 'anil', name: 'Anil Deshmukh' },
  signedBy: null, signedAt: null, decidedBy: null, decidedAt: null, items: 3, counted: 0, differences: 0, netUnits: 0, netValue: 0, state: 'ASSIGNED',
  version: 1, reason: 'Stock reconciliation cycle', signOffNote: '', decisionReason: '', selfApproval: false,
  lines: [line('a', 'Isotroin 10'), line('b', 'Adapalene Gel 15g'), line('c', 'Clobetasol Cream 15g')],
  events: [], can: { count: true, decide: false, decideOwn: false }, approvers: [], ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('count model', () => {
  it('reads counted quantities strictly', () => {
    expect(['', ' 7 ', '0', '7.5', '-1', 'abc'].map(parseCount)).toEqual([null, 7, 0, 'invalid', 'invalid', 'invalid']);
  });

  it('summarises a count in one sentence', () => {
    const figures = countSummary([
      { systemStock: 10, physicalStock: 7, unitCost: 12.5 },
      { systemStock: 4, physicalStock: 5, unitCost: 20 },
      { systemStock: 6, physicalStock: 6, unitCost: 3 },
    ]);
    expect(summarySentence(figures)).toBe('3 items, 2 differ: net −2 units, −₹17.50.');
    expect(summarySentence(countSummary([{ systemStock: 1, physicalStock: 1, unitCost: 1 }]))).toBe('1 item, all match the system.');
  });

  it('forecasts with the same words as the server', () => {
    expect(forecastMessage({ cycleDays: 10, itemsPerPersonPerDay: 10, assigneeIds: ['a', 'b'] }, 340).message).toBe(
      'At 10 per person per day with 2 people, a 10-day cycle covers 200 of 340 batches in stock. Raise items per day to 17 or add 2 people.',
    );
    expect(forecastMessage({ cycleDays: 1, itemsPerPersonPerDay: 10, assigneeIds: ['a'] }, 450).message).toBe(
      'At 10 per person per day with 1 person, a 1-day cycle covers 10 of 450 batches in stock. Add 44 people or lengthen the cycle.',
    );
    expect(forecastMessage({ cycleDays: 10, itemsPerPersonPerDay: 10, assigneeIds: ['a', 'b'] }, 60)).toEqual({ short: false, message: 'At 10 per person per day with 2 people, a 10-day cycle covers all 60 batches in stock.' });
    expect(forecastMessage({ cycleDays: 10, itemsPerPersonPerDay: 10, assigneeIds: [] }, 60).message).toBe('Choose who counts to start the cycle.');
  });
});

describe('Today cards', () => {
  it('reminds the counter, the approver and whoever configures, and nothing else', () => {
    expect(reconciliationRows(null)).toEqual([]);
    expect(reconciliationRows({ due: { counts: 1, items: 20 }, approvals: { count: 2, netValue: -612 }, behind: { remaining: 140, message: 'At 10 per person per day with 2 people, a 10-day cycle covers 200 of 340 batches in stock. Raise items per day to 17 or add 2 people.' } }).map((row) => [row.label, row.count, row.target])).toEqual([
      ['Stock count due today · 20 items', 20, { area: 'stock', view: 'COUNT' }],
      ['Counts awaiting your approval · -₹612.00', 2, { area: 'stock', view: 'COUNT', tab: 'approvals' }],
      ['Reconciliation behind: 140 batches not counted this cycle', 140, { area: 'stock', view: 'COUNT', tab: 'settings' }],
    ]);
    expect(reconciliationRows({ due: null, approvals: { count: 0, netValue: 0 }, behind: null })).toEqual([]);
  });
});

describe('counting sheet', () => {
  it('starts every counted field empty, shows the difference at once and moves on with Enter', async () => {
    (apiClient.patch as jest.Mock).mockImplementation(async (_url: string, body: any) => ({ ...detail(), version: body.version + 1 }));
    render(<CountSheet detail={detail()} onSigned={jest.fn()} onStale={jest.fn()} />);
    const fields = screen.getAllByRole('textbox', { name: /^Counted quantity of/ });
    expect(fields.map((field) => (field as HTMLInputElement).value)).toEqual(['', '', '']);
    expect(document.activeElement).toBe(fields[0]);
    fireEvent.change(fields[0], { target: { value: '7' } });
    const first = screen.getAllByRole('listitem')[0];
    expect(within(first).getByText('−3')).toBeInTheDocument();
    expect(within(first).getByText('−₹37.50')).toBeInTheDocument();
    fireEvent.keyDown(fields[0], { key: 'Enter' });
    expect(document.activeElement).toBe(fields[1]);
    fireEvent.change(fields[1], { target: { value: '10' } });
    expect(within(screen.getAllByRole('listitem')[1]).getByText('Matches')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 counted')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect((apiClient.patch as jest.Mock).mock.calls.flatMap(([, body]) => body.lines)).toEqual(
      expect.arrayContaining([{ id: 'a', physicalStock: 7, note: '' }, { id: 'b', physicalStock: 10, note: '' }]),
    );
    fireEvent.keyDown(fields[2], { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign off count' }));
  });

  it('will not sign off until every batch is counted, then asks for a note and signs once', async () => {
    (apiClient.patch as jest.Mock).mockImplementation(async (_url: string, body: any) => ({ ...detail(), version: body.version + 1 }));
    const signed = detail({ state: 'AWAITING_APPROVAL', signedBy: { id: 'anil', name: 'Anil Deshmukh' }, signedAt: '2026-11-06T09:00:00.000Z', can: { count: false, decide: false, decideOwn: false } });
    (apiClient.post as jest.Mock).mockResolvedValue(signed);
    const onSigned = jest.fn();
    render(<CountSheet detail={detail()} onSigned={onSigned} onStale={jest.fn()} />);
    const fields = screen.getAllByRole('textbox', { name: /^Counted quantity of/ });
    fireEvent.change(fields[0], { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign off count' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Count every item before signing off. 2 items still to count.');
    expect(document.activeElement).toBe(fields[1]);
    fireEvent.change(fields[1], { target: { value: '10' } });
    fireEvent.change(fields[2], { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign off count' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign off this count' });
    expect(within(dialog).getByText('3 items, 1 differ: net −3 units, −₹37.50.')).toBeInTheDocument();
    expect(within(dialog).getByText('System 10 · counted 7')).toBeInTheDocument();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign off and send for approval' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Say why these differ, for the approver.');
    expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Why do these differ? (required)'), { target: { value: 'Three strips damaged' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign off and send for approval' }));
    await waitFor(() => expect(onSigned).toHaveBeenCalledWith(signed));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(url).toBe('/inventory/workspace/reconciliation/counts/count-1/sign-off');
    expect({ ...body, requestKey: typeof body.requestKey }).toEqual({
      version: expect.any(Number), requestKey: 'string', note: 'Three strips damaged',
      lines: [{ id: 'a', physicalStock: 7, note: '' }, { id: 'b', physicalStock: 10, note: '' }, { id: 'c', physicalStock: 10, note: '' }],
    });
    expect(toast).toHaveBeenCalledWith({ title: 'Count signed off and sent for approval.', description: 'Stock changes only when a doctor or administrator approves it.' });
  });
});

describe('signed record and decision', () => {
  const awaiting = (can: CountDetail['can'], approvers: string[] = []) =>
    detail({
      state: 'AWAITING_APPROVAL', signedBy: { id: 'anil', name: 'Anil Deshmukh' }, signedAt: '2026-11-06T09:00:00.000Z', signOffNote: 'Three strips damaged', differences: 1, netUnits: -3, netValue: -37.5,
      lines: [line('a', 'Isotroin 10', { physicalStock: 7, difference: -3, value: -37.5, currentStock: 8, history: '3 of the last 4 counts differed' }), line('b', 'Adapalene Gel 15g', { physicalStock: 10, difference: 0, value: 0 })],
      can, approvers,
    });

  it('shows a locked record with the differing batch first and approves against current stock', async () => {
    const approved = { ...awaiting({ count: false, decide: false, decideOwn: false }), state: 'APPROVED' as const, version: 3 };
    (apiClient.post as jest.Mock).mockResolvedValue(approved);
    const onDecided = jest.fn();
    render(<CountRecord detail={awaiting({ count: false, decide: true, decideOwn: false })} onDecided={onDecided} onStale={jest.fn()} />);
    expect(screen.getByText(/Signed by/)).toHaveTextContent('Signed by Anil Deshmukh on 06/11/2026, 02:30 pm');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([expect.stringContaining('Isotroin 10')]);
    expect(screen.getByText('3 of the last 4 counts differed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 2 batches' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and adjust stock' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and adjust stock' });
    expect(within(dialog).getByRole('list', { name: 'Stock changes' })).toHaveTextContent('Isotroin 10 · B-a8 now →becomes 5 (−3)');
    expect(within(dialog).getByText('It was 10 when counted; stock has moved since.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Reason (required)')).toHaveValue('Physical count signed by Anil Deshmukh on 06/11/2026');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and adjust stock' }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(approved));
    expect((apiClient.post as jest.Mock).mock.calls[0][0]).toBe('/inventory/workspace/reconciliation/counts/count-1/approve');
    expect((apiClient.post as jest.Mock).mock.calls[0][1]).toMatchObject({ version: 1, reason: 'Physical count signed by Anil Deshmukh on 06/11/2026' });
  });

  it('needs a typed reason to reject and an explicit tick for the sole approver deciding their own count', async () => {
    render(<CountRecord detail={awaiting({ count: false, decide: true, decideOwn: true })} onDecided={jest.fn()} onStale={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject this count' });
    expect(within(dialog).getByLabelText('Reason (required)')).toHaveValue('');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject count' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Say why this count is rejected, so the next count can fix it.');
    fireEvent.change(within(dialog).getByLabelText('Reason (required)'), { target: { value: 'Recount the top shelf' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject count' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tick the box to confirm you are deciding your own count.');
    expect(apiClient.post).not.toHaveBeenCalled();
    (apiClient.post as jest.Mock).mockResolvedValue({ ...awaiting({ count: false, decide: false, decideOwn: false }), state: 'REJECTED' });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject count' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/inventory/workspace/reconciliation/counts/count-1/reject', expect.objectContaining({ reason: 'Recount the top shelf', selfApproval: true })));
  });

  it('tells the signer who decides instead of offering the decision', () => {
    render(<CountRecord detail={awaiting({ count: false, decide: false, decideOwn: false }, ['Priya Menon', 'Asha Rao'])} onDecided={jest.fn()} onStale={jest.fn()} />);
    expect(screen.getByText('You signed this count, so someone else decides it. Ask Priya Menon or Asha Rao.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and adjust stock' })).not.toBeInTheDocument();
  });
});

const summary = (overrides: Partial<ReconciliationSummary> = {}): ReconciliationSummary => ({
  today: '2026-11-06',
  settings: { enabled: true, cycleDays: 10, itemsPerPersonPerDay: 10, assigneeIds: ['anil', 'meera'], cycleStart: '2026-11-01' },
  settingsVersion: 4,
  cycle: { start: '2026-11-01', end: '2026-11-10', day: 6, days: 10, daysLeft: 5 },
  forecast: { batches: 340, covered: 120, remaining: 220, people: 2, perDay: 10, capacity: 200, short: true, behind: true, message: '' },
  mine: [{ id: 'count-1', reference: 'Stock count 06/11/2026 · Anil Deshmukh', day: '2026-11-06', origin: 'CYCLE', version: 2, items: 10, counted: 4 }],
  approvals: null,
  canCount: true,
  canApprove: false,
  canConfigure: false,
  staff: [
    { id: 'anil', name: 'Anil Deshmukh', role: 'PHARMACIST' },
    { id: 'meera', name: 'Meera Kulkarni', role: 'PHARMACIST' },
    { id: 'priya', name: 'Priya Menon', role: 'DOCTOR' },
  ],
  ...overrides,
});

describe('stock counts workspace', () => {
  it('opens on my counts with today first, and shows approvals and settings only to those who may use them', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue(summary());
    const navigate = jest.fn();
    const { unmount } = render(<StockCounts searchParams={new URLSearchParams('area=stock&view=COUNT')} navigate={navigate} onRegisterParams={jest.fn()} />);
    expect(await screen.findByText('Cycle 01/11/2026 to 10/11/2026 · day 6 of 10 ·', { exact: false })).toHaveTextContent('120 of 340 batches counted');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['My counts1', 'History']);
    expect(screen.getByText('10 items · 4 counted · 6 left')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue counting: Stock count 06/11/2026 · Anil Deshmukh' }));
    expect(navigate).toHaveBeenCalledWith({ document: 'count-1' });
    unmount();
    (apiClient.get as jest.Mock).mockResolvedValue(summary({ canApprove: true, canConfigure: true, approvals: { count: 2, netValue: -612 } }));
    render(<StockCounts searchParams={new URLSearchParams('area=stock&view=COUNT')} navigate={navigate} onRegisterParams={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['My counts1', 'Approvals2', 'History', 'Settings']));
  });

  it('gives reception the access message instead of an error', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    render(<StockCounts searchParams={new URLSearchParams('area=stock&view=COUNT')} navigate={jest.fn()} onRegisterParams={jest.fn()} />);
    expect(await screen.findByText('You don’t have access to stock counts.')).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('updates the forecast as values change and saves only the cycle settings', async () => {
    (apiClient.patch as jest.Mock).mockResolvedValue({});
    const onSaved = jest.fn();
    render(<ReconciliationSettingsPanel summary={summary({ canConfigure: true })} onSaved={onSaved} />);
    expect(screen.getByText('At 10 per person per day with 2 people, a 10-day cycle covers 200 of 340 batches in stock. Raise items per day to 17 or add 2 people.')).toBeInTheDocument();
    expect(screen.getByText('120 of 340 batches counted (35%) · 5 days left')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Items per person per day'), { target: { value: '17' } });
    expect(screen.getByText('At 17 per person per day with 2 people, a 10-day cycle covers all 340 batches in stock.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cycle length (days)'), { target: { value: '61' } });
    expect(screen.getByText('Whole number from 1 to 60')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cycle length (days)'), { target: { value: '10' } });
    fireEvent.click(screen.getByLabelText(/Priya Menon/));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(apiClient.patch).toHaveBeenCalledWith('/inventory/workspace/settings', {
      version: 4,
      reconciliation: { enabled: true, cycleDays: 10, itemsPerPersonPerDay: 17, assigneeIds: ['anil', 'meera', 'priya'] },
    });
  });
});
