import { UserRole } from '@cms/shared-types';
import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { VoiceBar } from '@/components/voice/VoiceBar';
import { VoiceBarProvider, useVoiceBarForm } from '@/components/voice/VoiceBarProvider';
import { apiClient } from '@/lib/api';
import type { User } from '@/lib/types';
import { resetVoiceFillStatusForTests, voiceDraftLines, type VoiceBarApplyResult, type VoiceFillFields, type VoiceFillRegistry } from '@/lib/voice-fill';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    getPatients: jest.fn(),
    getUsers: jest.fn(),
    getAvailableSlots: jest.fn(),
  },
}));

const api = jest.mocked(apiClient);

class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === 'audio/webm';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const user = { id: 'u1', role: UserRole.RECEPTION } as User;
const registry: VoiceFillRegistry = {
  diagnosis: { label: 'Diagnosis', apply: () => null },
  advice: { label: 'Advice', apply: () => null },
  followUp: { label: 'Follow-up', apply: () => null },
};
const heardVisit = {
  transcript: 'Eczema on both elbows. Moisturise twice a day. Review in four weeks.',
  fields: { diagnosis: 'Eczema', advice: 'Moisturise twice a day', followUp: '4 weeks' },
};

type Apply = (fields: VoiceFillFields) => VoiceBarApplyResult;

function VisitPage({ apply }: { apply: Apply }) {
  useVoiceBarForm({
    form: 'visit-consultation',
    label: 'Visit notes',
    hint: 'Say or type the visit notes',
    scope: 'visit-1',
    preview: (fields) => voiceDraftLines(registry, fields),
    apply,
  });
  return <input aria-label="Chief complaint" />;
}

function Shell({ children }: { children?: ReactNode }) {
  return (
    <DashboardUserProvider value={{ user, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <VoiceBarProvider>
        {children}
        <VoiceBar />
      </VoiceBarProvider>
    </DashboardUserProvider>
  );
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
const failure = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => '' });
let fetchMock: jest.Mock;
const calls = () => fetchMock.mock.calls.map(([url, init]: [string, RequestInit]) => [url, typeof init.body === 'string' ? init.body : 'audio']);

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset());
  api.get.mockResolvedValue({ available: true });
  resetVoiceFillStatusForTests();
  fetchMock = jest.fn().mockResolvedValue(ok(heardVisit));
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(window, 'MediaRecorder', { value: FakeMediaRecorder, configurable: true, writable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] }) },
    configurable: true,
  });
});

const textBox = () => screen.findByRole('textbox', { name: 'Say or type a request' });

async function typeAndSend(text: string) {
  await userEvent.type(await textBox(), `${text}{Enter}`);
}

