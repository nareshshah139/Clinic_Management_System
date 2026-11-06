import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { DoctorAvailabilityController } from './doctor-availability.controller';
import { DoctorAvailabilityService } from './doctor-availability.service';

@Module({
  imports: [PrismaModule],
  controllers: [DoctorAvailabilityController],
  providers: [DoctorAvailabilityService],
})
export class DoctorAvailabilityModule {}
