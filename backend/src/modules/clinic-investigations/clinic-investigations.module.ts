import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { ClinicInvestigationsController } from './clinic-investigations.controller';
import { ClinicInvestigationsService } from './clinic-investigations.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicInvestigationsController],
  providers: [ClinicInvestigationsService],
})
export class ClinicInvestigationsModule {}
