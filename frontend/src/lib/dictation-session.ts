import { handleUnauthorizedRedirect } from '@/lib/authRedirect';
import {
  emptyTranscript,
  parseLiveEvent,
  reduceTranscript,
  settlement,
  transcriptText,
  type LiveTranscript,
} from '@/lib/live-transcript';
import {
  formatSpeechToTextError,
  pickSpeechToTextInsert,
  type SpeechToTextPreference,
  type SpeechToTextResponse,
} from '@/lib/speech-to-text';
import { getErrorMessage } from '@/lib/utils';

export type DictationPhase = 'connecting' | 'listening' | 'finishing';
export interface DictationView { phase: DictationPhase; live: boolean; preview: string }
export type DictationOutcome =
  | { kind: 'text'; text: string; via: 'live' | 'recorded' }
  | { kind: 'empty' }
  | { kind: 'cancelled' }
  | { kind: 'error'; title: string; description: string };
export interface DictationSession { readonly outcome: Promise<DictationOutcome>; stop(): void; dispose(): void }
export type DictationNotice = { title: string; description: string };

export class MicUnavailableError extends Error {
  constructor(message: string, readonly reason: 'unsupported' | 'denied' | 'busy') {
    super(message);
    this.name = 'MicUnavailableError';
  }
}

export const DICTATION_LIMITS = { maxMs: 600_000, connectMs: 10_000, finishMs: 8_000, tailMs: 300, minRecordedBytes: 1_000 };

type TimerId = unknown;
type RecorderConstructor = {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(type: string): boolean;
};
interface DictationDeps {
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | undefined;
  RTCPeerConnection: (new (configuration?: RTCConfiguration) => RTCPeerConnection) | undefined;
  MediaRecorder: RecorderConstructor | undefined;
  fetch: typeof fetch;
  setTimeout: (callback: () => void, ms: number) => TimerId;
  clearTimeout: (id: TimerId) => void;
}

function browserDeps(): DictationDeps {
  const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  return {
    getUserMedia: mediaDevices?.getUserMedia ? (constraints) => mediaDevices.getUserMedia(constraints) : undefined,
    RTCPeerConnection: globalThis.RTCPeerConnection,
    MediaRecorder: globalThis.MediaRecorder,
    fetch: (input, init) => globalThis.fetch(input, init),
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
  };
}

const SPEECH_ERROR_TITLE = 'Speech-to-text error';
const DEMOTED_NOTICE: DictationNotice = {
  title: 'Live preview unavailable',
  description: 'Still recording. Your dictation will be transcribed when you stop.',
};

/**
 * @cc [owner:nareshshah139,label:reliability] one-dictation-at-a-time
 * At most one dictation session MUST hold the microphone at a time, and a second start MUST be refused with a clear message until the first has settled or been disposed.
 */
let microphoneHolder: object | null = null;

type DictationOptions = {
  preference: SpeechToTextPreference;
  onView(v: DictationView): void;
  onNotice(n: DictationNotice): void;
  limits?: Partial<typeof DICTATION_LIMITS>;
  deps?: Partial<DictationDeps>;
};

export async function startDictationSession(o: DictationOptions): Promise<DictationSession> {
  if (microphoneHolder) throw new MicUnavailableError('Another dictation is already running. Stop it first.', 'busy');
  const holder = {};
  microphoneHolder = holder;
  const release = () => {
    if (microphoneHolder === holder) microphoneHolder = null;
  };
  try {
    return await openDictationSession(o, release);
  } catch (error) {
    release();
    throw error;
  }
}

