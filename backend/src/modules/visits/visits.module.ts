import { Module } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [PrismaModule, AppointmentsModule, MulterModule.register({})],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
