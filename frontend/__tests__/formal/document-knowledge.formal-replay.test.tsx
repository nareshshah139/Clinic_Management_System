import { act, fireEvent, render, screen } from '@testing-library/react';
import { WorkflowDocumentEditor } from '@/components/inventory/WorkflowDocumentEditor';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import type { User } from '@/lib/types';

// Replay of verification/state-machines/document-knowledge, following TLC's path in
// results/code.md one block per model action. Only fetch is stubbed. The create POST is the
// request the server never answers; like a real fetch, it rejects once its signal aborts.

const DOCUMENTS_URL = '/api/inventory/workspace/documents';
const payload = { reason: 'Physical verification', date: '2026-10-25', lines: [{ id: 'line', inventoryId: 'batch', name: 'Batch A', unit: 'TABLET', systemStock: 5, physicalStock: 6, quantity: 1 }] };
const operator = { id: 'operator', branchId: 'branch', role: 'PHARMACIST' } as unknown as User;

function silentCreateServer() {
  const creates: AbortSignal[] = [];
  const reply = (body: unknown) => ({ ok: true, status: 200, headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body, text: async () => JSON.stringify(body) });
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === DOCUMENTS_URL && init?.method === 'POST') {
      const signal = init.signal as AbortSignal;
      creates.push(signal);
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError'))));
    }
    if (url.includes('/hold-sources')) return Promise.resolve(reply({ rows: [], totalPages: 1 }));
    return Promise.resolve(reply([]));
  }) as unknown as typeof fetch;
  return creates;
}

function Editor() {
  return (
    <DashboardUserProvider value={{ user: operator, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <WorkflowDocumentEditor
        kind="LOSS"
        draftKey="formal-replay"
        initial={{ requestKey: 'formal-replay-request', payload }}
        capabilities={{ approve: true, kinds: { LOSS: { read: true, write: true } } }}
        onBack={() => {}}
        onOpen={() => {}}
        onInvoice={() => {}}
      />
    </DashboardUserProvider>
  );
}

const settle = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
};

async function reloadThenSaveUnanswered() {
  const creates = silentCreateServer();
  const first = render(<Editor />);
  await settle();
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  first.unmount();
  render(<Editor />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await settle();
  expect(creates).toHaveLength(1);
  expect(screen.getByText('Outcome not confirmed')).toBeInTheDocument();
  await settle(600_000);
  return creates[0];
}

beforeEach(() => {
  jest.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
});

it('BusyEnds: ten minutes after a save the server never answers, Check saved status can be used', async () => {
  await reloadThenSaveUnanswered();
  expect(screen.getByRole('button', { name: 'Check saved status' })).toBeEnabled();
});
