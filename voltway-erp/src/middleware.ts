import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/config';

const PUBLIC_PATHS = ['/login', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // Soft page gate: cookie presence. Real security is AuthGate + API token verify.
  if (!isPublic(pathname) && !pathname.startsWith('/_next') && !pathname.startsWith('/favicon')) {
    const hasAuthCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value === '1';
    const isApi = pathname.startsWith('/api/');

    if (!hasAuthCookie && !isApi) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      const res = NextResponse.redirect(loginUrl);
      res.headers.set('x-request-id', requestId);
      return res;
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
