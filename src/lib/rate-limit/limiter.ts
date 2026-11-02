import type { RateLimitConfig, RateLimitResult, RateLimitStore } from './types';

/**
 * In-memory sliding window rate limiter.
 *
 * Compatible with serverless environments: each instance maintains its own store.
 * Cleanup is automatic to prevent unbounded memory growth.
 */
export function createRateLimitStore(config: RateLimitConfig): RateLimitStore {
  const store = new Map<string, number[]>();
  const windowMs = config.windowSeconds * 1000;
  const cleanupGraceMs = 10_000; // Keep entries for 10s past window for accurate window edges

  function cleanup(now: number): void {
    const cutoff = now - windowMs - cleanupGraceMs;
    for (const [ip, timestamps] of store.entries()) {
      const filtered = timestamps.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        store.delete(ip);
      } else if (filtered.length < timestamps.length) {
        store.set(ip, filtered);
      }
    }
  }

  return {
    check(ip: string, now: number): RateLimitResult {
      if (!config.enabled) {
        return { allowed: true, remaining: Infinity, resetAt: new Date(now + windowMs) };
      }

      // Periodic cleanup to prevent unbounded growth
      if (store.size > 1000) {
        cleanup(now);
      }

      const timestamps = store.get(ip) ?? [];
      const cutoff = now - windowMs;

      // Remove requests outside the current window
      const inWindow = timestamps.filter((t) => t > cutoff);

      if (inWindow.length >= config.maxRequests) {
        // Rate limited: calculate when the oldest request in window expires
        const oldest = inWindow[0];
        if (!oldest) {
          return { allowed: false, retryAfter: config.windowSeconds };
        }
        const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
        return { allowed: false, retryAfter };
      }

      // Allow request: record timestamp
      inWindow.push(now);
      store.set(ip, inWindow);

      const remaining = config.maxRequests - inWindow.length;
      const resetAt = new Date(now + windowMs);

      return { allowed: true, remaining, resetAt };
    },

    cleanup(now: number): void {
      cleanup(now);
    },

    reset(): void {
      store.clear();
    },

    get size(): number {
      return store.size;
    },
  };
}
