# Deployment

> **Status, stated honestly:** the repository is *deployment-ready* and was verified as a local
> production build (`npm run build` + `next start`, all gates green — see
> `docs/delivery-report.md`). It is **not deployed to a public URL**, because this build environment
> has no GitHub or hosting credentials. Everything needed to deploy in one step is below.

## 1. Platform evaluation

| Option | Rendering fit | Caching | Security | Ops | Cost | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Vercel** | First-party Next.js runtime (SSR, route handlers, ISR) | CDN for assets; per-instance function memory | Managed HTTPS, secrets UI, security headers passthrough | Instant rollback, preview deploys per PR | Free tier covers this site by a wide margin | **Chosen** |
| Cloudflare Workers + OpenNext | Needs an adapter; Node APIs (e.g. `next/og`) and middleware parity are extra work | Excellent edge caching | Strong | More moving parts | Cheap at scale | Good future option; not worth the adapter risk for one page |
| Fly.io / Railway / VPS + Docker | Direct Node hosting | Must run a reverse proxy/CDN yourself | You own TLS, patching, firewall | Rollback = redeploy a previous image | Low fixed cost | Documented as a port option |
| Netlify | Comparable to Vercel | CDN | Managed | Similar | Free tier | Viable; slightly less aligned with Next.js internals |

Decision record: [`docs/decisions/0009-hosting-vercel.md`](decisions/0009-hosting-vercel.md).
The application contains **no Vercel-specific code**: only standard Next.js APIs.

## 2. Deploy to Vercel (recommended, ~5 minutes)

1. Push this repository to GitHub (the workflow files already exist under `.github/workflows/`).
2. In Vercel: **Add New → Project → Import** the repository. The framework is auto-detected
   (Next.js); no build settings need changing (`npm run build`, output handled by the platform).
3. Add environment variables (Production **and** Preview):

   | Key | Value |
   | --- | --- |
   | `GITHUB_USERNAME` | your handle — **required** |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-project.vercel.app` (or your domain) — **required** |
   | `SITE_NAME`, `SITE_DESCRIPTION`, `PROFILE_*` | optional identity/links |
   | `GITHUB_FEATURED_REPOS`, `GITHUB_INCLUDED/EXCLUDED` policy vars | optional |
   | `GITHUB_TOKEN` | optional, mark as **Sensitive**, read-only fine-grained token |
   | `GITHUB_CACHE_TTL_SECONDS` | optional (default `900`) |

4. **Deploy.** Then verify:
   - `GET /api/health` → `{"status":"ok","checks":{"cache":"fresh"…}}`
   - `GET /repositories/<a-real-repo>` → 200
   - DevTools → Network → the document response has `content-security-policy` with a `nonce-`.
5. Add the custom domain in **Settings → Domains**, then update `NEXT_PUBLIC_SITE_URL` to the final
   origin and redeploy (canonical URLs and the sitemap depend on it).

### Why no `vercel.json` is needed

Security headers are declared in `next.config.ts` and the CSP is issued per request in `src/proxy.ts`
(Next.js 16's renamed middleware). Adding a `vercel.json` would duplicate that logic — one source of
truth is better.

## 3. Alternative: any Node host (Docker)

```dockerfile
# Save as Dockerfile at the repository root.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start"]
```

```bash
docker build -t github-portfolio .
docker run -p 3000:3000 --env-file .env.production github-portfolio
```

Put it behind a TLS-terminating proxy/CDN (Caddy, nginx, Fly's edge) — HSTS is sent by the app, but
HTTPS must actually exist at the edge.

## 4. Environment configuration reference

See the table in [`README.md`](../README.md#configuration). Secrets policy:

* `GITHUB_TOKEN` is read only by `src/lib/config.ts` on the server. It is never exposed through
  `NEXT_PUBLIC_*`, never logged (the logger redacts anything matching `token|secret|authorization|cookie`),
  and `scripts/check-boundaries.mjs` fails CI if a client component imports the config module.
* `.env`, `.env.local` and variants are git-ignored; `.env.example` contains no values.

## 5. Continuous integration / delivery

| Workflow | Trigger | Gates |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push to `main`, PRs, manual | lint → typecheck → boundaries → tests + coverage → production build → Playwright (E2E, axe, headers) → Core Web Vitals → `npm audit --audit-level=high` |
| `.github/workflows/security.yml` | PRs, push, weekly cron | dependency review (fails on high), CodeQL `security-and-quality` |
| `.github/workflows/live-smoke.yml` | daily cron, manual | live GitHub contract smoke test (non-blocking for releases) |

All workflows run with `permissions: contents: read` (CodeQL adds `security-events: write`), use
`npm ci`, and never expose secrets to pull requests from forks.

> These workflows were **authored and syntax-validated** in this environment but not executed here
> (no GitHub Actions runner available). Every command they run was executed locally and passed; see
> `docs/delivery-report.md` for the exact output.

## 6. Rollback

| Situation | Action | Time |
| --- | --- | --- |
| Bad release on Vercel | **Deployments → previous deployment → Promote to Production** (immutable rollback) | < 1 min |
| Bad release on Docker | `docker run` the previous image tag; keep at least the last two tags | ~ 1 min |
| Bad configuration only | Change the env var and redeploy; no code rollback needed (config is validated at boot) | < 1 min |
| GitHub quota exhausted | Site stays up and shows the rate-limit state; optionally set `GITHUB_TOKEN` and redeploy | < 5 min |
| Upstream contract change | The parse fails closed (`invalid_response`) → users see the error state, not wrong data; pin the API version header or adapt `src/lib/github/schema.ts` | depends |

Verification after any rollback: `curl -s https://<domain>/api/health | jq`. `status: "ok"` plus a
recent `snapshot.generatedAt` means the rollback is healthy.

## 7. Post-deploy operational checklist

- [ ] `/api/health` returns `ok` and a snapshot age below the TTL
- [ ] `/api/repositories` returns `stale:false`, `truncated:false`
- [ ] Security headers present on `/` (CSP nonce, HSTS, nosniff, frame-ancestors)
- [ ] Theme toggle persists across a reload; no console errors
- [ ] `sitemap.xml` lists repository URLs; `robots.txt` points at it
- [ ] Uptime monitor pointed at `/api/health` with an alert on `status: "degraded"`
- [ ] Error-rate/log alerts enabled (Vercel → Logs; look for `github.refresh_failed`)
