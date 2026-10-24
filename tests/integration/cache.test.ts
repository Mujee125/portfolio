import { describe, expect, it, vi } from 'vitest';
import { createSnapshotCache } from '@/lib/github/cache';

function makeClock(start = 1_000_000) {
  let time = start;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe('createSnapshotCache', () => {
  it('serves a fresh value without calling the refresh again', async () => {
    const clock = makeClock();
    const cache = createSnapshotCache<string>({ ttlMs: 1000, staleMaxMs: 5000, now: clock.now });
    const refresh = vi.fn().mockResolvedValue('v1');

    expect((await cache.get(refresh)).status).toBe('refreshed');
    clock.advance(999);
    const second = await cache.get(refresh);

    expect(second.status).toBe('fresh');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the TTL has elapsed (the "new repo appears" path)', async () => {
    const clock = makeClock();
    const cache = createSnapshotCache<string>({ ttlMs: 1000, staleMaxMs: 5000, now: clock.now });
    const refresh = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

    await cache.get(refresh);
    clock.advance(1001);
    const second = await cache.get(refresh);

    expect(second).toMatchObject({ status: 'refreshed', value: 'v2' });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('treats a zero TTL as always stale (used by the E2E suite)', async () => {
    const clock = makeClock();
    const cache = createSnapshotCache<string>({ ttlMs: 0, staleMaxMs: 5000, now: clock.now });
    const refresh = vi.fn().mockResolvedValue('v');
    await cache.get(refresh);
    await cache.get(refresh);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent reads into a single refresh (no request amplification)', async () => {
    const clock = makeClock();
    const cache = createSnapshotCache<string>({ ttlMs: 1000, staleMaxMs: 5000, now: clock.now });
    let resolveRefresh: ((value: string) => void) | undefined;
    const refresh = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = cache.get(refresh);
    const second = cache.get(refresh);
    const third = cache.get(refresh);
    await Promise.resolve();
    resolveRefresh?.('only-once');

    const results = await Promise.all([first, second, third]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.status === 'refreshed')).toBe(true);
    expect(cache.refreshCount).toBe(1);
  });

  it('serves the previous snapshot as stale when a refresh fails', async () => {
    const clock = makeClock();
    const onRefreshError = vi.fn();
    const cache = createSnapshotCache<string>({ ttlMs: 1000, staleMaxMs: 5000, now: clock.now, onRefreshError });
    const refresh = vi
      .fn()
      .mockResolvedValueOnce('good')
      .mockRejectedValueOnce(new Error('github down'));

    await cache.get(refresh);
    clock.advance(2000);
    const result = await cache.get(refresh);

    expect(result.status).toBe('stale');
    expect(result).toMatchObject({ value: 'good' });
    expect(onRefreshError).toHaveBeenCalledTimes(1);
  });

  it('reports a miss when a refresh fails and nothing is cached', async () => {
    const cache = createSnapshotCache<string>({ ttlMs: 1000, staleMaxMs: 5000, now: makeClock().now });
    const result = await cache.get(() => Promise.reject(new Error('boom')));
    expect(result.status).toBe('miss');
  });

  it('stops serving stale data once staleMaxMs has passed', async () => {
    const clock = makeClock();
    const cache = createSnapshotCache<string>({ ttlMs: 1000, staleMaxMs: 5000, now: clock.now });
    const refresh = vi.fn().mockResolvedValueOnce('good').mockRejectedValue(new Error('down'));

    await cache.get(refresh);
    clock.advance(6000);
    expect((await cache.get(refresh)).status).toBe('miss');
  });

  it('recovers after a failure once GitHub returns', async () => {
    const clock = makeClock();
    const cache = createSnapshotCache<string>({ ttlMs: 1000, staleMaxMs: 60_000, now: clock.now });
    const refresh = vi
      .fn()
      .mockResolvedValueOnce('v1')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce('v2');

    await cache.get(refresh);
    clock.advance(1500);
    expect((await cache.get(refresh)).status).toBe('stale');
    clock.advance(1500);
    expect(await cache.get(refresh)).toMatchObject({ status: 'refreshed', value: 'v2' });
  });

  it('exposes age through peek() and clears on reset()', async () => {
    const clock = makeClock();
    const cache = createSnapshotCache<string>({ ttlMs: 1000, staleMaxMs: 5000, now: clock.now });
    expect(cache.peek()).toBeNull();

    await cache.get(() => Promise.resolve('v'));
    clock.advance(400);
    expect(cache.peek()).toMatchObject({ value: 'v', ageMs: 400 });

    cache.reset();
    expect(cache.peek()).toBeNull();
  });
});
