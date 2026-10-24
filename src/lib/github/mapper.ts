import type { GitHubRepository } from './schema';
import type { Repository } from './types';

const TRUSTED_REPOSITORY_HOSTS = ['github.com', 'www.github.com'] as const;
const SAFE_REPOSITORY_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const SAFE_TOPIC = /^[a-z0-9][a-z0-9-]{0,34}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TOPICS = 12;

export type MapOptions = {
  readonly username: string;
  readonly trustedHosts?: readonly string[];
};

/**
 * Converts one GitHub entry into the domain model.
 *
 * Returns `null` when the entry cannot be represented safely (e.g. a repository
 * name that could alter a URL path). Every untrusted string is normalised and
 * bounded here so that no rendering layer has to make a safety decision.
 */
export function mapRepository(raw: GitHubRepository, options: MapOptions): Repository | null {
  if (!SAFE_REPOSITORY_NAME.test(raw.name)) return null;

  const trustedHosts = options.trustedHosts ?? TRUSTED_REPOSITORY_HOSTS;
  const url = safeRepositoryUrl(raw.html_url, options.username, raw.name, trustedHosts);

  return {
    name: raw.name,
    fullName: safeFullName(raw.full_name, options.username, raw.name),
    description: normaliseDescription(raw.description ?? null),
    url,
    homepage: safeExternalUrl(raw.homepage ?? null),
    language: normaliseLanguage(raw.language ?? null),
    topics: normaliseTopics(raw.topics ?? []),
    stars: boundedCount(raw.stargazers_count),
    forks: boundedCount(raw.forks_count),
    archived: raw.archived === true,
    isFork: raw.fork === true,
    isPrivate: raw.private === true,
    isDisabled: raw.disabled === true,
    createdAt: safeIsoDate(raw.created_at),
    updatedAt: safeIsoDate(raw.updated_at) ?? safeIsoDate(raw.created_at),
    pushedAt: safeIsoDate(raw.pushed_at ?? null),
    license: safeLicense(raw.license?.spdx_id ?? null),
  };
}

/** Only https links on a trusted GitHub host are accepted; otherwise the canonical URL is synthesised. */
export function safeRepositoryUrl(
  candidate: string | undefined,
  username: string,
  name: string,
  trustedHosts: readonly string[] = TRUSTED_REPOSITORY_HOSTS,
): string {
  const fallback = `https://github.com/${username}/${name}`;
  if (!candidate) return fallback;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return fallback;
    if (!trustedHosts.includes(url.hostname.toLowerCase())) return fallback;
    if (url.username !== '' || url.password !== '') return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

/**
 * Accepts only absolute http(s) URLs without credentials.
 * This is what stops `javascript:`, `data:` and `vbscript:` payloads from ever
 * reaching an `href` attribute.
 */
export function safeExternalUrl(candidate: string | null): string | null {
  if (candidate === null) return null;
  const trimmed = candidate.trim();
  if (trimmed === '') return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username !== '' || url.password !== '') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeFullName(candidate: string | undefined, username: string, name: string): string {
  const fallback = `${username}/${name}`;
  if (!candidate) return fallback;
  return /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/.test(candidate) ? candidate : fallback;
}

function normaliseDescription(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned === '') return null;
  return cleaned.length > MAX_DESCRIPTION_LENGTH ? `${cleaned.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…` : cleaned;
}

function normaliseLanguage(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value.replace(CONTROL_CHARACTERS, '').trim();
  if (cleaned === '') return null;
  return cleaned.slice(0, 40);
}

function normaliseTopics(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const topic = value.trim().toLowerCase();
    if (!SAFE_TOPIC.test(topic)) continue;
    seen.add(topic);
    if (seen.size >= MAX_TOPICS) break;
  }
  return [...seen];
}

function boundedCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), 1_000_000_000);
}

function safeIsoDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function safeLicense(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9.+-]{1,40}$/.test(trimmed)) return null;
  return trimmed;
}
