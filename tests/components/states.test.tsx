import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

const { EmptyState, ErrorState, IncompleteNotice, NoMatchesState, StaleNotice } = await import(
  '@/components/repo/states'
);

const failure = {
  kind: 'upstream' as const,
  message: 'GitHub returned an unexpected error, so the repository list could not be refreshed.',
  status: 500,
  retryAt: null,
};

describe('ErrorState', () => {
  it('explains the failure and offers a retry plus an escape hatch', () => {
    render(<ErrorState failure={failure} username="octocat" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Repositories are unavailable right now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open repositories on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/octocat?tab=repositories',
    );
  });

  it('communicates a rate limit with its reset time', () => {
    render(
      <ErrorState
        failure={{
          kind: 'rate_limited',
          message: 'GitHub’s rate limit was reached, so the repository list could not be refreshed.',
          status: 403,
          retryAt: new Date('2024-06-01T13:00:00Z'),
        }}
        username="octocat"
      />,
    );
    expect(screen.getByText('GitHub rate limit reached')).toBeInTheDocument();
    expect(screen.getByText(/The quota resets at 01 Jun 2024, 13:00 UTC/)).toBeInTheDocument();
  });

  it('never claims the list is complete when it is not', () => {
    render(<ErrorState failure={failure} username="octocat" showRetry={false} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByText(/never shows a partial or failed result as a complete list/)).toBeInTheDocument();
  });
});

describe('StaleNotice', () => {
  it('labels cached data with its timestamp and age', () => {
    render(
      <StaleNotice
        generatedAt={new Date('2024-06-01T11:00:00Z')}
        ageSeconds={3600}
        failure={failure}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cached snapshot.');
    expect(screen.getByRole('status')).toHaveTextContent('01 Jun 2024, 11:00 UTC');
    expect(screen.getByRole('status')).toHaveTextContent('1 hour ago');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});

describe('IncompleteNotice', () => {
  it('states the pagination limit when the inventory was capped', () => {
    render(<IncompleteNotice maxPages={3} skippedItems={0} />);
    expect(screen.getByText(/This list may be incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/first 3 API pages/)).toBeInTheDocument();
  });

  it('states how many entries could not be read', () => {
    render(<IncompleteNotice maxPages={0} skippedItems={2} />);
    expect(screen.getByText(/2 entries returned by GitHub could not be interpreted/)).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('explains the configured exclusion policy instead of implying nothing exists', () => {
    render(<EmptyState username="octocat" includeForks={false} />);
    expect(screen.getByText(/No eligible public repositories yet/)).toBeInTheDocument();
    expect(screen.getByText(/Forks are excluded by default/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'github.com/octocat' })).toHaveAttribute(
      'href',
      'https://github.com/octocat?tab=repositories',
    );
  });

  it('mentions when forks are included', () => {
    render(<EmptyState username="octocat" includeForks />);
    expect(screen.getByText(/Forks are currently included/)).toBeInTheDocument();
  });
});

describe('NoMatchesState', () => {
  it('offers a way back to the unfiltered list', () => {
    render(<NoMatchesState />);
    expect(screen.getByText('No repositories match those filters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear all filters' })).toHaveAttribute('href', '/');
  });
});
