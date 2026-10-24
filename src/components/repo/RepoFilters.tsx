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
  // One draft for the whole form: typing and selecting merge into a single pending state,
  // so a change made while a navigation is in flight can never be lost.
  const [draft, setDraft] = useState<RepositoryQuery>(query);
  // Mirror of `draft` so an event handler always merges into the latest value even when
  // two changes happen in the same tick (React state alone would hand back a stale copy).
  const draftRef = useRef<RepositoryQuery>(query);
  const lastPushed = useRef(toSearchString(query));
  const formRef = useRef<HTMLFormElement>(null);

  /*
   * Advertise "this island is interactive" to tests (and to anyone debugging hydration).
   *
   * The page-level `html[data-hydrated]` marker is not enough: this form ships in its own
   * client chunk, so it can hydrate *after* the root effects have run. React restores the
   * controlled input value during hydration, which silently discards keystrokes typed in
   * that window. This attribute is set by an effect inside this component, so it appears
   * only once the handlers and state are attached.
   */
  useEffect(() => {
    const form = formRef.current;
    if (form === null) return;
    form.dataset.hydrated = 'true';
    return () => {
      delete form.dataset.hydrated;
    };
  }, []);

  function updateDraft(next: RepositoryQuery) {
    draftRef.current = next;
    setDraft(next);
  }

  function push(value: RepositoryQuery) {
    const searchString = toSearchString(value);
    if (searchString === lastPushed.current) return;
    lastPushed.current = searchString;
    startTransition(() => {
      router.replace(searchString === '' ? '/' : `/${searchString}`, { scroll: false });
    });
  }

  // Selects and the sort order are deliberate, single actions: apply them immediately.
  // They merge into the latest draft, so a search typed a moment earlier is preserved.
  function applyNow(next: Partial<RepositoryQuery>) {
    const merged: RepositoryQuery = { ...draftRef.current, ...next };
    updateDraft(merged);
    push(merged);
  }

  // Adopt server state when it changed for a reason other than our own navigation
  // (back/forward, "Clear filters", a shared link). `lastPushed` records the URL we
  // asked for, so an echo of our own navigation never overwrites what the user typed.
  useEffect(() => {
    const incoming = toSearchString(query);
    if (incoming === lastPushed.current) return;
    lastPushed.current = incoming;
    updateDraft(query);
  }, [query]);

  // Single debounced navigation for every control. 350 ms is long enough to avoid a
  // request per keystroke and short enough to feel immediate; because all changes share
  // one timer, rapid edits coalesce into one navigation instead of racing each other.
  useEffect(() => {
    if (toSearchString(draft) === lastPushed.current) return;
    const timer = setTimeout(() => push(draft), 350);
    return () => clearTimeout(timer);
    // `push` is recreated per render but only reads refs; re-running on every render
    // would reset the timer on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <form
        ref={formRef}
        role="search"
        action="/"
        method="get"
        aria-label="Filter repositories"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          // With JavaScript the debounced navigation already covers this; without it the
          // browser performs the native GET submission, so the form keeps working.
          event.preventDefault();
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
              value={draft.q}
              maxLength={100}
              placeholder="Name, description or topic"
              onChange={(event) => updateDraft({ ...draftRef.current, q: event.target.value })}
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
            value={draft.language ?? ''}
            onChange={(event) => applyNow({ language: event.target.value === '' ? null : event.target.value })}
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
            value={draft.topic ?? ''}
            onChange={(event) => applyNow({ topic: event.target.value === '' ? null : event.target.value })}
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
            value={draft.sort}
            onChange={(event) => applyNow({ sort: event.target.value as SortOption })}
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
