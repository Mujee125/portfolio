import { describe, expect, it, vi } from 'vitest';
import { parseConfig, type AppConfig } from '@/lib/config';
import { createInventoryService } from '@/lib/github';
import { MULTI_PAGE_FIXTURE, githubRepo } from '../fixtures/repositories';

const API = 'https://api.github.com';
const silent = () => {};

function makeConfig(overrides: Record<string, string> = {}): AppConfig {
  return parseConfig({
    GITHUB_USERNAME: 'octocat',
    GITHUB_API_BASE_URL: API,
    GITHUB_CACHE_TTL_SECONDS: '900',
    GITHUB_MAX_PAGES: '10',
    ...overrides,
  });
}

type Page = { body: unknown; headers?: Record<string, string> };

/** Fake GitHub that serves the given pages in order and records every request. */
function fakeGitHub(pages: Page[], overrides: { status?: number; throw?: Error } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let index = 0;
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
    if (overrides.throw) throw overrides.throw;
    if (overrides.status) {
      return new Response(JSON.stringify({ message: 'error' }), { status: overrides.status });
    }
    const page = pages[Math.min(index, pages.length - 1)];
    index += 1;
    if (!page) throw new Error('no page fixture');
    return new Response(JSON.stringify(page.body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '50', ...(page.headers ?? {}) },
    });
  });
  return { fetchImpl, calls };
}

function makeService(pages: Page[], options: { config?: Record<string, string>; clock?: { now: () => number; advance: (ms: number) => void } } = {}) {
  const clock = options.clock ?? (() => {
    let time = 1_700_000_000_000;
    return { now: () => time, advance: (ms: number) => (time += ms) };
  })();
  const github = fakeGitHub(pages);
  const service = createInventoryService({
    config: makeConfig(options.config),
    deps: { fetchImpl: github.fetchImpl, sleep: () => Promise.resolve(), now: clock.now },
    logger: silent,
    now: clock.now,
  });
  return { service, github, clock };
}

describe('inventory service — happy path', () => {
  it('follows every page link and returns the full inventory', async () => {
    const { service, github } = makeService([
      {
        body: MULTI_PAGE_FIXTURE.page1,
        headers: { link: `<${API}/users/octocat/repos?page=2>; rel="next"` },
      },
      {
        body: MULTI_PAGE_FIXTURE.page2,
        headers: { link: `<${API}/users/octocat/repos?page=3>; rel="next"` },
      },
      { body: MULTI_PAGE_FIXTURE.page3 },
    ]);

    const { inventory, failure } = await service.getInventory();

    expect(failure).toBeNull();
    expect(github.calls).toHaveLength(3);
    // 3 + 2 + 1 raw entries, minus the fork which the default policy excludes.
    expect(inventory?.repos).toHaveLength(5);
    expect(inventory?.repos.map((repo) => repo.name)).not.toContain('a-fork');
    expect(inventory?.truncated).toBe(false);
    expect(inventory?.pages).toBe(3);
    expect(inventory?.stale).toBe(false);
  });

  it('requests the documented endpoint and parameters', async () => {
    const { service, github } = makeService([{ body: MULTI_PAGE_FIXTURE.page3 }]);
    await service.getInventory();

    const url = new URL(github.calls[0]?.url ?? '');
    expect(url.origin + url.pathname).toBe('/users/octocat/repos'.padStart(1, '') ? `${API}/users/octocat/repos` : '');
    expect(url.searchParams.get('per_page')).toBe('100');
    expect(url.searchParams.get('type')).toBe('owner');
    expect(url.searchParams.get('sort')).toBe('updated');
  });

  it('excludes and includes repositories according to configuration', async () => {
    const { service } = makeService(
      [{ body: [MULTI_PAGE_FIXTURE.page1[0], MULTI_PAGE_FIXTURE.page1[2]] }],
      { config: { GITHUB_INCLUDE_FORKS: 'true' } },
    );
    const { inventory } = await service.getInventory();
    expect(inventory?.repos.map((repo) => repo.name).sort()).toEqual(['a-fork', 'alpha']);
  });

  it('applies the deny-list from configuration', async () => {
    const { service } = makeService([{ body: MULTI_PAGE_FIXTURE.page1 }], {
      config: { GITHUB_EXCLUDED_REPOS: 'alpha' },
    });
    const { inventory } = await service.getInventory();
    expect(inventory?.repos.map((repo) => repo.name)).toEqual(['beta']);
  });
});

