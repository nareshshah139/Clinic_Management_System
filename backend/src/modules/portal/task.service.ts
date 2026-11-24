import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { InstrumentContent, Text } from '../follow-ups/content';
import { completeTrackIfDone } from '../follow-ups/tracks';
import { openPatientMessageItem } from '../messaging/attention';
import { clinicName } from '../messaging/number-confirmation';
import { Answers, answerProblems, asMessage, evaluate } from './answers';
import { LinkInactive } from './link-inactive';
import { PhotoRejected, reencodePhoto } from './photos';
import { TaskLinkPrincipal } from './principal';
import { SubmitDto } from './task.dto';

type Tx = Prisma.TransactionClient;

export type TaskPage = {
  clinic: string;
  firstName: string;
  language: 'EN' | 'TE' | 'HI';
  checkIns: {
    id: string;
    doctor: string;
    title: Text;
    items: { key: string; type: string; prompt: Text; required: boolean; min?: number; max?: number; options?: { value: string; label: Text }[] }[];
  }[];
};

export type SubmitResult = { status: 'saved'; urgent: false } | { status: 'saved'; urgent: true; clinicPhone: string } | { status: 'already-answered' };

/** The patient's branch number, else the clinic-wide CLINIC_PHONE. */
async function clinicPhone(tx: Tx, branchId: string): Promise<string> {
  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { phone: true } });
  return branch?.phone?.trim() || process.env.CLINIC_PHONE || '';
}

/** What a task-link holder can read and write; every method takes the guard's principal (PP-84). */
type Window = { state: string; closesAt: Date };
/** A first answer, or a second one kept as a message, is taken only until the check-in's window closes (PP-38, PP-42). */
const takesAnswer = (c: Window, now: Date) => (c.state === 'OPEN' || c.state === 'ANSWERED') && now < c.closesAt;
const keepsSecondAnswer = (c: Window, now: Date) => c.state === 'ANSWERED' && now < c.closesAt;

