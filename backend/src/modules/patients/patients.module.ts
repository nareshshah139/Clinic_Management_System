import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientDeduplicationService } from './patient-deduplication.service';
import { PatientPortalController } from './portal/patient-portal.controller';
import { PatientPortalService } from './portal/patient-portal.service';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [PatientsController, PatientPortalController],
  providers: [PatientsService, PatientDeduplicationService, PatientPortalService],
  exports: [PatientPortalService],
})
export class PatientsModule {}
