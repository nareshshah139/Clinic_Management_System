import { act, renderHook } from '@testing-library/react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useSpeechToTextRecorder } from '@/hooks/useSpeechToTextRecorder';
import { useVoiceFill } from '@/hooks/useVoiceFill';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/lib/api', () => ({ apiClient: {} }));

class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === 'audio/webm';
  static lastOptions: MediaRecorderOptions | undefined;
  constructor(_stream: unknown, options?: MediaRecorderOptions) {
    FakeMediaRecorder.lastOptions = options;
  }
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

const track = { stop: jest.fn() };
const fetchMock = jest.fn();
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const deferred = () => {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(window, 'MediaRecorder', { value: FakeMediaRecorder, configurable: true, writable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [track] }) },
    configurable: true,
  });
});

describe('useAudioRecorder', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('records speech at 32 kbps and hands the audio over by itself after 40 minutes', async () => {
    jest.useFakeTimers();
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useAudioRecorder({ toast, onRecorded }));

    await act(async () => { await result.current.toggle('notes'); });
    expect(FakeMediaRecorder.lastOptions).toEqual({ mimeType: 'audio/webm', audioBitsPerSecond: 32000 });

    act(() => { jest.advanceTimersByTime(40 * 60_000 - 1); });
    expect([result.current.recording?.key, onRecorded.mock.calls.length]).toEqual(['notes', 0]);

    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current.recording).toBeNull();
    expect(onRecorded.mock.calls.map(([key, audio, filename]) => [key, audio.type, filename])).toEqual([['notes', 'audio/webm', 'recording.webm']]);
  });
});

describe('useSpeechToTextRecorder', () => {
  it('posts the recording to the transcribe endpoint and inserts the text into the field that recorded it', async () => {
    const applyText = jest.fn();
    const response = deferred();
    fetchMock.mockReturnValue(response.promise);
    const { result } = renderHook(() => useSpeechToTextRecorder({ toast, resolveText: (_field, data) => data.text ?? '', applyText }));

    await act(async () => { await result.current.startVoiceInput('chiefComplaints'); });
    expect([result.current.isListening, result.current.activeVoiceField]).toEqual([true, 'chiefComplaints']);

    await act(async () => { await result.current.startVoiceInput('chiefComplaints'); });
    expect([result.current.isListening, result.current.isTranscribing, result.current.activeVoiceField]).toEqual([false, true, 'chiefComplaints']);
    const [url, init] = fetchMock.mock.calls[0];
    expect([url, init.credentials, ((init.body as FormData).get('file') as File).name]).toEqual(['/api/visits/transcribe', 'include', 'recording.webm']);

    await act(async () => { response.resolve(json(200, { text: 'itching for two weeks' })); });
    expect(applyText.mock.calls).toEqual([['chiefComplaints', 'itching for two weeks']]);
    expect([result.current.isTranscribing, result.current.activeVoiceField]).toEqual([false, null]);
  });
});

describe('useVoiceFill', () => {
  async function recordAndStop(result: { current: ReturnType<typeof useVoiceFill> }) {
    await act(async () => { result.current.toggle(); });
    act(() => { result.current.toggle(); });
  }

  it('records, uploads the audio for the form, applies the fields and offers Undo on the pill, not in a toast', async () => {
    const response = deferred();
    fetchMock.mockReturnValue(response.promise);
    const undo = jest.fn();
    const apply = jest.fn(async () => ({ filled: [{ label: 'Diagnosis' }, { label: '2 medicines' }], undo }));
    const { result } = renderHook(() => useVoiceFill({ form: 'visit-consultation', apply }));

    await act(async () => { result.current.toggle(); });
    expect(result.current.phase.kind).toBe('listening');

    act(() => { result.current.toggle(); });
    expect(result.current.phase).toEqual({ kind: 'filling' });
    expect(track.stop.mock.calls.length).toBe(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect([url, ((init.body as FormData).get('file') as File).name]).toEqual(['/api/voice-fill/visit-consultation', 'recording.webm']);

    await act(async () => { response.resolve(json(200, { transcript: 'diagnosis acne', fields: { diagnosis: 'Acne' } })); });

    expect(apply.mock.calls).toEqual([[{ diagnosis: 'Acne' }]]);
    expect(toast.mock.calls).toEqual([]);
    expect(result.current.phase).toEqual({ kind: 'filled', labels: ['Diagnosis', '2 medicines'] });

    act(() => { result.current.undo(); });
    expect(undo.mock.calls.length).toBe(1);
    expect(result.current.phase).toEqual({ kind: 'idle' });
  });

  it('tells the user what it heard, up to 120 characters, when nothing matched', async () => {
    fetchMock.mockResolvedValue(json(200, { transcript: `  ${'a'.repeat(300)}`, fields: {} }));
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply: () => ({ filled: [], undo: jest.fn() }) }));

    await recordAndStop(result);
    await act(async () => {});

    expect(toast.mock.calls).toEqual([[{ variant: 'info', title: 'Nothing to fill', description: `Heard: “${'a'.repeat(120)}”` }]]);
  });

  it('shows the mapped server error and returns to idle', async () => {
    fetchMock.mockResolvedValue(json(413, { message: 'File too large' }));
    const apply = jest.fn();
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply }));

    await recordAndStop(result);
    await act(async () => {});

    expect(toast.mock.calls).toEqual([[{ variant: 'warning', title: 'Voice fill failed', description: 'The recording is too long. Try a shorter clip.' }]]);
    expect(apply.mock.calls).toEqual([]);
    expect(result.current.phase).toEqual({ kind: 'idle' });
  });

  it('cancel releases the microphone without uploading', async () => {
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply: jest.fn() }));

    await act(async () => { result.current.toggle(); });
    act(() => { result.current.cancel(); });

    expect(result.current.phase).toEqual({ kind: 'idle' });
    expect(track.stop.mock.calls.length).toBe(1);
    expect(fetchMock.mock.calls).toEqual([]);
  });
});
