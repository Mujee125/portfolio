import Link from 'next/link';
import { ArchiveIcon, ForkIcon, GitHubIcon, StarIcon } from '@/components/ui/icons';
import { Badge } from '@/components/layout/Badge';
import { formatCompact, formatDate, languageColour, relativeTime } from '@/lib/format';
import type { Repository } from '@/lib/github/types';

/**
 * Presentational only: every string is rendered as a text node, and the two links
 * are (a) the internal detail page and (b) the canonical GitHub URL that was
 * validated against an allowlist upstream. Nothing here can emit injected markup.
 */
export function RepoCard({ repo, nowMs }: { repo: Repository; nowMs: number }) {
  const updated = relativeTime(repo.pushedAt ?? repo.updatedAt, nowMs);
  const updatedExact = formatDate(repo.pushedAt ?? repo.updatedAt);
  const slug = encodeURIComponent(repo.name);

  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_30px_-24px_var(--ink)] focus-within:border-line-strong motion-reduce:hover:transform-none">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">
          <Link
            href={`/repositories/${slug}`}
            className="rounded font-mono text-[15px] break-words after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]"
          >
            {repo.name}
          </Link>
        </h3>
        {repo.archived ? (
          <span className="shrink-0">
            <Badge tone="outline">
              <ArchiveIcon width={11} height={11} />
              Archived
            </Badge>
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-ink-muted">
        {repo.description ?? <span className="italic">No description provided.</span>}
      </p>

      {repo.topics.length > 0 ? (
        <ul className="mt-3.5 flex flex-wrap gap-1.5" aria-label={`Topics for ${repo.name}`}>
          {repo.topics.slice(0, 4).map((topic) => (
            <li key={topic}>
              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] text-ink-muted">
                {topic}
              </span>
            </li>
          ))}
          {repo.topics.length > 4 ? (
            <li className="self-center font-mono text-[10.5px] text-ink-muted">+{repo.topics.length - 4}</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto pt-5">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-ink-muted">
          {repo.language ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: languageColour(repo.language) }}
              />
              {repo.language}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <StarIcon width={13} height={13} />
            <span className="tabular-nums" title={`${repo.stars} stars`}>
              {formatCompact(repo.stars)}
            </span>
            <span className="sr-only">stars</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <ForkIcon width={13} height={13} />
            <span className="tabular-nums" title={`${repo.forks} forks`}>
              {formatCompact(repo.forks)}
            </span>
            <span className="sr-only">forks</span>
          </span>
          {updated ? (
            <span className="inline-flex items-center gap-1">
              <span className="sr-only">Last push </span>
              <time dateTime={repo.pushedAt ?? repo.updatedAt ?? undefined} title={updatedExact ?? undefined}>
                {updated}
              </time>
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="font-mono text-[11px] text-ink-muted">/{repo.name}</span>
          <a
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 inline-flex items-center gap-1.5 rounded text-[11px] font-medium text-ink-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <GitHubIcon width={13} height={13} />
            Repository
            <span className="sr-only">
              {repo.name} on GitHub (opens in a new tab)
            </span>
          </a>
        </div>
      </div>
    </article>
  );
}
