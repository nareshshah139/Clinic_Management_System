import {
  emptyTranscript,
  parseLiveEvent,
  reduceTranscript,
  settlement,
  transcriptText,
  type LiveEvent,
} from '@/lib/live-transcript';

const wire = (event: Record<string, unknown>) => JSON.stringify(event);
const run = (events: LiveEvent[], stopSent = true) =>
  events.reduce((t, e) => reduceTranscript(t, e, stopSent), emptyTranscript);

describe('parseLiveEvent', () => {
  it('maps each OpenAI server event to a typed live event', () => {
    expect(parseLiveEvent(wire({ type: 'input_audio_buffer.committed', item_id: 'a', previous_item_id: null }))).toEqual({ type: 'committed', itemId: 'a' });
    expect(parseLiveEvent(wire({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'itch' }))).toEqual({ type: 'delta', itemId: 'a', delta: 'itch' });
    expect(parseLiveEvent(wire({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'Itching.' }))).toEqual({ type: 'completed', itemId: 'a', transcript: 'Itching.' });
    expect(parseLiveEvent(wire({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'a' }))).toEqual({ type: 'failed', itemId: 'a' });
    expect(parseLiveEvent(wire({ type: 'error', error: { type: 'invalid_request_error', code: 'input_audio_buffer_commit_empty', message: 'buffer too small', param: null } }))).toEqual({ type: 'commit_empty' });
    expect(parseLiveEvent(wire({ type: 'error', error: { type: 'server_error', code: 'session_expired', message: 'expired', param: null } }))).toEqual({ type: 'fatal', code: 'session_expired' });
    expect(parseLiveEvent(wire({ type: 'error', error: { type: 'server_error', message: 'boom' } }))).toEqual({ type: 'fatal', code: 'server_error' });
  });

  it('ignores unknown, malformed and incomplete messages', () => {
    expect(parseLiveEvent('not json')).toBeNull();
    expect(parseLiveEvent('42')).toBeNull();
    expect(parseLiveEvent(wire({ type: 'session.created' }))).toBeNull();
    expect(parseLiveEvent(wire({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a' }))).toBeNull();
    expect(parseLiveEvent(wire({ type: 'input_audio_buffer.committed' }))).toBeNull();
  });
});

describe('reduceTranscript', () => {
  it('keeps first-seen order when a delta arrives before its commit', () => {
    const t = run([
      { type: 'delta', itemId: 'a', delta: 'Rash on ' },
      { type: 'delta', itemId: 'a', delta: 'both arms' },
      { type: 'committed', itemId: 'a' },
    ]);
    expect(t.order).toEqual(['a']);
    expect(transcriptText(t)).toBe('Rash on both arms');
    expect(settlement(t)).toEqual({ settled: false, hasFailure: false });
  });

  it('orders text by first appearance even when completions arrive out of order', () => {
    const t = run([
      { type: 'committed', itemId: 'a' },
      { type: 'committed', itemId: 'b' },
      { type: 'completed', itemId: 'b', transcript: 'for two weeks.' },
      { type: 'completed', itemId: 'a', transcript: 'Itching   on scalp' },
    ]);
    expect(transcriptText(t)).toBe('Itching on scalp for two weeks.');
    expect(settlement(t)).toEqual({ settled: true, hasFailure: false });
  });

  it('replaces streamed partial text with the completed transcript and ignores late deltas', () => {
    const t = run([
      { type: 'delta', itemId: 'a', delta: 'Patient has ache' },
      { type: 'committed', itemId: 'a' },
      { type: 'completed', itemId: 'a', transcript: 'Patient has acne.' },
      { type: 'delta', itemId: 'a', delta: ' extra' },
    ]);
    expect(transcriptText(t)).toBe('Patient has acne.');
  });

  it('treats a repeated completion as idempotent', () => {
    const once = run([{ type: 'committed', itemId: 'a' }, { type: 'completed', itemId: 'a', transcript: 'Dry skin.' }]);
    const twice = reduceTranscript(once, { type: 'completed', itemId: 'a', transcript: 'Dry skin.' }, true);
    expect(twice).toEqual(once);
  });

  it('reports a failed item as a failure once settled', () => {
    const t = run([{ type: 'committed', itemId: 'a' }, { type: 'failed', itemId: 'a' }]);
    expect(settlement(t)).toEqual({ settled: true, hasFailure: true });
  });

  it('settles an empty commit with no text', () => {
    const t = run([{ type: 'commit_empty' }]);
    expect(settlement(t)).toEqual({ settled: true, hasFailure: false });
    expect(transcriptText(t)).toBe('');
  });

  it('does not settle until our stop commit is acknowledged', () => {
    const beforeStop = run([{ type: 'committed', itemId: 'a' }, { type: 'completed', itemId: 'a', transcript: 'Hello' }], false);
    expect(settlement(beforeStop)).toEqual({ settled: false, hasFailure: false });
    const acked = reduceTranscript(beforeStop, { type: 'committed', itemId: 'b' }, true);
    expect(settlement(acked)).toEqual({ settled: false, hasFailure: false });
    const done = reduceTranscript(acked, { type: 'completed', itemId: 'b', transcript: 'there' }, true);
    expect(settlement(done)).toEqual({ settled: true, hasFailure: false });
    expect(transcriptText(done)).toBe('Hello there');
  });
});
