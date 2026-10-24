import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '@/lib/config';

const base = { GITHUB_USERNAME: 'octocat' };

describe('parseConfig', () => {
  it('applies documented defaults when only the username is provided', () => {
    const config = parseConfig(base);
    expect(config.profile.username).toBe('octocat');
    expect(config.profile.displayName).toBe('octocat');
    expect(config.profile.links.github).toBe('https://github.com/octocat');
    expect(config.repos.includeForks).toBe(false);
    expect(config.repos.includeArchived).toBe(true);
    expect(config.repos.cacheTtlSeconds).toBe(900);
    expect(config.github.token).toBeNull();
    expect(config.profile.links.email).toBeNull();
    expect(config.profile.links.resume).toBeNull();
  });

  it('never invents contact details that were not configured', () => {
    const config = parseConfig({ ...base, PROFILE_EMAIL: '', PROFILE_RESUME_URL: '' });
    expect(config.profile.links.email).toBeNull();
    expect(config.profile.links.resume).toBeNull();
  });

  it('fails loudly when the username is missing', () => {
    expect(() => parseConfig({})).toThrow(ConfigError);
    expect(() => parseConfig({})).toThrow(/GITHUB_USERNAME is required/);
  });

  it.each(['-leading', 'trailing-', 'has space', 'double--hyphen', 'a'.repeat(40), 'emoji😀'])(
    'rejects invalid username %s',
    (username) => {
      expect(() => parseConfig({ GITHUB_USERNAME: username })).toThrow(ConfigError);
    },
  );

  it('rejects a malformed email but accepts a valid one', () => {
    expect(() => parseConfig({ ...base, PROFILE_EMAIL: 'not-an-email' })).toThrow(/valid email/);
    expect(parseConfig({ ...base, PROFILE_EMAIL: 'dev@example.com' }).profile.links.email).toBe('dev@example.com');
  });

  it('only accepts https for external links', () => {
    expect(() => parseConfig({ ...base, PROFILE_RESUME_URL: 'javascript:alert(1)' })).toThrow(/https/);
    expect(() => parseConfig({ ...base, PROFILE_LINKEDIN_URL: 'http://linkedin.com/in/x' })).toThrow(/https/);
    expect(parseConfig({ ...base, PROFILE_LINKEDIN_URL: 'https://linkedin.com/in/x' }).profile.links.linkedin).toBe(
      'https://linkedin.com/in/x',
    );
  });

  it('normalises list configuration and de-duplicates case-insensitively', () => {
    const config = parseConfig({
      ...base,
      GITHUB_EXCLUDED_REPOS: ' dotfiles, Scratch ,dotfiles,',
      GITHUB_FEATURED_REPOS: 'alpha,beta',
    });
    expect(config.repos.excluded).toEqual(['dotfiles', 'scratch']);
    expect(config.repos.featured).toEqual(['alpha', 'beta']);
  });

  it('coerces boolean-ish strings, including explicit false', () => {
    expect(parseConfig({ ...base, GITHUB_INCLUDE_FORKS: 'true' }).repos.includeForks).toBe(true);
    expect(parseConfig({ ...base, GITHUB_INCLUDE_FORKS: '0' }).repos.includeForks).toBe(false);
    expect(parseConfig({ ...base, GITHUB_INCLUDE_ARCHIVED: 'off' }).repos.includeArchived).toBe(false);
  });

  it('enforces bounds on numeric configuration', () => {
    expect(() => parseConfig({ ...base, GITHUB_CACHE_TTL_SECONDS: '-5' })).toThrow();
    expect(() => parseConfig({ ...base, GITHUB_MAX_PAGES: '0' })).toThrow();
    expect(() => parseConfig({ ...base, GITHUB_MAX_RETRIES: '99' })).toThrow();
    expect(parseConfig({ ...base, GITHUB_CACHE_TTL_SECONDS: '0' }).repos.cacheTtlSeconds).toBe(0);
  });

  it('requires an absolute https site URL in production', () => {
    expect(() => parseConfig({ ...base, NODE_ENV: 'production' })).toThrow(/NEXT_PUBLIC_SITE_URL is required/);
    expect(() =>
      parseConfig({ ...base, NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://example.com' }),
    ).toThrow(/https/);
    expect(
      parseConfig({ ...base, NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://portfolio.example' }).site.url,
    ).toBe('https://portfolio.example');
  });

  it('allows a loopback site URL in a production build for local verification', () => {
    expect(
      parseConfig({ ...base, NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }).site.url,
    ).toBe('http://localhost:3000');
  });

  it('blocks a non-default API base in production unless explicitly confirmed', () => {
    // Guards against a misconfiguration that would send a token to a third-party host.
    expect(() =>
      parseConfig({
        ...base,
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://portfolio.example',
        GITHUB_API_BASE_URL: 'https://evil.example',
      }),
    ).toThrow(/ALLOW_NON_DEFAULT_GITHUB_API/);

    expect(
      parseConfig({
        ...base,
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://portfolio.example',
        GITHUB_API_BASE_URL: 'https://evil.example',
        ALLOW_NON_DEFAULT_GITHUB_API: 'true',
      }).github.apiBaseUrl,
    ).toBe('https://evil.example');
  });

  it('rejects an API base with embedded credentials or http in production', () => {
    expect(() => parseConfig({ ...base, GITHUB_API_BASE_URL: 'https://user:pass@api.github.com' })).toThrow(
      /must not embed credentials/,
    );
    expect(() =>
      parseConfig({
        ...base,
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://portfolio.example',
        GITHUB_API_BASE_URL: 'http://api.github.com',
        ALLOW_NON_DEFAULT_GITHUB_API: 'true',
      }),
    ).toThrow(/https/);
  });

  it('trims a trailing slash from the site URL so canonical URLs never double up', () => {
    expect(parseConfig({ ...base, NEXT_PUBLIC_SITE_URL: 'https://portfolio.example/' }).site.url).toBe(
      'https://portfolio.example',
    );
  });
});
