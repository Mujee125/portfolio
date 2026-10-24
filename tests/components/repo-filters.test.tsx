import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
}));

const { RepoFilters } = await import('@/components/repo/RepoFilters');

const props = {
  query: { q: '', language: null, topic: null, sort: 'updated' as const },
  languages: [
    { value: 'TypeScript', count: 2 },
    { value: 'Go', count: 1 },
  ],
  topics: [{ value: 'cli', count: 3 }],
  matched: 3,
  total: 3,
  hasActiveFilters: false,
};

describe('RepoFilters', () => {
  beforeEach(() => replace.mockClear());

  it('renders a semantic search form with labelled controls', () => {
    render(<RepoFilters {...props} />);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toHaveAttribute('name', 'q');
    expect(screen.getByLabelText('Language')).toHaveAttribute('name', 'language');
    expect(screen.getByLabelText('Topic')).toHaveAttribute('name', 'topic');
    expect(screen.getByLabelText('Sort by')).toHaveAttribute('name', 'sort');
  });

  it('works without JavaScript: the form is a GET form that submits to the index', () => {
    render(<RepoFilters {...props} />);
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/');
  });

  it('announces the result count politely', () => {
    const { container } = render(<RepoFilters {...props} />);
    const liveRegion = container.querySelector('p[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    expect(liveRegion).toHaveTextContent('3 of 3 repositories');
  });

  it('puts the language selection into the URL', async () => {
    const user = userEvent.setup();
    render(<RepoFilters {...props} />);
    await user.selectOptions(screen.getByLabelText('Language'), 'Go');
    expect(replace).toHaveBeenCalledWith('/?language=Go', { scroll: false });
  });

  it('keeps the other filters when changing the sort order', async () => {
    const user = userEvent.setup();
    render(
      <RepoFilters
        {...props}
        query={{ q: 'cli', language: 'Go', topic: null, sort: 'updated' }}
        hasActiveFilters
      />,
    );
    await user.selectOptions(screen.getByLabelText('Sort by'), 'stars');
    expect(replace).toHaveBeenCalledWith('/?q=cli&language=Go&sort=stars', { scroll: false });
  });

  it('debounces typing into a single navigation', async () => {
    const user = userEvent.setup();
    render(<RepoFilters {...props} />);

    await user.type(screen.getByLabelText('Search'), 'cli');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/?q=cli', { scroll: false }), { timeout: 2000 });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('offers a clear-filters action only when filters are active', () => {
    const { rerender } = render(<RepoFilters {...props} />);
    expect(screen.queryByRole('link', { name: 'Clear filters' })).toBeNull();

    rerender(<RepoFilters {...props} hasActiveFilters />);
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/');
  });
});
