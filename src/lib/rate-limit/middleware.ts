import { NextResponse, type NextRequest } from 'next/server';
import type { RateLimitConfig } from './types';
import { createRateLimitStore } from './limiter';

/**
 * Extract client IP from request.
 *
 * Prefers Next.js's `request.ip` (available in Edge Runtime with trusted proxy),
 * falls back to X-Forwarded-For header (first IP), then X-Real-IP.
 */
function extractClientIp(request: NextRequest): string {
  const ip = (request as unknown as { ip?: string }).ip;
  if (ip) {
    return ip;
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP (the original client, not proxies)
    const firstIp = forwardedFor.split(',')[0];
    if (firstIp) {
      return firstIp.trim();
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to user agent hash if no IP found
  const userAgent = request.headers.get('user-agent') ?? 'unknown';
  return `fallback-${hashUserAgent(userAgent)}`;
}

function hashUserAgent(userAgent: string): string {
  let hash = 0;
  for (let i = 0; i < userAgent.length; i++) {
    const char = userAgent.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Check if request should bypass rate limiting.
 */
function shouldBypass(request: NextRequest, bypassToken: string | null): boolean {
  if (!bypassToken) return false;

  const providedToken = request.headers.get('x-rate-limit-bypass');
  return providedToken === bypassToken;
}

/**
 * Rate limiting middleware for API routes.
 *
 * Only applies to `/api/*` paths. Returns 429 when rate limited.
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const store = createRateLimitStore(config);

  // Expose store globally for testing
  (globalThis as Record<string, unknown>).__rateLimitStore = store;

  return function rateLimitMiddleware(request: NextRequest): NextResponse | null {
    // Only rate limit API routes
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      return null;
    }

    // Health endpoint is excluded (important for monitoring)
    if (request.nextUrl.pathname === '/api/health') {
      return null;
    }

    // Check bypass token
    if (shouldBypass(request, config.bypassToken)) {
      return null;
    }

    const ip = extractClientIp(request);
    const now = Date.now();
    const result = store.check(ip, now);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'rate_limited',
            message: 'Too many requests. Please retry later.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfter),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil((now + config.windowSeconds * 1000) / 1000)),
          },
        },
      );
    }

    // Allow request to proceed, but inject rate limit headers
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt.getTime() / 1000)));

    return null; // Continue to next middleware/route handler
  };
}

/**
 * Test helper: get the store for direct inspection.
 */
export function getRateLimitStore() {
  return (globalThis as Record<string, unknown>).__rateLimitStore as ReturnType<typeof createRateLimitStore> | undefined;
}
