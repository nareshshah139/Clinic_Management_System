import { COMMAND_EXAMPLE, parseVoiceCommand, type HeardCommand } from '@/lib/voice-command';
import type { VoiceDraftLine, VoiceFillFields } from '@/lib/voice-fill';

export const VOICE_BAR_COPY = {
  commandTarget: 'Command',
  commandHint: `Say or type a command, e.g. ${COMMAND_EXAMPLE}`,
  targetLabel: 'Send to',
  textBoxLabel: 'Say or type a request',
  speak: 'Speak',
  stopAndSend: 'Stop and send',
  send: 'Send',
  hideBar: 'Hide voice bar',
  showBar: 'Show voice bar',
  showBarTitle: 'Show voice bar (Ctrl+/)',
  stripLabel: 'Voice bar',
  listening: 'Listening. Press Enter to send, or Escape to discard.',
  working: 'Working it out…',
  heard: 'Heard',
  edit: 'Edit',
  editLabel: 'Edit what was heard',
  addToForm: 'Add to form',
  discard: 'Discard',
  nothingTicked: 'Tick at least one line to add it to the form.',
  undo: 'Undo',
  done: 'Done',
  retry: 'Try again',
  dismiss: 'Dismiss',
  undone: 'Undone. The form is back to how it was.',
  pageChanged: 'The page changed, so this draft was discarded.',
  recordingDiscarded: 'Recording discarded.',
  nothingHeard: 'Did not catch anything. Please try again.',
  nothingUsable: 'Could not find anything to fill in from that. Please say it again.',
  applyFailed: 'Could not add this to the form. Nothing was changed. Please try again.',
  micBlocked: 'Microphone is blocked. Allow it from the lock icon in the address bar, then try again. You can also type here.',
  cannotRecord: 'This browser cannot record audio. Type here instead.',
  requestFailed: 'Could not work out the request just now. Try again, or fill the form by hand.',
  draftReady: (count: number) => `${count} ${count === 1 ? 'line' : 'lines'} ready to review.`,
  filled: (form: string, labels: string[]) => `Added to ${form}: ${labels.join(', ')}.`,
  notSavedWithUndo: 'Nothing is saved until you save the form.',
  notSavedDialog: (form: string) => `${form} is open. Nothing is saved until you press its save button.`,
} as const;

export const VOICE_BAR_COLLAPSED_KEY = 'cms-voice-bar-collapsed';

export type VoiceBarTarget = { kind: 'command' } | { kind: 'form'; registrationId: string };
export type VoiceBarRetry = { kind: 'audio'; audio: Blob; filename: string } | { kind: 'text'; text: string };
export type VoiceBarState =
  | { kind: 'idle'; notice: string | null }
  | { kind: 'listening'; target: VoiceBarTarget; startedAt: number }
  | { kind: 'working'; target: VoiceBarTarget; attempt: number; retry: VoiceBarRetry }
  | { kind: 'draft'; registrationId: string; heard: string; lines: VoiceDraftLine[]; kept: string[]; error: string | null }
  | { kind: 'applied'; registrationId: string; labels: string[]; undo: (() => void) | null; opened: boolean }
  | { kind: 'failed'; target: VoiceBarTarget; message: string; retry: VoiceBarRetry | null }
  | { kind: 'confirming'; heard: HeardCommand };

export type VoiceBarEvent =
  | { type: 'listen'; target: VoiceBarTarget; startedAt: number }
  | { type: 'discard-recording' }
  | { type: 'recorder-failed'; message: string }
  | { type: 'send'; target: VoiceBarTarget; retry: VoiceBarRetry; attempt: number }
  | { type: 'heard'; attempt: number; transcript: string; fields: VoiceFillFields; lines: VoiceDraftLine[] }
  | { type: 'request-failed'; attempt: number; message: string }
  | { type: 'toggle-line'; id: string }
  | { type: 'applied'; registrationId: string; labels: string[]; undo: (() => void) | null }
  | { type: 'apply-failed'; registrationId: string }
  | { type: 'registration'; activeId: string | null }
  | { type: 'form-touched' }
  | { type: 'dismiss'; notice?: string };

