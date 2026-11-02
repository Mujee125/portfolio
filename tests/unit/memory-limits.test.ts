import { describe, it, expect, vi } from 'vitest';
import { getConfig } from '@/lib/config';
import { createInventoryService } from '@/lib/github';

vi.mock('@/lib/config');

const mockConfig = vi.mocked(getConfig);

describe('memory limits for repository loading', () => {
  it('allows normal repository count under limit', async () => {
    mockConfig.mockReturnValue({
      profile: { username: 'testuser', displayName: 'Test User', headline: null, bio: null, location: null, links: { github: 'https://github.com/testuser', email: null, resume: null, linkedin: null, website: null } },
      repos: { maxPages: 10, includeForks: false, includeArchived: true, excluded: [], featured: [], featuredCount: 3, cacheTtlSeconds: 900, staleMaxSeconds: 86400 },
      github: { maxRepositories: 2000, apiBaseUrl: 'https://api.github.com', token: null, requestTimeoutMs: 8000, maxRetries: 2, maxResponseSizeBytes: 10 * 1024 * 1024 },
      site: { url: 'https://example.com', name: 'Test', description: 'Test' },
      rateLimit: { enabled: true, maxRequests: 100, windowSeconds: 60, bypassToken: null },
      sitemap: { maxUrls: 1000 },
      env: 'development',
    } as ReturnType<typeof getConfig>);

    const mockRepos = Array.from({ length: 10 }, (_, i) => ({
      name: `repo-${i}`,
      full_name: `testuser/repo-${i}`,
      html_url: `https://github.com/testuser/repo-${i}`,
      description: null,
      language: null,
      topics: [],
      stargazers_count: 0,
      forks_count: 0,
      archived: false,
      fork: false,
      disabled: false,
      private: false,
      homepage: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      pushed_at: '2024-01-01T00:00:00Z',
      license: null,
    }));

    const mockDeps = {
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockRepos), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
      now: () => 1_700_000_000_000,
      sleep: () => Promise.resolve(),
    };

    const service = createInventoryService({ config: getConfig(), deps: mockDeps });
    const result = await service.getInventory();

    expect(result.inventory).not.toBeNull();
    expect(result.inventory?.truncated).toBe(false);
  });

  it('caps repository count when limit exceeded', async () => {
    mockConfig.mockReturnValue({
      profile: { username: 'testuser', displayName: 'Test User', headline: null, bio: null, location: null, links: { github: 'https://github.com/testuser', email: null, resume: null, linkedin: null, website: null } },
      repos: { maxPages: 50, includeForks: false, includeArchived: true, excluded: [], featured: [], featuredCount: 3, cacheTtlSeconds: 900, staleMaxSeconds: 86400 },
      github: { maxRepositories: 100, apiBaseUrl: 'https://api.github.com', token: null, requestTimeoutMs: 8000, maxRetries: 2, maxResponseSizeBytes: 10 * 1024 * 1024 },
      site: { url: 'https://example.com', name: 'Test', description: 'Test' },
      rateLimit: { enabled: true, maxRequests: 100, windowSeconds: 60, bypassToken: null },
      sitemap: { maxUrls: 1000 },
      env: 'development',
    } as ReturnType<typeof getConfig>);

    // Mock that returns 150 repos (exceeds limit of 100)
    const mockRepos = Array.from({ length: 150 }, (_, i) => ({
      name: `repo-${i}`,
      full_name: `testuser/repo-${i}`,
      html_url: `https://github.com/testuser/repo-${i}`,
      description: null,
      language: null,
      topics: [],
      stargazers_count: 0,
      forks_count: 0,
      archived: false,
      fork: false,
      disabled: false,
      private: false,
      homepage: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      pushed_at: '2024-01-01T00:00:00Z',
      license: null,
    }));

    const mockDeps = {
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockRepos), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
      now: () => 1_700_000_000_000,
      sleep: () => Promise.resolve(),
    };

    const service = createInventoryService({ config: getConfig(), deps: mockDeps });
    const result = await service.getInventory();

    expect(result.inventory).not.toBeNull();
    expect(result.inventory?.truncated).toBe(true);
    // Should have capped at 100
    expect(result.inventory?.repos.length).toBeLessThanOrEqual(100);
  });

  it('logs warning when limit exceeded', async () => {
    mockConfig.mockReturnValue({
      profile: { username: 'testuser', displayName: 'Test User', headline: null, bio: null, location: null, links: { github: 'https://github.com/testuser', email: null, resume: null, linkedin: null, website: null } },
      repos: { maxPages: 50, includeForks: false, includeArchived: true, excluded: [], featured: [], featuredCount: 3, cacheTtlSeconds: 900, staleMaxSeconds: 86400 },
      github: { maxRepositories: 100, apiBaseUrl: 'https://api.github.com', token: null, requestTimeoutMs: 8000, maxRetries: 2, maxResponseSizeBytes: 10 * 1024 * 1024 },
      site: { url: 'https://example.com', name: 'Test', description: 'Test' },
      rateLimit: { enabled: true, maxRequests: 100, windowSeconds: 60, bypassToken: null },
      sitemap: { maxUrls: 1000 },
      env: 'development',
    } as ReturnType<typeof getConfig>);

    const mockLogger = vi.fn();
    const mockRepos = Array.from({ length: 150 }, (_, i) => ({
      name: `repo-${i}`,
      full_name: `testuser/repo-${i}`,
      html_url: `https://github.com/testuser/repo-${i}`,
      description: null,
      language: null,
      topics: [],
      stargazers_count: 0,
      forks_count: 0,
      archived: false,
      fork: false,
      disabled: false,
      private: false,
      homepage: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      pushed_at: '2024-01-01T00:00:00Z',
      license: null,
    }));

    const mockDeps = {
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockRepos), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
      now: () => 1_700_000_000_000,
      sleep: () => Promise.resolve(),
    };

    const service = createInventoryService({
      config: getConfig(),
      deps: mockDeps,
      logger: mockLogger,
    });

    await service.getInventory();

    // Should have logged a warning
    const warningCall = mockLogger.mock.calls.find(call => call[0] === 'warn');
    expect(warningCall).toBeDefined();
    expect(warningCall?.[1]).toBe('github.repository_count_capped');
  });
});
