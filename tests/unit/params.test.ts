import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY } from '@/lib/repos/query';
import { apiQuerySchema, parseRepositoryQuery, toSearchString } from '@/lib/repos/params';

describe('parseRepositoryQuery', () => {
  it('returns defaults for an empty URL', () => {
    expect(parseRepositoryQuery({})).toEqual(DEFAULT_QUERY);
  });

  it('reads every supported parameter', () => {
    expect(parseRepositoryQuery({ q: 'cli tool', language: 'TypeScript', topic: 'cli', sort: 'stars' })).toEqual({
      q: 'cli tool',
      language: 'TypeScript',
      topic: 'cli',
      sort: 'stars',
    });
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(parseRepositoryQuery({ q: ['first', 'second'] }).q).toBe('first');
  });

  it('falls back to defaults instead of throwing on an invalid sort', () => {
    expect(parseRepositoryQuery({ sort: 'stars; drop table' }).sort).toBe('updated');
  });

  it('falls back entirely when a value exceeds its limit', () => {
    // A shared link with an over-long query must still render the site.
    expect(parseRepositoryQuery({ q: 'x'.repeat(101) })).toEqual(DEFAULT_QUERY);
  });

  it('normalises blank values to null/default', () => {
    expect(parseRepositoryQuery({ q: '   ', language: '', topic: '  ', sort: '' })).toEqual(DEFAULT_QUERY);
  });

  it('collapses internal whitespace so the value is canonical', () => {
    expect(parseRepositoryQuery({ q: '  machine   learning  ' }).q).toBe('machine learning');
  });
});

describe('toSearchString', () => {
  it('omits defaults', () => {
    expect(toSearchString(DEFAULT_QUERY)).toBe('');
  });

  it('round-trips through the parser', () => {
    const query = { q: 'cli tool', language: 'Go', topic: 'cli', sort: 'stars' as const };
    const search = toSearchString(query);
    const params = Object.fromEntries(new URLSearchParams(search.slice(1)));
    expect(parseRepositoryQuery(params)).toEqual(query);
  });

  it('URL-encodes user input', () => {
    expect(toSearchString({ ...DEFAULT_QUERY, q: 'a&b=c' })).toBe('?q=a%26b%3Dc');
  });
});

describe('apiQuerySchema', () => {
  it('accepts a valid query and applies defaults', () => {
    expect(apiQuerySchema.parse({})).toEqual({ q: '', sort: 'updated', includeArchived: true });
  });

  it('rejects unknown sort values and over-long search terms', () => {
    expect(apiQuerySchema.safeParse({ sort: 'nope' }).success).toBe(false);
    expect(apiQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(apiQuerySchema.safeParse({ language: 'x'.repeat(51) }).success).toBe(false);
  });

  it('parses the includeArchived flag strictly', () => {
    expect(apiQuerySchema.parse({ includeArchived: 'false' }).includeArchived).toBe(false);
    expect(apiQuerySchema.safeParse({ includeArchived: 'yes' }).success).toBe(false);
  });
});
