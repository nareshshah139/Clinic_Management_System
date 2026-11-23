import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { StockCounts } from '@/components/inventory/counts/StockCounts';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import type { CountDetail } from '@/components/inventory/counts/count-model';
import type { User } from '@/lib/types';

const COUNT_URL = '/api/inventory/workspace/reconciliation/counts/count-1';
const OTHER_WINDOW_COUNT = 9;

type Pending = { body: { version: number; lines: { physicalStock: number | null }[] }; signal: AbortSignal; release: () => void };

function countServer() {
  const server = { version: 1, stock: null as number | null, holdPatches: false, patches: [] as Pending[], gets: 0 };
  const detail = (): CountDetail => ({
    id: 'count-1', reference: 'Stock count 06/11/2026 · Anil Deshmukh', day: '2026-11-06', origin: 'CYCLE', assignedTo: { id: 'anil', name: 'Anil Deshmukh' },
    signedBy: null, signedAt: null, decidedBy: null, decidedAt: null, items: 1, counted: server.stock === null ? 0 : 1, differences: 0, netUnits: 0, netValue: 0, shortUnits: 0, shortValue: 0, extraUnits: 0, extraValue: 0,
    state: 'ASSIGNED', version: server.version, reason: 'Stock reconciliation cycle', signOffNote: '', decisionReason: '', selfApproval: false,
    lines: [{ id: 'a', inventoryId: 'item-a', name: 'Isotroin 10', batchNumber: 'B-a', expiryDate: '2027-06-30T00:00:00.000Z', unit: 'STRIPS', location: 'Rack A2',
      currentStock: 10, systemStock: 10, physicalStock: server.stock, difference: null, unitCost: 12.5, value: null, note: '', retype: false, history: null }],
    events: [], can: { count: true, decide: false, decideOwn: false }, approvers: [],
  });
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body, text: async () => JSON.stringify(body) });
  const answerPatch = (body: Pending['body']) => {
    if (body.version !== server.version) return reply(409, { message: 'This count changed in another window. Reload to see the latest counts.' });
    server.stock = body.lines[0].physicalStock;
    server.version += 1;
    return reply(200, detail());
  };
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === COUNT_URL && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      if (!server.holdPatches) return Promise.resolve(answerPatch(body));
      return new Promise((resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        server.patches.push({ body, signal, release: () => resolve(answerPatch(body)) });
      });
    }
    if (url === COUNT_URL) {
      server.gets += 1;
      return Promise.resolve(reply(200, detail()));
    }
    return Promise.resolve(reply(200, { today: '2026-11-06', settings: { enabled: true, cycleDays: 10, itemsPerPersonPerDay: 10, assigneeIds: ['anil'], cycleStart: '2026-11-01' }, settingsVersion: 1,
      cycle: { start: '2026-11-01', end: '2026-11-10', day: 6, days: 10, daysLeft: 5 }, forecast: { batches: 1, covered: 0, remaining: 1, people: 1, perDay: 10, capacity: 10, short: false, behind: false, message: '' },
      mine: [], approvals: null, canCount: true, canApprove: false, canConfigure: false, staff: [] }));
  }) as unknown as typeof fetch;
  return server;
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
const field = () => screen.getByRole('textbox', { name: /^Counted quantity of Isotroin 10/ });
const type = async (value: string) => {
  fireEvent.change(field(), { target: { value } });
  await settle();
};
const indicator = () => screen.getByRole('status');
const patchesSent = () => (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => String(url) === COUNT_URL && init?.method === 'PATCH');

async function openSheet() {
  const server = countServer();
  render(<Workspace />);
  await settle();
  expect(field()).toHaveValue('');
  return server;
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

async function typeBadCount() {
  await openSheet();
  await type('7x');
}

it('SavedMeansSaved: a count typed a moment ago is not shown as saved', async () => {
  await typeBadCount();
  expect(indicator()).toHaveTextContent('Saving…');
});

async function typeThenGoBack() {
  await openSheet();
  await type('7');
  fireEvent.click(screen.getByRole('button', { name: 'Back to stock counts' }));
  await settle(10_000);
}

it('NoDropOnLeave: a count typed just before going back to the list is still sent', async () => {
  await typeThenGoBack();
  expect(patchesSent().map(([, init]) => JSON.parse(init.body).lines[0].physicalStock)).toEqual([7]);
});

async function staleSaveThenBadCount() {
  const server = await openSheet();
  server.version = 2;
  server.stock = OTHER_WINDOW_COUNT;
  await type('7');
  server.holdPatches = true;
  await settle(600);
  expect(server.patches).toHaveLength(1);
  expect(indicator()).toHaveTextContent('Saving…');
  server.patches.shift()!.release();
  await settle();
  expect(server.gets).toBe(2);
  expect(field()).toHaveValue(String(OTHER_WINDOW_COUNT));
  expect(indicator()).toHaveTextContent('Saved');
  await type('8');
  await settle(600);
  expect(server.patches).toHaveLength(1);
  await type('8x');
  server.patches.shift()!.release();
  await settle();
  expect(server.stock).toBe(8);
  await settle(600);
  await settle(120_000);
  return server;
}

it('LeavesSaving: after the server answers, the sheet stops saying Saving even with a bad count on screen', async () => {
  await staleSaveThenBadCount();
  expect(indicator()).toHaveTextContent('Not saved');
});

async function unansweredSaveThenGoBack() {
  const server = await openSheet();
  server.version = 2;
  server.stock = OTHER_WINDOW_COUNT;
  await type('x');
  await type('6');
  await type('7');
  server.holdPatches = true;
  await settle(600);
  expect(server.patches).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Back to stock counts' }));
  await settle(600_000);
  return server.patches[0];
}

it('SaveRequestEnds: a save the server never answers is given up within ten minutes', async () => {
  const hung = await unansweredSaveThenGoBack();
  expect(hung.signal.aborted).toBe(true);
});
