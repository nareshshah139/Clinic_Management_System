import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  matcher: ['/dashboard/:path*'],
}; 
