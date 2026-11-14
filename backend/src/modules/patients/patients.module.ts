import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { UsersModule } from '../users/users.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PatientDeduplicationService } from './patient-deduplication.service';

@Module({
  imports: [UsersModule, WhatsAppModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientDeduplicationService],
})
export class PatientsModule {}
