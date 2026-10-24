import { describe, expect, it } from 'vitest';
import type { RepositoryPolicy } from '@/lib/config';
import type { Repository } from '@/lib/github/types';
import {
  DEFAULT_QUERY,
  applyInclusionPolicy,
  collectFacets,
  filterAndSort,
  runQuery,
  selectFeatured,
  sortRepositories,
  summarise,
} from '@/lib/repos/query';

const policy: RepositoryPolicy = {
  includeForks: false,
  includeArchived: true,
  excluded: ['secret-scratch'],
  featured: ['beta', 'alpha'],
  featuredCount: 3,
};

function repo(overrides: Partial<Repository> & { name: string }): Repository {
  return {
    fullName: `octocat/${overrides.name}`,
    description: null,
    url: `https://github.com/octocat/${overrides.name}`,
    homepage: null,
    language: null,
    topics: [],
    stars: 0,
    forks: 0,
    archived: false,
    isFork: false,
    isPrivate: false,
    isDisabled: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
    pushedAt: '2024-02-01T00:00:00.000Z',
    license: null,
    ...overrides,
  };
}

const alpha = repo({
  name: 'alpha',
  description: 'A TypeScript CLI',
  language: 'TypeScript',
  topics: ['cli', 'tools'],
  stars: 5,
  pushedAt: '2024-05-01T00:00:00.000Z',
});
const beta = repo({
  name: 'beta',
  description: 'Rust parser',
  language: 'Rust',
  topics: ['parser'],
  stars: 50,
  pushedAt: '2024-03-01T00:00:00.000Z',
});
const gamma = repo({
  name: 'gamma',
  description: 'Go service',
  language: 'Go',
  topics: ['cli'],
  stars: 1,
  archived: true,
  pushedAt: '2024-06-01T00:00:00.000Z',
});
const delta = repo({ name: 'delta', language: 'TypeScript', description: 'Docs site', stars: 12, pushedAt: null });
const fork = repo({ name: 'a-fork', isFork: true, stars: 999 });
const priv = repo({ name: 'private-thing', isPrivate: true });
const disabled = repo({ name: 'disabled-thing', isDisabled: true });
const scratch = repo({ name: 'secret-scratch' });

const all = [alpha, beta, gamma, delta, fork, priv, disabled, scratch];

describe('applyInclusionPolicy', () => {
  it('excludes forks, private, disabled and deny-listed repositories by default', () => {
    const eligible = applyInclusionPolicy(all, policy).map((r) => r.name);
    expect(eligible).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });

  it('includes forks when configured, but never private or disabled repositories', () => {
    const eligible = applyInclusionPolicy(all, { ...policy, includeForks: true }).map((r) => r.name);
    expect(eligible).toContain('a-fork');
    expect(eligible).not.toContain('private-thing');
    expect(eligible).not.toContain('disabled-thing');
  });

  it('can exclude archived repositories and keeps them by default', () => {
    expect(applyInclusionPolicy(all, { ...policy, includeArchived: false }).map((r) => r.name)).not.toContain('gamma');
    expect(applyInclusionPolicy(all, policy).map((r) => r.name)).toContain('gamma');
  });

  it('matches the deny-list case-insensitively', () => {
    const eligible = applyInclusionPolicy([scratch], { ...policy, excluded: ['SECRET-SCRATCH'] });
    expect(eligible).toEqual([]);
  });
});

const eligible = applyInclusionPolicy(all, policy);

