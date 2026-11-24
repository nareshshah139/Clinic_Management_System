import { PALETTE_BOOT_SCRIPT } from '@/lib/palette';

let paletteHash: Promise<string> | null = null;

/** The CSP source for the root layout's palette boot script, the only inline script not nonced. */
export function paletteScriptHash(): Promise<string> {
  paletteHash ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(PALETTE_BOOT_SCRIPT)).then((d) => {
    let bin = '';
    for (const b of new Uint8Array(d)) bin += String.fromCharCode(b);
    return `'sha256-${btoa(bin)}'`;
  });
  return paletteHash;
}

/**
 * @cc [owner:nareshshah139,label:security] portal-csp
 * Portal pages under /p MUST be served with a CSP whose script-src allows only the portal's own
 * origin ('self', this response's nonce and the palette script's hash; no host, no unsafe-inline),
 * connect-src 'self', and Referrer-Policy: no-referrer (PP-91, PP-36).
 */
export function portalCsp(nonce: string, palette: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${palette}${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
