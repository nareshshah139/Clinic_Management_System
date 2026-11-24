import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { hashTaskToken, verifyTaskToken } from '../follow-ups/task-link';
import { LinkInactive } from './link-inactive';
import { PRINCIPAL, PortalRequest, TaskLinkPrincipal } from './principal';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Turns the task-link token in the request body into a principal. A staff cookie or JWT is
 * ignored: the principal comes from the token alone (StaffCookieStaysStaff).
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PortalRequest>();
    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string' || !TOKEN.test(token)) throw new LinkInactive();
    const link = await this.prisma.portalTaskLink.findUnique({
      where: { tokenHash: hashTaskToken(token) },
      select: {
        id: true,
        patientId: true,
        revokedAt: true,
        patient: { select: { branchId: true, portalProfile: { select: { consentState: true, portalEnabled: true } } } },
        checkIns: { select: { checkInId: true, checkIn: { select: { state: true, closesAt: true } } } },
      },
    });
    if (!link || link.revokedAt || !verifyTaskToken(token, link.id)) throw new LinkInactive();
    const profile = link.patient.portalProfile;
    if (!profile?.portalEnabled || profile.consentState === 'OPTED_OUT') throw new LinkInactive();
    const now = new Date();
    const principal: TaskLinkPrincipal = {
      kind: 'task-link',
      linkId: link.id,
      patientId: link.patientId,
      branchId: link.patient.branchId,
      checkInIds: link.checkIns.filter((c) => c.checkIn.state === 'OPEN' && now < c.checkIn.closesAt).map((c) => c.checkInId),
    };
    req[PRINCIPAL] = Object.freeze(principal);
    return true;
  }
}
