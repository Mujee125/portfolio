# ADR-0009: Deploy on Vercel, keep the app portable

*Status:* accepted (deployment itself not executed — no credentials) · *Date:* 2026-10-24

**Context.** The app needs a Node runtime (SSR + route handlers), HTTPS, atomic rollbacks and secrets
management.

**Options.** Vercel (native Next.js runtime, preview deploys, instant rollback, free tier, secrets UI);
Cloudflare Workers + OpenNext (cheap at edge scale, extra adapter and runtime differences); self-hosted
Docker on Fly.io/Railway/VPS (full control, patching and TLS to own); Netlify (comparable to Vercel,
marginally less aligned with Next.js internals).

**Decision.** Vercel, with **no Vercel-specific code** — only standard Next.js APIs, so a move costs a
Dockerfile plus an adapter, not a rewrite.

**Consequences.** (+) Zero infrastructure to operate, per-PR previews, one-click rollback, secrets managed
outside the repository. (−) Vendor coupling and per-instance caches (already anticipated in ADR-0003).
(−) Usage limits on the free tier; the app is a handful of KB of HTML per request, which is well inside them.
