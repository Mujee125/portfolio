# Research Findings & Assumptions

**Date of research:** 2026-10-24
**Method:** official documentation (GitHub Docs, Next.js Docs, W3C, web.dev, OWASP) plus a
live probe of the GitHub public API and the npm registry from this build environment.
Every version/behaviour claim below was verified in this environment, not recalled from memory.

## 1. Verified facts

### 1.1 GitHub REST API

| Topic | Verified finding | Evidence |
| --- | --- | --- |
| Current API version header | `X-GitHub-Api-Version: 2026-03-10`; responses report `x-github-api-version-selected: 2026-03-10` | Live probe of `GET https://api.github.com/users/octocat/repos` |
| List repos endpoint | `GET /users/{username}/repos` supports `type=owner`, `sort=updated`, `per_page` (max 100) | [REST docs: repositories](https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user) |
| Forks are included in `type=owner` | The probe returned `octocat/linguist` with `"fork": true`. **Forks must be filtered by the application; the API does not exclude them for you.** | Live probe |
| Pagination | `link` header with `rel="next" / "last" / "prev" / "first"`. Docs explicitly say **do not construct pagination URLs manually** — follow `link`. | [Using pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api) |
| `per_page` overflow is silent | Values above the endpoint maximum are clamped **without an error**, so a caller can silently receive fewer results than expected | Same page |
| Unauthenticated rate limit | 60 requests/hour/IP (verified: `x-ratelimit-limit: 60`, `resource: core`) | [Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) + live probe |
| Authenticated rate limit | 5,000 requests/hour | Same |
| Rate-limit signals | `x-ratelimit-limit / -remaining / -used / -reset` (epoch seconds), `retry-after` for secondary limits; `403` **or** `429` | Same |
| Rate-limit reset semantics | Do not retry before `retry-after`, else before `x-ratelimit-reset`, else wait ≥60s; keep retrying exponentially → integration bans are possible | Same + [Best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) |
| Concurrency | Secondary limits discourage concurrency; docs recommend **serial** requests over concurrent ones | Best practices |
| Conditional requests | `etag` → `if-none-match`; `304` does **not** count against the primary limit **when authenticated** | Best practices |
| Response caching hint | GitHub sends `cache-control: public, max-age=60, s-maxage=60` on repo listings | Live probe |
| Redirects | Any request may redirect (301/302/307); follow them | Best practices |
| URL handling | Do not parse/construct API URLs; consume documented fields (`html_url`, `name`, …) | Best practices |

### 1.2 Framework and toolchain

* **Next.js 16.4.3 is current stable** (`npm view next dist-tags` → `latest: 16.4.3`). Minimum Node.js is **20.9.0**; minimum TypeScript is **5.1**.
* Next.js 16 breaking/behavioural facts that shape this design:
  * Turbopack is the **default** for `next dev` and `next build` (no flags needed).
  * `middleware.ts` is replaced by **`proxy.ts`** (Node.js runtime); `middleware.ts` is deprecated.
  * **Caching is opt-in**: `fetch` defaults to `auto no cache`; `cache: 'force-cache'` / `next.revalidate` must be explicit.
  * `cacheComponents` + `"use cache"` (PPR) is the new caching model, off by default.
  * `params` / `searchParams` are Promises and must be awaited.
  * `next lint` was removed in favour of the ESLint CLI; `eslint-config-next` exposes flat configs (`core-web-vitals`, `typescript`).
