import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PermissionRequirement } from '../decorators/permissions.decorator';
import { PrismaService } from '../database/prisma.service';
import { hasScopedPermission } from './scoped-permission';

/**
 * @cc [owner:nareshshah139,label:security] permission-gate
 * OWNER (from the token) and ADMIN or DOCTOR (from the stored user role, not the token) MUST
 * pass every Permissions() requirement. Other users MUST hold every string requirement and one
 * entry of every alternative group in the union of their role and user grants. A missing user,
 * id or record, malformed grant JSON or an empty group MUST grant nothing.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * @cc [owner:nareshshah139,label:security] scoped-permission-wildcards
   * A grant ending in :* matches one nonempty action in the same scope, but MUST NOT match
   * nested scopes or a bare wildcard; all permission requirement groups remain mandatory.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionRequirement[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string; id?: string; role?: string } | undefined;

    if (!user) {
      return false;
    }

    // OWNER bypasses permission checks
    if (user.role === 'OWNER') {
      return true;
    }

    const userId = user.id || user.userId;
    if (!userId) {
      return false;
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { permissions: true, role: true },
    });

    if (!dbUser) {
      return false;
    }

    // ADMIN and DOCTOR bypass permission checks
    if (dbUser.role === 'ADMIN' || dbUser.role === 'DOCTOR') {
      return true;
    }

    let userPermissions: string[] = [];
    if (dbUser.permissions) {
      try {
        const parsed = JSON.parse(dbUser.permissions);
        if (Array.isArray(parsed)) {
          userPermissions = parsed.filter((p) => typeof p === 'string');
        }
      } catch {
        // malformed permissions JSON -> treat as no permissions
        userPermissions = [];
      }
    }

    // Merge in role default permissions (union) before evaluating
    let rolePermissions: string[] = [];
    try {
      const roleRecord = await this.prisma.role.findFirst({
        where: { name: dbUser.role },
        select: { permissions: true },
      });
      if (roleRecord?.permissions) {
        try {
          const parsedRole = JSON.parse(roleRecord.permissions);
          if (Array.isArray(parsedRole)) {
            rolePermissions = parsedRole.filter((p) => typeof p === 'string');
          }
        } catch {
          rolePermissions = [];
        }
      }
    } catch {
      rolePermissions = [];
    }

    const effectivePermissions = new Set([...(rolePermissions || []), ...(userPermissions || [])]);
    const permits = (permission: string) => hasScopedPermission(effectivePermissions, permission);

    // Existing string entries retain all-of semantics. Alternatives are accepted
    // only when explicitly declared by that endpoint.
    return requiredPermissions.every((requirement) =>
      typeof requirement === 'string'
        ? permits(requirement)
        : requirement.some(permits),
    );
  }
}
