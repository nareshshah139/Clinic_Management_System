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

function grantsForRole(role: string | null | undefined, stored: readonly string[]): string[] {
  if (role && UNIVERSAL_ROLES.has(role)) return ['*'];
  return [...stored.filter((grant) => grant !== '*'), ...fixedGrants(role)];
}

type StoredUserPermissions = { permissions: unknown; revokedPermissions: unknown };

/** (role record ∪ user's saved extras) − user's revocations, compared as exact grant strings. */
export function heldPermissions(rolePermissions: unknown, user: StoredUserPermissions): string[] {
  const revoked = new Set(parsePermissionList(user.revokedPermissions));
  const combined = new Set([...parsePermissionList(rolePermissions), ...parsePermissionList(user.permissions)]);
  return [...combined].filter((grant) => !revoked.has(grant));
}

export function userGrants(
  user: StoredUserPermissions & { role: string | null | undefined },
  rolePermissions: unknown,
): string[] {
  return grantsForRole(user.role, heldPermissions(rolePermissions, user));
}

/** The stored deltas under which heldPermissions(rolePermissions, deltas) is exactly `held`. */
export function permissionDeltas(
  rolePermissions: unknown,
  held: readonly string[],
): { permissions: string[]; revokedPermissions: string[] } {
  const role = new Set(parsePermissionList(rolePermissions));
  const target = new Set(held);
  return {
    permissions: [...target].filter((grant) => !role.has(grant)),
    revokedPermissions: [...role].filter((grant) => !target.has(grant)),
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
