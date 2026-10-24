import Link from 'next/link';
import { GitHubIcon } from '@/components/ui/icons';
import type { AppConfig } from '@/lib/config';
import type { Theme } from '@/lib/theme';
import { ThemeToggle } from './ThemeToggle';

/** Two letters for a multi-word name, one for a handle, never an invented glyph. */
function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? [words[0]?.[0]] : [words[0]?.[0], words[1]?.[0]];
  return letters.map((letter) => letter?.toUpperCase() ?? '').join('') || '?';
}

const navLink =
  'rounded px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] sm:text-sm';

export function SiteHeader({ config, theme }: { config: AppConfig; theme: Theme }) {
  const { profile } = config;
  const hasAbout = Boolean(profile.bio ?? profile.location ?? profile.links.email ?? profile.links.website);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-2">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]"
        >
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-lg border border-line bg-surface font-mono text-sm font-bold text-accent"
          >
            {initials(profile.displayName)}
          </span>
          {/*
            The name is the link's accessible name on every viewport: visually hidden on
            small screens (where only the monogram shows), visible from `sm` up. Using real
            text rather than an aria-label keeps the visible label and the accessible name
            identical (WCAG 2.5.3 Label in Name).
          */}
          <span className="sr-only flex-col leading-tight sm:not-sr-only sm:flex">
            <span className="text-sm font-semibold tracking-tight">{profile.displayName}</span>
            <span className="font-mono text-[11px] text-ink-muted">@{profile.username}</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-0.5 sm:gap-1.5">
          <Link href="/#work" className={navLink}>
            Work
          </Link>
          {hasAbout ? (
            <Link href="/#about" className={navLink}>
              About
            </Link>
          ) : null}
          <a
            href={profile.links.github}
            target="_blank"
            rel="noopener noreferrer me"
            className={`${navLink} inline-flex items-center gap-1.5`}
          >
            <GitHubIcon width={15} height={15} />
            <span className="sr-only sm:not-sr-only">GitHub</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <ThemeToggle initialTheme={theme} />
        </nav>
      </div>
    </header>
  );
}
