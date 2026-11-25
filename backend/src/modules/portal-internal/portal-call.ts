import { createHash, createHmac, timingSafeEqual } from 'crypto';

/** Who the portal service says it is acting for. The CMS re-checks every claim against its own rows. */
export type PortalCaller =
  | { kind: 'anonymous' }
  | { kind: 'phone'; phoneE164: string }
  | { kind: 'patient'; phoneE164: string; patientId: string }
  | { kind: 'task-link'; token: string }
  | { kind: 'session'; token: string };

export type PortalCallInput = {
  method: string;
  path: string;
  ts: number;
  body: string;
  caller: string;
};

export const PORTAL_CALL_WINDOW_MS = 60_000;
export const PORTAL_SECRET_MIN_LENGTH = 32;
export const PORTAL_HEADERS = {
  ts: 'x-portal-timestamp',
  caller: 'x-portal-caller',
  signature: 'x-portal-signature',
} as const;

const E164 = /^\+[1-9]\d{7,14}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The secret both services share, or null when it is unset or too short to sign with. */
export function portalServiceSecret(): string | null {
  const secret = process.env.PORTAL_SERVICE_SECRET ?? '';
  return secret.length >= PORTAL_SECRET_MIN_LENGTH ? secret : null;
}

/** The bytes a signature covers for a body: nothing for reads, the JSON text for writes. */
export function canonicalBody(method: string, body: unknown): string {
  return ['GET', 'HEAD'].includes(method.toUpperCase()) ? '' : JSON.stringify(body ?? null);
}

export function encodeCaller(caller: PortalCaller): string {
  return Buffer.from(JSON.stringify(caller)).toString('base64url');
}

export function parseCaller(raw: unknown): PortalCaller | null {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort().join(',');
  const str = (k: string, re: RegExp) => typeof v[k] === 'string' && re.test(v[k] as string);
  switch (v.kind) {
    case 'anonymous':
      return keys === 'kind' ? { kind: 'anonymous' } : null;
    case 'phone':
      return keys === 'kind,phoneE164' && str('phoneE164', E164) ? { kind: 'phone', phoneE164: v.phoneE164 as string } : null;
    case 'patient':
      return keys === 'kind,patientId,phoneE164' && str('phoneE164', E164) && str('patientId', ID)
        ? { kind: 'patient', phoneE164: v.phoneE164 as string, patientId: v.patientId as string }
        : null;
    case 'task-link':
      return keys === 'kind,token' && str('token', TOKEN) ? { kind: 'task-link', token: v.token as string } : null;
    case 'session':
      return keys === 'kind,token' && str('token', TOKEN) ? { kind: 'session', token: v.token as string } : null;
    default:
      return null;
  }
}

/**
 * @cc [owner:nareshshah139,label:security] portal-call-signature
 * A portal call's signature MUST be HMAC-SHA256 under PORTAL_SERVICE_SECRET over the method, the
 * request path with query, the millisecond timestamp, the SHA-256 of the canonical body and the raw
 * caller header, joined by newlines, so changing any of them invalidates it.
 */
export function signPortalCall(secret: string, call: PortalCallInput): string {
  const bodyHash = createHash('sha256').update(call.body).digest('hex');
  return createHmac('sha256', secret)
    .update([call.method.toUpperCase(), call.path, String(call.ts), bodyHash, call.caller].join('\n'))
    .digest('hex');
}

export function signatureMatches(expected: string, got: unknown): boolean {
  if (typeof got !== 'string' || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
