import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttentionItem, AttentionPriority, MessageAssignment, OutboundMessagePurpose, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { roleMeetsRoles } from '../../shared/guards/roles.guard';
import { openPatientMessageItem } from '../messaging/attention';
import { enqueueOutbound } from '../messaging/outbox';
import { SendPassService } from '../messaging/send-pass.service';
import { staffReplyStatus } from '../messaging/staff-reply';
import { InstrumentContent, PlanContent } from './content';
import { ResolutionCode } from './dto/worklist.dto';
import { TASK_LINK_SUBJECT } from './scheduler';

type Tx = Prisma.TransactionClient;
export type Staff = { id: string; role: UserRole; branchId: string };

const PRIORITY_RANK: Record<AttentionPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2 };
const LIVE_STATES = ['OPEN', 'CLAIMED'] as const;
const VISIBLE_ASSIGNMENTS: MessageAssignment[] = ['EXACT', 'CONFIRMED'];
const REPLY_SUBJECT = 'PATIENT_MESSAGE';

/**
 * @cc [owner:nareshshah139,label:security] worklist-branch-scope
 * A staff member MUST see only worklist items, threads and attachments of patients in their
 * branch, plus those whose sender is not a known patient, because the clinic has one number.
 */
const visibleItem = (branchId: string): Prisma.AttentionItemWhereInput => ({ OR: [{ branchId }, { patientId: null }] });
const visibleMessage = (branchId: string): Prisma.PatientMessageWhereInput => ({ OR: [{ patient: { branchId } }, { patientId: null }] });

/**
 * @cc [owner:nareshshah139,label:product] urgent-resolvers
 * Only doctors, nurses and admins (and owners, who pass every role list) MAY resolve an URGENT
 * item; reception MAY claim it and call (open decision 9).
 */
export const canResolve = (role: UserRole, priority: AttentionPriority) => priority !== 'URGENT' || roleMeetsRoles(role, [UserRole.NURSE]);

const splitSubject = (key: string) => {
  const at = key.indexOf(':');
  return at < 0 ? { type: key, id: '' } : { type: key.slice(0, at), id: key.slice(at + 1) };
};

const ageMinutes = (from: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60000));

@Injectable()
export class WorklistService {
  constructor(private readonly prisma: PrismaService, private readonly pass: SendPassService) {}

  private async userNames(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!unique.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  }

  private async findItem(id: string, branchId: string) {
    const item = await this.prisma.attentionItem.findFirst({
      where: { id, ...visibleItem(branchId) },
      include: { patient: { select: { id: true, name: true, patientCode: true } } },
    });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  /** "Needs attention": open and claimed items by priority, then oldest first (PP-48). */
  async listItems(branchId: string, now = new Date()) {
    const items = await this.prisma.attentionItem.findMany({
      where: { state: { in: [...LIVE_STATES] }, ...visibleItem(branchId) },
      include: { patient: { select: { id: true, name: true, patientCode: true } } },
      take: 500,
    });
    items.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.getTime() - b.createdAt.getTime());
    const names = await this.userNames(items.map((i) => i.claimedById));
    return items.map((i) => this.summary(i, names, now));
  }

  private summary(i: AttentionItem & { patient: { id: string; name: string; patientCode: string | null } | null }, names: Map<string, string>, now: Date) {
    return {
      id: i.id,
      kind: i.kind,
      state: i.state,
      priority: i.priority,
      reason: i.reason,
      patient: i.patient,
      phoneE164: i.phoneE164,
      claimedBy: i.claimedById ? { id: i.claimedById, name: names.get(i.claimedById) ?? 'Staff' } : null,
      createdAt: i.createdAt,
      lastEventAt: i.lastEventAt,
      ageMinutes: ageMinutes(i.createdAt, now),
    };
  }

