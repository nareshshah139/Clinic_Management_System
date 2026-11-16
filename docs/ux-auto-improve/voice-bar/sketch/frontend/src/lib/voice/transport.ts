// Repo path: frontend/src/lib/voice/transport.ts
// Everything that touches the network or the microphone. Returns domain values or throws
// VoiceFailure; HTTP status codes and wire shapes stop here. Replaces lib/speech-to-text.ts and
// hooks/useSpeechToTextRecorder.ts, which package V deletes.

import { VOICE_ROUTES, VOICE_STATUS_ROUTE, type ParsedByIntent, type VoiceIntent, type VoiceStatus } from '@cms/shared-types/voice';
import type { Failure } from './types';

export type TranscribeContext = 'clinical' | 'plain';

export interface Transport {
  status(): Promise<VoiceStatus>;
  /** POST /api/visits/transcribe multipart { file, context }. Never sends diarize. */
  transcribe(audio: RecordedAudio, context: TranscribeContext, signal: AbortSignal): Promise<string>;
  /** POST /api/{VOICE_ROUTES[intent]} { text }. */
  parse<K extends VoiceIntent>(intent: K, text: string, signal: AbortSignal): Promise<ParsedByIntent[K]>;
  /** Opens the microphone. `onLimit` fires at MAX_RECORDING_MS so the store can send `stop`. */
  openMic(signal: AbortSignal, onLimit: () => void): Promise<MicSession>;
}

/** Thrown by every Transport method except status(). AbortError is rethrown as is. */
export class VoiceFailure extends Error {
  constructor(readonly failure: Failure) { super(failure.kind); }
}

export interface RecordedAudio { blob: Blob; filename: 'recording.webm' | 'recording.m4a'; durationMs: number }

/** One recording. Owns its MediaStream and MediaRecorder; no React state, no refs, no mounted flag. */
export interface MicSession {
  /** Stops the mic and resolves with the audio. Under MIN_RECORDING_MS rejects heard-nothing. */
  finish(): Promise<RecordedAudio>;
  /** Stops the mic and drops everything. Idempotent. */
  cancel(): void;
}

export const MIN_RECORDING_MS = 1_000;
export const MAX_RECORDING_MS = 600_000;
/** VoiceBar shows "Stopping in N s" from here. */
export const WARN_AT_MS = 570_000;

/**
 * @cc [owner:nareshshah139,label:accessibility] voice-failure-copy
 * Every transport failure MUST map to exactly one Failure kind with its retry step: 401
 * unauthorised, 403 forbidden (never "session expired"), 413 recording too long, 429 rate limited,
 * a 503 naming the key as not configured, network errors offline, others failed at that step.
 */
export function toFailure(step: 'transcribe' | 'interpret', status: number | null, body: string, error?: unknown): Failure {
  // error is TypeError (fetch rejected)                      -> offline, retry step
  // 401 -> unauthorised (handleUnauthorizedRedirect(401) runs, lib/authRedirect.ts:5)
  // 403 -> forbidden
  // 413 -> recording-too-long
  // 429 -> rate-limited, retry step
  // 503 and body matches /OPENAI_API_KEY|not set up|not configured/i -> not-configured
  // other (408, 503 timeout, 5xx, bad JSON) -> step === 'transcribe' ? transcribe-failed : understand-failed
  throw new Error('not implemented');
}

/** getUserMedia rejection -> NotAllowedError|SecurityError mic-blocked, NotFoundError|OverconstrainedError mic-missing, other heard-nothing. */
export function micFailure(error: unknown): Failure {
  throw new Error('not implemented');
}

/**
 * @cc [owner:nareshshah139,label:product] voice-status-once
 * Status MUST be requested at most once per page load from GET /api/voice/status, a network error
 * MUST resolve as configured, and the paid /visits/transcribe/health route MUST NOT be called.
 */
export function fetchVoiceStatus(): Promise<VoiceStatus> {
  // module-level promise cache: the first call fetches `/api/${VOICE_STATUS_ROUTE}`, later calls reuse it
  // network error -> { configured: true } (the server's own 503 is the authority on a missing key)
  void VOICE_STATUS_ROUTE;
  throw new Error('not implemented');
}

export function createTransport(): Transport {
  // status: fetchVoiceStatus
  // parse: apiClient.post(`/${VOICE_ROUTES[intent]}`, { text }, { timeoutMs: 20_000 }); shape-check the
  //        response against the intent (unknown keys or an id-looking field -> understand-failed)
  // openMic: !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder -> recording-unsupported
  //          48 kHz echo-cancelled mono; webm, then mp4 fallback; setTimeout(onLimit, MAX_RECORDING_MS)
  void VOICE_ROUTES;
  throw new Error('not implemented');
}

/** Whether this browser can record at all; decided once when the bar mounts. */
export function micSupported(): boolean { throw new Error('not implemented'); }
