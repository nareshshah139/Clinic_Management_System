import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { randomUUID } from 'crypto';
import PortalRecordsPage from '@/app/p/records/page';

if (!globalThis.crypto.randomUUID) Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID });

const replace = jest.fn();
const router = { replace };
jest.mock('next/navigation', () => ({ useRouter: () => router }));

const json = (status: number, body: unknown = {}) => Promise.resolve({ ok: status < 300, status, json: async () => body });
const SESSION = { profiles: [{ ref: 'r1', firstName: 'Asha', branch: 'Banjara Hills' }, { ref: 'r2', firstName: 'Ravi', branch: 'Kukatpally' }], chosen: 'r1' };
const RX = { status: 'ACTIVE', language: 'EN', items: [{ drugName: 'Clobetasol', dosage: '0.05', dosageUnit: '%', frequency: 'BD', duration: 14, durationUnit: 'DAYS', applicationSite: 'Elbows', instructions: 'Thin layer' }], instructions: 'Avoid hot showers', writtenAt: '2026-11-14T05:00:00Z' };
const THREAD = [
  { id: 'm1', from: 'patient', channel: 'WHATSAPP', body: 'Still itchy', photo: false, at: '2026-11-20T05:00:00Z' },
  { id: 'm2', from: 'clinic', channel: 'PORTAL', body: 'Keep using the cream', photo: false, at: '2026-11-21T05:00:00Z' },
];
const HOME = {
  profile: { firstName: 'Asha', branch: 'Banjara Hills' },
  nextAppointment: { date: '2026-11-27T00:00:00Z', slot: '10:30-10:45', status: 'SCHEDULED', doctor: 'Dr. Meera Rao', branch: 'Banjara Hills' },
  openCheckIns: [{ id: 'c1', title: { EN: 'Symptom check', TE: 'లక్షణాల పరిశీలన', HI: 'लक्षण जाँच' }, closesAt: '2026-12-10T14:30:00Z' }],
  latestPrescription: { ...RX, date: '2026-11-14T05:00:00Z', doctor: 'Dr. Meera Rao' },
  messages: THREAD,
};

