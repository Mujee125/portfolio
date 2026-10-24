# ADR-0008: Vitest + Testing Library + Playwright + axe, with a mock GitHub server

*Status:* accepted · *Date:* 2026-10-24

**Context.** Failure paths (rate limits, timeouts, malformed payloads, pagination limits) cannot be
produced reliably against the live API, and live tests are non-deterministic and quota-bound.

**Decision.** Vitest for unit/integration/component tests (fast, ESM-native, built-in coverage) with
`vi.useFakeTimers` for TTL/backoff; Playwright for E2E against a **production build** with
`GITHUB_API_BASE_URL` pointed at a dependency-free local mock server that can switch scenarios at runtime;
`@axe-core/playwright` for WCAG 2.2 AA scanning in both themes and two viewports. A separate opt-in live
smoke script hits the real API and never gates CI.

**Consequences.** (+) Deterministic, fast, no network flakiness in CI. (+) E2E runs the real artifact.
(−) Two configs to maintain; the mock server must be extended when new failure modes appear.
(−) Playwright requires a browser download in CI (~1 min), accepted for real browser coverage.
