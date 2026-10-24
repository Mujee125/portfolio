'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for unexpected render errors. Deliberately generic: no stack
 * trace, no internal detail is shown to the visitor (they are logged server-side).
 */
export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: 'error', event: 'route.error', digest: error.digest ?? null }));
  }, [error]);

  return (
    <div className="container-page py-24">
      <p className="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">Unexpected error</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-muted">
        The page could not be rendered. This has been logged; retrying is safe and will re-run the request.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        Try again
      </button>
    </div>
  );
}
