# ADR-0007: Nonce-based CSP delivered by `proxy.ts`

*Status:* accepted · *Date:* 2026-10-24

**Context.** A strict CSP is the strongest available defence against injected script, and repository text
is untrusted. Next.js injects inline bootstrap scripts, so `script-src 'self'` alone would break the app,
and `'unsafe-inline'` would defeat the purpose.

**Decision.** Generate a 128-bit random nonce per request in `src/proxy.ts` (Next.js 16's replacement for
`middleware.ts`), set it on the request (so Next.js can stamp its own inline scripts) and on the response
CSP header. `script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src 'self' 'unsafe-inline'` accepted
because the framework emits inline critical CSS and no user-controlled CSS exists.

**Consequences.** (+) Inline script execution is blocked without breaking hydration or the theme bootstrap.
(−) CSP with a per-request nonce requires dynamic rendering — consistent with ADR-0004.
(−) `style-src 'unsafe-inline'` remains (documented residual risk R1). Verified by an E2E test that asserts
the header *and* that the theme script actually ran (nonce correctness), plus a console check for
CSP violations.
