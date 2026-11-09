import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { PrismaService } from '../database/prisma.service';

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
   * @cc [owner:nareshshah139,label:integrity;target] idempotency-concurrent-first-requests
   * Two overlapping first requests with one key MUST run the handler once. Today both miss the store
   * before either response is saved, so a client retry during a slow save can write twice.
   * This is a target obligation, not a pass claim.
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

    // Return cached response if found
    return new Observable((subscriber) => {
      (async () => {
        try {
          const existing = await this.prisma.idempotencyRecord.findFirst({
            where: {
              key: rawKey,
              userId: userId || '',
              resourceType,
              resourceId,
              method,
            },
          });
          if (existing) {
            try {
              if (existing.statusCode && typeof res?.status === 'function') {
                res.status(existing.statusCode);
              }
              const body = existing.responseBody ? JSON.parse(existing.responseBody) : undefined;
              subscriber.next(body);
              subscriber.complete();
              return;
            } catch {
              // fall through to normal handler if parsing fails
            }
          }
        } catch {
          // On DB error, proceed without idempotency to avoid blocking request
        }

        // No existing record; proceed and persist the response for future duplicates
        const stream = next.handle().pipe(
          tap(async (data) => {
            try {
              const toStore = {
                key: rawKey,
                userId: userId || '',
                resourceType,
                resourceId,
                method,
                statusCode: (res && typeof res.statusCode === 'number') ? res.statusCode : (method === 'POST' ? 201 : 200),
                responseBody: JSON.stringify(data ?? null),
                // Optional TTL support - not enforced here, but available for cleanup jobs
                expiresAt: null as Date | null,
              };
              await this.prisma.idempotencyRecord.create({ data: toStore });
            } catch {
              // Swallow errors - idempotency should not break main flow
            }
          }),
        );

        stream.subscribe({
          next: (val) => subscriber.next(val),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      })();
    });
  }
}


