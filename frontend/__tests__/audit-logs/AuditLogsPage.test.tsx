import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AuditLogsPage from '@/app/dashboard/audit-logs/page';
import { apiClient } from '@/lib/api';
import type { AuditEntry } from '@/components/audit-logs/audit-log-model';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import type { User } from '@/lib/types';

const renderPage = (role = 'OWNER') =>
  render(
    <DashboardUserProvider value={{ user: { id: 'me', role } as unknown as User, loading: false, refresh: jest.fn(), logout: jest.fn() }}>
      <AuditLogsPage />
    </DashboardUserProvider>,
  );

let mockQuery = '';
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockQuery),
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
jest.mock('@/lib/api', () => ({ apiClient: { get: jest.fn() } }));

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  id: 'log-1',
  userId: 'user-asha',
  action: 'UPDATE',
  entity: 'Patient',
  entityId: 'pat-1',
  oldValues: null,
  newValues: null,
  ipAddress: '10.0.0.4',
  timestamp: '2026-11-05T09:00:00.000Z',
  ...overrides,
});

const ENTRIES: AuditEntry[] = [
  entry({
    id: 'log-void',
    entity: 'NewInvoice',
    entityId: 'bill-7',
    action: 'UPDATEMANY',
    newValues: JSON.stringify({ status: 'CANCELLED', metadata: JSON.stringify({ void: { reason: 'Duplicate bill' } }) }),
  }),
  entry({
    id: 'log-procedures',
    userId: 'user-ravi',
    action: 'PROCEDURE_ACCESS_UPDATED',
    entity: 'Branch',
    oldValues: JSON.stringify({ recordRoles: ['DOCTOR'] }),
    newValues: JSON.stringify({ recordRoles: ['DOCTOR', 'NURSE'] }),
  }),
  entry({
    id: 'log-phone',
    userId: 'user-gone',
    oldValues: JSON.stringify({ id: 'pat-1', phone: '98765', name: 'Meera Shah', updatedAt: '2026-11-01T00:00:00.000Z' }),
    newValues: JSON.stringify({ id: 'pat-1', phone: '91234', name: 'Meera Shah', updatedAt: '2026-11-05T09:00:00.000Z' }),
  }),
];

const get = jest.mocked(apiClient.get);
const listCalls = () => get.mock.calls.filter(([url]) => url === '/audit-logs');
const lastList = () => listCalls()[listCalls().length - 1][1] as Record<string, unknown>;

function serve({ denied = false } = {}) {
  get.mockImplementation(async (url: string) => {
    if (url === '/audit-logs') {
      if (denied) throw Object.assign(new Error('Forbidden'), { status: 403 });
      return { data: ENTRIES, pagination: { page: 1, limit: 50, total: 3, totalPages: 1 } };
    }
    if (url === '/audit-logs/statistics') {
      return {
        actionBreakdown: [{ action: 'UPDATE' }, { action: 'PROCEDURE_ACCESS_UPDATED' }, { action: 'UPDATEMANY' }],
        entityBreakdown: [{ entity: 'NewInvoice' }, { entity: 'Patient' }],
      };
    }
    if (url === '/users') {
      return { users: [{ id: 'user-asha', firstName: 'Asha', lastName: 'Rao' }, { id: 'user-ravi', firstName: 'Ravi', lastName: 'Kumar' }] };
    }
    throw new Error(`unexpected ${url}`);
  });
}

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-06T06:00:00.000Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockQuery = '';
  jest.clearAllMocks();
  serve();
});

const table = () => within(screen.getByRole('table', { name: 'Audit log' }));

