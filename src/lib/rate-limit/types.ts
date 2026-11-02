/**
 * Rate limiting types and configuration.
 */

export type RateLimitResult =
  | { readonly allowed: true; readonly remaining: number; readonly resetAt: Date }
  | { readonly allowed: false; readonly retryAfter: number };

export type RateLimitConfig = {
  readonly enabled: boolean;
  readonly maxRequests: number;
  readonly windowSeconds: number;
  readonly bypassToken: string | null;
};

export type RateLimitStore = {
  check(ip: string, now: number): RateLimitResult;
  cleanup(now: number): void;
  reset(): void;
  readonly size: number;
};

export type ClientInfo = {
  readonly ip: string;
  readonly userAgent: string | null;
};
