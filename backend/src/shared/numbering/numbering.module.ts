import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { InvoiceNumbersService } from './invoice-numbers.service';

@Module({
  imports: [PrismaModule],
  providers: [InvoiceNumbersService],
  exports: [InvoiceNumbersService],
})
export class NumberingModule {}


