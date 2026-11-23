import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, concatMap, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../database/prisma.service';

const PENDING = 0;
const CLAIM_LEASE_MS = 2 * 60_000;
const STILL_RUNNING = 'This save is still in progress. Wait a few seconds, then save again.';

type Scope = { key: string; userId: string; resourceType: string; resourceId: string; method: string };
type Owned = { kind: 'owned'; id: string; lease: Date };
type Claim = Owned | { kind: 'busy' } | { kind: 'done'; statusCode: number; body: unknown };

/**
 * @cc [owner:nareshshah139,label:integrity] idempotent-write-replay
 * A POST, PUT, PATCH or DELETE that repeats a stored Idempotency-Key for the same user, resource id
 * and method MUST answer with the first response's status and body and MUST NOT run the handler
 * again. A write that failed MUST NOT be stored, so its retry runs the handler.
 */
/**
 * @cc [owner:nareshshah139,label:security] idempotency-keys-scoped-per-user
 * A stored response MUST replay only to the authenticated user who created it: another user sending
 * the same key runs the handler and gets their own response.
 */
/**
 * @cc [owner:nareshshah139,label:integrity] idempotency-skips-reads-and-keyless-writes
 * GET requests and writes without a non-blank Idempotency-Key MUST run the handler every time and
 * MUST NOT read or write the idempotency store.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:reliability] idempotency-store-fails-open
   * Deliberate fail-open: when the idempotency store cannot be read or written, the write MUST still
   * run and return its normal response, and a later retry runs the handler again.
   */
  /**
   * @cc [owner:nareshshah139,label:integrity] idempotency-concurrent-first-requests
   * Two overlapping first requests with one key MUST run the handler once. The key is claimed before
   * the handler runs, a request that finds the claim answers 425 so the browser retries, and the
   * answer is stored before the response leaves. A claim left by a crashed process expires.
   */
  /**
   * @cc [owner:nareshshah139,label:security;target] idempotency-anonymous-keys-unscoped
   * Requests without an authenticated user MUST NOT replay each other's responses. Today they all
   * share an empty user id. This is a target obligation, not a pass claim.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const method = (req.method || 'GET').toUpperCase();
    const supported = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
    if (!supported.has(method)) {
      return next.handle();
    }

    const rawKey = (req.headers['idempotency-key'] as string | undefined)?.trim();
    if (!rawKey) {
      return next.handle();
    }

    const userObj: any = (req as any).user || {};
    const userId: string | null = userObj?.userId || userObj?.id || null;
    const segments = (req.path || '/').split('/').filter(Boolean);
    const scope: Scope = {
      key: rawKey,
      userId: userId || '',
      resourceType: segments[0] || 'unknown',
      resourceId: (req.params && (req.params as any).id) || segments[1] || '-',
      method,
    };

    return from(this.claim(scope)).pipe(
      catchError(() => of(null)),
      mergeMap((claim) => {
        if (!claim) return next.handle();
        if (claim.kind === 'busy') {
          return throwError(() => new HttpException({ statusCode: 425, message: STILL_RUNNING }, 425));
        }
        if (claim.kind === 'done') {
          if (claim.statusCode && typeof res?.status === 'function') res.status(claim.statusCode);
          return of(claim.body);
        }
        return next.handle().pipe(
          concatMap(async (data) => {
            const statusCode = res && typeof res.statusCode === 'number' ? res.statusCode : method === 'POST' ? 201 : 200;
            await this.settle(claim, statusCode, data).catch(() => this.release(claim)).catch(() => undefined);
            return data;
          }),
          catchError((error) => from(this.release(claim).catch(() => undefined)).pipe(mergeMap(() => throwError(() => error)))),
        );
      }),
    );
  }

  private async claim(scope: Scope): Promise<Claim> {
    const existing = await this.prisma.idempotencyRecord.findFirst({ where: scope });
    if (existing && existing.statusCode !== PENDING) {
      const body = existing.responseBody ? JSON.parse(existing.responseBody) : undefined;
      return { kind: 'done', statusCode: existing.statusCode, body };
    }
    const lease = new Date(Date.now() + CLAIM_LEASE_MS);
    if (existing) {
      if (existing.expiresAt && existing.expiresAt.getTime() > Date.now()) return { kind: 'busy' };
      const taken = await this.prisma.idempotencyRecord.updateMany({
        where: { id: existing.id, statusCode: PENDING, expiresAt: existing.expiresAt },
        data: { expiresAt: lease },
      });
      return taken.count === 1 ? { kind: 'owned', id: existing.id, lease } : { kind: 'busy' };
    }
    try {
      const row = await this.prisma.idempotencyRecord.create({
        data: { ...scope, statusCode: PENDING, responseBody: '', expiresAt: lease },
      });
      return { kind: 'owned', id: row.id, lease };
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') return { kind: 'busy' };
      throw error;
    }
  }

  private async settle(claim: Owned, statusCode: number, data: unknown) {
    await this.prisma.idempotencyRecord.updateMany({
      where: { id: claim.id, statusCode: PENDING, expiresAt: claim.lease },
      data: { statusCode, responseBody: JSON.stringify(data ?? null), expiresAt: null },
    });
  }

  private async release(claim: Owned) {
    await this.prisma.idempotencyRecord.deleteMany({
      where: { id: claim.id, statusCode: PENDING, expiresAt: claim.lease },
    });
  }
}
