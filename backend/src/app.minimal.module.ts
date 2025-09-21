import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './shared/database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { PassportModule } from '@nestjs/passport';
import { RolesGuard } from './shared/guards/roles.guard';
import { PermissionsGuard } from './shared/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppMinimalModule {}
