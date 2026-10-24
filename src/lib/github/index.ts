import { cache } from 'react';
import { getConfig, type AppConfig } from '../config';
import { logEvent, type Logger } from '../log';
import { applyInclusionPolicy } from '../repos/query';
import { createSnapshotCache } from './cache';
import { fetchRepositoryPage, type ClientDeps } from './client';
import { GitHubError, toFailure, type Failure } from './errors';
import { mapRepository } from './mapper';
import type { GitHubRepository } from './schema';
import type { Inventory, RateLimitSnapshot, Repository, RepositorySnapshot } from './types';

/**
 * The single public entry point of the GitHub integration.
 *
 * Contract: never throws for an upstream failure. Returns either an inventory
 * (possibly marked `stale`) or a failure with a safe message, so every caller is
 * forced to handle the unhappy path instead of rendering an empty page that looks
 * like a complete inventory.
 */

export type SnapshotInfo = {
  readonly generatedAt: Date;
  readonly ageSeconds: number;
  readonly repositoryCount: number;
  readonly stale: boolean;
  readonly truncated: boolean;
  readonly skippedItems: number;
  readonly rateLimit: RateLimitSnapshot | null;
};

export type InventoryResult = {
  /** Present whenever any snapshot exists (fresh or stale). */
  readonly inventory: Inventory | null;
  /** Present whenever the most recent refresh failed. */
  readonly failure: Failure | null;
};

export type InventoryService = {
  getInventory(): Promise<InventoryResult>;
  peek(): SnapshotInfo | null;
  lastFailure(): Failure | null;
  reset(): void;
};

export type InventoryServiceOptions = {
  readonly config: AppConfig;
  readonly deps?: ClientDeps;
  readonly logger?: Logger;
  readonly now?: () => number;
};

type PageCacheEntry = {
  readonly etag: string | null;
  readonly repositories: GitHubRepository[];
  readonly invalidCount: number;
  readonly nextUrl: string | null;
};

