import { apiClient } from '@/lib/api';
import { displayClinicDateTime } from '@/lib/date-display';
import { humanizeEnum } from '@/lib/labels';
import type { RegisterQuery, RegisterQueryConfig } from '@/components/register/register-query';

export type AuditEntry = {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldValues: string | null;
  newValues: string | null;
  ipAddress: string | null;
  timestamp: string;
};

type AuditListResponse = { data: AuditEntry[]; pagination: { page: number; limit: number; total: number } };
type AuditStatisticsResponse = { actionBreakdown: { action: string }[]; entityBreakdown: { entity: string }[] };
type StaffResponse = { users: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }[] };

export type AuditPage = { rows: AuditEntry[]; total: number; limit: number };
export type AuditFilter = 'user' | 'action' | 'entity';
export type AuditQuery = RegisterQuery<AuditFilter, 'timestamp'>;
export type Option = { value: string; label: string };

export const AUDIT_LOGS_PATH = '/dashboard/audit-logs';
const PAGE_SIZE = 50;

export const AUDIT_QUERY: RegisterQueryConfig<AuditFilter, 'timestamp'> = {
  searchFields: ['all'],
  filters: { user: { param: 'user' }, action: { param: 'action' }, entity: { param: 'record' } },
  sorts: ['timestamp'],
  descFirst: ['timestamp'],
  defaultSort: { by: 'timestamp', dir: 'desc' },
};

const RECORD_NOUNS: Readonly<Record<string, string>> = {
  NewInvoice: 'bill',
  Invoice: 'bill',
  PharmacyInvoice: 'pharmacy bill',
  User: 'staff account',
  Branch: 'clinic details',
  InventoryItem: 'stock item',
};

const NAMED_ACTIONS: Readonly<Record<string, string>> = {
  BRANCH_UPDATED: 'Changed clinic details',
  BRANCH_DELETED: 'Deleted a branch',
  PROCEDURE_ACCESS_UPDATED: 'Changed who can record procedures',
  PASSWORD_RESET_CODE_ISSUED: 'Issued a password reset code',
};

const VERBS: Readonly<Record<string, string>> = { CREATE: 'Added', UPDATE: 'Changed', DELETE: 'Deleted', UPSERT: 'Saved' };
const VOIDED = 'CANCELLED';
const HIDDEN_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'branchId']);

const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').toLowerCase();
const sentence = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

export const recordNoun = (entity: string) => RECORD_NOUNS[entity] ?? words(entity);

const crud = (action: string) => {
  const many = action.endsWith('MANY');
  const verb = VERBS[many ? action.slice(0, -4) : action];
  return verb ? { verb, many } : null;
};

export function actionLabel(action: string): string {
  const named = NAMED_ACTIONS[action];
  if (named) return named;
  const plain = crud(action);
  if (!plain) return humanizeEnum(action);
  return plain.many ? `${plain.verb}, several at once` : plain.verb;
}

export function summary(entry: AuditEntry): string {
  const named = NAMED_ACTIONS[entry.action];
  if (named) return named;
  const plain = crud(entry.action);
  if (!plain) return humanizeEnum(entry.action);
  const noun = recordNoun(entry.entity);
  const voids = flatten(parse(entry.newValues)).get('status') === VOIDED && flatten(parse(entry.oldValues)).get('status') !== VOIDED;
  if (plain.verb === 'Changed' && noun === 'bill' && voids) return 'Voided bill';
  return `${plain.verb} ${noun}${plain.many ? ' (several)' : ''}`;
}

function parse(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asObject = (value: unknown) => {
  if (typeof value !== 'string' || !value.startsWith('{')) return value;
  const parsed = parse(value);
  return isPlainObject(parsed) ? parsed : value;
};

function flatten(value: unknown, path: string[] = [], into = new Map<string, unknown>()): Map<string, unknown> {
  const unwrapped = asObject(value);
  if (isPlainObject(unwrapped) && path.length < 3) {
    for (const [key, inner] of Object.entries(unwrapped)) {
      if (path.length === 0 && HIDDEN_FIELDS.has(key)) continue;
      flatten(inner, [...path, key], into);
    }
  } else if (path.length) {
    into.set(path.join('.'), unwrapped);
  } else if (unwrapped !== undefined) {
    into.set('value', unwrapped);
  }
  return into;
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

export function displayValue(value: unknown): string {
  if (isEmpty(value)) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-IN');
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return displayClinicDateTime(value);
    if (/^[A-Z][A-Z0-9_]*$/.test(value) && value.length > 1) return humanizeEnum(value);
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object' || item === null)) {
    return value.length ? value.map(displayValue).join(', ') : '—';
  }
  return JSON.stringify(value);
}

const fieldLabel = (path: string) => path.split('.').map((part) => sentence(words(part))).join(' › ');

export type FieldChange = { field: string; label: string; before: string | null; after: string | null };

export function fieldChanges(entry: AuditEntry): FieldChange[] {
  const before = flatten(parse(entry.oldValues));
  const after = flatten(parse(entry.newValues));
  const hasBefore = entry.oldValues !== null;
  const hasAfter = entry.newValues !== null;
  const fields = [...new Set([...before.keys(), ...after.keys()])];
  return fields
    .filter((field) => {
      const [was, now] = [before.get(field), after.get(field)];
      if (hasBefore && hasAfter) return JSON.stringify(was ?? null) !== JSON.stringify(now ?? null);
      return !isEmpty(hasAfter ? now : was);
    })
    .map((field) => ({
      field,
      label: fieldLabel(field),
      before: hasBefore ? displayValue(before.get(field)) : null,
      after: hasAfter ? displayValue(after.get(field)) : null,
    }));
}

const istBoundary = (day: string, end: boolean) => `${day}T${end ? '23:59:59.999' : '00:00:00.000'}+05:30`;

export async function fetchAuditPage(query: AuditQuery): Promise<AuditPage> {
  const response = await apiClient.get<AuditListResponse>('/audit-logs', {
    page: query.page,
    limit: PAGE_SIZE,
    startDate: istBoundary(query.from, false),
    endDate: istBoundary(query.to, true),
    userId: query.filters.user,
    action: query.filters.action,
    entity: query.filters.entity,
    sortBy: query.sortBy,
    sortOrder: query.sortDir,
  });
  return { rows: response.data, total: response.pagination.total, limit: response.pagination.limit };
}

const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label);

export async function fetchFilterOptions(from: string, to: string): Promise<{ actions: Option[]; entities: Option[] }> {
  const stats = await apiClient.get<AuditStatisticsResponse>('/audit-logs/statistics', {
    startDate: istBoundary(from, false),
    endDate: istBoundary(to, true),
  });
  return {
    actions: stats.actionBreakdown.map(({ action }) => ({ value: action, label: actionLabel(action) })).sort(byLabel),
    entities: stats.entityBreakdown.map(({ entity }) => ({ value: entity, label: sentence(recordNoun(entity)) })).sort(byLabel),
  };
}

export async function fetchStaff(): Promise<Option[]> {
  const response = await apiClient.get<StaffResponse>('/users', { limit: 100 });
  return response.users
    .map((user) => ({ value: user.id, label: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unnamed staff member' }))
    .sort(byLabel);
}
