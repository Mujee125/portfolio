import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request Content-Security-Policy with a nonce (ADR-0007).
 *
 * Next.js reads the CSP from the *request* headers and stamps the nonce onto the
 * inline scripts it emits for hydration, so no `'unsafe-inline'` is needed for
 * scripts. `style-src` keeps `'unsafe-inline'` because the framework inlines
 * critical CSS and there is no user-controlled CSS anywhere in the app.
 */
function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  const connectSrc = [`'self'`];
  if (isDev) {
    scriptSrc.push(`'unsafe-eval'`);
    connectSrc.push('ws:', 'wss:');
  }

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc.join(' ')}`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join('; ');
}

export default function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = buildCsp(nonce, process.env.NODE_ENV !== 'production');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except Next.js build assets and generated images: those are static
    // and safe, and skipping them avoids per-asset overhead.
    '/((?!_next/static|_next/image|icon.svg|opengraph-image).*)',
  ],
};
