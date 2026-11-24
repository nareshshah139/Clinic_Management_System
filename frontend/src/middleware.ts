import { NextRequest, NextResponse } from 'next/server';
import { paletteScriptHash, portalCsp } from '@/lib/portal/csp';

async function portal(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = portalCsp(nonce, await paletteScriptHash(), process.env.NODE_ENV !== 'production');
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/p' || pathname.startsWith('/p/')) return portal(req);

  // OAuth providers redirect back without sending SameSite=Strict cookies on the
  // initial cross-site navigation. Let the client callback page load so it can
  // exchange the code with the existing same-site session.
  if (pathname === '/dashboard/appointments/google-callback') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/dashboard')) {
    const token = req.cookies.get('auth_token')?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      // Preserve full path with query so we return exactly where user intended
      const original = req.nextUrl.pathname + (req.nextUrl.search || '');
      url.searchParams.set('next', original);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/p/:path*'],
};
