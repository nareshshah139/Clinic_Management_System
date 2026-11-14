import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';

export const JSON_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

/**
 * @cc [owner:nareshshah139,label:observability] parser-installation-order
 * Call after HTTP observability is installed and before application initialization.
 */
/**
 * @cc [owner:nareshshah139,label:product] bounded-json-saves
 * Valid supported JSON bodies up to 5242880 decoded bytes retain their parsed values
 * for route validation. Larger bodies return 413 before handlers, including compressed
 * and chunked requests; the limit applies after decompression.
 */
/**
 * @cc [owner:nareshshah139,label:security] other-body-limits
 * URL-encoded parser defaults and multipart interceptor limits remain unchanged.
 */
/**
 * @cc [owner:nareshshah139,label:security] webhook-raw-body
 * POST /whatsapp/webhook MUST keep the exact request bytes on req.rawBody so its Meta signature can
 * be checked; no other route keeps a copy of its body.
 */
export function configureRequestBody(app: NestExpressApplication): void {
  app.useBodyParser('json', {
    limit: JSON_BODY_LIMIT_BYTES,
    verify: (
      req: IncomingMessage & { rawBody?: Buffer },
      _res: ServerResponse,
      body: Buffer,
    ) => {
      if (req.url?.split('?')[0] === '/whatsapp/webhook') req.rawBody = body;
    },
  });
}
