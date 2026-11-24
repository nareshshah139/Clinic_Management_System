/** Opt-out words in English, Telugu and Hindi. The clinic adds its own with WHATSAPP_STOP_WORDS (comma-separated). */
export const DEFAULT_STOP_WORDS = ['stop', 'unsubscribe', 'ఆపు', 'ఆపండి', 'ఆపివేయి', 'रोको', 'रोकें', 'बंद', 'बंद करो', 'बंद करें'];

const normalize = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/[\s.!।]+$/u, '').replace(/\s+/gu, ' ');

export function stopWords(): string[] {
  const extra = (process.env.WHATSAPP_STOP_WORDS ?? '').split(',').map(normalize).filter(Boolean);
  return [...DEFAULT_STOP_WORDS.map(normalize), ...extra];
}

/**
 * @cc [owner:nareshshah139,label:security] whatsapp-stop-word
 * An inbound text that is exactly one listed stop word, ignoring case, surrounding spaces and a
 * trailing full stop or exclamation mark, MUST count as an opt-out; any other text MUST NOT.
 */
export function isStopWord(text: string | null | undefined): boolean {
  return !!text && stopWords().includes(normalize(text));
}
