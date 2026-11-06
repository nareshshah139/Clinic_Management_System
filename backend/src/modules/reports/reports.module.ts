import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PharmacyReportsService } from './pharmacy-reports.service';
import { PharmacyReportsController } from './pharmacy-reports.controller';
import { PrismaModule } from '../../shared/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, PharmacyReportsController],
  providers: [ReportsService, PharmacyReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
