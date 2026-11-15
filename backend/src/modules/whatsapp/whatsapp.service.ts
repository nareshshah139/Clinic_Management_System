import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { WhatsAppConnection } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { WhatsAppGraphClient, type GraphResult } from './graph-client';
import { REPLACEABLE_BY } from './message-status';
import { blockedReason } from './send-health';
import { INVALID_NUMBER_REASON, normalizeWhatsAppNumber } from './phone-number';
import { openToken, whatsappTokenKey } from './token-cipher';
import {
  PRESCRIPTION_BODY_VALUES,
  type MessageStatusUpdate,
  type PhoneNumberHealth,
  type PhoneNumberProfile,
  type TemplateMessage,
  type WhatsAppMessageKind,
  type WhatsAppSendResult,
  type WhatsAppSender,
} from './whatsapp.types';

type Route = { sender: WhatsAppSender; connection: WhatsAppConnection | null };

type SendTarget = {
  branchId: string;
  to: string;
  kind: WhatsAppMessageKind;
  doctorId?: string;
  prescriptionId?: string;
};

export type PrescriptionMessage = {
  branchId: string;
  to: string;
  pdfBuffer: Buffer;
  fileName: string;
  caption: string;
  patientName: string;
  doctorName: string;
  prescriptionId?: string;
  kind: Extract<WhatsAppMessageKind, 'PRESCRIPTION' | 'TEST_PRESCRIPTION'>;
};

const HEALTH_TTL_MS = 30_000;

export const NOT_LINKED_REASON =
  'Link the clinic WhatsApp in Clinic profile first.';

/**
 * @cc [owner:nareshshah139,label:product] whatsapp-honest-send
 * Every WhatsApp send MUST resolve to ACCEPTED with Meta's message id, NOT_CONFIGURED, or FAILED
 * with a reason; it MUST NOT report success for a message Meta did not accept. Callers that tell
 * a person a message went out MUST do so only on ACCEPTED, and only ACCEPTED sends are recorded.
 */
export function acceptedOrThrow(result: WhatsAppSendResult): { wamid: string } {
  if (result.status === 'ACCEPTED') return { wamid: result.wamid };
  throw new BadRequestException(
    result.status === 'NOT_CONFIGURED' ? NOT_LINKED_REASON : result.reason,
  );
}