describe('VoiceBar', () => {
  it('shows what it heard and every line, then adds only the kept lines and offers Undo', async () => {
    const undo = jest.fn();
    const apply = jest.fn<VoiceBarApplyResult, [VoiceFillFields]>(() => ({ filled: [{ label: 'Diagnosis' }, { label: 'Follow-up' }], undo }));
    render(<Shell><VisitPage apply={apply} /></Shell>);

    await typeAndSend('eczema on both elbows');

    expect(await screen.findByText('“Eczema on both elbows. Moisturise twice a day. Review in four weeks.”')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').map((box) => [box.getAttribute('aria-label'), box.getAttribute('aria-checked')])).toEqual([
      ['Diagnosis: Eczema', 'true'],
      ['Advice: Moisturise twice a day', 'true'],
      ['Follow-up: 4 weeks', 'true'],
    ]);
    expect(calls()).toEqual([['/api/voice-fill/visit-consultation/text', '{"text":"eczema on both elbows"}']]);
    expect(apply.mock.calls).toEqual([]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Advice: Moisturise twice a day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to form' }));

    expect(apply.mock.calls).toEqual([[{ diagnosis: 'Eczema', followUp: '4 weeks' }]]);
    expect(screen.getByRole('status')).toHaveTextContent('Added to Visit notes: Diagnosis, Follow-up. Nothing is saved until you save the form.');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(undo.mock.calls).toEqual([[]]);
    expect(screen.getByRole('status')).toHaveTextContent('Undone. The form is back to how it was.');
  });

  it('disables Add to form with an explanation when nothing is ticked', async () => {
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await typeAndSend('eczema');

    for (const name of ['Diagnosis: Eczema', 'Advice: Moisturise twice a day', 'Follow-up: 4 weeks']) {
      await userEvent.click(await screen.findByRole('checkbox', { name }));
    }

    const add = screen.getByRole('button', { name: 'Add to form' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription('Tick at least one line to add it to the form.');
  });

  it('says the form is open and unsaved when apply opened a dialog, with no Undo', async () => {
    render(<Shell><VisitPage apply={() => ({ filled: [{ label: 'Diagnosis' }], undo: null })} /></Shell>);
    await typeAndSend('eczema');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to form' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Added to Visit notes: Diagnosis. Visit notes is open. Nothing is saved until you press its save button.',
    );
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('keeps the draft with a message when apply throws', async () => {
    render(<Shell><VisitPage apply={() => { throw new Error('boom'); }} /></Shell>);
    await typeAndSend('eczema');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to form' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Could not add this to the form. Nothing was changed. Please try again.');
    expect(screen.getByRole('button', { name: 'Add to form' })).toBeEnabled();
  });

  it('puts the heard text back in the text box on Edit and resends it through the text route', async () => {
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await typeAndSend('eczema');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit what was heard' }));

    const box = await textBox();
    expect(box).toHaveValue('Eczema on both elbows. Moisturise twice a day. Review in four weeks.');
    expect(document.activeElement).toBe(box);
    expect(screen.queryByRole('button', { name: 'Add to form' })).toBeNull();

    await userEvent.type(box, ' Itchy at night.{Enter}');

    await screen.findByRole('button', { name: 'Add to form' });
    expect(calls()[1]).toEqual([
      '/api/voice-fill/visit-consultation/text',
      '{"text":"Eczema on both elbows. Moisturise twice a day. Review in four weeks. Itchy at night."}',
    ]);
  });

  it('fails with a clear line when nothing in the answer can be filled in', async () => {
    fetchMock.mockResolvedValue(ok({ transcript: 'hello there', fields: {} }));
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await typeAndSend('hello there');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not find anything to fill in from that. Please say it again.');
    expect(screen.getByRole('textbox', { name: 'Say or type a request' })).toHaveValue('hello there');
  });

  it('shows a failure as an alert and Try again re-sends the same text', async () => {
    fetchMock.mockResolvedValueOnce(failure(500));
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await typeAndSend('eczema');

    expect(await screen.findByRole('alert')).toHaveTextContent('Voice fill failed (server returned 500).');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Add to form' })).toBeEnabled();
    expect(calls()).toEqual([
      ['/api/voice-fill/visit-consultation/text', '{"text":"eczema"}'],
      ['/api/voice-fill/visit-consultation/text', '{"text":"eczema"}'],
    ]);
  });

  it('records, uploads the audio to the form, and Try again re-sends the same recording', async () => {
    fetchMock.mockResolvedValueOnce(failure(500));
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);

    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    expect(screen.getByRole('status')).toHaveTextContent('Listening. Press Enter to send, or Escape to discard.');
    await userEvent.click(screen.getByRole('button', { name: 'Stop and send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Voice fill failed (server returned 500).');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Add to form' });

    const uploads = fetchMock.mock.calls.map(([url, init]: [string, RequestInit]) => {
      const file = (init.body as FormData).get('file') as File;
      return [url, file.name, file.type, file.size];
    });
    expect(uploads).toEqual([
      ['/api/voice-fill/visit-consultation', 'recording.webm', 'audio/webm', 5],
      ['/api/voice-fill/visit-consultation', 'recording.webm', 'audio/webm', 5],
    ]);
  });

  it('reports a blocked microphone in the bar instead of a toast', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockRejectedValue(new Error('Permission denied')) },
      configurable: true,
    });
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);

    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Microphone is blocked. Allow it from the lock icon in the address bar, then try again. You can also type here.',
    );
  });

  it('sends a command to the command route and opens the confirm card', async () => {
    fetchMock.mockResolvedValue(ok({
      transcript: 'Book Ramesh Kumar tomorrow at 10',
      fields: { action: 'schedule_appointment', patientName: 'Ramesh Kumar', date: '2099-01-02', time: '10:00' },
    }));
    api.getPatients.mockResolvedValue({ data: [] } as never);
    api.getUsers.mockResolvedValue({ users: [] } as never);
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Send to' }), 'Command');
    expect(await textBox()).toHaveAttribute('placeholder', 'Say or type a command, e.g. Book Ramesh Kumar with Dr Shravya tomorrow at 10');
    await typeAndSend('book ramesh tomorrow at 10');

    const dialog = await screen.findByRole('dialog', { name: 'Book appointment' });
    expect(dialog).toHaveTextContent('Heard “Book Ramesh Kumar tomorrow at 10”');
    expect(calls()).toEqual([['/api/voice-fill/voice-command/text', '{"text":"book ramesh tomorrow at 10"}']]);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('takes commands on a page that registers no form', async () => {
    fetchMock.mockResolvedValue(ok({ transcript: 'Open Ramesh Kumar', fields: { action: 'open_patient', patientName: 'Ramesh Kumar' } }));
    api.getPatients.mockResolvedValue({ data: [] } as never);
    render(<Shell />);

    await typeAndSend('open ramesh');

    expect(await screen.findByRole('dialog', { name: 'Open patient chart' })).toHaveTextContent('Heard “Open Ramesh Kumar”');
    expect(screen.queryByRole('combobox', { name: 'Send to' })).toBeNull();
  });

  it('renders nothing while voice fill is not available', async () => {
    api.get.mockResolvedValue({ available: false });
    const { container } = render(<Shell />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();

    resetVoiceFillStatusForTests();
    api.get.mockResolvedValue({ available: true });
    render(<Shell />);
    expect(await screen.findByRole('region', { name: 'Voice bar' })).toBeInTheDocument();
  });

  it('focuses the text box on Ctrl+/ and returns focus on Escape', async () => {
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    const box = await textBox();
    const field = screen.getByRole('textbox', { name: 'Chief complaint' });
    await userEvent.click(field);

    await userEvent.keyboard('{Control>}/{/Control}');
    expect(document.activeElement).toBe(box);

    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(field);
  });

  it('discards a recording on Escape without uploading it', async () => {
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    await screen.findByRole('button', { name: 'Stop and send' });

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('status')).toHaveTextContent('Recording discarded.');
    expect(screen.getByRole('button', { name: 'Speak' })).toBeEnabled();
    expect(calls()).toEqual([]);
  });

  it('keeps Shift+Enter as a new line instead of sending', async () => {
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    const box = await textBox();
    await userEvent.type(box, 'eczema{Shift>}{Enter}{/Shift}itchy');

    expect(box).toHaveValue('eczema\nitchy');
    expect(calls()).toEqual([]);
  });
});

