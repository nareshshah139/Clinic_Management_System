import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WhatsAppConsentState } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ensureProfile, nextConsent } from './portal-profile';
import { CodeResult, confirmByCode, requestNumberConfirmation } from '../../messaging/number-confirmation';

@Injectable()
export class PatientPortalService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadPatient(patientId: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, branchId }, select: { id: true, isArchived: true } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async recordConsent(patientId: string, branchId: string, action: 'agreed' | 'refused', byUserId: string) {
    await this.loadPatient(patientId, branchId);
    return this.prisma.$transaction(async (tx) => {
      const profile = await ensureProfile(tx, patientId);
      if (action === 'agreed' && !profile.phoneE164) {
        throw new BadRequestException('This patient has no phone number WhatsApp can use. Fix the phone number first.');
      }
      const to = nextConsent(profile.consentState, action);
      if (!to) throw new ConflictException(`Consent cannot move from ${profile.consentState} on ${action}`);
      const updated = await tx.patientPortalProfile.update({
        where: { patientId },
        data: {
          consentState: to,
          consentRecordedById: byUserId,
          consentRecordedAt: new Date(),
          consentMethod: action === 'agreed' ? 'reception-agreed' : 'reception-refused',
          ...(to === WhatsAppConsentState.OPTED_OUT ? { phoneConfirmedAt: null } : {}),
        },
      });
      if (to === WhatsAppConsentState.PENDING && profile.phoneE164) {
        await requestNumberConfirmation(tx, profile.phoneE164, updated.preferredLanguage, patientId);
      }
      return updated;
    });
  }

  /** Reception types the code the patient read out from the confirmation message. */
  async confirmWithCode(patientId: string, branchId: string, code: string) {
    await this.loadPatient(patientId, branchId);
    const result: CodeResult = await this.prisma.$transaction(async (tx) => {
      const profile = await ensureProfile(tx, patientId);
      if (!profile.phoneE164) return 'none';
      return confirmByCode(tx, profile.phoneE164, code);
    });
    const messages: Record<Exclude<CodeResult, 'confirmed'>, string> = {
      wrong: 'That code does not match. Check the latest WhatsApp message from the clinic.',
      expired: 'That code has expired. Record agreement again to send a new one.',
      locked: 'Too many wrong codes. Record agreement again to send a new one.',
      none: 'No confirmation is waiting for this number.',
    };
    if (result !== 'confirmed') throw new BadRequestException(messages[result]);
    return this.prisma.patientPortalProfile.findUnique({ where: { patientId } });
  }

  /**
   * @cc [owner:nareshshah139,label:security] portal-switch-revokes
   * Disabling the portal for one patient MUST take effect at once: in the same transaction every
   * session and task link of that patient is revoked once those tables exist (Release 1b/1c).
   */
  async setPortalEnabled(patientId: string, branchId: string, enabled: boolean) {
    await this.loadPatient(patientId, branchId);
    return this.prisma.$transaction(async (tx) => {
      await ensureProfile(tx, patientId);
      return tx.patientPortalProfile.update({ where: { patientId }, data: { portalEnabled: enabled } });
    });
  }
}
