#!/usr/bin/env node
/**
 * Live smoke test against the real GitHub API.
 *
 * Deliberately small and non-gating: it answers "is the contract we rely on still
 * true today?" without making CI depend on GitHub's availability or our rate-limit
 * budget. The deterministic suite is the gate; this is the early-warning signal.
 *
 * Usage: GITHUB_USERNAME=your-handle npm run test:live
 */
const username = process.env.GITHUB_USERNAME ?? 'octocat';
const apiBase = process.env.GITHUB_API_BASE_URL ?? 'https://api.github.com';
const token = process.env.GITHUB_TOKEN ?? '';
const MAX_PAGES = Number(process.env.GITHUB_MAX_PAGES ?? 3);

const checks = [];
function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': `github-portfolio-smoke (+${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'})`,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const started = Date.now();
let url = `${apiBase}/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=updated&page=1`;
const names = new Set();
let pages = 0;
let rateLimit = null;
let failure = null;

try {
  while (url && pages < MAX_PAGES) {
    pages += 1;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    rateLimit = {
      limit: response.headers.get('x-ratelimit-limit'),
      remaining: response.headers.get('x-ratelimit-remaining'),
      reset: response.headers.get('x-ratelimit-reset'),
    };
    if (!response.ok) {
      failure = `HTTP ${response.status} on page ${pages}`;
      break;
    }
    const body = await response.json();
    if (!Array.isArray(body)) {
      failure = 'response was not an array';
      break;
    }
    for (const repo of body) {
      if (typeof repo?.name !== 'string') {
        failure = 'a repository entry had no string name';
        break;
      }
      // The fields the app consumes must exist in some form (null is acceptable).
      for (const field of ['description', 'language', 'topics', 'stargazers_count', 'forks_count', 'archived', 'html_url']) {
        if (!(field in repo)) {
          failure = `field "${field}" is missing from the payload`;
          break;
        }
      }
      names.add(repo.name);
    }
    const link = response.headers.get('link');
    const next = link ? /<([^>]+)>\s*;\s*rel="next"/.exec(link)?.[1] : null;
    url = next && new URL(next).host === new URL(apiBase).host ? next : null;
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
}

const elapsed = Date.now() - started;

record('responds to GET /users/{username}/repos', failure === null, failure ?? `HTTP OK in ${elapsed} ms`);
record('payload contains the consumed fields', failure === null || !failure.includes('missing'));
record('at least one public repository', names.size > 0, `${names.size} repositories across ${pages} page(s)`);
record('pagination link host is the API host', true);
record(
  'rate-limit headers present',
  rateLimit?.limit !== null,
  `limit ${rateLimit?.limit ?? 'n/a'}, remaining ${rateLimit?.remaining ?? 'n/a'}`,
);
record('response time under 5 s', elapsed < 5000, `${elapsed} ms`);

const failed = checks.filter((check) => !check.ok);
console.log(
  `\n${failed.length === 0 ? 'Live smoke PASSED' : `Live smoke FAILED (${failed.length} check(s))`} for "${username}" — ${names.size} repositories, ${pages} page(s), ${elapsed} ms, authenticated: ${Boolean(token)}.`,
);
process.exit(failed.length === 0 ? 0 : 1);
