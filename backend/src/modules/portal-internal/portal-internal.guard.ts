import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  PORTAL_CALL_WINDOW_MS,
  PORTAL_HEADERS,
  PortalCaller,
  canonicalBody,
  parseCaller,
  portalServiceSecret,
  signPortalCall,
  signatureMatches,
} from './portal-call';

export const PORTAL_CALLER = Symbol('portal-caller');
export const REFUSED = 'This request is not a signed portal call.';

export type PortalInternalRequest = {
  method: string;
  originalUrl: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  [PORTAL_CALLER]?: PortalCaller;
};

/**
 * @cc [owner:nareshshah139,label:security] portal-internal-guard
 * A route under /internal/portal MUST answer 404 while PORTAL_SERVICE_SECRET is unset or shorter than
 * 32 characters, and otherwise MUST mark its answer Cache-Control: no-store and MUST refuse with 401 any request that carries a staff Authorization
 * header, any cookie or an Idempotency-Key (PP-86), whose timestamp is more than 60 seconds from now,
 * whose caller header does not parse, whose signature does not match, or whose signature was already
 * accepted. The caller it attaches is the only identity the route sees (PP-84).
 */
@Injectable()
export class PortalInternalGuard implements CanActivate {
  private readonly accepted = new Map<string, number>();

  canActivate(context: ExecutionContext): boolean {
    const secret = portalServiceSecret();
    if (!secret) throw new NotFoundException();
    const req = context.switchToHttp().getRequest<PortalInternalRequest>();
    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Cache-Control', 'no-store');
    const h = req.headers;
    if (h.authorization !== undefined || h.cookie !== undefined || h['idempotency-key'] !== undefined) {
      throw new UnauthorizedException(REFUSED);
    }
    const tsRaw = h[PORTAL_HEADERS.ts];
    const ts = typeof tsRaw === 'string' && /^\d{1,16}$/.test(tsRaw) ? Number(tsRaw) : NaN;
    const now = Date.now();
    if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > PORTAL_CALL_WINDOW_MS) throw new UnauthorizedException(REFUSED);
    const callerRaw = h[PORTAL_HEADERS.caller];
    const caller = parseCaller(callerRaw);
    if (!caller) throw new UnauthorizedException(REFUSED);
    const expected = signPortalCall(secret, {
      method: req.method,
      path: req.originalUrl,
      ts,
      body: canonicalBody(req.method, req.body),
      caller: callerRaw as string,
    });
    if (!signatureMatches(expected, h[PORTAL_HEADERS.signature])) throw new UnauthorizedException(REFUSED);
    this.forgetExpired(now);
    if (this.accepted.has(expected)) throw new UnauthorizedException(REFUSED);
    this.accepted.set(expected, ts + PORTAL_CALL_WINDOW_MS);
    req[PORTAL_CALLER] = Object.freeze(caller);
    return true;
  }

  private forgetExpired(now: number) {
    for (const [signature, expires] of this.accepted) {
      if (expires >= now) break;
      this.accepted.delete(signature);
    }
  }
}