export const VOICE_BAR_IDLE: VoiceBarState = { kind: 'idle', notice: null };

const idle = (notice: string | null = null): VoiceBarState => ({ kind: 'idle', notice });

/** The registration a state belongs to, or null when it outlives page changes. */
export function voiceBarRegistrationOf(state: VoiceBarState): string | null {
  switch (state.kind) {
    case 'listening':
    case 'working':
    case 'failed':
      return state.target.kind === 'form' ? state.target.registrationId : null;
    case 'draft':
    case 'applied':
      return state.registrationId;
    default:
      return null;
  }
}

/** Maps the recorder's own failure titles to the bar's wording. */
export function recorderFailureMessage(title: string): string {
  if (title === 'Voice capture unavailable') return VOICE_BAR_COPY.cannotRecord;
  if (title === 'Microphone access denied') return VOICE_BAR_COPY.micBlocked;
  return VOICE_BAR_COPY.nothingHeard;
}

/**
 * @cc [owner:nareshshah139,label:product] voice-bar-draft-bound-to-scope
 * A recording, request, draft, failure or pending Undo that belongs to a form registration MUST become idle with the
 * notice "The page changed, so this draft was discarded." as soon as that registration unmounts or its scope changes,
 * and its Undo MUST NOT stay reachable.
 */
export function voiceBarReducer(state: VoiceBarState, event: VoiceBarEvent): VoiceBarState {
  switch (event.type) {
    case 'registration': {
      const owner = voiceBarRegistrationOf(state);
      return owner !== null && owner !== event.activeId ? idle(VOICE_BAR_COPY.pageChanged) : state;
    }
    case 'listen':
      return state.kind === 'listening' || state.kind === 'working'
        ? state
        : { kind: 'listening', target: event.target, startedAt: event.startedAt };
    case 'discard-recording':
      return state.kind === 'listening' ? idle(VOICE_BAR_COPY.recordingDiscarded) : state;
    case 'recorder-failed':
      return state.kind === 'listening'
        ? { kind: 'failed', target: state.target, message: event.message, retry: null }
        : state;
    case 'send':
      return { kind: 'working', target: event.target, attempt: event.attempt, retry: event.retry };
    case 'heard': {
      if (state.kind !== 'working' || state.attempt !== event.attempt) return state;
      const transcript = event.transcript.trim();
      if (!transcript) return { kind: 'failed', target: state.target, message: VOICE_BAR_COPY.nothingHeard, retry: null };
      if (state.target.kind === 'command') {
        return { kind: 'confirming', heard: { id: event.attempt, transcript, command: parseVoiceCommand(event.fields) } };
      }
      if (!event.lines.length) return { kind: 'failed', target: state.target, message: VOICE_BAR_COPY.nothingUsable, retry: null };
      return {
        kind: 'draft',
        registrationId: state.target.registrationId,
        heard: transcript,
        lines: event.lines,
        kept: event.lines.map((line) => line.id),
        error: null,
      };
    }
    case 'request-failed':
      return state.kind === 'working' && state.attempt === event.attempt
        ? { kind: 'failed', target: state.target, message: event.message, retry: state.retry }
        : state;
    case 'toggle-line': {
      if (state.kind !== 'draft') return state;
      const kept = state.kept.includes(event.id)
        ? state.kept.filter((id) => id !== event.id)
        : state.lines.map((line) => line.id).filter((id) => id === event.id || state.kept.includes(id));
      return { ...state, kept, error: null };
    }
    case 'applied':
      return state.kind === 'draft' && state.registrationId === event.registrationId
        ? { kind: 'applied', registrationId: event.registrationId, labels: event.labels, undo: event.undo, opened: event.undo === null }
        : state;
    case 'apply-failed':
      return state.kind === 'draft' && state.registrationId === event.registrationId
        ? { ...state, error: VOICE_BAR_COPY.applyFailed }
        : state;
    case 'form-touched':
      return state.kind === 'applied' && state.undo ? { ...state, undo: null } : state;
    case 'dismiss':
      return idle(event.notice ?? null);
  }
}
