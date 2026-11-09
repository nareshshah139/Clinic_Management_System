import { render, screen } from '@testing-library/react';
import { WorkflowDocumentEditor } from '@/components/inventory/WorkflowDocumentEditor';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'operator', branchId: 'branch' } }) }));

afterAll(() => jest.useRealTimers());

it('dates a new document with the clinic day, not the UTC day, just after midnight in India', async () => {
  jest.useFakeTimers({ now: new Date('2026-11-05T20:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
  (apiClient.get as jest.Mock).mockResolvedValue([]);
  render(<WorkflowDocumentEditor kind="LOSS" capabilities={{ approve: true, kinds: { LOSS: { read: true, write: true } } }} onBack={jest.fn()} onOpen={jest.fn()} onInvoice={jest.fn()} />);
  expect(await screen.findByDisplayValue('LOSS-2026-11-06')).toBeInTheDocument();
  expect(screen.getByDisplayValue('2026-11-06')).toBeInTheDocument();
});
