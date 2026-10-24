# ADR-0006: URL-driven, server-side search/filter/sort (progressive enhancement)

*Status:* accepted · *Date:* 2026-10-24

**Context.** Filtering could be done client-side over a JSON payload (instant, no round trips) or
server-side from `searchParams` (shareable, crawlable, works without JavaScript, no payload cost).

**Decision.** Server-side. Filters are a plain `GET` form (works with JS disabled); a small client
component upgrades it to a debounced auto-submit via `router.replace(..., { scroll: false })` inside
`useTransition`, showing a pending state. `q`, `language`, `topic`, `sort` are validated with Zod;
invalid values fall back to defaults instead of erroring.

**Consequences.** (+) Shareable/bookmarkable states, back-button correctness, zero repository JSON shipped
to the browser, accessible by default. (−) Each filter change is a server round trip (~10 ms with a warm
cache); acceptable at this scale, and the pending indicator makes it explicit.
(−) Filter state is not persisted across sessions — intentional (a link should describe its own state).
