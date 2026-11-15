import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { displayClinicDate } from '../../common/date-display';
import { PrismaService } from '../../shared/database/prisma.service';
import { WhatsAppGraphClient, metaReasonFor } from './graph-client';
import { INVALID_NUMBER_REASON, normalizeWhatsAppNumber } from './phone-number';
import { renderSamplePrescriptionPdf } from './sample-prescription-pdf';
import { openToken, sealToken, whatsappTokenKey } from './token-cipher';
import {
  PRESCRIPTION_BODY_VALUES,
  type DocumentTemplate,
  type SendHealth,
  type WhatsAppSendResult,
} from './whatsapp.types';
import { WhatsAppService } from './whatsapp.service';

export type WhatsAppConnectionView =
  | { linked: false; fallback: 'SERVER_ENV' | null }
  | {
      linked: true;
      phoneNumberId: string;
      businessAccountId: string | null;
      displayPhoneNumber: string;
      verifiedName: string;
      qualityRating: string | null;
      prescriptionTemplate: DocumentTemplate | null;
      verifiedAt: Date;
      linkedBy: { id: string; name: string } | null;
      health: SendHealth | null;
    };

export type Actor = { id: string; branchId: string };

/**
 * @cc [owner:nareshshah139,label:security] whatsapp-token-never-returned
 * The clinic WhatsApp access token MUST be stored only as aes-256-gcm ciphertext, and no response
 * MUST contain the token or its ciphertext. Reads select named columns, never the whole row.
 */
