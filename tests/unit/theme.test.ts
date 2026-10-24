import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, isTheme, resolveTheme } from '@/lib/theme';

describe('theme resolution', () => {
  it('accepts only the supported values', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark']);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('solarized')).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });

  it('falls back to the system preference for a missing or tampered cookie', () => {
    expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
    expect(resolveTheme('')).toBe(DEFAULT_THEME);
    expect(resolveTheme('<script>')).toBe(DEFAULT_THEME);
    expect(resolveTheme('light')).toBe('light');
  });
});
