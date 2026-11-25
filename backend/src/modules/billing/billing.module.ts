import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { ClinicFeesController } from './clinic-fees.controller';
import { ClinicFeesService } from './clinic-fees.service';
import { ClinicBillRegisterController } from './clinic-bill-register.controller';
import { ClinicBillRegisterService } from './clinic-bill-register.service';
import { PrismaModule } from '../../shared/database/prisma.module';
import { NumberingModule } from '../../shared/numbering/numbering.module';

@Module({
  imports: [PrismaModule, NumberingModule],
  controllers: [
    BillingController,
    ClinicFeesController,
    ClinicBillRegisterController,
  ],
  providers: [BillingService, ClinicFeesService, ClinicBillRegisterService],
  exports: [BillingService],
})
export class BillingModule {}
