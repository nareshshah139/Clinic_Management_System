import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PermissionRequirement } from '../decorators/permissions.decorator';
import { PrismaService } from '../database/prisma.service';
import { grantsForRole, parsePermissionList, permissionGrants } from '../access/permission-grants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * @cc [owner:nareshshah139,label:security] scoped-permission-wildcards
   * A grant ending in :* matches its scope and every permission nested under it at a segment
   * boundary. A stored bare wildcard MUST NOT act as a bypass for roles outside OWNER, ADMIN and
   * DOCTOR, and all permission requirement groups remain mandatory.
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

    const roleRecord = await this.prisma.role
      .findFirst({ where: { name: dbUser.role }, select: { permissions: true } })
      .catch(() => null);
    const grants = permissionGrants(
      grantsForRole(dbUser.role, [
        ...parsePermissionList(roleRecord?.permissions),
        ...parsePermissionList(dbUser.permissions),
      ]),
    );

    return requiredPermissions.every((requirement) =>
      typeof requirement === 'string'
        ? grants.has(requirement)
        : requirement.some((permission) => grants.has(permission)),
    );
  }
}
