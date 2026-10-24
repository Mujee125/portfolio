import { describe, expect, it } from 'vitest';
import { mapRepository, safeExternalUrl, safeRepositoryUrl } from '@/lib/github/mapper';
import { ARCHIVED_REPO, FORK_REPO, HOSTILE_REPO, MINIMAL_REPO, githubRepo } from '../fixtures/repositories';

const options = { username: 'octocat' };

describe('mapRepository', () => {
  it('maps a complete payload', () => {
    const repo = mapRepository(githubRepo(), options);
    expect(repo).toMatchObject({
      name: 'example-repo',
      fullName: 'octocat/example-repo',
      description: 'An example repository used in tests.',
      language: 'TypeScript',
      topics: ['testing', 'portfolio'],
      stars: 42,
      forks: 7,
      archived: false,
      isFork: false,
      url: 'https://github.com/octocat/example-repo',
      homepage: 'https://example.com/',
      license: 'MIT',
    });
    expect(repo?.updatedAt).toBe('2024-06-01T12:00:00.000Z');
  });

  it('degrades gracefully when optional metadata is missing', () => {
    // Supabase-style `as never` is not needed: the mapper accepts the raw shape.
    const repo = mapRepository(MINIMAL_REPO as never, options);
    expect(repo).not.toBeNull();
    expect(repo?.description).toBeNull();
    expect(repo?.language).toBeNull();
    expect(repo?.topics).toEqual([]);
    expect(repo?.stars).toBe(0);
    expect(repo?.pushedAt).toBeNull();
    expect(repo?.license).toBeNull();
    // Never "undefined" and never a broken link:
    expect(repo?.url).toBe('https://github.com/octocat/bare-repo');
  });

  it('rejects a repository name that could alter a URL path', () => {
    expect(mapRepository(githubRepo({ name: '../../etc/passwd' }), options)).toBeNull();
    expect(mapRepository(githubRepo({ name: 'a/b' }), options)).toBeNull();
    expect(mapRepository(githubRepo({ name: '' }), options)).toBeNull();
  });

  it('neutralises hostile content instead of trusting it', () => {
    const repo = mapRepository(HOSTILE_REPO, options);
    // The description is kept as inert text (React escapes it) but control characters are stripped…
    expect(repo?.description).not.toContain('\u0000');
    // …topics that are not valid GitHub topics are dropped, and the rest are normalised.
    expect(repo?.topics).toEqual(['ok-topic', 'upper']);
    // …and both hostile URLs are replaced with safe values.
    expect(repo?.url).toBe('https://github.com/octocat/hostile');
    expect(repo?.homepage).toBeNull();
  });

  it('preserves the archived flag and fork provenance', () => {
    expect(mapRepository(ARCHIVED_REPO, options)?.archived).toBe(true);
    expect(mapRepository(FORK_REPO, options)?.isFork).toBe(true);
  });

  it('clamps absurd counters and truncates very long descriptions', () => {
    const repo = mapRepository(
      githubRepo({ stargazers_count: Number.MAX_SAFE_INTEGER, description: 'x'.repeat(2000) }),
      options,
    );
    expect(repo?.stars).toBeLessThanOrEqual(1_000_000_000);
    expect(repo?.description?.length).toBeLessThanOrEqual(500);
    expect(repo?.description?.endsWith('…')).toBe(true);
  });

  it('drops invalid dates rather than rendering "Invalid Date"', () => {
    const repo = mapRepository(githubRepo({ updated_at: 'not-a-date', pushed_at: null, created_at: 'nope' }), options);
    expect(repo?.updatedAt).toBeNull();
    expect(repo?.pushedAt).toBeNull();
    expect(repo?.createdAt).toBeNull();
  });

  it('falls back to created_at when updated_at is missing', () => {
    const repo = mapRepository(githubRepo({ updated_at: undefined }), options);
    expect(repo?.updatedAt).toBe('2024-01-15T10:00:00.000Z');
  });
});

describe('safeRepositoryUrl', () => {
  it('accepts a canonical github.com URL', () => {
    expect(safeRepositoryUrl('https://github.com/octocat/x', 'octocat', 'x')).toBe('https://github.com/octocat/x');
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['https://evil.example/octocat/x'],
    ['http://github.com/octocat/x'],
    ['https://user:pass@github.com/octocat/x'],
  ])('replaces %s with the canonical URL', (candidate) => {
    expect(safeRepositoryUrl(candidate, 'octocat', 'x')).toBe('https://github.com/octocat/x');
  });
});

describe('safeExternalUrl', () => {
  it('keeps ordinary http(s) links', () => {
    expect(safeExternalUrl('https://example.com')).toBe('https://example.com/');
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com/');
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:msgbox(1)', 'file:///etc/passwd', '', '   '])(
    'discards %s',
    (candidate) => {
      expect(safeExternalUrl(candidate)).toBeNull();
    },
  );

  it('discards URLs with embedded credentials', () => {
    expect(safeExternalUrl('https://user:pass@example.com')).toBeNull();
  });
});
