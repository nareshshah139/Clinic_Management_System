import { Module } from '@nestjs/common';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';
import { DrugController } from './drug.controller';
import { DrugService } from './drug.service';
import { PharmacyInvoiceController } from './pharmacy-invoice.controller';
import { PharmacyInvoiceService } from './pharmacy-invoice.service';
import { PharmacyPurchaseInvoiceController } from './pharmacy-purchase-invoice.controller';
import { PharmacyPurchaseInvoiceService } from './pharmacy-purchase-invoice.service';
import { PharmacyPackageController } from './pharmacy-package.controller';
import { PharmacyPackageService } from './pharmacy-package.service';
import { PharmacyPrescriptionQueueController } from './pharmacy-prescription-queue.controller';
import { PharmacyPrescriptionQueueService } from './pharmacy-prescription-queue.service';
import { PrismaModule } from '../../shared/database/prisma.module';
import { NumberingModule } from '../../shared/numbering/numbering.module';

@Module({
  imports: [PrismaModule, NumberingModule],
  controllers: [
    PharmacyController,
    DrugController,
    PharmacyInvoiceController,
    PharmacyPurchaseInvoiceController,
    PharmacyPackageController,
    PharmacyPrescriptionQueueController,
  ],
  providers: [
    PharmacyService,
    DrugService,
    PharmacyInvoiceService,
    PharmacyPurchaseInvoiceService,
    PharmacyPackageService,
    PharmacyPrescriptionQueueService,
  ],
  exports: [
    PharmacyService,
    DrugService,
    PharmacyInvoiceService,
    PharmacyPurchaseInvoiceService,
    PharmacyPackageService,
    PharmacyPrescriptionQueueService,
  ],
})
export class PharmacyModule {}
