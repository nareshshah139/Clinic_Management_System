import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  MessageStatusUpdate,
  WhatsAppMessageStatus,
} from './whatsapp.types';

/**
 * The statuses each webhook status may replace. A status never moves backwards, a repeat is a
 * no-op, and FAILED is final; Meta reports a failure only before delivery.
 */
export const REPLACEABLE_BY: Record<
  MessageStatusUpdate['status'],
  WhatsAppMessageStatus[]
> = {
  SENT: ['ACCEPTED'],
  DELIVERED: ['ACCEPTED', 'SENT'],
  READ: ['ACCEPTED', 'SENT', 'DELIVERED'],
  FAILED: ['ACCEPTED', 'SENT'],
};

const WIRE_STATUS: Record<string, MessageStatusUpdate['status']> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Reads entry[].changes[].value.statuses[] from a Meta webhook body; anything else is ignored. */
export function parseStatusUpdates(body: unknown): MessageStatusUpdate[] {
  const updates: MessageStatusUpdate[] = [];
  for (const entry of list(record(body).entry))
    for (const change of list(record(entry).changes))
      for (const raw of list(record(record(change).value).statuses)) {
        const item = record(raw);
        const status = WIRE_STATUS[String(item.status)];
        if (typeof item.id !== 'string' || !status) continue;
        const error = record(list(item.errors)[0]);
        updates.push({
          wamid: item.id,
          status,
          errorCode:
            status === 'FAILED' && typeof error.code === 'number'
              ? error.code
              : null,
          errorTitle:
            status === 'FAILED' && typeof error.title === 'string'
              ? error.title
              : null,
        });
      }
  return updates;
}

/** X-Hub-Signature-256 is "sha256=" and the hex HMAC-SHA256 of the exact request bytes under the app secret. */
export function hasValidMetaSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || typeof header !== 'string' || !header.startsWith('sha256='))
    return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
