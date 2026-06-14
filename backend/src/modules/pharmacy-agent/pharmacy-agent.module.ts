import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ReportsModule } from '../reports/reports.module';
import { PharmacyAgentController } from './pharmacy-agent.controller';
import { PharmacyAgentService } from './pharmacy-agent.service';

@Module({
  imports: [PrismaModule, PharmacyModule, InventoryModule, ReportsModule],
  controllers: [PharmacyAgentController],
  providers: [PharmacyAgentService],
  exports: [PharmacyAgentService],
})
export class PharmacyAgentModule {}
