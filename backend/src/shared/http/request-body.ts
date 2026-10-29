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
export function configureRequestBody(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT_BYTES });
}
