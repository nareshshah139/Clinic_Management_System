export type LiveEvent =
  | { type: 'committed'; itemId: string }
  | { type: 'delta'; itemId: string; delta: string }
  | { type: 'completed'; itemId: string; transcript: string }
  | { type: 'failed'; itemId: string }
  | { type: 'commit_empty' }
  | { type: 'fatal'; code: string };

type ItemState = 'partial' | 'final' | 'failed';

export interface LiveTranscript {
  readonly order: readonly string[];
  readonly items: Readonly<Record<string, { text: string; state: ItemState }>>;
  readonly stopAcked: boolean;
}

export const emptyTranscript: LiveTranscript = { order: [], items: {}, stopAcked: false };

const COMMIT_EMPTY_CODE = 'input_audio_buffer_commit_empty';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function parseLiveEvent(raw: string): LiveEvent | null {
  let message: Record<string, unknown> | null;
  try {
    message = asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
  if (!message) return null;

  const itemId = typeof message.item_id === 'string' ? message.item_id : null;
  switch (message.type) {
    case 'input_audio_buffer.committed':
      return itemId ? { type: 'committed', itemId } : null;
    case 'conversation.item.input_audio_transcription.delta':
      return itemId && typeof message.delta === 'string' ? { type: 'delta', itemId, delta: message.delta } : null;
    case 'conversation.item.input_audio_transcription.completed':
      return itemId && typeof message.transcript === 'string'
        ? { type: 'completed', itemId, transcript: message.transcript }
        : null;
    case 'conversation.item.input_audio_transcription.failed':
      return itemId ? { type: 'failed', itemId } : null;
    case 'error': {
      const error = asRecord(message.error);
      const code = typeof error?.code === 'string' ? error.code : typeof error?.type === 'string' ? error.type : 'unknown';
      return code === COMMIT_EMPTY_CODE ? { type: 'commit_empty' } : { type: 'fatal', code };
    }
    default:
      return null;
  }
}

function withItem(
  t: LiveTranscript,
  itemId: string,
  update: (item: { text: string; state: ItemState }) => { text: string; state: ItemState },
): LiveTranscript {
  const existing = t.items[itemId];
  return {
    ...t,
    order: existing ? t.order : [...t.order, itemId],
    items: { ...t.items, [itemId]: update(existing ?? { text: '', state: 'partial' }) },
  };
}

export function reduceTranscript(t: LiveTranscript, e: LiveEvent, stopSent: boolean): LiveTranscript {
  switch (e.type) {
    case 'committed': {
      const next = withItem(t, e.itemId, (item) => item);
      return stopSent ? { ...next, stopAcked: true } : next;
    }
    case 'commit_empty':
      return stopSent ? { ...t, stopAcked: true } : t;
    case 'delta':
      return withItem(t, e.itemId, (item) =>
        item.state === 'partial' ? { ...item, text: item.text + e.delta } : item,
      );
    case 'completed':
      return withItem(t, e.itemId, (item) => (item.state === 'failed' ? item : { text: e.transcript, state: 'final' }));
    case 'failed':
      return withItem(t, e.itemId, (item) => (item.state === 'final' ? item : { ...item, state: 'failed' }));
    case 'fatal':
      return t;
  }
}

export function transcriptText(t: LiveTranscript): string {
  return t.order
    .map((id) => t.items[id].text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function settlement(t: LiveTranscript): { settled: boolean; hasFailure: boolean } {
  const states = t.order.map((id) => t.items[id].state);
  return {
    settled: t.stopAcked && states.every((state) => state !== 'partial'),
    hasFailure: states.includes('failed'),
  };
}