function readDoctorOverride(
  metadata: string | null | undefined,
): { token: string; phoneNumberId: string } | null {
  try {
    const meta = metadata ? JSON.parse(metadata) : null;
    const token =
      typeof meta?.whatsappAccessToken === 'string'
        ? meta.whatsappAccessToken.trim()
        : '';
    const phoneNumberId =
      typeof meta?.whatsappPhoneNumberId === 'string'
        ? meta.whatsappPhoneNumberId.trim()
        : '';
    return token && phoneNumberId ? { token, phoneNumberId } : null;
  } catch {
    return null;
  }
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly healthByNumber = new Map<
    string,
    { at: number; health: PhoneNumberHealth }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: WhatsAppGraphClient,
  ) {}

  /**
   * @cc [owner:nareshshah139,label:security] whatsapp-sender-precedence
   * The sending number MUST be the doctor's own override when both its token and phone number id
   * are set, else the branch's linked clinic number, else WHATSAPP_TOKEN with WHATSAPP_PHONE_NUMBER_ID.
   * Code outside the whatsapp module MUST NOT read a WhatsApp token.
   */
  async resolveSender(
    branchId: string,
    doctorId?: string,
  ): Promise<WhatsAppSender | null> {
    return (await this.route(branchId, doctorId))?.sender ?? null;
  }

  /** Reads the number from Meta and remembers its send health for the next sends. */
  async checkNumber(
    token: string,
    phoneNumberId: string,
  ): Promise<GraphResult<PhoneNumberProfile>> {
    const profile = await this.graph.getPhoneNumber(token, phoneNumberId);
    if (profile.ok && profile.value.health)
      this.healthByNumber.set(phoneNumberId, {
        at: Date.now(),
        health: profile.value.health,
      });
    return profile;
  }

  /** Null when Meta could not be asked or sent no health; callers treat that as unknown, never as blocked. */
  async sendHealth(
    sender: WhatsAppSender,
    options: { fresh?: boolean } = {},
  ): Promise<PhoneNumberHealth | null> {
    const cached = this.healthByNumber.get(sender.phoneNumberId);
    if (!options.fresh && cached && Date.now() - cached.at < HEALTH_TTL_MS)
      return cached.health;
    const profile = await this.checkNumber(sender.token, sender.phoneNumberId);
    return profile.ok ? profile.value.health : null;
  }

  sendText(target: SendTarget & { text: string }): Promise<WhatsAppSendResult> {
    return this.send(target, ({ sender }, to) =>
      this.graph.sendText(sender, to, target.text),
    );
  }

  sendTemplate(
    target: SendTarget & { template: TemplateMessage },
  ): Promise<WhatsAppSendResult> {
    return this.send(target, ({ sender }, to) =>
      this.graph.sendTemplate(sender, to, target.template),
    );
  }

  /**
   * Sends the PDF as the header of the clinic's approved prescription template when one is chosen,
   * which reaches any patient. Without one it sends a plain document, which WhatsApp only delivers
   * to a patient who messaged the clinic in the last 24 hours.
   */
  sendPrescription(message: PrescriptionMessage): Promise<WhatsAppSendResult> {
    return this.send(message, async ({ sender, connection }, to) => {
      const upload = await this.graph.uploadPdf(
        sender,
        message.pdfBuffer,
        message.fileName,
      );
      if (!upload.ok) return upload;
      const template = sender.source === 'CLINIC' ? connection : null;
      if (
        !template?.prescriptionTemplateName ||
        !template.prescriptionTemplateLanguage
      )
        return this.graph.sendDocument(sender, to, {
          mediaId: upload.value,
          fileName: message.fileName,
          caption: message.caption,
        });
      const branch = await this.prisma.branch.findUnique({
        where: { id: message.branchId },
        select: { name: true },
      });
      const values = {
        patientName: message.patientName,
        doctorName: message.doctorName,
        clinicName: branch?.name ?? '',
      };
      return this.graph.sendTemplateWithDocument(sender, to, {
        name: template.prescriptionTemplateName,
        language: template.prescriptionTemplateLanguage,
        mediaId: upload.value,
        fileName: message.fileName,
        bodyParams: PRESCRIPTION_BODY_VALUES.slice(
          0,
          template.prescriptionTemplateBodyParams,
        ).map((key) => values[key]),
      });
    });
  }

  /** Applies delivery statuses by wamid; a status that would move a message backwards changes nothing. */
  async applyStatusUpdates(updates: MessageStatusUpdate[]): Promise<number> {
    let changed = 0;
    for (const update of updates) {
      const { count } = await this.prisma.whatsAppMessage.updateMany({
        where: {
          wamid: update.wamid,
          status: { in: REPLACEABLE_BY[update.status] },
        },
        data: {
          status: update.status,
          ...(update.status === 'FAILED'
            ? { errorCode: update.errorCode, errorTitle: update.errorTitle }
            : {}),
        },
      });
      changed += count;
    }
    return changed;
  }

  private async send(
    target: SendTarget,
    deliver: (route: Route, to: string) => Promise<GraphResult<string>>,
  ): Promise<WhatsAppSendResult> {
    const to = normalizeWhatsAppNumber(target.to);
    if (!to) return { status: 'FAILED', reason: INVALID_NUMBER_REASON };
    let result: WhatsAppSendResult;
    try {
      const route = await this.route(target.branchId, target.doctorId);
      if (!route) return { status: 'NOT_CONFIGURED' };
      const health = await this.sendHealth(route.sender);
      if (health?.sendHealth.canSend === 'BLOCKED') {
        const result: WhatsAppSendResult = {
          status: 'FAILED',
          reason: blockedReason(health.sendHealth),
        };
        this.logger.warn(`WhatsApp ${target.kind} not sent: ${result.reason}`);
        return result;
      }
      const sent = await deliver(route, to);
      result = sent.ok
        ? { status: 'ACCEPTED', wamid: sent.value, source: route.sender.source }
        : { status: 'FAILED', code: sent.code, reason: sent.reason };
    } catch (error) {
      result = {
        status: 'FAILED',
        reason: (error as Error)?.message || 'WhatsApp send failed.',
      };
    }
    if (result.status === 'ACCEPTED') {
      await this.prisma.whatsAppMessage
        .create({
          data: {
            branchId: target.branchId,
            wamid: result.wamid,
            toPhone: to,
            kind: target.kind,
            prescriptionId: target.prescriptionId ?? null,
          },
        })
        .catch((error: Error) =>
          this.logger.error(
            `WhatsApp ${target.kind} message was sent but not recorded: ${error.message}`,
          ),
        );
    } else {
      this.logger.warn(`WhatsApp ${target.kind} not sent: ${result.reason}`);
    }
    return result;
  }

  private async route(
    branchId: string,
    doctorId?: string,
  ): Promise<Route | null> {
    const [doctor, connection] = await Promise.all([
      doctorId
        ? this.prisma.user.findFirst({
            where: { id: doctorId, branchId },
            select: { metadata: true },
          })
        : null,
      this.prisma.whatsAppConnection.findUnique({ where: { branchId } }),
    ]);
    const override = readDoctorOverride(doctor?.metadata);
    if (override)
      return { sender: { ...override, source: 'DOCTOR' }, connection };
    if (connection)
      return {
        sender: {
          token: openToken(connection.accessTokenCipher, whatsappTokenKey()),
          phoneNumberId: connection.phoneNumberId,
          source: 'CLINIC',
        },
        connection,
      };
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    return token && phoneNumberId
      ? {
          sender: { token, phoneNumberId, source: 'SERVER_ENV' },
          connection: null,
        }
      : null;
  }
}
