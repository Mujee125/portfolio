# Test Plan

## 1. Strategy

Test **behaviour and failure paths**, not just successful rendering. Deterministic tests use fixtures
and a local mock GitHub server; a separate, explicitly-tagged live smoke test exercises the real API.
Nothing in this plan relies exclusively on the live API.

| Layer | Tool | Scope | Determinism |
| --- | --- | --- | --- |
| Unit | Vitest (node env) | mapping, eligibility policy, search/filter/sort, pagination header parsing, URL validation, config validation, formatters, error classification | 100% offline |
| Integration | Vitest + mocked `fetch` | pagination across pages, 304 handling, retries/backoff with fake timers, timeouts, rate-limit handling, malformed/incomplete payloads, stale-while-error, single-flight, cache TTL | 100% offline |
| Component | Vitest + jsdom + React Testing Library | repo card (missing fields, archived), empty state, error state, filter form URL building, theme toggle semantics | 100% offline |
| End-to-end | Playwright (chromium) | navigation, discovery, search/filter/sort via URL, detail page, 404, theme persistence, responsive layouts, keyboard path, axe scans, security headers, API contracts | Mock GitHub server, TTL=0 |
| Live smoke | Node script (`npm run test:live`) | real `api.github.com`: pagination integrity, schema compatibility, field presence, response time | Non-deterministic by design, never gates a release |
| Performance | `scripts/perf.mjs` (Playwright + PerformanceObserver) | LCP, CLS, TTFB, long tasks on a documented throttled profile | Lab conditions, reported separately from targets |
| Static gates | `tsc --noEmit`, ESLint, `scripts/check-boundaries.mjs`, `next build` | types, lint, architectural boundaries, production compilability | Deterministic |

## 2. Coverage matrix — requirements → tests

| Req | Test(s) |
| --- | --- |
| FR-1 config | `tests/unit/config.test.ts` — missing username, invalid username chars, invalid site URL, boolean coercion, cache TTL bounds, production guard on non-default API base |
| FR-2 discovery | `tests/integration/inventory.test.ts` (TTL expiry → refetch) + E2E "new repository appears after cache expiry" (mock server adds a repo, TTL=0) |
| FR-3 pagination | `tests/unit/pagination.test.ts`, `tests/integration/inventory.test.ts` (3 pages, mid-page failure, page cap → `truncated`) |
| FR-4 eligibility | `tests/unit/eligibility.test.ts` (forks, archived, disabled, deny-list, featured fallback) |
| FR-5 metadata | `tests/unit/mapper.test.ts` (null description, no topics, invalid/malicious URLs, missing dates) |
| FR-6 search/filter/sort | `tests/unit/query.test.ts` (case-insensitivity, topic matching, all sorts, stable tie-breaks, invalid input) |
| FR-7 failure UX | `tests/integration/inventory.test.ts`, `tests/components/states.test.tsx`, E2E "rate-limited state" and "upstream error with retry" |
| FR-8 themes | `tests/components/theme-toggle.test.tsx`, E2E "theme persists across navigation and respects system" |
| FR-9 discoverability | E2E asserts title/canonical/OG tags, `sitemap.xml` contains a repository URL, `robots.txt` served |
| FR-10 detail | E2E "navigates to detail", "unknown repo returns 404" + unit test for the lookup |
| FR-11 optional links | `tests/components/hero.test.tsx` — nothing rendered when unset, rendered when configured |
| FR-12 JSON API | E2E + unit: valid query, `400` on bad `sort`, `400` on over-long `q` |
| FR-13 health | E2E `/api/health` shape and `no-store` |
| NFR-2 accessibility | axe on `/` (light+dark), `/` filtered, `/` zero-results, empty account, rate-limited, `/repositories/[name]`, 404 and the error state, on desktop and mobile viewports; keyboard-only path test (skip link → nav → filters → card link) |
| NFR-3 security | E2E header assertions (CSP nonce present, HSTS, nosniff, frame-ancestors), unit tests for URL allowlist, `check-boundaries` for `dangerouslySetInnerHTML` |
| NFR-4 reliability | integration tests for retry/backoff/no-retry-after-reset, single-flight, stale fallback |
| NFR-1 performance | `npm run perf`; results recorded in `docs/delivery-report.md` |

## 3. Test data

* `tests/fixtures/repos-page-{1,2,3}.json` — realistic GitHub payloads including a fork, an archived
  repo, a null description, empty topics, a `javascript:` homepage, a foreign-host `html_url` and a
  100-repo page boundary case.
* `tests/mocks/github-server.mjs` — a dependency-free Node HTTP server that serves fixtures with
  `link`, `etag`, `x-ratelimit-*` headers and supports runtime scenarios:
  `default`, `multi-page`, `rate-limited`, `server-error`, `malformed`, `empty`, `timeout`,
  plus `POST /__control/scenario` to switch mid-run (used by E2E).

## 4. Executing

```bash
npm run lint            # ESLint (flat config, next/core-web-vitals + typescript)
npm run typecheck       # tsc --noEmit, strict
npm run check:boundaries# architectural + XSS/secret boundary assertions
npm test                # Vitest unit + integration + component
npm run test:coverage   # with V8 coverage
npm run build           # production build (Turbopack)
npm run test:e2e        # Playwright against a production build + mock GitHub
npm run test:live       # real GitHub smoke (opt-in, never gates CI)
npm run perf            # Core Web Vitals lab measurement
```

## 5. Entry / exit criteria

**Entry:** lint, typecheck green; build succeeds; mock server starts.
**Exit (release gate):** all of the above green, zero serious/critical axe violations, no known
unresolved defect above "low" severity, and the live smoke test passing at hand-over time.

## 6. Defect severity

| Severity | Definition | Release impact |
| --- | --- | --- |
| Critical | Secret exposure, XSS, false "complete inventory", data corruption | Blocks release |
| High | Broken primary flow, inaccessible core content, silent data loss | Blocks release |
| Medium | Degraded UX in a failure path, a11y warning, performance miss | May ship with a documented follow-up |
| Low | Cosmetic, non-blocking polish | Backlog |
