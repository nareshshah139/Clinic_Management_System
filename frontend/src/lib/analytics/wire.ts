import { UserRole } from '@cms/shared-types';
import {
  EVENTS,
  PAGE_ROUTES,
  SCREEN_VIEW,
  type EventName,
  type PropSpec,
  type RouteTemplate,
  type StaffRole,
} from './vocabulary';

export interface Identity {
  readonly staffId: string;
  readonly role: StaffRole;
  readonly branchId: string | null;
}

export type WirePayload =
  | {
      type: 'track';
      payload: {
        name: EventName | typeof SCREEN_VIEW;
        profileId: string;
        properties: Record<string, string | boolean>;
      };
    }
  | {
      type: 'identify';
      payload: {
        profileId: string;
        properties: { role: StaffRole; branch_id: string };
      };
    };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const STAFF_ROLES: readonly string[] = [...Object.values(UserRole), 'UNKNOWN'];
const OTHER_ROUTE = '/other';

const has = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (obj: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((key) => own.includes(key));
};

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const isStaffRole = (value: unknown): value is StaffRole =>
  typeof value === 'string' && STAFF_ROLES.includes(value);

const isEventName = (value: unknown): value is EventName =>
  typeof value === 'string' && has(EVENTS, value);

const isRouteTemplate = (value: string): value is RouteTemplate =>
  value === OTHER_ROUTE || (PAGE_ROUTES as readonly string[]).includes(value);

export function identityOf(user: {
  id: string;
  role: string;
  branchId?: string | null;
}): Identity | null {
  if (!isId(user.id)) return null;
  return {
    staffId: user.id,
    role: isStaffRole(user.role) ? user.role : 'UNKNOWN',
    branchId: isId(user.branchId) ? user.branchId : null,
  };
}

const segmentsOf = (path: string): string[] => path.split('/').slice(1);

export function routeTemplate(pathname: string): RouteTemplate {
  const bare = pathname.split(/[?#]/)[0];
  const trimmed = bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare;
  if (!trimmed.startsWith('/')) return OTHER_ROUTE;
  const exact = PAGE_ROUTES.find((route) => route === trimmed);
  if (exact) return exact;

  const actual = segmentsOf(trimmed);
  const dynamic = PAGE_ROUTES.find((route) => {
    const expected = segmentsOf(route);
    return (
      route.includes('[') &&
      expected.length === actual.length &&
      expected.every((segment, i) =>
        segment.startsWith('[') ? actual[i].length > 0 : segment === actual[i],
      )
    );
  });
  return dynamic ?? OTHER_ROUTE;
}

const isTemplatePath = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.username === '' &&
    url.password === '' &&
    value === url.origin + url.pathname &&
    isRouteTemplate(url.pathname)
  );
};

const checkEventProps = (
  spec: Readonly<Record<string, PropSpec>>,
  props: Record<string, unknown>,
): Record<string, string | boolean> | null => {
  const out: Record<string, string | boolean> = {};
  for (const key of Object.keys(spec)) {
    const allowed = spec[key];
    const value = props[key];
    if (allowed === 'flag') {
      if (typeof value !== 'boolean') return null;
      out[key] = value;
    } else {
      if (typeof value !== 'string' || !allowed.includes(value)) return null;
      out[key] = value;
    }
  }
  return out;
};

/**
 * @cc [owner:nareshshah139,label:security] analytics-wire-allowlist
 * Every payload sent to the analytics collector is rebuilt from the vocabularies. Unknown types,
 * names, keys and values MUST drop the whole payload. Paths are sent only as origin plus a route
 * template with no query or hash. Identify carries only the staff id, role and branch id.
 */
export function checkWire(input: unknown): WirePayload | null {
  if (!isRecord(input) || !hasExactKeys(input, ['type', 'payload'])) return null;
  const { payload } = input;
  if (!isRecord(payload)) return null;

  if (input.type === 'identify') {
    if (!hasExactKeys(payload, ['profileId', 'properties'])) return null;
    const { profileId, properties } = payload;
    if (!isId(profileId) || !isRecord(properties)) return null;
    if (!hasExactKeys(properties, ['role', 'branch_id'])) return null;
    const { role, branch_id: branchId } = properties;
    if (!isStaffRole(role) || !isId(branchId)) return null;
    return {
      type: 'identify',
      payload: { profileId, properties: { role, branch_id: branchId } },
    };
  }

  if (input.type !== 'track') return null;
  if (!hasExactKeys(payload, ['name', 'profileId', 'properties'])) return null;
  const { name, profileId, properties } = payload;
  if (!isId(profileId) || !isRecord(properties)) return null;
  const { role, branch_id: branchId } = properties;
  if (!isStaffRole(role) || !isId(branchId)) return null;

  if (name === SCREEN_VIEW) {
    if (!hasExactKeys(properties, ['__path', 'role', 'branch_id'])) return null;
    if (!isTemplatePath(properties.__path)) return null;
    return {
      type: 'track',
      payload: {
        name: SCREEN_VIEW,
        profileId,
        properties: { __path: properties.__path, role, branch_id: branchId },
      },
    };
  }

  if (!isEventName(name)) return null;
  const spec: Readonly<Record<string, PropSpec>> = EVENTS[name];
  if (!hasExactKeys(properties, [...Object.keys(spec), 'role', 'branch_id'])) return null;
  const rebuilt = checkEventProps(spec, properties);
  if (!rebuilt) return null;
  return {
    type: 'track',
    payload: {
      name,
      profileId,
      properties: { ...rebuilt, role, branch_id: branchId },
    },
  };
}
