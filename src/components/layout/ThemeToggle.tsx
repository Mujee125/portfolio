'use client';

import { useEffect, useState } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/ui/icons';
import { THEME_COOKIE, THEMES, type Theme } from '@/lib/theme';

const LABELS: Record<Theme, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

const ICONS: Record<Theme, typeof SunIcon> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

/**
 * Three-state theme control.
 *
 * The server already rendered the correct `data-theme` from the preference cookie,
 * so the first paint is correct with no inline bootstrap script and therefore no
 * CSP exception. Changing the theme updates the attribute in an effect (the React
 * sanctioned place for DOM side effects), persists the cookie for the next server
 * render, and "System" removes the attribute so a `prefers-color-scheme` media
 * query takes over again.
 */
export function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
    try {
      window.localStorage.setItem(THEME_COOKIE, theme);
    } catch {
      // Storage may be unavailable (private mode); the cookie is the source of truth.
    }
  }, [theme]);

  // Keep other tabs in sync without a round trip.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_COOKIE) return;
      setTheme(event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <fieldset className="flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {THEMES.map((value) => {
        const Icon = ICONS[value];
        const id = `theme-${value}`;
        return (
          <div key={value} className="relative">
            <input
              type="radio"
              id={id}
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
              className="peer absolute size-full cursor-pointer opacity-0"
            />
            <label
              htmlFor={id}
              className="grid size-8 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors peer-checked:bg-accent peer-checked:text-accent-ink peer-hover:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]"
            >
              <Icon width={15} height={15} />
              <span className="sr-only">{LABELS[value]}</span>
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
