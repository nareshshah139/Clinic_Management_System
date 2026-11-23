import { DICTATION_LIMITS, MicUnavailableError, startDictationSession, type DictationSession, type DictationView } from '@/lib/dictation-session';
import { handleUnauthorizedRedirect } from '@/lib/authRedirect';
import type { SpeechToTextPreference } from '@/lib/speech-to-text';

jest.mock('@/lib/authRedirect', () => ({ handleUnauthorizedRedirect: jest.fn() }));

const OFFER_SDP = 'v=0\r\no=- offer';
const DELTA = 'conversation.item.input_audio_transcription.delta';
const COMPLETED = 'conversation.item.input_audio_transcription.completed';
const FAILED = 'conversation.item.input_audio_transcription.failed';

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
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 'closed'; }
  open() { this.readyState = 'open'; this.onopen?.(); }
  emit(event: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(event) }); }
  remoteClose() { this.readyState = 'closed'; this.onclose?.(); }
}

class FakePeer {
  static last: FakePeer;
  channel = new FakeDataChannel();
  label = '';
  tracks: unknown[] = [];
  remote: RTCSessionDescriptionInit | null = null;
  closed = false;
  connectionState: RTCPeerConnectionState = 'new';
  onconnectionstatechange: (() => void) | null = null;
  constructor() { FakePeer.last = this; }
  addTrack(track: unknown) { this.tracks.push(track); }
  createDataChannel(label: string) { this.label = label; return this.channel; }
  async createOffer() { return { type: 'offer', sdp: OFFER_SDP }; }
  async setLocalDescription() {}
  async setRemoteDescription(description: RTCSessionDescriptionInit) { this.remote = description; }
  close() { this.closed = true; }
}

function fakeRecorder(bytes: number) {
  return class FakeRecorder {
    static isTypeSupported(type: string) { return type === 'audio/webm'; }
    state: RecordingState = 'inactive';
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() { this.state = 'recording'; }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['x'.repeat(bytes)]) });
      this.onstop?.();
    }
  };
}

type Reply = { status: number; body?: unknown } | Error | 'never';
const respond = (reply: Reply, signal?: AbortSignal | null) => {
  if (reply === 'never') {
    return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError'))));
  }
  if (reply instanceof Error) return Promise.reject(reply);
  const { status, body } = reply;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? '')),
  });
};

function harness(o: {
  live?: Reply;
  speakers?: Reply;
  upload?: Reply;
  recordedBytes?: number;
  rtc?: boolean;
  micError?: Error;
} = {}) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const replies: Record<string, Reply> = {
    '/api/visits/transcribe/live': o.live ?? { status: 201, body: { sdp: 'v=0\r\no=- answer' } },
    '/api/visits/transcribe/speakers': o.speakers ?? { status: 500, body: 'unused' },
    '/api/visits/transcribe': o.upload ?? { status: 201, body: { text: 'Recorded words', speakers: { doctorText: '', patientText: '' } } },
  };
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const stream = new FakeStream();
  const views: DictationView[] = [];
  const notices: Array<{ title: string; description: string }> = [];

  const deps = {
    getUserMedia: async () => {
      if (o.micError) throw o.micError;
      return stream as unknown as MediaStream;
    },
    RTCPeerConnection: o.rtc === false ? undefined : (FakePeer as unknown as typeof RTCPeerConnection),
    MediaRecorder: fakeRecorder(o.recordedBytes ?? 5_000) as unknown as typeof MediaRecorder,
    fetch: ((url: string, init: RequestInit) => {
      const body = init.body instanceof FormData ? init.body.get('file') : JSON.parse(String(init.body));
      calls.push({ url, body });
      return respond(replies[url], init.signal);
    }) as unknown as typeof fetch,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id: unknown) => { timers.delete(id as number); },
  };

  const start = async (preference: SpeechToTextPreference = 'full-transcript') => {
    const session = await startDictationSession({
      preference,
      onView: (view) => views.push(view),
      onNotice: (notice) => notices.push(notice),
      limits: { maxMs: 120_000, connectMs: 1_000, finishMs: 2_000, tailMs: TAIL_MS, minRecordedBytes: 1_000 },
      deps,
    });
    opened.push(session);
    return session;
  };

  const advance = async (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= now && timers.has(id)) {
        timers.delete(id);
        timer.fn();
      }
    }
    await flush();
  };

  return {
    calls,
    views,
    notices,
    stream,
    start,
    advance,
    urls: () => calls.map((call) => call.url),
    get peer() { return FakePeer.last; },
    get dc() { return FakePeer.last.channel; },
    lastView: () => views[views.length - 1],
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const COMMIT = { type: 'input_audio_buffer.commit' };
const TAIL_MS = 300;

async function startListening(h: ReturnType<typeof harness>, preference?: SpeechToTextPreference) {
  const session = await h.start(preference);
  await flush();
  h.dc.open();
  return session;
}

const opened: DictationSession[] = [];

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  opened.splice(0).forEach((session) => session.dispose());
});

