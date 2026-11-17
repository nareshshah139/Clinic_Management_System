import { act, renderHook } from '@testing-library/react';
import { useSpeechToTextRecorder } from '@/hooks/useSpeechToTextRecorder';
import {
  MicUnavailableError,
  startDictationSession,
  type DictationOutcome,
  type DictationView,
} from '@/lib/dictation-session';

jest.mock('@/lib/dictation-session', () => ({
  ...jest.requireActual('@/lib/dictation-session'),
  startDictationSession: jest.fn(),
}));

const start = startDictationSession as jest.MockedFunction<typeof startDictationSession>;
const FIELDS = { complaint: 'patient-preferred', exam: 'full-transcript' } as const;

type Options = Parameters<typeof startDictationSession>[0];
function controllableSession() {
  let finish!: (outcome: DictationOutcome) => void;
  const outcome = new Promise<DictationOutcome>((resolve) => { finish = resolve; });
  const log: string[] = [];
  let options!: Options;
  return {
    log,
    finish: (o: DictationOutcome) => act(async () => { finish(o); await outcome; }),
    view: (v: DictationView) => act(() => options.onView(v)),
    notice: (title: string) => act(() => options.onNotice({ title, description: 'detail' })),
    install(opened: (o: Options) => void = () => {}) {
      start.mockImplementationOnce(async (o) => {
        options = o;
        log.push(`start:${o.preference}`);
        opened(o);
        return {
          outcome,
          stop: () => { log.push('stop'); },
          dispose: () => { log.push('dispose'); },
        };
      });
    },
  };
}

const press = (hook: ReturnType<typeof setup>['hook'], field: keyof typeof FIELDS) =>
  act(async () => { void hook.result.current.startVoiceInput(field); });

function setup() {
  const toast = jest.fn();
  const applied: Array<[string, string]> = [];
  const hook = renderHook(() =>
    useSpeechToTextRecorder({ toast, fields: FIELDS, applyText: (field, text) => { applied.push([field, text]); } }),
  );
  return { toast, applied, hook };
}

beforeEach(() => jest.clearAllMocks());

it('dictates into the chosen field with its preference and toggles stop on the same field', async () => {
  const s = controllableSession();
  s.install((o) => o.onView({ phase: 'connecting', live: true, preview: '' }));
  const { applied, hook, toast } = setup();

  await press(hook, 'complaint');
  expect(hook.result.current).toMatchObject({ activeVoiceField: 'complaint', isConnecting: true, isListening: false, livePreview: '' });

  s.view({ phase: 'listening', live: true, preview: 'Itching for' });
  expect(hook.result.current).toMatchObject({ isConnecting: false, isListening: true, livePreview: 'Itching for' });

  await press(hook, 'complaint');
  s.view({ phase: 'finishing', live: true, preview: 'Itching for a week' });
  expect(hook.result.current.isTranscribing).toBe(true);
  await s.finish({ kind: 'text', text: 'Itching for a week.', via: 'live' });

  expect(s.log).toEqual(['start:patient-preferred', 'stop']);
  expect(applied).toEqual([['complaint', 'Itching for a week.']]);
  expect(toast).not.toHaveBeenCalled();
  expect(hook.result.current).toMatchObject({ activeVoiceField: null, isTranscribing: false, livePreview: '' });
});

it('ignores another field while one is active and ignores the same field while finishing', async () => {
  const s = controllableSession();
  s.install((o) => o.onView({ phase: 'listening', live: true, preview: '' }));
  const { hook } = setup();

  await press(hook, 'exam');
  await press(hook, 'complaint');
  expect(hook.result.current.activeVoiceField).toBe('exam');

  s.view({ phase: 'finishing', live: false, preview: '' });
  await press(hook, 'exam');
  expect(s.log).toEqual(['start:full-transcript']);
  expect(start).toHaveBeenCalledTimes(1);
});

it('disposes on unmount and never applies text or toasts afterwards', async () => {
  const s = controllableSession();
  s.install((o) => o.onView({ phase: 'listening', live: true, preview: 'partial' }));
  const { applied, hook, toast } = setup();

  await press(hook, 'exam');
  hook.unmount();
  await s.finish({ kind: 'text', text: 'late text', via: 'recorded' });
  s.notice('late notice');

  expect(s.log).toEqual(['start:full-transcript', 'dispose']);
  expect(applied).toEqual([]);
  expect(toast).not.toHaveBeenCalled();
});

it('disposes a session that finishes starting after unmount', async () => {
  const s = controllableSession();
  let releaseMic!: () => void;
  const micGranted = new Promise<void>((resolve) => { releaseMic = resolve; });
  start.mockImplementationOnce(async () => {
    await micGranted;
    s.log.push('started');
    return { outcome: new Promise<DictationOutcome>(() => {}), stop: () => s.log.push('stop'), dispose: () => s.log.push('dispose') };
  });
  const { hook, toast } = setup();

  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.startVoiceInput('exam'); });
  hook.unmount();
  await act(async () => { releaseMic(); await pending; });

  expect(s.log).toEqual(['started', 'dispose']);
  expect(toast).not.toHaveBeenCalled();
});

it('stops a session that was toggled off while the microphone prompt was open', async () => {
  let releaseMic!: () => void;
  const micGranted = new Promise<void>((resolve) => { releaseMic = resolve; });
  const log: string[] = [];
  start.mockImplementationOnce(async () => {
    await micGranted;
    return { outcome: new Promise<DictationOutcome>(() => {}), stop: () => log.push('stop'), dispose: () => log.push('dispose') };
  });
  const { hook } = setup();

  await press(hook, 'exam');
  expect(hook.result.current).toMatchObject({ activeVoiceField: 'exam', isConnecting: true });
  await press(hook, 'exam');
  await act(async () => { releaseMic(); });

  expect(log).toEqual(['stop']);
});

it('turns notices, empty results, errors and microphone failures into toasts', async () => {
  const { hook, toast } = setup();

  const s1 = controllableSession();
  s1.install();
  await press(hook, 'exam');
  s1.notice('Live preview unavailable');
  await s1.finish({ kind: 'empty' });

  const s2 = controllableSession();
  s2.install();
  await press(hook, 'exam');
  await s2.finish({ kind: 'error', title: 'Speech-to-text error', description: 'Server returned 500.' });

  start.mockRejectedValueOnce(new MicUnavailableError('Permission denied', 'denied'));
  await press(hook, 'exam');
  start.mockRejectedValueOnce(new MicUnavailableError('Microphone recording is not supported in this browser.', 'unsupported'));
  await press(hook, 'exam');
  start.mockRejectedValueOnce(new MicUnavailableError('Another dictation is already running. Stop it first.', 'busy'));
  await press(hook, 'exam');

  expect(toast.mock.calls.map(([t]) => t)).toEqual([
    { variant: 'info', title: 'Live preview unavailable', description: 'detail' },
    {
      variant: 'info',
      title: 'No speech detected',
      description: 'The recording may have been too quiet or contained only silence. Try speaking louder and closer to the microphone.',
    },
    { variant: 'warning', title: 'Speech-to-text error', description: 'Server returned 500.' },
    { variant: 'warning', title: 'Microphone access denied', description: 'Permission denied' },
    { variant: 'warning', title: 'Voice capture unavailable', description: 'Microphone recording is not supported in this browser.' },
    { variant: 'warning', title: 'Dictation already running', description: 'Another dictation is already running. Stop it first.' },
  ]);
  expect(hook.result.current.activeVoiceField).toBeNull();
});
