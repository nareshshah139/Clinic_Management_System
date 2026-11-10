import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type InvoiceNumberType = 'BILLING' | 'PHARMACY' | string;

/** India has no daylight saving, so the clinic day is UTC plus a fixed 5:30. */
const IST_OFFSET_MS = 330 * 60_000;

@Injectable()
export class InvoiceNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:integrity] invoice-numbers-unique-per-period
   * reserve() MUST hand out each number once per type, branch and period: concurrent callers for one
   * key get distinct consecutive numbers, the first call in a period gets 1, and other branches,
   * types and periods MUST NOT advance. Reserved on a caller's transaction, the number MUST be released
   * again when that transaction rolls back.
   */
  async reserve(
    params: { type: InvoiceNumberType; branchId: string; date?: Date },
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ sequence: number; periodKey: string }> {
    const { type, branchId } = params;
    const periodKey = this.computePeriodKey(type, params.date ?? new Date());

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await client.numberSequence.upsert({
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
   * @cc [owner:nareshshah139,label:integrity] invoice-period-follows-clinic-day
   * The period MUST follow the clinic's IST calendar date whatever the server timezone, so a sale at
   * 00:15 IST belongs to that IST day and year.
   */
  private computePeriodKey(type: InvoiceNumberType, date: Date): string {
    const ist = new Date(date.getTime() + IST_OFFSET_MS).toISOString();
    const year = ist.slice(0, 4);
    if (type === 'PHARMACY') return year;
    return `${year}${ist.slice(5, 7)}${ist.slice(8, 10)}`;
  }
}


