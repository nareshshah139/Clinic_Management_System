import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

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


