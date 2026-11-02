import { GitHubError } from './errors';
import { nextPageUrl } from './pagination';
import { parseRepositoryPage, type GitHubRepository } from './schema';
import type { RateLimitSnapshot } from './types';

/**
 * Read response body with size limit to prevent memory exhaustion.
 */
export async function readJsonWithSizeLimit(response: Response, maxSizeBytes: number): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = Number(contentLength);
    if (size > maxSizeBytes) {
      throw new GitHubError('invalid_response', {
        status: response.status,
        detail: `Response body exceeds maximum size of ${maxSizeBytes} bytes (Content-Length: ${size})`,
      });
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new GitHubError('invalid_response', { status: response.status, detail: 'No response body' });
  }

  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.length;
    if (totalBytes > maxSizeBytes) {
      reader.cancel();
      throw new GitHubError('invalid_response', {
        status: response.status,
        detail: `Response body exceeds maximum size of ${maxSizeBytes} bytes`,
      });
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(body);
  try {
    return JSON.parse(text);
  } catch {
    throw new GitHubError('invalid_response', { status: response.status, detail: 'Response body is not valid JSON' });
  }
}

/**
 * A single-page GitHub REST client.
 *
 * Responsibilities kept deliberately small and injection-friendly so that every
 * failure path is testable without a network:
 *  - timeouts (AbortSignal), bounded retries with exponential backoff + jitter;
 *  - rate-limit classification that never retries before the reset deadline;
 *  - conditional requests via If-None-Match;
 *  - `link` header follow-through with host validation;
 *  - never leaking the Authorization header into messages or logs.
 */

export const GITHUB_API_VERSION = '2026-03-10';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ClientDeps = {
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
};

export type PageRequest = {
  readonly url: string;
  readonly token: string | null;
  readonly apiOrigin: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly etag: string | null;
  readonly userAgent: string;
  readonly maxResponseSizeBytes: number;
};

export type PageResult =
  | { readonly notModified: true; readonly rateLimit: RateLimitSnapshot | null }
  | {
      readonly notModified: false;
      readonly repositories: GitHubRepository[];
      readonly invalidCount: number;
      readonly nextUrl: string | null;
      readonly etag: string | null;
      readonly rateLimit: RateLimitSnapshot | null;
    };

const BACKOFF_BASE_MS = 250;
const BACKOFF_MAX_MS = 4_000;

export async function fetchRepositoryPage(request: PageRequest, deps: ClientDeps = {}): Promise<PageResult> {
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;

  let lastError: GitHubError | null = null;

  for (let attempt = 0; attempt <= request.maxRetries; attempt += 1) {
    if (attempt > 0) {
      await sleep(backoffDelay(attempt, deps.now));
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': request.userAgent,
    };
    if (request.etag) headers['If-None-Match'] = request.etag;
    if (request.token) headers.Authorization = `Bearer ${request.token}`;

    let response: Response;
    try {
      response = await fetchImpl(request.url, {
        method: 'GET',
        headers,
        redirect: 'follow',
        // One cache only: ours. See ADR-0003.
        cache: 'no-store',
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const kind = isAbortError(error) ? 'timeout' : 'upstream';
      lastError = new GitHubError(kind, { detail: 'network' });
      if (attempt < request.maxRetries) continue;
      throw lastError;
    }

    const rateLimit = parseRateLimit(response.headers, now());

    if (response.status === 304) {
      return { notModified: true, rateLimit };
    }

    if (response.status === 200) {
      let payload: unknown;
      try {
        payload = await readJsonWithSizeLimit(response, request.maxResponseSizeBytes);
      } catch (error) {
        if (error instanceof GitHubError) throw error;
        throw new GitHubError('invalid_response', { status: 200, detail: 'body is not JSON' });
      }
      try {
        const page = parseRepositoryPage(payload);
        return {
          notModified: false,
          repositories: page.valid,
          invalidCount: page.invalidCount,
          nextUrl: nextPageUrl(response.headers.get('link'), request.apiOrigin),
          etag: response.headers.get('etag'),
          rateLimit,
        };
      } catch (error) {
        throw new GitHubError('invalid_response', {
          status: 200,
          detail: error instanceof Error ? error.message : 'unexpected payload',
        });
      }
    }

    if (response.status === 404) {
      throw new GitHubError('not_found', { status: 404 });
    }

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      const rateLimited = isRateLimited(response.status, response.headers, rateLimit);
      if (rateLimited) {
        // Never retry a rate limit: GitHub explicitly warns that doing so can get an integration banned.
        throw new GitHubError('rate_limited', {
          status: response.status,
          retryAt: retryDeadline(response.headers, rateLimit, now()),
        });
      }
      lastError = new GitHubError('upstream', { status: response.status, detail: 'authorisation rejected' });
      if (attempt < request.maxRetries && response.status !== 401) continue;
      throw lastError;
    }

    lastError = new GitHubError('upstream', { status: response.status });
    if (response.status >= 500 && attempt < request.maxRetries) continue;
    throw lastError;
  }

  throw lastError ?? new GitHubError('upstream', { detail: 'retries exhausted' });
}

export function backoffDelay(attempt: number, now: (() => number) | undefined = undefined): number {
  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
  const jitterSource = now ? now() : Date.now();
  const jitter = Math.abs(Math.sin(jitterSource)) * exponential * 0.5;
  return Math.round(exponential + jitter);
}

export function parseRateLimit(headers: Headers, nowMs: number): RateLimitSnapshot | null {
  const limit = parseIntegerHeader(headers.get('x-ratelimit-limit'));
  const remaining = parseIntegerHeader(headers.get('x-ratelimit-remaining'));
  const used = parseIntegerHeader(headers.get('x-ratelimit-used'));
  const resetSeconds = parseIntegerHeader(headers.get('x-ratelimit-reset'));

  if (limit === null && remaining === null && used === null && resetSeconds === null) return null;

  // Guard against a bogus reset far in the future (GitHub sends epoch seconds).
  const resetAt =
    resetSeconds === null ? null : new Date(Math.min(resetSeconds * 1000, nowMs + 24 * 60 * 60 * 1000));

  return { limit, remaining, used, resetAt };
}

export function retryDeadline(headers: Headers, rateLimit: RateLimitSnapshot | null, nowMs: number): Date | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return new Date(nowMs + seconds * 1000);
    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) return new Date(asDate);
  }
  if (rateLimit?.remaining === 0 && rateLimit.resetAt) return rateLimit.resetAt;
  if (rateLimit?.resetAt && rateLimit.resetAt.getTime() > nowMs) return rateLimit.resetAt;
  return null;
}

function isRateLimited(status: number, headers: Headers, rateLimit: RateLimitSnapshot | null): boolean {
  if (status === 429) return true;
  if (headers.get('retry-after') !== null) return true;
  if (rateLimit?.remaining === 0) return true;
  const message = headers.get('x-github-message') ?? '';
  return /rate limit/i.test(message);
}

function parseIntegerHeader(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
  ) || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
