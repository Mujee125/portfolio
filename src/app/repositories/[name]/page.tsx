import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/layout/Badge';
import { ErrorState } from '@/components/repo/states';
import { ArchiveIcon, ArrowLeftIcon, ClockIcon, ExternalIcon, ForkIcon, GitHubIcon, StarIcon } from '@/components/ui/icons';
import { getConfig } from '@/lib/config';
import { formatDate, formatNumber, languageColour, relativeFromSeconds } from '@/lib/format';
import { getRepositoryInventoryForRequest } from '@/lib/github';
import type { Repository } from '@/lib/github/types';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ name: string }> };

/**
 * Repository detail pages are resolved from the same cached inventory as the index:
 * no extra GitHub request per page view (ADR-0010), and no possibility of showing a
 * repository that the inclusion policy would exclude.
 */
async function resolveRepository(name: string): Promise<{
  repo: Repository | null;
  inventoryUnavailable: boolean;
  snapshotTimeMs: number;
}> {
  const { inventory } = await getRepositoryInventoryForRequest();
  if (inventory === null) return { repo: null, inventoryUnavailable: true, snapshotTimeMs: 0 };

  const decoded = decodeURIComponent(name).toLowerCase();
  const repo = inventory.repos.find((candidate) => candidate.name.toLowerCase() === decoded) ?? null;
  return { repo, inventoryUnavailable: false, snapshotTimeMs: inventory.generatedAt.getTime() };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params;
  const config = getConfig();
  const { repo } = await resolveRepository(name);

  if (repo === null) {
    return { title: 'Repository not found', robots: { index: false, follow: true } };
  }

  const description = repo.description ?? `${repo.name}, a public repository by ${config.profile.displayName}.`;

  return {
    title: repo.name,
    description,
    alternates: { canonical: `/repositories/${encodeURIComponent(repo.name)}` },
    openGraph: {
      type: 'article',
      title: `${repo.name} · ${config.site.name}`,
      description,
      url: `/repositories/${encodeURIComponent(repo.name)}`,
    },
    twitter: { card: 'summary_large_image', title: repo.name, description },
  };
}

export default async function RepositoryDetailPage({ params }: PageProps) {
  const { name } = await params;
  const config = getConfig();
  const { repo, inventoryUnavailable, snapshotTimeMs } = await resolveRepository(name);

  if (inventoryUnavailable) {
    return (
      <div className="container-page pt-14">
        <BackLink />
        <div className="mt-6">
          <ErrorState failure={null} username={config.profile.username} />
        </div>
      </div>
    );
  }

  if (repo === null) notFound();

  const nowMs = snapshotTimeMs;
  const updated = repo.pushedAt ?? repo.updatedAt;

  return (
    <div className="container-page pt-10 pb-4 sm:pt-14">
      <BackLink />

      <header className="mt-6 border-b border-line pb-8">
        <p className="font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
          {config.profile.username} / repository
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight break-words sm:text-4xl">{repo.name}</h1>
          {repo.archived ? (
            <Badge tone="outline">
              <ArchiveIcon width={12} height={12} />
              Archived — read-only on GitHub
            </Badge>
          ) : null}
        </div>
        <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-muted">
          {repo.description ?? <span className="italic">No description provided.</span>}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] motion-reduce:hover:transform-none"
          >
            <GitHubIcon width={15} height={15} />
            View on GitHub
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          {repo.homepage ? (
            <a
              href={repo.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              <ExternalIcon width={15} height={15} />
              Project site
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid gap-10 pt-8 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="repo-facts">
          <h2 id="repo-facts" className="text-sm font-semibold tracking-[0.14em] text-ink-muted uppercase">
            Repository facts
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
            <Fact label="Primary language">
              {repo.language ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: languageColour(repo.language) }}
                  />
                  {repo.language}
                </span>
              ) : (
                'Not specified'
              )}
            </Fact>
            <Fact label="Licence">{repo.license ?? 'No licence detected'}</Fact>
            <Fact label="Stars">
              <span className="inline-flex items-center gap-1.5">
                <StarIcon width={14} height={14} className="text-ink-muted" />
                {formatNumber(repo.stars)}
              </span>
            </Fact>
            <Fact label="Forks">
              <span className="inline-flex items-center gap-1.5">
                <ForkIcon width={14} height={14} className="text-ink-muted" />
                {formatNumber(repo.forks)}
              </span>
            </Fact>
            <Fact label="Created">{formatDate(repo.createdAt) ?? 'Unknown'}</Fact>
            <Fact label="Last push">
              {updated ? (
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon width={14} height={14} className="text-ink-muted" />
                  {relativeFromSeconds(Math.max(0, Math.round((nowMs - Date.parse(updated)) / 1000)))}
                </span>
              ) : (
                'Unknown'
              )}
            </Fact>
          </dl>

          {repo.topics.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-sm font-semibold tracking-[0.14em] text-ink-muted uppercase">Topics</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {repo.topics.map((topic) => (
                  <li key={topic}>
                    <Link
                      href={`/?topic=${encodeURIComponent(topic)}`}
                      className="inline-flex rounded-full border border-line bg-surface-2 px-2.5 py-1 font-mono text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                    >
                      {topic}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold tracking-[0.14em] text-ink-muted uppercase">Source of truth</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Every value on this page was read from the GitHub REST API; nothing is entered by hand. Readme and
            documentation live on GitHub, which is always the most current view of this repository.
          </p>
          <p className="mt-3 font-mono text-xs break-all text-ink-muted">{repo.url}</p>
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/#work"
      className="inline-flex items-center gap-2 rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
    >
      <ArrowLeftIcon width={15} height={15} />
      All repositories
    </Link>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}
