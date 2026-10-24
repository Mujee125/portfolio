/**
 * Deterministic formatting helpers.
 *
 * Everything is pinned to a fixed locale and UTC so that server output, browser
 * output and test expectations never diverge (a hydration mismatch here would be
 * a real bug, and a locale-dependent date is a classic source of one).
 */

const LOCALE = 'en-GB';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/** 1_204 -> "1.2k", 2_500_000 -> "2.5m". Used where space is tight. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value < 1000) return String(Math.floor(value));
  if (value < 1_000_000) return `${trimZero(value / 1000)}k`;
  return `${trimZero(value / 1_000_000)}m`;
}

function trimZero(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

export function formatDate(iso: string | null): string | null {
  const time = toTime(iso);
  if (time === null) return null;
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(time);
}

export function formatDateTimeUtc(iso: string | Date | null): string | null {
  const time = iso instanceof Date ? iso : toTime(iso);
  if (time === null) return null;
  return `${new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(time)}, ${new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(time)} UTC`;
}

export function relativeTime(iso: string | null, nowMs: number): string | null {
  const time = toTime(iso);
  if (time === null) return null;
  const seconds = Math.max(0, Math.round((nowMs - time.getTime()) / 1000));
  return relativeFromSeconds(seconds);
}

export function relativeFromSeconds(seconds: number): string {
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

function toTime(iso: string | null): Date | null {
  if (iso === null) return null;
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? null : time;
}

/**
 * A restrained, desaturated language palette. Decorative only: the language name
 * is always rendered as text next to the dot, so colour is never the only signal.
 */
const LANGUAGE_COLOURS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#d4b106',
  python: '#3572a5',
  go: '#00a5c9',
  rust: '#c2683a',
  java: '#b07219',
  'c#': '#178600',
  'c++': '#9c3b8f',
  c: '#6a6f78',
  ruby: '#cc342d',
  php: '#7a5bb5',
  swift: '#e0712f',
  kotlin: '#8f5bbf',
  dart: '#0f9bb0',
  elixir: '#6e4a7e',
  haskell: '#5e5086',
  scala: '#a8322c',
  shell: '#4eaa25',
  html: '#c1552c',
  css: '#5b6bd6',
  vue: '#3f9c5c',
  svelte: '#d1462f',
  nix: '#5277c3',
  lua: '#4a6fa5',
  dockerfile: '#2496ed',
  mdx: '#1f7a8c',
  astro: '#b3572a',
  zig: '#c08c1e',
  solidity: '#5c6bc0',
  r: '#27627a',
};

export function languageColour(language: string): string {
  const key = language.trim().toLowerCase();
  const known = LANGUAGE_COLOURS[key];
  if (known) return known;

  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 52% 45%)`;
}
