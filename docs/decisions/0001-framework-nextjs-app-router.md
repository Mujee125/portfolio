# ADR-0001: Next.js 16 App Router + React 19 + strict TypeScript

*Status:* accepted · *Date:* 2026-10-24

**Context.** The site must be server-rendered (crawlable, fast first paint, no client-side data fetch that
would require a token in the browser), cacheable, and deployable without a server to operate. The brief
suggests React + TypeScript with SSR/caching and asks to evaluate the Next.js App Router.

**Options.** (a) Vite + React SPA with a separate data service — an extra deployable, and SEO/initial-paint
loss; (b) Astro + React islands — excellent static performance but adds a second mental model for a
single-page-plus-detail app, and the "always fresh" requirement needs a runtime anyway; (c) Next.js App
Router — SSR/RSC, route handlers, metadata API, built-in image/font/asset pipeline, one deployable;
(d) Remix/React Router 7 — comparable, smaller ecosystem for metadata/OG conventions.

**Decision.** Next.js **16.4.3** (App Router, Turbopack default), React **19.3.1**, TypeScript **5.9.3** strict.

**Consequences.** (+) One deployable, first-class metadata/sitemap/route handlers, per-request rendering with
an explicit cache of our own. (−) Framework coupling; Next 16 removed `next lint` and renamed
`middleware.ts` → `proxy.ts`, so docs must track the current major. (−) TypeScript is pinned to 5.9 because
7.x and Vitest 5 / jsdom 30 are outside the Node 20 engine range of this environment (see research §1.3).
