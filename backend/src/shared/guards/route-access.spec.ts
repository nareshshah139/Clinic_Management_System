import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExecutionContext, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';

/**
 * @cc [owner:nareshshah139,label:security] reviewed-public-routes
 * Only these routes MAY skip authentication. Adding one, or changing any route's roles or
 * permissions, MUST update this list or the reviewed access matrix snapshot in the same change.
 */
const PUBLIC_ROUTES = [
  'GET /',
  'GET /health',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /auth/reset-password',
];

const srcRoot = path.resolve(__dirname, '..', '..');
const controllerFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'tests' ? [] : controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });

type Route = { key: string; controller: any; handler: any };
const join = (...parts: unknown[]) =>
  '/' +
  parts
    .flatMap((p) => (Array.isArray(p) ? p[0] : p) ?? '')
    .map(String)
    .join('/')
    .split('/')
    .filter(Boolean)
    .join('/');

function discoverRoutes(): Route[] {
  const routes: Route[] = [];
  for (const file of controllerFiles(srcRoot)) {
    for (const exported of Object.values(require(file))) {
      if (
        typeof exported !== 'function' ||
        Reflect.getMetadata(PATH_METADATA, exported) === undefined
      )
        continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, exported);
      for (const name of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = exported.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        routes.push({
          key: `${RequestMethod[method]} ${join(prefix, Reflect.getMetadata(PATH_METADATA, handler))}`,
          controller: exported,
          handler,
        });
      }
    }
  }
  return routes.sort((a, b) => a.key.localeCompare(b.key));
}

describe('route access across every controller', () => {
  const reflector = new Reflector();
  const routes = discoverRoutes();
  const read = <T>(key: string, route: Route) =>
    reflector.getAllAndOverride<T>(key, [route.handler, route.controller]);
  const context = (route: Route, user: unknown) =>
    ({
      getHandler: () => route.handler,
      getClass: () => route.controller,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  it('discovers every controller route', () => {
    expect(controllerFiles(srcRoot).length).toBeGreaterThanOrEqual(31);
    expect(routes.length).toBeGreaterThan(300);
    expect(new Set(routes.map((r) => r.key)).size).toBeGreaterThan(300);
  });

  it('exposes only the reviewed public routes', () => {
    expect(
      routes.filter((r) => read<boolean>('isPublic', r)).map((r) => r.key),
    ).toEqual(PUBLIC_ROUTES);
  });

  it.each(['OWNER', 'ADMIN', 'DOCTOR'])(
    'never blocks %s at the role or permission guard',
    async (role) => {
      const roles = new RolesGuard(reflector);
      const permissions = new PermissionsGuard(reflector, {
        user: { findUnique: async () => ({ role, permissions: null }) },
        role: { findFirst: async () => null },
      } as any);
      const blocked: string[] = [];
      for (const route of routes) {
        const user = { id: 'manager', role, branchId: 'branch' };
        if (
          !roles.canActivate(context(route, user)) ||
          !(await permissions.canActivate(context(route, user)))
        )
          blocked.push(route.key);
      }
      expect(blocked).toEqual([]);
    },
  );

  it('matches the reviewed access matrix', () => {
    const matrix = routes.map((route) => {
      if (read<boolean>('isPublic', route)) return `${route.key} | public`;
      const roles = read<string[]>(ROLES_KEY, route);
      const permissions = read<(string | string[])[]>(PERMISSIONS_KEY, route);
      const roleText = roles?.length ? roles.join(',') : 'any signed-in user';
      const permissionText = permissions?.length
        ? permissions
            .map((p) => (Array.isArray(p) ? p.join('|') : p))
            .join(' & ')
        : '-';
      return `${route.key} | roles: ${roleText} | permissions: ${permissionText}`;
    });
    expect(matrix.join('\n')).toMatchSnapshot();
  });
});
