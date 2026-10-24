# ADR-0002: GitHub is the only source of truth; no database, no CMS

*Status:* accepted · *Date:* 2026-10-24

**Context.** New eligible repositories must appear with no manual data entry, code change or redeploy.
The tempting shortcut is a committed `projects.json` (simple, fast, zero runtime cost) — but it violates
the requirement: it needs a human and a deploy for every new repository.

**Decision.** Repository data is fetched at request time (subject to a TTL cache) from the public GitHub
REST API. No database, no CMS, no admin UI. Presentation-only policy (deny-list, featured list, fork/archived
policy) lives in validated environment configuration, not in data files.

**Consequences.** (+) Zero-maintenance inventory, no schema migrations, no data store to secure or back up.
(−) The site inherits GitHub's availability and rate limits; this is mitigated by the cache, single-flight,
bounded retries and stale-while-error, and made *visible* in the UI. (−) Anything not in the GitHub API
(custom case studies, metrics) is out of scope by design rather than invented.
