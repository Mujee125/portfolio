# GitHub Portfolio

A server-rendered portfolio that publishes an engineer's **eligible public GitHub repositories** and
picks up new ones automatically — no manual project list, no code change, no redeploy.

- **Live data, not a static snapshot.** Repositories come from the GitHub REST API through a
  15-minute cache, so a repository created a minute ago appears on the next refresh.
- **Honest failure states.** If GitHub is slow, rate-limited or down, the site says so (and shows the
  age of any cached data) instead of rendering an empty list that looks complete.
- **Accessible by default.** WCAG 2.2 AA target, keyboard-operable, axe-clean in both themes at
  desktop and mobile sizes.
- **Secure by construction.** Nonce-based CSP, no HTML injection primitives, allowlisted outbound
  URLs, server-only credentials, hardened headers.
- **Verified.** 191 unit/integration/component tests, 96 end-to-end tests across two viewports,
  measured Core Web Vitals, CI gates.

> **Note on identity:** nothing about the owner is hard-coded or invented. Name, headline, bio,
> links, featured repositories and inclusion rules are configuration. Fields that are not configured
> are not rendered.

---

## Quick start

```bash
git clone <your-fork-url> github-portfolio && cd github-portfolio
npm ci

cp .env.example .env.local
# edit .env.local — at minimum set GITHUB_USERNAME

npm run dev            # http://localhost:3000
```

Node.js **20.9+** is required (`.nvmrc` pins 22). No database, no external service, no secret
required to run locally.

## Configuration

Everything is environment-driven and validated at startup by `src/lib/config.ts`. An invalid value
fails fast with a message naming the variable — the site never renders half-configured.

### Required

| Variable | Purpose | Rules |
| --- | --- | --- |
| `GITHUB_USERNAME` | Whose public repositories are shown | Valid GitHub username (≤39 chars, no leading/trailing/double hyphen) |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for SEO metadata, sitemap, robots | Required in production; must be `https://` (loopback exempt for local production builds) |

### Identity (all optional — omitted fields render nothing)

| Variable | Example | Notes |
| --- | --- | --- |
| `SITE_NAME` | `Jane Doe — Engineering` | Used in titles, footer, social image |
| `SITE_DESCRIPTION` | `Backend systems, distributed storage.` | Meta description and social copy |
| `PROFILE_NAME` | `Jane Doe` | Defaults to the GitHub username |
| `PROFILE_HEADLINE` | `Distributed systems engineer` | Hero subtitle |
| `PROFILE_BIO` | Short paragraph | Renders the About section when present |
| `PROFILE_LOCATION` | `Berlin, Germany` | Displayed as text only |
| `PROFILE_EMAIL` | `jane@example.com` | Must be a valid address; adds a `mailto:` link |
| `PROFILE_RESUME_URL` | `https://…/cv.pdf` | `https://` only |
| `PROFILE_LINKEDIN_URL` | `https://linkedin.com/in/…` | `https://` only |
| `PROFILE_WEBSITE_URL` | `https://jane.dev` | `https://` only |

### Repository inclusion policy

| Variable | Default | Meaning |
| --- | --- | --- |
| `GITHUB_INCLUDE_FORKS` | `false` | Forks are excluded by default (the API returns them for `type=owner`) |
| `GITHUB_INCLUDE_ARCHIVED` | `true` | Archived repositories are listed **with an "Archived" badge** |
| `GITHUB_EXCLUDED_REPOS` | *(empty)* | Comma-separated names to hide, case-insensitive |
| `GITHUB_FEATURED_REPOS` | *(empty)* | Comma-separated names pinned to the highlights section, in order |
| `GITHUB_FEATURED_COUNT` | `3` | How many highlights to show (fills by stars when the pinned list is shorter) |

Private and disabled repositories are never shown, whatever the policy says.

### Data freshness, limits and credentials

| Variable | Default | Meaning |
| --- | --- | --- |
| `GITHUB_CACHE_TTL_SECONDS` | `900` | Freshness target (15 minutes). `0` = re-read on every request |
| `GITHUB_STALE_MAX_SECONDS` | `86400` | How long a previous snapshot may still be served after a failed refresh (`0` disables) |
| `GITHUB_MAX_PAGES` | `10` | Pagination cap (100 repos/page). Hitting it is **disclosed in the UI** |
| `GITHUB_REQUEST_TIMEOUT_MS` | `8000` | Per-request timeout |
| `GITHUB_MAX_RETRIES` | `2` | Retries for timeouts/5xx only — never for rate limits |
| `GITHUB_TOKEN` | *(unset)* | Optional fine-grained, read-only, **server-only** token (60 → 5,000 req/h). Never prefix with `NEXT_PUBLIC_` |
| `GITHUB_API_BASE_URL` | `https://api.github.com` | Only for GitHub Enterprise Server or tests; a non-default value in production requires `ALLOW_NON_DEFAULT_GITHUB_API=true` |

Rate-limit budget with defaults: 4 refreshes/hour × ≤10 pages = **≤40 requests/hour**, inside the
60/hour unauthenticated allowance for accounts up to 1,000 repositories.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve the build |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| `npm run check:boundaries` | Architectural/security invariants (no HTML sinks, no server imports in client code, no committed secrets) |
| `npm test` | Unit + integration + component tests (Vitest) |
| `npm run test:coverage` | Same, with V8 coverage thresholds (lines/statements/functions ≥80%, branches ≥75%) |
| `npm run test:e2e` | Playwright against a production build with a local mock GitHub server |
| `npm run test:live` | Opt-in smoke test against the real GitHub API (never gates CI) |
| `npm run perf` | Lab Core Web Vitals measurement against a running production build |
| `npm run test:all` | lint → typecheck → coverage → build → e2e |

