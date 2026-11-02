import { z } from 'zod';

/**
 * Server-side configuration.
 *
 * Every value comes from the environment and is validated once, at module load.
 * A missing or malformed required value throws a ConfigError naming the variable,
 * so a misconfigured deployment fails loudly instead of rendering a broken page.
 *
 * NEVER import this module from a client component: it reads secrets
 * (GITHUB_TOKEN) and is enforced by `scripts/check-boundaries.mjs`.
 */

export const GITHUB_API_BASE_DEFAULT = 'https://api.github.com';

export class ConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid application configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const booleanish = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const integerFromEnv = (min: number, max: number, fallback: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? fallback : Number(value)),
    z.number().int().min(min).max(max),
  );

const optionalString = z
  .preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().optional());

const githubUsername = z
  .preprocess((value) => (value === undefined || value === null ? '' : value), z.string().trim())
  .pipe(
    z
      .string()
      .min(1, 'is required')
      .max(39, 'must be at most 39 characters')
      .regex(
        /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,
        'must be a valid GitHub username (letters, digits and single inner hyphens)',
      ),
  );

const absoluteUrl = (label: string, protocols: readonly string[]) =>
  z.string().trim().transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (!protocols.includes(url.protocol)) {
        ctx.addIssue({ code: 'custom', message: `${label} must use one of: ${protocols.join(', ')}` });
        return z.NEVER;
      }
      return url.toString().replace(/\/+$/, '');
    } catch {
      ctx.addIssue({ code: 'custom', message: `${label} must be an absolute URL` });
      return z.NEVER;
    }
  });

const emailAddress = z.string().trim().email('must be a valid email address');

const commaList = z
  .preprocess(
    (value) => (typeof value === 'string' ? value.split(',').map((part) => part.trim()).filter(Boolean) : []),
    z.array(z.string().regex(/^[A-Za-z0-9._-]{1,100}$/, 'must be a repository name')),
  )
  .transform((list) => [...new Set(list.map((item) => item.toLowerCase()))]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GITHUB_USERNAME: githubUsername,
  NEXT_PUBLIC_SITE_URL: optionalString.pipe(absoluteUrl('NEXT_PUBLIC_SITE_URL', ['http:', 'https:']).optional()),
  SITE_NAME: optionalString.default('Portfolio'),
  SITE_DESCRIPTION: optionalString.default('Public repositories, projects and code from GitHub.'),

  PROFILE_NAME: optionalString,
  PROFILE_HEADLINE: optionalString,
  PROFILE_BIO: optionalString,
  PROFILE_LOCATION: optionalString,
  PROFILE_EMAIL: optionalString.pipe(emailAddress.optional()),
  PROFILE_RESUME_URL: optionalString.pipe(absoluteUrl('PROFILE_RESUME_URL', ['https:']).optional()),
  PROFILE_LINKEDIN_URL: optionalString.pipe(absoluteUrl('PROFILE_LINKEDIN_URL', ['https:']).optional()),
  PROFILE_WEBSITE_URL: optionalString.pipe(absoluteUrl('PROFILE_WEBSITE_URL', ['https:']).optional()),

  GITHUB_INCLUDE_FORKS: booleanish.default(false),
  GITHUB_INCLUDE_ARCHIVED: booleanish.default(true),
  GITHUB_EXCLUDED_REPOS: commaList,
  GITHUB_FEATURED_REPOS: commaList,
  GITHUB_FEATURED_COUNT: integerFromEnv(1, 12, 3),

  GITHUB_CACHE_TTL_SECONDS: integerFromEnv(0, 86_400, 900),
  GITHUB_STALE_MAX_SECONDS: integerFromEnv(0, 604_800, 86_400),
  GITHUB_MAX_PAGES: integerFromEnv(1, 50, 10),
  GITHUB_REQUEST_TIMEOUT_MS: integerFromEnv(1_000, 30_000, 8_000),
  GITHUB_MAX_RETRIES: integerFromEnv(0, 5, 2),

  GITHUB_TOKEN: optionalString,
  GITHUB_API_BASE_URL: optionalString.default(GITHUB_API_BASE_DEFAULT),
  ALLOW_NON_DEFAULT_GITHUB_API: booleanish.default(false),

  RATE_LIMIT_ENABLED: booleanish.default(true),
  RATE_LIMIT_MAX_REQUESTS: integerFromEnv(1, 1000, 100),
  RATE_LIMIT_WINDOW_SECONDS: integerFromEnv(1, 3600, 60),
  RATE_LIMIT_BYPASS_TOKEN: optionalString,

  GITHUB_MAX_RESPONSE_SIZE_MB: integerFromEnv(1, 100, 10),

  SITEMAP_MAX_URLS: integerFromEnv(100, 50000, 1000),

  GITHUB_MAX_REPOSITORIES: integerFromEnv(100, 10000, 2000),
});

