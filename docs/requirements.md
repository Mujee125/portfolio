# Requirements

## 1. Goal

A public, server-rendered portfolio site that presents the owner's **eligible public GitHub
repositories** and automatically picks up new ones after a bounded cache interval, with no manual
data entry, code change, or redeploy.

## 2. Personas

| Persona | Need |
| --- | --- |
| Recruiter / hiring manager | Quickly judge capability: what was built, with what tech, how recently; find the GitHub profile and (optionally) CV |
| Engineer peer | Inspect specific repos, filter by language/topic, sort by recency or popularity |
| Site owner | Change identity, inclusion rules and links via configuration only; trust that failures are visible, not silent |

## 3. Scope

**In scope:** public repository discovery and display, search/filter/sort, repository detail pages,
theming, metadata/social previews, machine-readable JSON endpoint, health endpoint, security headers,
tests, CI, deployment documentation.

**Out of scope (explicitly):** user accounts/authentication, database, write operations to GitHub,
comments/analytics PII, README rendering, blog/CMS, i18n, contact form with email delivery.

## 4. Functional requirements

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| FR-1 | Configurable identity | `GITHUB_USERNAME`, `PROFILE_*`, `NEXT_PUBLIC_SITE_URL` come from validated env config. An invalid/missing required value fails the build/start with an actionable message instead of rendering a broken page. |
| FR-2 | Automatic discovery | A repository created on GitHub appears on the site within `GITHUB_CACHE_TTL_SECONDS` (default 900 s) of the next request, with no redeploy and no code/data-file change. |
| FR-3 | Complete pagination | All pages reachable via the `link: rel="next"` header are followed (cap `GITHUB_MAX_PAGES`). If the cap is hit, the response is marked `truncated` and the UI states the inventory is incomplete. |
| FR-4 | Eligibility policy | Forks excluded by default (`GITHUB_INCLUDE_FORKS=true` to include); archived repositories included but visibly badged; disabled/private repositories never shown; optional name deny-list (`GITHUB_EXCLUDED_REPOS`); featured list (`GITHUB_FEATURED_REPOS`) pins repositories to the top section, falling back to top-starred when unset or unmatched. |
| FR-5 | Metadata display | Name, description, primary language, topics, stars, forks, last-push/updated time, archived badge, and canonical GitHub URL. Any missing/null field renders a neutral fallback (`No description provided`, language omitted) and never the string "undefined". |
| FR-6 | Search/filter/sort | Free-text search across name/description/topics; language filter; topic filter; sort by `updated` (default), `stars`, `name`, `created`. All state is encoded in URL query parameters and is shareable/back-button correct. Invalid parameters fall back to defaults (no crash). |
| FR-7 | Failure transparency | Distinct, accessible states: loading skeleton, empty result set, stale data (with the timestamp of the cached snapshot), rate-limited, upstream error with retry, partial/truncated data. Failed or partial results are never labelled as a complete inventory. |
| FR-8 | Themes | Light/dark/system. Defaults to the OS preference, honours an explicit user choice, persists it, and applies before first paint (no flash, no layout shift). |
| FR-9 | Discoverability | Per-page `<title>`/description, canonical URL, Open Graph/Twitter metadata with a generated social image, `robots.txt`, `sitemap.xml` including every repository detail URL, semantic landmarks and headings. |
| FR-10 | Repository detail | `/repositories/[name]` renders metadata for one eligible repository, 404s for unknown names, and always links to the GitHub source of truth. |
| FR-11 | Optional links | Email/CV/LinkedIn/GitHub profile links are rendered **only** when configured. Unset values produce no dead links and no placeholder copy. |
| FR-12 | Machine-readable endpoint | `GET /api/repositories` returns the same inventory as JSON with explicit `meta` (generatedAt, stale, truncated, rate-limit state), validated query parameters, and a `400` with a structured error for invalid input. |
| FR-13 | Health endpoint | `GET /api/health` returns `200` with `status: "ok" | "degraded"`, cache age, and whether the last refresh succeeded — without leaking secrets or stack traces. |

## 5. Non-functional requirements

| ID | Requirement | Target / verification |
| --- | --- | --- |
| NFR-1 | Performance | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (lab-measured on a throttled mid-tier mobile profile, documented conditions). Measured values reported separately from targets. |
| NFR-2 | Accessibility | WCAG 2.2 AA. Keyboard operability, visible focus, contrast ≥ 4.5:1 for text, `prefers-reduced-motion` honoured, axe scan with zero serious/critical violations on every primary route in both themes. |
| NFR-3 | Security | CSP (nonce-based scripts), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame-ancestors, no secrets in client bundles, no raw HTML injection, outbound link allowlist. |
| NFR-4 | Reliability | Upstream timeout 8 s, ≤2 retries with exponential backoff + jitter, single-flight per refresh, serve last good snapshot when a refresh fails, never retry after a rate-limit reset recommendation. |
| NFR-5 | Maintainability | Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), module boundaries between `app/` (rendering), `lib/github` (integration) and `lib/repos` (query logic), lint + typecheck + tests as gates. |
| NFR-6 | Operability | Structured single-line logs with no secrets, health endpoint, documented rollback (Vercel instant rollback), documented recovery for a bad deploy or an exhausted rate limit. |
| NFR-7 | Cost | Runs on free/hobby tiers: no database, no paid API, static-first asset delivery. |

## 6. Constraints

* Node.js ≥ 20.9 (runtime and CI), TypeScript 5.9.x (validated compatibility — see `docs/research.md` §1.3).
* No credentials for GitHub or a hosting provider exist in the build environment; the token and the
  production deployment are therefore **documented, not performed** (§ `docs/deployment.md`).
* GitHub is the only source of truth for repository metadata; no manual project data files.

## 7. Definition of Done (applies to every backlog item)

1. Behaviour implemented behind the documented module boundary, strict types, no `any`.
2. Unit and/or integration test covering the happy path **and** at least one failure path.
3. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all green locally.
4. Accessibility: keyboard path verified and axe clean for affected routes.
5. Docs updated in the same change (README/docs/ADR) — no doc drift.
6. No secret, no skipped test, no `eslint-disable` without an inline justification.
