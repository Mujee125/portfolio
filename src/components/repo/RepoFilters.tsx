'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { SearchIcon } from '@/components/ui/icons';
import { SORT_OPTIONS, toSearchString, type Facet, type RepositoryQuery, type SortOption } from '@/lib/repos/query';

const SORT_LABELS: Record<SortOption, string> = {
  updated: 'Recently pushed',
  stars: 'Most starred',
  name: 'Name (A–Z)',
  created: 'Newest first',
};

const fieldClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]';

/**
 * URL-driven filters with progressive enhancement:
 *  - without JavaScript this is a plain GET form that works;
 *  - with JavaScript it auto-applies (debounced) through `router.replace`, keeping
 *    the URL as the single source of truth so every state is shareable.
 */
export function RepoFilters({
  query,
  languages,
  topics,
  matched,
  total,
  hasActiveFilters,
}: {
  query: RepositoryQuery;
  languages: readonly Facet[];
  topics: readonly Facet[];
  matched: number;
  total: number;
  hasActiveFilters: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.q);
  const lastPushed = useRef(query.q);

  function apply(next: Partial<RepositoryQuery>) {
    const merged: RepositoryQuery = { ...query, ...next };
    const searchString = toSearchString(merged);
    startTransition(() => {
      router.replace(searchString === '' ? '/' : `/${searchString}`, { scroll: false });
    });
  }

  // Debounced search: 350 ms is long enough to avoid a request per keystroke and
  // short enough to feel immediate. The value is only pushed when it actually changed.
  useEffect(() => {
    if (search === lastPushed.current) return;
    const timer = setTimeout(() => {
      lastPushed.current = search;
      apply({ q: search });
    }, 350);
    return () => clearTimeout(timer);
    // `apply` closes over the current query, which is intentional: each navigation
    // is computed from the latest server-rendered state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <form
        role="search"
        action="/"
        method="get"
        aria-label="Filter repositories"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          lastPushed.current = search;
          apply({ q: search });
        }}
      >
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="repo-search" className="mb-1.5 block text-xs font-medium text-ink-muted">
            Search
          </label>
          <div className="relative">
            <SearchIcon
              width={15}
              height={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
            />
            <input
              id="repo-search"
              name="q"
              type="search"
              value={search}
              maxLength={100}
              placeholder="Name, description or topic"
              onChange={(event) => setSearch(event.target.value)}
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="repo-language" className="mb-1.5 block text-xs font-medium text-ink-muted">
            Language
          </label>
          <select
            id="repo-language"
            name="language"
            defaultValue={query.language ?? ''}
            onChange={(event) => apply({ language: event.target.value === '' ? null : event.target.value })}
            className={fieldClass}
          >
            <option value="">All languages</option>
            {languages.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.value} ({facet.count})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="repo-topic" className="mb-1.5 block text-xs font-medium text-ink-muted">
            Topic
          </label>
          <select
            id="repo-topic"
            name="topic"
            defaultValue={query.topic ?? ''}
            onChange={(event) => apply({ topic: event.target.value === '' ? null : event.target.value })}
            className={fieldClass}
          >
            <option value="">All topics</option>
            {topics.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.value} ({facet.count})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="repo-sort" className="mb-1.5 block text-xs font-medium text-ink-muted">
            Sort by
          </label>
          <select
            id="repo-sort"
            name="sort"
            defaultValue={query.sort}
            onChange={(event) => apply({ sort: event.target.value as SortOption })}
            className={fieldClass}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] lg:w-auto"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p aria-live="polite" aria-atomic="true" className="text-xs text-ink-muted">
          {isPending ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-accent" />
              Updating results…
            </span>
          ) : (
            <span>
              <strong className="font-semibold text-ink tabular-nums">{matched}</strong> of {total} repositories
              {hasActiveFilters ? ' match these filters' : ''}
            </span>
          )}
        </p>
        {hasActiveFilters ? (
          <Link
            href="/"
            className="rounded text-xs font-medium text-accent underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </div>
  );
}
