import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { kolkataDay } from '../messaging/send-policy';
import { PlanContent } from './content';
import { CHECK_IN_MOVES, CHECK_IN_TERMINAL, StopReason, TRACK_MOVES } from './lifecycle';
import { checkInWindow } from './schedule';

type Tx = Prisma.TransactionClient;

/** The track anchor: the Asia/Kolkata date of the visit's first completion (PP-27). */
export const anchorDay = (completedAt: Date) => kolkataDay(completedAt);

export async function requirePlanVersion(tx: Tx | PrismaClient, planVersionId: string) {
  const version = await tx.followUpPlanVersion.findUnique({ where: { id: planVersionId } });
  if (!version) throw new BadRequestException('Unknown follow-up plan version');
  return version;
}

/**
 * Locks the patient row FOR SHARE so a staff archive, which locks the patient before its tracks,
 * cannot miss a new track. Callers that stop tracks before starting one take this lock first.
 */
export async function lockLivePatient(tx: Tx, patientId: string): Promise<boolean> {
  const [patient] = await tx.$queryRaw<{ isArchived: boolean }[]>`SELECT "isArchived" FROM patients WHERE id = ${patientId} FOR SHARE`;
  return !!patient && !patient.isArchived;
}

/**
 * @cc [owner:nareshshah139,label:integrity] track-with-its-check-ins
 * A track MUST be created with every check-in of its plan version in the caller's transaction,
 * which already holds the visit row lock; the partial unique index keeps one track that is not
 * STOPPED per visit (OneLiveTrackPerVisit).
 */
export async function startTrack(tx: Tx, input: { visitId: string; patientId: string; planVersionId: string; anchorDay: string }) {
  const version = await requirePlanVersion(tx, input.planVersionId);
  if (!(await lockLivePatient(tx, input.patientId))) return null;
  const { steps } = version.content as unknown as PlanContent;
  const track = await tx.followUpTrack.create({
    data: { visitId: input.visitId, patientId: input.patientId, planVersionId: version.id, anchorDate: input.anchorDay },
  });
  await tx.checkIn.createMany({
    data: steps.map((step, seq) => ({
      trackId: track.id,
      seq,
      stepKey: step.key,
      respondent: step.respondent,
      reminderAfterDays: step.reminderAfterDays ?? [],
      instrumentVersionId: step.instrumentVersionId,
      onMissed: step.onMissed,
      ...checkInWindow(input.anchorDay, step),
    })),
  });
  return track;
}

/**
 * @cc [owner:nareshshah139,label:integrity] stop-cancels-check-ins
 * Stopping a track MUST cancel every SCHEDULED or OPEN check-in on it in the same transaction
 * (PP-29). Only the doctor, a plan change, a visit delete and a staff archive stop a track.
 */
export async function stopTracks(
  tx: Tx,
  where: { id?: string; visitId?: string; patientId?: string },
  reason: StopReason,
  actorId: string | null,
  now = new Date(),
): Promise<number> {
  const tracks = await tx.followUpTrack.findMany({ where: { ...where, state: { in: [...TRACK_MOVES.stop.from] } }, select: { id: true } });
  if (!tracks.length) return 0;
  const ids = tracks.map((t) => t.id);
  await tx.checkIn.updateMany({
    where: { trackId: { in: ids }, state: { in: [...CHECK_IN_MOVES.cancel.from] } },
    data: { state: CHECK_IN_MOVES.cancel.to, endedAt: now },
  });
  const { count } = await tx.followUpTrack.updateMany({
    where: { id: { in: ids }, state: { in: [...TRACK_MOVES.stop.from] } },
    data: { state: TRACK_MOVES.stop.to, stopReason: reason, stoppedById: actorId, stoppedAt: now },
  });
  return count;
}

/** An ACTIVE track whose check-ins have all ended becomes COMPLETED. */
export async function completeTrackIfDone(tx: Tx, trackId: string, now = new Date()): Promise<boolean> {
  const live = await tx.checkIn.count({ where: { trackId, state: { notIn: [...CHECK_IN_TERMINAL] } } });
  if (live) return false;
  const { count } = await tx.followUpTrack.updateMany({
    where: { id: trackId, state: { in: [...TRACK_MOVES.complete.from] } },
    data: { state: TRACK_MOVES.complete.to, completedAt: now },
  });
  return count === 1;
}