describe('portal records page (PP-61, PP-63, PP-65, PP-60)', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    replace.mockClear();
  });
  const urls = () => fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`);
  const signedIn = async (home: unknown = HOME) => {
    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockReturnValueOnce(json(200, home));
    render(<PortalRecordsPage />);
    await screen.findByText('Next appointment');
  };

  it('opens on home: next appointment, open check-ins, latest prescription from its items, and recent messages', async () => {
    await signedIn();
    expect(screen.getByTestId('portal-name')).toHaveTextContent('Hello Asha');
    expect(screen.getByText(/10:30-10:45/)).toHaveTextContent('Dr. Meera Rao');
    expect(screen.getByText('Symptom check')).toBeInTheDocument();
    expect(screen.getByTestId('prescription')).toHaveTextContent('Clobetasol 0.05% · BD · 14 days · Elbows · Thin layer');
    expect(screen.getByText('Avoid hot showers')).toBeInTheDocument();
    expect(within(screen.getByTestId('thread')).getByText('Keep using the cream')).toBeInTheDocument();
    expect(urls()).toEqual(['GET /api/portal/session', 'GET /api/portal/records/home']);
  });

  it('shows the profile switch only when the phone has several people, and reloads for the one chosen', async () => {
    await signedIn();
    const sw = screen.getByTestId('profile-switch');
    fetchMock.mockReturnValueOnce(json(200, { ...SESSION, chosen: 'r2' })).mockReturnValueOnce(json(200, { ...SESSION, chosen: 'r2' })).mockReturnValueOnce(json(200, { ...HOME, profile: { firstName: 'Ravi', branch: 'Kukatpally' }, latestPrescription: null, messages: [] }));
    await act(async () => fireEvent.click(within(sw).getByRole('button', { name: /Ravi/ })));
    await screen.findByText('No prescription yet.');
    expect(screen.getByTestId('portal-name')).toHaveTextContent('Hello Ravi');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ ref: 'r2' });

    fetchMock.mockReset().mockReturnValueOnce(json(200, { profiles: [SESSION.profiles[0]], chosen: 'r1' })).mockReturnValueOnce(json(200, HOME));
    render(<PortalRecordsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getAllByTestId('profile-switch')).toHaveLength(1);
  });

  it('reads appointments, prescriptions and check-in history from their own views', async () => {
    await signedIn();
    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockReturnValueOnce(json(200, { upcoming: [HOME.nextAppointment] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Appointments' })));
    expect(await screen.findByTestId('appointments')).toHaveTextContent('10:30-10:45');

    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockReturnValueOnce(json(200, { visits: [{ id: 'v1', date: RX.writtenAt, doctor: 'Dr. Meera Rao', prescription: RX }, { id: 'v2', date: RX.writtenAt, doctor: 'Dr. Meera Rao', prescription: null }] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prescriptions' })));
    const visits = await screen.findByTestId('visits');
    expect(visits).toHaveTextContent('Clobetasol 0.05%');
    expect(visits).toHaveTextContent('No prescription yet.');

    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockReturnValueOnce(json(200, { checkIns: [
      { id: 'c0', title: HOME.openCheckIns[0].title, state: 'ANSWERED', opensAt: RX.writtenAt, closesAt: RX.writtenAt, endedAt: null, response: { submittedAt: RX.writtenAt, photos: 2, answers: [{ prompt: { EN: 'How bad?', TE: 'ఎంత?', HI: 'कितना?' }, answer: 3 }, { prompt: { EN: 'Change?', TE: 'మార్పు?', HI: 'बदलाव?' }, answer: { EN: 'Same', TE: 'అలాగే', HI: 'वैसा ही' } }] } },
      { id: 'c1', title: HOME.openCheckIns[0].title, state: 'MISSED', opensAt: RX.writtenAt, closesAt: RX.writtenAt, endedAt: null, response: null },
    ] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check-ins' })));
    const list = await screen.findByTestId('check-ins');
    expect(list).toHaveTextContent('How bad?3');
    expect(list).toHaveTextContent('Change?Same');
    expect(list).toHaveTextContent('2 photo(s) sent');
    expect(list).toHaveTextContent('Not answered');
    fireEvent.click(screen.getByRole('button', { name: 'తెలుగు' }));
    expect(list).toHaveTextContent('మార్పు?అలాగే');
    expect(urls().slice(2).filter((u) => u !== 'GET /api/portal/session')).toEqual(['GET /api/portal/records/appointments', 'GET /api/portal/records/visits', 'GET /api/portal/records/check-ins']);
  });

  it('writes to the clinic with one key per message, keeps the key for a retry, and shows the staff reply in the thread', async () => {
    await signedIn();
    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockReturnValueOnce(json(200, { messages: THREAD }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Messages' })));
    await screen.findByLabelText('Write to the clinic');
    fireEvent.change(screen.getByLabelText('Write to the clinic'), { target: { value: 'Can I come Friday?' } });
    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockRejectedValueOnce(new TypeError('offline'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(await screen.findByTestId('send-error')).toHaveTextContent('Could not reach the clinic');
    expect(screen.getByLabelText('Write to the clinic')).toHaveValue('Can I come Friday?');
    const reply = { id: 'm4', from: 'clinic', channel: 'PORTAL', body: 'Yes, Friday works', photo: false, at: '2026-11-22T06:00:00Z' };
    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockReturnValueOnce(json(200, { messages: [...THREAD, { id: 'm3', from: 'patient', channel: 'PORTAL', body: 'Can I come Friday?', photo: false, at: '2026-11-22T05:00:00Z' }, reply] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    const thread = screen.getByTestId('thread');
    expect(within(thread).getByText('Yes, Friday works').closest('li')).toHaveAttribute('data-from', 'clinic');
    expect(screen.getByLabelText('Write to the clinic')).toHaveValue('');
    const [first, second] = fetchMock.mock.calls.filter(([url, init]) => url === '/api/portal/records/messages' && init.method === 'POST').map(([url, init]) => ({ url, method: init.method, body: JSON.parse(init.body) }));
    expect(first).toEqual(second);
    expect(first).toMatchObject({ url: '/api/portal/records/messages', method: 'POST', body: { body: 'Can I come Friday?' } });
    expect(first.body.clientKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('an edited message after a failed send gets a new key, and a profile chosen in another tab stops the send', async () => {
    await signedIn();
    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockReturnValueOnce(json(200, { messages: THREAD }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Messages' })));
    fireEvent.change(await screen.findByLabelText('Write to the clinic'), { target: { value: 'Friday?' } });
    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockRejectedValueOnce(new TypeError('offline'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    await screen.findByTestId('send-error');
    fireEvent.change(screen.getByLabelText('Write to the clinic'), { target: { value: 'Friday at 10?' } });
    fetchMock.mockReturnValueOnce(json(200, SESSION)).mockReturnValueOnce(json(200, { messages: THREAD }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    const posts = fetchMock.mock.calls.filter(([url, init]) => url === '/api/portal/records/messages' && init.method === 'POST').map(([, init]) => JSON.parse(init.body));
    expect(posts.map((b) => b.body)).toEqual(['Friday?', 'Friday at 10?']);
    expect(posts[0].clientKey).not.toBe(posts[1].clientKey);

    fireEvent.change(screen.getByLabelText('Write to the clinic'), { target: { value: 'For Asha' } });
    fetchMock.mockReturnValueOnce(json(200, { ...SESSION, chosen: 'r2' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(screen.getByTestId('send-error')).toHaveTextContent('Another person was chosen in another window');
    expect(screen.getByLabelText('Write to the clinic')).toHaveValue('For Asha');
    expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/portal/records/messages' && init.method === 'POST')).toHaveLength(2);
  });

  it('stays signed in and says so when the sign-out request never reaches the clinic', async () => {
    await signedIn();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(await screen.findByText('Could not sign you out. Check your connection and try again.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith('/p');
  });

  it('a prescription line prefers the dose pattern and keeps amount, wash-off, taper and pulse details', async () => {
    const item = { drugName: 'Clobetasol', frequency: 'BD', dosePattern: '1-0-1', applicationAmount: '1 FTU', washOffAfterMinutes: 30, taperSchedule: 'Halve weekly', pulseRegimen: 'Week 1 of 4' };
    await signedIn({ ...HOME, latestPrescription: { ...HOME.latestPrescription, items: [item] } });
    const text = screen.getByTestId('prescription').textContent!;
    expect(text).toContain('1-0-1 · BD');
    ['1 FTU', '30 min', 'Halve weekly', 'Week 1 of 4'].forEach((part) => expect(text).toContain(part));
  });

  it('a profile switched in another tab moves the header with the next view', async () => {
    await signedIn();
    fetchMock.mockReturnValueOnce(json(200, { ...SESSION, chosen: 'r2' })).mockReturnValueOnce(json(200, { upcoming: [] }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Appointments' })));
    expect(screen.getByTestId('portal-name')).toHaveTextContent('Hello Ravi');
  });

  it('goes back to sign-in when the session is gone, and signs out here or everywhere (PP-60)', async () => {
    fetchMock.mockReturnValueOnce(json(401)).mockReturnValueOnce(json(401));
    render(<PortalRecordsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/p'));

    replace.mockClear();
    await signedIn();
    fetchMock.mockReturnValueOnce(json(401)).mockReturnValueOnce(json(401));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Appointments' })));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/p'));

    replace.mockClear();
    fetchMock.mockReturnValueOnce(json(200, { signedOut: true }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out on every device' })));
    expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/portal/auth/sign-out-everywhere');
    expect(replace).toHaveBeenCalledWith('/p');
  });
});