## Architecture (short version)

```
Browser ──HTTP──▶ Next.js 16 app (Node runtime)
                  ├─ app/          routes, metadata, sitemap, JSON + health endpoints
                  ├─ components/   presentational only (no data access)
                  ├─ features/     server-rendered sections (hero stats, featured, index)
                  └─ lib/github/   fetch → validate → map → policy → cache
                                        │
                                        └──HTTPS──▶ api.github.com (public, read-only)
```

* **No database, no CMS, no auth, no microservices.** GitHub is the single source of truth.
* **Dynamic rendering** (`force-dynamic`) for data routes; a prerendered page would freeze the list
  at build time and break the freshness requirement.
* **One cache, deliberately.** An in-process TTL cache with single-flight and stale-while-error
  (`src/lib/github/cache.ts`), not the framework data cache, so freshness and failure semantics are
  explicit and unit-tested (ADR-0003).
* **Serial pagination** following `link: rel="next"`, with every `link` URL re-validated against the
  API origin (open-redirect/SSRF guard).
* **Failure taxonomy** in `src/lib/github/errors.ts`; the inventory API returns a discriminated union
  so the UI must handle failure explicitly.

Full detail: [`docs/architecture.md`](docs/architecture.md) · decisions:
[`docs/decisions/`](docs/decisions/) · API contract: [`docs/api-contract.md`](docs/api-contract.md).

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Hero, live statistics, highlights, searchable/filterable index (state in the URL) |
| `/repositories/[name]` | Repository detail from the same cached inventory; `404` when not eligible |
| `/api/repositories` | JSON inventory with `meta` (freshness, staleness, truncation, rate limit); `400` on invalid input |
| `/api/health` | Operational state (`ok`/`degraded`, cache age, last failure kind) — no secrets |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image` | Generated from configuration and the live inventory |

Query parameters: `?q=` (≤100 chars), `?language=`, `?topic=`, `?sort=updated|stars|name|created`.
Invalid values fall back to defaults rather than erroring.

## Testing

```
tests/unit/          mapping, policy, filtering/sorting, URL validation, config, formatters
tests/integration/   pagination, 304, retries/backoff, timeouts, rate limits, stale-while-error, single-flight
tests/components/    cards, states, filters, theme toggle, layout (React Testing Library + jsdom)
tests/e2e/           navigation, discovery, filters, themes, a11y (axe), headers, API, resilience
tests/mocks/         dependency-free GitHub mock with switchable scenarios
```

Deterministic tests never touch the network. The live smoke test is separate and opt-in. See
[`docs/test-plan.md`](docs/test-plan.md) for the requirement-to-test matrix and
[`docs/delivery-report.md`](docs/delivery-report.md) for the executed results.

## Deployment

Vercel is the documented target (zero infrastructure, instant rollback, preview deploys), and the app
contains no Vercel-specific code, so any Node host works. Step-by-step instructions, environment
setup, rollback and recovery: [`docs/deployment.md`](docs/deployment.md) and
[`docs/runbook.md`](docs/runbook.md).

Minimum production checklist:

```bash
GITHUB_USERNAME=<your-handle>
NEXT_PUBLIC_SITE_URL=https://your-domain.example
# optional: PROFILE_* identity/links, GITHUB_FEATURED_REPOS, GITHUB_TOKEN
```

## Maintenance notes

* **Upgrades.** Direct dependencies are pinned exactly and the lockfile is committed; CI installs with
  `npm ci`. The toolchain deliberately lags some newest majors for Node 20/22 compatibility
  (ADR-0011): moving to Node 24 unlocks TypeScript 7, Vitest 5, jsdom 30, ESLint 10 — a mechanical,
  test-covered change.
* **Adding a data source** (e.g. a blog): add a module under `lib/`, keep `app/` free of fetch policy,
  and extend the boundary check if a new server-only module appears.
* **Rate limits.** If the deployment shares an egress IP or grows past ~1,000 repositories, set
  `GITHUB_TOKEN` and/or raise `GITHUB_CACHE_TTL_SECONDS`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Invalid application configuration: GITHUB_USERNAME …` | Missing/invalid username | Set `GITHUB_USERNAME`; usernames cannot start/end with `-` |
| Site shows "Repositories are unavailable" with `403` | Unauthenticated rate limit (60/h/IP) | Wait for the reset shown on screen, or set `GITHUB_TOKEN` |
| New repository not visible | Cache TTL not elapsed | Wait up to `GITHUB_CACHE_TTL_SECONDS`, or lower it |
| "This list may be incomplete" notice | `GITHUB_MAX_PAGES` reached, or unparsable entries skipped | Raise `GITHUB_MAX_PAGES`; check `/api/health` for `skippedItems` |
| Build fails with `NEXT_PUBLIC_SITE_URL` | Production build without a canonical URL | Set it (loopback is allowed for local production builds) |
| E2E tests time out on the first run | Browsers not installed | `npx playwright install chromium` |

## Limitations (deliberate)

* No README rendering on detail pages — it would cost one API request per repository and add a
  Markdown/sanitising XSS surface (ADR-0010). Detail pages link to GitHub instead.
* The cache is per server instance, so serverless instances can briefly disagree; `/api/health`
  reports each instance's own truth.
* No webhooks: 15-minute freshness does not justify a public endpoint plus a secret (ADR-0002).

## Licence

Application code: MIT. Repository data belongs to its respective owners and is displayed under the
GitHub API terms.
