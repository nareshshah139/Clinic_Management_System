import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_KEY, ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY, PermissionRequirement } from '../decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

/**
 * @cc [owner:nareshshah139,label:security] manager-roles-pass-role-gate
 * OWNER, ADMIN and DOCTOR MUST pass every Roles() list, so a role list can never lock a
 * clinic manager or doctor out; other roles MUST be listed, and a request without a user role
 * MUST be denied on a role-listed route.
 */
export function roleMeetsRoles(role: string | undefined, required: readonly UserRole[]): boolean {
  if (!role) return false;
  return role === 'OWNER' || role === 'ADMIN' || role === 'DOCTOR' || required.includes(role as UserRole);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * @cc [owner:nareshshah139,label:security] route-access-declarations
   * Routes without a public, authenticated, role or permission declaration MUST be denied.
   * Permission-only routes defer to the permissions guard; public routes remain accessible.
   */
  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('isPublic', targets)) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: UserRole } | undefined;
    const methodRoles = this.reflector.get<UserRole[]>(ROLES_KEY, context.getHandler());
    const methodPermissions = this.reflector.get<PermissionRequirement[]>(PERMISSIONS_KEY, context.getHandler());
    const authenticated = this.reflector.get<boolean>(AUTHENTICATED_KEY, context.getHandler()) ??
      ((!methodRoles?.length && !methodPermissions?.length) ? this.reflector.get<boolean>(AUTHENTICATED_KEY, context.getClass()) : false);
    if (authenticated) return !!user?.role;
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      const permissions = this.reflector.getAllAndOverride<PermissionRequirement[]>(PERMISSIONS_KEY, targets);
      return !!user?.role && !!permissions?.length;
    }

    return roleMeetsRoles(user?.role, requiredRoles);
  }
} 