import type {
  PhoneNumberHealth,
  SendAvailability,
  SendBlocker,
  SendHealth,
} from './whatsapp.types';

const AVAILABILITY: SendAvailability[] = ['AVAILABLE', 'LIMITED', 'BLOCKED'];
const ENTITIES: SendBlocker['entity'][] = [
  'PHONE_NUMBER',
  'WABA',
  'BUSINESS',
  'APP',
];

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const availability = (value: unknown) =>
  AVAILABILITY.find((a) => a === value) ?? null;

/**
 * Reads the health_status field of a phone-number response. Only entities that cannot send
 * contribute blockers, so calling or webhook errors on an entity that can send are dropped.
 * Returns null when Meta sent no readable health_status.
 */
export function parseSendHealth(raw: unknown): PhoneNumberHealth | null {
  const status = record(raw);
  const canSend = availability(status.can_send_message);
  if (!canSend) return null;
  const blockers: SendBlocker[] = [];
  let businessAccountId: string | null = null;
  for (const item of list(status.entities)) {
    const entity = record(item);
    const type = ENTITIES.find((e) => e === entity.entity_type);
    if (type === 'WABA' && typeof entity.id === 'string')
      businessAccountId = entity.id;
    if (!type || availability(entity.can_send_message) === 'AVAILABLE')
      continue;
    for (const raw of list(entity.errors)) {
      const error = record(raw);
      if (
        typeof error.error_code !== 'number' ||
        typeof error.error_description !== 'string'
      )
        continue;
      blockers.push({
        entity: type,
        code: error.error_code,
        description: error.error_description,
        ...(typeof error.possible_solution === 'string' &&
        error.possible_solution.trim()
          ? { fix: error.possible_solution }
          : {}),
      });
    }
  }
  return { sendHealth: { canSend, blockers }, businessAccountId };
}

export function blockedReason(health: SendHealth): string {
  const listed = health.blockers
    .map((b) => `${b.description.replace(/\.$/, '')} (${b.code})`)
    .join('; ');
  return `WhatsApp is blocking messages from this number, so nothing was sent. Fix it in Meta Business Suite${listed ? `: ${listed}` : ''}.`;
}
