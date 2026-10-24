# Security Plan

Threat model for a **public, read-only, unauthenticated** site whose inputs are (a) untrusted strings
from GitHub and (b) user-controlled URL query parameters. There is no login, no user data store and
no write path — but "no login" is *not* the security argument. The argument is the control list below
plus the residual risks in §5.

## 1. Assets

| Asset | Why it matters | Protection |
| --- | --- | --- |
| `GITHUB_TOKEN` (optional) | Read-only access to the account's data; grants 5,000 req/h | Server-only env var, never in `NEXT_PUBLIC_*`, never in logs or error bodies, never sent to the browser; the boundary script fails CI if `lib/github/client` is imported from a client module |
| Site integrity (no injected executable content) | Reputation, visitor safety | React escaping, no `dangerouslySetInnerHTML` anywhere, strict CSP, outbound URL allowlist |
| Availability of the site | A dead portfolio is a failed portfolio | Single-flight, TTL cache, bounded retries, stale fallback, page cap, no retry storms |
| GitHub API quota | Exhaustion makes the site degrade | Cache + conditional requests + serial paging + optional token |
| Build/release integrity | Supply chain | Lockfile `npm ci`, pinned direct deps, `npm audit --audit-level=high`, dependency review, CodeQL, least-privilege workflow permissions |

## 2. OWASP Top 10:2025 mapping

| Risk | Applicability here | Controls implemented |
| --- | --- | --- |
| **A01 Broken Access Control** | No user objects. Access control = "only public data is exposed". | Only public endpoints are read; `private`/`disabled` repos are filtered out even if the API ever returned them for an authenticated token; no route accepts an arbitrary URL/user parameter (the username is server config, not user input) |
| **A02 Security Misconfiguration** | High — headers and CSP are the main defence | CSP with per-request nonce (no `unsafe-inline` for scripts), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/mic/geo, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `poweredByHeader: false`, no directory listing, `robots`/`sitemap` intentional, no stack traces in production responses |
| **A03 Software Supply Chain Failures** | Direct dependency risk is small; transitive is not | Exact pinned direct versions, committed lockfile, `npm ci` in CI, `npm audit`, `actions/dependency-review-action`, CodeQL (JS/TS), workflow `permissions: contents: read` default, GitHub-hosted runners, no postinstall scripts of our own, no third-party runtime script or font CDN |
| **A04 Cryptographic Failures** | No secrets at rest, no PII | HTTPS-only upstream (`https:` enforced on the API base URL and on every `link` URL); token, if set, is only ever sent to `api.github.com`; no cookies for tracking (theme choice stored in `localStorage`, non-sensitive) |
| **A05 Injection** | Repo descriptions/topics are attacker-controlled text; `q`, `language`, `topic`, `sort` are attacker-controlled query values | All strings rendered as React text nodes (auto-escaped); **no `dangerouslySetInnerHTML`, no `innerHTML`, no template-string HTML, no `eval`**; query params parsed by Zod with length caps and enums before use; no SQL/shell/template injection surface (no DB, no shell call with input); outbound `href`s validated against a host allowlist (`github.com`, configured homepage hosts via http/https only) so `javascript:`/`data:` URLs can never be emitted |
| **A06 Insecure Design** | The "dynamic, no manual data" requirement invites risky shortcuts (e.g. rendering README HTML, or trusting arbitrary URLs) | Deliberate scope limits recorded as ADRs: no README rendering (ADR-0010), no client-side token, no unbounded pagination, explicit failure states, single upstream cache |
| **A07 Authentication Failures** | No authentication exists — nothing to fail | Nothing to implement; documented as a deliberate non-goal. Any future auth (e.g. admin pinning) requires a new threat model |
| **A08 Software or Data Integrity Failures** | Untrusted upstream data treated as truth | Zod schema validation of every upstream payload; URL validation; no deserialisation of untrusted objects; no `JSON.parse` of user input server-side; SRI not needed (no third-party scripts) |
| **A09 Security Logging and Alerting Failures** | Silent failures are the realistic failure mode | Structured JSON logs for refresh outcomes (kind, status, duration, page, rate-limit remaining) with an explicit redaction list; `/api/health` exposes degraded state for external uptime monitors; no tokens/cookies/headers logged |
| **A10 Mishandling of Exceptional Conditions** | Upstream failures are expected, not exceptional | Typed error taxonomy, no `catch {}` swallowing, no "empty list" on failure (would misrepresent the inventory), bounded retry with backoff + jitter, stale-if-error, React `error.tsx` boundary, 404 for unknown repositories, no unbounded retries |

