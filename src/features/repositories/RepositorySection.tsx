import { getConfig } from '@/lib/config';
import { getRepositoryInventoryForRequest } from '@/lib/github';
import { runQuery, type RepositoryQuery } from '@/lib/repos/query';
import { RepoFilters } from '@/components/repo/RepoFilters';
import { RepoGrid } from '@/components/repo/RepoGrid';
import { EmptyState, ErrorState, IncompleteNotice, NoMatchesState, StaleNotice } from '@/components/repo/states';

/**
 * The searchable repository index.
 *
 * Failure transparency is structural here: there is no code path that renders a
 * repository grid without first deciding whether the inventory is complete,
 * stale or absent.
 */
export async function RepositorySection({ query }: { query: RepositoryQuery }) {
  const config = getConfig();
  const { inventory, failure } = await getRepositoryInventoryForRequest();

  if (inventory === null) {
    return <ErrorState failure={failure} username={config.profile.username} />;
  }

  const outcome = runQuery(inventory.repos, config.repos, query);
  // Relative times are anchored to the snapshot instant, not to render time: the same
  // input always renders the same output (React purity) and the labels stay consistent
  // with the snapshot age shown in the panel.
  const nowMs = inventory.generatedAt.getTime();
  const incomplete = inventory.truncated || inventory.skippedItems > 0;

  if (outcome.totalEligible === 0) {
    return (
      <>
        {inventory.stale ? (
          <StaleNotice generatedAt={inventory.generatedAt} ageSeconds={inventory.ageSeconds} failure={failure} />
        ) : null}
        <EmptyState username={config.profile.username} includeForks={config.repos.includeForks} />
      </>
    );
  }

  return (
    <>
      {inventory.stale ? (
        <StaleNotice generatedAt={inventory.generatedAt} ageSeconds={inventory.ageSeconds} failure={failure} />
      ) : null}
      {incomplete ? (
        <IncompleteNotice maxPages={inventory.truncated ? config.repos.maxPages : 0} skippedItems={inventory.skippedItems} />
      ) : null}

      <RepoFilters
        query={outcome.query}
        languages={outcome.languages}
        topics={outcome.topics}
        matched={outcome.matches.length}
        total={outcome.totalEligible}
        hasActiveFilters={outcome.hasActiveFilters}
      />

      <div className="mt-6">
        {outcome.matches.length === 0 ? (
          <NoMatchesState />
        ) : (
          <RepoGrid repos={outcome.matches} nowMs={nowMs} label="Repositories" />
        )}
      </div>
    </>
  );
}
