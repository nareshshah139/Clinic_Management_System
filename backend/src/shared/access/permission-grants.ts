const UNIVERSAL_ROLES = new Set(['OWNER', 'ADMIN', 'DOCTOR']);

const IMPLIED_GRANTS: Readonly<Record<string, readonly string[]>> = {
  PHARMACIST: ['pharmacy:*', 'inventory:*'],
};

export type PermissionGrants = { readonly has: (required: string) => boolean };

export function parsePermissionList(raw: unknown): string[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function grantsForRole(role: string | null | undefined, stored: readonly string[]): string[] {
  if (role && UNIVERSAL_ROLES.has(role)) return ['*'];
  return [...stored.filter((grant) => grant !== '*'), ...((role && IMPLIED_GRANTS[role]) || [])];
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
