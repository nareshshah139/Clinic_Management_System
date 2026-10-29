import type { NestExpressApplication } from '@nestjs/platform-express';

export const JSON_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

/**
 * @cc [owner:nareshshah139,label:observability] parser-installation-order
 * Call after HTTP observability is installed and before application initialization.
 */
export function configureRequestBody(app: NestExpressApplication): void {
  app.useBodyParser('json');
}