describe('startDictationSession over live transcription', () => {
  it('streams a preview and resolves the completed transcript after one commit', async () => {
    const h = harness();
    const session = await startListening(h);
    expect(h.peer.label).toBe('oai-events');
    expect(h.peer.tracks).toEqual([h.stream.track]);
    expect(h.calls[0]).toEqual({ url: '/api/visits/transcribe/live', body: { sdp: OFFER_SDP } });
    expect(h.peer.remote).toEqual({ type: 'answer', sdp: 'v=0\r\no=- answer' });

    h.dc.emit({ type: DELTA, item_id: 'a', delta: 'Itching on ' });
    h.dc.emit({ type: DELTA, item_id: 'a', delta: 'the scalp' });
    expect(h.lastView()).toEqual({ phase: 'listening', live: true, preview: 'Itching on the scalp' });

    session.stop();
    session.stop();
    await h.advance(TAIL_MS);
    expect(h.dc.sent).toEqual([COMMIT]);
    expect(h.stream.track.stopped).toBe(true);
    expect(h.lastView()).toEqual({ phase: 'finishing', live: true, preview: 'Itching on the scalp' });

    h.dc.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });
    h.dc.emit({ type: COMPLETED, item_id: 'a', transcript: 'Itching on the scalp for one week.' });

    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Itching on the scalp for one week.', via: 'live' });
    expect(h.urls()).toEqual(['/api/visits/transcribe/live']);
    expect(h.peer.closed).toBe(true);
    expect(h.notices).toEqual([]);
  });

  it('keeps the mic open for the tail after stop so the last words reach OpenAI before the commit', async () => {
    const h = harness();
    const session = await startListening(h);
    session.stop();
    await h.advance(TAIL_MS - 1);
    expect(h.dc.sent).toEqual([]);
    expect(h.stream.track.stopped).toBe(false);
    expect(h.lastView()).toEqual({ phase: 'finishing', live: true, preview: '' });
    await h.advance(1);
    expect(h.dc.sent).toEqual([COMMIT]);
    expect(h.stream.track.stopped).toBe(true);
  });

  it('asks the speaker split for patient-preferred fields and inserts only the patient words', async () => {
    const h = harness({
      speakers: {
        status: 201,
        body: { text: 'What brings you in? Itching for a week.', segments: [], speakers: { doctorText: 'What brings you in?', patientText: 'Itching for a week.' } },
      },
    });
    const session = await startListening(h, 'patient-preferred');
    session.stop();
    await h.advance(TAIL_MS);
    h.dc.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });
    h.dc.emit({ type: COMPLETED, item_id: 'a', transcript: 'What brings you in? Itching for a week.' });

    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Itching for a week.', via: 'live' });
    expect(h.calls[1]).toEqual({ url: '/api/visits/transcribe/speakers', body: { text: 'What brings you in? Itching for a week.' } });
  });

  it('falls back to the full live text when the speaker split fails', async () => {
    const h = harness({ speakers: { status: 502, body: 'bad gateway' } });
    const session = await startListening(h, 'patient-preferred');
    session.stop();
    await h.advance(TAIL_MS);
    h.dc.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });
    h.dc.emit({ type: COMPLETED, item_id: 'a', transcript: 'Itching for a week.' });

    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Itching for a week.', via: 'live' });
    expect(h.urls()).toEqual(['/api/visits/transcribe/live', '/api/visits/transcribe/speakers']);
  });

  it('falls back to the full live text when the speaker split never answers', async () => {
    const h = harness({ speakers: 'never' });
    const session = await startListening(h, 'patient-preferred');
    session.stop();
    await h.advance(TAIL_MS);
    h.dc.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });
    h.dc.emit({ type: COMPLETED, item_id: 'a', transcript: 'Itching for a week.' });
    await h.advance(DICTATION_LIMITS.requestMs);

    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Itching for a week.', via: 'live' });
  });

  it('rejects with MicUnavailableError when the microphone is denied', async () => {
    const h = harness({ micError: new Error('Permission denied') });
    const attempt = h.start();
    await expect(attempt).rejects.toEqual(new MicUnavailableError('Permission denied', 'denied'));
    await expect(attempt).rejects.toMatchObject({ reason: 'denied' });
    expect(h.calls).toEqual([]);
  });

  it('ends with a sign-in error and no upload when the live endpoint answers 401', async () => {
    const h = harness({ live: { status: 401, body: { message: 'Unauthorized' } } });
    const session = await h.start();

    await expect(session.outcome).resolves.toEqual({ kind: 'error', title: 'Speech-to-text error', description: 'Your session expired. Please sign in again.' });
    expect((handleUnauthorizedRedirect as jest.Mock).mock.calls[0][0].status).toBe(401);
    expect(h.urls()).toEqual(['/api/visits/transcribe/live']);
    expect(h.stream.track.stopped).toBe(true);
  });

  it('ends with an unavailable error and no upload when the live endpoint answers 503', async () => {
    const h = harness({ live: { status: 503, body: { message: 'Speech transcription is unavailable.' } } });
    const session = await h.start();

    await expect(session.outcome).resolves.toEqual({
      kind: 'error',
      title: 'Speech-to-text error',
      description: 'Speech transcription is temporarily unavailable. Try again shortly.',
    });
    expect(h.urls()).toEqual(['/api/visits/transcribe/live']);
  });

  it('keeps recording after a 502, notices once, and uploads the recording on stop', async () => {
    const h = harness({ live: { status: 502, body: { message: 'Live transcription could not start.' } } });
    const session = await h.start();
    await flush();

    expect(h.notices).toEqual([{ title: 'Live preview unavailable', description: 'Still recording. Your dictation will be transcribed when you stop.' }]);
    expect(h.lastView()).toEqual({ phase: 'listening', live: false, preview: '' });
    expect(h.peer.closed).toBe(true);

    session.stop();

    await h.advance(TAIL_MS);
    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Recorded words', via: 'recorded' });
    expect(h.urls()).toEqual(['/api/visits/transcribe/live', '/api/visits/transcribe']);
    expect((h.calls[1].body as Blob).size).toBe(5_000);
    expect(h.notices).toHaveLength(1);
  });

  it('demotes to recording when the data channel does not open in time', async () => {
    const h = harness();
    const session = await h.start();
    await flush();
    expect(h.lastView()).toEqual({ phase: 'connecting', live: true, preview: '' });

    await h.advance(1_000);
    expect(h.notices.map((n) => n.title)).toEqual(['Live preview unavailable']);
    expect(h.lastView()).toEqual({ phase: 'listening', live: false, preview: '' });

    h.dc.open();
    session.stop();
    await h.advance(TAIL_MS);
    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Recorded words', via: 'recorded' });
    expect(h.dc.sent).toEqual([]);
  });

  it('uploads the recording when the data channel closes mid-dictation and ignores its late events', async () => {
    const h = harness();
    const session = await startListening(h);
    h.dc.emit({ type: DELTA, item_id: 'a', delta: 'partial words' });
    h.dc.remoteClose();
    h.dc.emit({ type: DELTA, item_id: 'a', delta: ' after close' });
    expect(h.lastView()).toEqual({ phase: 'listening', live: false, preview: '' });

    session.stop();

    await h.advance(TAIL_MS);
    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Recorded words', via: 'recorded' });
  });

  it('uploads the recording when a live item fails, never mixing in live text', async () => {
    const h = harness();
    const session = await startListening(h);
    session.stop();
    await h.advance(TAIL_MS);
    h.dc.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });
    h.dc.emit({ type: DELTA, item_id: 'a', delta: 'half a sentence' });
    h.dc.emit({ type: FAILED, item_id: 'a' });

    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Recorded words', via: 'recorded' });
    expect(h.notices).toEqual([]);
  });

  it('uploads the recording when the final transcript does not arrive in time', async () => {
    const h = harness();
    const session = await startListening(h);
    session.stop();
    await h.advance(TAIL_MS);
    h.dc.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });

    await h.advance(2_000);
    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Recorded words', via: 'recorded' });
  });

  it('resolves cancelled without uploading when disposed while finishing', async () => {
    const h = harness();
    const session = await startListening(h);
    session.stop();
    await h.advance(TAIL_MS);
    session.dispose();
    h.dc.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });
    await h.advance(5_000);

    await expect(session.outcome).resolves.toEqual({ kind: 'cancelled' });
    expect(h.urls()).toEqual(['/api/visits/transcribe/live']);
  });

  it('does not upload when disposed right after stop in recorded mode', async () => {
    const h = harness({ rtc: false });
    const session = await h.start();
    session.stop();
    session.dispose();
    await flush();

    await expect(session.outcome).resolves.toEqual({ kind: 'cancelled' });
    expect(h.urls()).toEqual([]);
    expect(h.stream.track.stopped).toBe(true);
  });

  it('stops itself at the time limit with a notice', async () => {
    const h = harness();
    const session = await startListening(h);
    await h.advance(120_000);
    await h.advance(TAIL_MS);

    expect(h.notices).toEqual([{ title: 'Stopped at 2 minutes', description: 'Dictation stops automatically. Your recording is being transcribed.' }]);
    expect(h.dc.sent).toEqual([COMMIT]);
    h.dc.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });
    h.dc.emit({ type: COMPLETED, item_id: 'a', transcript: 'Long dictation.' });
    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Long dictation.', via: 'live' });
  });

  it('reports empty for a tiny recording without uploading it', async () => {
    const h = harness({ recordedBytes: 200 });
    const session = await startListening(h);
    session.stop();
    await h.advance(TAIL_MS);
    h.dc.emit({ type: 'error', error: { type: 'invalid_request_error', code: 'input_audio_buffer_commit_empty', message: 'empty', param: null } });

    await expect(session.outcome).resolves.toEqual({ kind: 'empty' });
    expect(h.urls()).toEqual(['/api/visits/transcribe/live']);
  });

  it('uploads when live settles with no text but the recording has audio', async () => {
    const h = harness();
    const session = await startListening(h);
    session.stop();
    await h.advance(TAIL_MS);
    h.dc.emit({ type: 'error', error: { type: 'invalid_request_error', code: 'input_audio_buffer_commit_empty', message: 'empty', param: null } });

    await expect(session.outcome).resolves.toEqual({ kind: 'text', text: 'Recorded words', via: 'recorded' });
  });

  it('records without a live connection in browsers lacking WebRTC', async () => {
    const h = harness({ rtc: false, upload: { status: 413, body: { message: 'too large' } } });
    const session = await h.start('patient-preferred');

    expect(h.views).toEqual([{ phase: 'listening', live: false, preview: '' }]);
    expect(h.notices.map((n) => n.title)).toEqual(['Live preview unavailable']);
    session.stop();
    await h.advance(TAIL_MS);
    await expect(session.outcome).resolves.toEqual({ kind: 'error', title: 'Speech-to-text error', description: 'The recording is too large. Try a shorter clip.' });
    expect(h.urls()).toEqual(['/api/visits/transcribe']);
  });
});