export function createInventoryService(options: InventoryServiceOptions): InventoryService {
  const { config } = options;
  const logger = options.logger ?? logEvent;
  const now = options.now ?? (() => Date.now());
  const pageCache = new Map<string, PageCacheEntry>();
  const userAgent = `github-portfolio/1.0 (+${config.site.url})`;

  const cache = createSnapshotCache<RepositorySnapshot>({
    ttlMs: config.repos.cacheTtlSeconds * 1000,
    staleMaxMs: config.repos.staleMaxSeconds * 1000,
    now,
    onRefreshError: () => {
      /* logged by getInventory: keeps the cache module free of logging concerns */
    },
  });

  let lastFailure: Failure | null = null;

  async function loadSnapshot(): Promise<RepositorySnapshot> {
    const startedAt = now();
    const apiOrigin = new URL(config.github.apiBaseUrl).origin;
    const query = new URLSearchParams({ per_page: '100', type: 'owner', sort: 'updated', page: '1' });
    let url: string | null = `${config.github.apiBaseUrl}/users/${encodeURIComponent(
      config.profile.username,
    )}/repos?${query.toString()}`;

    const collected: GitHubRepository[] = [];
    const seen = new Set<string>();
    let pages = 0;
    let truncated = false;
    let skippedItems = 0;
    let rateLimit: RateLimitSnapshot | null = null;

    while (url !== null) {
      if (pages >= config.repos.maxPages) {
        // Explicitly flagged instead of silently returning a partial inventory.
        truncated = true;
        logger('warn', 'github.pagination_capped', { maxPages: config.repos.maxPages, pages });
        break;
      }

      pages += 1;
      const cachedPage = pageCache.get(url);
      const result = await fetchRepositoryPage(
        {
          url,
          token: config.github.token,
          apiOrigin,
          timeoutMs: config.github.requestTimeoutMs,
          maxRetries: config.github.maxRetries,
          etag: cachedPage?.etag ?? null,
          userAgent,
        },
        options.deps,
      );

      if (result.notModified) {
        if (!cachedPage) {
          throw new GitHubError('invalid_response', { detail: '304 without a cached page' });
        }
        rateLimit = result.rateLimit ?? rateLimit;
        skippedItems += cachedPage.invalidCount;
        collect(cachedPage.repositories, collected, seen);
        url = cachedPage.nextUrl;
        continue;
      }

      rateLimit = result.rateLimit ?? rateLimit;
      skippedItems += result.invalidCount;
      collect(result.repositories, collected, seen);
      pageCache.set(url, {
        etag: result.etag,
        repositories: result.repositories,
        invalidCount: result.invalidCount,
        nextUrl: result.nextUrl,
      });
      url = result.nextUrl;
    }

    if (pageCache.size > 100) pageCache.clear();

    const mapped: Repository[] = [];
    for (const raw of collected) {
      const repo = mapRepository(raw, { username: config.profile.username });
      if (repo === null) {
        skippedItems += 1;
        continue;
      }
      mapped.push(repo);
    }

    const eligible = applyInclusionPolicy(mapped, config.repos);

    logger('info', 'github.refresh_ok', {
      pages,
      repositories: eligible.length,
      skippedItems,
      truncated,
      durationMs: now() - startedAt,
      rateLimitRemaining: rateLimit?.remaining ?? null,
    });

    return {
      repos: eligible,
      generatedAt: new Date(now()),
      truncated,
      skippedItems,
      pages,
      rateLimit,
    };
  }

  function toInventory(snapshot: RepositorySnapshot, stale: boolean, ageSeconds: number): Inventory {
    return { ...snapshot, stale, ageSeconds };
  }

  return {
    async getInventory(): Promise<InventoryResult> {
      const outcome = await cache.get(loadSnapshot);

      if (outcome.status === 'fresh' || outcome.status === 'refreshed') {
        lastFailure = null;
        const ageSeconds = Math.max(0, Math.round((now() - outcome.storedAt) / 1000));
        return { inventory: toInventory(outcome.value, false, ageSeconds), failure: null };
      }

      const failure = toFailure(outcome.failure);
      lastFailure = failure;
      logger('warn', 'github.refresh_failed', {
        kind: failure.kind,
        status: failure.status,
        retryAt: failure.retryAt,
        servedStale: outcome.status === 'stale',
      });

      if (outcome.status === 'stale') {
        const ageSeconds = Math.max(0, Math.round((now() - outcome.storedAt) / 1000));
        return { inventory: toInventory(outcome.value, true, ageSeconds), failure };
      }

      return { inventory: null, failure };
    },

    peek(): SnapshotInfo | null {
      const entry = cache.peek();
      if (entry === null) return null;
      return {
        generatedAt: new Date(entry.storedAt),
        ageSeconds: Math.max(0, Math.round(entry.ageMs / 1000)),
        repositoryCount: entry.value.repos.length,
        stale: lastFailure !== null,
        truncated: entry.value.truncated,
        skippedItems: entry.value.skippedItems,
        rateLimit: entry.value.rateLimit,
      };
    },

    lastFailure(): Failure | null {
      return lastFailure;
    },

    reset() {
      pageCache.clear();
      cache.reset();
      lastFailure = null;
    },
  };
}

function collect(items: readonly GitHubRepository[], target: GitHubRepository[], seen: Set<string>): void {
  for (const item of items) {
    // Repository names are unique per owner and are the key used for detail URLs, so
    // they are the correct de-duplication identity (case-insensitive, like GitHub).
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(item);
  }
}

let defaultService: InventoryService | null = null;

export function getInventoryService(): InventoryService {
  if (defaultService === null) {
    defaultService = createInventoryService({ config: getConfig() });
  }
  return defaultService;
}

/** Convenience wrapper used by server components and route handlers. */
export function getRepositoryInventory(): Promise<InventoryResult> {
  return getInventoryService().getInventory();
}

/**
 * Request-scoped memoisation: several server components on one page (hero stats,
 * featured strip, index) read the same inventory, and React `cache()` collapses
 * those reads into a single call for the duration of that render.
 */
export const getRepositoryInventoryForRequest = cache((): Promise<InventoryResult> => {
  return getRepositoryInventory();
});

/** Test/ops helper: drop the process-wide service (and its cache). */
export function resetInventoryService(): void {
  defaultService = null;
}
