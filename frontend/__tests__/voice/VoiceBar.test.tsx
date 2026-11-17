import { UserRole } from '@cms/shared-types';
import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { VoiceBar } from '@/components/voice/VoiceBar';
import { VoiceBarProvider, useVoiceBarForm } from '@/components/voice/VoiceBarProvider';
import { apiClient } from '@/lib/api';
import { MicUnavailableError, startDictationSession, type DictationOutcome, type DictationView } from '@/lib/dictation-session';
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

jest.mock('@/lib/dictation-session', () => ({
  ...jest.requireActual('@/lib/dictation-session'),
  startDictationSession: jest.fn(),
}));

const api = jest.mocked(apiClient);
const startDictation = jest.mocked(startDictationSession);
type DictationOptions = Parameters<typeof startDictationSession>[0];

/** Stands in for the live engine: the test emits views and notices and decides the outcome. */
function fakeDictation() {
  let settle!: (outcome: DictationOutcome) => void;
  const outcome = new Promise<DictationOutcome>((resolve) => { settle = resolve; });
  const stop = jest.fn();
  const dispose = jest.fn();
  let options: DictationOptions | null = null;
  startDictation.mockImplementationOnce(async (o) => {
    options = o;
    return { outcome, stop, dispose };
  });
  return {
    stop,
    dispose,
    options: () => options!,
    view: (view: DictationView) => act(() => options!.onView(view)),
    notice: (title: string, description: string) => act(() => options!.onNotice({ title, description })),
    finish: (result: DictationOutcome) => act(async () => { settle(result); await outcome; }),
  };
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

type Apply = (fields: VoiceFillFields) => VoiceBarApplyResult | Promise<VoiceBarApplyResult>;

function VisitPage({ apply }: { apply: Apply }) {
  useVoiceBarForm({
    form: 'visit-consultation',
    label: 'Visit notes',
    hint: 'Say or type the visit notes',
    scope: 'visit-1',
    preview: (fields) => voiceDraftLines(registry, fields),
    apply,
  });
  return (
    <>
      <input aria-label="Chief complaint" />
      <button type="button">Page button</button>
    </>
  );
}

function TogglePage({ apply }: { apply: Apply }) {
  const [shown, setShown] = useState(true);
  return (
    <>
      {shown && <VisitPage apply={apply} />}
      <button type="button" onClick={() => setShown((value) => !value)}>Toggle page</button>
    </>
  );
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
const calls = () => fetchMock.mock.calls.map(([url, init]: [string, RequestInit]) => [url, init.body]);

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset());
  api.get.mockResolvedValue({ available: true });
  resetVoiceFillStatusForTests();
  fetchMock = jest.fn().mockResolvedValue(ok(heardVisit));
  global.fetch = fetchMock as unknown as typeof fetch;
  startDictation.mockReset();
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
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Say or type a request' })).toHaveFocus());

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

  it('keeps Shift+Enter as a new line instead of sending', async () => {
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    const box = await textBox();
    await userEvent.type(box, 'eczema{Shift>}{Enter}{/Shift}itchy');

    expect(box).toHaveValue('eczema\nitchy');
    expect(calls()).toEqual([]);
  });
});

const APPLIED_STATUS = 'Added to Visit notes: Diagnosis. Nothing is saved until you save the form.';
const DIALOG_STATUS = 'Added to Visit notes: Diagnosis. Visit notes is open. Nothing is saved until you press its save button.';

async function reachApplied(apply: Apply) {
  render(<Shell><VisitPage apply={apply} /></Shell>);
  await typeAndSend('eczema');
  await userEvent.click(await screen.findByRole('button', { name: 'Add to form' }));
  expect(screen.getByRole('status')).toHaveTextContent(APPLIED_STATUS);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
}

const undoApply = (): Apply => () => ({ filled: [{ label: 'Diagnosis' }], undo: jest.fn() });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const barUndo = () => screen.queryByRole('button', { name: 'Undo' });

