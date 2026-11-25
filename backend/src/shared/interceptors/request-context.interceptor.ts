import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { AuditActorKind, RequestContextService } from '../context/request-context.service';

/** Who a request acts for, by the route it reached: a task link, the portal, the WhatsApp webhook, staff, or nobody. */
export function actorKindOf(path: string, userId: string | null): AuditActorKind {
  const route = path.split('?')[0].replace(/^\/api(?=\/)/, '');
  if (/^\/internal\/portal\/task(\/|$)/.test(route)) return 'task link';
  if (/^\/internal\/portal(\/|$)/.test(route)) return 'portal';
  if (/^\/webhooks\/whatsapp(\/|$)/.test(route)) return 'webhook';
  return userId ? 'staff' : 'system';
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContext: RequestContextService) {}

  /**
   * @cc [owner:nareshshah139,label:observability] deferred-request-context
   * Deferred handler subscriptions and their async work MUST retain this request's
   * audit identity without leaking it to concurrent requests; cancellation unsubscribes the handler.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();

    // Extract metadata
    const userId = (req as any)?.user?.userId ?? (req as any)?.user?.id ?? null;
    const xff = (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim();
    const ipAddress = xff || (req as any).ip || null;
    const userAgent = (req.headers['user-agent'] as string | undefined) || null;

    return new Observable((subscriber) => {
      return this.requestContext.run(
        {
          userId,
          actorKind: actorKindOf(req.originalUrl ?? req.url ?? '', userId),
          ipAddress,
          userAgent,
          branchId: (req as any)?.user?.branchId ?? null,
        },
        () => next.handle().subscribe(subscriber),
      );
    });
  }
}
