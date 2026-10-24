import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { getInventoryService } from '@/lib/github';

export const dynamic = 'force-dynamic';

/**
 * Operational check. Reports whether *this instance* holds a trustworthy snapshot.
 * Never echoes environment values, tokens or upstream bodies.
 */
export async function GET() {
  const config = getConfig();
  const service = getInventoryService();
  const snapshot = service.peek();
  const failure = service.lastFailure();

  const cacheState = snapshot === null ? 'empty' : failure === null ? 'fresh' : 'stale';
  const healthy = snapshot !== null && failure === null;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        config: 'ok',
        github: failure === null ? 'ok' : failure.kind,
        cache: cacheState,
      },
      snapshot:
        snapshot === null
          ? null
          : {
              generatedAt: snapshot.generatedAt.toISOString(),
              cacheAgeSeconds: snapshot.ageSeconds,
              repositoryCount: snapshot.repositoryCount,
              truncated: snapshot.truncated,
              skippedItems: snapshot.skippedItems,
            },
      rateLimit: snapshot?.rateLimit
        ? {
            limit: snapshot.rateLimit.limit,
            remaining: snapshot.rateLimit.remaining,
            resetAt: snapshot.rateLimit.resetAt?.toISOString() ?? null,
          }
        : null,
      upstream: {
        username: config.profile.username,
        apiBaseUrl: config.github.apiBaseUrl,
        cacheTtlSeconds: config.repos.cacheTtlSeconds,
        authenticated: config.github.token !== null,
      },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