## 3. Content Security Policy

Delivered by `src/proxy.ts` (Next.js 16's renamed middleware) as a request+response header so Next.js
can propagate the nonce to its own inline bootstrap scripts:

```
default-src 'self';
script-src 'self' 'nonce-{random}' 'strict-dynamic';
style-src 'self' 'unsafe-inline';           # Next.js injects inline style tags; no user CSS reaches here
img-src 'self' data:;                        # no remote images (no avatar/external asset fetch)
font-src 'self';
connect-src 'self';                          # browser never calls api.github.com directly
object-src 'none';
base-uri 'none';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

`style-src 'unsafe-inline'` is the one accepted relaxation: React/Next inject inline `<style>` for
critical CSS, and there is no user-controlled CSS. Inline **script** execution remains blocked, which is
where XSS payloads actually execute. This is recorded as a residual risk in §5, not as a claim of perfection.

Verification: Playwright asserts the CSP header is present, that no page console contains a CSP
violation, and that the theme bootstrap script still runs (proving the nonce works rather than silently
breaking the feature). Two themes are scanned with axe in the same run.

## 4. Runtime hardening

* **Timeouts** everywhere: 8 s per upstream request via `AbortSignal.timeout`.
* **Bounded retries**: ≤2, exponential backoff (250 ms, 1 s) + full jitter, and *never* when the failure
  is a rate limit with a known reset — retrying then is what gets integrations banned.
* **Single-flight**: concurrent renders share one in-flight refresh (no request amplification).
* **Page cap**: `GITHUB_MAX_PAGES` (default 10 → ≤10 calls per refresh).
* **No unbounded input**: query strings capped at 100 chars, sort is an enum, `per_page` fixed server-side.
* **Redirect safety**: `link` header URLs must match the configured API host and `https:`; we never fetch
  a URL supplied by the browser.
* **Dependency policy**: exact versions for direct deps, lockfile committed, `npm ci`, audit + CodeQL +
  dependency review in CI, Dependabot-compatible manifest layout.
* **Least privilege in CI**: `permissions: contents: read` on quality workflows; deployment credentials are
  never exposed to PR-triggered workflows.

## 5. Residual risks & explicit limitations

| # | Residual risk | Severity | Why accepted / mitigation |
| --- | --- | --- | --- |
| R1 | `style-src 'unsafe-inline'` | Low | Required by the framework's inline critical CSS; no user-controlled CSS exists. Script execution is still nonce-gated. |
| R2 | GitHub content is trusted for *display* after validation; a hostile repository description could still be socially engineered text (phishing copy) | Low | Text is escaped; links never derive from description text; only validated `homepage`/`html_url` become links, with `rel="noopener noreferrer"` and external-link indication |
| R3 | In-process cache means serverless instances diverge briefly; an uptime check may see a "stale" instance | Low | Bounded by TTL; the health endpoint reports per-instance truth rather than pretending to be global |
| R4 | Rate-limit exhaustion by a traffic spike on cold instances | Medium | Page cap, single-flight, stale fallback, optional token documented; the UI degrades visibly rather than breaking |
| R5 | No WAF/rate limiting on our own origin (static-ish rendering is cheap, but `/api/*` is unbounded) | Low | Platform-level protection available on Vercel; documented as an operational follow-up |
| R6 | Token, if used, is a long-lived PAT | Medium | Documented migration to a GitHub App installation token (short-lived, narrow scope) as the next step; token is read-only and server-side only |
| R7 | CI/CD workflows were authored but **not executed** in this environment (no GitHub runner) | Medium | Every command the workflows run was executed locally with the same Node version; workflow YAML is syntax-validated; this is stated explicitly rather than claimed as verified |
| R8 | No penetration test or third-party security review was performed | — | Not claimed. The controls above are the design baseline, not a certification |

## 6. Security checklist (gates in CI)

- [x] No secret in repo (`GITHUB_TOKEN` only via env/secret, `.env*` git-ignored, `.env.example` has no values)
- [x] `dangerouslySetInnerHTML` absent — enforced by `scripts/check-boundaries.mjs`
- [x] Client bundles free of server modules — enforced by `scripts/check-boundaries.mjs` + build inspection
- [x] Security headers + CSP asserted by an E2E test
- [x] `npm audit --audit-level=high` in CI
- [x] CodeQL (JS/TS) + dependency review workflows
- [x] Error responses contain no upstream body / stack trace (unit-tested)
- [x] Outbound URLs validated against an allowlist (unit-tested with `javascript:` and foreign-host payloads)
