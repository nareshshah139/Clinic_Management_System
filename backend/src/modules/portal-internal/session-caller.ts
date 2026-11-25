import { UnauthorizedException } from '@nestjs/common';
import type { PortalCaller } from './portal-call';
import type { PortalIdentityPrincipal, PortalPatientPrincipal } from '../portal/principal';
import type { SignInService } from '../portal/sign-in.service';

export const SIGNED_OUT = 'This portal session has ended.';
export const CHOOSE_PROFILE = 'Choose whose records to open.';

async function resolve(signIn: SignInService, caller: PortalCaller) {
  const found = caller.kind === 'session' ? await signIn.resolve(caller.token) : null;
  if (!found) throw new UnauthorizedException(SIGNED_OUT);
  return found;
}

/** The phone holder behind a `session` caller, whether or not a profile is chosen. */
export async function identityOf(signIn: SignInService, caller: PortalCaller): Promise<PortalIdentityPrincipal> {
  const found = await resolve(signIn, caller);
  return { kind: 'portal-identity', sessionId: found.session.id, identityId: found.session.identityId, phoneE164: found.phoneE164 };
}

/** The patient chosen in a `session` caller's session; refused until a profile is chosen. */
export async function patientOf(signIn: SignInService, caller: PortalCaller): Promise<PortalPatientPrincipal> {
  const found = await resolve(signIn, caller);
  if (!found.chosen) throw new UnauthorizedException(CHOOSE_PROFILE);
  return {
    kind: 'portal-patient',
    sessionId: found.session.id,
    identityId: found.session.identityId,
    patientId: found.chosen.patientId,
    branchId: found.chosen.branchId,
  };
}
