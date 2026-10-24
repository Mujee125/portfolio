# ADR-0005: Unauthenticated GitHub access by default; optional server-only token

*Status:* accepted · *Date:* 2026-10-24

**Context.** Unauthenticated REST access is 60 requests/hour/IP (verified live). Authenticated is 5,000/hour.
Adding a token means managing a secret with a real, if small, blast radius.

**Decision.** Default to unauthenticated. Support an optional `GITHUB_TOKEN` (fine-grained, read-only,
public-repo scope only) read from the server environment, used only as an `Authorization` header on
requests to the configured API host, never logged, never sent to the browser.
Budget check at the default 15-minute TTL: 4 refreshes/hour × ≤10 pages = ≤40 requests/hour worst case,
inside the 60/hour budget for an account with up to 1,000 repositories.

**Consequences.** (+) No secret to leak in the default configuration. (+) Conditional requests (`304`) only
save quota when authenticated, so the token remains the documented cure for quota pressure.
(−) On a shared-IP host a heavy neighbour could consume the shared quota; the UI degrades visibly and the
token path is documented in `.env.example` and the README.
