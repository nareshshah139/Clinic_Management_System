import { voiceBarReducer, type VoiceBarState, type VoiceBarTarget } from '@/lib/voice-bar';
import type { VoiceDraftLine } from '@/lib/voice-fill';

jest.mock('@/lib/api', () => ({ apiClient: {} }));

const visit: VoiceBarTarget = { kind: 'form', registrationId: 'r1' };
const command: VoiceBarTarget = { kind: 'command' };
// A plain stand-in: jest crashes printing a diff that holds a jsdom Blob.
const audio = { size: 5, type: 'audio/webm' } as unknown as Blob;
const lines: VoiceDraftLine[] = [
  { id: 'diagnosis', label: 'Diagnosis', value: 'Eczema', fields: { diagnosis: 'Eczema' } },
  { id: 'advice', label: 'Advice', value: 'Moisturise twice a day', fields: { advice: 'Moisturise twice a day' } },
  { id: 'followUp', label: 'Follow-up', value: '4 weeks', fields: { followUp: '4 weeks' } },
];
const undo = () => {};

const idle: VoiceBarState = { kind: 'idle', notice: null };
const listening: VoiceBarState = { kind: 'listening', target: visit, startedAt: 1000 };
const working: VoiceBarState = { kind: 'working', target: visit, attempt: 3, retry: { kind: 'text', text: 'eczema' } };
const draft: VoiceBarState = { kind: 'draft', registrationId: 'r1', heard: 'eczema', lines, kept: ['diagnosis', 'advice', 'followUp'], error: null };
const applied: VoiceBarState = { kind: 'applied', registrationId: 'r1', labels: ['Diagnosis'], undo };

