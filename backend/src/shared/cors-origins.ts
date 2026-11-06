import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * @cc [owner:nareshshah139,label:security;target] cors-origins-own-frontend-only
 * Credentialed browser access MUST be limited to the clinic's own frontend origins. Today any
 * https *.railway.app host passes, so a site anyone deploys on Railway is a credentialed origin.
 * This is a target obligation, not a pass claim.
 */
export const ALLOWED_ORIGINS: RegExp[] = [
  /^http:\/\/localhost:(3000|3001|3002)$/,
  /^https:\/\/.*\.railway\.app$/,
  /^https:\/\/.*\.up\.railway\.app$/,
];

/**
 * @cc [owner:nareshshah139,label:security] cors-grant-only-listed-origins
 * Only an origin matching ALLOWED_ORIGINS MAY get Access-Control-Allow-Origin, and then with
 * credentials. Any other origin, including other localhost ports and plain http, MUST get no
 * CORS grant.
 */
export const CORS_OPTIONS: CorsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-Request-Attempt'],
  exposedHeaders: ['X-Request-Id', 'Retry-After'],
};
