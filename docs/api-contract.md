# API Contract

Two HTTP surfaces exist: the **GitHub REST API we consume** (client side of the contract) and the
**JSON endpoint we publish** (server side). Both are specified here; both are covered by tests.

---

## 1. Consumed: GitHub REST API

### 1.1 Request

```
GET https://api.github.com/users/{GITHUB_USERNAME}/repos
    ?per_page=100&type=owner&sort=updated&page={n}
Headers:
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2026-03-10
  User-Agent: github-portfolio (+site URL)
  If-None-Match: {etag}          # when a previous response for this URL provided one
  Authorization: Bearer {token}  # only when GITHUB_TOKEN is configured (server-side only)
```

* Requests are **serial** (one page at a time) — GitHub's own guidance, and it avoids secondary limits.
* Pagination follows the `link` header, `rel="next"`. The URL is re-validated before use:
  scheme must be `https:` (or the configured base), host must equal the configured API host.
  A `link` URL pointing anywhere else is rejected → typed `invalid_response` error. (SSRF / open-redirect guard.)
* `per_page=100` is the documented maximum; if the account ever needed more, `GITHUB_MAX_PAGES` bounds it.

### 1.2 Response fields consumed

| Field | Type | Handling of absence |
| --- | --- | --- |
| `name` | string | Required. Entry rejected if missing (name is the URL key). |
| `full_name` | string | Falls back to `{username}/{name}` |
| `html_url` | string | Validated: must be `https://github.com/{user}/{name}` shape (host allowlist); otherwise the app synthesises the canonical URL |
| `description` | string \| null | Rendered as "No description provided." |
| `language` | string \| null | Language chip omitted |
| `topics` | string[] (may be absent) | Empty list |
| `stargazers_count`, `forks_count` | number | Default 0 |
| `archived`, `fork`, `disabled`, `private` | boolean | Default `false` |
| `updated_at`, `pushed_at`, `created_at` | ISO 8601 string | Falls back to `updated_at`, then omitted from display |
| `homepage` | string \| null | Not rendered as a link unless it passes URL validation (http/https only) |
| `license.spdx_id` | string \| null | Optional chip |

Any field may be `null`; unknown extra fields are ignored (forward-compatible parsing).
The schema is `z.object(...)` with **passthrough-off** parsing of only the consumed subtree, so a GitHub
addition cannot break the app.

### 1.3 Status handling

| Status | Meaning | Client action |
| --- | --- | --- |
| 200 | OK | Parse, store ETag, continue pagination |
| 304 | Not modified | Reuse previously cached page (only possible when a token is configured) |
| 401/403 with `x-ratelimit-remaining: 0` | Primary rate limit | `RateLimitedError` carrying `resetAt`; **no retry before reset** |
| 403/429 with `retry-after` | Secondary rate limit | `RateLimitedError` carrying `retryAfter`; no retry before it |
| 404 | Unknown user | `NotFoundError` |
| 5xx | Upstream failure | Bounded retry (≤2, exponential + jitter), then `UpstreamError` |
| network error / abort | Timeout | `TimeoutError` (8 s) |
| 2xx with unparsable body | Contract violation | `InvalidResponseError` |

Rate-limit headers are parsed into `{ limit, remaining, used, resetAt }` and exposed by
`/api/health` and the inventory metadata. Log lines never include the `Authorization` header.

---

## 2. Published: `GET /api/repositories`

### 2.1 Query parameters

| Param | Type | Default | Validation |
| --- | --- | --- | --- |
| `q` | string | `""` | trimmed, ≤ 100 chars |
| `language` | string | none | ≤ 50 chars, case-insensitive match |
| `topic` | string | none | ≤ 50 chars, case-insensitive match |
| `sort` | enum | `updated` | one of `updated`, `stars`, `name`, `created` |
| `includeArchived` | `true`/`false` | `true` | boolean literal |

Invalid values return `400` with a structured error (never a 500).