describe('filterAndSort', () => {
  it('returns everything for the default query', () => {
    expect(filterAndSort(eligible, DEFAULT_QUERY)).toHaveLength(4);
  });

  it('searches name, description and topics case-insensitively', () => {
    expect(filterAndSort(eligible, { ...DEFAULT_QUERY, q: 'CLI' }).map((r) => r.name).sort()).toEqual([
      'alpha',
      'gamma',
    ]);
    expect(filterAndSort(eligible, { ...DEFAULT_QUERY, q: 'rust parser' }).map((r) => r.name)).toEqual(['beta']);
    expect(filterAndSort(eligible, { ...DEFAULT_QUERY, q: 'docs' }).map((r) => r.name)).toEqual(['delta']);
  });

  it('filters by language and topic', () => {
    expect(filterAndSort(eligible, { ...DEFAULT_QUERY, language: 'typescript' }).map((r) => r.name).sort()).toEqual([
      'alpha',
      'delta',
    ]);
    expect(filterAndSort(eligible, { ...DEFAULT_QUERY, topic: 'cli' }).map((r) => r.name).sort()).toEqual([
      'alpha',
      'gamma',
    ]);
  });

  it('combines filters', () => {
    expect(
      filterAndSort(eligible, { ...DEFAULT_QUERY, language: 'Go', topic: 'cli', q: 'service' }).map((r) => r.name),
    ).toEqual(['gamma']);
  });

  it('returns an empty list rather than throwing on no matches', () => {
    expect(filterAndSort(eligible, { ...DEFAULT_QUERY, q: 'zzzz' })).toEqual([]);
  });

  it.each([
    ['stars', ['beta', 'delta', 'alpha', 'gamma']],
    ['name', ['alpha', 'beta', 'delta', 'gamma']],
    ['created', ['alpha', 'beta', 'delta', 'gamma']],
  ] as const)('sorts by %s', (sort, expected) => {
    expect(sortRepositories(eligible, sort).map((r) => r.name)).toEqual(expected);
  });

  it('sorts by recency using pushed_at and pushing null dates last', () => {
    expect(sortRepositories(eligible, 'updated').map((r) => r.name)).toEqual(['gamma', 'alpha', 'beta', 'delta']);
  });

  it('is stable for equal keys (name is the tie-break)', () => {
    const same = [repo({ name: 'zulu' }), repo({ name: 'alpha' }), repo({ name: 'mike' })];
    expect(sortRepositories(same, 'stars').map((r) => r.name)).toEqual(['alpha', 'mike', 'zulu']);
  });
});

describe('selectFeatured', () => {
  it('honours configured order and fills the remainder by stars', () => {
    expect(selectFeatured(eligible, policy).map((r) => r.name)).toEqual(['beta', 'alpha', 'delta']);
  });

  it('ignores configured names that are not eligible', () => {
    const featured = selectFeatured(eligible, { ...policy, featured: ['does-not-exist', 'gamma'], featuredCount: 2 });
    expect(featured.map((r) => r.name)).toEqual(['gamma', 'beta']);
  });

  it('falls back to the most starred repositories when nothing is configured', () => {
    expect(selectFeatured(eligible, { ...policy, featured: [], featuredCount: 2 }).map((r) => r.name)).toEqual([
      'beta',
      'delta',
    ]);
  });

  it('never uses archived repositories as filler, even when slots remain', () => {
    // Archived work is legitimate to list, but presenting it as a highlight would
    // misrepresent what is actively maintained.
    const names = selectFeatured(eligible, { ...policy, featured: [], featuredCount: 4 }).map((r) => r.name);
    expect(names).toEqual(['beta', 'delta', 'alpha']);
    expect(names).not.toContain('gamma');
  });

  it('returns fewer items than requested when there is not enough inventory', () => {
    expect(selectFeatured([alpha], { ...policy, featured: [], featuredCount: 3 })).toHaveLength(1);
  });
});

describe('facets and summary', () => {
  it('collects languages and topics with counts, most common first', () => {
    const facets = collectFacets(eligible);
    expect(facets.languages).toEqual([
      { value: 'TypeScript', count: 2 },
      { value: 'Go', count: 1 },
      { value: 'Rust', count: 1 },
    ]);
    expect(facets.topics[0]).toEqual({ value: 'cli', count: 2 });
  });

  it('summarises counts, stars, languages and the most recent push', () => {
    const summary = summarise(eligible);
    expect(summary.repositoryCount).toBe(4);
    expect(summary.totalStars).toBe(68);
    expect(summary.languageCount).toBe(3);
    expect(summary.lastPushedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('handles an empty inventory', () => {
    expect(summarise([])).toEqual({ repositoryCount: 0, totalStars: 0, languageCount: 0, lastPushedAt: null });
  });

  it('reports whether filters are active', () => {
    expect(runQuery(eligible, policy, DEFAULT_QUERY).hasActiveFilters).toBe(false);
    expect(runQuery(eligible, policy, { ...DEFAULT_QUERY, q: 'x' }).hasActiveFilters).toBe(true);
    expect(runQuery(eligible, policy, { ...DEFAULT_QUERY, language: 'Go' }).hasActiveFilters).toBe(true);
  });
});