async function openDictationSession(o: DictationOptions, release: () => void): Promise<DictationSession> {
  const limits = { ...DICTATION_LIMITS, ...o.limits };
  const deps: DictationDeps = { ...browserDeps(), ...o.deps };
  const Recorder = deps.MediaRecorder;
  if (!deps.getUserMedia || !Recorder) {
    throw new MicUnavailableError('Microphone recording is not supported in this browser.', 'unsupported');
  }

  let stream: MediaStream;
  try {
    stream = await deps.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (error) {
    throw new MicUnavailableError(getErrorMessage(error) || 'Check browser permissions and try again.', 'denied');
  }

  const mimeType = Recorder.isTypeSupported('audio/webm') ? 'audio/webm' : Recorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
  let recorder: MediaRecorder;
  try {
    recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw new MicUnavailableError(getErrorMessage(error) || 'Microphone recording is not supported in this browser.', 'unsupported');
  }

  const chunks: Blob[] = [];
  const recordedType = mimeType || 'audio/webm';
  const recording = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: recordedType }));
  });
  recorder.start(1000);

  let resolveOutcome!: (outcome: DictationOutcome) => void;
  const outcome = new Promise<DictationOutcome>((resolve) => {
    resolveOutcome = resolve;
  });
  const aborter = new AbortController();

  let ended = false;
  let phase: DictationPhase = 'connecting';
  let live = Boolean(deps.RTCPeerConnection);
  let uploading = false;
  let stopSent = false;
  let transcript: LiveTranscript = emptyTranscript;
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  const timers = new Set<TimerId>();

  const arm = (callback: () => void, ms: number) => {
    const id = deps.setTimeout(() => {
      timers.delete(id);
      callback();
    }, ms);
    timers.add(id);
    return id;
  };
  const disarm = (id: TimerId | null) => {
    if (id === null) return;
    deps.clearTimeout(id);
    timers.delete(id);
  };

  const emitView = () => {
    if (ended) return;
    o.onView({ phase, live, preview: live ? transcriptText(transcript) : '' });
  };

  const stopCapture = () => {
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {}
    stream.getTracks().forEach((track) => track.stop());
  };

  let connectTimer: TimerId | null = null;
  let finishTimer: TimerId | null = null;
  const leaveLive = () => {
    live = false;
    disarm(connectTimer);
    disarm(finishTimer);
    if (dc) {
      dc.onopen = dc.onmessage = dc.onclose = null;
      try { dc.close(); } catch {}
    }
    if (pc) {
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch {}
    }
    dc = null;
    pc = null;
  };

  const finish = (result: DictationOutcome) => {
    if (ended) return;
    ended = true;
    timers.forEach((id) => deps.clearTimeout(id));
    timers.clear();
    leaveLive();
    stopCapture();
    release();
    resolveOutcome(result);
  };

  const upload = async () => {
    if (ended || uploading) return;
    uploading = true;
    leaveLive();
    stopCapture();
    const blob = await recording;
    if (ended) return;
    if (blob.size < limits.minRecordedBytes) return finish({ kind: 'empty' });

    const formData = new FormData();
    formData.append('file', blob, recordedType === 'audio/mp4' ? 'recording.m4a' : 'recording.webm');
    try {
      const response = await deps.fetch('/api/visits/transcribe', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: aborter.signal,
      });
      if (ended) return;
      if (!response.ok) {
        handleUnauthorizedRedirect(response);
        const detail = await response.text().catch(() => '');
        return finish({ kind: 'error', title: SPEECH_ERROR_TITLE, description: formatSpeechToTextError(response.status, detail) });
      }
      const data = (await response.json()) as SpeechToTextResponse;
      const text = pickSpeechToTextInsert(data, o.preference);
      finish(text ? { kind: 'text', text, via: 'recorded' } : { kind: 'empty' });
    } catch (error) {
      finish({ kind: 'error', title: SPEECH_ERROR_TITLE, description: getErrorMessage(error) || 'Please try again.' });
    }
  };

  // Once stop() has been pressed the notice copy ("Still recording") would be false, so a
  // failure while finishing goes straight to the upload.
  const demote = () => {
    if (ended || !live) return;
    leaveLive();
    if (phase === 'finishing') {
      void upload();
      return;
    }
    phase = 'listening';
    o.onNotice(DEMOTED_NOTICE);
    emitView();
  };

  const finishLive = async (text: string) => {
    if (o.preference === 'full-transcript') return finish({ kind: 'text', text, via: 'live' });
    try {
      const response = await deps.fetch('/api/visits/transcribe/speakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        credentials: 'include',
        signal: aborter.signal,
      });
      if (ended) return;
      const data = response.ok ? ((await response.json()) as SpeechToTextResponse) : null;
      finish({ kind: 'text', text: pickSpeechToTextInsert(data, 'patient-preferred') || text, via: 'live' });
    } catch {
      finish({ kind: 'text', text, via: 'live' });
    }
  };

  const settleIfDone = () => {
    const { settled, hasFailure } = settlement(transcript);
    if (hasFailure) return demote();
    if (!settled) return;
    const text = transcriptText(transcript);
    leaveLive();
    if (text) void finishLive(text);
    else void upload();
  };

  const onLiveMessage = (raw: unknown) => {
    if (ended || !live || typeof raw !== 'string') return;
    const event = parseLiveEvent(raw);
    if (!event) return;
    if (event.type === 'fatal') return demote();
    transcript = reduceTranscript(transcript, event, stopSent);
    emitView();
    if (phase === 'finishing') settleIfDone();
  };

  const connect = async (PeerConnection: NonNullable<DictationDeps['RTCPeerConnection']>) => {
    connectTimer = arm(demote, limits.connectMs);
    const peer = new PeerConnection();
    pc = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    const channel = peer.createDataChannel('oai-events');
    dc = channel;
    channel.onopen = () => {
      if (!live || phase !== 'connecting') return;
      disarm(connectTimer);
      phase = 'listening';
      emitView();
    };
    channel.onmessage = (event) => onLiveMessage(event.data);
    channel.onclose = demote;
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') demote();
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    if (!live) return;
    const response = await deps.fetch('/api/visits/transcribe/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp: offer.sdp }),
      credentials: 'include',
      signal: aborter.signal,
    });
    if (!live) return;
    if (response.status === 401 || response.status === 403 || response.status === 503) {
      handleUnauthorizedRedirect(response);
      return finish({ kind: 'error', title: SPEECH_ERROR_TITLE, description: formatSpeechToTextError(response.status) });
    }
    if (!response.ok) return demote();
    const answer = (await response.json()) as { sdp?: unknown };
    if (!live) return;
    if (typeof answer?.sdp !== 'string') return demote();
    await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
  };

  let maxTimer: TimerId | null = null;
  const stop = () => {
    if (ended || phase === 'finishing') return;
    phase = 'finishing';
    disarm(maxTimer);
    emitView();
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {}
    if (!live) return void upload();
    if (dc?.readyState !== 'open') return demote();
    // Audio rides RTP and the commit rides the data channel, so a commit sent at once can
    // overtake the last words still in flight.
    arm(() => {
      if (ended || !live) return;
      if (dc?.readyState !== 'open') return demote();
      dc.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      stopSent = true;
      stream.getTracks().forEach((track) => track.stop());
      finishTimer = arm(demote, limits.finishMs);
    }, limits.tailMs);
  };

  maxTimer = arm(() => {
    const minutes = Math.round(limits.maxMs / 60_000);
    o.onNotice({ title: `Stopped at ${minutes} minutes`, description: 'Dictation stops automatically. Your recording is being transcribed.' });
    stop();
  }, limits.maxMs);

  const PeerConnection = deps.RTCPeerConnection;
  if (PeerConnection) {
    emitView();
    connect(PeerConnection).catch(demote);
  } else {
    phase = 'listening';
    o.onNotice(DEMOTED_NOTICE);
    emitView();
  }

  return {
    outcome,
    stop,
    dispose: () => {
      if (ended) return;
      aborter.abort();
      finish({ kind: 'cancelled' });
    },
  };
}
