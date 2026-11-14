import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * WHATSAPP_TOKEN_KEY (base64 of 32 bytes) when set. Otherwise a key derived from JWT_SECRET,
 * so a deploy that already validates JWT_SECRET can store tokens with no new setting.
 */
export function whatsappTokenKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  if (env.WHATSAPP_TOKEN_KEY) {
    const key = Buffer.from(env.WHATSAPP_TOKEN_KEY, 'base64');
    if (key.length !== 32)
      throw new Error(
        'WHATSAPP_TOKEN_KEY must be the base64 encoding of 32 bytes.',
      );
    return key;
  }
  if (!env.JWT_SECRET)
    throw new Error('JWT_SECRET is required to protect WhatsApp tokens.');
  return Buffer.from(
    hkdfSync(
      'sha256',
      env.JWT_SECRET,
      Buffer.alloc(0),
      'whatsapp-connection-token',
      32,
    ),
  );
}

export function sealToken(token: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function openToken(sealed: string, key: Buffer): string {
  const bytes = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    bytes.subarray(0, IV_BYTES),
  );
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  try {
    return Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(
      'The saved WhatsApp token cannot be read with this server key. Link WhatsApp again in Clinic profile.',
    );
  }
}
