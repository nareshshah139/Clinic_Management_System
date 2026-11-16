/**
 * @cc [owner:nareshshah139,label:security] scoped-wildcard-boundary
 * A scoped wildcard matches exactly one nonempty action in its scope. It MUST NOT match a
 * nested scope, a different scope, or act as a global wildcard.
 */
export function hasScopedPermission(grants: ReadonlySet<string>, permission: string): boolean {
  if (grants.has(permission)) return true;
  const parts = permission.split(':');
  if (parts.length < 2 || parts.some((part) => !part || part === '*')) return false;
  return grants.has(`${parts.slice(0, -1).join(':')}:*`);
}
