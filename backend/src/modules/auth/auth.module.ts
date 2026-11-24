import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PasswordResetService } from './password-reset.service';

/**
 * @cc [owner:nareshshah139,label:security] default-throttle-window
 * Every route without its own limit MUST allow at most DEFAULT_THROTTLE.limit requests per
 * client address in a 60-second window (ttl is in milliseconds) and answer 429 with Retry-After
 * beyond it. Portal limits MUST NOT rely on this throttler.
 */
export const DEFAULT_THROTTLE = { ttl: 60_000, limit: 600 };

@Module({
  imports: [
    ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    JwtStrategy,
    {
      provide: 'APP_GUARD',
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
