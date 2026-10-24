# ADR-0012: Keep process-wide server state on `globalThis`, not in module scope

* Status: Accepted
* Date: 2026-10-24
* Supersedes: nothing (extends ADR-0003)

## Context

The inventory service owns one cache for the whole server process. It was created lazily into a
module-level `let`, which is the obvious way to write a singleton and works perfectly in Vitest.

While smoke-testing the production build, `/api/health` reported `cache: "empty"` immediately after the
home page had successfully rendered six repositories from GitHub. Requesting `/api/repositories` then
populated it. The server log showed **two** `github.refresh_ok` events for what should have been one
cold start.

Cause: Next.js compiles the application into several server bundles (page routes, route handlers,
proxy). Module scope is per bundle, so `let service = null` was effectively evaluated more than once
and two caches existed in one process.

Consequences if left alone:

* **Double the upstream calls** — the 60/h unauthenticated budget is spent twice per deploy.
* **`/api/health` lies** — it reports the state of a cache the page never used, so the documented
  alerting rule ("alert if `cacheAgeSeconds` grows") would misfire in both directions.
* **Inconsistent output** — the JSON API and the HTML page could show different repository sets
  immediately after a new repository is published.

## Decision

Store the service on `globalThis` under `Symbol.for('github-portfolio.inventory-service.v1')`, and read
it through `getInventoryService()`. Export `resetInventoryService()` for tests.

* `Symbol.for` is used deliberately: it is stable across bundles (unlike a per-module symbol).
* The key is versioned so a future incompatible shape cannot collide with an old instance during a
  rolling restart.
* Behaviour of the cache itself (TTL, single-flight, stale-while-error) is unchanged — ADR-0003 stands.

## Consequences

* One cache, one refresh per cold start, `/api/health` describes the same snapshot the pages use.
* `tests/unit/service.test.ts` simulates bundle duplication with `vi.resetModules()` and asserts
  identity; it fails on the previous implementation (verified by temporarily restoring it).
* Known limit: `globalThis` is per *process*, not per cluster. On serverless platforms each instance
  still has its own cache (already documented as residual risk R3).
* Module-level state elsewhere would have the same hazard; the boundary checker does not police this
  automatically, so the rule is documented here and in `docs/architecture.md`.
