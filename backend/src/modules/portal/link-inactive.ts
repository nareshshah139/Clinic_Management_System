import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

/** The one body an unknown, expired or revoked token gets, byte for byte (PP-39). */
export const LINK_INACTIVE_BODY = JSON.stringify({ statusCode: 404, message: 'This link is no longer active. Please contact the clinic.' });

export class LinkInactive extends Error {}

/** Writes LINK_INACTIVE_BODY with no request id, so every inactive-link answer is identical. */
@Catch(LinkInactive)
export class LinkInactiveFilter implements ExceptionFilter {
  catch(_: LinkInactive, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(HttpStatus.NOT_FOUND).setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(LINK_INACTIVE_BODY);
  }
}
