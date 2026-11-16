import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /**
   * @cc [owner:nareshshah139,label:security] jwt-secret-required
   * Startup MUST fail when JWT_SECRET is absent; token verification MUST never use a fallback key.
   */
  constructor(private configService: ConfigService) {
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

  async validate(payload: any) {
    // Expose both id and userId for compatibility across controllers
    return {
      id: payload.sub,
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      branchId: payload.branchId,
    };
  }
}
