import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';

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

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, branchId: true, status: true, isActive: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE || !user.isActive) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }
    // Expose both id and userId for compatibility across controllers
    return { id: user.id, userId: user.id, email: user.email, role: user.role, branchId: user.branchId };
  }
}
