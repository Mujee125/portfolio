# Delivery Report — GitHub Portfolio

**Date:** 2026-10-24  **Commit:** `70761e2` (branch `main`, first commit of the repository)
**Stack:** Next.js 16.4.3 · React 19.3.1 · TypeScript 5.9.3 · Tailwind CSS 4.3.3 · Zod 4.6.7

---

## 1. What was delivered

A server-rendered developer portfolio whose entire project inventory is derived from the public GitHub
REST API at request time. There is no database, no CMS and no hand-maintained project list: after the
cache window (default 15 minutes) a newly published eligible public repository appears on the site by
itself — with no code change and no redeployment.

**Live URL:** **none — this build was not deployed.** The environment that produced it has no GitHub or
hosting credentials, so claiming a live URL would be a fabrication. `docs/deployment.md` contains the
complete, verified-by-local-production-build path to a Vercel deployment (≈5 minutes of work), plus a
Docker alternative and a rollback procedure.

**Source:** local git repository at `/home/user/github-portfolio`, commit `70761e2`. It is ready to
push: workflows, `.env.example`, README and docs are all in the first commit.

**Screenshots** (regenerate with `BASE_URL=… node scripts/screenshots.mjs`):

| File | What it shows |
| --- | --- |
| [`docs/screenshots/home-light.png`](screenshots/home-light.png) | Full home page, light theme: hero, live stats panel, highlights, filter bar, repository grid |
| [`docs/screenshots/home-dark.png`](screenshots/home-dark.png) | Same page, dark theme (cookie-driven, no flash) |
| [`docs/screenshots/home-mobile.png`](screenshots/home-mobile.png) | 390 px viewport, stacked layout |
| [`docs/screenshots/repository-detail.png`](screenshots/repository-detail.png) | Repository detail page |

Captured against the local production build rendering **live GitHub data for `octocat`** (the
documented placeholder handle): 6 eligible repositories, 21.1k stars, honest "No description provided."
for repositories without one.

---

## 2. Requirement traceability

| # | Requirement | Where it is implemented | How it is evidenced |
| --- | --- | --- | --- |
| R1 | New eligible public repos appear after revalidation, no manual entry | `src/lib/github/index.ts` + `cache.ts` (TTL 900 s), `force-dynamic` routes, ADR-0002/0003/0004 | `tests/integration/inventory.test.ts` (refresh after TTL picks up a new repo); live smoke test |
| R2 | React + TS + SSR, verified versions | `package.json`, ADR-0001/0011 | `docs/research.md` version table; real install; build output |
| R3 | Configurable username/profile, documented, no fabrication | `src/lib/config.ts` (Zod), `src/components/sections/Hero.tsx` | `.env.example`, README config table, `tests/unit/config.test.ts` (19) |
| R4 | All pages via `Link` headers, no silent omission | `src/lib/github/pagination.ts` (serial, host-validated, `GITHUB_MAX_PAGES`), `truncated` flag | `tests/unit/pagination.test.ts` (16), `tests/integration/inventory.test.ts`; UI discloses truncation |
| R5 | Forks excluded by default (configurable), archived clearly marked, missing metadata graceful | `src/lib/repos/query.ts` policy, `RepoCard` archived badge, mapper fallbacks | `tests/unit/query.test.ts`, `tests/components/repo-card.test.tsx`, "No description provided." in screenshot |
| R6 | Search, language/topic filters, sorting, shareable URL state | `src/lib/repos/{query,params}.ts`, `RepoFilters.tsx` (GET form) | `tests/unit/params.test.ts` (13), `tests/components/repo-filters.test.tsx` (7), `tests/e2e/filters.spec.ts` (20) |
| R7 | Server caching, freshness target, timeouts, bounded retries, rate-limit handling, no amplification | `cache.ts` (single-flight, stale-while-error 24 h), `client.ts` (timeout, 3 attempts, jitter, `Retry-After`) | `tests/integration/{cache,client}.test.ts`; `docs/architecture.md` §caching |
| R8 | Explicit loading/empty/stale/rate-limited/error states; never partial-as-complete | `src/components/repo/states.tsx` + `RepoListSkeleton.tsx`, discriminated union in `inventory.ts`, `skippedItems`/`truncated` | `tests/components/states.test.tsx` (9), `tests/e2e/resilience.spec.ts` (12) |
| R9 | Unauthenticated by default; token server-only and optional | `src/lib/config.ts` + `client.ts` | `scripts/check-boundaries.mjs` secret + server-import rules; README |
| R10 | Distinctive portfolio UI, hero + CTAs, GitHub link, accurate stats, responsive nav, themes, restrained motion | `src/components/**`, `src/app/globals.css` | Screenshots; `tests/e2e/{home,theme}.spec.ts` (26 tests incl. mobile-chromium project) |
| R11 | SEO: titles, metadata, canonical, social previews, semantic HTML | `src/app/layout.tsx`, `src/app/repositories/[name]/page.tsx`, `src/app/opengraph-image.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts` | `tests/e2e/home.spec.ts` (title, description, canonical, OG/Twitter tags), `tests/components/layout.test.tsx` |
| R12 | WCAG 2.2 AA target | Semantic landmarks, focus rings, `prefers-reduced-motion`, labelled controls | axe sweep of home (light + dark), filtered, zero-results, detail, 404, error, empty-account and rate-limited states + keyboard-only flows in `tests/e2e/accessibility.spec.ts` (26 tests); ADR-0008 |
| R13 | OWASP Top 10 assessment, encoding, safe URLs, CSP + headers, secrets, supply chain, safe logs | `docs/security.md`, `src/proxy.ts`, `src/lib/log.ts`, `mapper.ts` allowlist, `.github/workflows/security.yml` | `tests/e2e/api-and-security.spec.ts` (20 tests: CSP nonce, HSTS, nosniff, frame-ancestors, API contract), `npm audit` 0, boundary checker |
| R14 | Test pyramid + a11y + keyboard + CI gates + perf vs targets | `tests/**`, `.github/workflows/ci.yml`, `scripts/perf.mjs` | §3 and §4 below |
| R15 | Scrum artefacts + increment report | `docs/backlog.md`, `docs/sprints.md`, this report | — |
| R16 | Deployment/handover docs, env examples, health check, rollback, README | `docs/deployment.md`, `docs/runbook.md`, `README.md`, `/api/health` | Local production run verified; CI YAML parse-validated |