  /** One item with its answers, photos, score, earlier responses and the thread (PP-49). */
  async getItem(id: string, staff: Staff, now = new Date()) {
    const item = await this.findItem(id, staff.branchId);
    const subject = splitSubject(item.subjectKey);
    let checkInId: string | null = subject.type === 'check-in' ? subject.id : null;
    let response = null as Awaited<ReturnType<WorklistService['loadResponse']>>;
    if (subject.type === 'response') {
      response = await this.loadResponse(subject.id);
      checkInId = response?.checkInId ?? null;
    }
    const checkIn = checkInId ? await this.loadCheckIn(checkInId) : null;
    if (!response && checkIn?.response) response = await this.loadResponse(checkIn.response.id);
    const earlier = response && item.patientId ? await this.earlierResponses(item.patientId, response) : [];
    const thread = await this.thread(item.patientId ? { patientId: item.patientId } : { patientId: null, phoneE164: item.phoneE164 ?? '' });
    const names = await this.userNames([item.claimedById, item.resolvedById]);
    const reply = await staffReplyStatus(this.prisma, item.patientId, now);
    return {
      ...this.summary(item, names, now),
      resolutionCode: item.resolutionCode,
      resolutionNote: item.resolutionNote,
      resolvedBy: item.resolvedById ? { id: item.resolvedById, name: names.get(item.resolvedById) ?? 'Staff' } : null,
      resolvedAt: item.resolvedAt,
      canResolve: canResolve(staff.role, item.priority),
      checkIn,
      response: response && this.presentResponse(response),
      earlierResponses: earlier.map((r) => this.presentResponse(r)),
      thread,
      reply: reply.canReply ? { canReply: true, windowClosesAt: reply.windowClosesAt } : { canReply: false, reason: reply.reason, message: reply.message },
    };
  }

  private loadResponse(id: string) {
    return this.prisma.checkInResponse.findUnique({
      where: { id },
      include: {
        attachments: { select: { id: true, itemKey: true, mime: true } },
        instrumentVersion: { select: { id: true, version: true, instrumentId: true, content: true } },
      },
    });
  }

  private async loadCheckIn(id: string) {
    const checkIn = await this.prisma.checkIn.findUnique({
      where: { id },
      select: {
        id: true, stepKey: true, state: true, opensAt: true, closesAt: true,
        response: { select: { id: true } },
        taskLink: { select: { linkId: true } },
        track: { select: { planVersion: { select: { content: true, plan: { select: { key: true } } } } } },
      },
    });
    if (!checkIn) return null;
    const delivery = checkIn.taskLink ? await this.latestDelivery(checkIn.taskLink.linkId) : null;
    return {
      id: checkIn.id,
      stepKey: checkIn.stepKey,
      state: checkIn.state,
      opensAt: checkIn.opensAt,
      closesAt: checkIn.closesAt,
      plan: (checkIn.track.planVersion.content as unknown as PlanContent).name?.EN ?? checkIn.track.planVersion.plan.key,
      response: checkIn.response,
      delivery,
    };
  }

  private latestDelivery(linkId: string) {
    return this.prisma.outboundMessage.findFirst({
      where: { subjectType: TASK_LINK_SUBJECT, subjectId: linkId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, purpose: true, state: true, outcome: true, sentAt: true, createdAt: true },
    });
  }

