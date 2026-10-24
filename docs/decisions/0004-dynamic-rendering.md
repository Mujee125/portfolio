# ADR-0004: Data routes render dynamically; freshness comes from the cache

*Status:* accepted · *Date:* 2026-10-24

**Context.** Static prerendering would bake the repository list into the build artifact at build time, which
directly contradicts FR-2 ("new repositories appear without redeploy").

**Decision.** `/`, `/repositories/[name]` and `/api/*` are dynamic (`export const dynamic = 'force-dynamic'`);
the upstream cost is absorbed by the in-process cache (a refresh every 15 minutes, not per request).
Repository **detail pages are not** pre-generated with `generateStaticParams` for the same reason.

**Consequences.** (+) Correct freshness semantics; no rebuild needed to publish a new repository.
(+) Detail URLs are still crawlable and included in `sitemap.xml`, which is generated per request.
(−) No CDN HTML caching by default; origin work is a cache lookup (<5 ms) and the response is small, so
the trade-off is acceptable. If traffic ever justifies it, `s-maxage` + `stale-while-revalidate` can be
added without touching the data layer (recorded in the backlog).
