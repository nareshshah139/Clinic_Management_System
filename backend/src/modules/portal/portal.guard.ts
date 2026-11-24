import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../shared/database/prisma.service';
import { hashTaskToken, verifyTaskToken } from '../follow-ups/task-link';
import { LinkInactive } from './link-inactive';
import { PRINCIPAL, PortalIdentityPrincipal, PortalPatientPrincipal, PortalRequest, TaskLinkPrincipal } from './principal';
import { sessionTokenFrom } from './session';
import { SignInService } from './sign-in.service';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** What a portal route accepts: a task link, a session (with or without a chosen profile), or the code itself. */
export type PortalCredential = 'task-link' | 'session' | 'session-patient' | 'sign-in';
export const PORTAL_CREDENTIAL = 'portalCredential';

export const SESSION_ENDED = 'Please sign in again.';
export const CHOOSE_PROFILE = 'Choose whose records to open.';

/**
 * @cc [owner:nareshshah139,label:security] portal-write-origin
 * Every portal write MUST carry an Origin header exactly equal to the origin of PORTAL_BASE_URL,
 * and is refused when that origin is not configured (PP-59).
 */
export function portalOrigin(): string | null {
  try {
    return process.env.PORTAL_BASE_URL ? new URL(process.env.PORTAL_BASE_URL).origin : null;
  } catch {
    return null;
  }
}

export function writeOriginAllowed(req: Pick<PortalRequest, 'method' | 'headers'>): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes((req.method ?? 'GET').toUpperCase())) return true;
  const want = portalOrigin();
  const got = req.headers.origin;
  return !!want && typeof got === 'string' && got === want;
}

/**
 * Builds the portal principal from the portal credential alone. A staff cookie or JWT is ignored
 * (StaffCookieStaysStaff), and patient scope is never read from the request (PP-84).
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly signIn: SignInService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PortalRequest>();
    const credential = this.reflector.get<PortalCredential>(PORTAL_CREDENTIAL, context.getHandler()) ?? 'task-link';
    if (!writeOriginAllowed(req)) throw new ForbiddenException('This request did not come from the portal.');
    if (credential === 'sign-in') return true;
    if (credential === 'task-link') {
      req[PRINCIPAL] = Object.freeze(await this.taskLink(req));
      return true;
    }
    const token = sessionTokenFrom(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined);
    const found = token ? await this.signIn.resolve(token) : null;
    if (!found) throw new UnauthorizedException(SESSION_ENDED);
    if (credential === 'session') {
      const principal: PortalIdentityPrincipal = { kind: 'portal-identity', sessionId: found.session.id, identityId: found.session.identityId, phoneE164: found.phoneE164 };
      req[PRINCIPAL] = Object.freeze(principal);
      return true;
    }
    if (!found.chosen) throw new UnauthorizedException(CHOOSE_PROFILE);
    const principal: PortalPatientPrincipal = {
      kind: 'portal-patient',
      sessionId: found.session.id,
      identityId: found.session.identityId,
      patientId: found.chosen.patientId,
      branchId: found.chosen.branchId,
    };
    req[PRINCIPAL] = Object.freeze(principal);
    return true;
  }

  private async taskLink(req: PortalRequest): Promise<TaskLinkPrincipal> {
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
    return {
      kind: 'task-link',
      linkId: link.id,
      patientId: link.patientId,
      branchId: link.patient.branchId,
      checkInIds: link.checkIns.filter((c) => c.checkIn.state === 'OPEN' && now < c.checkIn.closesAt).map((c) => c.checkInId),
    };
  }
}
