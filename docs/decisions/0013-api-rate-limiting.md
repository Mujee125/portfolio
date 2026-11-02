# ADR-0013: API Rate Limiting Implementation

## Status
Proposed

## Context
The `/api/repositories` endpoint currently has no rate limiting. While upstream GitHub API has rate limits, our own API endpoint can be abused to exhaust GitHub quota through automated attacks. This is a security gap identified in the security audit.

## Decision
Implement IP-based rate limiting using a sliding window algorithm in the middleware layer.

## Architecture

### Storage Strategy
- **Primary**: In-memory Map (compatible with serverless environments)
- **Fallback**: No external cache (to avoid complexity and cost for this use case)
- **Rationale**: 
  - Serverless instances have short lifetimes (minutes to hours)
  - Rate limiting per instance is sufficient to prevent abuse
  - Adding Redis would introduce cost and operational complexity
  - If a user hits multiple instances, they'd need to distribute load across many instances to bypass limits, which is unlikely for this threat model

### Rate Limiting Algorithm
- **Algorithm**: Sliding window with cleanup
- **Window size**: 60 seconds (configurable)
- **Max requests**: 100 per window (configurable)
- **Cleanup**: Remove entries older than window size + 10s grace period

### Integration Point
- **Location**: `src/proxy.ts` (Next.js middleware)
- **Scope**: Only `/api/*` routes
- **Rationale**: 
  - Middleware runs before route handlers
  - Can reject requests early without executing route logic
  - Already exists for CSP handling

### Bypass Mechanism
- **Environment variable**: `RATE_LIMIT_BYPASS_TOKEN` (optional)
- **Header**: `X-Rate-Limit-Bypass` with matching token
- **Rationale**: Allows trusted monitoring services (uptime checks, load balancers) to bypass limits

### Response Headers
- `X-RateLimit-Limit`: Max requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when window resets
- `Retry-After`: Seconds to wait when 429 returned

## Configuration

### Environment Variables
```bash
# OPTIONAL — API rate limiting (defaults shown)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_BYPASS_TOKEN=  # Optional: token to bypass rate limiting
```

### Health Endpoint Enhancement
Add rate limit status to `/api/health`:
```json
{
  "checks": {
    "rateLimit": {
      "status": "ok",
      "active": true,
      "windowSeconds": 60,
      "maxRequests": 100
    }
  }
}
```

## Implementation Details

### Module Structure
```
src/lib/rate-limit/
├── index.ts          # Public API
├── limiter.ts        # Sliding window implementation
├── middleware.ts     # Next.js middleware integration
└── types.ts          # TypeScript types
```

### Key Types
```typescript
type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: Date }
  | { allowed: false; retryAfter: number };

type RateLimitConfig = {
  enabled: boolean;
  maxRequests: number;
  windowSeconds: number;
  bypassToken: string | null;
};
```

### Algorithm Pseudocode
```typescript
function checkRateLimit(ip: string, config: RateLimitConfig): RateLimitResult {
  if (!config.enabled) return { allowed: true, remaining: Infinity, resetAt: now() };

  const window = getWindow(ip);
  const now = Date.now();
  const cutoff = now - (config.windowSeconds * 1000);

  // Remove old requests
  window.requests = window.requests.filter(t => t > cutoff);

  if (window.requests.length >= config.maxRequests) {
    const oldest = window.requests[0];
    const retryAfter = Math.ceil((oldest + config.windowSeconds * 1000 - now) / 1000);
    return { allowed: false, retryAfter };
  }

  window.requests.push(now);
  return { allowed: true, remaining: config.maxRequests - window.requests.length, resetAt: now + config.windowSeconds * 1000 };
}
```

## Testing Strategy

### Unit Tests
- Test sliding window algorithm with various request patterns
- Test cleanup of old entries
- Test bypass token validation
- Test configuration parsing

### Integration Tests
- Test middleware integration with API routes
- Test 429 response with Retry-After header
- Test response headers (X-RateLimit-*)
- Test health endpoint rate limit status

### E2E Tests
- Test that rate limit is enforced under load
- Test that legitimate traffic passes through
- Test that bypass header works
- Test that limits reset after window expires

## Security Considerations

### IP Address Extraction
- Use `request.ip` from Next.js (falls back to headers for proxies)
- Handle X-Forwarded-For with trust configuration
- Fall back to header-based IP if request.ip is unavailable

### Attack Vectors Mitigated
- **Brute force API exhaustion**: Limited to 100 req/min per IP
- **Distributed attack**: Each attacker's IP is tracked separately
- **Cache pollution**: In-memory store is per-instance, so attacks don't persist across instances

### Limitations
- **Serverless instances**: Rate limit is per-instance, not global
  - Mitigation: Each instance independently limits abuse
  - Acceptable because attacker would need to hit many instances simultaneously
- **IP spoofing**: Trusted reverse proxy should set real IP
  - Mitigation: Configure trust proxy in production
- **IPv6 /24**: Not grouping by subnet (simpler implementation)
  - Mitigation: IPv6 exhaustion is unlikely for this threat model

## Alternatives Considered

### Redis-based Global Rate Limiting
**Pros**: Global limit across all instances
**Cons**: Cost, complexity, external dependency
**Decision**: Rejected - overkill for this threat model

### Token-based Rate Limiting
**Pros**: More precise, doesn't rely on IP
**Cons**: Requires authentication, breaks public API
**Decision**: Rejected - API is intentionally public and unauthenticated

### Cloudflare/Vercel Edge Config
**Pros**: Edge-level rate limiting, no code changes
**Cons**: Platform-specific, not portable
**Decision**: Rejected - want platform-agnostic solution

## Migration Plan

1. Implement rate limiter module
2. Add configuration to config.ts
3. Integrate into middleware
4. Add tests
5. Update documentation
6. Deploy with rate limiting **disabled by default** for gradual rollout
7. Enable in production after monitoring

## Success Criteria
- [ ] Rate limiting prevents abuse (>100 req/min from single IP)
- [ ] Legitimate traffic is not blocked under normal usage
- [ ] Bypass mechanism works for monitoring services
- [ ] Health endpoint reports rate limit status
- [ ] No performance degradation from rate limiting checks
- [ ] Documentation is clear on configuration

## Open Questions
1. Should we rate limit health endpoint? (Decision: No, it's read-only and important for monitoring)
2. Should we group IPv6 by /24 subnet? (Decision: No, simpler implementation, unlikely attack vector)
3. Should we expose rate limit status in health endpoint even when disabled? (Decision: Yes, for observability)
