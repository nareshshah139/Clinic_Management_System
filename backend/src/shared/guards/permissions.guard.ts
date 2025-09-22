import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
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

    // Require all listed permissions
    return requiredPermissions.every((perm) => userPermissions.includes(perm));
  }
} 