function ControlledPage({ apply, seen }: { apply: Apply; seen: string[] }) {
  const [value, setValue] = useState('');
  useVoiceBarForm({
    form: 'visit-consultation',
    label: 'Visit notes',
    hint: 'Say or type the visit notes',
    scope: 'visit-1',
    preview: (fields) => voiceDraftLines(registry, fields),
    apply,
  });
  return (
    <input
      aria-label="Controlled field"
      value={value}
      onChange={(event) => {
        seen.push(event.target.value);
        setValue(event.target.value);
      }}
    />
  );
}

describe('VoiceBar Undo only while the form is untouched', () => {
  const expectUndoGoneButStatusKept = async () => {
    await waitFor(() => expect(barUndo()).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(APPLIED_STATUS);
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  };

  it('drops Undo but keeps the Added status and Done when the user types in a field outside the bar', async () => {
    await reachApplied(undoApply());
    await userEvent.type(screen.getByRole('textbox', { name: 'Chief complaint' }), 'itchy');
    await expectUndoGoneButStatusKept();
  });

  it('drops Undo but keeps the Added status and Done when the user clicks a page button outside the bar', async () => {
    await reachApplied(undoApply());
    await userEvent.click(screen.getByRole('button', { name: 'Page button' }));
    await expectUndoGoneButStatusKept();
  });

  it('drops Undo but keeps the Added status and Done on a key press on a page element outside the bar', async () => {
    await reachApplied(undoApply());
    act(() => screen.getByRole('button', { name: 'Page button' }).focus());
    await userEvent.keyboard('a');
    await expectUndoGoneButStatusKept();
  });

  it('keeps the Undo button in the layout, hidden from sight and from assistive technology, once the form is touched', async () => {
    await reachApplied(undoApply());
    await userEvent.click(screen.getByRole('button', { name: 'Page button' }));
    await waitFor(() => expect(barUndo()).toBeNull());

    const hidden = screen.getByText('Undo').closest('button')!;
    expect(hidden).toBeDisabled();
    expect(hidden).toHaveClass('invisible');
    expect(hidden).toHaveAttribute('aria-hidden', 'true');
    expect(hidden).toHaveAttribute('tabindex', '-1');
  });

  it('keeps Undo for a pointerdown that never completes outside the bar', async () => {
    await reachApplied(undoApply());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Page button' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('keeps Undo while the user types in the bar or presses its controls', async () => {
    await reachApplied(undoApply());
    await userEvent.type(screen.getByRole('textbox', { name: 'Say or type a request' }), 'next');
    await userEvent.click(screen.getByRole('combobox', { name: 'Send to' }));
    await userEvent.click(screen.getByRole('region', { name: 'Voice bar' }));
    await settle();

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(APPLIED_STATUS);
  });

  it('keeps Undo for a modifier key alone and for Ctrl+/ outside the bar', async () => {
    await reachApplied(undoApply());
    act(() => screen.getByRole('textbox', { name: 'Chief complaint' }).focus());

    await userEvent.keyboard('{Shift}{Control}{Alt}{Meta}');
    await settle();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await userEvent.keyboard('{Control>}/{/Control}');
    await settle();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Say or type a request' }));
  });

  it('dismisses the banner with Done after the form was touched', async () => {
    await reachApplied(undoApply());
    await userEvent.click(screen.getByRole('button', { name: 'Page button' }));
    await waitFor(() => expect(barUndo()).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByText(/Added to Visit notes/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide voice bar' })).toBeInTheDocument();
  });

  it('dismisses the banner with Escape in the bar after the form was touched', async () => {
    await reachApplied(undoApply());
    await userEvent.click(screen.getByRole('button', { name: 'Page button' }));
    await waitFor(() => expect(barUndo()).toBeNull());

    await userEvent.type(screen.getByRole('textbox', { name: 'Say or type a request' }), '{Escape}');

    expect(screen.queryByText(/Added to Visit notes/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide voice bar' })).toBeInTheDocument();
  });

  it('lets the page take everything typed into a controlled field and drops Undo only afterwards', async () => {
    const seen: string[] = [];
    render(<Shell><ControlledPage apply={undoApply()} seen={seen} /></Shell>);
    await typeAndSend('eczema');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to form' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    const field = screen.getByRole('textbox', { name: 'Controlled field' });
    await userEvent.type(field, 'itchy');

    expect(field).toHaveValue('itchy');
    expect(seen).toEqual(['i', 'it', 'itc', 'itch', 'itchy']);
    await waitFor(() => expect(barUndo()).toBeNull());
  });

  it('keeps the dialog status and renders no Undo at all when the page is touched after apply opened a dialog', async () => {
    render(<Shell><VisitPage apply={() => ({ filled: [{ label: 'Diagnosis' }], undo: null })} /></Shell>);
    await typeAndSend('eczema');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to form' }));

    await userEvent.click(screen.getByRole('button', { name: 'Page button' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Chief complaint' }), 'x');
    await settle();

    expect(screen.getByRole('status')).toHaveTextContent(DIALOG_STATUS);
    expect(screen.queryByText('Undo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });
});

describe('VoiceBar answers that arrive late', () => {
  it('keeps what the user typed while a request with no usable lines was pending', async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    fetchMock.mockReturnValueOnce(pending.promise);
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await typeAndSend('A');

    const box = await textBox();
    await userEvent.type(box, 'B typing');
    await act(async () => { pending.resolve(ok({ transcript: 'A', fields: {} })); });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not find anything to fill in from that. Please say it again.');
    expect(box).toHaveValue('B typing');
  });

  it('does not write a stale answer into the box after the page it was for is gone', async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    fetchMock.mockReturnValueOnce(pending.promise);
    render(<Shell><TogglePage apply={jest.fn()} /></Shell>);
    await typeAndSend('A');

    await userEvent.click(screen.getByRole('button', { name: 'Toggle page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Toggle page' }));
    await typeAndSend('C');
    await screen.findByRole('button', { name: 'Add to form' });
    expect(await textBox()).toHaveValue('');

    await act(async () => { pending.resolve(ok({ transcript: 'A', fields: {} })); });

    expect(await textBox()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Add to form' })).toBeEnabled();
  });
});

describe('VoiceBar while Add to form is applying', () => {
  it('ignores Discard, Edit, the line checkboxes and Escape until apply settles, then offers Undo', async () => {
    const applying = deferred<VoiceBarApplyResult>();
    const apply = jest.fn<ReturnType<Apply>, [VoiceFillFields]>(() => applying.promise);
    render(<Shell><VisitPage apply={apply} /></Shell>);
    await typeAndSend('eczema');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to form' }));

    expect(apply.mock.calls).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit what was heard' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to form' })).toBeDisabled();
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' }).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');

    fireEvent.keyDown(screen.getByRole('region', { name: 'Voice bar' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();

    await act(async () => { applying.resolve({ filled: [{ label: 'Diagnosis' }], undo: jest.fn() }); });

    expect(screen.getByRole('status')).toHaveTextContent(APPLIED_STATUS);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });
});

describe('VoiceBar while apply is pending', () => {
  it('disables the text box, Send, the mic and the target select and starts no second request on Enter', async () => {
    const applying = deferred<VoiceBarApplyResult>();
    render(<Shell><VisitPage apply={() => applying.promise} /></Shell>);
    await typeAndSend('eczema');
    await userEvent.type(await textBox(), 'more');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to form' }));
    const requests = fetchMock.mock.calls.length;

    expect(await textBox()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Speak' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Send to' })).toBeDisabled();

    fireEvent.keyDown(await textBox(), { key: 'Enter' });
    await settle();
    expect(fetchMock.mock.calls).toHaveLength(requests);

    await act(async () => { applying.resolve({ filled: [{ label: 'Diagnosis' }], undo: jest.fn() }); });

    expect(screen.getByRole('status')).toHaveTextContent(APPLIED_STATUS);
    expect(await textBox()).toBeEnabled();
  });
});

describe('VoiceBar command card focus', () => {
  it('returns focus to the text box when the command card closes', async () => {
    fetchMock.mockResolvedValue(ok({ transcript: 'Open Ramesh Kumar', fields: { action: 'open_patient', patientName: 'Ramesh Kumar' } }));
    api.getPatients.mockResolvedValue({ data: [] } as never);
    render(<Shell />);
    await typeAndSend('open ramesh');
    await screen.findByRole('dialog', { name: 'Open patient chart' });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Say or type a request' })));
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

const LISTENING = 'Listening. Press Enter to send, or Escape to discard.';
const box = () => screen.getByRole('textbox', { name: 'Say or type a request' });

function BusyPage({ scope = 'visit-1' }: { scope?: string }) {
  const { busy } = useVoiceBarForm({
    form: 'visit-consultation',
    label: 'Visit notes',
    hint: 'Say or type the visit notes',
    scope,
    preview: (fields) => voiceDraftLines(registry, fields),
    apply: jest.fn(),
  });
  return <p>{busy ? 'Voice is working on this visit' : 'Voice is idle'}</p>;
}

describe('VoiceBar live speech', () => {
  it('opens the microphone, then shows the live words in a read-only box as they are spoken', async () => {
    const speech = fakeDictation();
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);

    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));

    expect(screen.getByRole('status')).toHaveTextContent('Opening the microphone…');
    expect(speech.options()).toMatchObject({ preference: 'full-transcript', limits: { maxMs: 2_400_000 } });

    speech.view({ phase: 'listening', live: true, preview: 'itching on both' });
    expect(box()).toHaveValue('itching on both');
    expect(box()).toHaveAttribute('readonly');
    expect(screen.getByRole('status')).toHaveTextContent(LISTENING);

    speech.view({ phase: 'listening', live: true, preview: 'itching on both elbows' });
    expect(box()).toHaveValue('itching on both elbows');

    speech.view({ phase: 'finishing', live: true, preview: 'itching on both elbows' });
    expect(screen.getByRole('status')).toHaveTextContent('Finishing…');
  });

  it('puts the dictation after what was typed and sends it all through the typed route to a draft', async () => {
    const speech = fakeDictation();
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await userEvent.type(await textBox(), 'Follow up.');

    await userEvent.click(screen.getByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: true, preview: 'itching for two weeks' });
    expect(box()).toHaveValue('Follow up. itching for two weeks');

    await userEvent.click(screen.getByRole('button', { name: 'Stop and send' }));
    expect(speech.stop.mock.calls).toEqual([[]]);
    expect(calls()).toEqual([]);
    await speech.finish({ kind: 'text', text: 'itching for two weeks', via: 'live' });

    expect(await screen.findByRole('button', { name: 'Add to form' })).toBeEnabled();
    expect(calls()).toEqual([['/api/voice-fill/visit-consultation/text', '{"text":"Follow up. itching for two weeks"}']]);
    expect(screen.getByText('“Eczema on both elbows. Moisturise twice a day. Review in four weeks.”')).toBeInTheDocument();
    expect(box()).toHaveValue('');
    expect(box()).not.toHaveAttribute('readonly');
  });

  it('sends speech on a page with no form to the command route and opens the confirm card', async () => {
    fetchMock.mockResolvedValue(ok({ transcript: 'Open Ramesh Kumar', fields: { action: 'open_patient', patientName: 'Ramesh Kumar' } }));
    api.getPatients.mockResolvedValue({ data: [] } as never);
    const speech = fakeDictation();
    render(<Shell />);

    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: true, preview: 'open ramesh' });
    await userEvent.click(screen.getByRole('button', { name: 'Stop and send' }));
    await speech.finish({ kind: 'text', text: 'open ramesh', via: 'live' });

    expect(await screen.findByRole('dialog', { name: 'Open patient chart' })).toHaveTextContent('Heard “Open Ramesh Kumar”');
    expect(calls()).toEqual([['/api/voice-fill/voice-command/text', '{"text":"open ramesh"}']]);
  });

  it('discards the dictation on Escape, puts back what was typed, and sends nothing', async () => {
    const speech = fakeDictation();
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await userEvent.type(await textBox(), 'Follow up.');
    await userEvent.click(screen.getByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: true, preview: 'itching' });

    await userEvent.keyboard('{Escape}');

    expect(speech.dispose.mock.calls).toEqual([[]]);
    expect(screen.getByRole('status')).toHaveTextContent('Recording discarded.');
    expect(box()).toHaveValue('Follow up.');
    expect(screen.getByRole('button', { name: 'Speak' })).toBeEnabled();

    await speech.finish({ kind: 'cancelled' });
    expect(calls()).toEqual([]);
    expect(speech.dispose.mock.calls).toEqual([[]]);
  });

  it.each([
    ['nothing was heard', { kind: 'empty' } as DictationOutcome, 'Did not catch anything. Please try again.'],
    [
      'transcription failed',
      { kind: 'error', title: 'Speech-to-text error', description: 'Speech transcription is temporarily unavailable. Try again shortly.' } as DictationOutcome,
      'Speech transcription is temporarily unavailable. Try again shortly.',
    ],
    ['transcription failed with no detail', { kind: 'error', title: 'Speech-to-text error', description: '' } as DictationOutcome, 'Speech-to-text error'],
  ])('shows an alert with no Try again when %s, and puts back what was typed', async (_case, outcome, message) => {
    const speech = fakeDictation();
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await userEvent.type(await textBox(), 'Follow up.');
    await userEvent.click(screen.getByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: true, preview: 'mumble' });
    await userEvent.click(screen.getByRole('button', { name: 'Stop and send' }));

    await speech.finish(outcome);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(box()).toHaveValue('Follow up.');
    expect(calls()).toEqual([]);
  });

  it.each([
    ['denied', new MicUnavailableError('Permission denied', 'denied'),
      'Microphone is blocked. Allow it from the lock icon in the address bar, then try again. You can also type here.'],
    ['unsupported', new MicUnavailableError('Microphone recording is not supported in this browser.', 'unsupported'),
      'This browser cannot record audio. Type here instead.'],
    ['busy', new MicUnavailableError('Another dictation is already running. Stop it first.', 'busy'),
      'Another dictation is already running. Stop it first.'],
  ])('reports a microphone that is %s in the bar', async (_reason, error, message) => {
    startDictation.mockRejectedValueOnce(error);
    render(<Shell><BusyPage /></Shell>);

    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByText('Voice is idle')).toBeInTheDocument();
  });

  it('shows a notice from the engine while listening and drops it once the dictation ends', async () => {
    const speech = fakeDictation();
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: false, preview: '' });

    speech.notice('Live preview unavailable', 'Still recording. Your dictation will be transcribed when you stop.');

    expect(screen.getByText('Live preview unavailable. Still recording. Your dictation will be transcribed when you stop.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Stop and send' }));
    await speech.finish({ kind: 'text', text: 'itching', via: 'recorded' });

    await screen.findByRole('button', { name: 'Add to form' });
    expect(screen.queryByText(/Live preview unavailable/)).toBeNull();
  });

  it('releases the microphone and sends nothing when the page scope changes mid-dictation', async () => {
    const speech = fakeDictation();
    const view = render(<Shell><BusyPage scope="visit-1" /></Shell>);
    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: true, preview: 'itching' });

    view.rerender(<Shell><BusyPage scope="visit-2" /></Shell>);

    expect(speech.dispose.mock.calls).toEqual([[]]);
    expect(screen.getByRole('status')).toHaveTextContent('The page changed, so this draft was discarded.');
    await speech.finish({ kind: 'text', text: 'itching', via: 'live' });
    await settle();
    expect(calls()).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('The page changed, so this draft was discarded.');
    expect(box()).toHaveValue('');
  });

  it('releases the microphone and sends nothing when the page unmounts while finishing', async () => {
    const speech = fakeDictation();
    render(<Shell><TogglePage apply={jest.fn()} /></Shell>);
    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: true, preview: 'itching' });
    await userEvent.click(screen.getByRole('button', { name: 'Stop and send' }));
    speech.view({ phase: 'finishing', live: true, preview: 'itching' });

    await userEvent.click(screen.getByRole('button', { name: 'Toggle page' }));

    expect(speech.dispose.mock.calls).toEqual([[]]);
    expect(screen.getByRole('status')).toHaveTextContent('The page changed, so this draft was discarded.');
    await speech.finish({ kind: 'text', text: 'itching', via: 'live' });
    await settle();
    expect(calls()).toEqual([]);
  });

  it('disposes a session that finishes opening after the page changed', async () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => { open = resolve; });
    const dispose = jest.fn();
    startDictation.mockImplementationOnce(async () => {
      await opened;
      return { outcome: new Promise<DictationOutcome>(() => {}), stop: jest.fn(), dispose };
    });
    render(<Shell><TogglePage apply={jest.fn()} /></Shell>);
    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    expect(screen.getByRole('status')).toHaveTextContent('Opening the microphone…');

    await userEvent.click(screen.getByRole('button', { name: 'Toggle page' }));
    await act(async () => { open(); });

    expect(dispose.mock.calls).toEqual([[]]);
    expect(screen.getByRole('status')).toHaveTextContent('The page changed, so this draft was discarded.');
  });

  it('tells the page it is busy from the mic press until the request after stop settles', async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const speech = fakeDictation();
    render(<Shell><BusyPage /></Shell>);
    await screen.findByRole('button', { name: 'Speak' });
    expect(screen.getByText('Voice is idle')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Speak' }));
    expect(screen.getByText('Voice is working on this visit')).toBeInTheDocument();
    speech.view({ phase: 'listening', live: true, preview: 'eczema' });
    await userEvent.click(screen.getByRole('button', { name: 'Stop and send' }));
    speech.view({ phase: 'finishing', live: true, preview: 'eczema' });
    expect(screen.getByText('Voice is working on this visit')).toBeInTheDocument();
    await speech.finish({ kind: 'text', text: 'eczema', via: 'live' });
    expect(screen.getByText('Voice is working on this visit')).toBeInTheDocument();

    await act(async () => { pending.resolve(ok(heardVisit)); });

    expect(await screen.findByRole('button', { name: 'Add to form' })).toBeEnabled();
    expect(screen.getByText('Voice is idle')).toBeInTheDocument();
  });

  it('stops on Enter in the box while listening, with the mic labelled Stop and send', async () => {
    const speech = fakeDictation();
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: true, preview: 'eczema' });

    expect(screen.getByRole('button', { name: 'Stop and send' })).toBeEnabled();
    await userEvent.type(box(), '{Enter}');

    expect(speech.stop.mock.calls).toEqual([[]]);
    expect(box()).toHaveValue('eczema');
    expect(calls()).toEqual([]);
  });

  it('stops once the microphone opens when Stop was pressed while it was still opening', async () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => { open = resolve; });
    const stop = jest.fn();
    startDictation.mockImplementationOnce(async () => {
      await opened;
      return { outcome: new Promise<DictationOutcome>(() => {}), stop, dispose: jest.fn() };
    });
    render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));

    await userEvent.click(screen.getByRole('button', { name: 'Stop and send' }));
    expect(stop.mock.calls).toEqual([]);
    await act(async () => { open(); });

    expect(stop.mock.calls).toEqual([[]]);
  });

  it('releases the microphone when the bar unmounts', async () => {
    const speech = fakeDictation();
    const view = render(<Shell><VisitPage apply={jest.fn()} /></Shell>);
    await userEvent.click(await screen.findByRole('button', { name: 'Speak' }));
    speech.view({ phase: 'listening', live: true, preview: 'eczema' });

    view.unmount();
    await speech.finish({ kind: 'text', text: 'eczema', via: 'live' });

    expect(speech.dispose.mock.calls).toEqual([[]]);
    expect(calls()).toEqual([]);
  });
});
