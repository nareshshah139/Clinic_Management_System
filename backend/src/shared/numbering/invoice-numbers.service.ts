import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type InvoiceNumberType = 'BILLING' | 'PHARMACY' | string;

@Injectable()
export class InvoiceNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:integrity;target] invoice-numbers-unique-per-period
   * reserve() MUST hand out each number once per type, branch and period: concurrent callers for one
   * key get distinct consecutive numbers, the first call in a period gets 1, and other branches,
   * types and periods MUST NOT advance. This is a target obligation, not a pass claim.
   */
  async reserve(params: { type: InvoiceNumberType; branchId: string; date?: Date }): Promise<{ sequence: number; periodKey: string }> {
    const { type, branchId } = params;
    const date = params.date ?? new Date();
    const periodKey = this.computePeriodKey(type, date);

    // Retry loop to handle unique constraint races
    for (let attempt = 0; attempt < 5; attempt++) {
      // Try atomic increment first
      const updated = await (this.prisma as any).numberSequence.updateMany({
        where: { type, branchId, periodKey },
        data: { lastNumber: { increment: 1 } },
      });

      if (updated.count > 0) {
        const row = await (this.prisma as any).numberSequence.findFirst({
          where: { type, branchId, periodKey },
          select: { lastNumber: true },
        });
        return { sequence: row.lastNumber, periodKey };
      }

      // No row yet; try to create one with sequence = 1
      try {
        const created = await (this.prisma as any).numberSequence.create({
          data: { type, branchId, periodKey, lastNumber: 1 },
          select: { lastNumber: true },
        });
        return { sequence: created.lastNumber, periodKey };
      } catch (err) {
        // Likely unique conflict due to race; retry
      }
    }

    // Fallback: ensure we return something or throw
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