describe('VoiceBar collapse', () => {
  const STORE = 'cms-voice-bar-collapsed';
  const hideButton = () => screen.queryByRole('button', { name: 'Hide voice bar' });

  const stripButton = () => within(screen.getByRole('region', { name: 'Voice bar' })).getByRole('button', { name: 'Show voice bar' });

  it('hides the bar, remembers it, and moves focus to the strip button', async () => {
    render(<Shell />);
    const hide = await screen.findByRole('button', { name: 'Hide voice bar' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(hide).toHaveAttribute('title', 'Hide voice bar');

    await userEvent.click(hide);

    expect(screen.queryByRole('textbox', { name: 'Say or type a request' })).toBeNull();
    const strip = stripButton();
    expect(strip).toHaveAttribute('aria-expanded', 'false');
    expect(strip).toHaveAttribute('title', 'Show voice bar (Ctrl+/)');
    expect(strip).toHaveAttribute('type', 'button');
    expect(strip).toHaveClass('h-8');
    expect(strip).toHaveTextContent('Voice bar');
    expect(localStorage.getItem(STORE)).toBe('1');
    expect(document.activeElement).toBe(strip);
  });

  it('shows the bar again, focuses the text box and forgets the preference', async () => {
    render(<Shell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hide voice bar' }));

    await userEvent.click(stripButton());

    const box = await textBox();
    expect(document.activeElement).toBe(box);
    expect(screen.queryByRole('button', { name: 'Show voice bar' })).toBeNull();
    expect(localStorage.getItem(STORE)).toBeNull();
  });

  it('starts as the strip when the browser remembers it', async () => {
    localStorage.setItem(STORE, '1');
    render(<Shell />);

    await screen.findByRole('region', { name: 'Voice bar' });
    expect(stripButton()).toHaveTextContent('Voice bar');
    expect(screen.queryByRole('textbox', { name: 'Say or type a request' })).toBeNull();
  });

  it('keeps typed text across hide and show', async () => {
    render(<Shell />);
    await userEvent.type(await textBox(), 'abc');

    await userEvent.click(screen.getByRole('button', { name: 'Hide voice bar' }));
    await userEvent.click(stripButton());

    expect(await textBox()).toHaveValue('abc');
  });

  it('expands and focuses the text box on Ctrl+/ while collapsed', async () => {
    localStorage.setItem(STORE, '1');
    render(<Shell />);
    await screen.findByRole('button', { name: 'Show voice bar' });

    await userEvent.keyboard('{Control>}/{/Control}');

    expect(document.activeElement).toBe(await textBox());
    expect(localStorage.getItem(STORE)).toBeNull();
  });

  it('offers Hide only while nothing is in flight', async () => {
    fetchMock.mockResolvedValueOnce(failure(500));
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await typeAndSend('eczema');
    await screen.findByRole('alert');
    expect(hideButton()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(hideButton()).toBeInTheDocument();

    await typeAndSend('eczema');
    await screen.findByRole('button', { name: 'Add to form' });
    expect(hideButton()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(hideButton()).toBeInTheDocument();
  });

  it('renders nothing when voice is unavailable and no strip button while expanded', async () => {
    api.get.mockResolvedValue({ available: false });
    localStorage.setItem(STORE, '1');
    render(<Shell />);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Voice bar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show voice bar' })).toBeNull();

    localStorage.removeItem(STORE);
    resetVoiceFillStatusForTests();
    api.get.mockResolvedValue({ available: true });
    render(<Shell />);
    await screen.findByRole('region', { name: 'Voice bar' });
    expect(screen.queryByRole('button', { name: 'Show voice bar' })).toBeNull();
  });

  it('targets a page that registered while the bar was collapsed once it is expanded', async () => {
    localStorage.setItem(STORE, '1');
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);

    await userEvent.click(await screen.findByRole('button', { name: 'Show voice bar' }));

    expect(await screen.findByRole('combobox', { name: 'Send to' })).toHaveDisplayValue('Visit notes');
  });
});
