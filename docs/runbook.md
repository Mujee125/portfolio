# Operations Runbook

The site is read-only and stateless apart from one in-process cache. Everything below is diagnosable
from two endpoints and the log stream.

## Signals

| Signal | Where | Meaning |
| --- | --- | --- |
| `GET /api/health` | HTTP | `status: ok` + `checks.cache: fresh` = healthy. `degraded` = last refresh failed or cache empty |
| `snapshot.cacheAgeSeconds` | `/api/health` | Age of the last successful GitHub read; alert if consistently > 2× TTL |
| `snapshot.truncated` / `snapshot.skippedItems` | `/api/health` | Inventory is knowingly incomplete |
| `github.refresh_ok` | logs (JSON) | One line per successful refresh: pages, repository count, duration, rate-limit remaining |
| `github.refresh_failed` | logs (JSON) | `kind` is one of `rate_limited`, `timeout`, `upstream`, `invalid_response`, `not_found`, plus whether stale data was served |
| `route.error` | logs (JSON) | An unexpected render error (has a digest for correlation) |

Logs are single-line JSON and never contain tokens, cookies or upstream bodies.

## Alerting recommendations

1. **Availability:** synthetic check on `/api/health` every 5 minutes; alert if non-200 for 2 checks.
2. **Freshness:** alert if `snapshot.cacheAgeSeconds > 3600` (4× the 15-minute TTL).
3. **Rate limit:** alert if `checks.github == "rate_limited"` for 15 minutes.
4. **Incomplete inventory:** alert if `snapshot.truncated == true` for more than a day.

## Playbooks

### 1. "GitHub rate limit reached" in the UI / `checks.github: rate_limited`

Cause: the unauthenticated 60 requests/hour budget (shared per egress IP) is exhausted.

* Confirm the reset time: `curl -s https://<domain>/api/health | jq .rateLimit`.
* Immediate: nothing to do — the site serves cached data (if within `GITHUB_STALE_MAX_SECONDS`) and
  tells users when the quota resets.
* Durable fix: create a fine-grained, read-only token with **Public repositories** access, set
  `GITHUB_TOKEN` as a sensitive environment variable, redeploy. Budget becomes 5,000/hour.
* If usage is still high, raise `GITHUB_CACHE_TTL_SECONDS` (e.g. 1800) — the requirement is "new repos
  appear automatically", not "instantly".

### 2. "Repositories are unavailable right now" / `checks.github: upstream|timeout`

* Check GitHub status: <https://www.githubstatus.com/>.
* If GitHub is healthy, check the deployment's network egress and `GITHUB_API_BASE_URL`.
* `timeout` with every request: verify `GITHUB_REQUEST_TIMEOUT_MS` is not set absurdly low.
* Recovery is automatic on the next request after the TTL; no restart needed.

### 3. "This list may be incomplete"

* `truncated: true` → the account has more repositories than `GITHUB_MAX_PAGES × 100`. Raise the cap
  (each page is one API call) or accept the disclosure.
* `skippedItems > 0` → GitHub returned entries the schema rejected. Inspect the log line
  `github.refresh_ok` (`skippedItems`), compare with `GET /users/<user>/repos`, and extend
  `src/lib/github/schema.ts` if GitHub added a required-shape change.

### 4. New repository does not appear

1. Is it public? Private repositories are excluded by design.
2. Is it a fork? Forks are excluded unless `GITHUB_INCLUDE_FORKS=true`.
3. Is it in `GITHUB_EXCLUDED_REPOS`?
4. Wait `GITHUB_CACHE_TTL_SECONDS` (default 900 s) — the cache is time-based, not webhook-driven.
5. Still missing: `curl -s https://<domain>/api/repositories | jq '.meta, (.data|map(.name))'`.

### 5. `status: degraded` with `config` failing

Configuration is validated at boot; a bad value prevents the deployment from starting (Vercel shows a
build/boot error). Fix the named variable and redeploy. Common causes: `NEXT_PUBLIC_SITE_URL` missing
in production, `GITHUB_USERNAME` with a trailing hyphen, or `GITHUB_API_BASE_URL` overridden without
`ALLOW_NON_DEFAULT_GITHUB_API=true`.

### 6. Unexpected render error (`route.error`)

* Correlate the `digest` with the platform log stream.
* Roll back: Vercel → Deployments → previous → **Promote to Production**.
* Then reproduce locally with the same env: `npm run build && npm start`.

## Routine maintenance

| Cadence | Task |
| --- | --- |
| Weekly | Review `npm audit` / CodeQL / dependency-review results (automated in `security.yml`) |
| Monthly | Check `/api/health` trend for `cacheAgeSeconds` growth and rate-limit pressure |
| Quarterly | Re-read the ADRs against reality; re-run `npm run perf` and record results |
| On Node major upgrade | Update `engines`, `.nvmrc`, CI `node-version`, then unpin the toolchain (ADR-0011) |