export type RepositoryPolicy = {
  readonly includeForks: boolean;
  readonly includeArchived: boolean;
  readonly excluded: readonly string[];
  readonly featured: readonly string[];
  readonly featuredCount: number;
};

export type ProfileLinks = {
  readonly github: string;
  readonly email: string | null;
  readonly resume: string | null;
  readonly linkedin: string | null;
  readonly website: string | null;
};

export type AppConfig = {
  readonly env: 'development' | 'test' | 'production';
  readonly site: {
    readonly url: string;
    readonly name: string;
    readonly description: string;
  };
  readonly profile: {
    readonly username: string;
    readonly displayName: string;
    readonly headline: string | null;
    readonly bio: string | null;
    readonly location: string | null;
    readonly links: ProfileLinks;
  };
  readonly repos: RepositoryPolicy & {
    readonly maxPages: number;
    readonly cacheTtlSeconds: number;
    /** How long a previous snapshot may still be served after a failed refresh (0 disables). */
    readonly staleMaxSeconds: number;
  };
  readonly github: {
    readonly apiBaseUrl: string;
    readonly token: string | null;
    readonly requestTimeoutMs: number;
    readonly maxRetries: number;
    readonly maxResponseSizeBytes: number;
    readonly maxRepositories: number;
  };
  readonly rateLimit: {
    readonly enabled: boolean;
    readonly maxRequests: number;
    readonly windowSeconds: number;
    readonly bypassToken: string | null;
  };
  readonly sitemap: {
    readonly maxUrls: number;
  };
};

