import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { DailyCollectionService } from './daily-collection.service';
import { DailyCollectionController } from './daily-collection.controller';
import { PrismaModule } from '../../shared/database/prisma.module';
import { NumberingModule } from '../../shared/numbering/numbering.module';

@Module({
  imports: [PrismaModule, NumberingModule],
  controllers: [BillingController, DailyCollectionController],
  providers: [BillingService, DailyCollectionService],
  exports: [BillingService],
})
export class BillingModule {}