describe('voiceBarReducer', () => {
  it('starts listening from idle with the chosen target', () => {
    expect(voiceBarReducer(idle, { type: 'listen', target: visit, startedAt: 1000 })).toEqual(listening);
  });

  it('does not start a second recording while one is in flight', () => {
    expect(voiceBarReducer(working, { type: 'listen', target: command, startedAt: 2000 })).toBe(working);
  });

  it('discards a recording with Escape and says so', () => {
    expect(voiceBarReducer(listening, { type: 'discard-recording' })).toEqual({ kind: 'idle', notice: 'Recording discarded.' });
  });

  it('turns a recorder failure into a failure with nothing to retry', () => {
    expect(voiceBarReducer(listening, { type: 'recorder-failed', message: 'Microphone is blocked.' }))
      .toEqual({ kind: 'failed', target: visit, message: 'Microphone is blocked.', retry: null });
  });

  it('sends recorded audio as the current attempt', () => {
    expect(voiceBarReducer(listening, { type: 'send', target: visit, retry: { kind: 'audio', audio, filename: 'recording.webm' }, attempt: 4 }))
      .toEqual({ kind: 'working', target: visit, attempt: 4, retry: { kind: 'audio', audio, filename: 'recording.webm' } });
  });

  it('opens a draft with every line kept when the current attempt is heard', () => {
    const next = voiceBarReducer(working, { type: 'heard', attempt: 3, transcript: '  Eczema on both elbows ', fields: { diagnosis: 'Eczema' }, lines });
    expect(next).toEqual({
      kind: 'draft', registrationId: 'r1', heard: 'Eczema on both elbows', lines, kept: ['diagnosis', 'advice', 'followUp'], error: null,
    });
  });

  it('drops a result for an attempt other than the current one', () => {
    expect(voiceBarReducer(working, { type: 'heard', attempt: 2, transcript: 'old', fields: {}, lines })).toBe(working);
    expect(voiceBarReducer(working, { type: 'request-failed', attempt: 2, message: 'old failure' })).toBe(working);
  });

  it('fails an empty transcript with "Did not catch anything"', () => {
    expect(voiceBarReducer(working, { type: 'heard', attempt: 3, transcript: '   ', fields: {}, lines: [] }))
      .toEqual({ kind: 'failed', target: visit, message: 'Did not catch anything. Please try again.', retry: null });
  });

  it('fails a form result with no lines to fill', () => {
    expect(voiceBarReducer(working, { type: 'heard', attempt: 3, transcript: 'hello there', fields: {}, lines: [] }))
      .toEqual({ kind: 'failed', target: visit, message: 'Could not find anything to fill in from that. Please say it again.', retry: null });
  });

  it('hands a command result to the confirm card, keyed by the attempt', () => {
    const asking: VoiceBarState = { kind: 'working', target: command, attempt: 9, retry: { kind: 'text', text: 'book' } };
    const next = voiceBarReducer(asking, {
      type: 'heard', attempt: 9, transcript: 'Book Ramesh Kumar tomorrow', fields: { action: 'schedule_appointment', patientName: 'Ramesh Kumar', date: '2026-11-17' }, lines: [],
    });
    expect(next).toEqual({
      kind: 'confirming',
      heard: {
        id: 9,
        transcript: 'Book Ramesh Kumar tomorrow',
        command: {
          action: 'schedule_appointment', patientName: 'Ramesh Kumar', patientPhone: undefined, doctorName: undefined, date: '2026-11-17',
          time: undefined, partOfDay: undefined, visitType: undefined, fromDate: undefined, notes: undefined,
        },
      },
    });
    expect(voiceBarReducer(next, { type: 'dismiss' })).toEqual({ kind: 'idle', notice: null });
  });

  it('keeps the recorded audio for retry when the request fails', () => {
    const sending: VoiceBarState = { kind: 'working', target: visit, attempt: 5, retry: { kind: 'audio', audio, filename: 'recording.webm' } };
    expect(voiceBarReducer(sending, { type: 'request-failed', attempt: 5, message: 'Voice fill failed (server returned 500).' }))
      .toEqual({ kind: 'failed', target: visit, message: 'Voice fill failed (server returned 500).', retry: { kind: 'audio', audio, filename: 'recording.webm' } });
  });

  it('keeps the typed text for retry when the request fails', () => {
    expect(voiceBarReducer(working, { type: 'request-failed', attempt: 3, message: 'Offline' }))
      .toEqual({ kind: 'failed', target: visit, message: 'Offline', retry: { kind: 'text', text: 'eczema' } });
  });

  it('unticks and re-ticks a line, keeping line order', () => {
    const unticked = voiceBarReducer(draft, { type: 'toggle-line', id: 'diagnosis' });
    expect(unticked).toEqual({ ...draft, kept: ['advice', 'followUp'] });
    expect(voiceBarReducer(unticked, { type: 'toggle-line', id: 'diagnosis' })).toEqual({ ...draft, kept: ['diagnosis', 'advice', 'followUp'] });
  });

  it('records what was applied and its undo', () => {
    expect(voiceBarReducer(draft, { type: 'applied', registrationId: 'r1', labels: ['Diagnosis', 'Advice'], undo }))
      .toEqual({ kind: 'applied', registrationId: 'r1', labels: ['Diagnosis', 'Advice'], undo });
  });

  it('keeps the draft with a message when apply throws', () => {
    expect(voiceBarReducer(draft, { type: 'apply-failed', registrationId: 'r1' }))
      .toEqual({ ...draft, error: 'Could not add this to the form. Nothing was changed. Please try again.' });
  });

  it('ignores an apply that finishes after the draft moved to another registration', () => {
    const other: VoiceBarState = { ...draft, registrationId: 'r2' };
    expect(voiceBarReducer(other, { type: 'applied', registrationId: 'r1', labels: ['Diagnosis'], undo })).toBe(other);
  });

  it.each([
    ['listening', listening],
    ['working', working],
    ['draft', draft],
    ['applied', applied],
    ['failed', { kind: 'failed', target: visit, message: 'Offline', retry: { kind: 'text', text: 'eczema' } } as VoiceBarState],
  ])('discards %s with a notice when its registration changes, so no undo is reachable', (_kind, state) => {
    expect(voiceBarReducer(state, { type: 'registration', activeId: 'r2' }))
      .toEqual({ kind: 'idle', notice: 'The page changed, so this draft was discarded.' });
    expect(voiceBarReducer(state, { type: 'registration', activeId: null }))
      .toEqual({ kind: 'idle', notice: 'The page changed, so this draft was discarded.' });
  });

  it('keeps a state whose registration is still active, and command work across page changes', () => {
    expect(voiceBarReducer(draft, { type: 'registration', activeId: 'r1' })).toBe(draft);
    const commandWork: VoiceBarState = { kind: 'working', target: command, attempt: 1, retry: { kind: 'text', text: 'book' } };
    expect(voiceBarReducer(commandWork, { type: 'registration', activeId: null })).toBe(commandWork);
  });

  it('dismisses with an optional notice', () => {
    expect(voiceBarReducer(applied, { type: 'dismiss', notice: 'Undone. The form is back to how it was.' }))
      .toEqual({ kind: 'idle', notice: 'Undone. The form is back to how it was.' });
  });

  describe('form-touched', () => {
    const noUndo: VoiceBarState = { kind: 'applied', registrationId: 'r1', labels: ['Diagnosis'], undo: null };
    const failed: VoiceBarState = { kind: 'failed', target: visit, message: 'Offline', retry: { kind: 'text', text: 'eczema' } };
    const confirming = {
      kind: 'confirming', heard: { id: 2, transcript: 'Open Ramesh Kumar', command: { action: 'open_patient', patientName: 'Ramesh Kumar' } },
    } as unknown as VoiceBarState;

    it('turns an applied state with an undo into idle with no notice', () => {
      expect(voiceBarReducer(applied, { type: 'form-touched' })).toEqual({ kind: 'idle', notice: null });
    });

    it.each([
      ['applied without undo', noUndo],
      ['idle with a notice', { kind: 'idle', notice: 'Undone. The form is back to how it was.' } as VoiceBarState],
      ['idle', idle],
      ['listening', listening],
      ['working', working],
      ['draft', draft],
      ['failed', failed],
      ['confirming', confirming],
    ])('leaves %s unchanged', (_kind, state) => {
      expect(voiceBarReducer(state, { type: 'form-touched' })).toBe(state);
    });
  });
});