const DEFAULT_HEADLINE = 'Open-source work, published straight from GitHub.';

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => {
        const path = issue.path.join('.') || '(root)';
        return `${path} ${issue.message}`;
      }),
    );
  }

  const value = parsed.data;
  const apiBaseUrl = value.GITHUB_API_BASE_URL.replace(/\/+$/, '');

  const baseIssues = validateApiBaseUrl(apiBaseUrl, value.NODE_ENV, value.ALLOW_NON_DEFAULT_GITHUB_API);
  const siteIssues = validateSiteUrl(value.NEXT_PUBLIC_SITE_URL, value.NODE_ENV);
  const issues = [...baseIssues, ...siteIssues];
  if (issues.length > 0) throw new ConfigError(issues);

  const siteUrl = value.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return {
    env: value.NODE_ENV,
    site: {
      url: siteUrl,
      name: value.SITE_NAME,
      description: value.SITE_DESCRIPTION,
    },
    profile: {
      username: value.GITHUB_USERNAME,
      // Falls back to the verified GitHub handle rather than inventing a name.
      displayName: value.PROFILE_NAME ?? value.GITHUB_USERNAME,
      headline: value.PROFILE_HEADLINE ?? DEFAULT_HEADLINE,
      bio: value.PROFILE_BIO ?? null,
      location: value.PROFILE_LOCATION ?? null,
      links: {
        github: `https://github.com/${value.GITHUB_USERNAME}`,
        email: value.PROFILE_EMAIL ?? null,
        resume: value.PROFILE_RESUME_URL ?? null,
        linkedin: value.PROFILE_LINKEDIN_URL ?? null,
        website: value.PROFILE_WEBSITE_URL ?? null,
      },
    },
    repos: {
      includeForks: value.GITHUB_INCLUDE_FORKS,
      includeArchived: value.GITHUB_INCLUDE_ARCHIVED,
      excluded: value.GITHUB_EXCLUDED_REPOS,
      featured: value.GITHUB_FEATURED_REPOS,
      featuredCount: value.GITHUB_FEATURED_COUNT,
      maxPages: value.GITHUB_MAX_PAGES,
      cacheTtlSeconds: value.GITHUB_CACHE_TTL_SECONDS,
      staleMaxSeconds: value.GITHUB_STALE_MAX_SECONDS,
    },
    github: {
      apiBaseUrl,
      token: value.GITHUB_TOKEN ?? null,
      requestTimeoutMs: value.GITHUB_REQUEST_TIMEOUT_MS,
      maxRetries: value.GITHUB_MAX_RETRIES,
      maxResponseSizeBytes: value.GITHUB_MAX_RESPONSE_SIZE_MB * 1024 * 1024,
      maxRepositories: value.GITHUB_MAX_REPOSITORIES,
    },
    rateLimit: {
      enabled: value.RATE_LIMIT_ENABLED,
      maxRequests: value.RATE_LIMIT_MAX_REQUESTS,
      windowSeconds: value.RATE_LIMIT_WINDOW_SECONDS,
      bypassToken: value.RATE_LIMIT_BYPASS_TOKEN ?? null,
    },
    sitemap: {
      maxUrls: value.SITEMAP_MAX_URLS,
    },
  };
}

/** Rejects an API base that could exfiltrate the token to a third party. */
export function validateApiBaseUrl(
  apiBaseUrl: string,
  env: 'development' | 'test' | 'production',
  allowOverride: boolean,
): string[] {
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    return ['GITHUB_API_BASE_URL must be an absolute URL'];
  }
  const issues: string[] = [];
  const isDefault = apiBaseUrl === GITHUB_API_BASE_DEFAULT;
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    issues.push('GITHUB_API_BASE_URL must use https:// (http:// is only accepted for a loopback host)');
  }
  if (!isDefault && env === 'production' && !allowOverride) {
    issues.push(
      'GITHUB_API_BASE_URL differs from https://api.github.com in production; set ALLOW_NON_DEFAULT_GITHUB_API=true to confirm this is intentional',
    );
  }
  if (url.username !== '' || url.password !== '') {
    issues.push('GITHUB_API_BASE_URL must not embed credentials');
  }
  return issues;
}

/** A production deployment needs a stable canonical origin for SEO metadata. */
export function validateSiteUrl(siteUrl: string | undefined, env: 'development' | 'test' | 'production'): string[] {
  if (env !== 'production') return [];
  if (!siteUrl) return ['NEXT_PUBLIC_SITE_URL is required in production (canonical URLs, sitemap, Open Graph)'];
  // https is mandatory for a real deployment; loopback is exempt so that a local
  // production build (`next build && next start` on http://localhost) stays usable.
  const isLoopback = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(siteUrl);
  if (!siteUrl.startsWith('https://') && !isLoopback) {
    return ['NEXT_PUBLIC_SITE_URL must use https:// in production (loopback addresses are exempt)'];
  }
  return [];
}

let cachedConfig: AppConfig | null = null;

/** Memoised accessor for the process-wide configuration. */
export function getConfig(): AppConfig {
  if (cachedConfig === null) {
    cachedConfig = parseConfig(process.env);
  }
  return cachedConfig;
}

/** Test helper: forget the memoised configuration. */
export function resetConfigCache(): void {
  cachedConfig = null;
}
