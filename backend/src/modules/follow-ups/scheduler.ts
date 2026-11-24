import { randomUUID } from 'crypto';
import { OutboundMessagePurpose as P, Prisma, PrismaClient } from '@prisma/client';
import { enqueueOutbound } from '../messaging/outbox';
import { kolkataDay } from '../messaging/send-policy';
import { clinicName } from '../messaging/number-confirmation';
import { CHECK_IN_MOVES } from './lifecycle';
import { addDays, closeAfterOpening, kolkataAt } from './schedule';
import { deriveTaskToken, hashTaskToken } from './task-link';
import { completeTrackIfDone } from './tracks';

type Db = PrismaClient | Prisma.TransactionClient;
const BATCH = 500;
const DELIVERED = ['SENT', 'DELIVERED', 'READ'] as const;
export const TASK_LINK_SUBJECT = 'TASK_LINK';

/** Moves due SCHEDULED check-ins to OPEN; the conditional update makes a second pass a no-op. */
export async function openDueCheckIns(db: PrismaClient, now: Date): Promise<number> {
  const due = await db.checkIn.findMany({
    where: { state: { in: [...CHECK_IN_MOVES.open.from] }, opensAt: { lte: now } },
    select: { id: true, opensAt: true, closesAt: true },
    orderBy: { opensAt: 'asc' },
    take: BATCH,
  });
  let opened = 0;
  for (const c of due) {
    const { count } = await db.checkIn.updateMany({
      where: { id: c.id, state: { in: [...CHECK_IN_MOVES.open.from] } },
      data: { state: CHECK_IN_MOVES.open.to, openedAt: now, closesAt: closeAfterOpening(c.opensAt, c.closesAt, now) },
    });
    opened += count;
  }
  return opened;
}

async function contact(db: Db, patientId: string) {
  return db.patientPortalProfile.findUnique({ where: { patientId }, select: { phoneE164: true, preferredLanguage: true } });
}

/**
 * @cc [owner:nareshshah139,label:product] one-link-per-patient-day
 * Patient check-ins that open for one patient on one Asia/Kolkata day MUST share one
 * PortalTaskLink and one CHECK_IN_OPENED message; both are keyed by patient and day, so a
 * second pass or a second instance adds nothing (PP-15, PP-31).
 */
export async function linkOpenedCheckIns(db: PrismaClient, now: Date): Promise<number> {
  const unlinked = await db.checkIn.findMany({
    where: { state: 'OPEN', respondent: 'PATIENT', taskLink: null },
    select: { id: true, openedAt: true, track: { select: { patientId: true } } },
    take: BATCH,
  });
  const groups = new Map<string, { patientId: string; day: string; ids: string[] }>();
  for (const c of unlinked) {
    const day = kolkataDay(c.openedAt ?? now);
    const key = `${c.track.patientId}:${day}`;
    const g = groups.get(key) ?? { patientId: c.track.patientId, day, ids: [] };
    g.ids.push(c.id);
    groups.set(key, g);
  }
  let queued = 0;
  for (const [key, g] of groups) {
    await db.$transaction(async (tx) => {
      const id = `tl_${randomUUID().replaceAll('-', '')}`;
      await tx.portalTaskLink.createMany({
        data: [{ id, dedupeKey: `check-in:${key}`, patientId: g.patientId, tokenHash: hashTaskToken(deriveTaskToken(id)) }],
        skipDuplicates: true,
      });
      const link = await tx.portalTaskLink.findUniqueOrThrow({ where: { dedupeKey: `check-in:${key}` } });
      await tx.portalTaskLinkCheckIn.createMany({ data: g.ids.map((checkInId) => ({ linkId: link.id, checkInId })), skipDuplicates: true });
      const to = await contact(tx, g.patientId);
      if (!to?.phoneE164) return;
      const created = await enqueueOutbound(tx, {
        dedupeKey: `check-in-opened:${key}`,
        purpose: P.CHECK_IN_OPENED,
        patientId: g.patientId,
        toE164: to.phoneE164,
        templateKey: 'check_in_opened',
        params: { clinic: clinicName(), language: to.preferredLanguage, linkId: link.id },
        subjectType: TASK_LINK_SUBJECT,
        subjectId: link.id,
        notBefore: now,
      });
      if (created) queued += 1;
    });
  }
  return queued;
}

/** Queues each due reminder for a link that still has an OPEN check-in, once per reminder day. */
export async function queueCheckInReminders(db: PrismaClient, now: Date): Promise<number> {
  const open = await db.checkIn.findMany({
    where: { state: 'OPEN', taskLink: { isNot: null }, NOT: { reminderAfterDays: { isEmpty: true } } },
    select: { openedAt: true, reminderAfterDays: true, taskLink: { select: { link: { select: { id: true, patientId: true, revokedAt: true } } } } },
    take: BATCH,
  });
  let queued = 0;
  for (const c of open) {
    const link = c.taskLink!.link;
    if (link.revokedAt || !c.openedAt) continue;
    for (const d of c.reminderAfterDays) {
      const dueAt = kolkataAt(addDays(kolkataDay(c.openedAt), d), 9);
      if (dueAt > now) continue;
      const to = await contact(db, link.patientId);
      if (!to?.phoneE164) continue;
      const created = await enqueueOutbound(db, {
        dedupeKey: `check-in-reminder:${link.id}:${kolkataDay(dueAt)}`,
        purpose: P.CHECK_IN_REMINDER,
        patientId: link.patientId,
        toE164: to.phoneE164,
        templateKey: 'check_in_reminder',
        params: { clinic: clinicName(), language: to.preferredLanguage, linkId: link.id },
        subjectType: TASK_LINK_SUBJECT,
        subjectId: link.id,
        notBefore: dueAt,
      });
      if (created) queued += 1;
    }
  }
  return queued;
}

