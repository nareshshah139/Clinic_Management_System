import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash } from 'crypto';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';

export const passwordStamp = (passwordHash: string) =>
  createHash('sha256').update(passwordHash).digest('base64url').slice(0, 16);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /**
   * @cc [owner:nareshshah139,label:security] jwt-secret-required
   * Startup MUST fail when JWT_SECRET is absent; token verification MUST never use a fallback key.
   */
  constructor(
    private configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const cookieExtractor = (req: Request): string | null => {
      const raw = req?.headers?.cookie;
      if (!raw) return null;
      const match = raw.match(/(?:^|; )auth_token=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    };

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * @cc [owner:nareshshah139,label:security] staff-token-refuses-patients
   * A token whose user now has the PATIENT role MUST be refused on every staff route, including a
   * token issued before this check existed. A request that carries no auth_token cookie and no
   * bearer token, such as one with only a portal cookie, MUST get 401.
   */
  async validate(payload: { sub: string; pwdStamp?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, branchId: true, status: true, isActive: true, password: true },
    });
    if (
      !user || user.role === UserRole.PATIENT || user.status !== UserStatus.ACTIVE || !user.isActive ||
      payload.pwdStamp !== passwordStamp(user.password)
    ) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }
    // Expose both id and userId for compatibility across controllers
    return { id: user.id, userId: user.id, email: user.email, role: user.role, branchId: user.branchId };
  }
}
