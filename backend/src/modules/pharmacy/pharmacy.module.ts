import { Module } from '@nestjs/common';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';
import { DrugController } from './drug.controller';
import { DrugService } from './drug.service';
import { PharmacyInvoiceController } from './pharmacy-invoice.controller';
import { PharmacyInvoiceService } from './pharmacy-invoice.service';
import { PrismaModule } from '../../shared/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    PharmacyController,
    DrugController,
    PharmacyInvoiceController,
  ],
  providers: [
    PharmacyService,
    DrugService,
    PharmacyInvoiceService,
  ],
  exports: [
    PharmacyService,
    DrugService,
    PharmacyInvoiceService,
  ],
})
export class PharmacyModule {} 