/**
 * @cc [owner:nareshshah139,label:product] review-reminder
 * The day before a SCHEDULED or CONFIRMED review appointment the pass MUST queue one reminder
 * naming its date, time and doctor; a rebooked appointment gets a reminder for the new slot (PP-34).
 */
export async function queueReviewReminders(db: PrismaClient, now: Date): Promise<number> {
  const tomorrow = addDays(kolkataDay(now), 1);
  const from = new Date(`${tomorrow}T00:00:00.000Z`);
  const appts = await db.appointment.findMany({
    where: {
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      reviewRequestedFor: { not: null },
      date: { gte: from, lt: new Date(from.getTime() + 24 * 3600 * 1000) },
    },
    select: { id: true, patientId: true, date: true, slot: true, doctor: { select: { firstName: true, lastName: true } } },
    take: BATCH,
  });
  let queued = 0;
  for (const a of appts) {
    const to = await contact(db, a.patientId);
    if (!to?.phoneE164) continue;
    const day = a.date.toISOString().slice(0, 10);
    const created = await enqueueOutbound(db, {
      dedupeKey: `review-reminder:${a.id}:${day}:${a.slot}`,
      purpose: P.REVIEW_REMINDER,
      patientId: a.patientId,
      toE164: to.phoneE164,
      templateKey: 'review_reminder',
      params: {
        clinic: clinicName(),
        language: to.preferredLanguage,
        date: day,
        time: (a.slot ?? '').slice(0, 5),
        doctor: `Dr. ${a.doctor.firstName} ${a.doctor.lastName}`.trim(),
        booked: { date: day, slot: a.slot },
      },
      subjectType: 'APPOINTMENT',
      subjectId: a.id,
      notBefore: now,
    });
    if (created) queued += 1;
  }
  return queued;
}

/**
 * @cc [owner:nareshshah139,label:product] missed-check-in-reaches-staff
 * An OPEN check-in past its close time MUST become MISSED whether or not any message was sent
 * (PP-32); when its step says onMissed 'attention' one MISSED_CHECK_IN item opens that says
 * whether any message about it was delivered (PP-33).
 */
export async function closeEndedCheckIns(db: PrismaClient, now: Date): Promise<number> {
  const ended = await db.checkIn.findMany({
    where: { state: { in: [...CHECK_IN_MOVES.miss.from] }, closesAt: { lte: now } },
    select: { id: true, trackId: true, onMissed: true, track: { select: { patientId: true, patient: { select: { branchId: true } } } }, taskLink: { select: { linkId: true } } },
    take: BATCH,
  });
  let missed = 0;
  for (const c of ended) {
    await db.$transaction(async (tx) => {
      const { count } = await tx.checkIn.updateMany({
        where: { id: c.id, state: { in: [...CHECK_IN_MOVES.miss.from] } },
        data: { state: CHECK_IN_MOVES.miss.to, endedAt: now },
      });
      if (!count) return;
      missed += 1;
      if (c.onMissed === 'attention') {
        const delivered = c.taskLink
          ? await tx.outboundMessage.count({ where: { subjectType: TASK_LINK_SUBJECT, subjectId: c.taskLink.linkId, state: { in: [...DELIVERED] } } })
          : 0;
        const reason = delivered ? 'missed:message-delivered' : 'missed:no-message-delivered';
        await tx.$executeRaw`
          INSERT INTO "attention_items" ("id", "kind", "state", "priority", "subjectKey", "patientId", "branchId", "reason", "lastEventAt", "createdAt", "updatedAt")
          VALUES (${`att_${randomUUID()}`}, 'MISSED_CHECK_IN', 'OPEN', 'NORMAL', ${`check-in:${c.id}`}, ${c.track.patientId}, ${c.track.patient.branchId}, ${reason}, ${now}, ${now}, ${now})
          ON CONFLICT ("kind", "subjectKey") WHERE "state" <> 'RESOLVED' DO NOTHING`;
      }
      await completeTrackIfDone(tx, c.trackId, now);
    });
  }
  return missed;
}

/** A check-in message is current while its link is live and any of its check-ins is OPEN (PP-13). */
export async function taskLinkIsCurrent(db: Db, linkId: string): Promise<boolean> {
  const open = await db.portalTaskLinkCheckIn.count({ where: { linkId, link: { revokedAt: null }, checkIn: { state: 'OPEN' } } });
  return open > 0;
}
