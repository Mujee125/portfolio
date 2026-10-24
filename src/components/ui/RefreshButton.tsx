'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Re-runs the server render (a real retry of the data fetch) rather than masking
 * the failure with client-side state.
 */
export function RefreshButton({ label = 'Try again' }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-progress disabled:opacity-70"
    >
      {isPending ? 'Retrying…' : label}
    </button>
  );
}
