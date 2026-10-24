import Link from 'next/link';
import { formatCompact, formatNumber, relativeFromSeconds } from '@/lib/format';
import { getRepositoryInventoryForRequest } from '@/lib/github';
import { summarise } from '@/lib/repos/query';

/**
 * Live statistics, all derived from the fetched inventory.
 * Nothing here is hard-coded or estimated: if the number is on screen, GitHub said it.
 */
export function StatsPanelSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
      <div className="mt-5 grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="space-y-2">
            <div className="h-7 w-16 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">
        Loading repository statistics…
      </p>
    </div>
  );
}

export async function StatsPanel() {
  const { inventory, failure } = await getRepositoryInventoryForRequest();

  if (!inventory) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-ink-muted uppercase">Live statistics</p>
        <p className="mt-4 text-sm leading-relaxed text-ink">{failure?.message ?? 'Repository data is unavailable.'}</p>
        <p className="mt-2 text-sm text-ink-muted">
          The rest of the page still works; the index below will show the same notice.
        </p>
        <Link
          href="/api/health"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-4"
        >
          View service health
        </Link>
      </div>
    );
  }

  const summary = summarise(inventory.repos);
  const lastPush = summary.lastPushedAt;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] tracking-[0.16em] text-ink-muted uppercase">Live from GitHub</p>
        {inventory.stale ? (
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            Cached
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-teal">
            <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-current" />
            Current
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6">
        <Stat label="Public repositories" value={formatNumber(summary.repositoryCount)} />
        <Stat
          label="Stars across repos"
          value={formatCompact(summary.totalStars)}
          title={`${formatNumber(summary.totalStars)} stars`}
        />
        <Stat label="Languages used" value={formatNumber(summary.languageCount)} />
        <Stat
          label="Last push"
          value={lastPush === null ? '—' : relativeFromSeconds(secondsSince(lastPush, inventory.generatedAt))}
          mono
        />
      </dl>

      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        Snapshot {relativeFromSeconds(inventory.ageSeconds)} · {inventory.pages} API page
        {inventory.pages === 1 ? '' : 's'}
        {inventory.rateLimit?.remaining !== null && inventory.rateLimit?.remaining !== undefined ? ` · ${inventory.rateLimit.remaining} API calls left this hour` : ''}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  title,
  mono = false,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    // DOM order is dt → dd (valid definition-list semantics); flex-col-reverse puts the value first visually.
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-xs leading-snug text-ink-muted">{label}</dt>
      <dd
        className={`text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${mono ? 'font-mono text-xl sm:text-2xl' : ''}`}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

function secondsSince(iso: string, generatedAt: Date): number {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.round((generatedAt.getTime() - time) / 1000));
}
