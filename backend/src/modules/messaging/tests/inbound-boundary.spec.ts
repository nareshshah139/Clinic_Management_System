import { createHmac } from 'crypto';
import { isStopWord } from '../stop-words';
import { verifyMetaSignature } from '../webhook-signature';

describe('WhatsApp stop words (PP-06)', () => {
  afterEach(() => delete process.env.WHATSAPP_STOP_WORDS);

  it.each(['STOP', ' stop. ', 'Unsubscribe!', 'ఆపు', 'ఆపండి', 'रोकें', 'बंद करो', 'बंद  करो।'])('treats %p as an opt-out', (text) => {
    expect(isStopWord(text)).toBe(true);
  });

  it.each(['stop the tablets?', 'please stop', 'stopped', '', null])('does not treat %p as an opt-out', (text) => {
    expect(isStopWord(text as any)).toBe(false);
  });

  it('adds the words the clinic maintains', () => {
    expect(isStopWord('no more')).toBe(false);
    process.env.WHATSAPP_STOP_WORDS = 'No more, వద్దు';
    expect(isStopWord('no more')).toBe(true);
    expect(isStopWord('వద్దు')).toBe(true);
  });
});

describe('Meta webhook signature (PP-19)', () => {
  const raw = Buffer.from('{"entry":[]}');
  const good = `sha256=${createHmac('sha256', 's3cret').update(raw).digest('hex')}`;

  it('accepts the HMAC of the raw bytes and nothing else', () => {
    expect(verifyMetaSignature(raw, good, 's3cret')).toBe(true);
    expect(verifyMetaSignature(Buffer.from('{"entry": []}'), good, 's3cret')).toBe(false);
    expect(verifyMetaSignature(raw, good, 'other')).toBe(false);
    expect(verifyMetaSignature(raw, good.replace('sha256=', 'sha1='), 's3cret')).toBe(false);
    expect(verifyMetaSignature(raw, good.slice(0, -2), 's3cret')).toBe(false);
    expect(verifyMetaSignature(raw, undefined, 's3cret')).toBe(false);
    expect(verifyMetaSignature(raw, [good], 's3cret')).toBe(false);
  });
});
