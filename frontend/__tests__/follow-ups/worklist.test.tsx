import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WorklistItemDetailView } from '@/components/follow-ups/item-detail';
import { FollowUpsWorkspace } from '@/components/follow-ups/workspace';
import type { WorklistItemDetail } from '@/lib/follow-ups';

const api = {
  getWorklistItem: jest.fn(),
  worklistAction: jest.fn(),
  resolveWorklistItem: jest.fn(),
  replyToPatient: jest.fn(),
  logPatientCall: jest.fn(),
  assignPatientMessage: jest.fn(),
  confirmPatientMessage: jest.fn(),
  getPatients: jest.fn(),
  getWorklistItems: jest.fn(),
  getWaitingCheckIns: jest.fn(),
  getMessageThreads: jest.fn(),
};
jest.mock('@/lib/api', () => ({ apiClient: new Proxy({}, { get: (_t, k: string) => (...args: unknown[]) => (api as any)[k](...args) }) }));
const mockReplace = jest.fn();
let mockQuery = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/dashboard/follow-ups',
  useSearchParams: () => new URLSearchParams(mockQuery),
}));
jest.mock('@/components/layout/dashboard-user-context', () => ({ useDashboardUser: () => ({ user: { id: 'doc', role: 'DOCTOR' } }) }));

const base: WorklistItemDetail = {
  id: 'item1', kind: 'PATIENT_MESSAGE', state: 'OPEN', priority: 'URGENT', reason: 'new-message',
  patient: { id: 'p1', name: 'Lakshmi Rao' }, phoneE164: '+919100000001', claimedBy: null,
  createdAt: '2026-11-24T04:00:00.000Z', lastEventAt: '2026-11-24T04:00:00.000Z', ageMinutes: 135,
  resolutionCode: null, resolutionNote: null, resolvedBy: null, resolvedAt: null, canResolve: true,
  checkIn: null, response: null, earlierResponses: [],
  thread: [{
    id: 'm1', direction: 'INBOUND', channel: 'WHATSAPP', kind: 'text', body: 'It <b>burns</b> <img src=x onerror=alert(1)>', hasMedia: false, photos: [],
    assignment: 'EXACT', patient: { id: 'p1', name: 'Lakshmi Rao' }, phoneE164: '+919100000001', authorKind: 'patient', author: null, readAt: null,
    createdAt: '2026-11-24T04:00:00.000Z', delivery: null,
  }],
  reply: { canReply: true, windowClosesAt: '2026-11-25T04:00:00.000Z' },
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.worklistAction.mockResolvedValue({});
  mockReplace.mockReset();
  mockQuery = '';
});

