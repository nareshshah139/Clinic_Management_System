import { createHmac, timingSafeEqual } from 'crypto';

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * @cc [owner:nareshshah139,label:security] meta-webhook-signature
 * A webhook body MUST be accepted only when X-Hub-Signature-256 equals "sha256=" and the hex
 * HMAC-SHA256 of the raw request bytes under the app secret, compared in constant time.
 */
export function verifyMetaSignature(raw: Buffer, header: string | string[] | undefined, secret: string): boolean {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return safeEqual(given, createHmac('sha256', secret).update(raw).digest());
}
