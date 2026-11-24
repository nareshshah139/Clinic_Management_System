import { portalCsp } from '@/lib/portal/csp';
import { fitWithin } from '@/lib/portal/compress';
import { takeTokenFromFragment } from '@/lib/portal/client';

describe('portal helpers', () => {
  it('allows scripts only from the portal origin (PP-91)', () => {
    const csp = portalCsp('n0nce', "'sha256-abc='", false);
    const script = csp.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(script).toBe("script-src 'self' 'nonce-n0nce' 'sha256-abc='");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/unsafe-inline'[^;]*;?\s*$|https?:|\*/);
    expect(portalCsp('n', "'sha256-x'", true)).toContain("'unsafe-eval'");
  });

  it('plans a browser-side resize to a 1600 px long edge without enlarging', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(900, 1800)).toEqual({ width: 800, height: 1600 });
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('reads the fragment once and removes it from history', () => {
    const replaceState = jest.fn();
    const token = takeTokenFromFragment({ location: { hash: '#tok', pathname: '/p/t', search: '' }, history: { replaceState } } as any);
    expect(token).toBe('tok');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/p/t');
  });
});
