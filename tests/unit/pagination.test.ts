import { describe, expect, it } from 'vitest';
import { isAllowedApiUrl, nextPageUrl, parseLinkHeader } from '@/lib/github/pagination';

const API = 'https://api.github.com';

describe('parseLinkHeader', () => {
  it('returns every relation from a realistic header', () => {
    const header =
      '<https://api.github.com/user/583231/repos?per_page=100&page=2>; rel="next", ' +
      '<https://api.github.com/user/583231/repos?per_page=100&page=4>; rel="last", ' +
      '<https://api.github.com/user/583231/repos?per_page=100&page=1>; rel="first"';

    expect(parseLinkHeader(header)).toEqual({
      next: 'https://api.github.com/user/583231/repos?per_page=100&page=2',
      last: 'https://api.github.com/user/583231/repos?per_page=100&page=4',
      first: 'https://api.github.com/user/583231/repos?per_page=100&page=1',
    });
  });

  it('handles a missing or empty header', () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader(undefined)).toEqual({});
    expect(parseLinkHeader('')).toEqual({});
  });

  it('tolerates malformed segments without throwing', () => {
    expect(parseLinkHeader('garbage, <https://api.github.com/x>; rel="next"')).toEqual({
      next: 'https://api.github.com/x',
    });
    expect(parseLinkHeader('<<>>; rel=')).toEqual({});
  });

  it('supports quoted multi-relation values and unquoted tokens', () => {
    expect(parseLinkHeader('<https://api.github.com/a>; rel="next last"')).toEqual({
      next: 'https://api.github.com/a',
      last: 'https://api.github.com/a',
    });
  });
});

describe('isAllowedApiUrl', () => {
  it('accepts URLs on the configured origin', () => {
    expect(isAllowedApiUrl('https://api.github.com/user/1/repos?page=2', API)).toBe(true);
  });

  it.each([
    ['https://evil.example/user/1/repos', 'a different host'],
    ['http://api.github.com/user/1/repos', 'a downgraded scheme'],
    ['https://api.github.com.evil.example/user/1/repos', 'a look-alike host'],
    ['https://user:pass@api.github.com/user/1/repos', 'embedded credentials'],
    ['javascript:alert(1)', 'a script URL'],
    ['not a url', 'unparseable input'],
    ['https://api.github.com.evil.example/x', 'a suffix attack'],
  ])('rejects %s (%s)', (candidate) => {
    expect(isAllowedApiUrl(candidate, API)).toBe(false);
  });

  it('honours a custom API base path', () => {
    expect(isAllowedApiUrl('https://ghe.example/api/v3/users/x/repos', 'https://ghe.example/api/v3')).toBe(true);
    expect(isAllowedApiUrl('https://ghe.example/other/users/x/repos', 'https://ghe.example/api/v3')).toBe(false);
  });
});

describe('nextPageUrl', () => {
  it('returns null when there is no next page', () => {
    expect(nextPageUrl('<https://api.github.com/x>; rel="prev"', API)).toBeNull();
    expect(nextPageUrl(null, API)).toBeNull();
  });

  it('returns the validated next URL', () => {
    expect(nextPageUrl('<https://api.github.com/u/1/repos?page=2>; rel="next"', API)).toBe(
      'https://api.github.com/u/1/repos?page=2',
    );
  });

  it('refuses to follow a link pointing at another origin', () => {
    // A hijacked or malicious `link` header must not become an SSRF primitive.
    expect(() => nextPageUrl('<https://evil.example/steal>; rel="next"', API)).toThrow(/outside the GitHub API origin/);
  });
});
