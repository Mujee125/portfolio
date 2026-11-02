import { describe, it, expect, vi } from 'vitest';
import { getConfig } from '@/lib/config';
import { getRepositoryInventory } from '@/lib/github';
import sitemap from '@/app/sitemap';
import type { Repository } from '@/lib/github/types';

vi.mock('@/lib/config');
vi.mock('@/lib/github');

const mockConfig = vi.mocked(getConfig);
const mockInventory = vi.mocked(getRepositoryInventory);

describe('sitemap pagination', () => {
  it('returns single sitemap for small portfolios', async () => {
    mockConfig.mockReturnValue({
      site: { url: 'https://example.com' },
      sitemap: { maxUrls: 1000 },
    } as ReturnType<typeof getConfig>);

    const mockRepos: Repository[] = Array.from({ length: 10 }, (_, i) => ({
      name: `repo-${i}`,
      fullName: `user/repo-${i}`,
      description: null,
      url: `https://github.com/user/repo-${i}`,
      homepage: null,
      language: null,
      topics: [],
      stars: 0,
      forks: 0,
      archived: false,
      isFork: false,
      isPrivate: false,
      isDisabled: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      pushedAt: '2024-01-01T00:00:00Z',
      license: null,
    }));

    mockInventory.mockResolvedValue({
      inventory: {
        repos: mockRepos,
        generatedAt: new Date('2024-01-01'),
        stale: false,
        ageSeconds: 0,
        truncated: false,
        skippedItems: 0,
        pages: 1,
        rateLimit: null,
      },
      failure: null,
    });

    const result = await sitemap();

    expect(result).toHaveLength(11); // 1 home + 10 repos
    expect(result[0]?.url).toBe('https://example.com/');
    expect(result[1]?.url).toContain('/repositories/repo-0');
  });

  it('returns sitemap index for large portfolios', async () => {
    mockConfig.mockReturnValue({
      site: { url: 'https://example.com' },
      sitemap: { maxUrls: 100 },
    } as ReturnType<typeof getConfig>);

    const mockRepos: Repository[] = Array.from({ length: 250 }, (_, i) => ({
      name: `repo-${i}`,
      fullName: `user/repo-${i}`,
      description: null,
      url: `https://github.com/user/repo-${i}`,
      homepage: null,
      language: null,
      topics: [],
      stars: 0,
      forks: 0,
      archived: false,
      isFork: false,
      isPrivate: false,
      isDisabled: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      pushedAt: '2024-01-01T00:00:00Z',
      license: null,
    }));

    mockInventory.mockResolvedValue({
      inventory: {
        repos: mockRepos,
        generatedAt: new Date('2024-01-01'),
        stale: false,
        ageSeconds: 0,
        truncated: false,
        skippedItems: 0,
        pages: 3,
        rateLimit: null,
      },
      failure: null,
    });

    const result = await sitemap();

    // 250 repos / 100 per page = 3 pages
    expect(result).toHaveLength(3);
    expect(result[0]?.url).toBe('https://example.com/sitemap-0.xml');
    expect(result[1]?.url).toBe('https://example.com/sitemap-1.xml');
    expect(result[2]?.url).toBe('https://example.com/sitemap-2.xml');
  });

  it('handles edge case of exactly maxUrls', async () => {
    mockConfig.mockReturnValue({
      site: { url: 'https://example.com' },
      sitemap: { maxUrls: 100 },
    } as ReturnType<typeof getConfig>);

    const mockRepos: Repository[] = Array.from({ length: 100 }, (_, i) => ({
      name: `repo-${i}`,
      fullName: `user/repo-${i}`,
      description: null,
      url: `https://github.com/user/repo-${i}`,
      homepage: null,
      language: null,
      topics: [],
      stars: 0,
      forks: 0,
      archived: false,
      isFork: false,
      isPrivate: false,
      isDisabled: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      pushedAt: '2024-01-01T00:00:00Z',
      license: null,
    }));

    mockInventory.mockResolvedValue({
      inventory: {
        repos: mockRepos,
        generatedAt: new Date('2024-01-01'),
        stale: false,
        ageSeconds: 0,
        truncated: false,
        skippedItems: 0,
        pages: 1,
        rateLimit: null,
      },
      failure: null,
    });

    const result = await sitemap();

    // Should use single sitemap (not index), includes home page
    expect(result.length).toBeGreaterThan(100);
    expect(result[0]?.url).toBe('https://example.com/');
  });
});
