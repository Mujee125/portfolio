/** Domain model. Deliberately free of GitHub's wire format. */
export type Repository = {
  readonly name: string;
  readonly fullName: string;
  readonly description: string | null;
  /** Canonical https URL, always validated against an allowlist. */
  readonly url: string;
  readonly homepage: string | null;
  readonly language: string | null;
  readonly topics: readonly string[];
  readonly stars: number;
  readonly forks: number;
  readonly archived: boolean;
  readonly isFork: boolean;
  readonly isPrivate: boolean;
  readonly isDisabled: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly pushedAt: string | null;
  readonly license: string | null;
};

export type RateLimitSnapshot = {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly used: number | null;
  readonly resetAt: Date | null;
};

/** What a successful refresh produces (already filtered by the inclusion policy). */
export type RepositorySnapshot = {
  readonly repos: readonly Repository[];
  readonly generatedAt: Date;
  /** True when `GITHUB_MAX_PAGES` was reached while `rel="next"` was still present. */
  readonly truncated: boolean;
  /** Entries GitHub returned that failed validation and were skipped. */
  readonly skippedItems: number;
  readonly pages: number;
  readonly rateLimit: RateLimitSnapshot | null;
};

export type Inventory = RepositorySnapshot & {
  /** True when this snapshot was served after a failed refresh. */
  readonly stale: boolean;
  /** Age of the snapshot in seconds at render time. */
  readonly ageSeconds: number;
};
