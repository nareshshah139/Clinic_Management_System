import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();

    // Extract metadata
    const userId = (req as any)?.user?.userId ?? (req as any)?.user?.id ?? null;
    const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const ipAddress = xff || (req as any).ip || null;
    const userAgent = (req.headers['user-agent'] as string | undefined) || null;

    let stream!: Observable<any>;
    this.requestContext.run({ userId, ipAddress, userAgent }, () => {
      stream = next.handle();
    });
    return stream;
  }
} 