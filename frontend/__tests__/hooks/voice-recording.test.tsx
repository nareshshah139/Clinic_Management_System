import { act, renderHook } from '@testing-library/react';
import { useVoiceFill } from '@/hooks/useVoiceFill';

const toast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@/lib/api', () => ({ apiClient: {} }));

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
    this.ondataavailable?.({ data: new Blob(['a'.repeat(2_000)], { type: 'audio/webm' }) });
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

describe('useVoiceFill', () => {
  const recordedText = (text: string) => json(201, { text, segments: [], speakers: { doctorText: '', patientText: '' } });
  const routes = (fill: () => unknown) => fetchMock.mockImplementation(async (url: string) =>
    url === '/api/visits/transcribe?speakers=none' ? recordedText('diagnosis acne') : fill());
  const requests = () => fetchMock.mock.calls.map(([url, init]) => [url, init.body instanceof FormData ? 'audio' : JSON.parse(String(init.body))]);

  it('listens, sends the heard words to the form\'s text route, applies the fields and offers Undo on the pill, not in a toast', async () => {
    const response = deferred();
    routes(() => response.promise);
    const undo = jest.fn();
    const apply = jest.fn(async () => ({ filled: [{ label: 'Diagnosis' }, { label: '2 medicines' }], undo }));
    const { result } = renderHook(() => useVoiceFill({ form: 'visit-consultation', apply }));

    await act(async () => { result.current.toggle(); });
    expect(result.current.phase.kind).toBe('listening');

    await act(async () => { result.current.toggle(); });
    expect(result.current.phase).toEqual({ kind: 'filling' });
    expect(track.stop).toHaveBeenCalled();
    expect(requests()).toEqual([
      ['/api/visits/transcribe?speakers=none', 'audio'],
      ['/api/voice-fill/visit-consultation/text', { text: 'diagnosis acne' }],
    ]);

    await act(async () => { response.resolve(json(200, { transcript: 'diagnosis acne', fields: { diagnosis: 'Acne' } })); });

    expect(apply.mock.calls).toEqual([[{ diagnosis: 'Acne' }]]);
    expect(toast.mock.calls).toEqual([]);
    expect(result.current.phase).toEqual({ kind: 'filled', labels: ['Diagnosis', '2 medicines'] });

    act(() => { result.current.undo(); });
    expect(undo.mock.calls.length).toBe(1);
    expect(result.current.phase).toEqual({ kind: 'idle' });
  });

  it('tells the user what it heard, up to 120 characters, when nothing matched', async () => {
    routes(() => json(200, { transcript: `  ${'a'.repeat(300)}`, fields: {} }));
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply: () => ({ filled: [], undo: jest.fn() }) }));

    await act(async () => { result.current.toggle(); });
    await act(async () => { result.current.toggle(); });

    expect(toast.mock.calls).toEqual([[{ variant: 'info', title: 'Nothing to fill', description: `Heard: “${'a'.repeat(120)}”` }]]);
    expect(result.current.phase).toEqual({ kind: 'idle' });
  });

  it('shows the mapped server error and returns to idle', async () => {
    routes(() => json(403, { message: 'Forbidden' }));
    const apply = jest.fn();
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply }));

    await act(async () => { result.current.toggle(); });
    await act(async () => { result.current.toggle(); });

    expect(toast.mock.calls).toEqual([[{ variant: 'warning', title: 'Voice fill failed', description: 'Your role cannot fill this form by voice.' }]]);
    expect(apply.mock.calls).toEqual([]);
    expect(result.current.phase).toEqual({ kind: 'idle' });
  });

  it('keeps listening past 10 minutes and stops by itself at 40, like the voice bar', async () => {
    jest.useFakeTimers();
    routes(() => json(200, { transcript: 'diagnosis acne', fields: {} }));
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply: () => ({ filled: [], undo: jest.fn() }) }));

    await act(async () => { result.current.toggle(); });
    await act(async () => { jest.advanceTimersByTime(40 * 60_000 - 1); });
    expect(result.current.phase.kind).toBe('listening');

    await act(async () => { jest.advanceTimersByTime(1); });
    expect(result.current.phase.kind).not.toBe('listening');
    jest.useRealTimers();
  });

  it('never records with the button idle after Escape at the permission prompt and a second press', async () => {
    const first = deferred();
    const getUserMedia = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ getTracks: () => [track] });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply: jest.fn() }));

    await act(async () => { result.current.toggle(); });
    await act(async () => { result.current.cancel(); });
    await act(async () => { result.current.toggle(); });
    expect(result.current.phase).toEqual({ kind: 'idle' });
    expect(toast.mock.calls).toEqual([[{ variant: 'warning', title: 'Dictation already running', description: 'Another dictation is already running. Stop it first.' }]]);

    await act(async () => { first.resolve({ getTracks: () => [track] }); });
    expect(result.current.phase).toEqual({ kind: 'idle' });
    expect(track.stop).toHaveBeenCalled();
    expect(fetchMock.mock.calls).toEqual([]);
  });

  it('cancel releases the microphone without sending anything', async () => {
    const { result } = renderHook(() => useVoiceFill({ form: 'patient-intake', apply: jest.fn() }));

    await act(async () => { result.current.toggle(); });
    await act(async () => { result.current.cancel(); });

    expect(result.current.phase).toEqual({ kind: 'idle' });
    expect(track.stop).toHaveBeenCalled();
    expect(fetchMock.mock.calls).toEqual([]);
  });
});