describe('inventory service — pagination limits', () => {
  it('flags truncation when the page cap is reached, instead of pretending the list is complete', async () => {
    const { service, github } = makeService(
      [
        { body: [githubRepo({ name: 'p1' })], headers: { link: `<${API}/users/octocat/repos?page=2>; rel="next"` } },
        { body: [githubRepo({ name: 'p2' })], headers: { link: `<${API}/users/octocat/repos?page=3>; rel="next"` } },
        { body: [githubRepo({ name: 'p3' })] },
      ],
      { config: { GITHUB_MAX_PAGES: '2' } },
    );

    const { inventory } = await service.getInventory();
    expect(github.calls).toHaveLength(2);
    expect(inventory?.truncated).toBe(true);
    expect(inventory?.repos).toHaveLength(2);
  });

  it('counts entries GitHub returned that could not be interpreted', async () => {
    const { service } = makeService([{ body: [githubRepo(), { name: 1 }, { broken: true }] }]);
    const { inventory } = await service.getInventory();
    expect(inventory?.repos).toHaveLength(1);
    expect(inventory?.skippedItems).toBe(2);
  });
});

describe('inventory service — caching and freshness', () => {
  it('serves the cached snapshot until the TTL expires, then discovers a new repository', async () => {
    const clock = (() => {
      let time = 1_700_000_000_000;
      return { now: () => time, advance: (ms: number) => (time += ms) };
    })();

    let pages: Page[] = [{ body: [githubRepo({ name: 'existing' })] }];
    const fetchImpl = vi.fn(async () => {
      const body = pages[0]?.body;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const service = createInventoryService({
      config: makeConfig({ GITHUB_CACHE_TTL_SECONDS: '900' }),
      deps: { fetchImpl, sleep: () => Promise.resolve(), now: clock.now },
      logger: silent,
      now: clock.now,
    });

    const first = await service.getInventory();
    expect(first.inventory?.repos.map((repo) => repo.name)).toEqual(['existing']);

    // A new repository is created on GitHub…
    pages = [{ body: [githubRepo({ name: 'existing' }), githubRepo({ name: 'brand-new' })] }];

    // …but inside the TTL the cache is authoritative (no upstream call).
    clock.advance(60_000);
    const cached = await service.getInventory();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cached.inventory?.repos).toHaveLength(1);

    // After the TTL the new repository appears without any redeploy.
    clock.advance(900_000);
    const refreshed = await service.getInventory();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refreshed.inventory?.repos.map((repo) => repo.name)).toContain('brand-new');
    expect(refreshed.inventory?.stale).toBe(false);
  });

  it('refreshes on every request when the TTL is zero', async () => {
    const { service, github } = makeService([{ body: [githubRepo()] }], { config: { GITHUB_CACHE_TTL_SECONDS: '0' } });
    await service.getInventory();
    await service.getInventory();
    expect(github.calls).toHaveLength(2);
  });

  it('reuses a page through If-None-Match when GitHub answers 304', async () => {
    const clock = (() => {
      let time = 1_700_000_000_000;
      return { now: () => time, advance: (ms: number) => (time += ms) };
    })();
    let call = 0;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify([githubRepo({ name: 'cached' })]), {
          status: 200,
          headers: { 'content-type': 'application/json', etag: 'W/"v1"' },
        });
      }
      // The conditional request must carry the previously stored ETag.
      expect((init.headers as Record<string, string>)['If-None-Match']).toBe('W/"v1"');
      return new Response(null, { status: 304 });
    });

    const service = createInventoryService({
      config: makeConfig({ GITHUB_CACHE_TTL_SECONDS: '0' }),
      deps: { fetchImpl, sleep: () => Promise.resolve(), now: clock.now },
      logger: silent,
      now: clock.now,
    });

    const first = await service.getInventory();
    expect(first.inventory?.repos.map((repo) => repo.name)).toEqual(['cached']);

    const second = await service.getInventory();
    expect(second.failure).toBeNull();
    expect(second.inventory?.repos.map((repo) => repo.name)).toEqual(['cached']);
  });
});

