import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * @cc [owner:nareshshah139,label:security] manager-roles-pass-role-gate
 * OWNER, ADMIN and DOCTOR MUST pass every Roles() list, so a role list can never lock a
 * clinic manager or doctor out; other roles MUST be listed. Routes without Roles() admit any
 * authenticated user, and a request without a user role MUST be denied.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: UserRole } | undefined;

    if (!user || !user.role) {
      return false;
    }

    // OWNER, ADMIN, and DOCTOR have universal access
    if (user.role === 'OWNER' || user.role === 'ADMIN' || user.role === 'DOCTOR') {
      return true;
    }

    return requiredRoles.includes(user.role as UserRole);
  }
} 