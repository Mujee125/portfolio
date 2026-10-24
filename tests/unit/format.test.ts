import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatDate,
  formatDateTimeUtc,
  formatNumber,
  languageColour,
  relativeFromSeconds,
  relativeTime,
} from '@/lib/format';

describe('number formatting', () => {
  it('formats full numbers with separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(0)).toBe('0');
  });

  it('abbreviates large counts', () => {
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1000)).toBe('1k');
    expect(formatCompact(1204)).toBe('1.2k');
    expect(formatCompact(160_400)).toBe('160.4k');
    expect(formatCompact(2_500_000)).toBe('2.5m');
  });

  it('never emits NaN for bad input', () => {
    expect(formatCompact(Number.NaN)).toBe('0');
    expect(formatCompact(-5)).toBe('0');
  });
});

describe('date formatting', () => {
  it('formats deterministically in UTC', () => {
    expect(formatDate('2024-05-30T09:30:00Z')).toBe('30 May 2024');
    expect(formatDateTimeUtc('2024-05-30T09:30:00Z')).toBe('30 May 2024, 09:30 UTC');
  });

  it('returns null for missing or invalid dates instead of "Invalid Date"', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate('not-a-date')).toBeNull();
    expect(formatDateTimeUtc(null)).toBeNull();
  });

  it('produces human relative times', () => {
    const now = Date.parse('2024-06-01T12:00:00Z');
    expect(relativeTime('2024-06-01T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2024-06-01T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2024-06-01T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2024-05-30T12:00:00Z', now)).toBe('2 days ago');
  });

  it('clamps future timestamps rather than showing negative ages', () => {
    const now = Date.parse('2024-06-01T12:00:00Z');
    expect(relativeTime('2024-06-02T12:00:00Z', now)).toBe('just now');
  });

  it('singularises units and handles long spans', () => {
    expect(relativeFromSeconds(3600)).toBe('1 hour ago');
    expect(relativeFromSeconds(86_400)).toBe('1 day ago');
    expect(relativeFromSeconds(60 * 60 * 24 * 90)).toBe('3 months ago');
    expect(relativeFromSeconds(60 * 60 * 24 * 800)).toBe('2 years ago');
  });
});

describe('languageColour', () => {
  it('returns a known brand colour for common languages, case-insensitively', () => {
    expect(languageColour('TypeScript')).toBe('#3178c6');
    expect(languageColour('typescript')).toBe('#3178c6');
  });

  it('derives a stable colour for unknown languages', () => {
    expect(languageColour('Brainfuck')).toBe(languageColour('Brainfuck'));
    expect(languageColour('Brainfuck')).toMatch(/^hsl\(/);
  });
});
