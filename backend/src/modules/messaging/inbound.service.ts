import { Injectable } from '@nestjs/common';
import { MessageAssignment, OutboundMessagePurpose as P, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { toE164 } from '../patients/portal/phone-e164';
import { clinicName, confirmByTap } from './number-confirmation';
import { enqueueOutbound } from './outbox';
import { openPatientMessageItem } from './attention';
import { isStopWord } from './stop-words';
import { SendPassService } from './send-pass.service';
import { revokeTaskLinks } from '../follow-ups/task-link';

type Tx = Prisma.TransactionClient;
const DAY_MS = 24 * 3600 * 1000;

export const staffHours = () => process.env.CLINIC_MESSAGE_HOURS || '9 am to 8 pm, Monday to Saturday';
export const emergencyPhone = () => process.env.CLINIC_EMERGENCY_PHONE || '108';

/** Meta sends wa_id as digits that already carry the country code. */
export const senderE164 = (from: unknown) => toE164(`+${String(from ?? '').replace(/\D/g, '')}`) ?? `+${String(from ?? '').replace(/\D/g, '')}`;

@Injectable()
export class InboundWhatsAppService {
  constructor(private readonly prisma: PrismaService, private readonly pass: SendPassService) {}

  async handle(body: any, now = new Date()) {
    const result = { stored: 0, duplicates: 0 };
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        for (const message of value.messages ?? []) (await this.applyMessage(message, now)) ? result.stored++ : result.duplicates++;
        for (const status of value.statuses ?? []) (await this.applyStatus(status, now)) ? result.stored++ : result.duplicates++;
      }
    }
    return result;
  }

  private async claim(tx: Tx, providerEventId: string, kind: string, payload: unknown) {
    const { count } = await tx.inboundWhatsAppEvent.createMany({
      data: [{ providerEventId, kind, payload: payload as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  private markApplied(tx: Tx, providerEventId: string, at: Date) {
    return tx.inboundWhatsAppEvent.update({ where: { providerEventId }, data: { appliedAt: at } });
  }

  /** PP-16: a receipt for a row that is not committed yet stays unapplied for the next send pass. */
  async applyStatus(status: any, now: Date) {
    const eventId = `status:${status?.id}:${status?.status}`;
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.claim(tx, eventId, 'status', status))) return false;
      if (await this.pass.applyReceipt(tx, status, now)) await this.markApplied(tx, eventId, now);
      return true;
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] every-patient-message-lands
   * Each inbound text or image MUST be stored once as a PatientMessage under an open PATIENT_MESSAGE
   * item for its patient, or for its number when the sender is unknown or ambiguous. It is assigned
   * only to the one portal-enabled patient on the number (EXACT) or, failing that, to the patient of
   * the one outbound message it quotes (SUGGESTED).
   */
  async applyMessage(message: any, now: Date) {
    const eventId = `message:${message?.id}`;
    const from = senderE164(message?.from);
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.claim(tx, eventId, 'message', message))) return false;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inbound:${from}`}))`;
      const tapped = message?.button?.payload ?? message?.interactive?.button_reply?.id;
      if (tapped && (await confirmByTap(tx, from, String(tapped), now))) {
        await this.markApplied(tx, eventId, now);
        return true;
      }
      const kind = String(message?.type ?? 'unknown');
      const body: string | null = message?.text?.body ?? message?.image?.caption ?? message?.button?.text ?? message?.interactive?.button_reply?.title ?? null;
      const stop = kind === 'text' && isStopWord(body);
      if (stop) await this.optOut(tx, from, eventId, now);

      const profiles = await tx.patientPortalProfile.findMany({
        where: { phoneE164: from },
        include: { patient: { select: { id: true, isArchived: true, branchId: true } } },
      });
      await tx.patientPortalProfile.updateMany({ where: { phoneE164: from }, data: { lastSeenAt: now } });
      const live = profiles.filter((p) => p.portalEnabled && !p.patient.isArchived);
      const quoted = message?.context?.id
        ? await tx.outboundMessage.findUnique({ where: { providerMessageId: String(message.context.id) } })
        : null;
      let patientId: string | null = null;
      let assignment: MessageAssignment = MessageAssignment.UNASSIGNED;
      if (live.length === 1) {
        patientId = live[0].patientId;
        assignment = MessageAssignment.EXACT;
      } else if (quoted?.patientId && quoted.toE164 === from) {
        patientId = quoted.patientId;
        assignment = MessageAssignment.SUGGESTED;
      }
      await tx.patientMessage.create({
        data: {
          patientId,
          phoneE164: from,
          direction: 'INBOUND',
          kind,
          body,
          mediaId: message?.image?.id ?? null,
          mediaMime: message?.image?.mime_type ?? null,
          providerMessageId: message?.id ? String(message.id) : null,
          replyToOutboundId: quoted?.id ?? null,
          assignment,
          authorKind: 'patient',
          createdAt: message?.timestamp ? new Date(Number(message.timestamp) * 1000) : now,
        },
      });
      const branchId = profiles.find((p) => p.patientId === patientId)?.patient.branchId ?? null;
      await openPatientMessageItem(tx, { patientId, phoneE164: from, branchId }, now);

      const optedOut = stop || profiles.some((p) => p.consentState === 'OPTED_OUT');
      if (!optedOut) await this.acknowledge(tx, from, eventId, profiles.find((p) => p.patientId === patientId) ?? (profiles.length === 1 ? profiles[0] : null), now);
      await this.markApplied(tx, eventId, now);
      return true;
    });
  }

  /**
   * @cc [owner:nareshshah139,label:security] whatsapp-stop-opts-out-number
   * A stop word MUST move every patient on the sending number to OPTED_OUT and clear the
   * confirmation, and MUST queue one opt-out confirmation only when it changed someone.
   */
  private async optOut(tx: Tx, from: string, eventId: string, now: Date) {
    const onNumber = await tx.patientPortalProfile.findMany({ where: { phoneE164: from }, select: { patientId: true } });
    await revokeTaskLinks(tx, onNumber.map((p) => p.patientId), now);
    const { count } = await tx.patientPortalProfile.updateMany({
      where: { phoneE164: from, consentState: { not: 'OPTED_OUT' } },
      data: { consentState: 'OPTED_OUT', phoneConfirmedAt: null, consentMethod: 'whatsapp-stop', consentRecordedAt: now, consentRecordedById: null },
    });
    if (!count) return;
    const first = await tx.patientPortalProfile.findFirst({ where: { phoneE164: from }, orderBy: { createdAt: 'asc' } });
    await enqueueOutbound(tx, {
      dedupeKey: `opt-out:${eventId}`,
      purpose: P.OPT_OUT_CONFIRMATION,
      patientId: first?.patientId ?? null,
      toE164: from,
      templateKey: 'opt_out_confirmation',
      params: { clinic: clinicName(), language: first?.preferredLanguage ?? 'EN' },
    });
  }

  /**
   * @cc [owner:nareshshah139,label:product] one-acknowledgement-a-day
   * A number MUST get at most one acknowledgement in any 24 hours, in its patient's language,
   * giving the staff reading hours and the emergency number and no reply time.
   */
  private async acknowledge(tx: Tx, from: string, eventId: string, profile: { patientId: string; preferredLanguage: string } | null, now: Date) {
    const recent = await tx.outboundMessage.count({
      where: { toE164: from, purpose: P.ACKNOWLEDGEMENT, createdAt: { gt: new Date(now.getTime() - DAY_MS) }, state: { notIn: ['SUPPRESSED', 'EXPIRED'] } },
    });
    if (recent) return;
    await enqueueOutbound(tx, {
      dedupeKey: `ack:${eventId}`,
      purpose: P.ACKNOWLEDGEMENT,
      patientId: profile?.patientId ?? null,
      toE164: from,
      templateKey: 'patient_message_ack',
      params: { clinic: clinicName(), hours: staffHours(), emergency: emergencyPhone(), language: profile?.preferredLanguage ?? 'EN' },
      notBefore: now,
      createdAt: now,
    });
  }
}
