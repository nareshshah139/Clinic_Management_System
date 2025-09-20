import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from './shared/database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PatientsModule } from './modules/patients/patients.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { VisitsModule } from './modules/visits/visits.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ReportsModule } from './modules/reports/reports.module';
// import { ConsentsModule } from './modules/consents/consents.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OneMgModule } from './modules/pharmacy/one-mg/one-mg.module';
import { PharmacyModule } from './modules/pharmacy/pharmacy.module';

const minimalBoot = process.env.MINIMAL_BOOT === 'true';

const commonImports = [
  ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: '.env',
  }),
  PrismaModule,
  PassportModule.register({ defaultStrategy: 'jwt' }),
  JwtModule.register({
    secret: process.env.JWT_SECRET,
    signOptions: { expiresIn: process.env.JWT_EXPIRES_IN },
  }),
];

const fullFeatureModules = [
  AuthModule,
  PatientsModule,
  AppointmentsModule,
  VisitsModule,
  PrescriptionsModule,
  BillingModule,
  InventoryModule,
  ReportsModule,
  // ConsentsModule,
  UsersModule,
  NotificationsModule,
  OneMgModule,
  PharmacyModule,
];

const minimalModules = [AuthModule];

@Module({
  imports: [
    ...commonImports,
    ...(minimalBoot ? minimalModules : fullFeatureModules),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
