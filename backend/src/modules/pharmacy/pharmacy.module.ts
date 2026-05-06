import { Module } from '@nestjs/common';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';
import { DrugController } from './drug.controller';
import { DrugService } from './drug.service';
import { PharmacyInvoiceController } from './pharmacy-invoice.controller';
import { PharmacyInvoiceService } from './pharmacy-invoice.service';
import { PharmacyPurchaseInvoiceController } from './pharmacy-purchase-invoice.controller';
import { PharmacyPurchaseInvoiceService } from './pharmacy-purchase-invoice.service';
import { PharmacyPurchaseLedgerController } from './pharmacy-purchase-ledger.controller';
import { PharmacyPurchaseLedgerService } from './pharmacy-purchase-ledger.service';
import { PharmacyPackageController } from './pharmacy-package.controller';
import { PharmacyPackageService } from './pharmacy-package.service';
import { PrismaModule } from '../../shared/database/prisma.module';
import { NumberingModule } from '../../shared/numbering/numbering.module';

@Module({
  imports: [PrismaModule, NumberingModule],
  controllers: [
    PharmacyController,
    DrugController,
    PharmacyInvoiceController,
    PharmacyPurchaseInvoiceController,
    PharmacyPurchaseLedgerController,
    PharmacyPackageController,
  ],
  providers: [
    PharmacyService,
    DrugService,
    PharmacyInvoiceService,
    PharmacyPurchaseInvoiceService,
    PharmacyPurchaseLedgerService,
    PharmacyPackageService,
  ],
  exports: [
    PharmacyService,
    DrugService,
    PharmacyInvoiceService,
    PharmacyPurchaseInvoiceService,
    PharmacyPurchaseLedgerService,
    PharmacyPackageService,
  ],
})
export class PharmacyModule {}
