import { getConfig } from '@/lib/config';
import { getRepositoryInventoryForRequest } from '@/lib/github';
import { selectFeatured } from '@/lib/repos/query';
import { RepoGrid } from '@/components/repo/RepoGrid';

/**
 * A short, editorially-curated strip above the full index.
 * Hidden entirely when the inventory is unavailable or empty: an empty shell would
 * imply "there is nothing to show", which is a different claim from "we could not load it".
 */
export async function FeaturedSection() {
  const config = getConfig();
  const { inventory } = await getRepositoryInventoryForRequest();
  if (inventory === null) return null;

  const featured = selectFeatured(inventory.repos, config.repos);
  if (featured.length === 0) return null;

  const pinned = config.repos.featured.length > 0;

  return (
    <section aria-labelledby="featured-heading" className="container-page scroll-mt-24 pt-14 sm:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">
            {pinned ? 'Pinned' : 'Highlights'}
          </p>
          <h2 id="featured-heading" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {pinned ? 'Selected work' : 'Most starred work'}
          </h2>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
          {pinned
            ? 'Curated through configuration (GITHUB_FEATURED_REPOS).'
            : 'Chosen automatically from the repository inventory by star count.'}
        </p>
      </div>
      <div className="mt-6">
        <RepoGrid repos={featured} nowMs={inventory.generatedAt.getTime()} label="Featured repositories" />
      </div>
    </section>
  );
}

export function FeaturedSectionSkeleton() {
  return (
    <section aria-hidden="true" className="container-page pt-14 sm:pt-16">
      <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
      <div className="mt-3 h-7 w-64 animate-pulse rounded bg-surface-2" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="rounded-xl border border-line bg-surface p-5">
            <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