describe('startDictationSession holds the microphone for one dictation at a time', () => {
  const BUSY = new MicUnavailableError('Another dictation is already running. Stop it first.', 'busy');

  it('refuses a second start while the first is listening, without opening the microphone again', async () => {
    const h = harness();
    await startListening(h);
    const second = harness();

    await expect(second.start()).rejects.toEqual(BUSY);
    await expect(second.start()).rejects.toMatchObject({ reason: 'busy' });
    expect(second.calls).toEqual([]);
    expect(second.views).toEqual([]);
  });

  it('refuses a second start while the first is still waiting for the microphone', async () => {
    let grant!: () => void;
    const granted = new Promise<void>((resolve) => { grant = resolve; });
    const h = harness();
    const first = startDictationSession({
      preference: 'full-transcript',
      onView: () => {},
      onNotice: () => {},
      deps: {
        getUserMedia: async () => { await granted; return h.stream as unknown as MediaStream; },
        RTCPeerConnection: undefined,
        MediaRecorder: fakeRecorder(5_000) as unknown as typeof MediaRecorder,
      },
    });

    await expect(harness().start()).rejects.toEqual(BUSY);
    grant();
    (await first).dispose();
  });

  it('lets a new dictation start once the first has settled with text', async () => {
    const h = harness({ rtc: false });
    const first = await h.start();
    first.stop();
    await h.advance(TAIL_MS);
    await expect(first.outcome).resolves.toEqual({ kind: 'text', text: 'Recorded words', via: 'recorded' });

    const next = harness({ rtc: false });
    await next.start();
    expect(next.views).toEqual([{ phase: 'listening', live: false, preview: '' }]);
  });

  it('lets a new dictation start once the first was disposed', async () => {
    const h = harness();
    const first = await startListening(h);
    first.dispose();

    const next = harness({ rtc: false });
    await next.start();
    expect(next.views).toEqual([{ phase: 'listening', live: false, preview: '' }]);
  });

  it('lets a new dictation start after a start that failed for the microphone', async () => {
    await expect(harness({ micError: new Error('Permission denied') }).start()).rejects.toEqual(new MicUnavailableError('Permission denied', 'denied'));

    const next = harness({ rtc: false });
    await next.start();
    expect(next.views).toEqual([{ phase: 'listening', live: false, preview: '' }]);
  });

  it('lets a new dictation start after a start in a browser that cannot record', async () => {
    const refused = startDictationSession({ preference: 'full-transcript', onView: () => {}, onNotice: () => {}, deps: { getUserMedia: undefined } });
    await expect(refused).rejects.toEqual(new MicUnavailableError('Microphone recording is not supported in this browser.', 'unsupported'));

    const next = harness({ rtc: false });
    await next.start();
    expect(next.views).toEqual([{ phase: 'listening', live: false, preview: '' }]);
  });
});