const VIEW_SELECT = {
  phoneNumberId: true,
  businessAccountId: true,
  displayPhoneNumber: true,
  verifiedName: true,
  qualityRating: true,
  prescriptionTemplateName: true,
  prescriptionTemplateLanguage: true,
  prescriptionTemplateBodyParams: true,
  verifiedAt: true,
  linkedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

const MAX_BODY_PARAMS = PRESCRIPTION_BODY_VALUES.length;

@Injectable()
export class WhatsAppConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: WhatsAppGraphClient,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async view(
    branchId: string,
    options: { fresh?: boolean } = {},
  ): Promise<WhatsAppConnectionView> {
    const row = await this.prisma.whatsAppConnection.findUnique({
      where: { branchId },
      select: VIEW_SELECT,
    });
    if (!row)
      return {
        linked: false,
        fallback:
          process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
            ? 'SERVER_ENV'
            : null,
      };
    const health = await this.liveHealth(branchId, row, options);
    const businessAccountId =
      row.businessAccountId ?? health?.businessAccountId ?? null;
    if (businessAccountId && !row.businessAccountId)
      await this.prisma.whatsAppConnection.update({
        where: { branchId },
        data: { businessAccountId },
      });
    return {
      linked: true,
      phoneNumberId: row.phoneNumberId,
      businessAccountId,
      displayPhoneNumber: row.displayPhoneNumber,
      verifiedName: row.verifiedName,
      qualityRating: row.qualityRating,
      prescriptionTemplate:
        row.prescriptionTemplateName && row.prescriptionTemplateLanguage
          ? {
              name: row.prescriptionTemplateName,
              language: row.prescriptionTemplateLanguage,
              bodyParams: row.prescriptionTemplateBodyParams,
            }
          : null,
      verifiedAt: row.verifiedAt,
      linkedBy: row.linkedBy
        ? {
            id: row.linkedBy.id,
            name: `${row.linkedBy.firstName} ${row.linkedBy.lastName}`.trim(),
          }
        : null,
      health: health?.sendHealth ?? null,
    };
  }

  /** A Meta or key failure here is reported as unknown health; it must never break the page. */
  private async liveHealth(
    branchId: string,
    row: { phoneNumberId: string },
    options: { fresh?: boolean },
  ) {
    try {
      const { token } = await this.credentials(branchId);
      return await this.whatsapp.sendHealth(
        { token, phoneNumberId: row.phoneNumberId, source: 'CLINIC' },
        options,
      );
    } catch {
      return null;
    }
  }

  /** Stores the credentials only after Meta confirms the token can read that phone number. */
  async link(
    actor: Actor,
    input: {
      accessToken: string;
      phoneNumberId: string;
      businessAccountId?: string;
    },
  ) {
    const accessToken = input.accessToken.trim();
    const phoneNumberId = input.phoneNumberId.trim();
    const profile = await this.whatsapp.checkNumber(accessToken, phoneNumberId);
    if (!profile.ok)
      throw new BadRequestException(
        `WhatsApp did not accept these details. ${profile.reason}`,
      );
    const businessAccountId =
      input.businessAccountId?.trim() ||
      profile.value.health?.businessAccountId ||
      null;
    const previous = await this.prisma.whatsAppConnection.findUnique({
      where: { branchId: actor.branchId },
      select: { businessAccountId: true },
    });
    const keepTemplate =
      previous !== null && previous.businessAccountId === businessAccountId;
    const fields = {
      phoneNumberId,
      businessAccountId,
      displayPhoneNumber: profile.value.displayPhoneNumber,
      verifiedName: profile.value.verifiedName,
      qualityRating: profile.value.qualityRating,
      accessTokenCipher: sealToken(accessToken, whatsappTokenKey()),
      linkedById: actor.id,
      verifiedAt: new Date(),
      ...(keepTemplate
        ? {}
        : {
            prescriptionTemplateName: null,
            prescriptionTemplateLanguage: null,
            prescriptionTemplateBodyParams: 0,
          }),
    };
    await this.prisma.whatsAppConnection.upsert({
      where: { branchId: actor.branchId },
      create: { branchId: actor.branchId, ...fields },
      update: fields,
    });
    return this.view(actor.branchId);
  }

  async templates(branchId: string): Promise<DocumentTemplate[]> {
    const { token, businessAccountId } = await this.credentials(branchId);
    if (!businessAccountId)
      throw new BadRequestException(
        'Add the WhatsApp Business Account ID (link WhatsApp again) to choose a template.',
      );
    const listed = await this.graph.listDocumentTemplates(
      token,
      businessAccountId,
    );
    if (!listed.ok) throw new BadRequestException(listed.reason);
    return listed.value;
  }

  /** The body parameter count comes from Meta's copy of the template, never from the request. */
  async setPrescriptionTemplate(
    branchId: string,
    choice: { name: string; language: string } | null,
  ) {
    if (!choice) {
      await this.credentials(branchId);
      await this.prisma.whatsAppConnection.update({
        where: { branchId },
        data: {
          prescriptionTemplateName: null,
          prescriptionTemplateLanguage: null,
          prescriptionTemplateBodyParams: 0,
        },
      });
      return this.view(branchId);
    }
    const template = (await this.templates(branchId)).find(
      (t) => t.name === choice.name && t.language === choice.language,
    );
    if (!template)
      throw new BadRequestException(
        `No approved template "${choice.name}" (${choice.language}) with a document header was found in this WhatsApp Business Account.`,
      );
    if (template.bodyParams > MAX_BODY_PARAMS)
      throw new BadRequestException(
        `"${template.name}" needs ${template.bodyParams} body values. Prescriptions fill at most ${MAX_BODY_PARAMS}: patient name, doctor name and clinic name.`,
      );
    await this.prisma.whatsAppConnection.update({
      where: { branchId },
      data: {
        prescriptionTemplateName: template.name,
        prescriptionTemplateLanguage: template.language,
        prescriptionTemplateBodyParams: template.bodyParams,
      },
    });
    return this.view(branchId);
  }

  async sendTestPrescription(
    actor: Actor,
    to: string,
  ): Promise<WhatsAppSendResult> {
    if (!normalizeWhatsAppNumber(to))
      throw new BadRequestException(INVALID_NUMBER_REASON);
    const [branch, user] = await Promise.all([
      this.prisma.branch.findUnique({
        where: { id: actor.branchId },
        select: { name: true, address: true, phone: true },
      }),
      this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { firstName: true, lastName: true },
      }),
    ]);
    if (!branch) throw new NotFoundException('Branch not found');
    const doctorName = `Dr. ${user?.firstName ?? ''} ${user?.lastName ?? ''}`
      .replace(/\s+/g, ' ')
      .trim();
    const pdfBuffer = await renderSamplePrescriptionPdf(
      branch,
      doctorName,
      displayClinicDate(new Date()),
    );
    return this.whatsapp.sendPrescription({
      branchId: actor.branchId,
      to,
      pdfBuffer,
      fileName: 'sample-prescription.pdf',
      caption: `Sample prescription from ${branch.name}. Not for clinical use.`,
      patientName: 'Test Patient',
      doctorName,
      kind: 'TEST_PRESCRIPTION',
    });
  }

  async unlink(branchId: string): Promise<WhatsAppConnectionView> {
    await this.prisma.whatsAppConnection.deleteMany({ where: { branchId } });
    return this.view(branchId);
  }

  async recentMessages(branchId: string, limit: number) {
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Math.trunc(limit) || 20, 1), 100),
      select: {
        id: true,
        wamid: true,
        toPhone: true,
        kind: true,
        prescriptionId: true,
        status: true,
        errorCode: true,
        errorTitle: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      failureReason:
        row.status === 'FAILED'
          ? (metaReasonFor(row.errorCode) ?? row.errorTitle)
          : null,
    }));
  }

  private async credentials(branchId: string) {
    const row = await this.prisma.whatsAppConnection.findUnique({
      where: { branchId },
      select: { accessTokenCipher: true, businessAccountId: true },
    });
    if (!row) throw new BadRequestException('Link the clinic WhatsApp first.');
    return {
      token: openToken(row.accessTokenCipher, whatsappTokenKey()),
      businessAccountId: row.businessAccountId,
    };
  }
}