### 2.2 Success `200`

```jsonc
{
  "meta": {
    "username": "octocat",
    "generatedAt": "2026-10-24T09:12:00.000Z",   // when this snapshot was fetched from GitHub
    "cacheAgeSeconds": 42,
    "stale": false,                              // true => served from cache after a failed refresh
    "truncated": false,                          // true => GITHUB_MAX_PAGES reached, inventory incomplete
    "rateLimit": { "limit": 60, "remaining": 57, "resetAt": "2026-10-24T10:00:00.000Z" },
    "totalMatched": 2,
    "totalEligible": 8
  },
  "data": [
    {
      "name": "hello-world",
      "fullName": "octocat/hello-world",
      "description": "My first repository on GitHub!",
      "url": "https://github.com/octocat/hello-world",
      "homepage": null,
      "language": "TypeScript",
      "topics": ["cli", "demo"],
      "stars": 12,
      "forks": 3,
      "archived": false,
      "isFeatured": false,
      "createdAt": "2026-01-05T10:00:00.000Z",
      "updatedAt": "2026-10-20T11:30:00.000Z",
      "pushedAt": "2026-10-19T22:04:00.000Z",
      "license": "MIT"
    }
  ]
}
```

### 2.3 Errors

```jsonc
// 400 — invalid query
{ "error": { "code": "invalid_query", "message": "Invalid query parameters", "details": [ /* field, message */ ] } }

// 502 — upstream failure with no usable cache
{ "error": { "code": "github_unavailable", "message": "GitHub data is temporarily unavailable" } }

// 503 — rate limited with no usable cache
{ "error": { "code": "github_rate_limited", "message": "GitHub rate limit reached", "retryAt": "2026-10-24T10:00:00.000Z" } }
```

Error bodies never contain upstream response bodies, stack traces, tokens or internal URLs.

### 2.4 Headers

`Cache-Control: public, s-maxage=300, stale-while-revalidate=600`, `Content-Type: application/json; charset=utf-8`,
`X-Content-Type-Options: nosniff`. Rate-limited responses add `Retry-After` (seconds).

---

## 3. Published: `GET /api/health`

`200` (healthy or degraded — the process is up, `status` tells you whether data is trustworthy):

```jsonc
{
  "status": "ok",              // ok | degraded
  "checks": {
    "config": "ok",
    "github": "ok",            // last refresh succeeded
    "cache": "fresh"           // fresh | stale | empty
  },
  "snapshot": { "generatedAt": "2026-10-24T09:12:00.000Z", "cacheAgeSeconds": 42, "repositoryCount": 8 },
  "rateLimit": { "remaining": 57, "limit": 60, "resetAt": "2026-10-24T10:00:00.000Z" }
}
```

`status: "degraded"` when the last refresh failed or the cache is empty. `Cache-Control: no-store`.
No secret, token, or environment value is ever echoed.

---

## 4. Internal TypeScript contract (`lib/github`)

```ts
type RepositoryInventory = {
  repos: Repository[];          // all eligible repos (policy already applied)
  generatedAt: Date;            // when GitHub was successfully read
  truncated: boolean;           // page cap hit → inventory is incomplete
  stale: boolean;               // served after a failed refresh
  rateLimit: RateLimitSnapshot | null;
};

type InventoryFailure =
  | { kind: 'rate_limited'; retryAt: Date | null }
  | { kind: 'timeout' }
  | { kind: 'upstream'; status?: number }
  | { kind: 'invalid_response'; reason: string }
  | { kind: 'not_found' }
  | { kind: 'config'; reason: string };

type InventoryResult =
  | { ok: true; inventory: RepositoryInventory }
  | { ok: false; failure: InventoryFailure; staleInventory: RepositoryInventory | null };
```

`getRepositoryInventory()` never throws for expected upstream failures; it returns a discriminated union,
which is what forces the UI to have a failure path.
