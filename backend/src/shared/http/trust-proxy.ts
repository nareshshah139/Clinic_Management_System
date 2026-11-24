import type { NestExpressApplication } from '@nestjs/platform-express';

export const DEFAULT_TRUST_PROXY_HOPS = 1;

/**
 * @cc [owner:nareshshah139,label:security] trust-known-proxy-hops
 * req.ip MUST be the address the outermost trusted proxy saw: Express trusts exactly
 * TRUST_PROXY_HOPS proxies (default 1, the platform edge), so X-Forwarded-For entries a client
 * adds itself never become req.ip. An unusable value falls back to the default. A recorded IP is
 * a hint for audit and throttling, never an access control.
 */
export function trustProxyHops(configured = process.env.TRUST_PROXY_HOPS): number {
  const hops = Number(configured);
  return configured?.trim() && Number.isInteger(hops) && hops >= 0 && hops <= 10 ? hops : DEFAULT_TRUST_PROXY_HOPS;
}

export function configureTrustProxy(app: NestExpressApplication): void {
  app.set('trust proxy', trustProxyHops());
}
