import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  PurchaseRegisterPage,
  PurchaseRegisterQuery,
  canSettlePurchases,
  purchaseEntry,
  purchaseRegisterPage,
} from './pharmacy-purchase-register';
import { clinicDay, clinicDayRange, peopleById } from './register-utils';

export type PurchaseRegisterActor = { id: string; role: string; branchId: string };

export type PurchaseRegisterResponse = PurchaseRegisterPage & {
  canSettle: boolean;
};

const permissionList = (value: unknown): string[] => {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

@Injectable()
export class PharmacyPurchaseRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: PurchaseRegisterQuery,
    actor: PurchaseRegisterActor,
    now = new Date(),
  ): Promise<PurchaseRegisterResponse> {
    const [invoices, canSettle] = await Promise.all([
      this.prisma.pharmacyPurchaseInvoice.findMany({
        where: {
          branchId: actor.branchId,
          invoiceDate: clinicDayRange(query.from, query.to),
        },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          createdAt: true,
          createdBy: true,
          source: true,
          status: true,
          distributorName: true,
          distributorGstin: true,
          netPayable: true,
          creditApplied: true,
          paymentAllocations: {
            where: { payment: { reversedAt: null } },
            select: { amount: true },
          },
        },
      }),
      this.canSettle(actor),
    ]);
    const people = await peopleById(this.prisma, invoices.map((invoice) => invoice.createdBy));
    const today = clinicDay(now);
    const entries = invoices.map((invoice) =>
      purchaseEntry(
        invoice,
        invoice.createdBy ? (people.get(invoice.createdBy) ?? null) : null,
        today,
      ),
    );
    return { ...purchaseRegisterPage(entries, query), canSettle };
  }

  private async canSettle(actor: PurchaseRegisterActor) {
    if (canSettlePurchases(actor.role, [])) return true;
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { role: true, permissions: true },
    });
    if (!user) return false;
    const role = await this.prisma.role.findFirst({
      where: { name: user.role },
      select: { permissions: true },
    });
    return canSettlePurchases(actor.role, [
      ...permissionList(user.permissions),
      ...permissionList(role?.permissions),
    ]);
  }
}
