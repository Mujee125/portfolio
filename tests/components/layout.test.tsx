import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { RepoGrid } from '@/components/repo/RepoGrid';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { Badge } from '@/components/layout/Badge';
import { parseConfig } from '@/lib/config';
import type { Repository } from '@/lib/github/types';

function config(overrides: Record<string, string> = {}) {
  return parseConfig({ GITHUB_USERNAME: 'octocat', ...overrides });
}

function repo(name: string): Repository {
  return {
    name,
    fullName: `octocat/${name}`,
    description: null,
    url: `https://github.com/octocat/${name}`,
    homepage: null,
    language: null,
    topics: [],
    stars: 0,
    forks: 0,
    archived: false,
    isFork: false,
    isPrivate: false,
    isDisabled: false,
    createdAt: null,
    updatedAt: '2024-06-01T00:00:00.000Z',
    pushedAt: null,
    license: null,
  };
}

describe('SiteHeader', () => {
  it('exposes a primary navigation and the GitHub profile link', () => {
    render(<SiteHeader config={config()} theme="system" />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    const github = screen.getByRole('link', { name: /GitHub/ });
    expect(github).toHaveAttribute('href', 'https://github.com/octocat');
    expect(github).toHaveAttribute('rel', 'noopener noreferrer me');
    // The logo link's accessible name is the visible name + handle (never a bare monogram).
    expect(screen.getByRole('link', { name: /octocat/ })).toHaveAttribute('href', '/');
  });

  it('omits the About link when no about content is configured', () => {
    render(<SiteHeader config={config()} theme="system" />);
    expect(screen.queryByRole('link', { name: 'About' })).toBeNull();
  });

  it('shows the About link once genuine about content exists', () => {
    render(<SiteHeader config={config({ PROFILE_BIO: 'Backend engineer.' })} theme="system" />);
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/#about');
  });

  it('includes the theme control', () => {
    render(<SiteHeader config={config()} theme="dark" />);
    expect(screen.getByRole('group', { name: 'Colour theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark theme' })).toBeChecked();
  });

  it('marks external links so screen-reader users are warned', async () => {
    const user = userEvent.setup();
    render(<SiteHeader config={config()} theme="system" />);
    // Keyboard traversal reaches the GitHub link and its accessible name says it opens a new tab.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: /GitHub.*opens in a new tab/ })).toBeInTheDocument();
  });
});

describe('SiteFooter', () => {
  it('states the data source, refresh cadence and snapshot age', () => {
    render(<SiteFooter config={config()} cacheAgeSeconds={120} />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('GitHub REST API');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('at most every 15 minutes');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Last snapshot 2 min ago');
  });

  it('singularises the cadence and omits the age when there is no snapshot', () => {
    render(<SiteFooter config={config({ GITHUB_CACHE_TTL_SECONDS: '60' })} cacheAgeSeconds={null} />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('at most every 1 minute.');
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent('Last snapshot');
  });

  it('links to the operational endpoints', () => {
    render(<SiteFooter config={config()} cacheAgeSeconds={null} />);
    expect(screen.getByRole('link', { name: 'JSON API' })).toHaveAttribute('href', '/api/repositories');
    expect(screen.getByRole('link', { name: 'Health' })).toHaveAttribute('href', '/api/health');
  });
});

describe('RepoGrid, SectionHeading and Badge', () => {
  it('renders a labelled list with one item per repository', () => {
    render(<RepoGrid repos={[repo('alpha'), repo('beta')]} nowMs={Date.parse('2024-06-01T00:00:00Z')} label="Repositories" />);
    const list = screen.getByRole('list', { name: 'Repositories' });
    expect(list.querySelectorAll(':scope > li')).toHaveLength(2);
  });

  it('labels sections by their heading id', () => {
    render(<SectionHeading id="work-heading" eyebrow="Repository index" title="Everything" description="Desc" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Everything' })).toHaveAttribute('id', 'work-heading');
    expect(screen.getByText('Desc')).toBeInTheDocument();
  });

  it('renders badges with and without a decorative dot', () => {
    render(
      <>
        <Badge>Archived</Badge>
        <Badge tone="accent" icon>
          New
        </Badge>
      </>,
    );
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });
});
