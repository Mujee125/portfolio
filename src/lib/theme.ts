export const THEME_COOKIE = 'theme';
export const THEMES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'system';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * Resolves the theme for server rendering.
 *
 * The cookie is a presentation preference, not a security boundary: an invalid
 * value simply falls back to "system".
 */
export function resolveTheme(cookieValue: string | undefined): Theme {
  return isTheme(cookieValue) ? cookieValue : DEFAULT_THEME;
}
