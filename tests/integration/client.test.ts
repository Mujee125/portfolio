import { describe, expect, it, vi } from 'vitest';
import { fetchRepositoryPage, parseRateLimit, retryDeadline, type PageRequest } from '@/lib/github/client';
import { GitHubError } from '@/lib/github/errors';
import { githubRepo } from '../fixtures/repositories';

const baseRequest: PageRequest = {
  url: 'https://api.github.com/users/octocat/repos?per_page=100&type=owner&page=1',
  token: null,
  apiOrigin: 'https://api.github.com',
  timeoutMs: 8000,
  maxRetries: 2,
  etag: null,
  userAgent: 'github-portfolio-test',
  maxResponseSizeBytes: 10 * 1024 * 1024,
};

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

const noSleep = () => Promise.resolve();
const now = () => 1_700_000_000_000;

describe('fetchRepositoryPage', () => {
  it('returns parsed repositories and the next page link', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([githubRepo(), githubRepo({ name: 'second' })], {
        headers: {
          link: '<https://api.github.com/users/octocat/repos?page=2>; rel="next"',
          etag: 'W/"abc"',
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '58',
        },
      }),
    );

    const result = await fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now });

    expect(result.notModified).toBe(false);
    if (result.notModified) return;
    expect(result.repositories).toHaveLength(2);
    expect(result.nextUrl).toBe('https://api.github.com/users/octocat/repos?page=2');
    expect(result.etag).toBe('W/"abc"');
    expect(result.rateLimit).toMatchObject({ limit: 60, remaining: 58 });
  });

  it('sends the documented headers and omits Authorization without a token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([githubRepo()]));
    await fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2026-03-10');
    expect(headers['User-Agent']).toBe('github-portfolio-test');
    expect(headers.Authorization).toBeUndefined();
    expect(init.cache).toBe('no-store');
  });

  it('sends a bearer token when configured and never leaks it in errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'nope' }, { status: 500 }));
    await expect(
      fetchRepositoryPage({ ...baseRequest, token: 'ghp_secretvalue' }, { fetchImpl, sleep: noSleep, now }),
    ).rejects.toThrow(Error);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_secretvalue');

    await fetchRepositoryPage({ ...baseRequest, token: 'ghp_secretvalue' }, { fetchImpl, sleep: noSleep, now }).catch(
      (error: GitHubError) => {
        expect(error.message).not.toContain('ghp_secretvalue');
        expect(error.publicMessage).not.toContain('ghp_secretvalue');
        expect(error.stack ?? '').not.toContain('ghp_secretvalue');
      },
    );
  });

  it('sends If-None-Match and handles 304 as not modified', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { 'x-ratelimit-remaining': '42' } }));

    const result = await fetchRepositoryPage({ ...baseRequest, etag: 'W/"abc"' }, { fetchImpl, sleep: noSleep, now });

    expect(result.notModified).toBe(true);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('W/"abc"');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries server errors with backoff and then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'oops' }, { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ message: 'oops' }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse([githubRepo()]));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchRepositoryPage(baseRequest, { fetchImpl, sleep, now });
    expect(result.notModified).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // Exponential backoff with jitter: the second wait must be longer than the first.
    const [first, second] = sleep.mock.calls.map((call) => call[0] as number);
    expect(second).toBeGreaterThan(first ?? 0);
  });

  it('stops retrying after maxRetries and reports an upstream failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 }));
    await expect(fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now })).rejects.toMatchObject({
      kind: 'upstream',
      status: 500,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries
  });

  it('does not retry a 404 but reports not_found', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'Not Found' }, { status: 404 }));
    await expect(fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now })).rejects.toMatchObject({
      kind: 'not_found',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never retries a primary rate limit and exposes the reset time', async () => {
    const resetSeconds = Math.floor(now() / 1000) + 600;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetSeconds) },
      }),
    );

    const error = (await fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now }).catch(
      (e: GitHubError) => e,
    )) as GitHubError;

    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({ kind: 'rate_limited', status: 403 });
    expect(error.retryAt?.getTime()).toBe(resetSeconds * 1000);
    // Retrying a rate limit is what gets integrations banned.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('honours a secondary rate limit (429 + retry-after) without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{}', { status: 429, headers: { 'retry-after': '120' } }),
    );
    const error = (await fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now }).catch(
      (e: GitHubError) => e,
    )) as GitHubError;
    expect(error.kind).toBe('rate_limited');
    expect(error.retryAt?.getTime()).toBe(now() + 120_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('classifies an aborted request as a timeout and retries', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    const fetchImpl = vi.fn().mockRejectedValue(timeout);
    await expect(fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now })).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects a non-JSON body as an invalid response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>gateway</html>', { status: 200 }));
    await expect(fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now })).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  it('rejects a payload that is not an array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'unexpected' }));
    await expect(fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now })).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  it('skips individual malformed entries but keeps the valid ones', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([githubRepo(), { name: 42 }, null]));
    const result = await fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now });
    if (result.notModified) throw new Error('unexpected');
    expect(result.repositories).toHaveLength(1);
    expect(result.invalidCount).toBe(2);
  });

  it('treats a page of entirely invalid entries as a contract violation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ nonsense: true }]));
    await expect(fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now })).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  it('refuses to follow a next link pointing at another host', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([githubRepo()], { headers: { link: '<https://evil.example/p2>; rel="next"' } }),
    );
    await expect(fetchRepositoryPage(baseRequest, { fetchImpl, sleep: noSleep, now })).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });
});

describe('parseRateLimit', () => {
  it('parses the headers GitHub actually sends', () => {
    const headers = new Headers({
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '59',
      'x-ratelimit-used': '1',
      'x-ratelimit-reset': '1792816301',
    });
    expect(parseRateLimit(headers, 1_792_810_000_000)).toEqual({
      limit: 60,
      remaining: 59,
      used: 1,
      resetAt: new Date(1792816301 * 1000),
    });
  });

  it('returns null when no rate-limit headers are present', () => {
    expect(parseRateLimit(new Headers(), 0)).toBeNull();
  });

  it('clamps an implausibly distant reset time', () => {
    const headers = new Headers({ 'x-ratelimit-reset': '99999999999' });
    const parsed = parseRateLimit(headers, 1_700_000_000_000);
    expect(parsed?.resetAt?.getTime()).toBeLessThanOrEqual(1_700_000_000_000 + 24 * 60 * 60 * 1000);
  });
});

describe('retryDeadline', () => {
  it('prefers retry-after seconds', () => {
    expect(retryDeadline(new Headers({ 'retry-after': '30' }), null, 0)?.getTime()).toBe(30_000);
  });

  it('accepts an HTTP-date retry-after', () => {
    const date = new Date(1_700_000_060_000).toUTCString();
    expect(retryDeadline(new Headers({ 'retry-after': date }), null, 0)?.getTime()).toBe(1_700_000_060_000);
  });

  it('falls back to the reset time when the quota is exhausted', () => {
    const resetAt = new Date(5_000);
    expect(retryDeadline(new Headers(), { limit: 60, remaining: 0, used: 60, resetAt }, 0)).toBe(resetAt);
  });
});
