import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ClinicBillType, ClinicFee, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { BILL_TYPE_LABEL } from '../appointments/appointment-billing';

export const BILL_TYPES = Object.keys(BILL_TYPE_LABEL) as ClinicBillType[];

const FEE_EDITOR_ROLES: readonly string[] = [UserRole.OWNER, UserRole.ADMIN];
export const canEditFees = (role: string) => FEE_EDITOR_ROLES.includes(role);

export type FeeActor = { id: string; role: string; branchId: string };

export type ClinicFeeRow = {
  billType: ClinicBillType;
  label: string;
  amount: number | null;
  /** 0 until the fee is first saved; send it back to save over this row. */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

const RUPEES = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** The fee each bill type starts from in this branch; bill types without one are absent. */
export async function feeAmounts(prisma: PrismaService, branchId: string): Promise<Partial<Record<ClinicBillType, number>>> {
  const rows = await prisma.clinicFee.findMany({ where: { branchId, amount: { not: null } }, select: { billType: true, amount: true } });
  return Object.fromEntries(rows.map((row) => [row.billType, row.amount as number]));
}

/**
 * @cc [owner:nareshshah139,label:product;security] clinic-fee-list
 * Only OWNER and ADMIN MAY read or change the fee list; every other role, DOCTOR included, MUST get
 * 403. The list MUST hold one row per bill type and branch. Saving the amount a row already holds
 * MUST succeed without a change; saving over a version someone else has since changed MUST get 409
 * and change nothing. A saved fee MUST NOT change any existing bill.
 */
@Injectable()
export class ClinicFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: FeeActor): Promise<{ fees: ClinicFeeRow[] }> {
    this.assertEditor(actor);
    const rows = await this.prisma.clinicFee.findMany({ where: { branchId: actor.branchId } });
    const names = await this.namesOf(rows.map((row) => row.updatedById));
    return { fees: BILL_TYPES.map((billType) => rowOf(billType, rows.find((row) => row.billType === billType), names)) };
  }

  async set(actor: FeeActor, billType: ClinicBillType, amount: number | null, version: number): Promise<ClinicFeeRow> {
    this.assertEditor(actor);
    const key = { branchId_billType: { branchId: actor.branchId, billType } };
    const current = await this.prisma.clinicFee.findUnique({ where: key });
    if ((current?.amount ?? null) === amount) return this.present(billType, current);
    if ((current?.version ?? 0) !== version) throw await this.conflict(billType, current);
    const data = { amount, updatedById: actor.id };
    try {
      const saved = current
        ? await this.prisma.clinicFee.update({ where: { ...key, version }, data: { ...data, version: { increment: 1 } } })
        : await this.prisma.clinicFee.create({ data: { ...data, branchId: actor.branchId, billType } });
      return this.present(billType, saved);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2002', 'P2025'].includes(error.code)) throw error;
      const now = await this.prisma.clinicFee.findUnique({ where: key });
      if ((now?.amount ?? null) === amount) return this.present(billType, now);
      throw await this.conflict(billType, now);
    }
  }

  private assertEditor(actor: FeeActor) {
    if (!canEditFees(actor.role)) throw new ForbiddenException('Only an admin can see or change the fee list.');
  }

  private async conflict(billType: ClinicBillType, now: ClinicFee | null) {
    const row = await this.present(billType, now);
    const what = row.amount === null ? `cleared the ${row.label} fee` : `set the ${row.label} fee to ${RUPEES.format(row.amount)}`;
    return new ConflictException(`${row.updatedBy ?? 'Someone'} ${what} while you were editing. Check it and save again.`);
  }

  private async present(billType: ClinicBillType, row: ClinicFee | null) {
    return rowOf(billType, row ?? undefined, await this.namesOf(row ? [row.updatedById] : []));
  }

  private async namesOf(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));
  }
}

function rowOf(billType: ClinicBillType, row: ClinicFee | undefined, names: Map<string, string>): ClinicFeeRow {
  return {
    billType,
    label: BILL_TYPE_LABEL[billType],
    amount: row?.amount ?? null,
    version: row?.version ?? 0,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    updatedBy: row ? names.get(row.updatedById) ?? null : null,
  };
}
