/** Failure taxonomy for the GitHub integration. Expected failures never throw past the service. */
export type FailureKind =
  | 'rate_limited'
  | 'timeout'
  | 'upstream'
  | 'invalid_response'
  | 'not_found'
  | 'config';

export type Failure = {
  readonly kind: FailureKind;
  /** Safe, user-facing message. Never contains upstream bodies, tokens or stack traces. */
  readonly message: string;
  readonly status: number | null;
  /** When the caller may retry (rate limits only). */
  readonly retryAt: Date | null;
};

const MESSAGES: Record<FailureKind, string> = {
  rate_limited: 'GitHub’s rate limit was reached, so the repository list could not be refreshed.',
  timeout: 'GitHub did not respond in time, so the repository list could not be refreshed.',
  upstream: 'GitHub returned an unexpected error, so the repository list could not be refreshed.',
  invalid_response: 'GitHub returned data this site could not understand.',
  not_found: 'The configured GitHub account could not be found.',
  config: 'The site is misconfigured.',
};

export class GitHubError extends Error {
  readonly kind: FailureKind;
  readonly status: number | null;
  readonly retryAt: Date | null;

  constructor(kind: FailureKind, options: { status?: number | null; retryAt?: Date | null; detail?: string } = {}) {
    super(options.detail ? `${MESSAGES[kind]} (${options.detail})` : MESSAGES[kind]);
    this.name = 'GitHubError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.retryAt = options.retryAt ?? null;
  }

  /** A message safe to render in the UI. */
  get publicMessage(): string {
    return MESSAGES[this.kind];
  }
}

export function toFailure(error: unknown): Failure {
  if (error instanceof GitHubError) {
    return {
      kind: error.kind,
      message: error.publicMessage,
      status: error.status,
      retryAt: error.retryAt,
    };
  }
  return {
    kind: 'upstream',
    message: MESSAGES.upstream,
    status: null,
    retryAt: null,
  };
}

export function isRetryable(kind: FailureKind): boolean {
  return kind === 'timeout' || kind === 'upstream';
}
