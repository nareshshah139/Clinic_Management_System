/**
 * Replays of verification/state-machines/dictation, one test step per model action.
 * Only the browser boundary is stubbed: getUserMedia, MediaRecorder, RTCPeerConnection and fetch.
 */
import { act, renderHook } from '@testing-library/react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useSpeechToTextRecorder } from '@/hooks/useSpeechToTextRecorder';
import { DICTATION_LIMITS, startDictationSession, type MicUnavailableError } from '@/lib/dictation-session';
import type { SpeechToTextPreference } from '@/lib/speech-to-text';

const LIVE_URL = '/api/visits/transcribe/live';
const UPLOAD_URL = '/api/visits/transcribe';

class FakeTrack {
  stopped = false;
  stop() { this.stopped = true; }
}

class FakeStream {
  track = new FakeTrack();
  getTracks() { return [this.track]; }
}

class FakeDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  send() {}
  close() { this.readyState = 'closed'; }
  open() { this.readyState = 'open'; this.onopen?.(); }
  emit(event: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

class FakePeer {
  static last: FakePeer;
  channel = new FakeDataChannel();
  connectionState: RTCPeerConnectionState = 'new';
  onconnectionstatechange: (() => void) | null = null;
  constructor() { FakePeer.last = this; }
  addTrack() {}
  createDataChannel() { return this.channel; }
  async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close() {}
}

class FakeRecorder {
  static last: FakeRecorder;
  static isTypeSupported(type: string) { return type === 'audio/webm'; }
  state: RecordingState = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() { FakeRecorder.last = this; }
  start() { this.state = 'recording'; }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'.repeat(5_000)]) });
    this.onstop?.();
  }
}

type Reply = { status: number; body: unknown };
const reply = ({ status, body }: Reply) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const never = (_url: string, init?: RequestInit) =>
  new Promise<never>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let fetchMock: jest.Mock;

function stubBrowser(getUserMedia: jest.Mock, fetchImpl: (url: string, init?: RequestInit) => Promise<unknown>) {
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder, configurable: true, writable: true });
  Object.defineProperty(window, 'RTCPeerConnection', { value: FakePeer, configurable: true, writable: true });
  fetchMock = jest.fn((url: string, init?: RequestInit) => fetchImpl(url, init));
  global.fetch = fetchMock as unknown as typeof fetch;
}

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};
const step = (fn: () => unknown) => act(async () => { fn(); await settle(); });
const runEveryTimer = () => step(() => jest.advanceTimersByTime(DICTATION_LIMITS.maxMs * 2));
const urls = () => fetchMock.mock.calls.map(([url]) => url);

function renderFieldDictation(preference: SpeechToTextPreference) {
  const applyText = jest.fn();
  const hook = renderHook(() =>
    useSpeechToTextRecorder({ toast: jest.fn(), fields: { notes: preference }, applyText }),
  );
  return { ...hook, applyText, press: () => step(() => void hook.result.current.startVoiceInput('notes')) };
}

async function startAnotherDictation(): Promise<string> {
  let result = '';
  await act(async () => {
    result = await startDictationSession({ preference: 'full-transcript', onView() {}, onNotice() {} }).then(
      (session) => {
        session.dispose();
        return 'started';
      },
      (error: MicUnavailableError) => error.reason,
    );
  });
  return result;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('dictation that stops while the live preview is still opening, with a server that never answers', () => {
  async function stopWhileOpening() {
    stubBrowser(jest.fn(async () => new FakeStream()), never);
    const field = renderFieldDictation('patient-preferred');
    await field.press();
    await field.press();
    return field;
  }

  it.failing('LeavesFinishing: the field leaves Transcribing once every timer has run', async () => {
    const field = await stopWhileOpening();
    await runEveryTimer();
    expect(field.result.current.isTranscribing).toBe(false);
  });

  it('today: the field still shows Transcribing after every timer has run, waiting on the upload', async () => {
    const field = await stopWhileOpening();
    await runEveryTimer();
    expect({ transcribing: field.result.current.isTranscribing, urls: urls() }).toEqual({
      transcribing: true,
      urls: [LIVE_URL, UPLOAD_URL],
    });
  });

  it.failing('LockReleased: the next dictation can start once every timer has run', async () => {
    await stopWhileOpening();
    await runEveryTimer();
    expect(await startAnotherDictation()).toBe('started');
  });

  it('today: the next dictation is refused as busy after every timer has run', async () => {
    await stopWhileOpening();
    await runEveryTimer();
    expect(await startAnotherDictation()).toBe('busy');
  });
});

describe('a live transcript piece that fails and then completes', () => {
  async function failThenComplete() {
    const offer = deferred<unknown>();
    stubBrowser(jest.fn(async () => new FakeStream()), (url) =>
      url === LIVE_URL
        ? offer.promise
        : Promise.resolve(reply({ status: 201, body: { text: 'Recorded words', speakers: { doctorText: '', patientText: '' } } })),
    );
    const field = renderFieldDictation('full-transcript');
    await field.press();
    await step(() => offer.resolve(reply({ status: 201, body: { sdp: 'v=0 answer' } })));
    await step(() => FakePeer.last.channel.open());
    await step(() => FakePeer.last.channel.emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'Live words' }));
    await step(() => FakePeer.last.channel.emit({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'a' }));
    await step(() => FakePeer.last.channel.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'Live words' }));
    await field.press();
    await step(() => jest.advanceTimersByTime(DICTATION_LIMITS.tailMs));
    await step(() => FakePeer.last.channel.emit({ type: 'input_audio_buffer.committed', item_id: 'a' }));
    return field;
  }

  it('ItemFailureSticks: the failed piece sends the dictation to the recording upload', async () => {
    const field = await failThenComplete();
    expect(field.applyText.mock.calls).toEqual([['notes', 'Recorded words']]);
  });
});

describe('voice fill clip: Escape while the permission prompt is open, then press again', () => {
  async function staleDenialThenGrant() {
    const first = deferred<FakeStream>();
    const second = deferred<FakeStream>();
    stubBrowser(jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise), never);
    const hook = renderHook(() => useAudioRecorder({ toast: jest.fn(), onRecorded: jest.fn() }));
    await step(() => void hook.result.current.toggle('notes'));
    await step(() => hook.result.current.cancel());
    await step(() => void hook.result.current.toggle('notes'));
    await step(() => first.reject(new Error('Permission dismissed')));
    await step(() => second.resolve(new FakeStream()));
    return hook;
  }

  it.failing('ClipShownWhileRecording: the button shows recording while the microphone records', async () => {
    const { result } = await staleDenialThenGrant();
    expect({ shown: result.current.recording?.key ?? null, recorder: FakeRecorder.last.state }).toEqual({
      shown: 'notes',
      recorder: 'recording',
    });
  });

  it('today: the microphone records while the button shows idle', async () => {
    const { result } = await staleDenialThenGrant();
    expect({ shown: result.current.recording, recorder: FakeRecorder.last.state }).toEqual({
      shown: null,
      recorder: 'recording',
    });
  });
});