@Injectable()
export class TaskPageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:security] task-page-shows-only
   * The task page MUST carry only the clinic name, the patient's first name, the doctor's name and
   * the questions of the link's OPEN check-ins: no diagnosis, medicine, score, stored answer,
   * appointment or patient id (PP-40, LinkAnswersOnly).
   */
  async page(principal: TaskLinkPrincipal): Promise<TaskPage> {
    if (!principal.checkInIds.length) throw new LinkInactive();
    const [patient, checkIns] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({
        where: { id: principal.patientId },
        select: { name: true, portalProfile: { select: { preferredLanguage: true } } },
      }),
      this.prisma.checkIn.findMany({
        where: { id: { in: [...principal.checkInIds] }, state: 'OPEN' },
        orderBy: { opensAt: 'asc' },
        select: {
          id: true,
          instrumentVersion: { select: { content: true } },
          track: { select: { visit: { select: { doctor: { select: { firstName: true, lastName: true } } } } } },
        },
      }),
    ]);
    if (!checkIns.length) throw new LinkInactive();
    return {
      clinic: clinicName(),
      firstName: patient.name.trim().split(/\s+/)[0] ?? '',
      language: patient.portalProfile?.preferredLanguage ?? 'EN',
      checkIns: checkIns.map((c) => {
        const content = c.instrumentVersion.content as unknown as InstrumentContent;
        const doctor = c.track.visit.doctor;
        return {
          id: c.id,
          doctor: `Dr. ${doctor.firstName} ${doctor.lastName}`.trim(),
          title: content.title,
          items: content.items.map((i) => ({
            key: i.key,
            type: i.type,
            prompt: i.prompt,
            required: !!i.required,
            ...(i.type === 'scale' ? { min: i.min, max: i.max } : {}),
            ...(i.options ? { options: i.options.map(({ value, label }) => ({ value, label })) } : {}),
          })),
        };
      }),
    };
  }

  /**
   * @cc [owner:nareshshah139,label:product] one-response-second-kept
   * A submit MUST either save the check-in's only response with its photos, score and any flag
   * item in one transaction, or, when the check-in is already ANSWERED, save the submission as a
   * patient message with an open attention item and answer only "already answered"
   * (PP-42, OneResponsePerCheckIn, SecondAnswerNotLost, UrgentReachesWorklist).
   */
  async submit(principal: TaskLinkPrincipal, dto: SubmitDto, now = new Date()): Promise<SubmitResult> {
    const answers = dto.answers as Answers;
    const photos = dto.photos ?? [];
    if (photos.length > 4) throw new BadRequestException('At most four photos can be attached.');
    const checkIn = await this.prisma.checkIn.findFirst({
      where: { id: dto.checkInId, taskLink: { linkId: principal.linkId } },
      select: { id: true, trackId: true, state: true, closesAt: true, instrumentVersionId: true, instrumentVersion: { select: { content: true } } },
    });
    if (!checkIn || !takesAnswer(checkIn, now)) throw new LinkInactive();
    const content = checkIn.instrumentVersion.content as unknown as InstrumentContent;
    const problems = answerProblems(content, answers, photos.map((p) => p.itemKey));
    if (problems.length) throw new BadRequestException(problems);
    const images = await Promise.all(
      photos.map((p) =>
        reencodePhoto(p.dataUrl).then((bytes) => ({ itemKey: p.itemKey, bytes }), (e) => {
          throw e instanceof PhotoRejected ? new BadRequestException(e.message) : e;
        }),
      ),
    );
    const attachments = images.map(({ itemKey, bytes }) => ({ itemKey, mime: 'image/jpeg', sizeBytes: bytes.length, bytes }));

    return this.prisma.$transaction(async (tx) => {
      // Patient before link: the order a duplicate merge locks them in.
      await tx.$queryRaw`SELECT id FROM patients WHERE id = ${principal.patientId} FOR SHARE`;
      const live = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM portal_task_links WHERE id = ${principal.linkId} AND "patientId" = ${principal.patientId} AND "revokedAt" IS NULL FOR SHARE`;
      if (!live.length) throw new LinkInactive();
      const moved = await tx.checkIn.updateMany({
        where: { id: checkIn.id, state: 'OPEN', closesAt: { gt: now }, taskLink: { linkId: principal.linkId } },
        data: { state: 'ANSWERED', endedAt: now },
      });
      if (moved.count === 0) return this.keepSecondSubmit(tx, principal, checkIn.id, answers, attachments, now);
      const { score, flag } = evaluate(content, answers);
      await tx.checkInResponse.create({
        data: {
          checkInId: checkIn.id,
          instrumentVersionId: checkIn.instrumentVersionId,
          answers,
          score,
          flag,
          submittedAt: now,
          attachments: { create: attachments },
        },
      });
      if (flag) {
        await tx.attentionItem.create({
          data: {
            kind: 'RESPONSE_FLAG',
            subjectKey: `check-in:${checkIn.id}`,
            patientId: principal.patientId,
            branchId: principal.branchId,
            priority: flag,
            reason: 'response-flag',
            lastEventAt: now,
          },
        });
      }
      await completeTrackIfDone(tx, checkIn.trackId, now);
      return flag === 'URGENT' ? { status: 'saved' as const, urgent: true as const, clinicPhone: await clinicPhone(tx, principal.branchId) } : { status: 'saved' as const, urgent: false as const };
    });
  }

  private async keepSecondSubmit(
    tx: Tx,
    principal: TaskLinkPrincipal,
    checkInId: string,
    answers: Answers,
    attachments: { itemKey: string; mime: string; sizeBytes: number; bytes: Buffer }[],
    now: Date,
  ): Promise<SubmitResult> {
    const state = await tx.checkIn.findUniqueOrThrow({ where: { id: checkInId }, select: { state: true, closesAt: true } });
    if (!keepsSecondAnswer(state, now)) throw new LinkInactive();
    const profile = await tx.patientPortalProfile.findUnique({ where: { patientId: principal.patientId }, select: { phoneE164: true } });
    const phoneE164 = profile?.phoneE164 ?? '';
    await tx.patientMessage.create({
      data: {
        patientId: principal.patientId,
        phoneE164,
        direction: 'INBOUND',
        channel: 'PORTAL',
        kind: 'check-in-resubmit',
        body: asMessage(answers, attachments.length),
        assignment: 'EXACT',
        authorKind: 'PATIENT',
        createdAt: now,
        attachments: { create: attachments },
      },
    });
    await openPatientMessageItem(tx, { patientId: principal.patientId, phoneE164, branchId: principal.branchId }, now);
    return { status: 'already-answered' };
  }
}