describe('inventory service — failure handling', () => {
  it('serves a stale snapshot and reports the failure when a refresh breaks', async () => {
    const clock = (() => {
      let time = 1_700_000_000_000;
      return { now: () => time, advance: (ms: number) => (time += ms) };
    })();
    let fail = false;
    const fetchImpl = vi.fn(async () => {
      if (fail) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify([githubRepo({ name: 'good' })]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const service = createInventoryService({
      config: makeConfig({ GITHUB_CACHE_TTL_SECONDS: '60', GITHUB_MAX_RETRIES: '0' }),
      deps: { fetchImpl, sleep: () => Promise.resolve(), now: clock.now },
      logger: silent,
      now: clock.now,
    });

    await service.getInventory();
    fail = true;
    clock.advance(120_000);

    const { inventory, failure } = await service.getInventory();
    expect(failure?.kind).toBe('upstream');
    expect(inventory?.stale).toBe(true);
    expect(inventory?.repos.map((repo) => repo.name)).toEqual(['good']);
    // The UI is told exactly what is wrong, so it can label the data as cached.
    expect(service.peek()?.stale).toBe(true);
  });

  it('returns no inventory at all when the first fetch fails', async () => {
    const { fetchImpl } = fakeGitHub([], { status: 500 });
    const service = createInventoryService({
      config: makeConfig({ GITHUB_MAX_RETRIES: '0' }),
      deps: { fetchImpl, sleep: () => Promise.resolve() },
      logger: silent,
    });

    const { inventory, failure } = await service.getInventory();
    expect(inventory).toBeNull();
    expect(failure).toMatchObject({ kind: 'upstream', status: 500 });
  });

  it('reports a rate limit with a retry time and does not retry', async () => {
    const reset = 1_700_000_600;
    const fetchImpl = vi.fn(
      async () =>
        new Response('{}', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
        }),
    );
    const service = createInventoryService({
      config: makeConfig(),
      deps: { fetchImpl, sleep: () => Promise.resolve() },
      logger: silent,
    });

    const { failure } = await service.getInventory();
    expect(failure?.kind).toBe('rate_limited');
    expect(failure?.retryAt?.getTime()).toBe(reset * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports an unknown account as not_found', async () => {
    const { fetchImpl } = fakeGitHub([], { status: 404 });
    const service = createInventoryService({
      config: makeConfig({ GITHUB_MAX_RETRIES: '0' }),
      deps: { fetchImpl, sleep: () => Promise.resolve() },
      logger: silent,
    });
    const { failure } = await service.getInventory();
    expect(failure?.kind).toBe('not_found');
  });

  it('treats a network error as a failure rather than an empty inventory', async () => {
    const { fetchImpl } = fakeGitHub([], { throw: new Error('ECONNRESET') });
    const service = createInventoryService({
      config: makeConfig({ GITHUB_MAX_RETRIES: '1' }),
      deps: { fetchImpl, sleep: () => Promise.resolve() },
      logger: silent,
    });
    const { inventory, failure } = await service.getInventory();
    expect(inventory).toBeNull();
    expect(failure?.kind).toBe('upstream');
  });

  it('fails the whole refresh when page 2 fails (no silently truncated list)', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify([githubRepo({ name: 'p1' })]), {
          status: 200,
          headers: { 'content-type': 'application/json', link: `<${API}/users/octocat/repos?page=2>; rel="next"` },
        });
      }
      return new Response('{}', { status: 500 });
    });

    const service = createInventoryService({
      config: makeConfig({ GITHUB_MAX_RETRIES: '0' }),
      deps: { fetchImpl, sleep: () => Promise.resolve() },
      logger: silent,
    });

    const { inventory, failure } = await service.getInventory();
    expect(failure?.kind).toBe('upstream');
    expect(inventory).toBeNull();
  });

  it('does not expose the token in the failure object', async () => {
    const { fetchImpl } = fakeGitHub([], { status: 500 });
    const service = createInventoryService({
      config: makeConfig({ GITHUB_MAX_RETRIES: '0', GITHUB_TOKEN: 'ghp_toptsecret' }),
      deps: { fetchImpl, sleep: () => Promise.resolve() },
      logger: silent,
    });
    const { failure } = await service.getInventory();
    expect(JSON.stringify(failure)).not.toContain('ghp_toptsecret');
  });
});
