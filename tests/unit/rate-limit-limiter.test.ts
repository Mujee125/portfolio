import { describe, it, expect } from 'vitest';
import { createRateLimitStore } from '@/lib/rate-limit';

describe('createRateLimitStore', () => {
  it('allows requests when under the limit', () => {
    const config = { enabled: true, maxRequests: 5, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    const result = store.check('127.0.0.1', now);
    if (result.allowed) {
      expect(result.remaining).toBe(4);
    } else {
      expect.fail('Request should be allowed');
    }
  });

  it('rejects requests when limit is exceeded', () => {
    const config = { enabled: true, maxRequests: 2, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    // First request
    store.check('127.0.0.1', now);
    // Second request
    store.check('127.0.0.1', now);
    // Third request should be rejected
    const result = store.check('127.0.0.1', now);

    if (!result.allowed) {
      expect(result.retryAfter).toBeGreaterThan(0);
    } else {
      expect.fail('Request should be rejected');
    }
  });

  it('resets limit after window expires', () => {
    const config = { enabled: true, maxRequests: 2, windowSeconds: 1, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    // Exhaust limit
    store.check('127.0.0.1', now);
    store.check('127.0.0.1', now);

    // Should be rejected
    let result = store.check('127.0.0.1', now);
    expect(result.allowed).toBe(false);

    // After window expires
    const future = now + 1100; // 1.1 seconds later
    result = store.check('127.0.0.1', future);
    expect(result.allowed).toBe(true);
  });

  it('tracks different IPs independently', () => {
    const config = { enabled: true, maxRequests: 2, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    // Exhaust limit for IP1
    store.check('127.0.0.1', now);
    store.check('127.0.0.1', now);

    // IP2 should still be allowed
    const result = store.check('192.168.1.1', now);
    expect(result.allowed).toBe(true);
  });

  it('allows unlimited requests when disabled', () => {
    const config = { enabled: false, maxRequests: 2, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    // Make more requests than the limit
    for (let i = 0; i < 10; i++) {
      const result = store.check('127.0.0.1', now);
      expect(result.allowed).toBe(true);
    }
  });

  it('calculates correct remaining count', () => {
    const config = { enabled: true, maxRequests: 10, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    const r1 = store.check('127.0.0.1', now);
    if (r1.allowed) {
      expect(r1.remaining).toBe(9);
    } else {
      expect.fail('Request should be allowed');
    }

    const r2 = store.check('127.0.0.1', now);
    if (r2.allowed) {
      expect(r2.remaining).toBe(8);
    } else {
      expect.fail('Request should be allowed');
    }

    const r3 = store.check('127.0.0.1', now);
    if (r3.allowed) {
      expect(r3.remaining).toBe(7);
    } else {
      expect.fail('Request should be allowed');
    }
  });

  it('returns Infinity remaining when disabled', () => {
    const config = { enabled: false, maxRequests: 10, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    const result = store.check('127.0.0.1', now);
    if (result.allowed) {
      expect(result.remaining).toBe(Infinity);
    } else {
      expect.fail('Request should be allowed when disabled');
    }
  });

  it('cleans up old entries', () => {
    const config = { enabled: true, maxRequests: 10, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    // Add requests for multiple IPs
    for (let i = 0; i < 5; i++) {
      store.check(`10.0.0.${i}`, now);
    }

    expect(store.size).toBe(5);

    // Cleanup after window + grace period expires (60s window + 10s grace)
    store.cleanup(now + 71000);
    expect(store.size).toBe(0);
  });

  it('resets the store', () => {
    const config = { enabled: true, maxRequests: 2, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    // Exhaust limit
    store.check('127.0.0.1', now);
    store.check('127.0.0.1', now);

    // Reset
    store.reset();

    // Should be allowed again
    const result = store.check('127.0.0.1', now);
    expect(result.allowed).toBe(true);
  });

  it('handles cleanup gracefully when store is empty', () => {
    const config = { enabled: true, maxRequests: 10, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    expect(() => store.cleanup(now)).not.toThrow();
  });

  it('calculates correct retry-after time', () => {
    const config = { enabled: true, maxRequests: 2, windowSeconds: 60, bypassToken: null };
    const store = createRateLimitStore(config);
    const now = Date.now();

    // Exhaust limit
    store.check('127.0.0.1', now);
    store.check('127.0.0.1', now);

    const result = store.check('127.0.0.1', now);
    if (!result.allowed) {
      // Retry-after should be less than the full window since we just made requests
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    } else {
      expect.fail('Request should be rejected');
    }
  });
});
