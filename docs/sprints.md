# Sprint Record (transparent execution log)

This delivery was executed as three increments in a single working session rather than three calendar
weeks. The Scrum artefacts are kept honest: each increment ended in a working, tested state, and the
reports below record **what was actually run** — including the defects that were found and fixed, and
the things that were *not* verified.

---

## Sprint 1 — Discovery and foundation

**Sprint goal:** replace assumptions with verified facts, and leave a skeleton that builds.

### Implemented
* Research against primary sources (GitHub Docs, Next.js Docs, OWASP Top 10:2025, WCAG 2.2, web.dev
  vitals) plus a **live probe of the GitHub API and the npm registry** from the build machine.
* `docs/research.md` (verified vs assumed facts), `docs/requirements.md`, `docs/architecture.md`,
  `docs/api-contract.md`, `docs/security.md`, `docs/test-plan.md`, 11 ADRs.
* Next.js 16.4.3 + React 19.3.1 + strict TypeScript project, Tailwind v4 tokens, ESLint flat config,
  Vitest projects, Playwright config, boundary checker, `.env.example`.
* Configuration module with Zod validation and `ConfigError`.

### What the evidence changed (retrospective)
* `typescript@7`, `vitest@5` and `jsdom@30` are **incompatible with Node 20** (jsdom 30 crashed with an
  `undici` ESM error). Pinned `typescript 5.9.3`, `vitest 4.1.12`, `jsdom 29.1.1`, `eslint 9.39.5`
  and recorded ADR-0011 instead of silently upgrading or forcing Node.
* Next.js 16 removed `next lint`, renamed `middleware.ts` → `proxy.ts`, and made `fetch` caching
  **opt-in** — three facts that would each have caused a broken build on a memory-based assumption.
* The live probe proved `type=owner` **includes forks**, so fork filtering is application logic, not an
  API parameter.

### Tests run
`npm run lint`, `npm run typecheck`, `npm run build` — all green on the skeleton.
`npm test` at this point: config test file only (19 tests).

### Defects found
`GITHUB_USERNAME` missing produced the message "expected string, received undefined" instead of
"GITHUB_USERNAME is required" — fixed with a preprocessing pipe and covered by a test.

---

## Sprint 2 — Functional product

**Sprint goal:** a visitor can browse, search, filter, sort, open details, switch themes — and new
repositories appear by themselves.

### Implemented
* `lib/github`: client (timeouts, bounded retries with jitter, `If-None-Match`, rate-limit
  classification, `link`-following with host validation), schema (Zod), mapper (safe URLs, bounded
  strings), error taxonomy, TTL cache with single-flight and stale-while-error, inventory service
  returning a discriminated union.
* `lib/repos`: inclusion policy, search/filter/sort with stable tie-breaks, featured selection, facets,
  summary, URL parameter parsing/serialisation.
* UI: hero + live stats, highlights, URL-driven filter bar (progressive enhancement), repository cards,
  detail pages, 404, error boundary, skeleton/empty/stale/rate-limited/incomplete states, theme toggle
  (cookie → SSR, no flash), OG image, robots, sitemap.
* JSON API (`/api/repositories`) and health endpoint (`/api/health`).

### Tests run
Unit + integration + component suites grew to 178 tests, all green. First E2E run: 96 tests, 20 failures
— every failure traced to a real defect or an over-strict assertion (below).

### Defects found and fixed
1. **Server components called `Date.now()` during render** — React 19's purity lint caught it; relative
   times are now anchored to the snapshot instant, which is also more correct (labels match the age
   shown in the panel).
2. **Header link had no discernible name on mobile** (only a decorative, `aria-hidden` monogram) —
   axe `link-name` violation, WCAG 2.4.4/4.1.2 failure. Fixed with real text that is `sr-only` on small
   screens (not an `aria-label`, which later tripped `label-content-name-mismatch` / WCAG 2.5.3).
3. **Deduplication keyed on `full_name`** could drop a repository and let another hide behind it; now
   keyed on the lower-cased name (the identity used by detail URLs).
4. **Filter labels matched by substring in tests** (`Topic` also matched "Topics for …"), and E2E typed
   into inputs before hydration. The real fix for the second was a `ClientReady` hydration marker so
   tests wait for interactivity instead of sleeping.

### Risks discovered
* `networkidle` is not a stable signal with Next.js prefetching → all E2E waits now use
  `domcontentloaded` + explicit element/attribute conditions.
* Failure-path E2E tests were masked by the stale-while-error fallback → the E2E environment sets
  `GITHUB_STALE_MAX_SECONDS=0` so failures are deterministic; stale behaviour is proven by
  integration tests instead.

---

## Sprint 3 — Hardening and release

**Sprint goal:** provable security, accessibility, performance and hand-over quality.

### Implemented
* Nonce-based CSP in `src/proxy.ts`, hardened headers in `next.config.ts`, log redaction, URL
  allowlists, `ClientReady`, `RefreshButton` (real server retry).
* `scripts/check-boundaries.mjs` (no HTML sinks, no server imports in client bundles, no secrets, no
  stray `process.env`, no tracked `.env`), `scripts/smoke-live.mjs`, `scripts/perf.mjs`,
  `scripts/screenshots.mjs`.
* CI (quality + E2E + audit), security (CodeQL, dependency review), scheduled live smoke.
* 11 additional component tests, coverage thresholds enforced, README, deployment guide, runbook,
  delivery report, screenshots.

### Tests actually run (final state)
See `docs/delivery-report.md` for the verbatim results. Summary: lint/typecheck/boundaries green,
195 unit+integration+component tests green, coverage above thresholds, production build green,
96 Playwright tests green on desktop + mobile viewports, live smoke green, `npm audit` clean,
Core Web Vitals inside targets under a throttled mobile profile.

### Defects found
* Coverage failed its own threshold (functions 77.84% < 80%) — fixed by testing the layout components
  (which then exposed the header label bug).
* `toSearchString` lived in a server-side module that a client component imported; moved to the pure
  query module so the boundary rule stays enforceable rather than being watered down.

### Defects found during the release smoke test (and fixed)

1. **Two caches in one process.** `/api/health` reported `cache: "empty"` seconds after the home page had
   rendered six live repositories, and the log showed two `github.refresh_ok` events for what should have
   been one cold start. Next.js compiles the app into several server bundles and module scope is per
   bundle, so the module-level singleton was duplicated. The service now lives on `globalThis` under a
   versioned symbol (ADR-0012) and `tests/unit/service.test.ts` reproduces the bundle split with
   `vi.resetModules()` — it fails against the old implementation (verified by restoring it temporarily).
2. **A filter change could be dropped.** Selecting a language within ~350 ms of typing a search could
   leave the URL untouched, because each control fired its own navigation from its own snapshot of the
   query. The form now keeps one draft and merges every change into it; typing debounces, selects apply
   immediately, and both paths push through a single `replace` (6× repeat runs of the keyboard spec, 24/24
   green afterwards).
3. **The hydration marker was necessary but not sufficient.** The filter island ships in its own client
   chunk and can hydrate after the root effect that sets `html[data-hydrated]`; keystrokes typed in that
   window were discarded when React restored the controlled input value. The form now marks itself
   `data-hydrated="true"` from its own effect, and the E2E helper waits for it before typing.

### Deliberately not done (recorded, not hidden)
* No public deployment (no hosting credentials in this environment).
* CI workflows authored and YAML-validated, but not executed on a GitHub runner.
* No screen-reader testing with real assistive technology (axe + keyboard verified only).
