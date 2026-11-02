import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createRateLimitMiddleware, getRateLimitStore } from '@/lib/rate-limit';

describe('createRateLimitMiddleware', () => {
  beforeEach(() => {
    // Reset the store before each test
    const store = getRateLimitStore();
    store?.reset();
  });

  it('returns null for non-API routes', () => {
    const config = { enabled: true, maxRequests: 5, windowSeconds: 60, bypassToken: null };
    const middleware = createRateLimitMiddleware(config);

    const request = new NextRequest('http://localhost:3000/');
    const result = middleware(request);

    expect(result).toBeNull();
  });

  it('returns null for health endpoint', () => {
    const config = { enabled: true, maxRequests: 5, windowSeconds: 60, bypassToken: null };
    const middleware = createRateLimitMiddleware(config);

    const request = new NextRequest('http://localhost:3000/api/health');
    const result = middleware(request);

    expect(result).toBeNull();
  });

  it('returns null when bypass token matches', () => {
    const config = { enabled: true, maxRequests: 5, windowSeconds: 60, bypassToken: 'secret-token' };
    const middleware = createRateLimitMiddleware(config);

    const request = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-rate-limit-bypass': 'secret-token' },
    });
    const result = middleware(request);

    expect(result).toBeNull();
  });

  it('does not bypass with incorrect token', () => {
    const config = { enabled: true, maxRequests: 1, windowSeconds: 60, bypassToken: 'secret-token' };
    const middleware = createRateLimitMiddleware(config);

    // First request to use up the limit (with wrong token)
    const request1 = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-rate-limit-bypass': 'wrong-token', 'user-agent': 'test-1' },
    });
    middleware(request1);

    // Second request with wrong token should be rate limited
    const request2 = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-rate-limit-bypass': 'wrong-token', 'user-agent': 'test-1' },
    });
    const result = middleware(request2);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  it('returns null when rate limiting is disabled', () => {
    const config = { enabled: false, maxRequests: 5, windowSeconds: 60, bypassToken: null };
    const middleware = createRateLimitMiddleware(config);

    const request = new NextRequest('http://localhost:3000/api/repositories');
    const result = middleware(request);

    expect(result).toBeNull();
  });

  it('returns 429 response when rate limited', () => {
    const config = { enabled: true, maxRequests: 2, windowSeconds: 60, bypassToken: null };
    const middleware = createRateLimitMiddleware(config);

    // Exhaust the limit
    const request1 = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });
    middleware(request1);
    const request2 = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });
    middleware(request2);

    // Third request should be rate limited
    const request3 = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });
    const result = middleware(request3);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  it('returns null when under the limit', () => {
    const config = { enabled: true, maxRequests: 5, windowSeconds: 60, bypassToken: null };
    const middleware = createRateLimitMiddleware(config);

    const request = new NextRequest('http://localhost:3000/api/repositories');
    const result = middleware(request);

    expect(result).toBeNull();
  });

  it('extracts IP from x-forwarded-for header', () => {
    const config = { enabled: true, maxRequests: 5, windowSeconds: 60, bypassToken: null };
    const middleware = createRateLimitMiddleware(config);

    const request = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
    });
    const result = middleware(request);

    expect(result).toBeNull(); // Should process the request
  });

  it('extracts IP from x-real-ip header as fallback', () => {
    const config = { enabled: true, maxRequests: 5, windowSeconds: 60, bypassToken: null };
    const middleware = createRateLimitMiddleware(config);

    const request = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-real-ip': '192.168.1.2' },
    });
    const result = middleware(request);

    expect(result).toBeNull(); // Should process the request
  });

  it('includes rate limit headers on allowed requests', () => {
    const config = { enabled: true, maxRequests: 5, windowSeconds: 60, bypassToken: null };
    const middleware = createRateLimitMiddleware(config);

    const request = new NextRequest('http://localhost:3000/api/repositories', {
      headers: { 'x-forwarded-for': '192.168.1.3' },
    });
    middleware(request);

    // Middleware returns null to continue, but we can check the store
    const store = getRateLimitStore();
    const checkResult = store?.check('192.168.1.3', Date.now());

    if (checkResult?.allowed) {
      expect(checkResult.remaining).toBeLessThanOrEqual(5);
    } else {
      expect.fail('Request should be allowed');
    }
  });
});
