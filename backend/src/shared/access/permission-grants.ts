const UNIVERSAL_ROLES = new Set(['OWNER', 'ADMIN', 'DOCTOR']);

const IMPLIED_GRANTS: Readonly<Record<string, readonly string[]>> = {
  PHARMACIST: ['pharmacy:*', 'inventory:*'],
};

export type PermissionGrants = { readonly has: (required: string) => boolean };

function parsePermissionList(raw: unknown): string[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/** Grants a role carries whatever is stored for the user; revoking cannot remove them. */
export function fixedGrants(role: string | null | undefined): string[] {
  if (!role) return [];
  if (UNIVERSAL_ROLES.has(role)) return ['*'];
  return [...(IMPLIED_GRANTS[role] ?? [])];
}

type StoredUserPermissions = { permissions: unknown; revokedPermissions: unknown };
type UserWithRole = StoredUserPermissions & { role: string | null | undefined };

/** (role record ∪ user's saved extras) − user's revocations, compared as exact grant strings. */
export function heldPermissions(rolePermissions: unknown, user: StoredUserPermissions): string[] {
  const revoked = new Set(parsePermissionList(user.revokedPermissions));
  const combined = new Set([...parsePermissionList(rolePermissions), ...parsePermissionList(user.permissions)]);
  return [...combined].filter((grant) => !revoked.has(grant));
}

/**
 * What the user may do. A revoked permission is refused even when a broader held grant such as
 * inventory:* covers it. Role-fixed grants are never refused, and a stored bare * grants nothing.
 */
export function userGrants(user: UserWithRole, rolePermissions: unknown): PermissionGrants {
  const fixed = fixedGrants(user.role);
  const revoked = new Set(parsePermissionList(user.revokedPermissions));
  const held = heldPermissions(rolePermissions, user).filter((grant) => grant !== '*');
  return {
    has: (required) => permissionGranted(fixed, required) || (!revoked.has(required) && permissionGranted(held, required)),
  };
}

/** The boxes to tick for a user: every grant string held, plus every listed permission they may use. */
export function tickedPermissions(user: UserWithRole, rolePermissions: unknown, listed: readonly string[]): string[] {
  const grants = userGrants(user, rolePermissions);
  return [...new Set([...heldPermissions(rolePermissions, user), ...listed.filter((permission) => grants.has(permission))])];
}

/**
 * The stored deltas under which a user of this role may use exactly the ticked permissions out of
 * those listed. Only what the role does not already give is saved, so the user keeps following
 * the role. An unticked listed permission that a ticked wildcard would still cover is revoked.
 */
export function permissionDeltas(
  role: string | null | undefined,
  rolePermissions: unknown,
  ticked: readonly string[],
  listed: readonly string[],
): { permissions: string[]; revokedPermissions: string[] } {
  const fixed = fixedGrants(role);
  const roleGrants = [...new Set(parsePermissionList(rolePermissions))];
  const target = new Set(ticked);
  const covers = (grants: readonly string[], permission: string) =>
    permissionGranted(grants.filter((grant) => grant !== '*'), permission);

  const kept = roleGrants.filter((grant) => target.has(grant));
  const extras = [...target].filter((grant) => !roleGrants.includes(grant) && !permissionGranted(fixed, grant) && !covers(kept, grant));
  const saved = extras.filter((grant) => !covers(extras.filter((other) => other !== grant), grant));
  const held = [...kept, ...saved];
  const revocable = (permission: string) => !target.has(permission) && !permissionGranted(fixed, permission);
  return {
    permissions: saved,
    revokedPermissions: [...new Set([...roleGrants.filter(revocable), ...listed.filter((permission) => revocable(permission) && covers(held, permission))])],
  };
}

function grantCovers(grant: string, required: string): boolean {
  if (grant === required || grant === '*') return true;
  if (!grant.endsWith(':*')) return false;
  const scope = grant.slice(0, -2);
  if (!scope || scope.includes('*')) return false;
  return required === scope || required.startsWith(`${scope}:`);
}

export function permissionGranted(grants: readonly string[], required: string): boolean {
  return grants.some((grant) => grantCovers(grant, required));
}

export function permissionGrants(grants: readonly string[]): PermissionGrants {
  return { has: (required) => permissionGranted(grants, required) };
}
