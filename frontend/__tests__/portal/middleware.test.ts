/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { config, middleware } from '@/middleware';

const req = (path: string, cookie?: string) => new NextRequest(new URL(path, 'https://clinic.example'), { headers: cookie ? { cookie } : {} });
const PORTAL = '__Host-portal_session=opaque-portal-token';

describe('frontend guard: /p and /dashboard stay apart', () => {
  it('matches both trees', () => {
    expect(config.matcher).toEqual(expect.arrayContaining(['/dashboard/:path*', '/p/:path*']));
  });

  it('a portal cookie never opens /dashboard: it is sent to staff sign-in', async () => {
    const res = await middleware(req('/dashboard/patients', PORTAL));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
  });

  it.each(['/p', '/p/records'])('%s is served with the portal CSP, no-referrer and no-store whatever cookie comes with it', async (path) => {
    for (const cookie of [undefined, PORTAL, 'auth_token=staff.jwt']) {
      const res = await middleware(req(path, cookie));
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('Content-Security-Policy')).toMatch(/script-src 'self' 'nonce-[^']+'/);
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });
});
