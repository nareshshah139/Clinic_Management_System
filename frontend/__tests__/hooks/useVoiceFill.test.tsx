import { act, renderHook } from '@testing-library/react';
import { useVoiceFill, voiceFillReducer, type VoiceFillPhase } from '@/hooks/useVoiceFill';

const toast = jest.fn();
let recorderOptions: { applyText: (field: string, text: string) => void | Promise<void> };
const recorder = { isListening: false, isTranscribing: false, startVoiceInput: jest.fn(), cancelVoiceInput: jest.fn() };
const requestVoiceFill = jest.fn();

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/hooks/useSpeechToTextRecorder', () => ({
  useSpeechToTextRecorder: (options: typeof recorderOptions) => {
    recorderOptions = options;
    return recorder;
  },
}));
jest.mock('@/lib/voice-fill', () => ({
  ...jest.requireActual('@/lib/voice-fill'),
  requestVoiceFill: (...args: unknown[]) => requestVoiceFill(...args),
}));
jest.mock('@/lib/api', () => ({ apiClient: {} }));

const idle: VoiceFillPhase = { kind: 'idle' };

describe('voiceFillReducer', () => {
  it('walks idle, listening, transcribing, filling, idle', () => {
    let phase = voiceFillReducer(idle, { type: 'recorder', listening: true, transcribing: false, now: 1000 });
    expect(phase).toEqual({ kind: 'listening', startedAt: 1000 });
    phase = voiceFillReducer(phase, { type: 'recorder', listening: false, transcribing: true, now: 2000 });
    expect(phase).toEqual({ kind: 'transcribing' });
    phase = voiceFillReducer(phase, { type: 'transcript-ready' });
    expect(phase).toEqual({ kind: 'filling' });
    expect(voiceFillReducer(phase, { type: 'finished' })).toEqual(idle);
  });

  it('keeps the original start time while the recorder keeps reporting listening', () => {
    const listening: VoiceFillPhase = { kind: 'listening', startedAt: 1000 };
    expect(voiceFillReducer(listening, { type: 'recorder', listening: true, transcribing: false, now: 9000 })).toEqual(listening);
  });

  it('is not ended by the recorder going quiet while a fill is in flight', () => {
    expect(voiceFillReducer({ kind: 'filling' }, { type: 'recorder', listening: false, transcribing: false, now: 5 })).toEqual({ kind: 'filling' });
  });

  it('returns to idle when the recorder stops without a transcript (cancel or no speech)', () => {
    expect(voiceFillReducer({ kind: 'listening', startedAt: 1 }, { type: 'recorder', listening: false, transcribing: false, now: 2 })).toEqual(idle);
  });
});

describe('useVoiceFill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recorder.isListening = false;
    recorder.isTranscribing = false;
  });

  it('applies the fields, toasts the filled labels with an Undo action, and returns to idle', async () => {
    requestVoiceFill.mockResolvedValue({ firstName: 'Ramesh' });
    const undo = jest.fn();
    const apply = jest.fn(() => ({ filled: [{ label: 'First name' }, { label: 'Age' }], undo }));
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply }));

    await act(async () => { await recorderOptions.applyText('voice-fill', 'name Ramesh age 42'); });

    expect(requestVoiceFill).toHaveBeenCalledWith('patient-intake', 'name Ramesh age 42');
    expect(apply).toHaveBeenCalledWith({ firstName: 'Ramesh' });
    const shown = toast.mock.calls[0][0];
    expect(shown).toMatchObject({ variant: 'success', title: 'Filled 2 fields', description: 'First name, Age' });
    expect(shown.action.props.onClick).toBe(undo);
    expect(result.current.phase).toEqual(idle);
  });

  it('tells the user what it heard when nothing matched', async () => {
    requestVoiceFill.mockResolvedValue({});
    const apply = jest.fn(() => ({ filled: [], undo: jest.fn() }));
    renderHook(() => useVoiceFill({ form: 'patient-intake', apply }));

    await act(async () => { await recorderOptions.applyText('voice-fill', 'hello there'); });

    expect(toast).toHaveBeenCalledWith({ variant: 'info', title: 'Nothing to fill', description: 'Heard: “hello there”' });
  });

  it('truncates the heard text to 120 characters', async () => {
    requestVoiceFill.mockResolvedValue({});
    renderHook(() => useVoiceFill({ form: 'patient-intake', apply: () => ({ filled: [], undo: jest.fn() }) }));

    await act(async () => { await recorderOptions.applyText('voice-fill', 'a'.repeat(300)); });

    expect(toast.mock.calls[0][0].description).toBe(`Heard: “${'a'.repeat(120)}”`);
  });

  it('shows a warning with the server message and recovers to idle when the request fails', async () => {
    requestVoiceFill.mockRejectedValue(Object.assign(new Error('Voice fill is temporarily unavailable.'), { body: { message: 'Voice fill is temporarily unavailable.' } }));
    const apply = jest.fn();
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply }));

    await act(async () => { await recorderOptions.applyText('voice-fill', 'anything'); });

    expect(apply).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ variant: 'warning', title: 'Voice fill failed', description: 'Voice fill is temporarily unavailable.' });
    expect(result.current.phase).toEqual(idle);
  });

  it('shows filling while the request is pending', async () => {
    let resolve: (v: object) => void = () => {};
    requestVoiceFill.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply: () => ({ filled: [], undo: jest.fn() }) }));

    let pending: Promise<void> | void;
    act(() => { pending = recorderOptions.applyText('voice-fill', 'x'); });
    expect(result.current.phase).toEqual({ kind: 'filling' });

    await act(async () => { resolve({}); await pending; });
    expect(result.current.phase).toEqual(idle);
  });
});
