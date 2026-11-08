import { readFileSync } from 'fs';
import { resolve } from 'path';

export const WILDCARD_MIGRATION = resolve(
  __dirname,
  '../../../../prisma/migrations/20261108100000_expand_role_permission_wildcards/migration.sql',
);

/** Role defaults as seed_rbac wrote them before the wildcards were replaced (only roles that held one). */
export const LEGACY_ROLE_DEFAULTS: Record<string, string[]> = {
  MANAGER: [
    'appointments:*',
    'billing:*',
    'inventory:*',
    'pharmacy:*',
    'reports:*',
    'users:read',
    'users:update',
  ],
  DOCTOR: [
    'appointments:read',
    'appointments:update',
    'pharmacy:drug:read',
    'pharmacy:drug:autocomplete',
    'pharmacy:drug:categories',
    'pharmacy:drug:manufacturers',
    'pharmacy:drug:dosageForms',
    'pharmacy:drug:inventory-change:read',
    'pharmacy:drug:inventory-change:approve',
    'pharmacy:invoice:read',
    'visits:*',
  ],
  PHARMACIST: [
    'inventory:item:*',
    'inventory:transaction:*',
    'inventory:adjustment:create',
    'inventory:transfer:create',
    'inventory:po:*',
    'inventory:supplier:*',
    'inventory:report:stock',
    'inventory:statistics:read',
    'inventory:alerts:lowStock',
    'inventory:alerts:expiry',
    'inventory:movement:read',
    'inventory:search:barcode',
    'inventory:search:sku',
    'inventory:catalog:categories',
    'inventory:catalog:manufacturers',
    'inventory:storage:read',
    'inventory:dashboard:read',
    'pharmacy:drug:*',
    'pharmacy:drug:inventory-change:read',
    'pharmacy:drug:inventory-change:create',
    'pharmacy:invoice:*',
    'pharmacy:purchase-invoice:create',
    'pharmacy:purchase-invoice:read',
    'pharmacy:purchase-invoice:review',
    'pharmacy:purchase-invoice:commit-stock',
    'pharmacy:dashboard:*',
  ],
};

/** The wildcard -> concrete names map embedded in the migration. */
export function migrationExpansion(): Record<string, string[]> {
  const sql = readFileSync(WILDCARD_MIGRATION, 'utf8');
  const match = sql.match(/expansion CONSTANT JSONB := '([\s\S]*?)';/);
  if (!match) throw new Error('Wildcard expansion map not found in migration');
  return JSON.parse(match[1]);
}

/** What the migration does to one stored list, for comparison with the database run. */
export function expand(
  permissions: string[],
  expansion = migrationExpansion(),
): string[] {
  const out: string[] = [];
  for (const permission of permissions) {
    for (const name of expansion[permission] ?? [permission])
      if (!out.includes(name)) out.push(name);
  }
  return out;
}
