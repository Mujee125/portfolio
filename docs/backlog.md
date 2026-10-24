# Product Backlog & Scrum Plan

**Team:** one engineer (full delivery role set). **Cadence:** 3 sprints, each ending in a working,
demoable increment. **Estimation:** story points, Fibonacci, relative complexity/risk.

## Product vision

"Recruiters and engineers can see, in under 10 seconds, what I have actually shipped — and the site
keeps itself current from GitHub without me touching it."

## Ordered Product Backlog

| # | Story | Points | Priority | Acceptance criteria | Deps |
| --- | --- | --- | --- | --- | --- |
| P1 | Research current API/framework/security/a11y facts and record verified vs assumed | 3 | Must | `docs/research.md` with citations, a version-compatibility table, and an assumptions/risks table | — |
| P2 | Requirements, architecture, API contract, security plan, test plan, ADRs | 5 | Must | Documents exist, agree with each other, and are later kept in sync with code | P1 |
| P3 | Project foundation: Next.js 16 + TS strict + Tailwind 4, lint/format/typecheck, boundary checker | 3 | Must | `npm run lint`, `typecheck`, `check:boundaries`, `build` green on an empty app | P2 |
| P4 | Config module with validated env (username, profile, links, policy, cache) | 3 | Must | Invalid config fails fast with an actionable message; `.env.example` is secret-free | P3 |
| P5 | GitHub client: serial paging via `link`, conditional requests, timeout, typed errors | 5 | Must | Integration tests cover 3-page pagination, 304, timeout, 429, malformed, page cap | P4 |
| P6 | Inventory cache: TTL, single-flight, stale-while-error + inventory result union | 3 | Must | Fake-timer tests prove freshness, single-flight and stale fallback; no partial data reported as complete | P5 |
| P7 | Eligibility policy + domain mapping (forks, archived, disabled, deny-list, featured) | 3 | Must | Unit tests for every policy branch and for hostile/missing field values | P6 |
| P8 | Design system + shell: tokens, typography, light/dark themes with no flash, header/footer, skip link | 5 | Must | Theme respects system, persists, applies before paint; axe clean | P3 |
| P9 | Hero + honest live stats (counts computed from the inventory) | 3 | Must | No fabricated metrics; stats labelled as derived from GitHub; empty/error variants | P8, P6 |
| P10 | Repository grid, cards, featured section, archived badge, missing-field fallbacks | 5 | Must | Visual + a11y checks in both themes and 3 breakpoints | P7, P8 |
| P11 | Search / language / topic filters and sorting, all URL-driven and shareable | 5 | Must | Works without JS; URL round-trips; invalid params fall back; results count announced | P10 |
| P12 | Repository detail pages, 404 handling, canonical + sitemap entries | 3 | Must | Detail page renders from the cached inventory; unknown name → 404 | P10 |
| P13 | Failure UX: skeleton, empty, stale banner, rate-limited, error+retry, truncated notice | 5 | Must | Each state is reachable in tests and conveys what is incomplete | P6, P10 |
| P14 | Security hardening: CSP nonce via `proxy.ts`, headers, URL allowlist, log redaction | 5 | Must | E2E asserts headers and absence of CSP violations; unit tests for URL allowlist | P10 |
| P15 | Metadata, OG image, robots, sitemap, semantic structure | 3 | Should | E2E assertions on title/canonical/OG/sitemap | P12 |
| P16 | Test suite: unit, integration, component, E2E, axe, keyboard path | 8 | Must | All layers present; failure paths covered; `npm run test:all` green | P5–P14 |
| P17 | CI/CD workflows: quality gates, security scanning, live smoke schedule, deploy docs | 3 | Must | Workflow YAML validated; every command mirrored locally and green | P16 |
| P18 | Performance measurement + optimisation to CWV targets | 3 | Should | `npm run perf` reports LCP/CLS/TTFB on a documented profile; misses documented | P16 |
| P19 | README, deployment/rollback runbook, delivery report | 3 | Must | A new maintainer can run, change config and deploy from the docs alone | P17 |
| P20 | *(Next)* GitHub App token instead of PAT; optional webhook-triggered revalidation | 3 | Could | Deferred: needs a secret + public endpoint; not required at 15-min freshness | P6 |
| P21 | *(Next)* Docker/self-host packaging, `Cache-Control` CDN tuning | 2 | Could | Deferred with the Vercel decision (ADR-0009) | P19 |
| P22 | *(Next)* Optional README summary rendering (sanitised, cached) | 5 | Won't (for now) | Rejected in ADR-0010 for quota + XSS reasons; revisit with a token | — |

## Sprint 1 — Discovery & foundation (goal: a solid, verifiable skeleton)

*Committed:* P1, P2, P3, P4, half of P5.
*Outcome:* researched, documented, config-validated, buildable app with a typed GitHub client skeleton.
*Risks:* version incompatibility on Node 20 (materialised — resolved by pinning, see research §1.3).

## Sprint 2 — Functional product (goal: the real product, working end to end)

*Committed:* P5 (finish), P6, P7, P8, P9, P10, P11, P12.
*Outcome:* a visitor can browse, search, filter, sort, open details, and switch themes; new repos appear
after the TTL.
*Risks:* cache/UX interaction for failure states (P13 moved into Sprint 3 only if it slips).

## Sprint 3 — Hardening & release (goal: shippable and provable)

*Committed:* P13, P14, P15, P16, P17, P18, P19.
*Outcome:* security headers verified in a real browser, full test pyramid green, CI authored,
performance measured, docs complete, delivery report written.

## Ceremonies (adapting Scrum to a single engineer)

| Ceremony | How it is applied here |
| --- | --- |
| Sprint planning | Backlog refined at the top of each sprint; sprint goal recorded above |
| Daily stand-up | Replaced by the per-increment report (implemented / files / tests / risks / next) |
| Sprint review | Working increment executed for real: build, tests, browser verification |
| Retrospective | "What the evidence changed" notes → ADRs and backlog re-prioritisation |
| Definition of Done | See `docs/requirements.md` §7 |

## Prioritisation rationale

Correctness and *honesty of data* (never showing a partial inventory as complete) outrank visual polish;
security headers and accessibility outrank motion/animation; anything requiring a secret or a public
webhook is deferred until the core product is provably working.
