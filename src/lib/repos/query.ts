import type { RepositoryPolicy } from '../config';
import type { Repository } from '../github/types';

export const SORT_OPTIONS = ['updated', 'stars', 'name', 'created'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export type RepositoryQuery = {
  readonly q: string;
  readonly language: string | null;
  readonly topic: string | null;
  readonly sort: SortOption;
};

export const DEFAULT_QUERY: RepositoryQuery = { q: '', language: null, topic: null, sort: 'updated' };

export type Facet = { readonly value: string; readonly count: number };

export type QueryOutcome = {
  readonly query: RepositoryQuery;
  readonly matches: readonly Repository[];
  readonly featured: readonly Repository[];
  readonly languages: readonly Facet[];
  readonly topics: readonly Facet[];
  readonly totalEligible: number;
  readonly hasActiveFilters: boolean;
};

/**
 * Inclusion policy, applied once per refresh (so the cache stores exactly what may be shown).
 *  - private / disabled repositories are never shown, even if a token were ever to return them;
 *  - forks are excluded unless configured otherwise (verified: `type=owner` includes forks);
 *  - archived repositories are shown unless excluded, and are badged in the UI.
 */
export function applyInclusionPolicy(repos: readonly Repository[], policy: RepositoryPolicy): Repository[] {
  // Defensive lower-casing: configuration already normalises, but the policy must not
  // depend on the caller having done so.
  const excluded = new Set(policy.excluded.map((name) => name.toLowerCase()));

  return repos.filter((repo) => {
    if (repo.isPrivate || repo.isDisabled) return false;
    if (repo.isFork && !policy.includeForks) return false;
    if (repo.archived && !policy.includeArchived) return false;
    if (excluded.has(repo.name.toLowerCase())) return false;
    return true;
  });
}

export function filterAndSort(
  repos: readonly Repository[],
  query: RepositoryQuery,
): Repository[] {
  const needle = query.q.trim().toLowerCase();
  const language = query.language?.trim().toLowerCase() ?? null;
  const topic = query.topic?.trim().toLowerCase() ?? null;

  const filtered = repos.filter((repo) => {
    if (language !== null && (repo.language ?? '').toLowerCase() !== language) return false;
    if (topic !== null && !repo.topics.some((item) => item.toLowerCase() === topic)) return false;
    if (needle === '') return true;
    return (
      repo.name.toLowerCase().includes(needle) ||
      (repo.description ?? '').toLowerCase().includes(needle) ||
      repo.topics.some((item) => item.toLowerCase().includes(needle))
    );
  });

  return sortRepositories(filtered, query.sort);
}

export function sortRepositories(repos: readonly Repository[], sort: SortOption): Repository[] {
  const byName = (a: Repository, b: Repository) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

  // Every comparator falls back to the name so ordering is total and stable across renders.
  switch (sort) {
    case 'stars':
      return [...repos].sort((a, b) => b.stars - a.stars || dateDesc(a.updatedAt, b.updatedAt) || byName(a, b));
    case 'name':
      return [...repos].sort(byName);
    case 'created':
      return [...repos].sort((a, b) => dateDesc(a.createdAt, b.createdAt) || byName(a, b));
    case 'updated':
    default:
      return [...repos].sort((a, b) => dateDesc(a.pushedAt, b.pushedAt) || dateDesc(a.updatedAt, b.updatedAt) || byName(a, b));
  }
}

function dateDesc(a: string | null, b: string | null): number {
  const left = a === null ? -Infinity : Date.parse(a);
  const right = b === null ? -Infinity : Date.parse(b);
  if (left === right) return 0;
  return right > left ? 1 : -1;
}

/**
 * Featured selection: configured names first (in the configured order), then the
 * most-starred repositories to fill the remaining slots. Never invents a repository.
 */
export function selectFeatured(repos: readonly Repository[], policy: RepositoryPolicy): Repository[] {
  const byName = new Map(repos.map((repo) => [repo.name.toLowerCase(), repo] as const));
  const selected: Repository[] = [];
  const used = new Set<string>();

  for (const name of policy.featured) {
    const repo = byName.get(name.toLowerCase());
    if (repo && !used.has(repo.name)) {
      selected.push(repo);
      used.add(repo.name);
    }
  }

  if (selected.length < policy.featuredCount) {
    const fillers = [...repos]
      .filter((repo) => !used.has(repo.name) && !repo.archived)
      .sort((a, b) => b.stars - a.stars || dateDesc(a.updatedAt, b.updatedAt))
      .slice(0, policy.featuredCount - selected.length);
    selected.push(...fillers);
  }

  return selected.slice(0, policy.featuredCount);
}

export function collectFacets(repos: readonly Repository[]): { languages: Facet[]; topics: Facet[] } {
  const languages = new Map<string, number>();
  const topics = new Map<string, number>();

  for (const repo of repos) {
    if (repo.language) languages.set(repo.language, (languages.get(repo.language) ?? 0) + 1);
    for (const topic of repo.topics) topics.set(topic, (topics.get(topic) ?? 0) + 1);
  }

  const toFacets = (map: Map<string, number>): Facet[] =>
    [...map.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'en'));

  return {
    languages: toFacets(languages),
    topics: toFacets(topics).slice(0, 15),
  };
}

export function runQuery(
  repos: readonly Repository[],
  policy: RepositoryPolicy,
  query: RepositoryQuery,
): QueryOutcome {
  return {
    query,
    matches: filterAndSort(repos, query),
    featured: selectFeatured(repos, policy),
    languages: collectFacets(repos).languages,
    topics: collectFacets(repos).topics,
    totalEligible: repos.length,
    hasActiveFilters: query.q.trim() !== '' || query.language !== null || query.topic !== null,
  };
}

/** Aggregates shown in the hero. All derived from the actual inventory — nothing is hard-coded. */
export function summarise(repos: readonly Repository[]): {
  repositoryCount: number;
  totalStars: number;
  languageCount: number;
  lastPushedAt: string | null;
} {
  let totalStars = 0;
  let lastPushedAt: string | null = null;
  const languages = new Set<string>();

  for (const repo of repos) {
    totalStars += repo.stars;
    if (repo.language) languages.add(repo.language);
    const candidate = repo.pushedAt ?? repo.updatedAt;
    if (candidate && (lastPushedAt === null || Date.parse(candidate) > Date.parse(lastPushedAt))) {
      lastPushedAt = candidate;
    }
  }

  return { repositoryCount: repos.length, totalStars, languageCount: languages.size, lastPushedAt };
}

/** Serialises a query back into a canonical, shareable search string. */
export function toSearchString(query: RepositoryQuery): string {
  const params = new URLSearchParams();
  if (query.q.trim() !== '') params.set('q', query.q.trim());
  if (query.language !== null) params.set('language', query.language);
  if (query.topic !== null) params.set('topic', query.topic);
  if (query.sort !== 'updated') params.set('sort', query.sort);
  const value = params.toString();
  return value === '' ? '' : `?${value}`;
}
