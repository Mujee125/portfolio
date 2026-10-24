/**
 * Snapshot cache: TTL freshness, single-flight refresh, stale-while-error.
 *
 * Why hand-rolled instead of the framework data cache: the failure semantics
 * ("serve the last good snapshot, and tell the UI it is stale") must be explicit
 * and unit-testable. See ADR-0003.
 */

export type CacheOutcome<T> =
  | { readonly status: 'fresh'; readonly value: T; readonly storedAt: number }
  | { readonly status: 'refreshed'; readonly value: T; readonly storedAt: number }
  | { readonly status: 'stale'; readonly value: T; readonly storedAt: number; readonly failure: unknown }
  | { readonly status: 'miss'; readonly failure: unknown };

export type SnapshotCache<T> = {
  /** Read the cache without triggering a refresh (used by the health endpoint). */
  peek(): { readonly value: T; readonly storedAt: number; readonly ageMs: number } | null;
  get(refresh: () => Promise<T>): Promise<CacheOutcome<T>>;
  reset(): void;
  /** Number of refreshes started — asserted in tests to prove single-flight. */
  readonly refreshCount: number;
};

export type SnapshotCacheOptions = {
  readonly ttlMs: number;
  /** How long a failed refresh may still serve the previous snapshot. */
  readonly staleMaxMs: number;
  readonly now?: () => number;
  readonly onRefreshError?: (error: unknown) => void;
};

export function createSnapshotCache<T>(options: SnapshotCacheOptions): SnapshotCache<T> {
  const now = options.now ?? (() => Date.now());
  let entry: { value: T; storedAt: number } | null = null;
  let inflight: Promise<{ ok: true; value: T; storedAt: number } | { ok: false; error: unknown }> | null = null;
  let refreshCount = 0;

  const runRefresh = (refresh: () => Promise<T>) => {
    refreshCount += 1;
    const promise = (async () => {
      try {
        const value = await refresh();
        const storedAt = now();
        entry = { value, storedAt };
        return { ok: true as const, value, storedAt };
      } catch (error) {
        options.onRefreshError?.(error);
        return { ok: false as const, error };
      } finally {
        inflight = null;
      }
    })();
    inflight = promise;
    return promise;
  };

  return {
    get refreshCount() {
      return refreshCount;
    },

    peek() {
      if (entry === null) return null;
      return { value: entry.value, storedAt: entry.storedAt, ageMs: Math.max(0, now() - entry.storedAt) };
    },

    async get(refresh) {
      const current = entry;
      if (current !== null && now() - current.storedAt < options.ttlMs) {
        return { status: 'fresh', value: current.value, storedAt: current.storedAt };
      }

      // Single-flight: concurrent renders join the same refresh instead of amplifying the API call.
      const result = await (inflight ?? runRefresh(refresh));

      if (result.ok) {
        return {
          status: 'refreshed',
          value: result.value,
          storedAt: result.storedAt,
        };
      }

      if (current !== null && now() - current.storedAt < options.staleMaxMs) {
        return { status: 'stale', value: current.value, storedAt: current.storedAt, failure: result.error };
      }

      return { status: 'miss', failure: result.error };
    },

    reset() {
      entry = null;
      inflight = null;
      refreshCount = 0;
    },
  };
}
