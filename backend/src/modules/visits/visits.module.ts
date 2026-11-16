import { Module } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';
import { InvestigationOptionsController } from './investigation-options.controller';
import { InvestigationOptionsService } from './investigation-options.service';
import { PrismaModule } from '../../shared/database/prisma.module';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [PrismaModule, MulterModule.register({})],
  controllers: [VisitsController, InvestigationOptionsController],
  providers: [VisitsService, InvestigationOptionsService],
  exports: [VisitsService],
})
export class VisitsModule {}
