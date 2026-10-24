import Link from 'next/link';
import { AlertIcon, ClockIcon, EmptyIcon } from '@/components/ui/icons';
import { RefreshButton } from '@/components/ui/RefreshButton';
import type { Failure } from '@/lib/github/errors';
import { formatDateTimeUtc, relativeFromSeconds } from '@/lib/format';

const panel = 'rounded-xl border border-line bg-surface p-6 sm:p-8';

export function ErrorState({
  failure,
  username,
  showRetry = true,
}: {
  failure: Failure | null;
  username: string;
  showRetry?: boolean;
}) {
  const isRateLimited = failure?.kind === 'rate_limited';
  const retryAt = failure?.retryAt ?? null;

  return (
    <div className={panel} role="alert">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 text-accent">
          {isRateLimited ? <ClockIcon width={20} height={20} /> : <AlertIcon width={20} height={20} />}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {isRateLimited ? 'GitHub rate limit reached' : 'Repositories are unavailable right now'}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {failure?.message ?? 'The repository list could not be loaded.'}{' '}
            {isRateLimited && retryAt
              ? `The quota resets at ${formatDateTimeUtc(retryAt) ?? 'an unknown time'}.`
              : null}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            This page never shows a partial or failed result as a complete list, so nothing is displayed rather
            than something misleading. The GitHub profile is always available directly.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {showRetry ? <RefreshButton /> : null}
            <a
              href={`https://github.com/${username}?tab=repositories`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-accent underline underline-offset-4 hover:text-ink"
            >
              Open repositories on GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when a snapshot exists but the newest refresh failed. The data on screen is
 * real, but it is explicitly labelled with its age so it cannot be mistaken for current.
 */
export function StaleNotice({
  generatedAt,
  ageSeconds,
  failure,
}: {
  generatedAt: Date;
  ageSeconds: number;
  failure: Failure | null;
}) {
  return (
    <div
      role="status"
      className="mb-5 flex flex-col gap-3 rounded-xl border border-line-strong bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm leading-relaxed text-ink">
        <strong className="font-semibold">Cached snapshot.</strong>{' '}
        <span className="text-ink-muted">
          Showing data from {formatDateTimeUtc(generatedAt) ?? 'an earlier refresh'} ({relativeFromSeconds(ageSeconds)}).{' '}
          {failure?.message ?? 'The latest refresh failed.'}
        </span>
      </p>
      <RefreshButton label="Refresh" />
    </div>
  );
}

/** The inventory is knowingly incomplete (page cap hit, or entries GitHub returned could not be read). */
export function IncompleteNotice({ maxPages, skippedItems }: { maxPages: number; skippedItems: number }) {
  return (
    <p
      role="status"
      className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-4 text-sm leading-relaxed text-ink-muted"
    >
      <AlertIcon width={16} height={16} className="mt-0.5 shrink-0 text-accent" />
      <span>
        <strong className="font-semibold text-ink">This list may be incomplete.</strong>{' '}
        {maxPages > 0 ? `Only the first ${maxPages} API pages are read. ` : ''}
        {skippedItems > 0
          ? `${skippedItems} ${skippedItems === 1 ? 'entry' : 'entries'} returned by GitHub could not be interpreted and were skipped.`
          : ''}{' '}
        The GitHub profile lists everything.
      </span>
    </p>
  );
}

export function EmptyState({ username, includeForks }: { username: string; includeForks: boolean }) {
  return (
    <div className={panel}>
      <span aria-hidden="true" className="text-ink-muted">
        <EmptyIcon width={22} height={22} />
      </span>
      <h3 className="mt-3 text-base font-semibold">No eligible public repositories yet</h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">
        Repositories are read live from{' '}
        <a
          href={`https://github.com/${username}?tab=repositories`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent underline underline-offset-4 hover:text-ink"
        >
          github.com/{username}
        </a>
        . {includeForks ? 'Forks are currently included. ' : 'Forks are excluded by default. '}
        Anything new and public appears here automatically after the next refresh, with no redeploy.
      </p>
    </div>
  );
}

export function NoMatchesState() {
  return (
    <div className={panel}>
      <h3 className="text-base font-semibold">No repositories match those filters</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Try a shorter search term, or remove the language and topic filters.
      </p>
      <Link
        href="/"
        className="mt-4 inline-flex rounded text-sm font-semibold text-accent underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        Clear all filters
      </Link>
    </div>
  );
}
