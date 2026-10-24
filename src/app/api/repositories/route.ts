import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { getRepositoryInventory } from '@/lib/github';
import type { Repository } from '@/lib/github/types';
import { apiQuerySchema } from '@/lib/repos/params';
import { runQuery, type RepositoryQuery } from '@/lib/repos/query';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' };
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Machine-readable repository inventory.
 * Invalid input is a client error (400) — never a silent default — and upstream
 * failures are 502/503 with a safe message and no upstream body.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) raw[key] = value;

  const parsed = apiQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'invalid_query',
          message: 'Invalid query parameters',
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.') || '(root)',
            message: issue.message,
          })),
        },
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const config = getConfig();
  const { inventory, failure } = await getRepositoryInventory();

  if (inventory === null) {
    const rateLimited = failure?.kind === 'rate_limited';
    const headers: Record<string, string> = { ...NO_STORE };
    if (rateLimited && failure?.retryAt) {
      headers['Retry-After'] = String(Math.max(1, Math.ceil((failure.retryAt.getTime() - Date.now()) / 1000)));
    }
    return NextResponse.json(
      {
        error: {
          code: rateLimited ? 'github_rate_limited' : 'github_unavailable',
          message: rateLimited ? 'GitHub rate limit reached' : 'GitHub data is temporarily unavailable',
          ...(rateLimited && failure?.retryAt ? { retryAt: failure.retryAt.toISOString() } : {}),
        },
      },
      { status: rateLimited ? 503 : 502, headers },
    );
  }

  const repos: readonly Repository[] = parsed.data.includeArchived
    ? inventory.repos
    : inventory.repos.filter((repo) => !repo.archived);

  const query: RepositoryQuery = {
    q: parsed.data.q,
    language: parsed.data.language?.trim() ?? null,
    topic: parsed.data.topic?.trim() ?? null,
    sort: parsed.data.sort,
  };
  const outcome = runQuery(repos, config.repos, query);

  return NextResponse.json(
    {
      meta: {
        username: config.profile.username,
        generatedAt: inventory.generatedAt.toISOString(),
        cacheAgeSeconds: inventory.ageSeconds,
        stale: inventory.stale,
        truncated: inventory.truncated,
        skippedItems: inventory.skippedItems,
        rateLimit: inventory.rateLimit
          ? {
              limit: inventory.rateLimit.limit,
              remaining: inventory.rateLimit.remaining,
              resetAt: inventory.rateLimit.resetAt?.toISOString() ?? null,
            }
          : null,
        totalMatched: outcome.matches.length,
        totalEligible: repos.length,
      },
      data: outcome.matches.map((repo) => ({
        name: repo.name,
        fullName: repo.fullName,
        description: repo.description,
        url: repo.url,
        homepage: repo.homepage,
        language: repo.language,
        topics: repo.topics,
        stars: repo.stars,
        forks: repo.forks,
        archived: repo.archived,
        license: repo.license,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
        pushedAt: repo.pushedAt,
      })),
    },
    { status: 200, headers: CACHE_HEADERS },
  );
}