  private earlierResponses(patientId: string, response: NonNullable<Awaited<ReturnType<WorklistService['loadResponse']>>>) {
    return this.prisma.checkInResponse.findMany({
      where: {
        id: { not: response.id },
        submittedAt: { lt: response.submittedAt },
        instrumentVersion: { instrumentId: response.instrumentVersion.instrumentId },
        checkIn: { track: { patientId } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 10,
      include: {
        attachments: { select: { id: true, itemKey: true, mime: true } },
        instrumentVersion: { select: { id: true, version: true, instrumentId: true, content: true } },
      },
    });
  }

  private presentResponse(r: NonNullable<Awaited<ReturnType<WorklistService['loadResponse']>>>) {
    const content = r.instrumentVersion.content as unknown as InstrumentContent;
    const answers = (r.answers ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      submittedAt: r.submittedAt,
      score: r.score,
      flag: r.flag,
      instrument: content.title?.EN ?? '',
      instrumentVersion: r.instrumentVersion.version,
      answers: content.items
        .filter((item) => item.type !== 'photo')
        .map((item) => ({ key: item.key, prompt: item.prompt.EN, value: this.answerText(item, answers[item.key]) })),
      photos: r.attachments.map((a) => ({ id: a.id, itemKey: a.itemKey })),
    };
  }

  private answerText(item: InstrumentContent['items'][number], value: unknown): string {
    if (value === undefined || value === null || value === '') return '';
    const label = (v: unknown) => item.options?.find((o) => o.value === v)?.label.EN ?? String(v);
    if (Array.isArray(value)) return value.map(label).join(', ');
    return item.options ? label(value) : String(value);
  }

  private async thread(where: { patientId: string } | { patientId: null; phoneE164: string }, opts: { visibleOnly?: boolean } = {}) {
    const messages = await this.prisma.patientMessage.findMany({
      where: { ...where, ...(opts.visibleOnly ? { assignment: { in: VISIBLE_ASSIGNMENTS } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { attachments: { select: { id: true } }, patient: { select: { id: true, name: true } } },
    });
    messages.reverse();
    const staffIds = messages.filter((m) => m.authorKind === 'staff').map((m) => m.id);
    const deliveries = staffIds.length
      ? await this.prisma.outboundMessage.findMany({ where: { subjectType: REPLY_SUBJECT, subjectId: { in: staffIds } }, select: { subjectId: true, state: true, outcome: true } })
      : [];
    const delivery = new Map(deliveries.map((d) => [d.subjectId, { state: d.state, outcome: d.outcome }]));
    const names = await this.userNames(messages.filter((m) => m.authorKind === 'staff').map((m) => m.assignedById));
    return messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      channel: m.channel,
      kind: m.kind,
      body: m.body,
      hasMedia: Boolean(m.mediaId),
      photos: m.attachments.map((a) => a.id),
      assignment: m.assignment,
      patient: m.patient,
      phoneE164: m.phoneE164,
      authorKind: m.authorKind,
      author: m.authorKind === 'staff' && m.assignedById ? names.get(m.assignedById) ?? 'Staff' : null,
      readAt: m.readAt,
      createdAt: m.createdAt,
      delivery: delivery.get(m.id) ?? null,
    }));
  }

  /**
   * @cc [owner:nareshshah139,label:product] claim-before-work
   * Claiming MUST succeed for exactly one staff member at a time; only the claimer, or nobody
   * when the item is open, MAY resolve it, and resolving needs a resolution code and a note (PP-50).
   */
  async claim(id: string, staff: Staff) {
    await this.findItem(id, staff.branchId);
    const { count } = await this.prisma.attentionItem.updateMany({ where: { id, state: 'OPEN' }, data: { state: 'CLAIMED', claimedById: staff.id } });
    if (!count) {
      const now = await this.prisma.attentionItem.findUniqueOrThrow({ where: { id } });
      if (now.state === 'CLAIMED' && now.claimedById === staff.id) return this.getItem(id, staff);
      if (now.state === 'RESOLVED') throw new ConflictException('This item is already resolved.');
      const names = await this.userNames([now.claimedById]);
      throw new ConflictException(`${names.get(now.claimedById ?? '') ?? 'Someone'} is already working on this item.`);
    }
    return this.getItem(id, staff);
  }

  async release(id: string, staff: Staff) {
    await this.findItem(id, staff.branchId);
    const { count } = await this.prisma.attentionItem.updateMany({
      where: { id, state: 'CLAIMED', claimedById: staff.id },
      data: { state: 'OPEN', claimedById: null },
    });
    if (!count) throw new ConflictException('Only the person working on this item can release it.');
    return this.getItem(id, staff);
  }

  async resolve(id: string, staff: Staff, code: ResolutionCode, note: string) {
    const item = await this.findItem(id, staff.branchId);
    if (!canResolve(staff.role, item.priority)) throw new ForbiddenException('Only doctors, nurses and admins can resolve an urgent item.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.attentionItem.updateMany({
        where: { id, OR: [{ state: 'OPEN' }, { state: 'CLAIMED', claimedById: staff.id }] },
        data: { state: 'RESOLVED', resolutionCode: code, resolutionNote: note.trim(), resolvedById: staff.id, resolvedAt: now, claimedById: item.claimedById ?? staff.id },
      });
      if (!count) {
        const current = await tx.attentionItem.findUniqueOrThrow({ where: { id } });
        throw new ConflictException(current.state === 'RESOLVED' ? 'This item is already resolved.' : 'Someone else is working on this item.');
      }
      if (item.kind === 'PATIENT_MESSAGE') await this.markThreadRead(tx, item, now);
    });
    return this.getItem(id, staff);
  }

  private markThreadRead(tx: Tx, item: Pick<AttentionItem, 'patientId' | 'phoneE164'>, now: Date) {
    const where: Prisma.PatientMessageWhereInput = item.patientId ? { patientId: item.patientId } : { patientId: null, phoneE164: item.phoneE164 ?? '' };
    return tx.patientMessage.updateMany({ where: { ...where, direction: 'INBOUND', readAt: null }, data: { readAt: now } });
  }

  async markRead(id: string, staff: Staff) {
    const item = await this.findItem(id, staff.branchId);
    const { count } = await this.markThreadRead(this.prisma, item, new Date());
    return { read: count };
  }

  /** PP-51: a free-text reply inside the 24-hour window, sent through the outbound sender. */
  async reply(id: string, staff: Staff, body: string) {
    const item = await this.findItem(id, staff.branchId);
    if (item.state === 'RESOLVED') throw new ConflictException('This item is already resolved.');
    const now = new Date();
    const text = body.trim();
    const outboundId = await this.prisma.$transaction(async (tx) => {
      const status = await staffReplyStatus(tx, item.patientId, now);
      if (!status.canReply) throw new ConflictException({ message: status.message, reason: status.reason });
      const message = await tx.patientMessage.create({
        data: {
          patientId: item.patientId, phoneE164: status.toE164, direction: 'OUTBOUND', kind: 'text', body: text,
          assignment: 'CONFIRMED', assignedById: staff.id, authorKind: 'staff', readAt: now, createdAt: now,
        },
      });
      const dedupeKey = `staff-reply:${message.id}`;
      await enqueueOutbound(tx, {
        dedupeKey, purpose: OutboundMessagePurpose.STAFF_REPLY, patientId: item.patientId, toE164: status.toE164,
        templateKey: 'staff_reply', params: { whatsapp: { kind: 'text', text } },
        subjectType: REPLY_SUBJECT, subjectId: message.id, notBefore: now, createdAt: now,
      });
      await this.markThreadRead(tx, item, now);
      return (await tx.outboundMessage.findUniqueOrThrow({ where: { dedupeKey }, select: { id: true } })).id;
    });
    const outcome = await this.pass.sendNow(outboundId, now);
    const row = await this.prisma.outboundMessage.findUniqueOrThrow({ where: { id: outboundId }, select: { state: true, outcome: true } });
    return { outcome, delivery: row, item: await this.getItem(id, staff) };
  }

  /** The fallback when no reply can be sent: a note in the thread that staff called the patient. */
  async logCall(id: string, staff: Staff, note: string) {
    const item = await this.findItem(id, staff.branchId);
    const profile = item.patientId ? await this.prisma.patientPortalProfile.findUnique({ where: { patientId: item.patientId }, select: { phoneE164: true } }) : null;
    await this.prisma.patientMessage.create({
      data: {
        patientId: item.patientId, phoneE164: item.phoneE164 ?? profile?.phoneE164 ?? '', direction: 'OUTBOUND', channel: 'PHONE', kind: 'call-log',
        body: note.trim(), assignment: item.patientId ? 'CONFIRMED' : 'UNASSIGNED', assignedById: staff.id, authorKind: 'staff', readAt: new Date(),
      },
    });
    return this.getItem(id, staff);
  }

  /**
   * @cc [owner:nareshshah139,label:privacy] confirmed-messages-only-on-patient-page
   * A message that is unassigned or only suggested MUST appear on no patient's page until a staff
   * member assigns or confirms it (PP-52).
   */
  async assignMessage(messageId: string, staff: Staff, patientId: string) {
    const target = await this.prisma.patient.findFirst({ where: { id: patientId, branchId: staff.branchId, isArchived: false }, select: { id: true, branchId: true } });
    if (!target) throw new NotFoundException('Patient not found');
    return this.prisma.$transaction(async (tx) => {
      const message = await this.lockMessage(tx, messageId, staff.branchId);
      if (message.assignment !== 'UNASSIGNED' && message.assignment !== 'SUGGESTED') throw new ConflictException('This message is already assigned.');
      const now = new Date();
      await tx.patientMessage.update({ where: { id: messageId }, data: { patientId: target.id, assignment: 'CONFIRMED', assignedById: staff.id } });
      await openPatientMessageItem(tx, { patientId: target.id, phoneE164: message.phoneE164, branchId: target.branchId }, now);
      if (message.patientId && message.patientId !== target.id) {
        const left = await tx.patientMessage.count({
          where: { patientId: message.patientId, direction: 'INBOUND', OR: [{ readAt: null }, { assignment: { in: ['UNASSIGNED', 'SUGGESTED'] } }] },
        });
        if (!left) {
          await tx.attentionItem.updateMany({
            where: { kind: 'PATIENT_MESSAGE', subjectKey: `patient:${message.patientId}`, state: { in: [...LIVE_STATES] } },
            data: { state: 'RESOLVED', resolutionCode: 'ASSIGNED', resolutionNote: 'Message assigned to another patient', resolvedById: staff.id, resolvedAt: now },
          });
        }
      }
      if (!message.patientId) {
        const left = await tx.patientMessage.count({ where: { patientId: null, phoneE164: message.phoneE164, direction: 'INBOUND' } });
        if (!left) {
          await tx.attentionItem.updateMany({
            where: { kind: 'PATIENT_MESSAGE', subjectKey: `phone:${message.phoneE164}`, state: { in: [...LIVE_STATES] } },
            data: { state: 'RESOLVED', resolutionCode: 'ASSIGNED', resolutionNote: 'Messages assigned to a patient', resolvedById: staff.id, resolvedAt: now },
          });
        }
      }
      const item = await tx.attentionItem.findFirst({ where: { kind: 'PATIENT_MESSAGE', subjectKey: `patient:${target.id}`, state: { in: [...LIVE_STATES] } }, select: { id: true } });
      return { messageId, patientId: target.id, itemId: item?.id ?? null };
    });
  }

  async confirmMessage(messageId: string, staff: Staff) {
    return this.prisma.$transaction(async (tx) => {
      const message = await this.lockMessage(tx, messageId, staff.branchId);
      if (message.assignment !== 'SUGGESTED' || !message.patientId) throw new ConflictException('Only a suggested assignment can be confirmed.');
      await tx.patientMessage.update({ where: { id: messageId }, data: { assignment: 'CONFIRMED', assignedById: staff.id } });
      return { messageId, patientId: message.patientId };
    });
  }

  private async lockMessage(tx: Tx, id: string, branchId: string) {
    await tx.$queryRaw`SELECT "id" FROM "patient_messages" WHERE "id" = ${id} FOR UPDATE`;
    const message = await tx.patientMessage.findFirst({ where: { id, direction: 'INBOUND', ...visibleMessage(branchId) } });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  /** "Waiting on patient": open check-ins with the state of their latest message. */
  async listWaiting(branchId: string, now = new Date()) {
    const checkIns = await this.prisma.checkIn.findMany({
      where: { state: 'OPEN', track: { patient: { branchId } } },
      orderBy: { closesAt: 'asc' },
      take: 500,
      select: {
        id: true, stepKey: true, opensAt: true, closesAt: true,
        taskLink: { select: { linkId: true } },
        track: { select: { patient: { select: { id: true, name: true, patientCode: true } }, planVersion: { select: { content: true, plan: { select: { key: true } } } } } },
      },
    });
    const linkIds = checkIns.map((c) => c.taskLink?.linkId).filter((id): id is string => Boolean(id));
    const messages = linkIds.length
      ? await this.prisma.outboundMessage.findMany({
          where: { subjectType: TASK_LINK_SUBJECT, subjectId: { in: linkIds } },
          orderBy: { createdAt: 'asc' },
          select: { subjectId: true, purpose: true, state: true, outcome: true, sentAt: true },
        })
      : [];
    const latest = new Map(messages.map((m) => [m.subjectId, m]));
    return checkIns.map((c) => {
      const m = c.taskLink ? latest.get(c.taskLink.linkId) : undefined;
      return {
        checkInId: c.id,
        stepKey: c.stepKey,
        patient: c.track.patient,
        plan: (c.track.planVersion.content as unknown as PlanContent).name?.EN ?? c.track.planVersion.plan.key,
        opensAt: c.opensAt,
        closesAt: c.closesAt,
        closesInMinutes: Math.floor((c.closesAt.getTime() - now.getTime()) / 60000),
        delivery: m ? { purpose: m.purpose, state: m.state, outcome: m.outcome, sentAt: m.sentAt } : null,
      };
    });
  }

  /** "Messages": threads with unread patient messages, newest first. */
  async listThreads(branchId: string) {
    const unread = await this.prisma.patientMessage.findMany({
      where: { direction: 'INBOUND', readAt: null, ...visibleMessage(branchId) },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, patientId: true, phoneE164: true, body: true, kind: true, assignment: true, createdAt: true, patient: { select: { id: true, name: true, patientCode: true } } },
    });
    const threads = new Map<string, { subjectKey: string; patient: (typeof unread)[number]['patient']; phoneE164: string; unread: number; lastMessageAt: Date; preview: string; suggested: boolean }>();
    for (const m of unread) {
      const subjectKey = m.patientId ? `patient:${m.patientId}` : `phone:${m.phoneE164}`;
      const t = threads.get(subjectKey);
      if (t) {
        t.unread++;
        t.suggested ||= m.assignment === 'SUGGESTED';
      } else {
        threads.set(subjectKey, {
          subjectKey, patient: m.patient, phoneE164: m.phoneE164, unread: 1, lastMessageAt: m.createdAt,
          preview: (m.body ?? (m.kind === 'image' ? 'Photo' : m.kind)).slice(0, 140), suggested: m.assignment === 'SUGGESTED',
        });
      }
    }
    const keys = [...threads.keys()];
    const items = keys.length
      ? await this.prisma.attentionItem.findMany({ where: { kind: 'PATIENT_MESSAGE', subjectKey: { in: keys }, state: { in: [...LIVE_STATES] } }, select: { id: true, subjectKey: true } })
      : [];
    const itemBySubject = new Map(items.map((i) => [i.subjectKey, i.id]));
    return [...threads.values()].map((t) => ({ ...t, itemId: itemBySubject.get(t.subjectKey) ?? null }));
  }

  /** The patient page timeline: tracks, check-ins, responses, confirmed messages, consent and language (PP-53). */
  async timeline(patientId: string, branchId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, branchId },
      select: { id: true, portalProfile: { select: { phoneE164: true, phoneConfirmedAt: true, consentState: true, preferredLanguage: true, portalEnabled: true } } },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    const tracks = await this.prisma.followUpTrack.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, state: true, anchorDate: true, stopReason: true, stoppedAt: true, completedAt: true, createdAt: true, visitId: true,
        planVersion: { select: { version: true, content: true, plan: { select: { key: true } } } },
        checkIns: {
          orderBy: { seq: 'asc' },
          select: {
            id: true, stepKey: true, state: true, opensAt: true, closesAt: true,
            response: { select: { id: true, submittedAt: true, score: true, flag: true, answers: true, attachments: { select: { id: true, itemKey: true, mime: true } }, instrumentVersion: { select: { id: true, version: true, instrumentId: true, content: true } } } },
          },
        },
      },
    });
    return {
      profile: patient.portalProfile,
      tracks: tracks.map((t) => ({
        id: t.id, state: t.state, anchorDate: t.anchorDate, stopReason: t.stopReason, stoppedAt: t.stoppedAt, completedAt: t.completedAt, visitId: t.visitId,
        plan: (t.planVersion.content as unknown as PlanContent).name?.EN ?? t.planVersion.plan.key,
        planVersion: t.planVersion.version,
        checkIns: t.checkIns.map((c) => ({
          id: c.id, stepKey: c.stepKey, state: c.state, opensAt: c.opensAt, closesAt: c.closesAt,
          response: c.response ? this.presentResponse({ ...c.response, checkInId: c.id } as any) : null,
        })),
      })),
      messages: await this.thread({ patientId }, { visibleOnly: true }),
    };
  }
}
