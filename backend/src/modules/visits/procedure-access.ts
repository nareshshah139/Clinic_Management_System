import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { mergeMetadata } from '../users/users.service';

/** These roles always record procedures, and only they may change who else can. */
export const PROCEDURE_LEAD_ROLES: UserRole[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR];
export const GRANTABLE_RECORD_ROLES: UserRole[] = [UserRole.NURSE, UserRole.MANAGER];
export const RECORD_ROLE_CHOICES: UserRole[] = [...PROCEDURE_LEAD_ROLES, ...GRANTABLE_RECORD_ROLES];

export interface ProcedureAccess {
  recordRoles: UserRole[];
}

export interface MyProcedureAccess {
  canRecord: boolean;
  canConfigure: boolean;
}

export const NOT_A_RECORDER_MESSAGE = 'Your role can view procedures but not record them. A doctor or admin can change this.';

/** Lead roles are always in, anything outside the choices is dropped, and the order is fixed. */
export function procedureAccess(roles: readonly unknown[]): ProcedureAccess {
  return { recordRoles: RECORD_ROLE_CHOICES.filter((role) => PROCEDURE_LEAD_ROLES.includes(role) || roles.includes(role)) };
}

export function readProcedureAccess(branchMetadata: string | null): ProcedureAccess {
  let stored: unknown;
  try {
    stored = JSON.parse(branchMetadata ?? 'null')?.procedureAccess?.recordRoles;
  } catch {
    stored = undefined;
  }
  return procedureAccess(Array.isArray(stored) ? stored : []);
}

/** A procedure record is a visit whose first dermatology procedure names the machine used. */
export function isRecordedProcedure(entry: unknown): boolean {
  const machine = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as { machine?: unknown }).machine : undefined;
  return typeof machine === 'string' && machine.trim() !== '';
}

/**
 * @cc [owner:nareshshah139,label:security] procedure-record-access
 * Recording a procedure MUST be allowed only for OWNER, ADMIN, DOCTOR and the roles the branch's
 * procedure access setting adds; a branch with no setting MUST allow only those three. Only OWNER,
 * ADMIN and DOCTOR MAY read or change the setting, and every change MUST write one audit log row.
 */
@Injectable()
export class ProcedureAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async get(branchId: string): Promise<ProcedureAccess> {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { metadata: true } });
    return readProcedureAccess(branch?.metadata ?? null);
  }

  async forRole(branchId: string, role: string): Promise<MyProcedureAccess> {
    const { recordRoles } = await this.get(branchId);
    return { canRecord: recordRoles.includes(role as UserRole), canConfigure: PROCEDURE_LEAD_ROLES.includes(role as UserRole) };
  }

  async assertCanRecord(branchId: string, role: string): Promise<void> {
    if (!(await this.forRole(branchId, role)).canRecord) throw new ForbiddenException(NOT_A_RECORDER_MESSAGE);
  }

  async update(branchId: string, actorId: string, roles: readonly UserRole[]): Promise<ProcedureAccess> {
    const next = procedureAccess(roles);
    // Compare-and-swap on the stored text, as user metadata does, so other branch settings survive a concurrent save.
    for (let attempt = 0; attempt < 20; attempt++) {
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { metadata: true } });
      if (!branch) throw new NotFoundException('Branch not found');
      const previous = readProcedureAccess(branch.metadata);
      if (previous.recordRoles.join() === next.recordRoles.join()) return next;
      const saved = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.branch.updateMany({
          where: { id: branchId, metadata: branch.metadata },
          data: { metadata: JSON.stringify(mergeMetadata(branch.metadata, { procedureAccess: next })) },
        });
        if (count !== 1) return false;
        await tx.auditLog.create({
          data: {
            userId: actorId, action: 'PROCEDURE_ACCESS_UPDATED', entity: 'Branch', entityId: branchId,
            oldValues: JSON.stringify(previous), newValues: JSON.stringify(next),
          },
        });
        return true;
      });
      if (saved) return next;
    }
    throw new ConflictException('Settings changed while saving; please try again.');
  }
}