* Sources: [Next.js 16 release notes](https://nextjs.org/blog/next-16), [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16), [`fetch` API reference](https://nextjs.org/docs/app/api-reference/functions/fetch).

### 1.3 Version compatibility (the constraint that changed the plan)

This environment runs **Node.js 20.20.2** (Next.js 16's supported minimum line). Newest npm releases of some tools have moved to Node ≥22:

| Package | latest | Node engine | Decision |
| --- | --- | --- | --- |
| `typescript` | 7.0.2 | (Node ≥22 line) | **Pin 5.9.3** — matches Next 16's supported range and every tool in the chain |
| `vitest` | 5.0.5 | `^22.12 \|\| ^24 \|\| >=26` | **Pin 4.1.12** (`^20 \|\| ^22 \|\| >=24`) |
| `jsdom` | 30.x | `^22.14 \|\| >=24` — *verified crash on Node 20* (`undici` ESM error) | **Pin 29.1.1** (`^20.19 \|\| ^22.13 \|\| >=24`), verified working |
| `eslint` | 10.13.0 | — | **Pin 9.39.5** (peer range of `eslint-config-next` is `>=9`; 9.x is the conservative choice) |
| `@types/node` | 26.x | — | **Pin 22.20.5** to match the Node 20/22 runtime line |

Evidence: `npm view <pkg> version engines`, plus an actual `require('jsdom')` smoke run that failed on jsdom 30 and passed on jsdom 29.1.1.

Chosen set (all installed and building in this workspace): `next 16.4.3`, `react/react-dom 19.3.1`, `typescript 5.9.3`, `tailwindcss 4.3.3` + `@tailwindcss/postcss 4.3.3`, `zod 4.6.7`, `vitest 4.1.12`, `@playwright/test 1.64.1`, `@axe-core/playwright 4.14.0`, `eslint 9.39.5`.

### 1.4 Web performance & accessibility targets

* Core Web Vitals current stable set: **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**, evaluated at the **75th percentile** ([web.dev/vitals](https://web.dev/articles/vitals)). All three are "Stable".
* WCAG 2.2 Level AA is the accessibility target ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)). Concretely relevant new-in-2.2 criteria for this site: 2.4.11 *Focus Not Obscured (Minimum)* (sticky header must not hide the focused element), 2.5.8 *Target Size (Minimum)* 24×24 CSS px, 3.3.7 *Redundant Entry*, 2.4.13 *Focus Appearance* (AAA, used as a design goal for a clearly visible focus ring).

### 1.5 Security baseline

* **OWASP Top 10:2025 is the current edition** ([owasp.org](https://owasp.org/Top10/2025/)): A01 Broken Access Control, A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software or Data Integrity Failures, A09 Security Logging and Alerting Failures, A10 Mishandling of Exceptional Conditions. The security plan is mapped to the **2025** list (A03/A10 are new emphasis and matter here: dependency supply chain, and treating unhandled API failures as a first-class risk).
* GitHub Actions runtime majors verified present: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `actions/dependency-review-action@v5`, `github/codeql-action@v2` bundle.

## 2. Architectural alternatives considered

Full rationale per decision: `docs/decisions/`. Summary of the comparisons that actually changed the design:

1. **Rendering/caching for "new repos appear without redeploy"**
   * *Static export / SSG at build time* — rejected: new repositories would never appear without a rebuild.
   * *Next.js data cache + ISR (`revalidate` on the page)* — viable, but it couples freshness to framework internals, is invisible to tests, and interacts with `cacheComponents`/`use cache` migration.
   * *Own time-based cache + single-flight + conditional requests, pages rendered dynamically* — **chosen**. Explicit, unit-testable, portable to any Node host, and gives stale-while-error for free.
   * *Cache Components (`"use cache"`)* — attractive but adds a newer, still-evolving configuration surface for a single read-only data source; recorded as ADR-0003 and revisited if more data sources appear.
2. **Authentication** — 60 req/h unauthenticated vs 5,000 authenticated. With a 15-minute TTL, a small account needs ~4 fetches/hour × pages. Unauthenticated is sufficient and avoids secret handling; an optional, server-only, read-only token is supported.
3. **Data source for filtering** — client-side filtering of one big JSON payload (fast interactions, bigger payload, JS-dependent) vs URL-driven server-side filtering (shareable, works without JS, SEO-visible states). **Server-side + URL params** chosen; the client only auto-submits the form.
4. **Per-repository README rendering** — would cost 1 extra API call *per repository* and per page view (with unauth limits, a handful of visitors could exhaust the budget) and introduces Markdown → HTML rendering, a large XSS surface. **Rejected**: detail pages show verified metadata and link to GitHub. Recorded as ADR-0010.
5. **Hosting** — Vercel (first-class Next.js runtime, immutable rollbacks, preview deploys, no server to patch) vs Cloudflare Workers/OpenNext (cheaper at scale, extra adapter risk) vs self-hosted Docker (full control, patching burden). **Vercel** chosen for zero-infrastructure operation; the app itself has no Vercel-specific code except standard Next.js APIs, so it stays portable.

## 3. Assumptions (explicitly *not* verified)

| # | Assumption | Impact if wrong | Mitigation |
| --- | --- | --- | --- |
| A1 | The GitHub account has fewer than 1,000 public repositories (`GITHUB_MAX_PAGES=10` × 100) | Oldest repos could be truncated | The app reports `truncated: true` and the UI says the list is incomplete instead of silently showing a partial inventory; cap is configurable |
| A2 | The deployment can reach `api.github.com` over HTTPS | No repository data | Documented network requirement; error UI + health endpoint expose the failure |
| A3 | No personal access token is configured | 60 req/h budget shared by the deployment's egress IPs | Cache + single-flight keep usage ≈ 4 req/h for small accounts; token documented |
| A4 | The site is deployed on a single region / a platform whose CDN respects origin `Cache-Control` | Slightly higher origin traffic | Origin work is a cache lookup (<5 ms), so impact is negligible |
| A5 | Node.js ≥20.9 at runtime (Vercel's default Node 22 satisfies this) | Build failure | `engines` field + `.nvmrc` + documented |
| A6 | GitHub's `2026-03-10` API version stays backwards compatible for the pinned endpoint | Field shapes change | Responses are parsed through a Zod schema; unknown/missing fields degrade gracefully rather than crash |

## 4. Risks identified during research

* **Rate-limit exhaustion** is the dominant external failure mode (60 req/h, per-IP, shared across all egress IPs of a hosting provider). Controls: 15-min TTL, single-flight, page cap, serial page fetches, bounded retries, stale fallback, optional token.
* **Untrusted content**: repository names/descriptions/topics/homepage are attacker-controlled strings (any GitHub user could get content onto the page if the configured account ever renames/transfers repos, and descriptions are free text). They are rendered as React text (auto-escaped) and all outbound URLs are validated against an allowlist of hostnames — never used as `href` raw.
* **Cold-start amplification**: serverless instances each hold their own cache, so a burst on cold instances multiplies upstream calls. Controls: page cap + single-flight + stale fallback + documented optional token/CDN caching.
