import { Injectable, Logger, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../database/prisma.service';

type Scope = { key: string; userId: string; resourceType: string; resourceId: string; method: string };
type Claim = { kind: 'owner'; lease: Date } | { kind: 'open' } | { kind: 'replay'; statusCode: number; body: unknown };

const PENDING = 0;
const LEASE_MS = 300_000;
const leaseEnd = () => new Date(Date.now() + LEASE_MS);

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
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * @cc [owner:nareshshah139,label:reliability] idempotency-store-fails-open
   * Deliberate fail-open: when the idempotency store cannot be read or written, the write MUST still
   * run and return its normal response, a later retry runs the handler again, and each store failure
   * MUST log a warning with its error code and no request or response data.
   */
  /**
   * @cc [owner:nareshshah139,label:integrity] idempotency-concurrent-first-requests
   * Two overlapping first requests with one key MUST run the handler once, and the second MUST
   * answer with the first one's stored response. When the first fails, a retry MUST run the handler.
   * A claim held past its 5-minute lease MAY be taken over by one request only, and the superseded
   * holder MUST NOT store a response into or delete the new holder's claim.
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
    const resourceType = segments[0] || 'unknown';
    const resourceId = (req.params && (req.params as any).id) || segments[1] || '-';
    const scope: Scope = { key: rawKey, userId: userId || '', resourceType, resourceId, method };

    return from(this.claim(scope)).pipe(
      mergeMap((claim) => {
        if (claim.kind === 'replay') {
          if (claim.statusCode && typeof res?.status === 'function') res.status(claim.statusCode);
          return of(claim.body);
        }
        if (claim.kind === 'open') return next.handle();
        return next.handle().pipe(
          concatMap(async (data) => {
            const statusCode =
              res && typeof res.statusCode === 'number' ? res.statusCode : method === 'POST' ? 201 : 200;
            await this.complete(scope, claim.lease, statusCode, data);
            return data;
          }),
          catchError((error) => from(this.release(scope, claim.lease)).pipe(mergeMap(() => throwError(() => error)))),
        );
      }),
    );
  }

  private async claim(scope: Scope): Promise<Claim> {
    let pause = 25;
    for (;;) {
      const lease = leaseEnd();
      try {
        await this.prisma.idempotencyRecord.create({
          data: { ...scope, statusCode: PENDING, responseBody: '', expiresAt: lease },
        });
        return { kind: 'owner', lease };
      } catch (error) {
        if ((error as any)?.code !== 'P2002') return this.failOpen('claim', error);
      }

      let existing;
      try {
        existing = await this.prisma.idempotencyRecord.findFirst({ where: scope });
      } catch (error) {
        return this.failOpen('read', error);
      }
      if (!existing) continue;

      if (existing.statusCode !== PENDING) {
        try {
          const body = existing.responseBody ? JSON.parse(existing.responseBody) : undefined;
          return { kind: 'replay', statusCode: existing.statusCode, body };
        } catch (error) {
          return this.failOpen('parse', error);
        }
      }

      if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
        try {
          const { count } = await this.prisma.idempotencyRecord.updateMany({
            where: { ...scope, statusCode: PENDING, expiresAt: existing.expiresAt },
            data: { expiresAt: lease },
          });
          if (count === 1) return { kind: 'owner', lease };
        } catch (error) {
          return this.failOpen('take over', error);
        }
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, pause));
      pause = Math.min(pause * 2, 1000);
    }
  }

  private async complete(scope: Scope, lease: Date, statusCode: number, data: unknown) {
    try {
      await this.prisma.idempotencyRecord.updateMany({
        where: { ...scope, statusCode: PENDING, expiresAt: lease },
        data: { statusCode, responseBody: JSON.stringify(data ?? null), expiresAt: null },
      });
    } catch (error) {
      this.failOpen('save', error);
      await this.release(scope, lease);
    }
  }

  private async release(scope: Scope, lease: Date) {
    try {
      await this.prisma.idempotencyRecord.deleteMany({ where: { ...scope, statusCode: PENDING, expiresAt: lease } });
    } catch (error) {
      this.failOpen('release', error);
    }
  }

  private failOpen(step: string, error: unknown): Claim {
    this.logger.warn(
      `Idempotency store ${step} failed; the write runs without replay protection: ${(error as any)?.code ?? (error as Error)?.name ?? 'unknown error'}`,
    );
    return { kind: 'open' };
  }
}
