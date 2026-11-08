import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ROLE_PERMISSIONS } from '../role-permissions';
import {
  LEGACY_ROLE_DEFAULTS,
  expand,
  migrationExpansion,
} from './role-permission-fixtures';

const SRC = resolve(__dirname, '../../..');
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (
      path.endsWith('.ts') &&
      !path.endsWith('.spec.ts') &&
      !path.includes(`${join('rbac', 'tests')}`) &&
      !path.endsWith(join('rbac', 'role-permissions.ts'))
    )
      out.push(path);
  }
  return out;
}

describe('ROLE_PERMISSIONS defaults', () => {
  it('lists concrete permission names, with * only on the roles that bypass permission checks', () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      expect(
        permissions.filter(
          (p) =>
            p.includes('*') &&
            !(p === '*' && ['OWNER', 'ADMIN'].includes(role)),
        ),
      ).toEqual([]);
      expect(new Set(permissions).size).toBe(permissions.length);
    }
  });

  it('gives a PHARMACIST the stock list and item creation without a personal list', () => {
    expect(ROLE_PERMISSIONS.PHARMACIST).toEqual(
      expect.arrayContaining(['inventory:item:create', 'inventory:item:read']),
    );
  });

  it('keeps maker-checker and admin-only tools out of the expanded defaults', () => {
    expect(ROLE_PERMISSIONS.PHARMACIST).not.toContain(
      'pharmacy:drug:inventory-change:approve',
    );
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain(
      'pharmacy:drug:inventory-change:approve',
    );
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain(
      'billing:invoice:generateSamples',
    );
  });
});

describe('expand_role_permission_wildcards migration', () => {
  const expansion = migrationExpansion();

  it('rewrites every legacy role default to exactly the current default', () => {
    for (const [role, legacy] of Object.entries(LEGACY_ROLE_DEFAULTS)) {
      expect([...expand(legacy, expansion)].sort()).toEqual(
        [...ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]].sort(),
      );
    }
  });

  it('expands each wildcard only to names under its own prefix', () => {
    for (const [wildcard, names] of Object.entries(expansion)) {
      expect(wildcard.endsWith(':*')).toBe(true);
      for (const name of names)
        expect(name.startsWith(wildcard.slice(0, -1))).toBe(true);
    }
  });

  it('expands only to names that some endpoint or service actually checks', () => {
    const code = sources(SRC)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(
      Object.values(expansion)
        .flat()
        .filter((p) => !code.includes(`'${p}'`)),
    ).toEqual([]);
  });

  it('never expands to concrete wildcards, approval of drug changes or sample generation', () => {
    const names = Object.values(expansion).flat();
    expect(names.filter((n) => n.includes('*'))).toEqual([]);
    expect(names).not.toContain('pharmacy:drug:inventory-change:approve');
    expect(names).not.toContain('billing:invoice:generateSamples');
  });
});