it('lists this financial year’s changes newest first, in plain words with who made them', async () => {
  renderPage();
  expect(await table().findByRole('button', { name: 'Voided bill, show details' })).toBeInTheDocument();
  expect(lastList()).toMatchObject({
    page: 1,
    startDate: '2026-04-01T00:00:00.000+05:30',
    endDate: '2027-03-31T23:59:59.999+05:30',
    sortBy: 'timestamp',
    sortOrder: 'desc',
  });
  await waitFor(() => expect(table().getAllByText('Asha Rao')).toHaveLength(1));
  const rows = table().getAllByRole('row').slice(1).map((row) => row.textContent);
  expect(rows[1]).toContain('Ravi Kumar');
  expect(rows[1]).toContain('Changed who can record procedures');
  expect(rows[2]).toContain('Former staff member');
  expect(rows[2]).toContain('Changed patient');
  expect(rows[2]).toContain('Phone');
  expect(rows[2]).not.toContain('Updated at');
  expect(screen.queryByText(/PROCEDURE_ACCESS_UPDATED|UPDATEMANY|NewInvoice|\{"/)).not.toBeInTheDocument();
  expect(screen.getByText('3 changes')).toBeInTheDocument();
});

it('opens an entry to show each changed field before and after', async () => {
  renderPage();
  fireEvent.click(await table().findByRole('button', { name: 'Changed patient, show details' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Changed patient' }));
  const phone = dialog.getByText('Phone').closest('li')!;
  expect(within(phone).getByText('Before').nextSibling).toHaveTextContent('98765');
  expect(within(phone).getByText('After').nextSibling).toHaveTextContent('91234');
  expect(dialog.queryByText('Name')).not.toBeInTheDocument();
  expect(dialog.getByText('10.0.0.4')).toBeInTheDocument();
});

it('shows why a bill was voided rather than its stored data', async () => {
  renderPage();
  fireEvent.click(await table().findByRole('button', { name: 'Voided bill, show details' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Voided bill' }));
  expect(dialog.getByText('Status').closest('li')).toHaveTextContent('Set toCancelled');
  expect(dialog.getByText('Metadata › Void › Reason').closest('li')).toHaveTextContent('Duplicate bill');
});

it('filters by who, what happened and record, offering each in plain words', async () => {
  renderPage();
  await table().findByRole('button', { name: 'Voided bill, show details' });
  const who = await screen.findByRole('combobox', { name: 'Who' });
  await waitFor(() => expect(within(who).getAllByRole('option').map((o) => o.textContent)).toEqual(['Anyone', 'Asha Rao', 'Ravi Kumar']));
  fireEvent.change(who, { target: { value: 'user-ravi' } });
  await waitFor(() => expect(lastList()).toMatchObject({ userId: 'user-ravi', page: 1 }));

  const what = screen.getByRole('combobox', { name: 'What happened' });
  await waitFor(() =>
    expect(within(what).getAllByRole('option').map((o) => o.textContent)).toEqual(['Anything', 'Changed', 'Changed who can record procedures', 'Changed, several at once']),
  );
  fireEvent.change(what, { target: { value: 'PROCEDURE_ACCESS_UPDATED' } });
  await waitFor(() => expect(lastList()).toMatchObject({ action: 'PROCEDURE_ACCESS_UPDATED' }));

  const record = screen.getByRole('combobox', { name: 'Record' });
  expect(within(record).getAllByRole('option').map((o) => o.textContent)).toEqual(['Any record', 'Bill', 'Patient']);
  fireEvent.change(record, { target: { value: 'NewInvoice' } });
  await waitFor(() => expect(lastList()).toMatchObject({ entity: 'NewInvoice' }));
  expect(mockReplace).toHaveBeenLastCalledWith('/dashboard/audit-logs?user=user-ravi&action=PROCEDURE_ACCESS_UPDATED&record=NewInvoice', { scroll: false });
});

it('tells a role the server refuses that it has no access, without a broken table', async () => {
  serve({ denied: true });
  renderPage();
  expect(await screen.findByText('You don’t have access to the audit log.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('tells a doctor who opens the address directly that the audit log is not theirs, without loading it', async () => {
  renderPage('DOCTOR');
  expect(await screen.findByText('You don’t have access to the audit log.')).toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith('/audit-logs', expect.anything());
});
