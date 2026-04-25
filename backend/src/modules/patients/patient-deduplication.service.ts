import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Patient, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';

type DuplicatePatientCandidate = {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  createdAt: Date;
};

type MergeSummary = {
  skipped: boolean;
  duplicateGroupsFound: number;
  duplicateGroupsMerged: number;
  patientsArchived: number;
  visitsRenumbered: number;
};

@Injectable()
export class PatientDeduplicationService {
  private readonly logger = new Logger(PatientDeduplicationService.name);
  private readonly advisoryLockKey = 8042601;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 */6 * * *', {
    name: 'merge-duplicate-patients',
    timeZone: 'Asia/Kolkata',
  })
  async handleDuplicatePatientMergeCron() {
    await this.runDuplicatePatientMergeJob();
  }

  async runDuplicatePatientMergeJob(): Promise<MergeSummary> {
    const locked = await this.acquireAdvisoryLock();
    if (!locked) {
      this.logger.debug('Skipping duplicate patient merge job because another instance holds the advisory lock.');
      return {
        skipped: true,
        duplicateGroupsFound: 0,
        duplicateGroupsMerged: 0,
        patientsArchived: 0,
        visitsRenumbered: 0,
      };
    }

    try {
      const candidates = await this.prisma.patient.findMany({
        where: { isArchived: false },
        select: {
          id: true,
          branchId: true,
          name: true,
          phone: true,
          createdAt: true,
        },
      });

      const duplicateGroups = this.findDuplicateGroups(candidates);
      if (duplicateGroups.length === 0) {
        this.logger.debug('No duplicate patient groups found for automatic merge.');
        return {
          skipped: false,
          duplicateGroupsFound: 0,
          duplicateGroupsMerged: 0,
          patientsArchived: 0,
          visitsRenumbered: 0,
        };
      }

      let duplicateGroupsMerged = 0;
      let patientsArchived = 0;
      let visitsRenumbered = 0;

      for (const groupIds of duplicateGroups) {
        const result = await this.mergeDuplicateGroup(groupIds);
        if (result.archivedPatients > 0) {
          duplicateGroupsMerged += 1;
          patientsArchived += result.archivedPatients;
          visitsRenumbered += result.visitsRenumbered;
        }
      }

      this.logger.log(
        `Duplicate patient merge job completed. Groups found=${duplicateGroups.length}, merged=${duplicateGroupsMerged}, archived=${patientsArchived}, visitsRenumbered=${visitsRenumbered}`,
      );

      return {
        skipped: false,
        duplicateGroupsFound: duplicateGroups.length,
        duplicateGroupsMerged,
        patientsArchived,
        visitsRenumbered,
      };
    } catch (error) {
      this.logger.error('Automatic duplicate patient merge job failed.', error instanceof Error ? error.stack : undefined);
      throw error;
    } finally {
      await this.releaseAdvisoryLock();
    }
  }

  private async mergeDuplicateGroup(groupIds: string[]): Promise<{ archivedPatients: number; visitsRenumbered: number }> {
    return this.prisma.$transaction(async (tx) => {
      const patients = await tx.patient.findMany({
        where: {
          id: { in: groupIds },
          isArchived: false,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (patients.length < 2) {
        return { archivedPatients: 0, visitsRenumbered: 0 };
      }

      let canonical = patients[0];
      const duplicates = patients.slice(1);
      let archivedPatients = 0;

      for (const duplicate of duplicates) {
        canonical = await this.mergePatientIntoCanonical(tx, canonical, duplicate);
        archivedPatients += 1;
      }

      const visitsRenumbered = await this.renumberVisitsForPatient(tx, canonical.id);
      return { archivedPatients, visitsRenumbered };
    });
  }

  private async mergePatientIntoCanonical(
    tx: Prisma.TransactionClient,
    canonical: Patient,
    duplicate: Patient,
  ): Promise<Patient> {
    const canonicalPatch = this.buildCanonicalPatch(canonical, duplicate);
    const movePortalUserId = !canonical.portalUserId && duplicate.portalUserId ? duplicate.portalUserId : null;

    if (duplicate.portalUserId) {
      await tx.patient.update({
        where: { id: duplicate.id },
        data: { portalUserId: null },
      });

      if (canonical.portalUserId && canonical.portalUserId !== duplicate.portalUserId) {
        this.logger.warn(
          `Duplicate patient ${duplicate.id} had a different portal user than canonical patient ${canonical.id}. Keeping canonical portal user and unlinking duplicate.`,
        );
      }
    }

    if (movePortalUserId) {
      canonicalPatch.portalUserId = movePortalUserId;
    }

    if (Object.keys(canonicalPatch).length > 0) {
      canonical = await tx.patient.update({
        where: { id: canonical.id },
        data: canonicalPatch,
      });
    }

    await Promise.all([
      tx.appointment.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.visit.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.consent.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.deviceLog.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.invoice.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.labOrder.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.newInvoice.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.referral.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.pharmacyInvoice.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.draftAttachment.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
      tx.experimentAssignment.updateMany({ where: { patientId: duplicate.id }, data: { patientId: canonical.id } }),
    ]);

    await tx.patient.update({
      where: { id: duplicate.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        portalUserId: null,
      },
    });

    this.logger.log(`Merged duplicate patient ${duplicate.id} into canonical patient ${canonical.id}.`);
    return canonical;
  }

  private async renumberVisitsForPatient(tx: Prisma.TransactionClient, patientId: string): Promise<number> {
    const visits = await tx.visit.findMany({
      where: { patientId },
      include: {
        appointment: {
          select: { date: true },
        },
      },
    });

    const sortedVisits = [...visits].sort((left, right) => {
      const leftDate = left.appointment?.date?.getTime() ?? left.createdAt.getTime();
      const rightDate = right.appointment?.date?.getTime() ?? right.createdAt.getTime();
      if (leftDate !== rightDate) return leftDate - rightDate;
      if (left.createdAt.getTime() !== right.createdAt.getTime()) return left.createdAt.getTime() - right.createdAt.getTime();
      return left.id.localeCompare(right.id);
    });

    let updates = 0;

    for (const [index, visit] of sortedVisits.entries()) {
      const nextVisitNumber = index + 1;
      const scribeJson = this.parseJsonObject(visit.scribeJson);
      const currentVisitNumber = typeof scribeJson.visitNumber === 'number' ? scribeJson.visitNumber : Number(scribeJson.visitNumber);
      if (currentVisitNumber === nextVisitNumber) continue;

      await tx.visit.update({
        where: { id: visit.id },
        data: {
          scribeJson: JSON.stringify({
            ...scribeJson,
            visitNumber: nextVisitNumber,
          }),
        },
      });
      updates += 1;
    }

    return updates;
  }

  private findDuplicateGroups(candidates: DuplicatePatientCandidate[]): string[][] {
    const grouped = new Map<string, DuplicatePatientCandidate[]>();

    for (const candidate of candidates) {
      const key = this.buildDuplicateKey(candidate);
      if (!key) continue;
      const group = grouped.get(key) || [];
      group.push(candidate);
      grouped.set(key, group);
    }

    return [...grouped.values()]
      .filter((group) => group.length > 1)
      .map((group) =>
        group
          .sort((left, right) => {
            if (left.createdAt.getTime() !== right.createdAt.getTime()) {
              return left.createdAt.getTime() - right.createdAt.getTime();
            }
            return left.id.localeCompare(right.id);
          })
          .map((patient) => patient.id),
      );
  }

  private buildDuplicateKey(candidate: DuplicatePatientCandidate): string | null {
    const normalizedPhone = this.normalizePhone(candidate.phone);
    const normalizedName = this.normalizeName(candidate.name);
    if (!normalizedPhone || !normalizedName) return null;
    if (normalizedPhone.length < 7) return null;
    return `${candidate.branchId}:${normalizedPhone}:${normalizedName}`;
  }

  private normalizePhone(phone: string | null | undefined): string {
    return String(phone || '').replace(/\D/g, '');
  }

  private normalizeName(name: string | null | undefined): string {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private buildCanonicalPatch(canonical: Patient, duplicate: Patient): Prisma.PatientUpdateInput {
    const patch: Prisma.PatientUpdateInput = {};

    this.assignIfMissing(patch, 'patientCode', canonical.patientCode, duplicate.patientCode);
    this.assignIfMissing(patch, 'abhaId', canonical.abhaId, duplicate.abhaId);
    this.assignIfMissing(patch, 'email', canonical.email, duplicate.email);
    this.assignIfMissing(patch, 'address', canonical.address, duplicate.address);
    this.assignIfMissing(patch, 'city', canonical.city, duplicate.city);
    this.assignIfMissing(patch, 'state', canonical.state, duplicate.state);
    this.assignIfMissing(patch, 'pincode', canonical.pincode, duplicate.pincode);
    this.assignIfMissing(patch, 'emergencyContact', canonical.emergencyContact, duplicate.emergencyContact);
    this.assignIfMissing(patch, 'photoUrl', canonical.photoUrl, duplicate.photoUrl);
    this.assignIfMissing(patch, 'referralSource', canonical.referralSource, duplicate.referralSource);
    this.assignIfMissing(patch, 'secondaryPhone', canonical.secondaryPhone, duplicate.secondaryPhone);
    this.assignIfMissing(patch, 'maritalStatus', canonical.maritalStatus, duplicate.maritalStatus);
    this.assignIfMissing(patch, 'bloodGroup', canonical.bloodGroup, duplicate.bloodGroup);
    this.assignIfMissing(patch, 'occupation', canonical.occupation, duplicate.occupation);
    this.assignIfMissing(patch, 'guardianName', canonical.guardianName, duplicate.guardianName);
    this.assignIfMissing(patch, 'consultationType', canonical.consultationType, duplicate.consultationType);

    if (!canonical.dob && duplicate.dob) patch.dob = duplicate.dob;
    if (!canonical.age && duplicate.age) patch.age = duplicate.age;

    const mergedAllergies = this.mergeUniqueText(canonical.allergies, duplicate.allergies);
    if (mergedAllergies && mergedAllergies !== canonical.allergies) patch.allergies = mergedAllergies;

    const mergedMedicalHistory = this.mergeUniqueText(canonical.medicalHistory, duplicate.medicalHistory);
    if (mergedMedicalHistory && mergedMedicalHistory !== canonical.medicalHistory) patch.medicalHistory = mergedMedicalHistory;

    return patch;
  }

  private assignIfMissing(
    patch: Prisma.PatientUpdateInput,
    key: keyof Prisma.PatientUpdateInput,
    currentValue: string | null | undefined,
    incomingValue: string | null | undefined,
  ) {
    if (this.hasText(currentValue) || !this.hasText(incomingValue)) return;
    patch[key] = incomingValue?.trim();
  }

  private mergeUniqueText(primary: string | null | undefined, secondary: string | null | undefined): string | undefined {
    const parts = [primary, secondary]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    if (parts.length === 0) return undefined;

    const seen = new Set<string>();
    const merged = parts.filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return merged.join('\n');
  }

  private hasText(value: string | null | undefined): boolean {
    return Boolean(String(value || '').trim());
  }

  private parseJsonObject(value: string | null): Record<string, unknown> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore malformed legacy JSON; we replace it with a safe object
    }
    return {};
  }

  private async acquireAdvisoryLock(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(${this.advisoryLockKey}) AS locked
    `;
    return Boolean(rows[0]?.locked);
  }

  private async releaseAdvisoryLock(): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT pg_advisory_unlock(${this.advisoryLockKey})
      `;
    } catch (error) {
      this.logger.warn('Failed to release advisory lock for duplicate patient merge job.');
    }
  }
}
