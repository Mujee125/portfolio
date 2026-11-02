import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RepoCard } from '@/components/repo/RepoCard';
import type { Repository } from '@/lib/github/types';

const NOW = Date.parse('2024-06-01T12:00:00Z');

function repo(overrides: Partial<Repository> = {}): Repository {
  return {
    name: 'alpha',
    fullName: 'octocat/alpha',
    description: 'A TypeScript CLI for shipping things.',
    url: 'https://github.com/octocat/alpha',
    homepage: null,
    language: 'TypeScript',
    topics: ['cli', 'tooling'],
    stars: 1200,
    forks: 34,
    archived: false,
    isFork: false,
    isPrivate: false,
    isDisabled: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-05-30T00:00:00.000Z',
    pushedAt: '2024-05-31T10:00:00.000Z',
    license: 'MIT',
    ...overrides,
  };
}

describe('RepoCard', () => {
  it('renders name, description, language, topics and counts', () => {
    render(<RepoCard repo={repo()} nowMs={NOW} />);

    expect(screen.getByRole('heading', { name: 'alpha' })).toBeInTheDocument();
    expect(screen.getByText('A TypeScript CLI for shipping things.')).toBeInTheDocument();
    // TypeScript appears in both desktop and mobile versions
    expect(screen.getAllByText('TypeScript')).toHaveLength(2);
    // Topics also appear in mobile version now
    expect(screen.getAllByText('cli')).toHaveLength(2);
    expect(screen.getAllByText('tooling')).toHaveLength(2);
    // Star and fork counts are now hidden in TechStackVisualizer
    expect(screen.getByText('1 day ago')).toBeInTheDocument();
  });

  it('links the title to the internal detail page and the repository to GitHub', () => {
    render(<RepoCard repo={repo()} nowMs={NOW} />);
    expect(screen.getByRole('link', { name: 'alpha' })).toHaveAttribute('href', '/repositories/alpha');
    const external = screen.getByRole('link', { name: /Repository/ });
    expect(external).toHaveAttribute('href', 'https://github.com/octocat/alpha');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows a neutral fallback instead of "undefined" when the description is missing', () => {
    render(<RepoCard repo={repo({ description: null, language: null, topics: [], stars: 0, forks: 0 })} nowMs={NOW} />);
    expect(screen.getByText('No description provided.')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('badges archived repositories rather than misrepresenting them as active', () => {
    render(<RepoCard repo={repo({ archived: true })} nowMs={NOW} />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('renders untrusted text as inert content, never as markup', () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const { container } = render(<RepoCard repo={repo({ description: hostile, name: 'safe-name' })} nowMs={NOW} />);

    // The payload survives as *text content* (escaped by React) and produces no element,
    // so it cannot execute: the dangerous part is the absence of nodes/attributes.
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    for (const element of Array.from(container.querySelectorAll('*'))) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
      }
    }
  });

  it('URL-encodes the slug for the detail link', () => {
    render(<RepoCard repo={repo({ name: 'my repo.v2' })} nowMs={NOW} />);
    expect(screen.getByRole('link', { name: 'my repo.v2' })).toHaveAttribute('href', '/repositories/my%20repo.v2');
  });

  it('gives screen readers explicit context for counters', () => {
    render(<RepoCard repo={repo()} nowMs={NOW} />);
    // Star and fork counts are now part of TechStackVisualizer
    // The language badge is still accessible (appears in both desktop and mobile versions)
    expect(screen.getAllByText('TypeScript')).toHaveLength(2);
  });

  it('keeps the technology toggle keyboard accessible and announces its state', async () => {
    const user = userEvent.setup();
    render(<RepoCard repo={repo()} nowMs={NOW} />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'alpha' })).toHaveFocus();
    await user.tab();
    const toggle = screen.getByRole('button', { name: 'Show all 3 technologies:TypeScript+2' });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{Enter}');
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Show fewer technologies:Show less');
    expect(toggle).toHaveTextContent('Show less');
    expect(screen.getAllByText('Language')).toHaveLength(2);
    expect(screen.getAllByText('Topic')).toHaveLength(4);

    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('Show all 3 technologies:TypeScript+2');

    await user.tab();
    expect(screen.getByRole('link', { name: /Repository/ })).toHaveFocus();
  });
});