describe('item detail', () => {
  it('renders patient text as plain text, never as markup (PP-54)', async () => {
    api.getWorklistItem.mockResolvedValue(base);
    const { container } = render(<WorklistItemDetailView itemId="item1" currentUserId="doc" onChanged={jest.fn()} />);
    expect(await screen.findByText('It <b>burns</b> <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Message thread' })).queryByRole('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    await waitFor(() => expect(api.worklistAction).toHaveBeenCalledWith('item1', 'read'));
  });

  it('inside the window sends the reply with an idempotency key (PP-51)', async () => {
    api.getWorklistItem.mockResolvedValue(base);
    api.replyToPatient.mockResolvedValue({ outcome: 'sent', delivery: { state: 'SENT', outcome: null }, item: { ...base, thread: [...base.thread, { ...base.thread[0], id: 'm2', direction: 'OUTBOUND', body: 'Come tomorrow', author: 'Meera Rao', authorKind: 'staff', delivery: { state: 'SENT', outcome: null } }] } });
    render(<WorklistItemDetailView itemId="item1" currentUserId="doc" onChanged={jest.fn()} />);
    fireEvent.change(await screen.findByLabelText('Reply on WhatsApp'), { target: { value: 'Come tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByText('Reply sent.');
    expect(api.replyToPatient).toHaveBeenCalledWith('item1', 'Come tomorrow', expect.stringMatching(/^reply-item1-[0-9a-f]{24}$/));
    expect(screen.getByText('Reply from Meera Rao')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  it('keeps the draft and says so when WhatsApp rejects the reply (PP-51)', async () => {
    api.getWorklistItem.mockResolvedValue(base);
    api.replyToPatient.mockResolvedValue({ outcome: 'failed', delivery: { state: 'FAILED', outcome: 'rejected:400:131047' }, item: base });
    render(<WorklistItemDetailView itemId="item1" currentUserId="doc" onChanged={jest.fn()} />);
    fireEvent.change(await screen.findByLabelText('Reply on WhatsApp'), { target: { value: 'Come tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText(/WhatsApp did not take the reply \(rejected:400:131047\)/)).toBeInTheDocument();
    expect(screen.queryByText('Reply sent.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reply on WhatsApp')).toHaveValue('Come tomorrow');
  });

  it('retries a reply whose response was lost with the same idempotency key (PP-51)', async () => {
    api.getWorklistItem.mockResolvedValue(base);
    api.replyToPatient.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({ outcome: 'sent', delivery: { state: 'SENT', outcome: null }, item: base });
    render(<WorklistItemDetailView itemId="item1" currentUserId="doc" onChanged={jest.fn()} />);
    fireEvent.change(await screen.findByLabelText('Reply on WhatsApp'), { target: { value: 'Come tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(api.replyToPatient).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send reply' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByText('Reply sent.');
    expect(api.replyToPatient.mock.calls[1][2]).toBe(api.replyToPatient.mock.calls[0][2]);
  });

  it('with the window closed but the portal on, the reply goes to the portal and says so (PP-65)', async () => {
    const portal = { ...base, reply: { canReply: true as const, via: 'portal' as const, message: 'The WhatsApp window is closed. Your reply goes to the patient portal, and the patient gets a WhatsApp notice to read it there.' } };
    api.getWorklistItem.mockResolvedValue(portal);
    api.replyToPatient.mockResolvedValue({ outcome: 'sent', delivery: { state: 'SENT', outcome: null }, item: portal });
    render(<WorklistItemDetailView itemId="item1" currentUserId="doc" onChanged={jest.fn()} />);
    expect(await screen.findByTestId('reply-via-portal')).toHaveTextContent('Your reply goes to the patient portal');
    expect(screen.queryByText(/reply window closes/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Reply in the patient portal'), { target: { value: 'Come tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByText('Reply sent.');
    expect(api.replyToPatient).toHaveBeenCalledWith('item1', 'Come tomorrow', expect.stringMatching(/^reply-item1-/));
  });

  it('with the window closed says why and offers "log a call" in place of the reply box', async () => {
    api.getWorklistItem.mockResolvedValue({ ...base, reply: { canReply: false, reason: 'window-closed', message: 'The patient has not written in the last 24 hours, so WhatsApp allows no free-text reply.' } });
    api.logPatientCall.mockResolvedValue({ ...base, reply: { canReply: false, reason: 'window-closed', message: 'x' } });
    render(<WorklistItemDetailView itemId="item1" currentUserId="doc" onChanged={jest.fn()} />);
    expect(await screen.findByTestId('reply-blocked')).toHaveTextContent('not written in the last 24 hours');
    expect(screen.queryByLabelText('Reply on WhatsApp')).toBeNull();
    fireEvent.change(screen.getByLabelText('Log a call'), { target: { value: 'Called, no answer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log a call' }));
    await waitFor(() => expect(api.logPatientCall).toHaveBeenCalledWith('item1', 'Called, no answer'));
  });

  it('lets reception claim an urgent item but not resolve it (open decision 9)', async () => {
    api.getWorklistItem.mockResolvedValue({ ...base, canResolve: false });
    api.worklistAction.mockImplementation((_id: string, action: string) => Promise.resolve(action === 'claim' ? { ...base, canResolve: false, state: 'CLAIMED', claimedBy: { id: 'rec', name: 'Sunita Patil' } } : {}));
    render(<WorklistItemDetailView itemId="item1" currentUserId="rec" onChanged={jest.fn()} />);
    expect(await screen.findByTestId('resolve-blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }));
    expect(await screen.findByText('You are working on this')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
  });

  it('resolves with an outcome and a note', async () => {
    api.getWorklistItem.mockResolvedValue(base);
    api.resolveWorklistItem.mockResolvedValue({ ...base, state: 'RESOLVED', resolvedBy: { id: 'doc', name: 'Meera Rao' }, resolutionCode: 'CALLED', resolutionNote: 'Spoke to her' });
    render(<WorklistItemDetailView itemId="item1" currentUserId="doc" onChanged={jest.fn()} />);
    const button = await screen.findByRole('button', { name: 'Resolve' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'CALLED' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Spoke to her' } });
    fireEvent.click(button);
    await waitFor(() => expect(api.resolveWorklistItem).toHaveBeenCalledWith('item1', 'CALLED', 'Spoke to her'));
    expect(await screen.findByTestId('item-state')).toHaveTextContent('Resolved by Meera Rao');
  });

  it('assigns an unknown sender\'s message to a patient found by search (PP-52)', async () => {
    const unknown = { ...base, patient: null, thread: [{ ...base.thread[0], body: 'New number', assignment: 'UNASSIGNED' as const, patient: null }], reply: { canReply: false as const, reason: 'unknown-sender', message: 'Assign first.' } };
    api.getWorklistItem.mockResolvedValue(unknown);
    api.getPatients.mockResolvedValue({ data: [{ id: 'p9', name: 'Ravi Kumar', phone: '9100000009' }] });
    api.assignPatientMessage.mockResolvedValue({ messageId: 'm1', patientId: 'p9', itemId: 'item9' });
    render(<WorklistItemDetailView itemId="item1" currentUserId="doc" onChanged={jest.fn()} />);
    expect(await screen.findByText('Unknown sender +919100000001')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Assign to a patient'), { target: { value: 'Ravi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to Ravi Kumar' }));
    await waitFor(() => expect(api.assignPatientMessage).toHaveBeenCalledWith('m1', 'p9'));
  });
});

describe('Follow-ups workspace', () => {
  it('lists items in server order with their age, and opens one in place', async () => {
    api.getWorklistItems.mockResolvedValue([
      { ...base, id: 'a', ageMinutes: 135 },
      { ...base, id: 'b', priority: 'NORMAL', kind: 'MISSED_CHECK_IN', patient: { id: 'p2', name: 'Anil Shah' }, ageMinutes: 3000 },
    ]);
    api.getWaitingCheckIns.mockResolvedValue([{ checkInId: 'c1', stepKey: 'day3', patient: { id: 'p2', name: 'Anil Shah' }, plan: 'Two-week skin check', opensAt: '2026-11-24T03:30:00.000Z', closesAt: '2026-11-25T14:30:00.000Z', closesInMinutes: 100, delivery: { purpose: 'CHECK_IN_OPENED', state: 'DELIVERED', outcome: null, sentAt: null } }]);
    api.getMessageThreads.mockResolvedValue([]);
    render(<FollowUpsWorkspace />);
    const list = await screen.findByRole('list', { name: 'Items that need attention' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Lakshmi Rao2 hPatient message'),
      expect.stringContaining('Anil Shah2 dMissed check-in'),
    ]);
    expect(screen.getByRole('tab', { name: 'Needs attention (2)' })).toBeInTheDocument();
    fireEvent.click(rows[1]);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/follow-ups?item=b', { scroll: false });
  });

  it('shows the delivery state of each open check-in under "Waiting on patient"', async () => {
    mockQuery = 'tab=waiting';
    api.getWorklistItems.mockResolvedValue([]);
    api.getWaitingCheckIns.mockResolvedValue([{ checkInId: 'c1', stepKey: 'day3', patient: { id: 'p2', name: 'Anil Shah' }, plan: 'Two-week skin check', opensAt: '2026-11-24T03:30:00.000Z', closesAt: '2026-11-25T14:30:00.000Z', closesInMinutes: 100, delivery: { purpose: 'CHECK_IN_OPENED', state: 'DELIVERED', outcome: null, sentAt: null } }]);
    api.getMessageThreads.mockResolvedValue([]);
    render(<FollowUpsWorkspace />);
    const list = await screen.findByRole('list', { name: 'Open check-ins' });
    expect(list).toHaveTextContent('Anil Shah');
    expect(list).toHaveTextContent('Delivered');
  });
});

it('no follow-up screen renders HTML from data (PP-54)', () => {
  const dir = path.resolve(__dirname, '../../src/components/follow-ups');
  const offenders = fs.readdirSync(dir).filter((f) => /dangerouslySetInnerHTML|innerHTML|react-markdown|marked\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  expect(offenders).toEqual([]);
});
