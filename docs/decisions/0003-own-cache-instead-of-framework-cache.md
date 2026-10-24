# ADR-0003: Explicit in-process TTL cache + single-flight, not the framework data cache

*Status:* accepted · *Date:* 2026-10-24

**Context.** Next.js 16 offers the Data Cache (`fetch` + `next.revalidate`/tags) and Cache Components
(`cacheComponents: true` + `"use cache"` + `cacheLife`). Both can deliver a 15-minute freshness window.

**Options.**
1. **Framework Data Cache** (`fetch(..., { next: { revalidate: 900 } })`) — least code; but freshness,
   staleness and error behaviour live inside framework internals, are hard to unit-test, and combine
   unpredictably with retry logic (a failed refetch can serve a stale entry with no signal to the UI).
2. **Cache Components / `"use cache"`** — the strategic direction for Next.js, but it is a young
   configuration surface (opt-in flag), and this project has exactly one read-only data source; adopting
   PPR-style caching for it adds conceptual load for no measurable user benefit.
3. **Own cache** — a tiny module (`lib/github/cache.ts`): TTL → `fresh | stale → refresh | stale`, a
   single-flight promise map, `staleWhileError` retention (24 h max), and explicit metadata
   (`generatedAt`, `stale`, `truncated`) that the UI *must* render.

**Decision.** Option 3, with `cache: 'no-store'` on the upstream request so there is exactly one cache.

**Consequences.** (+) Deterministic, fast unit tests with fake timers; the failure surface is explicit;
portable to any Node host (including self-hosting or a worker with a pluggable store). (−) Per-instance
cache on serverless (cold starts refetch); mitigated by the page cap and optional token, documented as a
residual risk. (−) We own ~80 lines of cache code and its tests.
