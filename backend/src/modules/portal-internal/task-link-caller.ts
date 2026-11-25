import type { PrismaService } from '../../shared/database/prisma.service';
import { hashTaskToken, verifyTaskToken } from '../follow-ups/task-link';
import { LinkInactive } from '../portal/link-inactive';
import type { TaskLinkPrincipal } from '../portal/principal';
import type { PortalCaller } from './portal-call';

/**
 * The task-link principal behind a `task-link` caller, built from the token alone (PP-84):
 * only the link's patient and its check-ins that are OPEN right now. Anything else is LinkInactive.
 */
export async function taskLinkOf(prisma: PrismaService, caller: PortalCaller, now = new Date()): Promise<TaskLinkPrincipal> {
  if (caller.kind !== 'task-link') throw new LinkInactive();
  const link = await prisma.portalTaskLink.findUnique({
    where: { tokenHash: hashTaskToken(caller.token) },
    select: {
      id: true,
      patientId: true,
      revokedAt: true,
      patient: { select: { branchId: true, portalProfile: { select: { consentState: true, portalEnabled: true } } } },
      checkIns: { select: { checkInId: true, checkIn: { select: { state: true, closesAt: true } } } },
    },
  });
  if (!link || link.revokedAt || !verifyTaskToken(caller.token, link.id)) throw new LinkInactive();
  const profile = link.patient.portalProfile;
  if (!profile?.portalEnabled || profile.consentState === 'OPTED_OUT') throw new LinkInactive();
  return Object.freeze({
    kind: 'task-link',
    linkId: link.id,
    patientId: link.patientId,
    branchId: link.patient.branchId,
    checkInIds: link.checkIns.filter((c) => c.checkIn.state === 'OPEN' && now < c.checkIn.closesAt).map((c) => c.checkInId),
  });
}
