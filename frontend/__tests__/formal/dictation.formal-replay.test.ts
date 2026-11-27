/**
 * Replays of verification/state-machines/dictation, one test step per model action.
 * Only the browser boundary is stubbed: getUserMedia, MediaRecorder, RTCPeerConnection and fetch.
 */
import { act, renderHook } from '@testing-library/react';
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
const advance = (ms: number) => step(() => jest.advanceTimersByTime(ms));
const urls = () => fetchMock.mock.calls.map(([url]) => url);

function renderFieldDictation(preference: SpeechToTextPreference) {
  const applyText = jest.fn();
  const toast = jest.fn();
  const hook = renderHook(() =>
    useSpeechToTextRecorder({ toast, fields: { notes: preference }, applyText }),
  );
  return { ...hook, applyText, toast, press: () => step(() => void hook.result.current.startVoiceInput('notes')) };
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

  it('LeavesFinishing: the field leaves Transcribing when the upload times out', async () => {
    const field = await stopWhileOpening();
    expect(urls()).toEqual([LIVE_URL, UPLOAD_URL]);
    await advance(DICTATION_LIMITS.requestMs - 1);
    expect(field.result.current.isTranscribing).toBe(true);
    await advance(1);
    expect(field.result.current.isTranscribing).toBe(false);
    expect(field.toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Transcription took too long. Please dictate again.' }));
    expect(field.applyText).not.toHaveBeenCalled();
  });

  it('LockReleased: the next dictation can start once the upload times out', async () => {
    await stopWhileOpening();
    await advance(DICTATION_LIMITS.requestMs - 1);
    expect(await startAnotherDictation()).toBe('busy');
    await advance(1);
    expect(await startAnotherDictation()).toBe('started');
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
