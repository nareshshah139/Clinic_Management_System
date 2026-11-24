import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const LOCAL_FRONTEND_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];

/**
 * @cc [owner:nareshshah139,label:security] cors-origins-own-frontend-only
 * Credentialed browser access MUST be limited to the clinic's own frontend origins: the local
 * development ports and each exact https origin listed in CORS_ALLOWED_ORIGINS (comma separated).
 * No pattern or wildcard MAY grant an origin; an entry that is not a bare https origin is ignored.
 */
export function allowedOrigins(configured = process.env.CORS_ALLOWED_ORIGINS): Set<string> {
  const exact = (configured ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => {
      try {
        const url = new URL(entry);
        return url.protocol === 'https:' && url.origin === entry && /^[a-z0-9.-]+$/.test(url.hostname);
      } catch {
        return false;
      }
    });
  return new Set([...LOCAL_FRONTEND_ORIGINS, ...exact]);
}

/**
 * @cc [owner:nareshshah139,label:security] cors-grant-only-listed-origins
 * Only an origin in allowedOrigins() MAY get Access-Control-Allow-Origin, and then with
 * credentials. Any other origin, including other localhost ports, plain http and other Railway
 * hosts, MUST get no CORS grant.
 */
export const CORS_OPTIONS: CorsOptions = {
  origin: (origin, done) => done(null, !!origin && allowedOrigins().has(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-Request-Attempt'],
  exposedHeaders: ['X-Request-Id', 'Retry-After'],
};
