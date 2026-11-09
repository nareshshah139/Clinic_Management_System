import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type InvoiceNumberType = 'BILLING' | 'PHARMACY' | string;

@Injectable()
export class InvoiceNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:integrity] invoice-numbers-unique-per-period
   * reserve() MUST hand out each number once per type, branch and period: concurrent callers for one
   * key get distinct consecutive numbers, the first call in a period gets 1, and other branches,
   * types and periods MUST NOT advance.
   */
  async reserve(params: { type: InvoiceNumberType; branchId: string; date?: Date }): Promise<{ sequence: number; periodKey: string }> {
    const { type, branchId } = params;
    const date = params.date ?? new Date();
    const periodKey = this.computePeriodKey(type, date);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.prisma.numberSequence.upsert({
          where: { type_branchId_periodKey: { type, branchId, periodKey } },
          update: { lastNumber: { increment: 1 } },
          create: { type, branchId, periodKey, lastNumber: 1 },
          select: { lastNumber: true },
        });
        return { sequence: row.lastNumber, periodKey };
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }

    throw new Error('Failed to reserve invoice number after multiple attempts');
  }

  /**
   * @cc [owner:nareshshah139,label:integrity] invoice-period-by-type
   * BILLING numbers MUST restart every day (YYYYMMDD) and PHARMACY numbers every year (YYYY);
   * any other type MUST fall back to a daily period.
   */
  /**
   * @cc [owner:nareshshah139,label:integrity;target] invoice-period-follows-clinic-day
   * The period MUST follow the clinic's IST calendar date whatever the server timezone. Today it reads
   * the server's local date, so on a UTC server a sale from 00:00 to 05:30 IST joins the previous day
   * (or year). This is a target obligation, not a pass claim.
   */
  private computePeriodKey(type: InvoiceNumberType, date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (type === 'BILLING') {
      return `${year}${month}${day}`; // daily sequences
    }
    if (type === 'PHARMACY') {
      return `${year}`; // yearly sequences
    }
    // Default to daily if unknown type
    return `${year}${month}${day}`;
  }
}