---

## 3. Quality gates — actually executed

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npx eslint src tests --max-warnings 0` | **clean**, 0 warnings |
| Types | `npx tsc --noEmit` | **clean** |
| Boundaries | `node scripts/check-boundaries.mjs` | **pass** — 43 source files; no HTML sinks, no server imports in client code, no tracked env files, no secrets, no stray `process.env` |
| Unit / integration / component | `npx vitest run --coverage` | **195 passed**, 16 files (node 155, components 40) |
| Coverage | `@vitest/coverage-v8` | statements **90.24 %**, branches **83.89 %**, functions **85.88 %**, lines **92.13 %** (thresholds 85/85/80/80) |
| E2E | `npx playwright test` (chromium + mobile-chromium) | **104 passed / 0 failed**, 6 spec files, ~1.5 min |
| Accessibility | in-suite axe on 4 routes + keyboard flows | 0 violations at `wcag2a/aa/21aa/22aa` |
| Build | `npx next build` | **success** — 9 routes, proxy compiled, no type errors |
| Dependency audit | `npm audit --audit-level=high` | **0 vulnerabilities** |
| Live API smoke | `GITHUB_USERNAME=octocat node scripts/smoke-live.mjs` | **6/6 checks pass** — real `api.github.com`, 8 repos, 1 page, 311 ms, unauthenticated |
| Perf | `PORT=3200 node scripts/perf.mjs` | see §4 |

Test inventory (16 Vitest files, 195 tests):

| Layer | Files (tests) |
| --- | --- |
| Unit | `format` (10), `config` (19), `query` (23), `mapper` (22), `params` (13), `pagination` (16), `theme` (2), `service` (4) = 109 |
| Integration | `client` (21), `inventory` (16), `cache` (9) = 46 |
| Component | `layout` (11), `repo-card` (8), `repo-filters` (7), `theme-toggle` (5), `states` (9) = 40 |

E2E (104 tests, every spec runs on `chromium` and `mobile-chromium`):

| Spec | Tests | Covers |
| --- | --- | --- |
| `accessibility.spec.ts` | 26 | axe (wcag2a/2aa/21a/21aa/22aa) on home light+dark, filtered, zero-results, detail, 404, error, empty-account and rate-limited states; keyboard-only navigation; focus visibility; skip link; live-region announcements |
| `api-and-security.spec.ts` | 20 | security headers, CSP nonce, API JSON contract, health endpoint, metadata/canonical |
| `filters.spec.ts` | 20 | search, language/topic/sort, URL round-trip, shareable links, empty state |
| `home.spec.ts` | 16 | hero content, live stats, highlights, repository discovery, detail navigation, metadata/canonical |
| `resilience.spec.ts` | 12 | rate-limited, upstream error, malformed payload, retry, incomplete-inventory disclosure |
| `theme.spec.ts` | 10 | system preference, toggle persistence, SSR no-flash, reduced motion |

### Tests that changed the product (not just the coverage number)

* Typing into the search box **before hydration was silently discarded** — a real UX bug for fast
  users; fixed with a hydration marker that tests now wait for, and the same marker lets the E2E suite
  assert interactivity deterministically instead of sleeping.
* The header brand link had **no accessible name on mobile** (axe `link-name`); after the first fix it
  tripped `label-content-name-mismatch` because the visible text and the `aria-label` disagreed. Final
  fix: real text, visually hidden only on narrow screens — satisfies both rules and WCAG 2.5.3.
* Server components read `Date.now()` during render (React 19 purity lint); relative timestamps are now
  computed from the snapshot instant, which also makes the labels agree with the stats panel.
* The stale-while-error fallback was **hiding failure paths** in E2E; the E2E environment sets
  `GITHUB_STALE_MAX_SECONDS=0` so error states are provable, and stale behaviour is covered by
  integration tests instead.
* **Duplicate caches in one process.** Release smoke-testing showed `/api/health` reporting
  `cache: "empty"` right after the home page had rendered live data, with two upstream refreshes for one
  cold start. Next.js runs several server bundles per process and module scope is per bundle, so the
  singleton was duplicated. Fixed by holding the service on `globalThis` (ADR-0012); covered by
  `tests/unit/service.test.ts`, which fails on the previous implementation.
* **A dropped filter change.** Changing a select while a previous filter navigation was still in flight
  could leave the URL unchanged. All controls now merge into one draft and push through a single
  debounced/immediate navigation path; the keyboard spec was re-run 6× per viewport (24/24 green).
* **Hydration marker insufficient.** The filter island is a separate client chunk and could hydrate after
  the page-level marker, discarding typed keystrokes. The form now advertises its own readiness and the
  E2E helper waits for it.

---

## 4. Performance — measured, not asserted

Environment: **Chromium headless, Pixel 7 viewport, 4× CPU throttling, Slow 4G (1.6 Mbit/s down /
0.75 Mbit/s up, 150 ms RTT), cold cache**, local production build (`next build` + `next start`).

| Metric | Latest run | Earlier run | Target | Verdict |
| --- | --- | --- | --- | --- |
| LCP | **620 ms** | 988 ms | ≤ 2500 ms | pass (both runs) |
| CLS | **0** | 0 | ≤ 0.1 | pass |
| TTFB | **36 ms** | 60 ms | ≤ 800 ms | pass |
| Load (DOMContentLoaded→load) | 1359 ms | 1349 ms | — | informational |
| INP proxy (click→next frame) | **72 ms** | 70 ms | ≤ 200 ms | pass |
| Requests / transferred | 10 / 149 KB | same | — | informational |
| Long tasks | 3 | — | — | informational |

Run-to-run LCP varied between 620 ms and 988 ms on the same machine; on localhost the server side is
essentially free, so treat the LCP figure as "well inside budget" rather than a precise prediction.

Caveats stated plainly: these are **lab numbers from a throttled single run on a local server**, not
field (CrUX) data, and the interaction figure is a proxy measurement rather than a true P75 INP. TTFB is
low partly because the server is local; on Vercel it will include edge/function start-up. Re-measure
after deployment with `npm run perf` against the real URL before publishing claims.

---

## 5. Security posture (summary; full detail in `docs/security.md`)

Keyed to **OWASP Top 10:2025**. Highlights: per-request nonce CSP with `strict-dynamic` (no
`unsafe-inline` for scripts), HSTS/`nosniff`/`frame-ancestors 'none'`/referrer and permissions policy,
Zod validation of every upstream payload *and* every URL query parameter, outbound URL allowlisting
(`github.com` only) so repository `homepage`/`html_url` cannot become `javascript:` or open-redirect
vectors, React text escaping everywhere (no `dangerouslySetInnerHTML` — enforced by a CI check), token
never in client bundles or logs, redacting JSON logger, minimal read-only workflow permissions, CodeQL +
dependency review + `npm audit` in CI, and a documented residual-risk register (R1–R5+, including
`style-src 'unsafe-inline'` and per-instance cache divergence).

No security claim here rests on "there is no login".

---

## 6. Outstanding issues, risks and debt

| ID | Type | Description | Severity | Next step |
| --- | --- | --- | --- | --- |
| O1 | Gap | **No public deployment** (no credentials in this environment) | Blocks "live URL" acceptance | User connects the repo to Vercel and sets `GITHUB_USERNAME` + `NEXT_PUBLIC_SITE_URL` |
| O2 | Unverified | CI/CD workflows authored + YAML-validated, **never executed on a runner** | Medium | Open a PR; expect the first run to shake out runner-only issues |
| O3 | Placeholder | `octocat` is a documented placeholder; the site therefore presents *someone else's* public repositories | High if shipped as-is | Swap `GITHUB_USERNAME` (one env var, no code change) |
| O4 | Debt | In-process cache is per-instance; serverless replicas can serve different snapshot ages | Low | Accept, or move to a shared cache (KV/Redis) if scale demands |
| O5 | Debt | No visual-regression snapshots; screenshot script is manual | Low | Add Playwright `toHaveScreenshot` once the design stabilises |
| O6 | Gap | No screen-reader testing with real assistive tech; axe + keyboard only | Medium | Manual VoiceOver/NVDA pass before a public launch |
| O7 | Risk R4 | Unauthenticated 60 req/h can be exhausted by a cold-instance traffic spike | Medium | Provide `GITHUB_TOKEN` in production, or raise TTL to 1800 s |
| O8 | Gap | No `vercel.json`, no preview/production env separation beyond Vercel's own | Low | Vercel UI configuration only |
| O9 | Debt | Repository README content is intentionally not rendered (ADR-0010) | Low | Revisit with sanitised Markdown if desired |
| ~~O10~~ | ~~Gap~~ | **Closed** — axe now also covers filtered results, zero-result, empty-account and rate-limited states (26 a11y tests) | — | — |

---

## 7. Next steps (ordered, smallest valuable first)

1. **Swap identity:** set `GITHUB_USERNAME` to the real handle; add `NEXT_PUBLIC_SITE_URL`, `SITE_NAME`,
   optional `PROFILE_*` and `GITHUB_FEATURED_REPOS`. Delete nothing else — configuration is validated at
   boot, so a mistake fails loudly.
2. **Deploy:** Vercel import → env vars → deploy → verify `/api/health` and the CSP nonce
   (`docs/deployment.md` §2, §7).
3. **Enable the token:** add a fine-grained read-only `GITHUB_TOKEN` (Public repositories) to lift the
   rate limit from 60 to 5 000 req/h.
4. **Turn on monitoring:** external check on `/api/health`; alerts per `docs/runbook.md`.
5. **Run the gates in CI** on the first PR (O2) and fix anything runner-specific.
6. **Re-measure performance in production** and replace §4's lab numbers with real ones.
7. **Accessibility pass with a screen reader** (O6), then announce.
8. **Then** consider the roadmap items in `docs/backlog.md` (README rendering, release feed, project
   case-study pages).

---

## 8. References

* GitHub REST API — repositories, pagination (`Link`), rate limits, conditional requests: <https://docs.github.com/en/rest>
* Next.js 16 documentation — App Router, caching, `proxy`, metadata: <https://nextjs.org/docs>
* OWASP Top 10:2025: <https://owasp.org/Top10/>
* WCAG 2.2: <https://www.w3.org/TR/WCAG22/>
* web.dev Core Web Vitals thresholds: <https://web.dev/articles/vitals>
* Project documentation: `docs/research.md`, `docs/requirements.md`, `docs/architecture.md`,
  `docs/api-contract.md`, `docs/security.md`, `docs/test-plan.md`, `docs/backlog.md`,
  `docs/sprints.md`, `docs/deployment.md`, `docs/runbook.md`, `docs/decisions/0001…0011`.
