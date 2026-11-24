import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboundMessage, OutboundMessagePurpose as P, Prisma, WhatsAppConsentState } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { WhatsAppNotConfiguredError, WhatsAppRejectedError, WhatsAppSender, WhatsAppUnavailableError } from './whatsapp-sender';
import { renderTemplate } from './templates';
import { CARE_PRIORITY, inSendWindow, isCare, kolkataDay, kolkataDayBounds, needsConsent, nextDayWindowStart, nextWindowStart } from './send-policy';
import { requestNumberConfirmation } from './number-confirmation';
import { openDeliveryFailure } from './attention';

type Tx = Prisma.TransactionClient;
type Decision =
  | { kind: 'send' }
  | { kind: 'suppress'; reason: string }
  | { kind: 'expire'; reason: string }
  | { kind: 'defer'; until: Date; reason: string };

export const LEASE_MS = 2 * 60 * 1000;
export const BATCH = 50;
export const RECEIPT_MATCH_MS = 60 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RETRY_MS = 5 * 60 * 1000;
const RECEIPT_STATE: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
const RECEIPT_RANK: Record<string, number> = { SENT: 1, DELIVERED: 2, READ: 3 };
export const LAPSE_MS = 365 * 24 * 3600 * 1000;
const DELIVERED_STATES = ['SENT', 'DELIVERED', 'READ'] as const;

/**
 * @cc [owner:nareshshah139,label:integrity] check-at-send
 * The send pass MUST re-read consent, the confirmed number, the portal switch, the archive flag and
 * the subject while holding the patient's profile row, then send, suppress, expire or defer; a
 * reason found only when the row was queued is never trusted.
 */
@Injectable()
export class SendPassService {
  private readonly logger = new Logger(SendPassService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly sender: WhatsAppSender) {}

  @Cron('*/5 * * * *')
  async scheduled() {
    if (this.running || process.env.DISABLE_MESSAGING_PASS === 'true') return;
    this.running = true;
    try {
      await this.runPass();
    } catch (e) {
      this.logger.error(`send pass failed: ${(e as Error).name}`);
    } finally {
      this.running = false;
    }
  }

