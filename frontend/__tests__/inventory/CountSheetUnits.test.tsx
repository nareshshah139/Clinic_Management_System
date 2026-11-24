import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { StockCounts } from '@/components/inventory/counts/StockCounts';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import type { CountDetail } from '@/components/inventory/counts/count-model';
import type { User } from '@/lib/types';

const COUNT_URL = '/api/inventory/workspace/reconciliation/counts/count-1';

const line = (id: string, name: string, over: Partial<CountDetail['lines'][number]> = {}): CountDetail['lines'][number] => ({
  id, inventoryId: `item-${id}`, name, batchNumber: `B-${id}`, expiryDate: '2027-06-30T00:00:00.000Z', unit: 'STRIPS', location: 'Rack A2',
  currentStock: 10, systemStock: 10, physicalStock: null, difference: null, unitCost: 12.5, value: null, note: '', retype: false, history: null, ...over,
});

const detail = (lines: CountDetail['lines']): CountDetail => ({
  id: 'count-1', reference: 'Stock count', day: '2026-11-06', origin: 'CYCLE', assignedTo: { id: 'anil', name: 'Anil Deshmukh' },
  signedBy: null, signedAt: null, decidedBy: null, decidedAt: null, items: lines.length, counted: 0, differences: 0, netUnits: 0, netValue: 0, shortUnits: 0, shortValue: 0, extraUnits: 0, extraValue: 0,
  state: 'ASSIGNED', version: 1, reason: '', signOffNote: '', decisionReason: '', selfApproval: false, lines,
  events: [], can: { count: true, decide: false, decideOwn: false }, approvers: [],
});

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body, text: async () => JSON.stringify(body) });

function serve(lines: CountDetail['lines'], patchStatus = 200) {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === COUNT_URL && init?.method === 'PATCH') return Promise.resolve(patchStatus === 200 ? reply(200, detail(lines)) : reply(patchStatus, { message: 'Server unavailable' }));
    if (url === COUNT_URL) return Promise.resolve(reply(200, detail(lines)));
    return Promise.resolve(reply(200, { today: '2026-11-06', settings: { enabled: true, cycleDays: 10, itemsPerPersonPerDay: 10, assigneeIds: ['anil'], cycleStart: '2026-11-01' }, settingsVersion: 1,
      cycle: { start: '2026-11-01', end: '2026-11-10', day: 6, days: 10, daysLeft: 5 }, forecast: { batches: 1, covered: 0, remaining: 1, people: 1, perDay: 10, capacity: 10, short: false, behind: false, message: '' },
      mine: [], approvals: null, canCount: true, canApprove: false, canConfigure: false, staff: [] }));
  }) as unknown as typeof fetch;
}

const pharmacist = { id: 'anil', branchId: 'branch', role: 'PHARMACIST', firstName: 'Anil', lastName: 'Deshmukh' } as unknown as User;

function Workspace() {
  const [params, setParams] = useState(() => new URLSearchParams('area=stock&view=COUNT&document=count-1'));
  const navigate = (changes: Record<string, string>) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      return next;
    });
  return (
    <DashboardUserProvider value={{ user: pharmacist, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <span data-testid="document">{params.get('document') ?? 'list'}</span>
      <StockCounts searchParams={params} navigate={navigate} onRegisterParams={() => {}} />
    </DashboardUserProvider>
  );
}

const settle = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
};

const field = () => screen.getByRole('textbox', { name: /^Counted quantity/ });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('shows the stock unit beside the system quantity, the count field and the difference', async () => {
  serve([line('a', 'Isotroin 10')]);
  render(<Workspace />);
  await settle();
  expect(screen.getByText('10 strips')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /^Counted quantity of Isotroin 10.*in strips$/ })).toBeInTheDocument();
  fireEvent.change(field(), { target: { value: '7' } });
  await settle();
  expect(screen.getByText(/^−3/)).toHaveTextContent('−3 strips');
});

it('focuses the first row that still needs typing again', async () => {
  serve([line('a', 'Counted one', { physicalStock: 5 }), line('b', 'Retype one', { physicalStock: 4, retype: true })]);
  render(<Workspace />);
  await settle();
  expect(screen.getByRole('textbox', { name: /^Counted quantity of Retype one/ })).toHaveFocus();
});

it('warns before Back when a count could not be saved, and stays if the person keeps counting', async () => {
  serve([line('a', 'Isotroin 10')], 500);
  render(<Workspace />);
  await settle();
  fireEvent.change(field(), { target: { value: '7' } });
  await settle(600);
  expect(screen.getByRole('status')).toHaveTextContent('Not saved');
  fireEvent.click(screen.getByRole('button', { name: 'Back to stock counts' }));
  await settle();
  expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await settle();
  expect(screen.getByTestId('document')).toHaveTextContent('count-1');
  fireEvent.click(screen.getByRole('button', { name: 'Back to stock counts' }));
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Leave and lose them' }));
  await settle();
  expect(screen.getByTestId('document')).toHaveTextContent('list');
});

it('goes back without a warning when everything is saved', async () => {
  serve([line('a', 'Isotroin 10')]);
  render(<Workspace />);
  await settle();
  fireEvent.change(field(), { target: { value: '7' } });
  await settle(600);
  fireEvent.click(screen.getByRole('button', { name: 'Back to stock counts' }));
  await settle();
  expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  expect(screen.getByTestId('document')).toHaveTextContent('list');
});
