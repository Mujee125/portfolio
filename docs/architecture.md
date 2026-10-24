# Architecture

## 1. System context

```
        ┌──────────────┐    HTTPS GET (public, read-only)   ┌────────────────────┐
        │   Browser    │ ─────────────────────────────────► │  Next.js app        │
        │ (HTML/CSS/JS)│ ◄───────────────────────────────── │  (Node runtime)     │
        └──────────────┘    HTML + RSC payload + JSON       └─────────┬──────────┘
                                                                       │ server-side fetch
                                                                       │ (JSON, conditional, capped)
                                                                       ▼
                                                             ┌────────────────────┐
                                                             │ api.github.com      │
                                                             │ public REST API     │
                                                             └────────────────────┘
```

There is **no database, no backend service, no authentication, and no third-party runtime script.**
The only server-side state is an in-process cache of the last successful GitHub snapshot.

## 2. Container / module view

```
src/
├─ app/                        # routing + rendering only (no fetch policy logic)
│  ├─ layout.tsx               # shell, theme bootstrap, metadata, skip link
│  ├─ page.tsx                 # home: hero, stats, featured, searchable index
│  ├─ repositories/[name]/     # repository detail page
│  ├─ api/repositories/route.ts# JSON contract (validated query params)
│  ├─ api/health/route.ts      # operational check
│  ├─ sitemap.ts, robots.ts, opengraph-image.tsx, not-found.tsx, error.tsx
│  └─ globals.css              # design tokens + base layer (Tailwind v4 @theme)
├─ components/                 # presentational; receive plain props, never fetch
│  ├─ repo/ (RepoCard, RepoGrid, RepoFilters, RepoListSkeleton, EmptyState, ErrorState, StaleNotice)
│  └─ layout/ (SiteHeader, SiteFooter, ThemeToggle, ThemeScript, SkipLink, SectionHeading, Badge)
├─ lib/
│  ├─ config.ts                # Zod-validated env → typed immutable config (server-only usage)
│  ├─ github/
│  │  ├─ schema.ts             # Zod schema of the GitHub payload we actually consume
│  │  ├─ client.ts             # fetch: timeout, retries, conditional requests, rate-limit parsing
│  │  ├─ pagination.ts         # link-header parsing + host allowlist validation
│  │  ├─ errors.ts             # typed error taxonomy (rate_limited | timeout | upstream | invalid_response)
│  │  ├─ cache.ts              # TTL cache, single-flight, stale-while-error
│  │  ├─ mapper.ts             # GitHub → domain Repository (missing-field tolerance, URL validation)
│  │  └─ index.ts              # getRepositoryInventory(): the only public entry point
│  ├─ repos/query.ts           # eligibility policy + search/filter/sort over the inventory
│  └─ format.ts                # dates, counts, relative time (deterministic, locale-fixed)
```

**Boundary rules** (enforced by `scripts/check-boundaries.mjs` in CI):
1. `components/**` never imports `lib/github/**` or `lib/config.ts` (no server code in client bundles).
2. `app/**` never imports `lib/github/client.ts` directly — only `lib/github` public entry + `lib/repos/query`.
3. Client components (`"use client"`) never import anything marked server-only in `lib/`.

## 3. Data flow

1. A request hits `/` (dynamic render — required so new repositories appear without a rebuild).
2. `getRepositoryInventory()` reads the in-process cache:
   * fresh → return immediately (~µs);
   * stale → attempt a refresh, **single-flight** per process (one upstream refresh at a time);
   * refresh fails → return the last good snapshot with `stale: true`, or a typed error if none exists.
3. Refresh: serial `GET /users/{user}/repos?per_page=100&type=owner&sort=updated&page=N`, following
   `link: rel="next"` until absent or `GITHUB_MAX_PAGES`; each request carries `If-None-Match` when an
   ETag is known; 304 → reuse cached page; timeout 8 s; ≤2 retries with exponential backoff + jitter,
   *never* past a `retry-after` / `x-ratelimit-reset` deadline.
4. `lib/repos/query.ts` applies the eligibility policy and the URL-driven search/filter/sort.
5. Server components render HTML from the query result; the browser hydrates only the small
   interactive islands (theme toggle, filter form autosubmit, mobile nav).

## 4. Rendering & caching strategy

| Concern | Decision |
| --- | --- |
| Page rendering | **Dynamic** (`dynamic = 'force-dynamic'`) for data-bearing routes. Static prerendering would bake the repository list into the build and break FR-2. |
| Upstream cache | In-process TTL cache, `GITHUB_CACHE_TTL_SECONDS` default **900 s** (freshness target ≤ 15 min). |
| Framework cache | Next.js `fetch` cache is bypassed (`cache: 'no-store'` on the GitHub request) so there is exactly **one** cache with testable semantics; no double-caching surprises. See ADR-0003. |
| HTTP caching | HTML responses are not CDN-cached by default (content depends on query params and staleness); origin work is a cache lookup. Repository JSON endpoint sets `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. Immutable static assets get long-lived caching from Next.js. |
| Invalidation | Time-based only (no webhooks — a webhook needs a secret and a public endpoint, and is unnecessary at 15-min freshness). |
| Cold starts | Each instance warms independently; page cap + single-flight + stale fallback bound the cost. |
| Process-wide state | Held on `globalThis` under a versioned symbol, never in module scope: Next.js emits several server bundles per process and module scope is per bundle, which would duplicate the cache (proven by observation; see ADR-0012). |

## 5. Failure modes

| Failure | Detection | User-visible behaviour |
| --- | --- | --- |
| GitHub slow/hanging | 8 s `AbortSignal.timeout` | Retry (≤2), then stale snapshot with banner, else error state + retry button |
| 403/429 rate limited | status + `x-ratelimit-remaining: 0` / `retry-after` | No retry storm (respect reset); stale snapshot with "refresh paused until HH:MM UTC" or error state |
| Malformed/incomplete JSON | Zod parse error | Typed `invalid_response`, never a partially-rendered card |
| Unknown user (404) | status 404 | Empty/not-found state naming the configured username (helps misconfiguration) |
| Page N fails mid-pagination | error on any page | Whole refresh fails → stale fallback (never a silently truncated "complete" inventory) |
| `GITHUB_MAX_PAGES` reached | `link rel=next` still present | `truncated: true` + explicit UI notice |
| Config invalid | Zod at startup | Build/start fails with a message naming the variable |

## 6. Non-functional design notes

* **Zero third-party runtime dependency**: no analytics, no CDN fonts, no icon CDN. Typography uses a
  system font stack; icons are inline SVG. This keeps CSP tight, LCP fast and CLS at 0.
* **Payload discipline**: filtering is server-side, so no repository JSON is shipped to the browser
  beyond the rendered cards; interactive islands are a few kilobytes.
* **Deterministic formatting** (UTC, `en-GB`-neutral fixed locale) so server and client output match
  and tests are stable. Relative times are computed on the server and rendered into the initial HTML.