  async runPass(now = new Date()) {
    const lapsed = await this.lapseStaleConsent(now);
    const receipts = await this.applyPendingReceipts(now);
    const leased = await this.lease(now);
    const counts: Record<string, number> = {};
    for (const row of leased) {
      const outcome = await this.sendOne(row.id, now);
      counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    return { lapsed, receipts, leased: leased.length, ...counts };
  }

  /**
   * @cc [owner:nareshshah139,label:integrity] receipts-in-any-order
   * A receipt MUST move its row only forward through SENT, DELIVERED and READ; a failed receipt
   * marks a sent row FAILED and opens a delivery-failure item for a current subject. A receipt
   * whose row is not committed yet is applied by a later pass.
   */
  async applyReceipt(tx: Tx, status: any, now: Date): Promise<boolean> {
    const id = status?.id ? String(status.id) : null;
    if (!id) return true;
    const row = await tx.outboundMessage.findUnique({ where: { providerMessageId: id } });
    if (!row) return false;
    const next = RECEIPT_STATE[String(status?.status)];
    if (!next) return true;
    if (next === 'FAILED') {
      if (row.state === 'FAILED' || !(RECEIPT_RANK[row.state] > 0)) return true;
      const code = status?.errors?.[0]?.code;
      const reason = `receipt-failed${code ? `:${code}` : ''}`;
      await tx.outboundMessage.update({ where: { id: row.id }, data: { state: 'FAILED', outcome: reason, settledAt: now } });
      if (await this.subjectIsCurrent(tx, row, now)) await openDeliveryFailure(tx, row, reason, now);
      return true;
    }
    if ((RECEIPT_RANK[row.state] ?? 0) > 0 && RECEIPT_RANK[next] > RECEIPT_RANK[row.state]) {
      await tx.outboundMessage.update({ where: { id: row.id }, data: { state: next, settledAt: now } });
    }
    return true;
  }

  async applyPendingReceipts(now: Date): Promise<number> {
    // Receipts for staff-started sends never find a row; stop retrying them once a row could no longer be committing.
    const horizon = new Date(now.getTime() - RECEIPT_MATCH_MS);
    await this.prisma.inboundWhatsAppEvent.updateMany({ where: { kind: 'status', appliedAt: null, receivedAt: { lt: horizon } }, data: { appliedAt: now } });
    const pending = await this.prisma.inboundWhatsAppEvent.findMany({ where: { kind: 'status', appliedAt: null }, orderBy: { receivedAt: 'desc' }, take: BATCH });
    let applied = 0;
    for (const event of pending) {
      const done = await this.prisma.$transaction(async (tx) => {
        if (!(await this.applyReceipt(tx, event.payload, now))) return false;
        await tx.inboundWhatsAppEvent.update({ where: { id: event.id }, data: { appliedAt: now } });
        return true;
      });
      if (done) applied++;
    }
    return applied;
  }

  /** Leases due rows (and rows whose lease ran out), care rows first by spec order. */
  async lease(now: Date): Promise<OutboundMessage[]> {
    const until = new Date(now.getTime() + LEASE_MS);
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "outbound_messages" SET "state" = 'SENDING', "leaseUntil" = ${until}, "updatedAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "outbound_messages"
        WHERE ("state" = 'QUEUED' AND "notBefore" <= ${now}) OR ("state" = 'SENDING' AND "leaseUntil" < ${now})
        ORDER BY "notBefore" ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
      RETURNING "id"`;
    if (!ids.length) return [];
    const rows = await this.prisma.outboundMessage.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
    const rank = (r: OutboundMessage) => (isCare(r.purpose) ? CARE_PRIORITY[r.purpose]! : -1);
    return rows.sort((a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async sendOne(id: string, now: Date): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<OutboundMessage[]>`SELECT * FROM "outbound_messages" WHERE "id" = ${id} FOR UPDATE`;
        if (!row || row.state !== 'SENDING') return 'skipped';
        // Patient before profiles, the order patient edits use. Holds off an archive until this send is decided and done.
        if (row.patientId) await tx.$queryRaw`SELECT "id" FROM "patients" WHERE "id" = ${row.patientId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "patient_portal_profiles" WHERE "phoneE164" = ${row.toE164} ORDER BY "id" FOR UPDATE`;
        const decision = await this.decide(tx, row, now);
        if (decision.kind === 'suppress' || decision.kind === 'expire') {
          await tx.outboundMessage.update({
            where: { id },
            data: { state: decision.kind === 'suppress' ? 'SUPPRESSED' : 'EXPIRED', outcome: decision.reason, settledAt: now, leaseUntil: null },
          });
          return decision.kind;
        }
        if (decision.kind === 'defer') {
          await tx.outboundMessage.update({ where: { id }, data: { state: 'QUEUED', notBefore: decision.until, outcome: decision.reason, leaseUntil: null } });
          return 'deferred';
        }
        return this.callProvider(tx, row, now);
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  private async callProvider(tx: Tx, row: OutboundMessage, now: Date): Promise<string> {
    try {
      const { providerMessageId } = await this.sender.send(row.toE164, renderTemplate(row.templateKey, (row.params ?? {}) as Record<string, unknown>));
      await tx.outboundMessage.update({
        where: { id: row.id },
        data: { state: 'SENT', providerMessageId, sentAt: now, attempts: { increment: 1 }, leaseUntil: null, outcome: null },
      });
      return 'sent';
    } catch (e) {
      if (e instanceof WhatsAppNotConfiguredError) {
        await tx.outboundMessage.update({ where: { id: row.id }, data: { state: 'QUEUED', notBefore: new Date(now.getTime() + 60 * 60 * 1000), outcome: 'not-configured', leaseUntil: null } });
        return 'not-configured';
      }
      const attempts = row.attempts + 1;
      if (e instanceof WhatsAppUnavailableError && attempts < MAX_ATTEMPTS) {
        await tx.outboundMessage.update({ where: { id: row.id }, data: { state: 'QUEUED', attempts, notBefore: new Date(now.getTime() + RETRY_MS * attempts), outcome: `unavailable:${e.status ?? 'network'}`, leaseUntil: null } });
        return 'retry';
      }
      const reason = e instanceof WhatsAppRejectedError ? `rejected:${e.status}:${e.code}` : e instanceof WhatsAppUnavailableError ? 'unavailable:gave-up' : 'error';
      await tx.outboundMessage.update({ where: { id: row.id }, data: { state: 'FAILED', attempts, outcome: reason, settledAt: now, leaseUntil: null } });
      if (await this.subjectIsCurrent(tx, row, now)) await openDeliveryFailure(tx, row, reason, now);
      return 'failed';
    }
  }

  async decide(tx: Tx, row: OutboundMessage, now: Date): Promise<Decision> {
    if (row.purpose === P.ACKNOWLEDGEMENT) {
      const optedOut = await tx.patientPortalProfile.count({ where: { phoneE164: row.toE164, consentState: WhatsAppConsentState.OPTED_OUT } });
      if (optedOut) return { kind: 'suppress', reason: 'consent-opted_out' };
    }
    if (row.purpose === P.NUMBER_CONFIRMATION) {
      const waiting = await tx.patientPortalProfile.count({
        where: { phoneE164: row.toE164, consentState: WhatsAppConsentState.PENDING, portalEnabled: true, patient: { isArchived: false } },
      });
      return waiting ? { kind: 'send' } : { kind: 'suppress', reason: 'nothing-pending' };
    }
    if (needsConsent(row.purpose)) {
      if (!row.patientId) return { kind: 'suppress', reason: 'no-patient' };
      const profile = await tx.patientPortalProfile.findUnique({ where: { patientId: row.patientId }, include: { patient: { select: { isArchived: true } } } });
      if (!profile || profile.patient.isArchived) return { kind: 'suppress', reason: 'archived' };
      if (!profile.portalEnabled) return { kind: 'suppress', reason: 'portal-disabled' };
      if (profile.consentState !== 'OPTED_IN') return { kind: 'suppress', reason: `consent-${profile.consentState.toLowerCase()}` };
      if (!profile.phoneConfirmedAt || profile.phoneE164 !== row.toE164) return { kind: 'suppress', reason: 'number-not-confirmed' };
    }
    if (!(await this.subjectIsCurrent(tx, row, now))) return { kind: 'expire', reason: 'subject-not-current' };
    if (isCare(row.purpose)) {
      if (!inSendWindow(now)) return { kind: 'defer', until: nextWindowStart(now), reason: 'outside-window' };
      const { start, end } = kolkataDayBounds(now);
      const sentToday = await tx.outboundMessage.count({
        where: { patientId: row.patientId, purpose: { in: Object.keys(CARE_PRIORITY) as P[] }, state: { in: [...DELIVERED_STATES] }, sentAt: { gte: start, lt: end }, id: { not: row.id } },
      });
      if (sentToday) return { kind: 'defer', until: nextDayWindowStart(now), reason: `daily-cap:${kolkataDay(now)}` };
    }
    return { kind: 'send' };
  }

  async subjectIsCurrent(tx: Tx, row: Pick<OutboundMessage, 'subjectType' | 'subjectId' | 'params'>, now: Date): Promise<boolean> {
    if (!row.subjectType) return true;
    if (row.subjectType === 'APPOINTMENT' && row.subjectId) {
      const appt = await tx.appointment.findUnique({ where: { id: row.subjectId }, select: { status: true, date: true, slot: true } });
      if (!appt || !['SCHEDULED', 'CONFIRMED'].includes(appt.status)) return false;
      const day = appt.date.toISOString().slice(0, 10);
      const booked = (row.params as { booked?: { date?: string; slot?: string } } | null)?.booked;
      if (booked && (booked.date !== day || booked.slot !== appt.slot)) return false;
      const start = /^(\d{2}):(\d{2})/.exec(appt.slot ?? '');
      if (start) return new Date(`${day}T${start[1]}:${start[2]}:00+05:30`) > now;
      return day >= kolkataDay(now);
    }
    return false;
  }

  /**
   * @cc [owner:nareshshah139,label:product] consent-lapses-after-a-year
   * An OPTED_IN number with no message either way and no completed sign-in for 12 months MUST move
   * to PENDING and be asked to confirm again.
   */
  async lapseStaleConsent(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - LAPSE_MS);
    const stale = await this.prisma.$queryRaw<{ phoneE164: string; language: string; patientId: string }[]>`
      SELECT DISTINCT ON (p."phoneE164") p."phoneE164", p."preferredLanguage"::text AS language, p."patientId"
      FROM "patient_portal_profiles" p
      WHERE p."consentState" = 'OPTED_IN' AND p."phoneE164" IS NOT NULL
        AND coalesce(p."lastSeenAt", p."phoneConfirmedAt", p."consentRecordedAt", p."createdAt") < ${cutoff}
        AND NOT EXISTS (SELECT 1 FROM "outbound_messages" o WHERE o."toE164" = p."phoneE164" AND o."sentAt" >= ${cutoff})
      ORDER BY p."phoneE164", p."patientId"`;
    for (const s of stale) {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.patientPortalProfile.updateMany({
          where: { phoneE164: s.phoneE164, consentState: 'OPTED_IN' },
          data: { consentState: 'PENDING', phoneConfirmedAt: null, consentMethod: 'lapsed', consentRecordedAt: now, consentRecordedById: null },
        });
        if (count) await requestNumberConfirmation(tx, s.phoneE164, s.language, s.patientId);
      });
    }
    return stale.length;
  }
}
