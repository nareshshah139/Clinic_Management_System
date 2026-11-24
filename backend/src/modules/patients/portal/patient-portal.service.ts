import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WhatsAppConsentState } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ensureProfile, nextConsent } from './portal-profile';

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
      return tx.patientPortalProfile.update({
        where: { patientId },
        data: {
          consentState: to,
          consentRecordedById: byUserId,
          consentRecordedAt: new Date(),
          consentMethod: action === 'agreed' ? 'reception-agreed' : 'reception-refused',
          ...(to === WhatsAppConsentState.OPTED_OUT ? { phoneConfirmedAt: null } : {}),
        },
      });
    });
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
